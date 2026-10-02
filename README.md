# Bolsa — Screener de opciones

Aplicación web para filtrar cadenas de opciones de Yahoo Finance: cash-secured puts, credit spreads y opciones long, con griegas calculadas (Black-Scholes), POP lognormal y rentabilidad sobre riesgo.

Proyecto único desplegable en Vercel (free tier), con usuarios y persistencia en Supabase:

- `frontend/` — React 19 + Vite + TypeScript estricto (UI en español). Login email+contraseña con `@supabase/supabase-js`; el screener solo es accesible con sesión iniciada.
- `api/screener.py` — función serverless Python (`GET /api/screener`) con helpers `api/_*.py` (no se exponen como endpoints por empezar con `_`).
- `supabase/schema.sql` — tablas `watchlist`, `presets` y `notes` con Row Level Security (`user_id = auth.uid()`). El frontend lee/escribe directamente en Supabase con la anon key; la API Python no toca Supabase.
- `docs/` — documentación de usuario en Markdown, renderizada en la ruta `/docs` con `react-markdown`.

## Estructura

```
api/
  screener.py     # handler BaseHTTPRequestHandler (GET /api/screener)
  _models.py      # modelos pydantic y validación de parámetros
  _greeks.py      # Black-Scholes puro (scipy.stats.norm)
  _data.py        # yfinance + caché en memoria (TTL 15 min)
  _screener.py    # métricas de estrategia, filtros, ordenación, deadline
frontend/         # app React + Vite
  src/supabase.ts # cliente Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
  src/db.ts       # CRUD watchlist / presets / notes (filtrado por user_id)
  src/Root.tsx    # enrutado mínimo (/ y /docs) y control de sesión
docs/             # markdown servido en /docs
supabase/
  schema.sql      # pegar en Supabase > SQL Editor
  tests/          # stub de auth + test de RLS (Postgres vanilla, en CI)
scripts/dev_api.py# servidor local stdlib (sustituye a un uvicorn separado)
tests/            # pytest
vercel.json       # build del frontend + configuración de la función
```

## API

`GET /api/screener?<params>` — todas las cantidades porcentuales se expresan en números de porcentaje (`iv_min=25` → 25 %; `iv=27.3` → 27,3 %). Los deltas se filtran por valor absoluto.

| Parámetro        | Tipo        | Defecto    | Descripción |
|------------------|-------------|------------|-------------|
| `tickers`        | str/lista   | (oblig.)   | Lista separada por comas; máx. **5** por llamada (el frontend agrupa de 5 en 5 para hasta 10 chips). |
| `option_type`    | put/call/both | `both`   | Tipo de opción a evaluar. |
| `strategy`       | short/credit_spread/long | `short` | Estrategia. |
| `spread_width`   | float       | `5`        | Ancho objetivo del spread (solo credit_spread). |
| `dte_min`/`dte_max` | int      | `0`/`60`   | Ventana de días a vencimiento. |
| `delta_min`/`delta_max` | float | `0`/`1`   | Filtro de \|delta\|. |
| `oi_min`         | int         | `0`        | Open interest mínimo. |
| `volume_min`     | int         | `0`        | Volumen mínimo. |
| `spread_max_pct` | float       | sin límite | Spread bid/ask máximo en % del mid. |
| `iv_min`         | float (%)   | `0`        | IV mínima en %. |
| `pop_min`        | float (%)   | `0`        | POP mínima en %. |
| `max_expirations`| int         | `4`        | Expiraciones más próximas por ticker dentro de la ventana. |
| `sort_by`/`sort_order` | str  | `ror_day`/`desc` | Ordenación (None siempre al final). |
| `limit`          | int         | `200`      | Máximo de resultados (≤1000). |

Parámetros desconocidos → `400 {"error":"Parámetros inválidos","details":[…]}`.

`GET /api/overview?tickers=…&dte=30` devuelve por cada ticker su cotización (último, cierre previo, variación, volumen) y las griegas ATM (call y put) de la expiración más cercana al `dte` objetivo: `{"items": [{"ticker","spot","previous_close","change","change_pct","volume","expiration","dte","atm_strike","atm_iv","call","put","error"}], "meta": {"risk_free_rate","generated_at","truncated","warnings"}}`. Caché: `no-cache` al navegador y `Vercel-CDN-Cache-Control: max-age=60, stale-while-revalidate=120`; errores `no-store`. El panel «Resumen de tickers» lo muestra encima de la tabla de resultados.

`GET /api/status` comprueba si Yahoo responde (options de SPY, con memo de 60 s y timeout de 5 s) y devuelve `{"source": "yahoo", "connected": true, "latency_ms": 120, "checked_at": "2025-01-01T00:00:00Z"}`. El indicador del encabezado ("Yahoo Finance" con punto verde/rojo/ámbar) lo usa para mostrar la fuente y el estado de conexión; es clicable para re-comprobar.

Los tickers, el preset y los filtros en curso se guardan en el navegador (localStorage, clave `bolsa:state:v1`) y se restauran al recargar; el botón «Restablecer» los limpia.

La watchlist, los presets con nombre («Mis presets») y el diario de notas se guardan por usuario en Supabase (tablas `watchlist`, `presets.filtros` jsonb y `notes.contenido`), sin pasar por la API Python.

### Respuesta

`{"results": [OptionResult…], "meta": {tickers, spots, risk_free_rate, generated_at, expirations_scanned, cache_hits, truncated, warnings, count}}`

Cada `OptionResult` incluye: contrato, tipo, estrategia, expiración, DTE, spot, strike (y `long_strike`/`width` en spreads), bid/ask/mid/last, `spread_pct`, volumen, OI, IV (%), griegas del tramo corto/principal, `premium` (por acción), `breakeven`, `max_profit`/`max_loss` por contrato en USD (null = ilimitado), `pop`, `ror`, `ror_day`.

## Métricas

- `mid` = (bid+ask)/2; `spread_pct` = (ask−bid)/mid×100.
- `premium` (por acción): mid en venta/compra; crédito neto en credit spread.
- **Breakeven**: put corto K−prem; call corto K+prem; spread put K−crédito / call K+crédito; long call K+mid / long put K−mid.
- **POP** (probabilidad de beneficio, modelo lognormal neutral al riesgo): venta y spread → prob. de expirar OTM en el strike corto; long → prob. de superar el breakeven.
- **RoR** = max_profit/max_loss×100; **RoR/día** = RoR/DTE.
- **Griegas**: Black-Scholes sin dividendos, T = max(DTE,1)/365, r = `RISK_FREE_RATE`, sigma = IV de Yahoo. Theta por día natural; vega por punto de volatilidad.

## Supabase

1. En el proyecto de Supabase abrir **SQL Editor**, pegar el contenido de `supabase/schema.sql` y ejecutarlo (es idempotente: se puede re-ejecutar).
2. **Authentication → Providers → Email**: activado (por defecto). Opcional: desactivar «Confirm email» para entrar sin confirmar.
3. **Authentication → URL Configuration**:
   - *Site URL*: la URL de producción de Vercel (p. ej. `https://bolsa.vercel.app`).
   - *Redirect URLs*: añadir `https://*.vercel.app/**` (previews) y `http://localhost:5173/**` (desarrollo).
4. Obtener la **anon / publishable key** en *Project Settings → API*. Nunca usar la `service_role` key en el frontend.

### Variables de entorno

Ver `.env.example`.

| Variable | Dónde | Defecto |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend (build) | `https://frcspjmrbfyuievdzynv.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Frontend (build) | — (**obligatoria**; sin ella la app muestra «Configuración incompleta») |
| `RISK_FREE_RATE` | API | `0.045` |
| `SCREENER_DEADLINE_SECONDS` | API | `8` |

La anon key no se incluye en el repositorio (política de no versionar claves; además gitleaks la detectaría como JWT). Aunque es pública por diseño en Supabase, la seguridad de los datos depende de RLS, no de ocultarla.

## Desarrollo local

Requisitos: Python 3.12 y Node ≥20.

```bash
uv venv -p 3.12 .venv && uv pip install -r requirements-dev.txt
```

**Opción A — `vercel dev`** (requiere CLI y login): `npm i -g vercel` y `vercel dev` en la raíz.

**Opción B — dos procesos:**

```bash
cp .env.example frontend/.env.local  # y rellenar VITE_SUPABASE_ANON_KEY
python scripts/dev_api.py            # API en http://127.0.0.1:8000
cd frontend && npm ci && npm run dev # Vite en :5173, proxifica /api → :8000
```

Tests y calidad:

```bash
pytest
ruff check . && ruff format --check .
cd frontend && npm run typecheck && npm run build
```

Test de RLS del esquema (requiere Docker):

```bash
docker run -d --name pg -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine && sleep 5
for f in supabase/tests/stub_auth.sql supabase/schema.sql supabase/tests/rls_test.sql; do
  docker exec -i pg psql -v ON_ERROR_STOP=1 -U postgres < "$f"
done
```

CI (`.github/workflows/ci.yml`, en PRs y pushes a `main`): ruff + pytest + pip-audit, typecheck + build + npm audit del frontend, aplicación de `schema.sql` + test de RLS sobre Postgres, y escaneo de secretos con gitleaks.

## Despliegue

Importar el repo en Vercel (preset «Other»; `vercel.json` fija build/output y reescribe las rutas no-`/api` a `index.html` para que `/docs` funcione). Definir `VITE_SUPABASE_ANON_KEY` en *Settings → Environment Variables* (Production y Preview) antes del primer build. Cada push a `main` despliega frontend + API. Variables opcionales: `RISK_FREE_RATE` (defecto 0.045, válido [0, 0.2]) y `SCREENER_DEADLINE_SECONDS` (defecto 8, válido [0.1, 60]).

## Limitaciones

- Persistencia y login dependen del plan gratuito de Supabase (proyectos inactivos se pausan tras ~1 semana; límites de emails de confirmación por hora).

- Datos de Yahoo Finance con retraso ~15 min y API no oficial: posible rate-limiting/429 y bloqueo de IPs de datacenter.
- Griegas calculadas (no de mercado); sin dividendos.
- Caché en memoria (TTL 15 min) solo persiste entre invocaciones calientes de la misma instancia; además la CDN de Vercel cachea respuestas 200 vía `Vercel-CDN-Cache-Control: max-age=300, stale-while-revalidate=600` (el navegador recibe `Cache-Control: no-cache`).
- La función está configurada con `maxDuration: 10` y un deadline interno de 8 s: al superarlo devuelve resultados parciales (`truncated` + aviso). La documentación actual de Vercel indica hasta 300 s en Hobby con Fluid compute — el límite de 10 s es conservador y puede subirse en `vercel.json`. Por eso también hay máx. 5 tickers/llamada y `max_expirations` por ticker.
