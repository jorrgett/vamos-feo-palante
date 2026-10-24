// Busca cualquier rastro de una cuenta borrada en TODAS las tablas: npx tsx scripts/verificar-borrado.mts <texto> [pglite|neon]
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";

const needle = (process.argv[2] ?? "").toLowerCase();
if (!needle) throw new Error("Uso: verificar-borrado.mts <correo o nombre>");
const db = new PGlite(path.join(process.cwd(), ".pglite"));
const { rows: tables } = await db.query<{ t: string }>("select table_name as t from information_schema.tables where table_schema='public' order by 1");
let total = 0;
for (const { t } of tables) {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from "${t}" x where lower(x::text) like $1`, [`%${needle}%`]);
  total += rows[0].n;
  console.log(`${t.padEnd(22)} filas con "${needle}": ${rows[0].n}`);
}
const ex = await db.query("select name, user_id, left_at is not null as salio from members where name = 'Ex pana'");
console.log("\nMiembros 'Ex pana':", JSON.stringify(ex.rows));
const huerf = await db.query(`select
  (select count(*)::int from sessions s where not exists (select 1 from users u where u.id = s.user_id)) as sesiones_huerfanas,
  (select count(*)::int from push_subscriptions p where not exists (select 1 from users u where u.id = p.user_id)) as push_huerfanos,
  (select count(*)::int from members m where m.user_id is not null and not exists (select 1 from users u where u.id = m.user_id)) as miembros_huerfanos,
  (select count(*)::int from groups g where name ilike '%solo de%') as grupo_solo`);
console.log("Huérfanos:", JSON.stringify(huerf.rows[0]));
console.log(total === 0 ? `\n✅ No queda ningún rastro de "${needle}"` : `\n❌ Quedan ${total} filas con "${needle}"`);
await db.close();
