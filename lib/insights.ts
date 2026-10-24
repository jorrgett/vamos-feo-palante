import "server-only";
import type { Ledger, LedgerSummary } from "./data";
import { categoriesOf, categoryLabel, categoryOf } from "./constants";
import { allocate } from "./money";
import { diffDays, monthKey, todayVE, ymdOf, addDays } from "./dates";
import { dueFraction, mirrorForDebtor } from "./cashea";

export type Bundle = { ledger: Ledger; summary: LedgerSummary };

export type MyDebt = {
  groupId: string;
  groupName: string;
  groupEmoji: string;
  otherId: string;
  otherName: string;
  otherAvatar: string;
  otherColor: string;
  otherHasAccount: boolean;
  /** Positivo: me deben. Negativo: debo. */
  amount: number;
};

export function myDebts(bundles: Bundle[]): MyDebt[] {
  const out: MyDebt[] = [];
  for (const { ledger, summary } of bundles) {
    const me = ledger.me.id;
    for (const t of summary.transfers) {
      if (t.from !== me && t.to !== me) continue;
      const otherId = t.from === me ? t.to : t.from;
      const other = ledger.members.find((m) => m.id === otherId);
      if (!other) continue;
      out.push({
        groupId: ledger.group.id,
        groupName: ledger.group.name,
        groupEmoji: ledger.group.emoji,
        otherId,
        otherName: other.name,
        otherAvatar: other.avatar,
        otherColor: other.color,
        otherHasAccount: !!other.userId,
        amount: t.to === me ? t.amount : -t.amount,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

export function totals(bundles: Bundle[]) {
  let owedToMe = 0;
  let iOwe = 0;
  for (const { ledger, summary } of bundles) {
    const b = summary.balances[ledger.me.id] ?? 0;
    if (b > 0) owedToMe += b;
    else iOwe += -b;
  }
  return { owedToMe, iOwe, net: owedToMe - iOwe };
}

export type ActivityItem = {
  id: string;
  kind: "expense" | "settlement";
  groupId: string;
  groupName: string;
  groupEmoji: string;
  date: string;
  createdAt: string;
  title: string;
  emoji: string;
  amountUsd: number;
  currency: string;
  amount: number;
  /** Cómo me afecta: + me deben más / − debo más. */
  myImpact: number;
  who: { name: string; avatar: string; color: string };
  whoTo?: { name: string; avatar: string; color: string };
  method?: string;
  /** Nombre de la(s) categoría(s): «Comida + Rumba y tragos». */
  category?: string;
  hasCashea?: boolean;
};

export function activity(bundles: Bundle[], limit = 50): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const { ledger } of bundles) {
    const me = ledger.me.id;
    const byId = new Map(ledger.members.map((m) => [m.id, m]));
    const person = (id: string) => {
      const m = byId.get(id);
      return { name: m?.name ?? "?", avatar: m?.avatar ?? "🙂", color: m?.color ?? "#999" };
    };
    const casheaExpenses = new Set(ledger.cashea.map((c) => c.expenseId));
    for (const e of ledger.expenses) {
      const paid = e.payers.filter((p) => p.memberId === me).reduce((a, p) => a + p.amountUsd, 0);
      const owed = e.shares.filter((s) => s.memberId === me).reduce((a, s) => a + s.amountUsd, 0);
      const mainPayer = [...e.payers].sort((a, b) => b.amountUsd - a.amountUsd)[0];
      items.push({
        id: e.id,
        kind: "expense",
        groupId: ledger.group.id,
        groupName: ledger.group.name,
        groupEmoji: ledger.group.emoji,
        date: ymdOf(e.spentAt),
        createdAt: e.createdAt.toISOString(),
        title: e.title,
        emoji: categoryOf(e.category).emoji,
        amountUsd: e.amountUsd,
        currency: e.currency,
        amount: e.amount,
        myImpact: paid - owed,
        who: person(mainPayer?.memberId ?? ""),
        category: categoryLabel(e),
        hasCashea: casheaExpenses.has(e.id),
      });
    }
    for (const s of ledger.settlements) {
      items.push({
        id: s.id,
        kind: "settlement",
        groupId: ledger.group.id,
        groupName: ledger.group.name,
        groupEmoji: ledger.group.emoji,
        date: ymdOf(s.paidAt),
        createdAt: s.createdAt.toISOString(),
        title: "Pago",
        emoji: "🤝",
        amountUsd: s.amountUsd,
        currency: s.currency,
        amount: s.amount,
        myImpact: s.fromMember === me ? s.amountUsd : s.toMember === me ? -s.amountUsd : 0,
        who: person(s.fromMember),
        whoTo: person(s.toMember),
        method: s.method,
      });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Lo que consumí yo por mes (mi parte de cada gasto), últimos `months` meses. */
export function monthlySpending(bundles: Bundle[], months = 6) {
  const today = todayVE();
  const keys: string[] = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  const mine: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const group: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const { ledger } of bundles) {
    for (const e of ledger.expenses) {
      const k = monthKey(ymdOf(e.spentAt));
      if (!(k in mine)) continue;
      group[k] += e.amountUsd;
      mine[k] += e.shares.filter((s) => s.memberId === ledger.me.id).reduce((a, s) => a + s.amountUsd, 0);
    }
  }
  return keys.map((k) => ({ month: k, mine: mine[k], group: group[k] }));
}

export function categoryBreakdown(bundles: Bundle[], sinceYmd?: string) {
  const acc = new Map<string, number>();
  for (const { ledger } of bundles) {
    for (const e of ledger.expenses) {
      if (sinceYmd && ymdOf(e.spentAt) < sinceYmd) continue;
      const mine = e.shares.filter((s) => s.memberId === ledger.me.id).reduce((a, s) => a + s.amountUsd, 0);
      if (mine <= 0) continue;
      // Si la salida tiene varias categorías, lo mío se reparte por igual entre ellas.
      const cats = categoriesOf(e);
      const parts = allocate(mine, cats.map(() => 1));
      cats.forEach((c, i) => acc.set(c.id, (acc.get(c.id) ?? 0) + parts[i]));
    }
  }
  return [...acc.entries()]
    .map(([id, usd]) => ({ ...categoryOf(id), usd }))
    .sort((a, b) => b.usd - a.usd);
}

export type CasheaDue = {
  planId: string;
  groupId: string;
  groupName: string;
  store: string;
  holderId: string;
  holderName: string;
  holderAvatar: string;
  holderColor: string;
  iAmHolder: boolean;
  installmentId: string;
  n: number;
  installments: number;
  dueDate: string;
  amountUsd: number;
  /** Mi parte de esa cuota cuando no soy el titular (modo espejo). */
  myPartUsd: number;
  paid: boolean;
};

/** Próximas cuotas: las de mis órdenes y mi parte de las órdenes de los panas. */
export function casheaDues(bundles: Bundle[], horizonDays = 60): CasheaDue[] {
  const today = todayVE();
  const until = addDays(today, horizonDays);
  const out: CasheaDue[] = [];
  for (const { ledger } of bundles) {
    const me = ledger.me.id;
    for (const plan of ledger.cashea) {
      const holder = ledger.members.find((m) => m.id === plan.memberId);
      const expense = ledger.expenses.find((e) => e.id === plan.expenseId);
      const myShare = expense?.shares.find((s) => s.memberId === me)?.amountUsd ?? 0;
      const myFraction = expense && expense.amountUsd ? (myShare * plan.totalUsd) / expense.amountUsd / plan.totalUsd : 0;
      const iAmHolder = plan.memberId === me;
      if (!iAmHolder && (plan.mode !== "espejo" || myShare === 0)) continue;
      // Si no soy el dueño, cuenta lo que yo le debo de cada cuota (ya descontado lo que le pagué).
      const linked = ledger.settlements.filter((s) => s.expenseId === plan.expenseId);
      const mine =
        !iAmHolder && expense
          ? mirrorForDebtor({ memberId: plan.memberId, mode: plan.mode, totalUsd: plan.totalUsd, installments: plan.installments, rows: plan.cuotas }, expense, linked, me)
          : null;
      for (const inst of plan.cuotas) {
        if (inst.dueDate > until) continue;
        if (iAmHolder ? inst.n === 0 || inst.paidAt : !mine?.parts.find((p) => p.n === inst.n)?.restUsd) continue;
        out.push({
          planId: plan.id,
          groupId: ledger.group.id,
          groupName: ledger.group.name,
          store: plan.store ?? expense?.title ?? "Orden Cashea",
          holderId: plan.memberId,
          holderName: holder?.name ?? "?",
          holderAvatar: holder?.avatar ?? "🙂",
          holderColor: holder?.color ?? "#999",
          iAmHolder,
          installmentId: inst.id,
          n: inst.n,
          installments: plan.installments,
          dueDate: inst.dueDate,
          amountUsd: inst.amountUsd,
          myPartUsd: mine?.parts.find((p) => p.n === inst.n)?.restUsd ?? Math.round(inst.amountUsd * myFraction),
          paid: !!inst.paidAt,
        });
      }
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** De lo que `debtor` le debe a `holder` por planes en espejo, cuánto todavía no vence. */
export function casheaNotYetDue(ledger: Ledger, debtor: string, holder: string): number {
  let pending = 0;
  for (const plan of ledger.cashea) {
    if (plan.mode !== "espejo" || plan.memberId !== holder) continue;
    const expense = ledger.expenses.find((e) => e.id === plan.expenseId);
    const share = expense?.shares.find((s) => s.memberId === debtor)?.amountUsd ?? 0;
    if (!expense || !share) continue;
    const linked = (share * plan.totalUsd) / expense.amountUsd;
    pending += Math.round(linked * (1 - dueFraction(plan.cuotas)));
  }
  return pending;
}

export function daysUntil(ymd: string) {
  return diffDays(ymd, todayVE());
}

export function funStats(bundles: Bundle[]) {
  const since = addDays(todayVE(), -30);
  let outings = 0;
  let myLast30 = 0;
  const payerCount = new Map<string, { name: string; avatar: string; color: string; usd: number }>();
  for (const { ledger } of bundles) {
    for (const e of ledger.expenses) {
      if (ymdOf(e.spentAt) < since) continue;
      outings++;
      myLast30 += e.shares.filter((s) => s.memberId === ledger.me.id).reduce((a, s) => a + s.amountUsd, 0);
      for (const p of e.payers) {
        const m = ledger.members.find((x) => x.id === p.memberId);
        if (!m) continue;
        const key = m.userId ?? m.id;
        const cur = payerCount.get(key) ?? { name: m.name, avatar: m.avatar, color: m.color, usd: 0 };
        cur.usd += p.amountUsd;
        payerCount.set(key, cur);
      }
    }
  }
  const topPayer = [...payerCount.values()].sort((a, b) => b.usd - a.usd)[0] ?? null;
  return { outings, myLast30, avgPerOuting: outings ? Math.round(myLast30 / outings) : 0, topPayer };
}
