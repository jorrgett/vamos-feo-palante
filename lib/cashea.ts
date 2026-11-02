import { addDays, diffDays, todayVE } from "./dates";
import { allocate } from "./money";
import { debtSplit, type ExpenseLike, type LinkedPayment } from "./share-status";

// Reglas de Cashea (consumidor) según su FAQ oficial y la prensa, revisadas el 16-10-2026.
// Cashea cambia condiciones seguido, así que la app sugiere valores pero todo es editable.
//  · Inicial + cuotas iguales SIN intereses cada 14 días; la 1.ª cuota vence 14 días después.
//  · Precio y cuotas fijados en USD; las cuotas se pagan en Bs a tasa BCV del día en que pagas.
//  · Atraso: 2 días de gracia y luego US$ 4 de reactivación por cuota atrasada.

export type CasheaLevel = {
  level: number;
  name: string;
  /** % de inicial base ("desde") del nivel. */
  initialPct: number;
  /** % de inicial en campaña "Días del Club" (oct–dic 2026, aliados seleccionados). */
  promoPct: number;
  requirement: string;
};

export const CASHEA_LEVELS: CasheaLevel[] = [
  { level: 1, name: "Nivel 1", initialPct: 60, promoPct: 50, requirement: "Nivel de entrada" },
  { level: 2, name: "Nivel 2", initialPct: 50, promoPct: 40, requirement: "$120 o 5 cuotas pagadas" },
  { level: 3, name: "Nivel 3", initialPct: 40, promoPct: 30, requirement: "$400 o 10 cuotas" },
  { level: 4, name: "Nivel 4", initialPct: 40, promoPct: 20, requirement: "$800 o 20 cuotas" },
  { level: 5, name: "Nivel 5", initialPct: 40, promoPct: 10, requirement: "$2.000 o 40 cuotas" },
  { level: 6, name: "Nivel 6", initialPct: 40, promoPct: 0, requirement: "$4.000 o 80 cuotas" },
];

export const levelOf = (n: number) => CASHEA_LEVELS.find((l) => l.level === n) ?? CASHEA_LEVELS[0];

export type CasheaLine = { id: string; label: string; installments: number; hint: string; minLevel?: number; minUsd?: number };

export const CASHEA_LINES: CasheaLine[] = [
  { id: "principal", label: "Línea principal", installments: 3, hint: "Lo normal: inicial + 3 cuotas" },
  { id: "promo2", label: "Cupón 2 cuotas", installments: 2, hint: "Promos en restaurantes y Cotidiana" },
  { id: "cotidiana", label: "Línea cotidiana", installments: 1, hint: "Súper y farmacia: inicial + 1 cuota" },
  { id: "mas6", label: "Más cuotas · 6", installments: 6, hint: "Nivel 3+, desde $300 (online)", minLevel: 3, minUsd: 30000 },
  { id: "mas9", label: "Más cuotas · 9", installments: 9, hint: "Nivel 5+, desde $450 (online)", minLevel: 5, minUsd: 45000 },
  { id: "mas12", label: "Más cuotas · 12", installments: 12, hint: "Nivel 6, desde $600 (online)", minLevel: 6, minUsd: 60000 },
];

export const CASHEA_DEFAULT_INSTALLMENTS = 3;
export const CASHEA_DEFAULT_INTERVAL = 14;
export const CASHEA_GRACE_DAYS = 2;
export const CASHEA_LATE_FEE_USD = 400;
export const CASHEA_MIN_PURCHASE_USD = 2500;

/** ¿La fecha cae en una ventana de "Días del Club" (días 1–6 y 15–20, oct–dic 2026)? */
export function inClubDays(ymd: string): boolean {
  if (ymd < "2026-10-01" || ymd > "2026-12-31") return false;
  const day = Number(ymd.slice(8, 10));
  return (day >= 1 && day <= 6) || (day >= 15 && day <= 20);
}

export type CasheaInput = {
  /** Monto de la orden en centavos de USD. */
  totalUsd: number;
  initialPct: number;
  installments: number;
  intervalDays: number;
  purchaseDate: string;
  /** Descuento sobre la orden, en centavos de USD. */
  discountUsd?: number;
  /** Línea de compra disponible (centavos USD). Si lo financiado la supera, la inicial sube. */
  availableLineUsd?: number | null;
};

export type CasheaRow = { n: number; dueDate: string; amountUsd: number; label: string };

export function casheaSchedule(input: CasheaInput): { initialUsd: number; financedUsd: number; raisedByLine: boolean; rows: CasheaRow[] } {
  const total = Math.max(0, input.totalUsd - (input.discountUsd ?? 0));
  const n = Math.max(0, Math.floor(input.installments));
  let initialUsd = n === 0 ? total : Math.round((total * input.initialPct) / 100);
  let raisedByLine = false;
  if (input.availableLineUsd != null && n > 0 && total - initialUsd > input.availableLineUsd) {
    initialUsd = total - input.availableLineUsd;
    raisedByLine = true;
  }
  const financedUsd = total - initialUsd;
  const rows: CasheaRow[] = [{ n: 0, dueDate: input.purchaseDate, amountUsd: initialUsd, label: "Inicial" }];
  if (n > 0) {
    // Cuotas iguales; el céntimo que sobra va en la última.
    const each = Math.floor(financedUsd / n);
    for (let i = 0; i < n; i++) {
      rows.push({
        n: i + 1,
        dueDate: addDays(input.purchaseDate, input.intervalDays * (i + 1)),
        amountUsd: i === n - 1 ? financedUsd - each * (n - 1) : each,
        label: `Cuota ${i + 1}`,
      });
    }
  }
  return { initialUsd, financedUsd, raisedByLine, rows };
}

export type InstallmentState = { n: number; dueDate: string; amountUsd: number; paidAt: Date | string | null };

/** Fracción del plan que ya es exigible a una fecha (inicial + cuotas vencidas o pagadas). */
export function dueFraction(rows: InstallmentState[], at = todayVE()): number {
  const total = rows.reduce((a, r) => a + r.amountUsd, 0);
  if (total <= 0) return 1;
  const due = rows.filter((r) => r.paidAt || diffDays(r.dueDate, at) <= 0).reduce((a, r) => a + r.amountUsd, 0);
  return due / total;
}

export function nextInstallment<T extends InstallmentState>(rows: T[]): T | null {
  return rows.filter((r) => !r.paidAt && r.n > 0).sort((a, b) => a.n - b.n)[0] ?? null;
}

export function planProgress(rows: InstallmentState[]) {
  const total = rows.reduce((a, r) => a + r.amountUsd, 0);
  const paid = rows.filter((r) => r.paidAt).reduce((a, r) => a + r.amountUsd, 0);
  return { total, paid, pending: total - paid, pct: total ? paid / total : 1 };
}

export type InstallmentStatus = "pagada" | "al-dia" | "vence-pronto" | "en-gracia" | "atrasada";

export function installmentStatus(r: InstallmentState, at = todayVE()): InstallmentStatus {
  if (r.paidAt) return "pagada";
  const d = diffDays(r.dueDate, at);
  if (d > 3) return "al-dia";
  if (d >= 0) return "vence-pronto";
  if (d >= -CASHEA_GRACE_DAYS) return "en-gracia";
  return "atrasada";
}

// ── Modo espejo: cada pana le paga al dueño del Cashea su parte al ritmo de las cuotas ──────────

export type MirrorPart = { n: number; dueDate: string; usd: number; restUsd: number };
export type MirrorStatus = {
  parts: MirrorPart[];
  /** Lo que ya venció (antes de hoy) y no ha pagado. */
  overdueUsd: number;
  /** Lo que tiene que haber pagado hoy (vencido + lo que vence hoy). */
  dueTodayUsd: number;
  /** Próxima cuota con algo pendiente (puede estar vencida). */
  next: (MirrorPart & { daysLeft: number }) | null;
  /** Para ponerse al día con la próxima cuota: lo vencido + lo que falta de esa cuota. */
  nextPayUsd: number;
  totalRestUsd: number;
};

export type CuotaPayment = { id: string; amountUsd: number; cuotaN?: number | null };
type PartLike = { n: number; usd: number };

/** Reparte los pagos entre las cuotas: los que dicen su cuota van a esa; los demás llenan las más viejas. */
function allocatePayments(parts: PartLike[], payments: CuotaPayment[]) {
  const room = new Map(parts.map((p) => [p.n, p.usd]));
  const slices: { id: string; n: number | null; usd: number }[] = [];
  const pool: { id: string; usd: number }[] = [];
  for (const p of payments) {
    let left = p.amountUsd;
    if (p.cuotaN != null && room.has(p.cuotaN)) {
      const take = Math.min(left, room.get(p.cuotaN)!);
      if (take > 0) {
        slices.push({ id: p.id, n: p.cuotaN, usd: take });
        room.set(p.cuotaN, room.get(p.cuotaN)! - take);
        left -= take;
      }
    }
    if (left > 0) pool.push({ id: p.id, usd: left });
  }
  for (const q of pool) {
    let left = q.usd;
    for (const part of parts) {
      const free = room.get(part.n)!;
      if (left <= 0 || free <= 0) continue;
      const take = Math.min(left, free);
      slices.push({ id: q.id, n: part.n, usd: take });
      room.set(part.n, free - take);
      left -= take;
    }
    if (left > 0) slices.push({ id: q.id, n: null, usd: left });
  }
  return { slices, room };
}

/**
 * Qué cambiar para que queden pagadas exactamente las cuotas de `wanted`. Las cuotas con un abono a
 * medias no se tocan salvo que se marquen. Si se quita una cuota, los pagos sin cuota se rehacen cuota
 * por cuota: si no, esa plata volvería a caer en la cuota que se acaba de quitar.
 */
export function reconcileCuotas(input: { parts: PartLike[]; payments: CuotaPayment[]; wanted: number[] }) {
  const parts = input.parts.filter((p) => p.usd > 0);
  const { slices, room } = allocatePayments(parts, input.payments);
  const wanted = new Set(input.wanted);
  const isPaid = (n: number) => (room.get(n) ?? 0) <= 1;
  const add = parts.filter((p) => !isPaid(p.n) && wanted.has(p.n)).map((p) => ({ cuotaN: p.n, usd: room.get(p.n)! }));
  const removed = new Set(parts.filter((p) => isPaid(p.n) && !wanted.has(p.n)).map((p) => p.n));
  if (removed.size === 0) return { add, removed: [] as number[], deleteIds: [] as string[], recreate: [] as { fromId: string; cuotaN: number; usd: number }[] };
  const touched = input.payments.filter((p) => p.cuotaN == null || slices.some((s) => s.id === p.id && (s.n !== p.cuotaN || (s.n != null && removed.has(s.n))))).map((p) => p.id);
  const recreate = slices
    .filter((s): s is { id: string; n: number; usd: number } => touched.includes(s.id) && s.n != null && !removed.has(s.n))
    .map((s) => ({ fromId: s.id, cuotaN: s.n, usd: s.usd }));
  return { add, removed: [...removed], deleteIds: touched, recreate };
}

/**
 * Reparte lo que un pana le debe al dueño del Cashea entre la inicial y las cuotas (en proporción a
 * cada cuota, con suma exacta). Si el dueño puso parte en efectivo, esa parte se debe de una (va con la inicial).
 * Lo que ya pagó se descuenta de la cuota que diga cada pago o, si no dice, de las más viejas primero.
 */
export function mirrorStatus(input: {
  owedUsd: number;
  /** Lo pagado sin cuota específica (si no se pasan los pagos uno por uno). */
  paidUsd?: number;
  payments?: CuotaPayment[];
  /** Lo que el dueño del Cashea puso en la cuenta (Cashea + efectivo). */
  holderPutUsd: number;
  planTotalUsd: number;
  rows: { n: number; dueDate: string; amountUsd: number }[];
  at?: string;
}): MirrorStatus {
  const at = input.at ?? todayVE();
  const rows = [...input.rows].sort((a, b) => a.n - b.n);
  const owed = Math.max(0, input.owedUsd);
  const byCashea = input.holderPutUsd > 0 ? Math.round(owed * Math.min(1, input.planTotalUsd / input.holderPutUsd)) : owed;
  const weights = rows.map((r) => Math.max(0, r.amountUsd));
  const split = weights.some((w) => w > 0) ? allocate(byCashea, weights) : rows.map((_, i) => (i === 0 ? byCashea : 0));
  // Lo que no va por Cashea (efectivo del dueño) se debe desde el día de la compra.
  if (split.length) split[0] += owed - byCashea;
  const payments = input.payments ?? [{ id: "pagado", amountUsd: Math.max(0, input.paidUsd ?? 0) }];
  const { room } = allocatePayments(
    rows.map((r, i) => ({ n: r.n, usd: split[i] ?? 0 })),
    payments,
  );
  const parts: MirrorPart[] = rows.map((r, i) => {
    const left = room.get(r.n) ?? 0;
    // Un céntimo de redondeo no deja una cuota pendiente.
    return { n: r.n, dueDate: r.dueDate, usd: split[i] ?? 0, restUsd: left <= 1 ? 0 : left };
  });
  const sum = (xs: MirrorPart[]) => xs.reduce((a, p) => a + p.restUsd, 0);
  const nextPart = parts.find((p) => p.restUsd > 0) ?? null;
  return {
    parts,
    overdueUsd: sum(parts.filter((p) => diffDays(p.dueDate, at) < 0)),
    dueTodayUsd: sum(parts.filter((p) => diffDays(p.dueDate, at) <= 0)),
    next: nextPart ? { ...nextPart, daysLeft: diffDays(nextPart.dueDate, at) } : null,
    nextPayUsd: nextPart ? sum(parts.filter((p) => p.dueDate <= nextPart.dueDate)) : 0,
    totalRestUsd: sum(parts),
  };
}

/** «vence hoy», «vence mañana», «vence en 3 días», «se venció ayer»… */
export function dueLabel(daysLeft: number): string {
  if (daysLeft === 0) return "vence hoy";
  if (daysLeft === 1) return "vence mañana";
  if (daysLeft > 1) return `vence en ${daysLeft} días`;
  if (daysLeft === -1) return "se venció ayer";
  return `se venció hace ${-daysLeft} días`;
}

export type MirrorPlanLike = { memberId: string; mode: string; totalUsd: number; installments: number; rows: { n: number; dueDate: string; amountUsd: number }[] };

/** La deuda de `debtor` con el dueño de un Cashea en modo espejo, cuota por cuota (null si no aplica). */
export function mirrorForDebtor(plan: MirrorPlanLike | null | undefined, e: ExpenseLike, linked: LinkedPayment[], debtor: string, at?: string) {
  if (!plan || plan.mode !== "espejo" || debtor === plan.memberId) return null;
  const owedUsd = debtSplit(e, debtor).find((p) => p.to === plan.memberId)?.amountUsd ?? 0;
  if (owedUsd <= 0) return null;
  const payments = linked.filter((l) => l.fromMember === debtor && l.toMember === plan.memberId).map((l, i) => ({ id: l.id ?? String(i), amountUsd: l.amountUsd, cuotaN: l.cuotaN }));
  const holderPutUsd = e.payers.filter((p) => p.memberId === plan.memberId).reduce((a, p) => a + p.amountUsd, 0);
  return { holderId: plan.memberId, count: plan.installments, ...mirrorStatus({ owedUsd, payments, holderPutUsd, planTotalUsd: plan.totalUsd, rows: plan.rows, at }) };
}

/** «cuota 2», «cuotas 1 y 3» o «inicial y cuota 1». */
export function cuotasLabel(ns: number[]): string {
  const sorted = [...ns].sort((a, b) => a - b);
  const cuotas = sorted.filter((n) => n > 0);
  const nums = cuotas.length > 1 ? `${cuotas.slice(0, -1).join(", ")} y ${cuotas[cuotas.length - 1]}` : String(cuotas[0] ?? "");
  const text = cuotas.length === 0 ? "" : cuotas.length === 1 ? `cuota ${nums}` : `cuotas ${nums}`;
  return sorted[0] === 0 ? (text ? `inicial y ${text}` : "inicial") : text;
}

/** «la inicial» o «la cuota 2». */
export const cuotaName = (n: number) => (n === 0 ? "la inicial" : `la cuota ${n}`);
