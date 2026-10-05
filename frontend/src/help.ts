export const HELP = {
  preset:
    "Estrategia predefinida: rellena los filtros con valores típicos para vender una put (Short Put) o una call (Short Call).",
  tickers:
    "Símbolos a analizar (máx. 10). Escribe y pulsa Enter o coma para añadir; × para quitar. Se guardan al recargar.",
  option_type: "Tipo de contrato: put (derecho a vender), call (derecho a comprar) o ambos.",
  strategy:
    "Cómo se opera la opción: venta (short, cobras prima), compra (long, pagas prima) o credit spread (venta + compra de protección).",
  spread_width: "Distancia en $ entre el strike vendido y el comprado en un credit spread.",
  dte: "DTE (Days To Expiration): días naturales que faltan hasta el vencimiento de la opción.",
  delta:
    "Delta (Δ): cuánto cambia la prima por cada $1 que se mueve el subyacente. En valor absoluto, aproxima la probabilidad de acabar ITM.",
  gamma: "Gamma (Γ): cuánto cambia la delta por cada $1 que se mueve el subyacente.",
  theta: "Theta (Θ): cuánto valor pierde la prima cada día por el paso del tiempo (en $ por día).",
  vega: "Vega (ν): cuánto cambia la prima por cada punto (1%) de variación de la volatilidad implícita.",
  oi: "OI (Open Interest): número de contratos abiertos. Más OI = más liquidez.",
  volume_opt: "Volumen: contratos negociados hoy en esa opción.",
  spread:
    "Spread bid-ask %: (ask − bid) / mid. Cuanto menor, más barato es entrar y salir de la posición.",
  iv: "VI / IV (volatilidad implícita): volatilidad anual que descuenta el precio de la opción. Alta = primas más caras.",
  pop: "POP (Probability of Profit): probabilidad estimada de que la operación acabe con beneficio al vencimiento (modelo lognormal con la VI).",
  pop_short:
    "POP venta: probabilidad estimada de que la opción expire OTM, es decir, de quedarte con la prima si la vendes.",
  max_expirations: "Número máximo de fechas de vencimiento que se consultan por ticker (más = más lento).",
  sort_by: "Columna por la que se ordenan los resultados.",
  sort_order: "Orden ascendente o descendente.",
  ror: "RoR (Return on Risk): beneficio máximo / riesgo máximo de la operación.",
  ror_day: "RoR/día: Return on Risk dividido entre los días hasta el vencimiento. Permite comparar plazos distintos.",
  strike: "Strike: precio de ejercicio de la opción.",
  bid: "Bid: mejor precio al que alguien compra la opción ahora mismo (lo que cobras si vendes).",
  ask: "Ask: mejor precio al que alguien vende la opción ahora mismo (lo que pagas si compras).",
  mid: "Mid: punto medio entre bid y ask; referencia del precio justo de la prima.",
  expiration: "Expiración (DTE): fecha de vencimiento del contrato y días que faltan.",
  dte_target:
    "DTE objetivo: el resumen usa la expiración más cercana a este número de días para calcular la VI y las griegas ATM.",
  price: "Precio: último precio del subyacente (con retraso de ~15 min).",
  change: "Var.: variación del precio respecto al cierre anterior, en $ y en %.",
  volume_stock: "Volumen: acciones negociadas hoy en el subyacente.",
  hv30: "VH 30d: volatilidad histórica realizada de los últimos 30 días, anualizada.",
  pos52: "Pos. 52s: dónde está el precio dentro del rango de 52 semanas (0% = mínimo anual, 100% = máximo anual).",
  pct_hv52:
    "Pct. VH 52s: percentil de la VH 30d actual frente al último año (100 = la volatilidad más alta del año).",
  strike_atm: "Strike ATM: strike más cercano al precio actual (at the money).",
  iv_atm: "VI ATM: volatilidad implícita de la opción at the money para la expiración elegida.",
  breakeven: "Breakeven: precio del subyacente al vencimiento en el que la operación ni gana ni pierde.",
  max_profit: "Beneficio máximo posible de la operación al vencimiento.",
  max_loss: "Pérdida máxima posible de la operación al vencimiento.",
  payoff: "Payoff: beneficio/pérdida al vencimiento según el precio del subyacente.",
  interval: "Temporalidad de cada vela: 1H (hora), 1D (día), 1S (semana).",
  sma: "SMA: media móvil simple del cierre de 50 (verde), 70 (azul) y 200 (morado) velas.",
  rsi: "RSI (14): oscilador de fuerza relativa 0–100. Por encima de 70 = sobrecompra, por debajo de 30 = sobreventa.",
  macd: "MACD (12, 26, 9): diferencia entre EMA 12 y EMA 26 (azul), su señal EMA 9 (naranja) y el histograma entre ambas.",
  draw: "Línea: activa el modo dibujo; pulsa dos puntos del gráfico para trazar una línea. Esc para salir.",
  exp_marker: "La línea vertical amarilla marca la expiración seleccionada en la cadena de opciones.",
  chain: "Cadena: primas por strike para la expiración elegida; calls a la izquierda, puts a la derecha.",
} as const;

export type HelpKey = keyof typeof HELP;
