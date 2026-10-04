# Bolsa — Screener de opciones

Aplicación web para filtrar cadenas de opciones de Yahoo Finance: cash-secured puts, credit spreads y opciones long, con griegas calculadas (Black-Scholes), POP lognormal y rentabilidad sobre riesgo.

Proyecto único desplegable en Vercel:

- `frontend/` — React 19 + Vite + TypeScript estricto (UI en español).
- `api/screener.py` — función serverless Python (`GET /api/screener`) con helpers `api/_*.py` (no se exponen como endpoints por empezar con `_`).

## Estructura

```
api/
  screener.py     # handler BaseHTTPRequestHandler (GET /api/screener)
  status.py       # GET /api/status (sonda de Yahoo)
  overview.py     # GET /api/overview (resumen por ticker)
  chain.py        # GET /api/chain (cadena por expiración + POP)
  history.py      # GET /api/history (velas OHLCV)
  _models.py      # modelos pydantic y validación de parámetros
  _greeks.py      # Black-Scholes puro (scipy.stats.norm)
  _data.py        # yfinance + caché en memoria (TTL 15 min)
  _screener.py    # métricas de estrategia, filtros, ordenación, deadline
  _overview.py    # resumen por ticker + HV/52s
  _chain.py       # construcción de filas call/put y POP
frontend/         # app React + Vite
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

`GET /api/overview?tickers=…&dte=30` devuelve por cada ticker su cotización (último, cierre previo, variación, volumen), estadísticas de volatilidad/rango de 52 semanas (a partir del histórico diario de 2 años) y las griegas ATM (call y put) de la expiración más cercana al `dte` objetivo: `{"items": [{"ticker","spot","previous_close","change","change_pct","volume","hv30","range52w_pct","high_52w","low_52w","hv_percentile_52w","expiration","dte","atm_strike","atm_iv","call","put","error"}], "meta": {"risk_free_rate","generated_at","truncated","warnings"}}`. Caché: `no-cache` al navegador y `Vercel-CDN-Cache-Control: max-age=60, stale-while-revalidate=120`; errores `no-store`. El panel «Resumen de tickers» lo muestra encima de la tabla de resultados; un clic en una fila abre el panel de detalle (velas + cadena de opciones).

- `hv30` (VH 30d): desviación típica (ddof=1) de los últimos 30 retornos log diarios del cierre × √252 × 100 (%). `null` con <31 cierres.
- `range52w_pct` (Pos. 52s): (spot − mín 52s)/(máx 52s − mín 52s) × 100 con los últimos 252 días, acotado a 0–100; `high_52w`/`low_52w` dan los extremos.
- `hv_percentile_52w` (Pct. VH 52s): percentil del HV 30d actual dentro de la serie rolling de HV de los últimos 252 valores (mín. 20). Yahoo no publica IV histórica, así que es un percentil de volatilidad histórica (realizada), no de IV.
- La columna «VI ATM» se pinta verde si supera la VH 30d (opciones «caras» frente a lo realizado) y roja si es inferior.

`GET /api/chain?ticker=SPY[&expiration=YYYY-MM-DD]` — sin `expiration` devuelve `{ticker, spot, expirations: [{date, dte}] (solo dte ≥ 1), expiration: null, dte: null, rows: [], meta}`; con `expiration` (debe estar en la lista, si no `400 {"error":"Expiración no disponible"}`) añade `rows`: unión ordenada de strikes call/put, cada uno `{strike, call, put}` con `ChainLeg{contract_symbol, bid, ask, mid, last, volume, open_interest, iv, greeks, pop_short, itm_prob}`. `itm_prob` = P(expirar ITM) bajo lognormal (call = N(d2), put = 1−N(d2)) y `pop_short` = 100 − itm_prob (probabilidad de éxito vendiendo la opción). IV inválida (NaN o ≤1 %) → precios conservados pero iv/griegas/POP null. Caché: `no-cache` + CDN `max-age=60, stale-while-revalidate=120`; timeout → `504 {"error":"Tiempo límite alcanzado"}`.

`GET /api/history?ticker=SPY&interval=1h|1d|1wk` (defecto `1d`) devuelve `{ticker, interval, candles: [{time (unix s), open, high, low, close, volume}]}` con períodos 60d/1y/5y respectivamente; filas con OHLC NaN descartadas. Caché: `no-cache` + CDN `max-age=300, stale-while-revalidate=600`; timeout → 504. Alimenta el gráfico de velas (lightweight-charts) del panel de detalle.

`GET /api/status` comprueba si Yahoo responde (options de SPY, con memo de 60 s y timeout de 5 s) y devuelve `{"source": "yahoo", "connected": true, "latency_ms": 120, "checked_at": "2025-01-01T00:00:00Z"}`. El indicador del encabezado ("Yahoo Finance" con punto verde/rojo/ámbar) lo usa para mostrar la fuente y el estado de conexión; es clicable para re-comprobar.

Los filtros DTE y |Delta| usan un deslizador de doble pulgar (mín–máx en un solo control), con los campos numéricos de DTE debajo.

Los tickers, el preset y los filtros se guardan en el navegador (localStorage, clave `bolsa:state:v1`) y se restauran al recargar; el botón «Restablecer» los limpia.

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

## Desarrollo local

Requisitos: Python 3.12 y Node ≥20.

```bash
uv venv -p 3.12 .venv && uv pip install -r requirements-dev.txt
```

**Opción A — `vercel dev`** (requiere CLI y login): `npm i -g vercel` y `vercel dev` en la raíz.

**Opción B — dos procesos:**

```bash
python scripts/dev_api.py            # API en http://127.0.0.1:8000
cd frontend && npm ci && npm run dev # Vite en :5173, proxifica /api → :8000
```

Tests y calidad:

```bash
pytest
ruff check . && ruff format --check .
cd frontend && npm run typecheck && npm run build
```

CI (`.github/workflows/ci.yml`, en PRs y pushes a `main`): ruff + pytest + pip-audit, typecheck + build + npm audit del frontend, y escaneo de secretos con gitleaks.

## Despliegue

Importar el repo en Vercel (preset «Other»; `vercel.json` fija build/output). No hacen falta variables de entorno. Cada push a `main` despliega frontend + API. Variables opcionales: `RISK_FREE_RATE` (defecto 0.045, válido [0, 0.2]) y `SCREENER_DEADLINE_SECONDS` (defecto 8, válido [0.1, 60]).

## Limitaciones

- Datos de Yahoo Finance con retraso ~15 min y API no oficial: posible rate-limiting/429 y bloqueo de IPs de datacenter.
- Griegas calculadas (no de mercado); sin dividendos.
- Caché en memoria (TTL 15 min) solo persiste entre invocaciones calientes de la misma instancia; además la CDN de Vercel cachea respuestas 200 vía `Vercel-CDN-Cache-Control: max-age=300, stale-while-revalidate=600` (el navegador recibe `Cache-Control: no-cache`).
- La función está configurada con `maxDuration: 10` y un deadline interno de 8 s: al superarlo devuelve resultados parciales (`truncated` + aviso). La documentación actual de Vercel indica hasta 300 s en Hobby con Fluid compute — el límite de 10 s es conservador y puede subirse en `vercel.json`. Por eso también hay máx. 5 tickers/llamada y `max_expirations` por ticker.
