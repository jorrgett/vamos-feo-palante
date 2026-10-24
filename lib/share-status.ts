import { allocate } from "./money";

// Estado de cada pana dentro de UNA cuenta: quién puso la plata, quién ya pagó su parte y quién falta.
// Todo en centavos de USD.

export type ExpenseLike = {
  payers: { memberId: string; amountUsd: number }[];
  shares: { memberId: string; amountUsd: number }[];
};

export type LinkedPayment = { fromMember: string; toMember: string; amountUsd: number; confirmedAt?: Date | string | null };

export type ShareStatus = {
  memberId: string;
  shareUsd: number;
  /** Lo que puso en esta cuenta. */
  putUsd: number;
  /** Lo que le toca pagar a otros (0 si puso igual o más que su parte). */
  owesUsd: number;
  paidUsd: number;
  /** Parte de lo pagado que el que cobra todavía no confirma. */
  pendingUsd: number;
  status: "puso" | "pagado" | "por-confirmar" | "parcial" | "falta";
};

/** Neto de cada quien en la cuenta: positivo = le deben, negativo = debe. */
export function expenseNets(e: ExpenseLike): Map<string, number> {
  const nets = new Map<string, number>();
  for (const p of e.payers) nets.set(p.memberId, (nets.get(p.memberId) ?? 0) + p.amountUsd);
  for (const s of e.shares) nets.set(s.memberId, (nets.get(s.memberId) ?? 0) - s.amountUsd);
  return nets;
}

export function creditorsOf(e: ExpenseLike): { memberId: string; net: number }[] {
  return [...expenseNets(e).entries()].filter(([, v]) => v > 0).map(([memberId, net]) => ({ memberId, net }));
}

/** Cuánto le toca a `debtor` pagarle a cada acreedor de la cuenta (proporcional a lo que puso de más cada uno). */
export function debtSplit(e: ExpenseLike, debtor: string): { to: string; amountUsd: number }[] {
  const owes = -(expenseNets(e).get(debtor) ?? 0);
  if (owes <= 0) return [];
  const creditors = creditorsOf(e);
  const parts = allocate(owes, creditors.map((c) => c.net));
  return creditors.map((c, i) => ({ to: c.memberId, amountUsd: parts[i] })).filter((x) => x.amountUsd > 0);
}

export function shareStatuses(e: ExpenseLike, linked: LinkedPayment[]): ShareStatus[] {
  const nets = expenseNets(e);
  const ids = [...new Set([...e.shares.map((s) => s.memberId), ...e.payers.map((p) => p.memberId)])];
  return ids.map((memberId) => {
    const shareUsd = e.shares.filter((s) => s.memberId === memberId).reduce((a, s) => a + s.amountUsd, 0);
    const putUsd = e.payers.filter((p) => p.memberId === memberId).reduce((a, p) => a + p.amountUsd, 0);
    const owesUsd = Math.max(0, -(nets.get(memberId) ?? 0));
    const mine = linked.filter((l) => l.fromMember === memberId);
    const paidUsd = mine.reduce((a, l) => a + l.amountUsd, 0);
    // Un pago sin confirmedAt (null) espera confirmación; si el campo no viene, se da por confirmado.
    const pendingUsd = mine.filter((l) => l.confirmedAt === null).reduce((a, l) => a + l.amountUsd, 0);
    const status: ShareStatus["status"] =
      owesUsd === 0 ? "puso" : paidUsd >= owesUsd - 1 ? (pendingUsd > 0 ? "por-confirmar" : "pagado") : paidUsd > 0 ? "parcial" : "falta";
    return { memberId, shareUsd, putUsd, owesUsd, paidUsd, pendingUsd, status };
  });
}

/** Resumen para mostrar "3 de 5 ya pagaron". */
export function paidProgress(statuses: ShareStatus[]) {
  const debtors = statuses.filter((s) => s.owesUsd > 0);
  const paid = debtors.filter((s) => s.status === "pagado").length;
  const waiting = debtors.filter((s) => s.status === "por-confirmar").length;
  const pendingUsd = debtors.reduce((a, s) => a + Math.max(0, s.owesUsd - s.paidUsd), 0);
  return { debtors: debtors.length, paid, waiting, pendingUsd, done: debtors.length === 0 || paid === debtors.length };
}

/** Lo que `debtor` todavía le debe a `creditor` por esta cuenta. */
export function remainingTo(e: ExpenseLike, linked: LinkedPayment[], debtor: string, creditor: string): number {
  const portion = debtSplit(e, debtor).find((d) => d.to === creditor)?.amountUsd ?? 0;
  const paid = linked.filter((l) => l.fromMember === debtor && l.toMember === creditor).reduce((a, l) => a + l.amountUsd, 0);
  return Math.max(0, portion - paid);
}
