# Vamos feo pa'lante 🤙

La libreta de cuentas de los panas: cada vez que salen, una **salida** con quién fue, cuánto fue, quién puso la plata y quién ya pagó. Hecha para la realidad venezolana: dólares, bolívares, euros y USDT con la tasa del día, pago móvil y compras con Cashea.

## Qué hace

- **Salidas paso a paso**: qué fue (una o varias categorías), quiénes fueron, cuánto fue, quién puso la plata y cómo se divide (partes iguales, montos, porcentajes, por partes o por consumo, con servicio e IVA).
- **¿Quién ya pagó?**: cada pana ve lo que debe y a quién; el que cobra confirma cada pago.
- **Pagos guiados**: los datos de pago móvil, Zelle o Binance del que cobra, con el monto exacto en Bs y botones para copiar en el formato que piden los bancos. Se puede adjuntar la captura del pago.
- **Tasas**: BCV ($ y €) y USDT (mediana de Binance P2P), guardadas a diario.
- **Cashea**: planes con inicial y cuotas cada 14 días. En modo espejo cada pana paga su parte al ritmo de las cuotas y la app le muestra su próxima cuota.
- **Avisos**: campanita y notificaciones push (también en iPhone con la app en inicio), recordatorio diario de deudas y cuenta regresiva de cuotas.
- **IA (Claude)**: escanea la factura y arma la cuenta preguntando quién pidió qué; lee la captura del pago y revisa que el monto y el destino cuadren.
- **Panel del administrador**: quién tiene los avisos activos, consumo de IA y el cuadre de cada salida vista como cualquier participante.
- **Solo por invitación**: registro con un link de invitación; borrar la cuenta la elimina de verdad.

## Stack

Next.js 16 (App Router, server actions) · React 19 · TypeScript · Tailwind CSS 4 · Drizzle ORM sobre Postgres (Neon en producción, PGlite en local) · `web-push` · Anthropic SDK · desplegada en Vercel con cron jobs.

## Correr en local

```bash
npm install
echo "DB_DRIVER=pglite" > .env.development.local
npm run dev
```

En local la base es PGlite (Postgres embebido en `.pglite/`) y las migraciones de `drizzle/` se aplican solas. El primer usuario que se registra es el administrador y puede registrarse sin invitación.

### Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Postgres de producción (Neon) |
| `DB_DRIVER=pglite`, `PGLITE_DIR` | Base local embebida |
| `CRON_SECRET` | Protege los cron de tasas y avisos |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notificaciones push |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Correos de "olvidé mi contraseña" |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_MODEL` | Funciones de IA (opcionales) |

Sin las claves de IA, push o Gmail la app funciona igual: esas funciones simplemente no aparecen.

## Scripts

| Comando | Qué hace |
|---|---|
| `npx tsx scripts/probar-logica.ts` | Pruebas de la lógica de dinero, cuotas, cuadre y recordatorios |
| `npx drizzle-kit generate --name <nombre>` | Nueva migración desde `lib/db/schema.ts` |
| `npx tsx scripts/migrar.mts` | Aplica las migraciones en Neon |
| `npx tsx scripts/revisar-cuadre.mts` | Revisa (solo lectura) que todas las salidas cuadren |
| `npx tsx scripts/generar-iconos.mts` | Regenera los íconos PNG de la app |
| `bash scripts/configurar-ia.sh` | Guarda la API key de Claude sin mostrarla |

## Estructura

- `app/` — páginas (`(app)` con sesión, `(auth)` sin sesión), server actions y rutas de API (cron, fotos, comprobantes).
- `components/` — interfaz (asistente de salidas, lista de quién pagó, Cashea, avisos…).
- `lib/` — lógica: dinero en centavos, repartos, saldos, tasas, Cashea, recordatorios, IA y base de datos.
- `drizzle/` — migraciones SQL.
- `scripts/` — pruebas y utilidades.

Todo el dinero se guarda en centavos enteros; cada cuenta guarda la tasa con la que se anotó.
