// Solo lectura: revisa que cada salida de producción cuadre (lo mismo que el panel del administrador): npx tsx scripts/revisar-cuadre.mts
import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { auditLedger } from "../lib/audit";
config({ path: ".env.local" });
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql: string) => (await pool.query(sql)).rows;
const [exps, payers, shares, members, sets, ai] = await Promise.all([
  q("select id, group_id, title, amount_usd from expenses where deleted_at is null"),
  q("select expense_id, member_id, amount_usd from expense_payers"),
  q("select expense_id, member_id, amount_usd from expense_shares"),
  q("select id, group_id, user_id, name from members"),
  q("select group_id, from_member, to_member, amount_usd, confirmed_at from settlements where deleted_at is null"),
  q("select count(*)::int n from ai_usage"),
]);
let ok = 0;
for (const e of exps) {
  const a = auditLedger({
    members: members.filter((m) => m.group_id === e.group_id).map((m) => ({ id: m.id, userId: m.user_id, name: m.name, avatar: "", color: "" })),
    expenses: [{ amountUsd: Number(e.amount_usd), payers: payers.filter((p) => p.expense_id === e.id).map((p) => ({ memberId: p.member_id, amountUsd: Number(p.amount_usd) })), shares: shares.filter((s) => s.expense_id === e.id).map((s) => ({ memberId: s.member_id, amountUsd: Number(s.amount_usd) })) }],
    settlements: sets.filter((s) => s.group_id === e.group_id).map((s) => ({ fromMember: s.from_member, toMember: s.to_member, amountUsd: Number(s.amount_usd), confirmedAt: s.confirmed_at })),
  });
  if (a.ok) ok++;
  else console.log(`⚠️ ${e.title}: ${a.issues.join(" | ")}`);
}
console.log(`Salidas: ${exps.length} · cuadran: ${ok} · usos de IA anotados: ${ai[0].n}`);
await pool.end();
