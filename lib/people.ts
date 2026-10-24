import "server-only";
import type { Ledger, LedgerSummary } from "./data";
import { categoryOf } from "./constants";
import { ymdOf } from "./dates";
import { remainingTo } from "./share-status";
import { mirrorForDebtor } from "./cashea";

type Bundle = { ledger: Ledger; summary: LedgerSummary };

export type PersonItem = {
  salidaId: string;
  title: string;
  emoji: string;
  date: string;
  remainingUsd: number;
  rateSource: string;
  closed: boolean;
  /** Si se paga por cuotas de Cashea (espejo): la próxima cuota y cuánto hay que pagar para ponerse al día. */
  cuota?: { n: number; count: number; dueDate: string; daysLeft: number; payUsd: number } | null;
};

export type PersonBalance = {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  owedToMe: number;
  iOwe: number;
  theyOweItems: PersonItem[];
  iOweItems: PersonItem[];
};

const eLikeOf = (e: Ledger["expenses"][number]) => ({
  payers: e.payers.map((p) => ({ memberId: p.memberId, amountUsd: p.amountUsd })),
  shares: e.shares.map((s) => ({ memberId: s.memberId, amountUsd: s.amountUsd })),
});

/** Lo que cada pana me debe y lo que yo le debo, sumando todas las salidas (cuenta por cuenta). */
export function personBalances(bundles: Bundle[]): PersonBalance[] {
  const map = new Map<string, PersonBalance>();
  for (const { ledger } of bundles) {
    const me = ledger.me.id;
    for (const e of ledger.expenses) {
      const eLike = eLikeOf(e);
      const linked = ledger.settlements.filter((s) => s.expenseId === e.id);
      const p = ledger.cashea.find((c) => c.expenseId === e.id && c.mode === "espejo");
      const plan = p && { memberId: p.memberId, mode: p.mode, totalUsd: p.totalUsd, installments: p.installments, rows: p.cuotas };
      /** Próxima cuota de `debtor` con `creditor` si es el dueño del Cashea. */
      const cuotaOf = (debtor: string, creditor: string) => {
        if (plan?.memberId !== creditor) return null;
        const m = mirrorForDebtor(plan, eLike, linked, debtor);
        return m?.next ? { n: m.next.n, count: m.count, dueDate: m.next.dueDate, daysLeft: m.next.daysLeft, payUsd: m.nextPayUsd } : null;
      };
      const base = {
        salidaId: ledger.group.id,
        title: e.title,
        emoji: categoryOf(e.category).emoji,
        date: ymdOf(e.spentAt),
        rateSource: ledger.group.rateSource,
        closed: !!ledger.group.closedAt,
      };
      for (const other of ledger.members) {
        if (!other.userId || other.id === me) continue;
        const theyOwe = remainingTo(eLike, linked, other.id, me);
        const iOwe = remainingTo(eLike, linked, me, other.id);
        if (!theyOwe && !iOwe) continue;
        const cur =
          map.get(other.userId) ??
          ({ userId: other.userId, name: other.name, avatar: other.avatar, color: other.color, owedToMe: 0, iOwe: 0, theyOweItems: [], iOweItems: [] } as PersonBalance);
        if (theyOwe) {
          cur.owedToMe += theyOwe;
          cur.theyOweItems.push({ ...base, remainingUsd: theyOwe, cuota: cuotaOf(other.id, me) });
        }
        if (iOwe) {
          cur.iOwe += iOwe;
          cur.iOweItems.push({ ...base, remainingUsd: iOwe, cuota: cuotaOf(me, other.id) });
        }
        map.set(other.userId, cur);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.owedToMe + b.iOwe - (a.owedToMe + a.iOwe));
}

export type PendingConfirmation = {
  batchId: string;
  fromUserId: string | null;
  fromName: string;
  fromAvatar: string;
  fromColor: string;
  toName: string;
  totalUsd: number;
  currency: string;
  amount: number;
  method: string;
  reference: string | null;
  createdAt: string;
  salidas: { id: string; title: string }[];
  settlementIds: string[];
};

/** Pagos que todavía no confirma el que cobra. `role` = "cobro" (me los deben confirmar a mí) o "pago" (espero yo). */
export function pendingConfirmations(bundles: Bundle[], role: "cobro" | "pago"): PendingConfirmation[] {
  const map = new Map<string, PendingConfirmation>();
  for (const { ledger } of bundles) {
    const me = ledger.me.id;
    for (const s of ledger.settlements) {
      if (s.confirmedAt) continue;
      if (role === "cobro" ? s.toMember !== me : s.fromMember !== me) continue;
      const from = ledger.members.find((m) => m.id === s.fromMember);
      const to = ledger.members.find((m) => m.id === s.toMember);
      const key = s.batchId ?? s.id;
      const e = ledger.expenses.find((x) => x.id === s.expenseId);
      const cur =
        map.get(key) ??
        ({
          batchId: key,
          fromUserId: from?.userId ?? null,
          fromName: from?.name ?? "?",
          fromAvatar: from?.avatar ?? "🙂",
          fromColor: from?.color ?? "#999",
          toName: to?.name ?? "?",
          totalUsd: 0,
          currency: s.currency,
          amount: 0,
          method: s.method,
          reference: s.reference,
          createdAt: s.createdAt.toISOString(),
          salidas: [],
          settlementIds: [],
        } as PendingConfirmation);
      cur.totalUsd += s.amountUsd;
      cur.amount += s.amount;
      cur.settlementIds.push(s.id);
      if (!cur.salidas.some((x) => x.id === ledger.group.id)) cur.salidas.push({ id: ledger.group.id, title: e?.title ?? ledger.group.name });
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
