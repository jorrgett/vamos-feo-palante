import "server-only";
// Lo que Pilas sabe de las cuentas de quien le escribe: solo las salidas donde esa persona está.
import type { CurrentUser } from "@/lib/auth";
import { listPanas, type Pana } from "@/lib/community";
import { categoriesOf, categoryLabel, categoryOf, payMethodOf } from "@/lib/constants";
import { getEverything } from "@/lib/data";
import { addDays, prettyDay, relativeDue, todayVE, ymdOf } from "@/lib/dates";
import { casheaDues, type Bundle } from "@/lib/insights";
import { allocate, fmt, type Currency } from "@/lib/money";
import { pendingConfirmations, personBalances } from "@/lib/people";
import { getRates } from "@/lib/rates";
import { RATE_META, vesPerUsd, type RateSourceId, type RatesSnapshot } from "@/lib/rates-shared";
import { debtSplit, paidProgress, shareStatuses } from "@/lib/share-status";
import { cuotaName, dueLabel } from "@/lib/cashea";

export type PilasCtx = { user: CurrentUser; bundles: Bundle[]; rates: RatesSnapshot; panas: Pana[] };

export async function cargarCtx(user: CurrentUser): Promise<PilasCtx> {
  const [bundles, rates, panas] = await Promise.all([getEverything(user.id), getRates(), listPanas(user.id)]);
  return { user, bundles, rates, panas };
}

// ── Referencias cortas para que Pilas nombre cosas sin gastar tokens en UUID largos ──
export const ref = (kind: "p" | "s" | "pago", id: string) => `${kind}:${id.slice(0, 8)}`;
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[«»"“”'‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
function hexOf(r: string): string | null {
  const t = r.trim().toLowerCase();
  return t.match(/^(?:p|s|pago|m)\s*:\s*([0-9a-f]{4,})$/)?.[1] ?? t.match(/^([0-9a-f]{8})$/)?.[1] ?? null;
}

/** Se lanza cuando Pilas nombra algo que no existe o que es ambiguo (el mensaje es para Pilas). */
export class NoEncontrado extends Error {}

export function yo(ctx: PilasCtx): Pana {
  return ctx.panas.find((p) => p.isMe) ?? { id: ctx.user.id, name: ctx.user.name, avatar: ctx.user.avatar, color: ctx.user.color, hasPayInfo: true, isMe: true };
}

export function buscarPana(ctx: PilasCtx, q: string): Pana {
  const t = q.trim();
  if (/^(yo|mi|m[ií]|me|ti|t[uú])$/i.test(t) || norm(t) === norm(ctx.user.name)) return yo(ctx);
  const hex = hexOf(t);
  if (hex) {
    const p = ctx.panas.find((x) => x.id.startsWith(hex));
    if (p) return p;
  }
  const n = norm(t);
  let found = ctx.panas.filter((p) => norm(p.name) === n);
  if (!found.length) found = ctx.panas.filter((p) => norm(p.name).startsWith(n) || norm(p.name).split(" ").includes(n));
  if (found.length === 1) return found[0];
  if (found.length > 1) throw new NoEncontrado(`«${q}» puede ser ${found.map((p) => `${p.name} (${ref("p", p.id)})`).join(" o ")}. Pregúntale a la persona cuál.`);
  throw new NoEncontrado(
    `No hay ningún pana registrado como «${q}». Los registrados son: ${ctx.panas.map((p) => p.name).join(", ")}. Si no está, primero hay que invitarlo (botón a «invitar»).`,
  );
}

const tituloDe = (b: Bundle) => b.ledger.expenses[0]?.title ?? b.ledger.group.name;

export function buscarSalida(ctx: PilasCtx, q: string): Bundle {
  const hex = hexOf(q);
  if (hex) {
    const b = ctx.bundles.find((x) => x.ledger.group.id.startsWith(hex));
    if (b) return b;
  }
  const n = norm(q);
  let found = ctx.bundles.filter((b) => norm(tituloDe(b)) === n);
  if (!found.length) found = ctx.bundles.filter((b) => norm(tituloDe(b)).includes(n) || norm(b.ledger.expenses[0]?.place ?? "").includes(n));
  if (found.length > 1) {
    const open = found.filter((b) => !b.ledger.group.closedAt);
    if (open.length === 1) return open[0];
  }
  if (found.length === 1) return found[0];
  if (found.length > 1)
    throw new NoEncontrado(
      `Hay varias salidas que coinciden con «${q}»: ${found
        .slice(0, 8)
        .map((b) => `«${tituloDe(b)}» del ${fechaDe(b)} (${ref("s", b.ledger.group.id)})`)
        .join("; ")}. Pregunta cuál.`,
    );
  throw new NoEncontrado(`No encontré ninguna salida tuya que coincida con «${q}». Usa buscar_salidas para ver la lista.`);
}

// ── Formatos ──
export const usd = (c: number) => fmt(c, "USD");
export const bs = (ctx: PilasCtx, usdCents: number, src: string = ctx.user.rateSource) =>
  fmt(Math.round(usdCents * vesPerUsd(ctx.rates, src as RateSourceId)), "VES");
const fechaDe = (b: Bundle) => {
  const e = b.ledger.expenses[0];
  return e ? prettyDay(ymdOf(e.spentAt), true) : "";
};
const tasaNombre = (src: string) => RATE_META[src as RateSourceId]?.label ?? src;

export function ahoraTexto(now = new Date()) {
  const f = new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Caracas",
  }).format(now);
  return `${f} (Caracas). Fecha de hoy: ${todayVE(now)}`;
}

/** El estado completo de las cuentas de la persona, en texto compacto para Pilas. */
export function resumen(ctx: PilasCtx): string {
  const { user, bundles, rates } = ctx;
  const me = yo(ctx);
  const L: string[] = [];
  L.push(`YO: ${user.name} (${ref("p", me.id)}). Ve los montos en ${user.displayCurrency}; su tasa preferida es ${tasaNombre(user.rateSource)}.`);
  L.push(
    `TASAS DE HOY (Bs por unidad): dólar BCV ${fmt(Math.round(rates.bcvUsd * 100), "VES")} · euro BCV ${fmt(Math.round(rates.bcvEur * 100), "VES")}` +
      (rates.usdt ? ` · USDT Binance ${fmt(Math.round(rates.usdt * 100), "VES")}` : "") +
      ` (fecha valor BCV ${rates.bcvDate}).`,
  );

  L.push("", "PANAS REGISTRADOS (los únicos que pueden ir en una salida):");
  for (const p of ctx.panas.slice(0, 120)) L.push(`- ${p.name}${p.isMe ? " (yo)" : ""} (${ref("p", p.id)})${p.hasPayInfo ? "" : " · no ha cargado datos de pago"}`);

  const people = personBalances(bundles);
  const debo = people.filter((p) => p.iOwe > 0);
  const meDeben = people.filter((p) => p.owedToMe > 0);
  const item = (i: (typeof people)[number]["iOweItems"][number]) => {
    let s = `   · «${i.title}» (${ref("s", i.salidaId)}, ${prettyDay(i.date, true)}${i.closed ? ", cerrada" : ""}): ${usd(i.remainingUsd)} ≈ ${bs(ctx, i.remainingUsd, i.rateSource)} a ${tasaNombre(i.rateSource)}`;
    if (i.registeredRate) s += " (se anotó en Bs: se paga al equivalente de hoy)";
    if (i.cuota)
      s += ` — es Cashea por cuotas: ${i.cuota.pending.length} pendientes; la próxima es ${cuotaName(i.cuota.n)} (${dueLabel(i.cuota.daysLeft)}), para ponerse al día hay que pagar ${usd(i.cuota.payUsd)}`;
    return s;
  };
  const totalDebo = debo.reduce((a, p) => a + p.iOwe, 0);
  const totalMeDeben = meDeben.reduce((a, p) => a + p.owedToMe, 0);
  L.push("", debo.length ? `LO QUE YO DEBO (total ${usd(totalDebo)} ≈ ${bs(ctx, totalDebo)}):` : "LO QUE YO DEBO: nada 🎉");
  for (const p of debo) {
    L.push(`- A ${p.name} (${ref("p", p.userId)}): ${usd(p.iOwe)}`);
    for (const i of p.iOweItems) L.push(item(i));
  }
  L.push("", meDeben.length ? `LO QUE ME DEBEN (total ${usd(totalMeDeben)} ≈ ${bs(ctx, totalMeDeben)}):` : "LO QUE ME DEBEN: nada");
  for (const p of meDeben) {
    L.push(`- ${p.name} (${ref("p", p.userId)}) me debe ${usd(p.owedToMe)}`);
    for (const i of p.theyOweItems) L.push(item(i));
  }

  const cobros = pendingConfirmations(bundles, "cobro");
  if (cobros.length) {
    L.push("", "PAGOS QUE ME HICIERON Y YO TENGO QUE CONFIRMAR (¿le llegó?):");
    for (const c of cobros)
      L.push(
        `- ${c.fromName} dice que me pagó ${usd(c.totalUsd)}${c.currency !== "USD" ? ` (${fmt(c.amount, c.currency as Currency)})` : ""} por ${payMethodOf(c.method).label}${c.reference ? `, referencia ${c.reference}` : ""}, el ${prettyDay(ymdOf(c.createdAt), true)}, por ${c.salidas.map((s) => `«${s.title}»`).join(", ")} (${ref("pago", c.batchId)})`,
      );
  }
  const pagos = pendingConfirmations(bundles, "pago");
  if (pagos.length) {
    L.push("", "PAGOS QUE YO HICE Y ESPERAN QUE LOS CONFIRMEN:");
    for (const c of pagos) L.push(`- Le pagué ${usd(c.totalUsd)} a ${c.toName} por ${payMethodOf(c.method).label} el ${prettyDay(ymdOf(c.createdAt), true)} (${c.salidas.map((s) => `«${s.title}»`).join(", ")})`);
  }

  const abiertas = bundles.filter((b) => !b.ledger.group.closedAt && b.ledger.expenses[0]);
  L.push("", abiertas.length ? `SALIDAS ABIERTAS (${abiertas.length}):` : "SALIDAS ABIERTAS: ninguna");
  for (const b of abiertas.slice(0, 20)) L.push(lineaSalida(ctx, b));
  if (abiertas.length > 20) L.push(`- …y ${abiertas.length - 20} más (usa buscar_salidas).`);
  const cerradas = bundles.length - abiertas.length;
  if (cerradas > 0) L.push(`(Además hay ${cerradas} salidas cerradas; búscalas con buscar_salidas.)`);

  const dues = casheaDues(bundles, 45).slice(0, 8);
  if (dues.length) {
    L.push("", "CUOTAS DE CASHEA QUE VIENEN (45 días):");
    for (const d of dues)
      L.push(
        `- ${d.store}: cuota ${d.n}/${d.installments}, ${relativeDue(d.dueDate)} (${d.dueDate}): ${
          d.iAmHolder ? `${usd(d.amountUsd)} a Cashea (la orden es mía)` : `mi parte ${usd(d.myPartUsd)}, se la pago a ${d.holderName}`
        }${d.paid ? " · ya pagada" : ""}`,
      );
  }
  return L.join("\n");
}

const ESTADO: Record<string, string> = {
  puso: "puso la plata, no debe",
  pagado: "ya pagó",
  "por-confirmar": "pagó, falta que le confirmen",
  parcial: "pagó una parte",
  falta: "no ha pagado",
};

function eLikeOf(b: Bundle) {
  const e = b.ledger.expenses[0];
  return {
    payers: e.payers.map((p) => ({ memberId: p.memberId, amountUsd: p.amountUsd })),
    shares: e.shares.map((s) => ({ memberId: s.memberId, amountUsd: s.amountUsd })),
  };
}

/** Una línea por salida: lo justo para ubicarla. */
function lineaSalida(ctx: PilasCtx, b: Bundle): string {
  const { ledger } = b;
  const e = ledger.expenses[0];
  const me = ledger.me.id;
  const st = shareStatuses(eLikeOf(b), ledger.settlements.filter((s) => s.expenseId === e.id));
  const mine = st.find((s) => s.memberId === me);
  const prog = paidProgress(st);
  const miEstado = mine ? (mine.owesUsd > 0 ? `yo ${ESTADO[mine.status]}` : mine.putUsd > 0 ? "yo puse la plata" : "") : "";
  return `- «${e.title}» (${ref("s", ledger.group.id)}) ${categoryOf(e.category).emoji} ${prettyDay(ymdOf(e.spentAt), true)} · total ${usd(e.amountUsd)} · mi parte ${usd(mine?.shareUsd ?? 0)} · ${ledger.members.length} panas · ${
    prog.debtors ? `${prog.paid}/${prog.debtors} ya pagaron` : "nadie debe"
  }${miEstado ? ` · ${miEstado}` : ""}${ledger.group.closedAt ? " · cerrada" : ""}`;
}

/** Todo el detalle de una salida, para explicar de dónde sale cada número. */
export function detalleSalida(ctx: PilasCtx, b: Bundle): string {
  const { ledger } = b;
  const e = ledger.expenses[0];
  if (!e) return "Esa salida no tiene cuenta anotada.";
  const name = (id: string) => {
    const m = ledger.members.find((x) => x.id === id);
    return m ? (m.id === ledger.me.id ? `${m.name} (yo)` : m.name) : "?";
  };
  const cur = e.currency as Currency;
  const creator = ledger.members.find((m) => m.userId && m.userId === ledger.group.createdBy);
  const L: string[] = [];
  L.push(
    `«${e.title}» (${ref("s", ledger.group.id)}) · ${categoryLabel(e)} · ${prettyDay(ymdOf(e.spentAt), true)}${e.place ? ` · en ${e.place}` : ""} · ${
      ledger.group.closedAt ? "CERRADA" : "abierta"
    }${creator ? ` · la anotó ${creator.name}` : ""}`,
  );
  L.push(
    `Cuenta: ${fmt(e.amount, cur)}${cur !== "USD" ? ` = ${usd(e.amountUsd)} (tasa ${tasaNombre(e.fx.source === "custom" ? ledger.group.rateSource : e.fx.source)}: ${fmt(Math.round(e.fx.vesPerUsd * 100), "VES")} por $ del ${e.fx.date ?? ymdOf(e.spentAt)})` : ""}`,
  );
  if (cur === "VES" && !ledger.group.closedAt) L.push(`Como se anotó en bolívares, la deuda quedó en dólares y hoy se paga al equivalente de hoy a ${tasaNombre(ledger.group.rateSource)}.`);

  const sp = e.split;
  const money = (c: number) => fmt(c, cur);
  if (sp.mode === "equal") L.push(`División: partes iguales entre ${sp.members?.length ?? 0}: ${(sp.members ?? []).map(name).join(", ")}${sp.base != null ? ` (base ${money(sp.base)})` : ""}.`);
  if (sp.mode === "exact") L.push(`División: montos exactos: ${Object.entries(sp.amounts ?? {}).map(([k, v]) => `${name(k)} ${money(v)}`).join(", ")}.`);
  if (sp.mode === "percent") L.push(`División por porcentaje: ${Object.entries(sp.percents ?? {}).map(([k, v]) => `${name(k)} ${v} %`).join(", ")}.`);
  if (sp.mode === "shares") L.push(`División por partes: ${Object.entries(sp.weights ?? {}).map(([k, v]) => `${name(k)} ${v}`).join(", ")}.`);
  if (sp.mode === "items") {
    L.push("División por lo que pidió cada quien:");
    for (const it of sp.items ?? []) L.push(`   · ${it.qty} × ${it.name} a ${money(it.price)} → ${it.members.map(name).join(", ") || "nadie"}`);
  }
  for (const x of sp.extras ?? []) L.push(`Extra: ${x.label} ${x.kind === "percent" ? `${x.value} %` : money(x.value)} (se reparte en proporción a lo de cada quien).`);

  L.push(`Quién puso la plata: ${e.payers.map((p) => `${name(p.memberId)} ${fmt(p.amount, p.currency as Currency)} con ${payMethodOf(p.method).label}`).join("; ")}.`);
  L.push(`Lo que le toca a cada quien: ${e.shares.map((s) => `${name(s.memberId)} ${usd(s.amountUsd)}`).join(", ")}.`);

  const linked = ledger.settlements.filter((s) => s.expenseId === e.id);
  const eLike = eLikeOf(b);
  L.push("Cómo va cada quien:");
  for (const st of shareStatuses(eLike, linked)) {
    const parts = debtSplit(eLike, st.memberId);
    const a = parts.map((p) => `${usd(p.amountUsd)} a ${name(p.to)}`).join(" y ");
    L.push(
      `   · ${name(st.memberId)}: le tocaba ${usd(st.shareUsd)}, puso ${usd(st.putUsd)}${st.owesUsd > 0 ? ` → debía ${a}; pagó ${usd(st.paidUsd)}${st.pendingUsd ? ` (${usd(st.pendingUsd)} sin confirmar)` : ""}; ${ESTADO[st.status]}` : st.putUsd > st.shareUsd ? ` → le deben ${usd(st.putUsd - st.shareUsd)}` : " → a mano"}`,
    );
  }
  if (linked.length) {
    L.push("Pagos anotados:");
    for (const s of [...linked].sort((x, y) => +new Date(x.paidAt) - +new Date(y.paidAt)))
      L.push(
        `   · ${prettyDay(ymdOf(s.paidAt), true)}: ${name(s.fromMember)} → ${name(s.toMember)} ${usd(s.amountUsd)}${s.currency !== "USD" ? ` (${fmt(s.amount, s.currency as Currency)})` : ""} por ${payMethodOf(s.method).label}${s.reference ? `, ref ${s.reference}` : ""}${s.cuotaN != null ? `, ${cuotaName(s.cuotaN)} de Cashea` : ""}${s.confirmedAt ? "" : " · SIN CONFIRMAR"}`,
      );
  }
  for (const plan of ledger.cashea.filter((p) => p.expenseId === e.id)) {
    L.push(
      `Cashea: lo pagó ${name(plan.memberId)} en ${plan.store ?? "la tienda"} (${plan.mode === "espejo" ? "modo espejo: cada pana le paga su parte por cuotas" : "los demás le pagan su parte de una vez"}), orden ${usd(plan.totalUsd)}, inicial ${usd(plan.initialUsd)} y ${plan.installments} cuotas cada ${plan.intervalDays} días:`,
    );
    for (const c of plan.cuotas) L.push(`   · ${c.n === 0 ? "Inicial" : `Cuota ${c.n}`}: ${usd(c.amountUsd)}, ${c.dueDate}${c.paidAt ? " · pagada a Cashea" : ` · ${relativeDue(c.dueDate)}`}`);
  }
  if (e.notes) L.push(`Notas: ${e.notes}`);
  return L.join("\n");
}

export type FiltroSalidas = { texto?: string; pana?: string; desde?: string; hasta?: string; estado?: "abiertas" | "cerradas" | "todas" };

export function listarSalidas(ctx: PilasCtx, f: FiltroSalidas): string {
  const pana = f.pana ? buscarPana(ctx, f.pana) : null;
  const n = f.texto ? norm(f.texto) : "";
  const list = ctx.bundles
    .filter((b) => b.ledger.expenses[0])
    .filter((b) => {
      const e = b.ledger.expenses[0];
      const d = ymdOf(e.spentAt);
      if (f.desde && d < f.desde) return false;
      if (f.hasta && d > f.hasta) return false;
      if (f.estado === "abiertas" && b.ledger.group.closedAt) return false;
      if (f.estado === "cerradas" && !b.ledger.group.closedAt) return false;
      if (pana && !b.ledger.members.some((m) => m.userId === pana.id)) return false;
      if (n && !norm(`${e.title} ${e.place ?? ""} ${categoryLabel(e)}`).includes(n)) return false;
      return true;
    })
    .sort((a, b) => +b.ledger.expenses[0].spentAt - +a.ledger.expenses[0].spentAt);
  if (!list.length) return "No hay salidas con esos filtros.";
  return [`${list.length} salidas:`, ...list.slice(0, 30).map((b) => lineaSalida(ctx, b)), list.length > 30 ? `…y ${list.length - 30} más (afina la búsqueda).` : ""]
    .filter(Boolean)
    .join("\n");
}

/** Lo que la persona ha consumido (su parte) en un período. */
export function gastos(ctx: PilasCtx, desde: string, hasta: string): string {
  const meCat = new Map<string, number>();
  const meMes = new Map<string, number>();
  const pusieron = new Map<string, { name: string; usd: number }>();
  let mio = 0;
  let grupo = 0;
  let salidas = 0;
  let mayor: { t: string; usd: number } | null = null;
  for (const { ledger } of ctx.bundles) {
    for (const e of ledger.expenses) {
      const d = ymdOf(e.spentAt);
      if (d < desde || d > hasta) continue;
      salidas++;
      grupo += e.amountUsd;
      const m = e.shares.filter((s) => s.memberId === ledger.me.id).reduce((a, s) => a + s.amountUsd, 0);
      mio += m;
      meMes.set(d.slice(0, 7), (meMes.get(d.slice(0, 7)) ?? 0) + m);
      const cats = categoriesOf(e);
      allocate(m, cats.map(() => 1)).forEach((v, i) => meCat.set(cats[i].label, (meCat.get(cats[i].label) ?? 0) + v));
      if (!mayor || m > mayor.usd) mayor = { t: e.title, usd: m };
      for (const p of e.payers) {
        const mm = ledger.members.find((x) => x.id === p.memberId);
        if (!mm) continue;
        const k = mm.userId ?? mm.id;
        const cur = pusieron.get(k) ?? { name: mm.userId === ctx.user.id ? `${mm.name} (yo)` : mm.name, usd: 0 };
        cur.usd += p.amountUsd;
        pusieron.set(k, cur);
      }
    }
  }
  if (!salidas) return `Entre ${desde} y ${hasta} no hay salidas anotadas.`;
  const top = [...pusieron.values()].sort((a, b) => b.usd - a.usd)[0];
  return [
    `Entre ${desde} y ${hasta}: ${salidas} salidas. Mi parte (lo que consumí): ${usd(mio)} ≈ ${bs(ctx, mio)}. Lo que se gastó en total en esas salidas: ${usd(grupo)}.`,
    `Por tipo: ${[...meCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${usd(v)}`).join(", ")}.`,
    meMes.size > 1 ? `Por mes: ${[...meMes.entries()].sort().map(([k, v]) => `${k} ${usd(v)}`).join(", ")}.` : "",
    mayor ? `La salida donde más gasté: «${mayor.t}» (${usd(mayor.usd)}).` : "",
    top ? `Quien más plata puso: ${top.name} (${usd(top.usd)}).` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const primeroDeMes = () => `${todayVE().slice(0, 7)}-01`;
export const haceDias = (n: number) => addDays(todayVE(), -n);

/** Conversión exacta con las tasas de hoy. */
export function convertir(ctx: PilasCtx, monto: number, de: Currency, a: Currency, tasa: RateSourceId = ctx.user.rateSource): string {
  const r = ctx.rates;
  const dolar = vesPerUsd(r, tasa === "eur" ? "bcv" : tasa);
  const bsPor: Record<Currency, number> = { VES: 1, USD: dolar, EUR: r.bcvEur, USDT: r.usdt ?? r.bcvUsd };
  const enBs = monto * bsPor[de];
  const out = enBs / bsPor[a];
  const f = (v: number, c: Currency) => fmt(Math.round(v * 100), c);
  const usadas = [de, a].filter((c) => c !== "VES").map((c) => `${c === "USD" ? (tasa === "usdt" ? "dólar Binance" : "dólar BCV") : c === "EUR" ? "euro BCV" : "USDT Binance"} ${f(bsPor[c], "VES")}`);
  return `${f(monto, de)} = ${f(out, a)} (tasas de hoy: ${usadas.join(", ") || "sin conversión"}).`;
}
