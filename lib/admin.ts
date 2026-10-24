import "server-only";
import { desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "./auth";
import { isAdmin } from "./community";
import { auditLedger } from "./audit";
import { getLedgerAs, type Ledger } from "./data";
import { getDb, schema } from "./db";
import { checklistRows } from "./salida-view";
import { paidProgress } from "./share-status";
import { categoryOf } from "./constants";
import { todayVE, VE_TZ, ymdOf } from "./dates";
import type { ProofAi } from "./db/schema";

// Todo lo del panel del administrador (solo se usa después de revisar que es el administrador).

// ── Consumo de IA ─────────────────────────────────────────────────────────

type Totals = { calls: number; ok: number; costMicros: number; inputTokens: number; outputTokens: number };
const emptyTotals = (): Totals => ({ calls: 0, ok: 0, costMicros: 0, inputTokens: 0, outputTokens: 0 });

export type AiUsageView = {
  periods: { label: string; t: Totals }[];
  byUser: { userId: string | null; name: string; avatar: string; color: string; facturas: number; comprobantes: number; fallos: number; costMicros: number; last: Date }[];
  recent: { id: number; at: Date; name: string; task: string; model: string; inputTokens: number; outputTokens: number; costMicros: number; ok: boolean; error: string | null; ms: number }[];
};

export async function aiUsageOverview(): Promise<AiUsageView> {
  const db = await getDb();
  const rows = await db
    .select({ u: schema.aiUsage, name: schema.users.name, avatar: schema.users.avatar, color: schema.users.color })
    .from(schema.aiUsage)
    .leftJoin(schema.users, eq(schema.users.id, schema.aiUsage.userId))
    .orderBy(desc(schema.aiUsage.createdAt))
    .limit(5000);

  const now = Date.now();
  // Días y meses en hora de Caracas (UTC−4, sin horario de verano).
  const ymd = todayVE();
  const today = new Date(`${ymd}T00:00:00-04:00`).getTime();
  const month = new Date(`${ymd.slice(0, 7)}-01T00:00:00-04:00`).getTime();
  const periods = [
    { label: "Hoy", from: today },
    { label: "7 días", from: now - 7 * 86_400_000 },
    { label: "Este mes", from: month },
    { label: "Desde siempre", from: 0 },
  ].map((p) => ({ label: p.label, from: p.from, t: emptyTotals() }));

  const byUser = new Map<string, AiUsageView["byUser"][number]>();
  for (const { u, name, avatar, color } of rows) {
    const at = u.createdAt.getTime();
    for (const p of periods)
      if (at >= p.from) {
        p.t.calls++;
        if (u.ok) p.t.ok++;
        p.t.costMicros += u.costMicros;
        p.t.inputTokens += u.inputTokens;
        p.t.outputTokens += u.outputTokens;
      }
    const key = u.userId ?? "anon";
    const cur = byUser.get(key) ?? {
      userId: u.userId,
      name: name ?? "Cuenta borrada",
      avatar: avatar ?? "👤",
      color: color ?? "#9CA3AF",
      facturas: 0,
      comprobantes: 0,
      fallos: 0,
      costMicros: 0,
      last: u.createdAt,
    };
    if (u.task === "factura") cur.facturas++;
    else cur.comprobantes++;
    if (!u.ok) cur.fallos++;
    cur.costMicros += u.costMicros;
    if (u.createdAt > cur.last) cur.last = u.createdAt;
    byUser.set(key, cur);
  }

  return {
    periods: periods.map(({ label, t }) => ({ label, t })),
    byUser: [...byUser.values()].sort((a, b) => b.costMicros - a.costMicros),
    recent: rows.slice(0, 40).map(({ u, name }) => ({
      id: u.id,
      at: u.createdAt,
      name: name ?? "Cuenta borrada",
      task: u.task,
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      costMicros: u.costMicros,
      ok: u.ok,
      error: u.error,
      ms: u.ms,
    })),
  };
}

// ── Cuadre de una salida (lógica pura en ./audit para poder probarla) ──────────

export { auditLedger, type Audit, type AuditRow } from "./audit";

// ── Todas las salidas ────────────────────────────────────────────────────────

export type AdminSalida = {
  id: string;
  title: string;
  emoji: string;
  date: string;
  totalUsd: number;
  currency: string;
  amount: number;
  closed: boolean;
  createdBy: string | null;
  people: { name: string; avatar: string; color: string }[];
  paid: number;
  debtors: number;
  pendingConfirm: number;
  pendingUsd: number;
  ok: boolean;
  settled: boolean;
  issues: string[];
};

export async function allSalidas(): Promise<AdminSalida[]> {
  const db = await getDb();
  const groups = await db
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .innerJoin(schema.expenses, eq(schema.expenses.groupId, schema.groups.id))
    .where(isNull(schema.expenses.deletedAt))
    .orderBy(desc(schema.expenses.spentAt))
    .limit(300);
  const ledgers = (await Promise.all([...new Set(groups.map((g) => g.id))].map((id) => getLedgerAs(id)))).filter((l): l is Ledger => !!l && !!l.expenses[0]);
  return ledgers.map((ledger) => {
    const e = ledger.expenses[0];
    const audit = auditLedger(ledger);
    const progress = paidProgress(checklistRows(ledger));
    const creator = ledger.members.find((m) => m.userId && m.userId === ledger.group.createdBy);
    return {
      id: ledger.group.id,
      title: e.title,
      emoji: categoryOf(e.category).emoji,
      date: ymdOf(e.spentAt),
      totalUsd: e.amountUsd,
      currency: e.currency,
      amount: e.amount,
      closed: !!ledger.group.closedAt,
      createdBy: creator?.name ?? null,
      people: ledger.members.filter((m) => e.shares.some((s) => s.memberId === m.id)).map((m) => ({ name: m.name, avatar: m.avatar, color: m.color })),
      paid: progress.paid,
      debtors: progress.debtors,
      pendingConfirm: ledger.settlements.filter((s) => !s.confirmedAt).length,
      pendingUsd: audit.rows.reduce((a, r) => a + Math.max(0, -r.balance), 0),
      ok: audit.ok,
      settled: audit.settled,
      issues: audit.issues,
    };
  });
}

/** Cuántos usos de IA tuvo cada persona (para su ficha). */
export async function aiUsageOf(userId: string) {
  const db = await getDb();
  const [r] = await db
    .select({ calls: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(${schema.aiUsage.costMicros}),0)::int` })
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.userId, userId));
  const [m] = await db
    .select({ calls: sql<number>`count(*)::int` })
    .from(schema.aiUsage)
    .where(sql`${schema.aiUsage.userId} = ${userId} and ${schema.aiUsage.createdAt} >= ${new Date(Date.now() - 30 * 86_400_000)}`);
  return { calls: r?.calls ?? 0, costMicros: r?.cost ?? 0, last30: m?.calls ?? 0 };
}

/** Costo en dólares: con 4 decimales mientras sea menos de $1 (cada uso cuesta centavos). */
export const fmtCost = (micros: number) => {
  const d = micros < 1_000_000 ? 4 : 2;
  return `$${(micros / 1_000_000).toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

/** La hora del servidor al pintar la página (para los «hace 5 min»). */
export const serverNow = () => Date.now();

/** Fecha y hora en Caracas, corta («19 oct, 3:05 p. m.»). */
const whenFmt = new Intl.DateTimeFormat("es-VE", { timeZone: VE_TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const fmtWhen = (d: Date) => whenFmt.format(d).replace(".", "");

/** Lo que leyó la IA de cada comprobante (el administrador no ve la foto, solo si cuadró). */
export async function proofAiFor(settlementIds: string[]): Promise<Map<string, ProofAi | null>> {
  const out = new Map<string, ProofAi | null>();
  if (settlementIds.length === 0) return out;
  const db = await getDb();
  const rows = await db
    .select({ settlementId: schema.paymentProofs.settlementId, ai: schema.paymentProofs.ai })
    .from(schema.paymentProofs)
    .where(inArray(schema.paymentProofs.settlementId, settlementIds.slice(0, 500)));
  for (const r of rows) if (r.settlementId) out.set(r.settlementId, r.ai);
  return out;
}

/** Datos básicos de una persona (para su ficha en el panel). */
export async function userBasics(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const db = await getDb();
  const [u] = await db
    .select({ id: schema.users.id, name: schema.users.name, avatar: schema.users.avatar, color: schema.users.color, createdAt: schema.users.createdAt, lastSeenAt: schema.users.lastSeenAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return u ?? null;
}

/** Solo deja pasar al administrador (a los demás les sale "no existe"). */
export async function requireAdmin() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) notFound();
  return user;
}
