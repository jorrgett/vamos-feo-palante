// Deja la base de datos en cero: borra TODAS las cuentas, salidas, pagos, Cashea, avisos y sesiones.
// Se queda el historial de tasas (BCV/€/USDT) para que los gráficos no arranquen vacíos.
//
//   npx tsx scripts/limpiar-db.mts                  → solo cuenta lo que hay en producción (Neon)
//   npx tsx scripts/limpiar-db.mts --borrar         → BORRA todo en producción (no se puede deshacer)
//   npx tsx scripts/limpiar-db.mts --local [--borrar] → lo mismo en la base local (PGlite, con el servidor apagado)
import { config } from "dotenv";

const TABLES = [
  "users",
  "sessions",
  "login_attempts",
  "password_resets",
  "push_subscriptions",
  "notifications",
  "groups",
  "members",
  "expenses",
  "expense_payers",
  "expense_shares",
  "settlements",
  "cashea_plans",
  "cashea_installments",
  "app_settings",
];

const local = process.argv.includes("--local");
const wipe = process.argv.includes("--borrar");

type Query = (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
let query: Query;
let close: () => Promise<void>;

if (local) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(".pglite");
  query = (sql) => db.query(sql) as Promise<{ rows: Record<string, unknown>[] }>;
  close = () => db.close();
} else {
  config({ path: ".env.local", quiet: true });
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  query = (sql) => pool.query(sql);
  close = () => pool.end();
}

const count = async () => {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = Number((await query(`select count(*)::int as n from "${t}"`)).rows[0].n);
  return out;
};

console.log(`Base: ${local ? "LOCAL (PGlite)" : "PRODUCCIÓN (Neon)"}`);
console.table(await count());

if (!wipe) {
  console.log("Nada borrado. Para borrar todo, repite con --borrar");
} else {
  await query(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  const after = await count();
  const left = Object.values(after).reduce((a, n) => a + n, 0);
  const rates = Number((await query(`select count(*)::int as n from "rates"`)).rows[0].n);
  console.log(left === 0 ? `✅ Base en cero. Se conservaron ${rates} días de tasas.` : `❌ Quedaron ${left} filas`);
  console.log("El primero que se registre ahora entra sin invitación: regístrate tú primero.");
}
await close();
