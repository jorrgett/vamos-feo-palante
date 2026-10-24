import { CASHEA_GRACE_DAYS, CASHEA_LATE_FEE_USD, cuotaName, dueLabel, mirrorForDebtor, type MirrorPlanLike } from "./cashea";
import { diffDays } from "./dates";
import { fmt } from "./money";
import { debtSplit, remainingTo, shareStatuses, type ExpenseLike, type LinkedPayment } from "./share-status";

// Recordatorio diario de las salidas abiertas: UN aviso por persona (no uno por salida) con lo que le
// falta pagar y, si cobra, los pagos que tiene por confirmar. Lógica pura para poder probarla.

export type ReminderSalida = {
  id: string;
  title: string;
  /** Bs por $ de la tasa de esa salida (para mostrar el monto en bolívares). */
  vesPerUsd: number;
  expense: ExpenseLike;
  settlements: (LinkedPayment & { confirmedAt: Date | string | null })[];
  members: { id: string; userId: string | null; name: string }[];
  /** Plan de Cashea en espejo: lo que se le debe al dueño solo cuenta cuando la cuota ya se venció. */
  cashea?: MirrorPlanLike | null;
};

export type DailyReminder = { userId: string; groupId: string | null; emoji: string; title: string; body: string; url: string };

type Debt = { salidaId: string; title: string; usd: number; ves: number; to: string; creditorUserId: string | null; overdueCuota: number | null };
type ToConfirm = { salidaId: string; title: string; from: string; usd: number };

const names = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `at` = hoy en Caracas (AAAA-MM-DD). Las cuotas que vencen hoy o después las avisa el recordatorio de Cashea. */
export function dailyReminders(salidas: ReminderSalida[], at?: string): DailyReminder[] {
  const debts = new Map<string, Debt[]>();
  const confirms = new Map<string, ToConfirm[]>();
  const push = <T>(map: Map<string, T[]>, k: string, v: T) => map.set(k, [...(map.get(k) ?? []), v]);

  for (const s of salidas) {
    const byId = new Map(s.members.map((m) => [m.id, m]));
    for (const st of shareStatuses(s.expense, s.settlements)) {
      const m = byId.get(st.memberId);
      if (!m?.userId || (st.status !== "falta" && st.status !== "parcial")) continue;
      // A quién le debe todavía (si ya le pagó a uno de los que pusieron, ese no sale).
      const parts = debtSplit(s.expense, st.memberId).filter((p) => remainingTo(s.expense, s.settlements, st.memberId, p.to) > 0);
      let usd = Math.max(0, st.owesUsd - st.paidUsd);
      // Por cuotas de Cashea: lo que aún no vence no se cobra todavía; solo lo vencido.
      const mirror = mirrorForDebtor(s.cashea, s.expense, s.settlements, st.memberId, at);
      if (mirror) usd = Math.max(0, usd - mirror.totalRestUsd + mirror.overdueUsd);
      if (usd <= 1) continue;
      const overdueCuota = mirror && mirror.overdueUsd > 0 ? (mirror.parts.find((p) => p.restUsd > 0)?.n ?? null) : null;
      push(debts, m.userId, {
        salidaId: s.id,
        title: s.title,
        usd,
        ves: Math.round(usd * s.vesPerUsd),
        to: names(parts.map((p) => byId.get(p.to)?.name ?? "?")),
        creditorUserId: byId.get(parts[0]?.to ?? "")?.userId ?? null,
        overdueCuota,
      });
    }
    for (const p of s.settlements) {
      if (p.confirmedAt) continue;
      const to = byId.get(p.toMember);
      if (!to?.userId) continue;
      push(confirms, to.userId, { salidaId: s.id, title: s.title, from: byId.get(p.fromMember)?.name ?? "?", usd: p.amountUsd });
    }
  }

  const out: DailyReminder[] = [];
  for (const userId of new Set([...debts.keys(), ...confirms.keys()])) {
    const d = debts.get(userId) ?? [];
    const c = confirms.get(userId) ?? [];
    const confirmNote = c.length ? ` Además tienes ${plural(c.length, "pago", "pagos")} por confirmar.` : "";
    if (d.length === 1) {
      const x = d[0];
      out.push({
        userId,
        groupId: x.salidaId,
        emoji: x.overdueCuota != null ? "⚠️" : "💸",
        title: x.overdueCuota != null ? `Se te venció ${cuotaName(x.overdueCuota)} de «${x.title}»` : `Te falta pagar tu parte de «${x.title}»`,
        body: `${fmt(x.usd, "USD")} (${fmt(x.ves, "VES")}) para ${x.to}. ${x.overdueCuota != null ? "Págala para ponerte al día" : "Toca para pagar"} 🙏${confirmNote}`,
        url: x.creditorUserId ? `/pagar?a=${x.creditorUserId}&s=${x.salidaId}` : `/salidas/${x.salidaId}`,
      });
    } else if (d.length > 1) {
      const total = d.reduce((a, x) => a + x.usd, 0);
      const list = d
        .slice(0, 3)
        .map((x) => `«${x.title}» ${fmt(x.usd, "USD")} a ${x.to}`)
        .join(" · ");
      out.push({
        userId,
        groupId: null,
        emoji: "💸",
        title: `Tienes ${d.length} salidas por pagar: ${fmt(total, "USD")}`,
        body: `${list}${d.length > 3 ? ` y ${plural(d.length - 3, "más", "más")}` : ""}. Toca para pagar 🙏${confirmNote}`,
        url: "/pagar",
      });
    } else if (c.length === 1) {
      const x = c[0];
      out.push({
        userId,
        groupId: x.salidaId,
        emoji: "✅",
        title: `${x.from} dice que te pagó «${x.title}»`,
        body: `${fmt(x.usd, "USD")}. Confírmalo si te llegó para que la salida quede al día.`,
        url: `/salidas/${x.salidaId}`,
      });
    } else if (c.length > 1) {
      const from = [...new Set(c.map((x) => x.from))];
      out.push({
        userId,
        groupId: null,
        emoji: "✅",
        title: `Tienes ${c.length} pagos por confirmar`,
        body: `${names(from)} ${from.length === 1 ? "dice que te pagó" : "dicen que te pagaron"}. Confírmalos si te llegaron.`,
        url: "/inicio",
      });
    }
  }
  return out;
}

// ── Cuotas de Cashea: cuenta regresiva (en 3 días, en 2 días, mañana, hoy) ──────────────────────

export type CasheaReminderPlan = {
  groupId: string;
  store: string;
  /** La salida está cerrada: ya no se le cobra a los panas (al dueño sí, Cashea igual cobra). */
  closed: boolean;
  plan: MirrorPlanLike & { rows: { n: number; dueDate: string; amountUsd: number; paidAt: Date | string | null }[] };
  expense: ExpenseLike | null;
  settlements: LinkedPayment[];
  members: { id: string; userId: string | null; name: string }[];
  /** Bs por $ a tasa BCV de hoy (las cuotas de Cashea se pagan a BCV). */
  bcvUsd: number;
};

/** Días antes del vencimiento en los que se avisa. */
const COUNTDOWN = [3, 2, 1, 0];

export function casheaReminders(plans: CasheaReminderPlan[], at: string): DailyReminder[] {
  const out: DailyReminder[] = [];
  for (const p of plans) {
    const byId = new Map(p.members.map((m) => [m.id, m]));
    const holder = byId.get(p.plan.memberId);
    const count = p.plan.installments;
    // Cuánto le falta a cada pana de cada cuota (modo espejo).
    const debtors =
      p.plan.mode === "espejo" && p.expense
        ? p.expense.shares
            .map((s) => s.memberId)
            .filter((id, i, all) => id !== p.plan.memberId && all.indexOf(id) === i)
            .map((id) => ({ id, m: mirrorForDebtor(p.plan, p.expense!, p.settlements, id, at) }))
            .filter((d) => d.m)
        : [];

    // Al dueño del Cashea: sus cuotas sin pagar.
    for (const r of p.plan.rows) {
      if (r.n === 0 || r.paidAt || !holder?.userId) continue;
      const days = diffDays(r.dueDate, at);
      const grace = days === -CASHEA_GRACE_DAYS;
      if (!COUNTDOWN.includes(days) && !grace) continue;
      const paidBy = debtors.filter((d) => d.m!.parts.find((x) => x.n === r.n)?.restUsd === 0).length;
      out.push({
        userId: holder.userId,
        groupId: p.groupId,
        emoji: grace ? "⚠️" : "🛍️",
        title: `Cuota ${r.n}/${count} de ${p.store}: ${grace ? "último día de gracia" : dueLabel(days)}`,
        body:
          `${fmt(r.amountUsd, "USD")} ≈ ${fmt(Math.round(r.amountUsd * p.bcvUsd), "VES")} a tasa BCV de hoy.` +
          (debtors.length ? ` Ya te pagaron su parte ${paidBy} de ${debtors.length} ${debtors.length === 1 ? "pana" : "panas"}.` : "") +
          (grace ? ` Mañana Cashea cobra ${fmt(CASHEA_LATE_FEE_USD, "USD")} de reactivación.` : ""),
        url: `/salidas/${p.groupId}`,
      });
    }

    // A cada pana (modo espejo): su próxima parte, cuando se acerca el día. Un solo aviso por plan.
    if (p.closed) continue;
    for (const d of debtors) {
      const m = d.m!;
      const user = byId.get(d.id)?.userId;
      if (!user) continue;
      const part = m.parts.find((x) => x.n > 0 && x.restUsd > 0 && COUNTDOWN.includes(diffDays(x.dueDate, at)));
      if (!part) continue;
      const days = diffDays(part.dueDate, at);
      // Lo que tiene que pagar para quedar al día con esa cuota (incluye lo vencido, si hay).
      const pay = m.parts.filter((x) => x.dueDate <= part.dueDate).reduce((a, x) => a + x.restUsd, 0);
      out.push({
        userId: user,
        groupId: p.groupId,
        emoji: days <= 1 ? "⏰" : "🛍️",
        title: `Tu ${cuotaName(part.n).replace("la ", "")} de «${p.store}»: ${dueLabel(days)}`,
        body: `${fmt(pay, "USD")} (≈ ${fmt(Math.round(pay * p.bcvUsd), "VES")} a BCV de hoy) para ${holder?.name ?? "quien tiene el Cashea"}. Toca para pagarla 🙏`,
        url: holder?.userId ? `/pagar?a=${holder.userId}&s=${p.groupId}` : `/salidas/${p.groupId}`,
      });
    }
  }
  return out;
}
