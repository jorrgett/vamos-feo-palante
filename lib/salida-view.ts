import "server-only";
import type { Ledger } from "./data";
import type { ChecklistRow } from "@/components/share-checklist";
import { debtSplit, shareStatuses } from "./share-status";
import { mirrorForDebtor, type MirrorPlanLike } from "./cashea";

/** Filas de «¿Quién ya pagó?» para una salida, vistas desde el usuario actual. */
export function checklistRows(ledger: Ledger): ChecklistRow[] {
  const e = ledger.expenses[0];
  if (!e) return [];
  const me = ledger.me.id;
  const byId = new Map(ledger.members.map((m) => [m.id, m]));
  const eLike = {
    payers: e.payers.map((p) => ({ memberId: p.memberId, amountUsd: p.amountUsd })),
    shares: e.shares.map((s) => ({ memberId: s.memberId, amountUsd: s.amountUsd })),
  };
  const linked = ledger.settlements.filter((s) => s.expenseId === e.id);
  const plan = casheaPlanOf(ledger);
  return shareStatuses(eLike, linked).map((st) => {
    const mirror = st.owesUsd > 0 ? mirrorForDebtor(plan, eLike, linked, st.memberId) : null;
    const m = byId.get(st.memberId);
    const parts = debtSplit(eLike, st.memberId);
    return {
      ...st,
      userId: m?.userId ?? null,
      name: m?.name ?? "?",
      avatar: m?.avatar ?? "🙂",
      color: m?.color ?? "#999",
      isMe: st.memberId === me,
      owesTo: parts.map((x) => (x.to === me ? "ti" : (byId.get(x.to)?.name ?? "?"))).join(" y "),
      creditorUserId: byId.get(parts[0]?.to ?? "")?.userId ?? null,
      iCollect: parts.some((x) => x.to === me),
      pendingIdsForMe: linked.filter((l) => l.fromMember === st.memberId && l.toMember === me && !l.confirmedAt).map((l) => l.id),
      cuota:
        mirror?.next != null
          ? {
              n: mirror.next.n,
              count: mirror.count,
              dueDate: mirror.next.dueDate,
              daysLeft: mirror.next.daysLeft,
              payUsd: mirror.nextPayUsd,
              overdueUsd: mirror.overdueUsd,
              holderUserId: byId.get(mirror.holderId)?.userId ?? null,
            }
          : null,
    };
  });
}

/** El plan de Cashea en espejo de la cuenta de la salida, listo para calcular cuotas por pana. */
export function casheaPlanOf(ledger: Ledger): MirrorPlanLike | null {
  const e = ledger.expenses[0];
  const p = e && ledger.cashea.find((c) => c.expenseId === e.id && c.mode === "espejo");
  if (!p) return null;
  return { memberId: p.memberId, mode: p.mode, totalUsd: p.totalUsd, installments: p.installments, rows: p.cuotas.map((c) => ({ n: c.n, dueDate: c.dueDate, amountUsd: c.amountUsd })) };
}
