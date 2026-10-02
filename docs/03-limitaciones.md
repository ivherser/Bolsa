# Limitaciones

- **Datos con retraso** de ~15 minutos (Yahoo Finance, API no oficial). Puede haber rate-limiting (HTTP 429) o bloqueos puntuales de IPs de datacenter.
- **Griegas calculadas** con Black-Scholes, sin dividendos ni ejercicio anticipado.
- **Timeout serverless**: cada función está limitada a 10 s; con un deadline interno de 8 s la API devuelve resultados parciales y un aviso si no le da tiempo. Por eso se procesan máximo 5 tickers por llamada.
- **Caché** en memoria de 15 minutos por ticker y expiración, solo entre invocaciones calientes de la misma instancia, más la caché CDN de Vercel.
- Esta herramienta **no es asesoramiento financiero**.
