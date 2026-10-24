import { computeBalances } from "./balances";
import { fmt } from "./money";

// Cuadre de una salida para el panel del administrador. Lógica pura (sin base de datos) para poder probarla.

type Part = { memberId: string; amountUsd: number };
export type AuditInput = {
  members: { id: string; userId: string | null; name: string; avatar: string; color: string }[];
  expenses: { amountUsd: number; payers: Part[]; shares: Part[] }[];
  settlements: { fromMember: string; toMember: string; amountUsd: number; confirmedAt: Date | null }[];
};

export type AuditRow = {
  memberId: string;
  userId: string | null;
  name: string;
  avatar: string;
  color: string;
  /** Lo que le tocó, lo que puso, lo que pagó a otros y lo que recibió (centavos USD). */
  share: number;
  put: number;
  sent: number;
  sentPending: number;
  received: number;
  receivedPending: number;
  /** Positivo: le deben. Negativo: debe. */
  balance: number;
};

export type Audit = { rows: AuditRow[]; total: number; ok: boolean; settled: boolean; issues: string[] };

const usd = (c: number) => fmt(c, "USD");

/** Revisa que la salida cuadre: partes, lo que pusieron, pagos y saldos. */
export function auditLedger(ledger: AuditInput): Audit {
  const e = ledger.expenses[0];
  const total = e?.amountUsd ?? 0;
  const sum = (xs: { amountUsd: number }[]) => xs.reduce((a, x) => a + x.amountUsd, 0);
  // El saldo que calcula la app (el mismo de summarize), para compararlo con la cuenta a mano de aquí.
  const appBalances = computeBalances(
    ledger.members.map((m) => m.id),
    ledger.expenses.map((x) => ({ payers: x.payers, shares: x.shares })),
    ledger.settlements,
  );
  const rows: AuditRow[] = ledger.members.map((m) => {
    const out = ledger.settlements.filter((s) => s.fromMember === m.id);
    const inn = ledger.settlements.filter((s) => s.toMember === m.id);
    const share = sum(e?.shares.filter((s) => s.memberId === m.id) ?? []);
    const put = sum(e?.payers.filter((p) => p.memberId === m.id) ?? []);
    return {
      memberId: m.id,
      userId: m.userId,
      name: m.name,
      avatar: m.avatar,
      color: m.color,
      share,
      put,
      sent: sum(out),
      sentPending: sum(out.filter((s) => !s.confirmedAt)),
      received: sum(inn),
      receivedPending: sum(inn.filter((s) => !s.confirmedAt)),
      balance: put - share + sum(out) - sum(inn),
    };
  });

  const issues: string[] = [];
  const shares = rows.reduce((a, r) => a + r.share, 0);
  const puts = rows.reduce((a, r) => a + r.put, 0);
  const net = rows.reduce((a, r) => a + r.balance, 0);
  if (!e) issues.push("La salida no tiene cuenta anotada.");
  if (e && Math.abs(shares - total) > 1) issues.push(`Las partes suman ${usd(shares)}, pero la cuenta es ${usd(total)}.`);
  if (e && Math.abs(puts - total) > 1) issues.push(`Lo que pusieron suma ${usd(puts)}, pero la cuenta es ${usd(total)}.`);
  if (Math.abs(net) > 1) issues.push(`Los saldos no suman cero (sobran ${usd(net)}).`);
  for (const r of rows) {
    const calc = appBalances[r.memberId] ?? 0;
    if (Math.abs(calc - r.balance) > 1) issues.push(`El saldo de ${r.name} no coincide con el de la app (${usd(r.balance)} vs ${usd(calc)}).`);
    if (r.put === 0 && r.balance > 1) issues.push(`${r.name} pagó de más: ${usd(r.balance)}.`);
    if (r.put > 0 && r.balance < -1) issues.push(`A ${r.name} le pagaron de más: ${usd(-r.balance)}.`);
    if (r.put === 0 && r.received > 0) issues.push(`${r.name} recibió pagos sin haber puesto plata.`);
  }
  return { rows, total, ok: issues.length === 0, settled: rows.every((r) => Math.abs(r.balance) <= 1), issues };
}
