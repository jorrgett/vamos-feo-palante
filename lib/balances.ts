// Saldos del grupo en centavos de USD.
// Saldo positivo = al miembro le deben. Negativo = el miembro debe.

export type LedgerExpense = {
  payers: { memberId: string; amountUsd: number }[];
  shares: { memberId: string; amountUsd: number }[];
};

export type LedgerSettlement = { fromMember: string; toMember: string; amountUsd: number };

export type Transfer = { from: string; to: string; amount: number };

export function computeBalances(
  memberIds: string[],
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
): Record<string, number> {
  const bal: Record<string, number> = Object.fromEntries(memberIds.map((m) => [m, 0]));
  const add = (m: string, v: number) => (bal[m] = (bal[m] ?? 0) + v);
  for (const e of expenses) {
    for (const p of e.payers) add(p.memberId, p.amountUsd);
    for (const s of e.shares) add(s.memberId, -s.amountUsd);
  }
  for (const s of settlements) {
    add(s.fromMember, s.amountUsd);
    add(s.toMember, -s.amountUsd);
  }
  return bal;
}

/**
 * Minimiza el número de transferencias: el mayor deudor le paga al mayor acreedor
 * hasta que todos queden en cero. Con n personas salen como mucho n − 1 pagos.
 */
export function simplifyDebts(balances: Record<string, number>, tolerance = 0): Transfer[] {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > tolerance)
    .map(([id, v]) => ({ id, v }));
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -tolerance)
    .map(([id, v]) => ({ id, v: -v }));
  const out: Transfer[] = [];
  creditors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v <= tolerance) i++;
    if (creditors[j].v <= tolerance) j++;
  }
  return out;
}

/** Deudas directas sin simplificar: quién le debe a quién por cada gasto, netas por pareja. */
export function pairwiseDebts(expenses: LedgerExpense[], settlements: LedgerSettlement[]): Transfer[] {
  const net = new Map<string, number>(); // clave "a|b" con a<b: positivo = a le debe a b
  const push = (debtor: string, creditor: string, v: number) => {
    if (debtor === creditor || v === 0) return;
    const [a, b] = debtor < creditor ? [debtor, creditor] : [creditor, debtor];
    const sign = debtor < creditor ? 1 : -1;
    net.set(`${a}|${b}`, (net.get(`${a}|${b}`) ?? 0) + sign * v);
  };
  for (const e of expenses) {
    const paidTotal = e.payers.reduce((s, p) => s + p.amountUsd, 0);
    if (paidTotal <= 0) continue;
    for (const s of e.shares) {
      for (const p of e.payers) {
        push(s.memberId, p.memberId, Math.round((s.amountUsd * p.amountUsd) / paidTotal));
      }
    }
  }
  for (const s of settlements) push(s.toMember, s.fromMember, s.amountUsd);
  const out: Transfer[] = [];
  for (const [key, v] of net) {
    const [a, b] = key.split("|");
    if (v > 0) out.push({ from: a, to: b, amount: v });
    else if (v < 0) out.push({ from: b, to: a, amount: -v });
  }
  return out.sort((x, y) => y.amount - x.amount);
}
