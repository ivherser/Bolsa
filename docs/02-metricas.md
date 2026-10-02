# Métricas y cálculo

Todas las cantidades porcentuales se muestran en puntos porcentuales (IV 27,3 = 27,3 %).

- **Mid**: (bid + ask) / 2.
- **Spread %**: (ask − bid) / mid × 100.
- **Prima**: mid por acción en venta/compra; crédito neto en credit spread.
- **Breakeven**: put corto K − prima · call corto K + prima · long call K + mid · long put K − mid.
- **POP**: probabilidad lognormal (neutral al riesgo, IV de Yahoo) de expirar OTM en el strike corto; en long, de superar el breakeven.
- **RoR**: beneficio máximo / pérdida máxima × 100.
- **RoR/día**: RoR / DTE.

## Griegas

Black-Scholes sin dividendos con `T = max(DTE, 1) / 365`, `r = RISK_FREE_RATE` (defecto 0,045) y `σ` = IV de Yahoo.

- **Delta**: sensibilidad al subyacente.
- **Gamma**: variación de delta por 1 $ de subyacente.
- **Theta**: variación de precio por día natural.
- **Vega**: variación de precio por punto de volatilidad.

Son valores calculados, no cotizados por el mercado.
