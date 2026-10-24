import "server-only";
import { and, desc, eq, exists, inArray, isNull } from "drizzle-orm";
import { cache } from "react";
import { computeBalances, pairwiseDebts, simplifyDebts, type Transfer } from "./balances";
import { getDb, schema } from "./db";

export type Member = typeof schema.members.$inferSelect;
export type Group = typeof schema.groups.$inferSelect;
export type ExpenseRow = typeof schema.expenses.$inferSelect & {
  payers: (typeof schema.expensePayers.$inferSelect)[];
  shares: (typeof schema.expenseShares.$inferSelect)[];
};
export type SettlementRow = typeof schema.settlements.$inferSelect;
export type CasheaPlanRow = typeof schema.casheaPlans.$inferSelect & {
  cuotas: (typeof schema.casheaInstallments.$inferSelect)[];
};

export type Ledger = {
  group: Group;
  members: Member[];
  me: Member;
  expenses: ExpenseRow[];
  settlements: SettlementRow[];
  cashea: CasheaPlanRow[];
};

export type LedgerSummary = {
  balances: Record<string, number>;
  transfers: Transfer[];
  pairwise: Transfer[];
  totalSpentUsd: number;
  paidBy: Record<string, number>;
  consumedBy: Record<string, number>;
};

/** Los grupos donde el usuario es miembro activo. */
/** Mis salidas (cada salida es un grupo con su cuenta; los grupos viejos sin cuenta no cuentan). */
export const myMemberships = cache(async (userId: string) => {
  const db = await getDb();
  const hasExpense = db.select({ id: schema.expenses.id }).from(schema.expenses).where(and(eq(schema.expenses.groupId, schema.groups.id), isNull(schema.expenses.deletedAt)));
  return db
    .select({ member: schema.members, group: schema.groups })
    .from(schema.members)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.members.groupId))
    .where(and(eq(schema.members.userId, userId), isNull(schema.members.leftAt), exists(hasExpense)))
    .orderBy(desc(schema.groups.createdAt));
});

/** Devuelve el grupo sólo si el usuario pertenece a él (autorización centralizada). */
export const getGroupAccess = cache(async (groupId: string, userId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(groupId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ member: schema.members, group: schema.groups })
    .from(schema.members)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.members.groupId))
    .where(and(eq(schema.members.groupId, groupId), eq(schema.members.userId, userId), isNull(schema.members.leftAt)))
    .limit(1);
  return row ?? null;
});

export const getLedger = cache(async (groupId: string, userId: string): Promise<Ledger | null> => {
  const access = await getGroupAccess(groupId, userId);
  if (!access) return null;
  return loadLedger(access.group, access.member);
});

/**
 * Solo para el administrador: la salida vista desde cualquier participante (`memberId`),
 * aunque el administrador no haya ido. Sin `memberId`, desde el primero que tiene cuenta.
 */
export const getLedgerAs = cache(async (groupId: string, memberId?: string): Promise<Ledger | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(groupId)) return null;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
  if (!group) return null;
  const members = await db.select().from(schema.members).where(eq(schema.members.groupId, groupId)).orderBy(schema.members.createdAt);
  const me = members.find((m) => m.id === memberId) ?? members.find((m) => m.userId) ?? members[0];
  if (!me) return null;
  return loadLedger(group, me);
});

async function loadLedger(group: Group, me: Member): Promise<Ledger> {
  const groupId = group.id;
  const db = await getDb();
  const [members, expenses, settlements, cashea] = await Promise.all([
    db.select().from(schema.members).where(eq(schema.members.groupId, groupId)).orderBy(schema.members.createdAt),
    db.query.expenses.findMany({
      where: and(eq(schema.expenses.groupId, groupId), isNull(schema.expenses.deletedAt)),
      with: { payers: true, shares: true },
      orderBy: [desc(schema.expenses.spentAt), desc(schema.expenses.createdAt)],
    }),
    db
      .select()
      .from(schema.settlements)
      .where(and(eq(schema.settlements.groupId, groupId), isNull(schema.settlements.deletedAt)))
      .orderBy(desc(schema.settlements.paidAt)),
    db.query.casheaPlans.findMany({
      where: eq(schema.casheaPlans.groupId, groupId),
      with: { cuotas: { orderBy: (i, { asc }) => [asc(i.n)] } },
      orderBy: (p, { desc }) => [desc(p.purchaseDate)],
    }),
  ]);
  const liveExpenseIds = new Set(expenses.map((e) => e.id));
  return {
    group,
    me,
    members,
    expenses,
    settlements,
    cashea: cashea.filter((p) => !p.expenseId || liveExpenseIds.has(p.expenseId)),
  };
}

export function summarize(ledger: Pick<Ledger, "members" | "expenses" | "settlements">): LedgerSummary {
  const ids = ledger.members.map((m) => m.id);
  const lexp = ledger.expenses.map((e) => ({
    payers: e.payers.map((p) => ({ memberId: p.memberId, amountUsd: p.amountUsd })),
    shares: e.shares.map((s) => ({ memberId: s.memberId, amountUsd: s.amountUsd })),
  }));
  const lset = ledger.settlements.map((s) => ({ fromMember: s.fromMember, toMember: s.toMember, amountUsd: s.amountUsd }));
  const balances = computeBalances(ids, lexp, lset);
  const paidBy: Record<string, number> = {};
  const consumedBy: Record<string, number> = {};
  for (const e of ledger.expenses) {
    for (const p of e.payers) paidBy[p.memberId] = (paidBy[p.memberId] ?? 0) + p.amountUsd;
    for (const s of e.shares) consumedBy[s.memberId] = (consumedBy[s.memberId] ?? 0) + s.amountUsd;
  }
  return {
    balances,
    transfers: simplifyDebts(balances, 0),
    pairwise: pairwiseDebts(lexp, lset),
    totalSpentUsd: ledger.expenses.reduce((a, e) => a + e.amountUsd, 0),
    paidBy,
    consumedBy,
  };
}

/** Todo lo necesario para el dashboard: cada grupo con su libro y resumen. */
export const getEverything = cache(async (userId: string) => {
  const memberships = await myMemberships(userId);
  const ledgers = await Promise.all(memberships.map((m) => getLedger(m.group.id, userId)));
  return ledgers
    .filter((l): l is Ledger => !!l)
    .map((ledger) => ({ ledger, summary: summarize(ledger) }));
});

export async function membersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db.select().from(schema.members).where(inArray(schema.members.id, ids));
}

/** Datos de pago (pago móvil, Zelle…) que los panas con cuenta decidieron compartir. */
export async function payInfoByMember(members: Member[]): Promise<Record<string, schema.PayInfo>> {
  const userIds = [...new Set(members.map((m) => m.userId).filter((x): x is string => !!x))];
  if (userIds.length === 0) return {};
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, payInfo: schema.users.payInfo })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));
  const byUser = new Map(rows.map((r) => [r.id, r.payInfo]));
  return Object.fromEntries(members.filter((m) => m.userId && byUser.get(m.userId)).map((m) => [m.id, byUser.get(m.userId!)!]));
}
