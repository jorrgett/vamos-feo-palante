"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AiError, aiEnabled, imageFromForm, spendAiQuota } from "@/lib/ai";
import { readProof } from "@/lib/ai-tasks";
import { casheaSchedule } from "@/lib/cashea";
import { CATEGORIES, categoryOf, PAY_METHODS, payMethodOf } from "@/lib/constants";
import { noonVE } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import type { ProofAi } from "@/lib/db/schema";
import { getEverything, getLedger, type ExpenseRow, type Ledger } from "@/lib/data";
import { inviteCode } from "@/lib/ids";
import { allocate, CURRENCIES, fmt, toUsdCents, type Currency } from "@/lib/money";
import { notify, type NotifyInput } from "@/lib/notify";
import { getRates } from "@/lib/rates";
import { vesPerUsd, type RateSourceId } from "@/lib/rates-shared";
import { debtSplit, remainingTo, shareStatuses } from "@/lib/share-status";
import { computeSplit, sharesToUsd, SplitError, type SplitInput } from "@/lib/split";

const cents = z.number().int().min(0).max(1e13);
const key = z.string().uuid();

const salidaSchema = z.object({
  salidaId: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Ponle un nombre a la salida.").max(80),
  category: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]),
  /** Otras categorías además de la principal. */
  extraCategories: z.array(z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]])).max(CATEGORIES.length).optional(),
  place: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Quiénes fueron: ids de usuario (o de miembro, para un «Ex pana» que ya estaba). */
  participants: z.array(key).min(2, "Una salida es de al menos 2 panas.").max(60),
  currency: z.enum(CURRENCIES),
  fx: z.object({
    source: z.enum(["bcv", "usdt", "eur", "custom"]),
    vesPerUsd: z.number().positive().max(1e9),
    vesPerEur: z.number().positive().max(1e9).nullable().optional(),
    vesPerUsdt: z.number().positive().max(1e9).nullable().optional(),
    date: z.string().optional(),
  }),
  split: z.object({
    mode: z.enum(["equal", "exact", "percent", "shares", "items"]),
    base: cents.optional(),
    members: z.array(key).optional(),
    amounts: z.record(z.string(), cents).optional(),
    percents: z.record(z.string(), z.number().min(0).max(100)).optional(),
    weights: z.record(z.string(), z.number().min(0).max(1000)).optional(),
    items: z
      .array(z.object({ id: z.string().max(40), name: z.string().max(80), price: cents, qty: z.number().min(0).max(1000), members: z.array(key) }))
      .max(200)
      .optional(),
    extras: z
      .array(z.object({ id: z.string().max(40), label: z.string().max(40), kind: z.enum(["percent", "fixed"]), value: z.number().min(0).max(1e13) }))
      .max(10)
      .optional(),
  }),
  payers: z
    .array(z.object({ memberId: key, currency: z.enum(CURRENCIES), amount: cents, method: z.enum(PAY_METHODS.map((m) => m.id) as [string, ...string[]]) }))
    .min(1, "Indica quién puso la plata.")
    .max(30),
  cashea: z
    .object({
      level: z.number().int().min(1).max(10),
      initialPct: z.number().min(0).max(100),
      installments: z.number().int().min(0).max(24),
      intervalDays: z.number().int().min(1).max(60),
      discountPct: z.number().min(0).max(100).default(0),
      mode: z.enum(["espejo", "inmediato"]),
      store: z.string().trim().max(80).optional(),
      line: z.enum(["principal", "cotidiana", "promo2", "mas6", "mas9", "mas12"]).default("principal"),
      availableLineUsd: cents.nullable().optional(),
    })
    .optional(),
  paidMembers: z.array(key).max(60).optional(),
  unpaidMembers: z.array(key).max(60).optional(),
});

export type SalidaInput = z.input<typeof salidaSchema>;
export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

const eLikeOf = (e: ExpenseRow) => ({
  payers: e.payers.map((p) => ({ memberId: p.memberId, amountUsd: p.amountUsd })),
  shares: e.shares.map((s) => ({ memberId: s.memberId, amountUsd: s.amountUsd })),
});
const linkedOf = (ledger: Ledger, expenseId: string) => ledger.settlements.filter((s) => s.expenseId === expenseId);
const salidaUrl = (id: string) => `/salidas/${id}`;

/** Crea o edita una salida completa (participantes, cuenta, quién puso, quién ya pagó y Cashea). */
export async function saveSalida(input: SalidaInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = salidaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const db = await getDb();

  const ledger = d.salidaId ? await getLedger(d.salidaId, user.id) : null;
  if (d.salidaId && !ledger) return { ok: false, error: "No tienes acceso a esa salida." };
  const participants = [...new Set(d.participants)];
  if (!d.salidaId && !participants.includes(user.id)) return { ok: false, error: "Tú tienes que estar en la salida." };

  // Los participantes son usuarios registrados (o un «Ex pana» que ya estaba en la salida).
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, avatar: schema.users.avatar, color: schema.users.color })
    .from(schema.users)
    .where(inArray(schema.users.id, participants));
  const userById = new Map(users.map((u) => [u.id, u]));
  for (const p of participants) {
    if (!userById.has(p) && !ledger?.members.some((m) => m.id === p && !m.userId)) return { ok: false, error: "Hay alguien que ya no está registrado." };
  }

  let split;
  try {
    split = computeSplit(toSplitInput(d.split), d.split.extras ?? []);
  } catch (e) {
    return { ok: false, error: e instanceof SplitError ? e.message : "No pude calcular la división." };
  }
  const inSalida = new Set(participants);
  if ([...Object.keys(split.shares), ...d.payers.map((p) => p.memberId)].some((k) => !inSalida.has(k)))
    return { ok: false, error: "Solo pueden pagar o dividir los que están en la salida." };

  const fx = { vesPerUsd: d.fx.vesPerUsd, vesPerEur: d.fx.vesPerEur ?? null, vesPerUsdt: d.fx.vesPerUsdt ?? null };
  const totalUsd = toUsdCents(split.total, d.currency, fx);
  const sharesUsd = sharesToUsd(split.shares, totalUsd);
  const payers = d.payers.filter((p) => p.amount > 0);
  if (payers.length === 0) return { ok: false, error: "Indica cuánto puso cada quien." };
  const rawUsd = payers.map((p) => toUsdCents(p.amount, p.currency as Currency, fx));
  const paidUsd = rawUsd.reduce((a, b) => a + b, 0);
  if (Math.abs(paidUsd - totalUsd) > Math.max(3, Math.round(totalUsd * 0.005))) {
    const diff = paidUsd - totalUsd;
    return { ok: false, error: `Lo que pusieron no cuadra con el total: ${diff > 0 ? "sobran" : "faltan"} $${(Math.abs(diff) / 100).toFixed(2)}.` };
  }
  const payersUsd = allocate(totalUsd, rawUsd);
  const casheaPayers = payers.filter((p) => p.method === "cashea");
  if (casheaPayers.length > 1) return { ok: false, error: "Solo una persona puede pagar con Cashea por salida." };
  if (casheaPayers.length === 1 && !d.cashea) return { ok: false, error: "Faltan los datos del plan de Cashea." };

  const cat = categoryOf(d.category);
  const spentAt = noonVE(d.date);
  const rateSource = (d.fx.source === "custom" ? (ledger?.group.rateSource ?? "bcv") : d.fx.source) as RateSourceId;
  const previouslyPaid = new Map<number, { paidAt: Date; paidVes: number | null; paidRate: number | null }>();

  // Al editar no se puede sacar a alguien que ya tiene pagos anotados.
  if (ledger) {
    const leaving = ledger.members.filter((m) => !inSalida.has(m.userId ?? m.id) && !m.leftAt);
    const blocked = leaving.find((m) => ledger.settlements.some((s) => s.fromMember === m.id || s.toMember === m.id));
    if (blocked) return { ok: false, error: `${blocked.name} ya tiene pagos anotados en esta salida: desmárcalos antes de sacarlo.` };
  }

  const result = await db.transaction(async (tx) => {
    // 1 · La salida
    let salidaId = d.salidaId;
    const groupValues = { name: d.title, emoji: cat.emoji, color: cat.color, rateSource, description: d.place || null };
    if (salidaId) await tx.update(schema.groups).set(groupValues).where(eq(schema.groups.id, salidaId));
    else {
      const [g] = await tx
        .insert(schema.groups)
        .values({ ...groupValues, inviteCode: inviteCode(12), createdBy: user.id })
        .returning({ id: schema.groups.id });
      salidaId = g.id;
    }

    // 2 · Participantes → miembros
    const existing = salidaId ? await tx.select().from(schema.members).where(eq(schema.members.groupId, salidaId)) : [];
    const memberOf = new Map<string, string>(); // clave de persona → id de miembro
    for (const p of participants) {
      const u = userById.get(p);
      if (u) {
        const m = existing.find((x) => x.userId === u.id);
        if (m) {
          memberOf.set(p, m.id);
          if (m.leftAt) await tx.update(schema.members).set({ leftAt: null }).where(eq(schema.members.id, m.id));
        } else {
          const [nm] = await tx
            .insert(schema.members)
            .values({ groupId: salidaId!, userId: u.id, name: u.name, avatar: u.avatar, color: u.color, role: u.id === user.id ? "admin" : "member" })
            .returning({ id: schema.members.id });
          memberOf.set(p, nm.id);
        }
      } else memberOf.set(p, p); // «Ex pana» ya existente
    }
    const removed = existing.filter((m) => ![...memberOf.values()].includes(m.id));
    if (removed.length) await tx.delete(schema.members).where(inArray(schema.members.id, removed.map((m) => m.id)));
    const M = (k: string) => memberOf.get(k)!;

    // 3 · La cuenta (una por salida)
    const splitStored = {
      ...d.split,
      members: d.split.members?.map(M),
      amounts: d.split.amounts && Object.fromEntries(Object.entries(d.split.amounts).map(([k, v]) => [M(k), v])),
      percents: d.split.percents && Object.fromEntries(Object.entries(d.split.percents).map(([k, v]) => [M(k), v])),
      weights: d.split.weights && Object.fromEntries(Object.entries(d.split.weights).map(([k, v]) => [M(k), v])),
      items: d.split.items?.map((i) => ({ ...i, members: i.members.map(M) })),
    };
    const values = {
      groupId: salidaId!,
      title: d.title,
      category: d.category,
      extraCategories: [...new Set(d.extraCategories ?? [])].filter((c) => c !== d.category),
      place: d.place || null,
      notes: d.notes || null,
      spentAt,
      currency: d.currency,
      amount: split.total,
      amountUsd: totalUsd,
      fx: { ...fx, source: d.fx.source, date: d.fx.date ?? d.date },
      split: splitStored,
    };
    let expenseId = ledger?.expenses[0]?.id;
    if (expenseId) {
      await tx.update(schema.expenses).set({ ...values, updatedAt: new Date() }).where(eq(schema.expenses.id, expenseId));
      await tx.delete(schema.expensePayers).where(eq(schema.expensePayers.expenseId, expenseId));
      await tx.delete(schema.expenseShares).where(eq(schema.expenseShares.expenseId, expenseId));
      const oldPlans = await tx.select({ id: schema.casheaPlans.id }).from(schema.casheaPlans).where(eq(schema.casheaPlans.expenseId, expenseId));
      if (oldPlans.length) {
        const rows = await tx.select().from(schema.casheaInstallments).where(inArray(schema.casheaInstallments.planId, oldPlans.map((p) => p.id)));
        for (const r of rows) if (r.paidAt && r.n > 0) previouslyPaid.set(r.n, { paidAt: r.paidAt, paidVes: r.paidVes, paidRate: r.paidRate });
      }
      await tx.delete(schema.casheaPlans).where(eq(schema.casheaPlans.expenseId, expenseId));
    } else {
      const [row] = await tx.insert(schema.expenses).values({ ...values, createdBy: user.id }).returning({ id: schema.expenses.id });
      expenseId = row.id;
    }
    await tx.insert(schema.expensePayers).values(
      payers.map((p, i) => ({ expenseId: expenseId!, memberId: M(p.memberId), currency: p.currency, amount: p.amount, amountUsd: payersUsd[i], method: p.method })),
    );
    await tx.insert(schema.expenseShares).values(
      Object.keys(split.shares).map((k) => ({ expenseId: expenseId!, memberId: M(k), amount: split.shares[k], amountUsd: sharesUsd[k] })),
    );

    // 4 · Cashea
    if (casheaPayers.length === 1 && d.cashea) {
      const idx = payers.indexOf(casheaPayers[0]);
      const orderUsd = payersUsd[idx];
      const discountUsd = Math.round((orderUsd * d.cashea.discountPct) / 100);
      const sched = casheaSchedule({
        totalUsd: orderUsd,
        initialPct: d.cashea.initialPct,
        installments: d.cashea.installments,
        intervalDays: d.cashea.intervalDays,
        purchaseDate: d.date,
        discountUsd,
        availableLineUsd: d.cashea.availableLineUsd ?? null,
      });
      const [plan] = await tx
        .insert(schema.casheaPlans)
        .values({
          groupId: salidaId!,
          expenseId: expenseId!,
          memberId: M(casheaPayers[0].memberId),
          store: d.cashea.store || d.place || d.title,
          line: d.cashea.line,
          level: d.cashea.level,
          initialPct: sched.raisedByLine ? Math.round((sched.initialUsd / Math.max(1, orderUsd - discountUsd)) * 1000) / 10 : d.cashea.initialPct,
          installments: d.cashea.installments,
          intervalDays: d.cashea.intervalDays,
          totalUsd: orderUsd,
          initialUsd: sched.initialUsd,
          discountUsd,
          purchaseDate: d.date,
          mode: d.cashea.mode,
        })
        .returning({ id: schema.casheaPlans.id });
      await tx.insert(schema.casheaInstallments).values(
        sched.rows.map((r) => ({
          planId: plan.id,
          n: r.n,
          dueDate: r.dueDate,
          amountUsd: r.amountUsd,
          paidAt: r.n === 0 ? spentAt : (previouslyPaid.get(r.n)?.paidAt ?? null),
          paidVes: previouslyPaid.get(r.n)?.paidVes ?? null,
          paidRate: previouslyPaid.get(r.n)?.paidRate ?? null,
        })),
      );
    }

    // 5 · Quién ya pagó su parte
    const eLike = {
      payers: payers.map((p, i) => ({ memberId: M(p.memberId), amountUsd: payersUsd[i] })),
      shares: Object.keys(split.shares).map((k) => ({ memberId: M(k), amountUsd: sharesUsd[k] })),
    };
    const linked = await tx.select().from(schema.settlements).where(and(eq(schema.settlements.expenseId, expenseId!), isNull(schema.settlements.deletedAt)));
    const unpaid = new Set((d.unpaidMembers ?? []).map(M));
    const drop = linked.filter((l) => unpaid.has(l.fromMember)).map((l) => l.id);
    if (drop.length) await tx.delete(schema.settlements).where(inArray(schema.settlements.id, drop));
    const keep = linked.filter((l) => !unpaid.has(l.fromMember));
    const myMember = memberOf.get(user.id);
    const rows: (typeof schema.settlements.$inferInsert)[] = [];
    const batchId = randomUUID();
    for (const k of new Set(d.paidMembers ?? [])) {
      const m = M(k);
      if (unpaid.has(m)) continue;
      for (const part of debtSplit(eLike, m)) {
        const rest = remainingTo(eLike, keep, m, part.to);
        if (rest <= 0) continue;
        rows.push({
          groupId: salidaId!,
          expenseId: expenseId!,
          batchId,
          fromMember: m,
          toMember: part.to,
          currency: "USD",
          amount: rest,
          amountUsd: rest,
          method: "otro",
          note: "Marcado al anotar la salida",
          paidAt: new Date(),
          // Si lo marca el que cobra, ya está confirmado.
          confirmedAt: part.to === myMember ? new Date() : null,
          createdBy: user.id,
        });
      }
    }
    if (rows.length) await tx.insert(schema.settlements).values(rows);
    return { salidaId: salidaId!, eLike, memberOf };
  });

  if (!d.salidaId) {
    // Aviso a cada pana con lo que le toca.
    const rates = await getRates();
    const rate = vesPerUsd(rates, rateSource);
    const paidSet = new Set((d.paidMembers ?? []).map((k) => result.memberOf.get(k)));
    const nameOfMember = (mid: string) => {
      const k = [...result.memberOf.entries()].find(([, v]) => v === mid)?.[0];
      return k === user.id ? user.name : (userById.get(k ?? "")?.name ?? "alguien");
    };
    await notify(
      participants
        .filter((p) => userById.has(p))
        .map((p) => {
          const mid = result.memberOf.get(p)!;
          const parts = debtSplit(result.eLike, mid);
          const owes = parts.reduce((a, x) => a + x.amountUsd, 0);
          return {
            userId: p,
            kind: "gasto" as const,
            groupId: result.salidaId,
            emoji: cat.emoji,
            title: `${user.name} anotó la salida «${d.title}»`,
            body:
              owes <= 0
                ? "Tú pusiste la plata 😎 Aquí vas a ver quién te paga."
                : paidSet.has(mid)
                  ? `Tu parte (${fmt(owes, "USD")}) ya aparece como pagada ✅`
                  : `Te toca ${fmt(owes, "USD")} (${fmt(Math.round(owes * rate), "VES")}) para ${parts.map((x) => nameOfMember(x.to)).join(" y ")}. Toca para pagar.`,
            url: salidaUrl(result.salidaId),
          };
        }),
      user.id,
    );
  }
  revalidatePath("/", "layout");
  return { ok: true, id: result.salidaId };
}

function toSplitInput(s: z.infer<typeof salidaSchema>["split"]): SplitInput {
  switch (s.mode) {
    case "equal":
      return { mode: "equal", base: s.base ?? 0, members: s.members ?? [] };
    case "exact":
      return { mode: "exact", amounts: s.amounts ?? {} };
    case "percent":
      return { mode: "percent", base: s.base ?? 0, percents: s.percents ?? {} };
    case "shares":
      return { mode: "shares", base: s.base ?? 0, weights: s.weights ?? {} };
    case "items":
      return { mode: "items", items: s.items ?? [] };
  }
}

/** Borra la salida de verdad (cuenta, pagos, Cashea y avisos de esa salida). Solo quien la creó. */
export async function deleteSalida(salidaId: string): Promise<ActionResult> {
  const user = await requireUser();
  const ledger = await getLedger(salidaId, user.id);
  if (!ledger) return { ok: false, error: "No tienes acceso a esa salida." };
  if (ledger.group.createdBy && ledger.group.createdBy !== user.id)
    return { ok: false, error: "Solo quien anotó la salida la puede borrar. Pídeselo o ciérrala." };
  const db = await getDb();
  await db.delete(schema.groups).where(eq(schema.groups.id, salidaId));
  await notify(
    ledger.members
      .filter((m) => m.userId)
      .map((m) => ({ userId: m.userId!, kind: "grupo" as const, emoji: "🗑️", title: `${user.name} borró la salida «${ledger.group.name}»`, body: "Ya no aparece en tus cuentas.", url: "/salidas" })),
    user.id,
  );
  revalidatePath("/", "layout");
  return { ok: true, id: salidaId };
}

/** Cerrar (o reabrir) una salida: cerrada = ya no se esperan más pagos. */
export async function setSalidaClosed(salidaId: string, closed: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const ledger = await getLedger(salidaId, user.id);
  if (!ledger) return { ok: false, error: "No tienes acceso a esa salida." };
  const db = await getDb();
  await db.update(schema.groups).set({ closedAt: closed ? new Date() : null }).where(eq(schema.groups.id, salidaId));
  await notify(
    ledger.members
      .filter((m) => m.userId)
      .map((m) => ({
        userId: m.userId!,
        groupId: salidaId,
        kind: "grupo" as const,
        emoji: closed ? "🔒" : "🔓",
        title: `${user.name} ${closed ? "cerró" : "reabrió"} la salida «${ledger.group.name}»`,
        body: closed ? "Cuentas claras 🤙" : "Hay algo pendiente otra vez.",
        url: salidaUrl(salidaId),
      })),
    user.id,
  );
  revalidatePath("/", "layout");
  return { ok: true, id: salidaId };
}

/** Marca que alguien ya pagó su parte. Si lo marca el que cobra, queda confirmado; si no, queda por confirmar. */
export async function markSharePaid(salidaId: string, memberId: string, method: string, currency: "USD" | "VES", reference?: string): Promise<ActionResult> {
  const user = await requireUser();
  const ledger = await getLedger(salidaId, user.id);
  const e = ledger?.expenses[0];
  if (!ledger || !e) return { ok: false, error: "No encontré esa salida." };
  if (!PAY_METHODS.some((m) => m.id === method)) method = "otro";
  const eLike = eLikeOf(e);
  const linked = linkedOf(ledger, e.id);
  const rate = vesPerUsd(await getRates(), ledger.group.rateSource as RateSourceId);
  const batchId = randomUUID();
  const rows: (typeof schema.settlements.$inferInsert)[] = [];
  for (const part of debtSplit(eLike, memberId)) {
    const rest = remainingTo(eLike, linked, memberId, part.to);
    if (rest <= 0) continue;
    rows.push({
      groupId: salidaId,
      expenseId: e.id,
      batchId,
      fromMember: memberId,
      toMember: part.to,
      currency,
      amount: currency === "VES" ? Math.round(rest * rate) : rest,
      amountUsd: rest,
      rate: currency === "VES" ? rate : null,
      rateSource: currency === "VES" ? ledger.group.rateSource : null,
      method,
      reference: reference?.trim().slice(0, 40) || null,
      note: `Su parte de «${e.title}»`.slice(0, 140),
      paidAt: new Date(),
      confirmedAt: part.to === ledger.me.id ? new Date() : null,
      createdBy: user.id,
    });
  }
  if (rows.length === 0) return { ok: false, error: "No tiene nada pendiente en esta salida." };
  const db = await getDb();
  const [first] = await db.insert(schema.settlements).values(rows).returning({ id: schema.settlements.id });

  const debtor = ledger.members.find((m) => m.id === memberId);
  const items: NotifyInput[] = [];
  for (const r of rows) {
    const creditor = ledger.members.find((m) => m.id === r.toMember);
    if (!creditor?.userId) continue;
    items.push(
      r.confirmedAt
        ? { userId: creditor.userId, groupId: salidaId, kind: "parte", emoji: "✅", title: `${debtor?.name} ya pagó su parte de «${e.title}»`, body: fmt(r.amountUsd, "USD"), url: salidaUrl(salidaId) }
        : {
            userId: creditor.userId,
            groupId: salidaId,
            kind: "pago",
            emoji: "💸",
            title: `${debtor?.id === ledger.me.id ? user.name : debtor?.name} dice que te pagó. ¿Te llegó?`,
            body: `${fmt(r.amount ?? 0, currency)} por ${payMethodOf(method).label.toLowerCase()}${r.reference ? ` · ref ${r.reference}` : ""} · «${e.title}». Entra para confirmar.`,
            url: "/inicio#por-confirmar",
          },
    );
  }
  if (debtor?.userId && debtor.userId !== user.id)
    items.push({ userId: debtor.userId, groupId: salidaId, kind: "parte", emoji: "✅", title: `${user.name} marcó como pagada tu parte de «${e.title}»`, body: "Si no es así, avísale 👀", url: salidaUrl(salidaId) });
  await notify(items, user.id);
  revalidatePath("/", "layout");
  return { ok: true, id: first.id };
}

export async function unmarkSharePaid(salidaId: string, memberId: string): Promise<ActionResult> {
  const user = await requireUser();
  const ledger = await getLedger(salidaId, user.id);
  if (!ledger) return { ok: false, error: "No tienes acceso a esa salida." };
  const db = await getDb();
  await db.delete(schema.settlements).where(and(eq(schema.settlements.groupId, salidaId), eq(schema.settlements.fromMember, memberId)));
  revalidatePath("/", "layout");
  return { ok: true, id: salidaId };
}

const paySchema = z.object({
  toUserId: z.string().uuid(),
  salidaIds: z.array(z.string().uuid()).min(1, "Elige qué le estás pagando.").max(100),
  method: z.enum(PAY_METHODS.map((m) => m.id) as [string, ...string[]]),
  currency: z.enum(["USD", "VES", "USDT", "EUR"]),
  reference: z.string().trim().max(40).optional(),
  /** Comprobante ya subido con attachProof (queda pegado al pago). */
  proofId: z.string().uuid().optional(),
  /** Cuánto paga de cada salida si no es todo (p. ej. una cuota de Cashea). Nunca más de lo que debe. */
  amounts: z.record(z.string().uuid(), cents.min(1)).optional(),
});
export type PayInput = z.input<typeof paySchema>;

type PayRow = typeof schema.settlements.$inferInsert;

/** Lo que le debo a esa persona en las salidas elegidas, ya convertido a la moneda del pago (sin guardar nada). */
async function buildPayRows(userId: string, d: z.infer<typeof paySchema>, batchId: string) {
  const rates = await getRates();
  const rows: PayRow[] = [];
  const titles: string[] = [];
  /** Lo que se debe en cada moneda (para revisar el comprobante). */
  const owed = { VES: 0, USD: 0, EUR: 0 };
  for (const sid of new Set(d.salidaIds)) {
    const ledger = await getLedger(sid, userId);
    const e = ledger?.expenses[0];
    if (!ledger || !e) continue;
    const creditor = ledger.members.find((m) => m.userId === d.toUserId);
    if (!creditor) continue;
    const owes = remainingTo(eLikeOf(e), linkedOf(ledger, e.id), ledger.me.id, creditor.id);
    if (owes <= 0) continue;
    const rest = Math.min(owes, d.amounts?.[sid] ?? owes);
    const partial = rest < owes;
    const rate = vesPerUsd(rates, ledger.group.rateSource as RateSourceId);
    const inEur = Math.round((rest * rates.bcvUsd) / rates.bcvEur);
    owed.VES += Math.round(rest * rate);
    owed.USD += rest;
    owed.EUR += inEur;
    const amount = d.currency === "VES" ? Math.round(rest * rate) : d.currency === "EUR" ? inEur : rest;
    titles.push(e.title);
    rows.push({
      groupId: sid,
      expenseId: e.id,
      batchId,
      fromMember: ledger.me.id,
      toMember: creditor.id,
      currency: d.currency,
      amount,
      amountUsd: rest,
      rate: d.currency === "VES" ? rate : null,
      rateSource: d.currency === "VES" ? ledger.group.rateSource : null,
      method: d.method,
      reference: d.reference || null,
      note: (partial ? `Abono a su parte de «${e.title}»` : `Su parte de «${e.title}»`).slice(0, 140),
      paidAt: new Date(),
      confirmedAt: null,
      createdBy: userId,
    });
  }
  return { rows, titles, owed };
}

/**
 * Sube el comprobante del pago (captura) antes de anotarlo. Si la IA está activa, lo lee y revisa
 * que el monto y el destino cuadren con lo que se debe. Queda como borrador hasta que se anote el pago.
 */
export async function attachProof(formData: FormData): Promise<{ ok: true; proofId: string; ai: ProofAi | null; aiError?: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = paySchema.safeParse(JSON.parse(String(formData.get("pago") ?? "{}")));
  if (!parsed.success) return { ok: false, error: "Faltan datos del pago." };
  let image;
  try {
    image = await imageFromForm(formData.get("foto"));
  } catch (e) {
    return { ok: false, error: e instanceof AiError ? e.message : "No llegó la foto." };
  }
  const { rows, owed } = await buildPayRows(user.id, parsed.data, randomUUID());
  if (rows.length === 0) return { ok: false, error: "No hay nada pendiente con esa persona en esas salidas." };

  let ai: ProofAi | null = null;
  let aiError: string | undefined;
  if (aiEnabled()) {
    try {
      await spendAiQuota(user.id);
      const db0 = await getDb();
      const [creditor] = await db0.select({ name: schema.users.name, payInfo: schema.users.payInfo }).from(schema.users).where(eq(schema.users.id, parsed.data.toUserId)).limit(1);
      ai = await readProof(image, { ...owed, payInfo: creditor?.payInfo ?? {}, creditorName: creditor?.name ?? "tu pana" }, user.id);
    } catch (e) {
      aiError = e instanceof AiError ? e.message : "La IA no pudo leer la captura.";
    }
  }
  const db = await getDb();
  // Borradores de más de un día que nunca se usaron: fuera.
  await db.delete(schema.paymentProofs).where(and(isNull(schema.paymentProofs.settlementId), lt(schema.paymentProofs.createdAt, new Date(Date.now() - 86_400_000))));
  const [proof] = await db
    .insert(schema.paymentProofs)
    .values({ uploaderId: user.id, mime: image.mime, data: image.base64, ai })
    .returning({ id: schema.paymentProofs.id });
  return { ok: true, proofId: proof.id, ai, aiError };
}

/** Pago guiado: yo le pago a un pana lo que le debo en las salidas elegidas. Queda por confirmar. */
export async function payDebts(input: PayInput): Promise<{ ok: true; totalUsd: number; amount: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const { rows, titles } = await buildPayRows(user.id, d, randomUUID());
  if (rows.length === 0) return { ok: false, error: "No hay nada pendiente con esa persona en esas salidas." };
  const db = await getDb();
  const inserted = await db.insert(schema.settlements).values(rows).returning({ id: schema.settlements.id });
  // El comprobante (si lo subió) queda pegado al primer pago del lote.
  let proofNote = "";
  if (d.proofId) {
    const [proof] = await db
      .update(schema.paymentProofs)
      .set({ settlementId: inserted[0].id })
      .where(and(eq(schema.paymentProofs.id, d.proofId), eq(schema.paymentProofs.uploaderId, user.id), isNull(schema.paymentProofs.settlementId)))
      .returning({ ai: schema.paymentProofs.ai });
    if (proof) proofNote = `\n📎 Con comprobante${proof.ai ? `. ${proof.ai.resumen}` : ""}`;
  }
  const totalUsd = rows.reduce((a, r) => a + r.amountUsd, 0);
  const amount = rows.reduce((a, r) => a + (r.amount ?? 0), 0);
  // Si el pago es de una sola salida, el aviso se borra junto con ella.
  const oneSalida = new Set(rows.map((r) => r.groupId)).size === 1 ? rows[0].groupId : undefined;
  await notify(
    [
      {
        userId: d.toUserId,
        groupId: oneSalida,
        kind: "pago",
        emoji: "💸",
        title: `${user.name} dice que te pagó. ¿Te llegó?`,
        body: `${fmt(amount, d.currency as Currency)} por ${payMethodOf(d.method).label.toLowerCase()}${d.reference ? ` · ref ${d.reference}` : ""}\nPor: ${titles.join(", ")}. Entra para confirmar.${proofNote}`,
        url: "/inicio#por-confirmar",
      },
    ],
    user.id,
  );
  revalidatePath("/", "layout");
  return { ok: true, totalUsd, amount };
}

/** El que cobra confirma (o rechaza) un pago. */
export async function answerPayment(settlementIds: string[], ok: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!settlementIds.length) return { ok: false, error: "Nada que confirmar." };
  const db = await getDb();
  const rows = await db
    .select({ s: schema.settlements, to: schema.members, groupName: schema.groups.name })
    .from(schema.settlements)
    .innerJoin(schema.members, eq(schema.members.id, schema.settlements.toMember))
    .innerJoin(schema.groups, eq(schema.groups.id, schema.settlements.groupId))
    .where(and(inArray(schema.settlements.id, settlementIds.slice(0, 200)), isNull(schema.settlements.deletedAt)));
  const mine = rows.filter((r) => r.to.userId === user.id);
  if (mine.length === 0) return { ok: false, error: "Ese pago no es para ti." };
  const ids = mine.map((r) => r.s.id);
  if (ok) await db.update(schema.settlements).set({ confirmedAt: new Date() }).where(inArray(schema.settlements.id, ids));
  else await db.delete(schema.settlements).where(inArray(schema.settlements.id, ids));

  const fromMembers = await db.select().from(schema.members).where(inArray(schema.members.id, [...new Set(mine.map((r) => r.s.fromMember))]));
  const total = mine.reduce((a, r) => a + r.s.amountUsd, 0);
  const oneSalida = new Set(mine.map((r) => r.s.groupId)).size === 1 ? mine[0].s.groupId : undefined;
  await notify(
    fromMembers
      .filter((m) => m.userId)
      .map((m) => ({
        userId: m.userId!,
        groupId: oneSalida,
        kind: "pago" as const,
        emoji: ok ? "✅" : "⚠️",
        title: ok ? `${user.name} confirmó tu pago` : `${user.name} dice que no le llegó tu pago`,
        body: ok ? `${fmt(total, "USD")} · ¡cuentas claras! 🤙` : `${fmt(total, "USD")} · Revisa la referencia o el número y vuelve a intentar.`,
        url: ok ? "/inicio" : `/pagar?a=${user.id}`,
      })),
    user.id,
  );
  revalidatePath("/", "layout");
  return { ok: true, id: ids[0] };
}

/** Recordatorio a los que faltan por pagar una salida (a todos o a uno). */
export async function remindPending(salidaId: string, onlyMember?: string): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const ledger = await getLedger(salidaId, user.id);
  const e = ledger?.expenses[0];
  if (!ledger || !e) return { ok: false, error: "No encontré esa salida." };
  const rate = vesPerUsd(await getRates(), ledger.group.rateSource as RateSourceId);
  const pending = shareStatuses(eLikeOf(e), linkedOf(ledger, e.id)).filter(
    (st) => (st.status === "falta" || st.status === "parcial") && (!onlyMember || st.memberId === onlyMember),
  );
  const items: NotifyInput[] = [];
  for (const st of pending) {
    const m = ledger.members.find((x) => x.id === st.memberId);
    if (!m?.userId) continue;
    const rest = st.owesUsd - st.paidUsd;
    items.push({
      userId: m.userId,
      groupId: salidaId,
      kind: "recordatorio",
      emoji: "💸",
      title: `Te falta pagar tu parte de «${e.title}»`,
      body: `${fmt(rest, "USD")} (${fmt(Math.round(rest * rate), "VES")}). Te lo recuerda ${user.name} 🙏 Toca para pagar.`,
      url: salidaUrl(salidaId),
    });
  }
  const sent = await notify(items, user.id);
  return { ok: true, sent };
}

/** Recordatorio a un pana de todo lo que me debe (sumando salidas). */
export async function remindPerson(userId: string): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const bundles = await getEverything(user.id);
  let total = 0;
  const titles: string[] = [];
  for (const { ledger } of bundles) {
    const other = ledger.members.find((m) => m.userId === userId);
    const e = ledger.expenses[0];
    if (!other || !e) continue;
    const rest = remainingTo(eLikeOf(e), linkedOf(ledger, e.id), other.id, ledger.me.id);
    if (rest > 0) {
      total += rest;
      titles.push(e.title);
    }
  }
  if (total <= 0) return { ok: false, error: "No te debe nada 🎉" };
  const rates = await getRates();
  const sent = await notify(
    [
      {
        userId,
        kind: "recordatorio",
        emoji: "💸",
        title: `${user.name} te recuerda que le debes ${fmt(total, "USD")}`,
        body: `${fmt(Math.round(total * rates.bcvUsd), "VES")} a BCV · ${titles.join(", ")}. Toca para pagarle.`,
        url: `/pagar?a=${user.id}`,
      },
    ],
    user.id,
  );
  return { ok: true, sent };
}

export async function toggleInstallment(salidaId: string, installmentId: string, paid: boolean, paidVes?: number | null, paidRate?: number | null): Promise<ActionResult> {
  const user = await requireUser();
  const ledger = await getLedger(salidaId, user.id);
  if (!ledger) return { ok: false, error: "No tienes acceso a esa salida." };
  // Solo el dueño del Cashea marca sus cuotas (o quien anotó la salida, si el dueño no tiene cuenta).
  const planIds = ledger.cashea
    .filter((p) => p.memberId === ledger.me.id || (!ledger.members.find((m) => m.id === p.memberId)?.userId && ledger.group.createdBy === user.id))
    .map((p) => p.id);
  if (planIds.length === 0) return { ok: false, error: "Solo quien tiene el Cashea puede marcar sus cuotas. Para pagar tu parte usa «Pagar cuota»." };
  const db = await getDb();
  const updated = await db
    .update(schema.casheaInstallments)
    .set(paid ? { paidAt: new Date(), paidVes: paidVes ?? null, paidRate: paidRate ?? null } : { paidAt: null, paidVes: null, paidRate: null })
    .where(and(eq(schema.casheaInstallments.id, installmentId), inArray(schema.casheaInstallments.planId, planIds)))
    .returning({ id: schema.casheaInstallments.id });
  if (updated.length === 0) return { ok: false, error: "Esa cuota no existe." };
  if (paid) {
    const plan = ledger.cashea.find((p) => p.cuotas.some((c) => c.id === installmentId));
    const cuota = plan?.cuotas.find((c) => c.id === installmentId);
    const e = ledger.expenses.find((x) => x.id === plan?.expenseId);
    if (plan && cuota && e && plan.mode === "espejo") {
      const holder = ledger.members.find((m) => m.id === plan.memberId);
      await notify(
        e.shares
          .filter((sh) => sh.memberId !== plan.memberId)
          .flatMap((sh) => {
            const m = ledger.members.find((x) => x.id === sh.memberId);
            const part = Math.round((cuota.amountUsd * sh.amountUsd) / e.amountUsd);
            return m?.userId
              ? [
                  {
                    userId: m.userId,
                    groupId: salidaId,
                    kind: "cashea" as const,
                    emoji: "🛍️",
                    title: `${holder?.name} pagó la cuota ${cuota.n}/${plan.installments} de ${plan.store ?? e.title}`,
                    body: `Tu parte de esa cuota: ${fmt(part, "USD")}. Pásasela cuando puedas 🙏`,
                    url: salidaUrl(salidaId),
                  },
                ]
              : [];
          }),
        user.id,
      );
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, id: installmentId };
}

/** El que cobra marca que un pana ya le pagó todo lo que le debía (en todas las salidas). */
export async function markPersonPaid(userId: string, method: string, currency: "USD" | "VES"): Promise<ActionResult> {
  const user = await requireUser();
  const bundles = await getEverything(user.id);
  if (!PAY_METHODS.some((m) => m.id === method)) method = "otro";
  const rates = await getRates();
  const batchId = randomUUID();
  const rows: (typeof schema.settlements.$inferInsert)[] = [];
  for (const { ledger } of bundles) {
    const e = ledger.expenses[0];
    const debtor = ledger.members.find((m) => m.userId === userId);
    if (!e || !debtor) continue;
    const rest = remainingTo(eLikeOf(e), linkedOf(ledger, e.id), debtor.id, ledger.me.id);
    if (rest <= 0) continue;
    const rate = vesPerUsd(rates, ledger.group.rateSource as RateSourceId);
    rows.push({
      groupId: ledger.group.id,
      expenseId: e.id,
      batchId,
      fromMember: debtor.id,
      toMember: ledger.me.id,
      currency,
      amount: currency === "VES" ? Math.round(rest * rate) : rest,
      amountUsd: rest,
      rate: currency === "VES" ? rate : null,
      rateSource: currency === "VES" ? ledger.group.rateSource : null,
      method,
      note: `Su parte de «${e.title}»`.slice(0, 140),
      paidAt: new Date(),
      confirmedAt: new Date(),
      createdBy: user.id,
    });
  }
  if (rows.length === 0) return { ok: false, error: "No te debe nada 🎉" };
  const db = await getDb();
  await db.insert(schema.settlements).values(rows);
  const total = rows.reduce((a, r) => a + r.amountUsd, 0);
  await notify(
    [{ userId, kind: "pago", emoji: "✅", title: `${user.name} anotó que ya le pagaste todo`, body: `${fmt(total, "USD")} · ¡cuentas claras! 🤙`, url: "/inicio" }],
    user.id,
  );
  revalidatePath("/", "layout");
  return { ok: true, id: batchId };
}
