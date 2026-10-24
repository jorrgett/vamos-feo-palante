import { NextResponse } from "next/server";
import { and, eq, gt, inArray, isNull, isNotNull, lt, lte, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { addDays, todayVE } from "@/lib/dates";
import { notify, type NotifyInput } from "@/lib/notify";
import { getRates } from "@/lib/rates";
import { vesPerUsd, type RateSourceId } from "@/lib/rates-shared";
import { casheaReminders, dailyReminders, type CasheaReminderPlan, type ReminderSalida } from "@/lib/debt-reminders";

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Cada mañana, a cada pana con deudas en salidas abiertas le llega UN aviso con lo que le falta pagar
 * (y a quien cobra, los pagos que tiene por confirmar). El del día anterior se borra para que no se acumulen.
 */
async function debtReminders(db: Db, rates: Awaited<ReturnType<typeof getRates>>) {
  const startOfDay = new Date(`${todayVE()}T00:00:00-04:00`);
  const open = await db.select({ id: schema.groups.id, rateSource: schema.groups.rateSource }).from(schema.groups).where(isNull(schema.groups.closedAt));
  if (open.length === 0) return 0;
  const ids = open.map((g) => g.id);
  const [expenses, members, settlements, plans] = await Promise.all([
    db.query.expenses.findMany({
      // Las salidas recién anotadas (menos de 6 h) ya tuvieron su aviso: esas esperan a mañana.
      where: and(inArray(schema.expenses.groupId, ids), isNull(schema.expenses.deletedAt), lt(schema.expenses.createdAt, new Date(Date.now() - 6 * 3_600_000))),
      with: { payers: true, shares: true },
    }),
    db.select().from(schema.members).where(inArray(schema.members.groupId, ids)),
    db
      .select()
      .from(schema.settlements)
      .where(and(inArray(schema.settlements.groupId, ids), isNull(schema.settlements.deletedAt))),
    db.query.casheaPlans.findMany({ where: and(inArray(schema.casheaPlans.groupId, ids), eq(schema.casheaPlans.mode, "espejo")), with: { cuotas: true } }),
  ]);
  const salidas: ReminderSalida[] = expenses.map((e) => {
    const p = plans.find((x) => x.expenseId === e.id);
    return {
    id: e.groupId,
    title: e.title,
    vesPerUsd: vesPerUsd(rates, (open.find((g) => g.id === e.groupId)?.rateSource ?? "bcv") as RateSourceId),
    expense: { payers: e.payers, shares: e.shares },
    settlements: settlements.filter((s) => s.expenseId === e.id),
    members: members.filter((m) => m.groupId === e.groupId),
      cashea: p ? { memberId: p.memberId, mode: p.mode, totalUsd: p.totalUsd, installments: p.installments, rows: p.cuotas } : null,
    };
  });
  const reminders = dailyReminders(salidas, todayVE());
  if (reminders.length === 0) return 0;

  // Si el cron corre dos veces el mismo día, no se repite.
  const users = reminders.map((r) => r.userId);
  const already = await db
    .select({ userId: schema.notifications.userId })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.kind, "diario"), inArray(schema.notifications.userId, users), gte(schema.notifications.createdAt, startOfDay)));
  const done = new Set(already.map((a) => a.userId));
  const fresh = reminders.filter((r) => !done.has(r.userId));
  if (fresh.length === 0) return 0;
  await db
    .delete(schema.notifications)
    .where(and(eq(schema.notifications.kind, "diario"), inArray(schema.notifications.userId, fresh.map((r) => r.userId)), lt(schema.notifications.createdAt, startOfDay)));
  return notify(
    fresh.map((r) => ({ ...r, kind: "diario" as const })),
    null,
    { wait: true },
  );
}

/**
 * Cuotas de Cashea que se acercan: al dueño, sus cuotas; a los panas (modo espejo), su parte, en cuenta
 * regresiva. Si el cron corre dos veces el mismo día, no repite el mismo aviso.
 */
async function cuotaReminders(db: Db, rates: Awaited<ReturnType<typeof getRates>>, today: string): Promise<NotifyInput[]> {
  const near = await db
    .selectDistinct({ planId: schema.casheaInstallments.planId })
    .from(schema.casheaInstallments)
    .where(and(gt(schema.casheaInstallments.n, 0), gte(schema.casheaInstallments.dueDate, addDays(today, -2)), lte(schema.casheaInstallments.dueDate, addDays(today, 3))));
  if (near.length === 0) return [];
  const plans = await db.query.casheaPlans.findMany({
    where: inArray(
      schema.casheaPlans.id,
      near.map((n) => n.planId),
    ),
    with: { cuotas: true },
  });
  const groupIds = [...new Set(plans.map((p) => p.groupId))];
  const expenseIds = plans.map((p) => p.expenseId).filter((x): x is string => !!x);
  const [groups, members, expenses, settlements] = await Promise.all([
    db.select({ id: schema.groups.id, closedAt: schema.groups.closedAt }).from(schema.groups).where(inArray(schema.groups.id, groupIds)),
    db.select().from(schema.members).where(inArray(schema.members.groupId, groupIds)),
    expenseIds.length
      ? db.query.expenses.findMany({ where: and(inArray(schema.expenses.id, expenseIds), isNull(schema.expenses.deletedAt)), with: { payers: true, shares: true } })
      : [],
    expenseIds.length
      ? db
          .select()
          .from(schema.settlements)
          .where(and(inArray(schema.settlements.expenseId, expenseIds), isNull(schema.settlements.deletedAt)))
      : [],
  ]);
  const input: CasheaReminderPlan[] = plans.flatMap((p) => {
    const e = expenses.find((x) => x.id === p.expenseId) ?? null;
    if (p.expenseId && !e) return []; // cuenta borrada
    return [
      {
        groupId: p.groupId,
        store: p.store ?? e?.title ?? "Cashea",
        closed: !!groups.find((g) => g.id === p.groupId)?.closedAt,
        plan: { memberId: p.memberId, mode: p.mode, totalUsd: p.totalUsd, installments: p.installments, rows: p.cuotas },
        expense: e && { payers: e.payers, shares: e.shares },
        settlements: settlements.filter((s) => s.expenseId === p.expenseId),
        members: members.filter((m) => m.groupId === p.groupId),
        bcvUsd: rates.bcvUsd,
      },
    ];
  });
  const items = casheaReminders(input, today);
  if (items.length === 0) return [];
  const sent = await db
    .select({ userId: schema.notifications.userId, title: schema.notifications.title })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.kind, "cashea"),
        inArray(
          schema.notifications.userId,
          items.map((i) => i.userId),
        ),
        gte(schema.notifications.createdAt, new Date(`${today}T00:00:00-04:00`)),
      ),
    );
  return items.filter((i) => !sent.some((x) => x.userId === i.userId && x.title === i.title.slice(0, 140))).map((i) => ({ ...i, kind: "cashea" as const }));
}

export const maxDuration = 60;

// Avisos diarios: deudas pendientes de las salidas abiertas y cuotas de Cashea (a 3 y 2 días, mañana, hoy y el último día de gracia).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  // Limpieza: los avisos que ya se vieron hace más de 30 días se borran solos (para que no se acumulen).
  await db
    .delete(schema.notifications)
    .where(and(isNotNull(schema.notifications.readAt), lt(schema.notifications.readAt, new Date(Date.now() - 30 * 86_400_000))));
  const rates = await getRates();
  const deudas = await debtReminders(db, rates);
  const today = todayVE();
  const items = await cuotaReminders(db, rates, today);
  const avisos = await notify(items, null, { wait: true });
  return NextResponse.json({ deudas, cuotas: avisos });
}
