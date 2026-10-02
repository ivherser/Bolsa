# Guía de uso

## Acceso

El screener requiere una cuenta. Regístrate con email y contraseña (mínimo 8 caracteres); si el proyecto de Supabase tiene activada la confirmación por email, recibirás un enlace antes de poder entrar. La sesión se mantiene en el navegador hasta que pulses **Salir**.

## Flujo básico

1. Elige una **estrategia predefinida** (Cash-Secured Put, Put Credit Spread o Long Calls): rellena todos los filtros automáticamente.
2. Añade hasta **10 tickers** como chips (Enter o coma). El frontend los agrupa de 5 en 5 por llamada a la API.
3. Ajusta los filtros (DTE, |delta|, OI, volumen, spread bid/ask, IV, POP, tipo put/call y ordenación).
4. Pulsa **Buscar**. La tabla es ordenable por columna; al clicar una fila se abre el panel de detalle con griegas, breakeven, beneficio/pérdida máxima y el diagrama de payoff.

## Datos personales (persistidos en Supabase)

- **Watchlist**: «Guardar tickers» guarda los chips actuales. Clic en un ticker de la watchlist lo añade al screener; «Cargar watchlist» sustituye los chips por la watchlist (máx. 10).
- **Mis presets**: guarda los filtros actuales con un nombre; clic para aplicarlos, × para borrarlos. Guardar con un nombre existente lo sobrescribe.
- **Diario de notas**: notas libres, opcionalmente asociadas a un ticker. Al seleccionar una fila de resultados se propone su ticker. Se pueden editar y borrar.

Cada usuario solo ve sus propios datos: la base de datos aplica Row Level Security (`user_id = auth.uid()`).
