/**
 * API serverless del Observatorio macroeconomico de Mexico.
 *
 * Worker desplegado en Cloudflare con framework Hono.
 * Sirve los mismos datos del Proyecto 9 (15 indicadores del Banco Mundial,
 * 1960-2024) como una API REST publica, sin autenticacion.
 *
 * Endpoints:
 *   GET /                          -> HTML simple con docs
 *   GET /api/health                -> ping
 *   GET /api/indicators            -> catalogo de indicadores
 *   GET /api/series/:indicator     -> serie temporal de un indicador
 *       ?from=YYYY&to=YYYY         -> filtro por rango
 *   GET /api/year/:year            -> snapshot de un anio
 *   GET /api/events                -> eventos macro
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { META, CATALOGO, EVENTOS, FILAS } from './data.js';

const app = new Hono();

// ----------------------------------------------------------
// Middleware: CORS abierto (es una API publica de solo lectura)
// ----------------------------------------------------------
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'HEAD', 'OPTIONS'],
  maxAge: 86400,
}));

// Cache-Control para edge caching agresivo (datos cambian semanalmente)
app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  c.header('X-API-Version', '1.0.0');
});

// ----------------------------------------------------------
// Pagina raiz: HTML con docs basicas
// ----------------------------------------------------------
app.get('/', (c) => {
  const codigos = CATALOGO.map(i => i.columna).slice(0, 5).join(', ');
  return c.html(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>API Observatorio Macro · Mexico</title>
<style>
  body { background: #0E1218; color: #F2EDE3; font-family: -apple-system, system-ui, sans-serif;
         max-width: 760px; margin: 4rem auto; padding: 0 2rem; line-height: 1.65; }
  h1 { font-family: 'Times New Roman', serif; font-weight: 400; letter-spacing: -1px;
       font-size: 2.4rem; margin: 0 0 0.5rem; }
  p.eyebrow { color: #D4A574; font-family: monospace; font-size: 0.7rem;
              letter-spacing: 2px; text-transform: uppercase; margin: 0 0 0.5rem; }
  h2 { color: #F2EDE3; font-family: 'Times New Roman', serif; font-weight: 500;
       border-top: 1px solid #2A3140; padding-top: 1.5rem; margin-top: 2rem; }
  code { background: #171C24; padding: 2px 6px; border-radius: 3px;
         color: #D4A574; font-size: 0.9em; }
  a { color: #D4A574; text-decoration: none; border-bottom: 1px dotted #8B6E47; }
  a:hover { color: #E8C9A0; }
  ul li { margin: 0.4rem 0; }
  .meta { color: #9AA3B5; font-size: 0.9rem; }
  hr { border: none; border-top: 1px solid #2A3140; margin: 2rem 0; }
  footer { color: #5A6478; font-family: monospace; font-size: 0.7rem;
           letter-spacing: 1.5px; text-transform: uppercase; margin-top: 3rem;
           padding-top: 1rem; border-top: 1px solid #2A3140; }
</style>
</head>
<body>
<p class="eyebrow">— API REST · Cloudflare Workers · Edge serverless</p>
<h1>Observatorio macroeconómico de México</h1>
<p class="meta">${META.n_indicadores} indicadores del Banco Mundial · ${META.rango_anios[0]}–${META.rango_anios[1]} · ${META.n_anios} años de historia</p>

<p>API pública de solo lectura. Sin autenticación, CORS abierto, edge caching de 1 hora.
Datos del <strong>Proyecto 9</strong> del portafolio expuestos como REST.</p>

<h2>Endpoints</h2>
<ul>
<li><code>GET /api/health</code> — estado del servicio</li>
<li><code>GET /api/indicators</code> — catálogo de los ${META.n_indicadores} indicadores</li>
<li><code>GET /api/series/:indicator</code> — serie temporal completa<br>
    <span class="meta">Ejemplo: <a href="/api/series/inflacion_pct">/api/series/inflacion_pct</a></span></li>
<li><code>GET /api/series/:indicator?from=2000&to=2020</code> — con filtro por rango<br>
    <span class="meta">Ejemplo: <a href="/api/series/pib_crecimiento_pct?from=2010&to=2024">/api/series/pib_crecimiento_pct?from=2010&to=2024</a></span></li>
<li><code>GET /api/year/:year</code> — snapshot de un año<br>
    <span class="meta">Ejemplo: <a href="/api/year/2020">/api/year/2020</a></span></li>
<li><code>GET /api/events</code> — catálogo de eventos macroeconómicos<br>
    <span class="meta">Ejemplo: <a href="/api/events">/api/events</a></span></li>
</ul>

<h2>Indicadores disponibles</h2>
<ul>
${CATALOGO.map(i => `<li><code>${i.columna}</code> — ${i.nombre} <span class="meta">(${i.unidad})</span></li>`).join('\n')}
</ul>

<footer>
Fuente: World Bank Indicators API · Construido con Hono sobre Cloudflare Workers ·
<a href="https://github.com/israel44moran/api-observatorio-macro">código fuente</a>
</footer>
</body>
</html>`);
});

// ----------------------------------------------------------
// Health check
// ----------------------------------------------------------
app.get('/api/health', (c) => c.json({
  status: 'ok',
  service: 'api-observatorio-macro',
  version: '1.0.0',
  edge_region: c.req.raw.cf?.colo ?? 'unknown',
  timestamp: new Date().toISOString(),
}));

// ----------------------------------------------------------
// Catalogo de indicadores
// ----------------------------------------------------------
app.get('/api/indicators', (c) => c.json({
  count: CATALOGO.length,
  indicators: CATALOGO,
}));

// ----------------------------------------------------------
// Serie temporal de un indicador
// GET /api/series/:indicator?from=YYYY&to=YYYY
// ----------------------------------------------------------
app.get('/api/series/:indicator', (c) => {
  const indicator = c.req.param('indicator');
  const meta = CATALOGO.find(i => i.columna === indicator);
  if (!meta) {
    return c.json({
      error: 'unknown_indicator',
      message: `No existe el indicador "${indicator}".`,
      available: CATALOGO.map(i => i.columna),
    }, 404);
  }

  const from = parseInt(c.req.query('from') ?? '0', 10);
  const to = parseInt(c.req.query('to') ?? '9999', 10);

  const serie = FILAS
    .filter(f => f.anio >= from && f.anio <= to && f[indicator] !== null)
    .map(f => ({ anio: f.anio, valor: f[indicator] }));

  return c.json({
    indicator: meta,
    filter: { from, to },
    count: serie.length,
    series: serie,
  });
});

// ----------------------------------------------------------
// Snapshot de un anio
// ----------------------------------------------------------
app.get('/api/year/:year', (c) => {
  const year = parseInt(c.req.param('year'), 10);
  if (Number.isNaN(year)) {
    return c.json({ error: 'invalid_year', message: 'El parámetro :year debe ser un número.' }, 400);
  }
  const fila = FILAS.find(f => f.anio === year);
  if (!fila) {
    return c.json({
      error: 'year_not_found',
      message: `No hay datos para el año ${year}.`,
      available_range: META.rango_anios,
    }, 404);
  }
  const eventos = EVENTOS.filter(e => e.anio === year);
  return c.json({
    year,
    indicators: fila,
    events: eventos,
  });
});

// ----------------------------------------------------------
// Eventos macro
// ----------------------------------------------------------
app.get('/api/events', (c) => c.json({
  count: EVENTOS.length,
  events: EVENTOS,
}));

// ----------------------------------------------------------
// 404 catch-all
// ----------------------------------------------------------
app.notFound((c) => c.json({
  error: 'not_found',
  message: 'Ruta no encontrada. Visita / para ver la documentación.',
}, 404));

// ----------------------------------------------------------
// Handler global de errores
// ----------------------------------------------------------
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({
    error: 'internal_error',
    message: 'Algo salió mal procesando la petición.',
  }, 500);
});

export default app;
