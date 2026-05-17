# API serverless · Observatorio macroeconómico de México

API REST pública construida con **Cloudflare Workers** y **Hono** que expone los datos del [Observatorio macroeconómico](https://github.com/israel44moran/observatorio-macro-sql) (Proyecto 9 del portafolio). Sin autenticación, CORS abierto, edge caching de 1 hora.

> ## 🌐 En vivo: <https://api-observatorio-macro.claude44israel.workers.dev>
>
> Desplegada en Cloudflare Workers — corre en el edge más cercano al usuario, latencia típica <50 ms.

## Qué demuestra

- **Deployment serverless en producción** (no un mock local)
- **Edge computing**: el código corre en 300+ datacenters de Cloudflare cerca del usuario, no en un servidor central
- **Cero servidores que mantener**: el plan free permite 100,000 requests/día
- **API REST limpia** con manejo de errores, CORS, cache headers, versioning
- **JavaScript moderno** con framework Hono (estándar actual para Workers)

## Endpoints

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/` | Documentación HTML |
| GET | `/api/health` | Estado del servicio + región del edge |
| GET | `/api/indicators` | Catálogo de los 15 indicadores |
| GET | `/api/series/:indicator` | Serie temporal completa de un indicador |
| GET | `/api/series/:indicator?from=YYYY&to=YYYY` | Mismo, filtrado por rango |
| GET | `/api/year/:year` | Snapshot de todos los indicadores en un año + eventos macro de ese año |
| GET | `/api/events` | Catálogo de 13 eventos macroeconómicos relevantes |

### Ejemplos

```bash
# Saludo
curl https://api-observatorio-macro.claude44israel.workers.dev/api/health

# Catálogo completo
curl https://api-observatorio-macro.claude44israel.workers.dev/api/indicators

# Inflación de los últimos 7 años
curl "https://api-observatorio-macro.claude44israel.workers.dev/api/series/inflacion_pct?from=2018&to=2024"

# Estado de México en 2020 (con el evento COVID-19 asociado)
curl https://api-observatorio-macro.claude44israel.workers.dev/api/year/2020
```

### Respuesta de ejemplo

`GET /api/year/2020`:

```json
{
  "year": 2020,
  "indicators": {
    "anio": 2020,
    "pib_nominal_usd": 1121064767308.42,
    "pib_crecimiento_pct": -8.354035,
    "inflacion_pct": 3.396834,
    "desempleo_pct": 4.44,
    "...": "..."
  },
  "events": [
    { "anio": 2020, "evento": "Pandemia COVID-19", "categoria": "crisis" }
  ]
}
```

## Stack

| Pieza | Por qué |
|---|---|
| **Cloudflare Workers** | Edge compute serverless. 100k req/día gratis, sin tarjeta de crédito. Latencia <50ms global. |
| **Hono** | Framework web minimalista, hecho específicamente para edge runtimes. API similar a Express pero sin overhead. |
| **Wrangler 4** | CLI oficial de Cloudflare para desarrollo local y deployment. |
| **JavaScript ESM** | Sin compilación, sin bundler propio (Wrangler maneja todo). |

**No usamos**:

- Base de datos externa — los 40 KB de datos están **embebidos en el Worker** como un módulo JS. Esto evita el roundtrip a R2/KV en cada request y mantiene la latencia debajo de 5ms.
- Frameworks pesados — Hono es ~12 KB minified.

## Por qué los datos van bundled

Tenía dos opciones:

1. **Subir el CSV a R2** y leerlo desde el Worker (patrón "storage + compute separados")
2. **Empaquetar el JSON con el Worker** (patrón "all in one")

Elegí **opción 2** porque:
- El dataset completo son solo **40 KB** — perfectamente cabe en el límite de 1 MB del Worker
- Los datos cambian **semanalmente** (cuando el Banco Mundial publica) — no es necesario consultar storage en cada request
- Latencia tipo **2-5 ms** en lugar de 50-100 ms (sin roundtrip)
- **Cero costos de almacenamiento**, cero llamadas a R2

Cuando el Observatorio actualice (lunes vía GitHub Actions del Proyecto 10), una segunda automatización podrá regenerar el `data.js` y redeplayar el Worker. Esa es la siguiente iteración.

## Estructura

```
api-observatorio-macro/
├── src/
│   ├── index.js        # Rutas con Hono, ~200 líneas
│   └── data.js         # Datos del Banco Mundial (autogenerado)
├── package.json        # hono + wrangler
├── wrangler.toml       # Config del Worker
├── .gitignore
└── README.md
```

## Desarrollo local

```bash
npm install
npm run dev              # http://localhost:8787
```

Wrangler levanta un Worker local que se comporta idéntico al de producción. Cambios al código se recargan automáticamente.

## Deployment

```bash
npx wrangler login       # primera vez: abre el navegador para autenticar
npm run deploy           # publica a Cloudflare
```

Después del primer deploy, Cloudflare asigna un subdominio gratuito tipo `api-observatorio-macro.<tu-usuario>.workers.dev` que es público inmediatamente.

## Logs en producción

```bash
npm run tail             # stream de requests en tiempo real desde el edge
```

## Costos

| Tier | Incluido | Suficiente para |
|---|---|---|
| **Free** | 100,000 requests/día, 10ms CPU/request, 1 worker | Portafolio personal, demos, prototipos pequeños |
| **Paid** ($5/mes) | 10M req/mes, 50ms CPU/request | Producción para apps reales |

Este proyecto vive cómodamente en el plan free. Si llegara a 100k req/día sería un buen problema que resolver.

## Roadmap

- Versionado de la API (`/v1/...`)
- Endpoint `/api/compare?indicators=a,b,c&year=2020` para comparativas
- Salida en formato CSV (`?format=csv`) además de JSON
- Auto-redeploy via GitHub Actions cuando el Proyecto 9 actualiza datos
- Rate limiting por IP (Workers tiene `RateLimit` binding incluido)

## Lugar en la trilogía SQL → Pipeline → Cloud

| Proyecto | Capa | Foco |
|---|---|---|
| 9 | **Análisis** | 15 queries SQL sobre DuckDB local |
| 10 | **Orquestación** | GitHub Actions semanal mantiene los datos al día |
| **11** | **Distribución** | **API pública en el edge para que cualquiera consuma los datos** |

Los tres juntos forman un sistema completo de datos: extracción → análisis → publicación.

## Licencia

MIT. Los datos servidos por la API provienen del Banco Mundial bajo licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
