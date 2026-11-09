import "server-only";
// Tarjetas visuales de Pilas: gráficos y resúmenes que se calculan con los datos reales (nunca con lo que diga la IA).
import { randomUUID } from "node:crypto";
import { categoriesOf, categoryOf } from "@/lib/constants";
import { diffDays, monthLabel, prettyDay, todayVE, ymdOf } from "@/lib/dates";
import { casheaDues, monthlySpending } from "@/lib/insights";
import { allocate } from "@/lib/money";
import { personBalances } from "@/lib/people";
import { rateHistory } from "@/lib/rates";
import { debtSplit, shareStatuses } from "@/lib/share-status";
import { buscarSalida, detalleSalida, usd, type PilasCtx } from "./datos";
import type { Tarjeta } from "./tipos";

type R = { texto: string; tarjeta: Tarjeta };
const id = () => randomUUID().slice(0, 8);

export function visualBalance(ctx: PilasCtx): R {
  const people = personBalances(ctx.bundles);
  const meDebenUsd = people.reduce((a, p) => a + p.owedToMe, 0);
  const deboUsd = people.reduce((a, p) => a + p.iOwe, 0);
  const personas = people
    .filter((p) => p.owedToMe || p.iOwe)
    .slice(0, 12)
    .map((p) => ({
      nombre: p.name,
      avatar: p.avatar,
      color: p.color,
      userId: p.userId,
      meDebeUsd: p.owedToMe,
      leDeboUsd: p.iOwe,
      items: [
        ...p.theyOweItems.map((x) => ({ titulo: x.title, usd: x.remainingUsd, salidaId: x.salidaId })),
        ...p.iOweItems.map((x) => ({ titulo: x.title, usd: -x.remainingUsd, salidaId: x.salidaId })),
      ],
    }));
  return {
    texto: `Tarjeta de balance mostrada (con barras por pana; al tocar a alguien se ve el detalle y los botones de pagar o recordar). Te deben ${usd(meDebenUsd)}, debes ${usd(deboUsd)}. ${personas
      .map((p) => `${p.nombre}: ${p.meDebeUsd ? `te debe ${usd(p.meDebeUsd)}` : ""}${p.meDebeUsd && p.leDeboUsd ? " y " : ""}${p.leDeboUsd ? `le debes ${usd(p.leDeboUsd)}` : ""}`)
      .join("; ")}`,
    tarjeta: { tipo: "balance", id: id(), meDebenUsd, deboUsd, personas },
  };
}

export function visualSalida(ctx: PilasCtx, q: string): R {
  const b = buscarSalida(ctx, q);
  const { ledger } = b;
  const e = ledger.expenses[0];
  if (!e) throw new Error("sin cuenta");
  const eLike = {
    payers: e.payers.map((p) => ({ memberId: p.memberId, amountUsd: p.amountUsd })),
    shares: e.shares.map((s) => ({ memberId: s.memberId, amountUsd: s.amountUsd })),
  };
  const linked = ledger.settlements.filter((s) => s.expenseId === e.id);
  const st = shareStatuses(eLike, linked);
  const name = (mid: string) => (mid === ledger.me.id ? "ti" : (ledger.members.find((m) => m.id === mid)?.name ?? "?"));
  const personas = st.map((s) => {
    const m = ledger.members.find((x) => x.id === s.memberId);
    const a = debtSplit(eLike, s.memberId).map((d) => name(d.to)).join(" y ");
    const detalle =
      s.status === "puso"
        ? s.putUsd > s.shareUsd
          ? `Puso ${usd(s.putUsd)}; le deben ${usd(s.putUsd - s.shareUsd)}`
          : `Le tocaban ${usd(s.shareUsd)}`
        : s.status === "pagado"
          ? `Ya le pagó ${usd(s.paidUsd)} a ${a}`
          : s.status === "por-confirmar"
            ? `Pagó ${usd(s.paidUsd)}; falta que ${a} confirme`
            : s.status === "parcial"
              ? `Pagó ${usd(s.paidUsd)} de ${usd(s.owesUsd)}; le debe ${usd(s.owesUsd - s.paidUsd)} a ${a}`
              : `Le debe ${usd(s.owesUsd)} a ${a}`;
    return { nombre: m?.name ?? "?", avatar: m?.avatar ?? "🙂", color: m?.color ?? "#999", yo: s.memberId === ledger.me.id, parteUsd: s.shareUsd, estado: s.status, detalle };
  });
  const debenUsd = st.reduce((x, s) => x + s.owesUsd, 0);
  const pagadoUsd = st.reduce((x, s) => x + Math.min(s.paidUsd, s.owesUsd), 0);
  const iCollect = st.some((s) => s.owesUsd > s.paidUsd && debtSplit(eLike, s.memberId).some((d) => d.to === ledger.me.id));
  const creator = !!ledger.group.createdBy && ledger.group.createdBy === ctx.user.id;
  return {
    texto: `Tarjeta visual de la salida mostrada (anillo con lo pagado y cada pana con su estado; al tocar a alguien se ve su detalle). Detalle para explicar:\n${detalleSalida(ctx, b)}`,
    tarjeta: {
      tipo: "salida_vista",
      id: id(),
      salidaId: ledger.group.id,
      titulo: e.title,
      emoji: categoryOf(e.category).emoji,
      fecha: prettyDay(ymdOf(e.spentAt), true),
      totalTexto: e.currency === "USD" ? usd(e.amountUsd) : `${e.currency === "VES" ? "Bs" : e.currency} ${(e.amount / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      totalUsd: e.amountUsd,
      debenUsd,
      pagadoUsd,
      cerrada: !!ledger.group.closedAt,
      puedoRecordar: !ledger.group.closedAt && (iCollect || creator) && st.some((s) => s.status === "falta" || s.status === "parcial"),
      personas,
    },
  };
}

export function visualGastos(ctx: PilasCtx, desde: string, hasta: string): R {
  const cat = new Map<string, number>();
  let total = 0;
  let salidas = 0;
  let mayor: { titulo: string; usd: number } | null = null;
  for (const { ledger } of ctx.bundles) {
    for (const e of ledger.expenses) {
      const d = ymdOf(e.spentAt);
      if (d < desde || d > hasta) continue;
      const mio = e.shares.filter((s) => s.memberId === ledger.me.id).reduce((a, s) => a + s.amountUsd, 0);
      if (mio <= 0) continue;
      salidas++;
      total += mio;
      if (!mayor || mio > mayor.usd) mayor = { titulo: e.title, usd: mio };
      const cats = categoriesOf(e);
      allocate(mio, cats.map(() => 1)).forEach((v, i) => cat.set(cats[i].id, (cat.get(cats[i].id) ?? 0) + v));
    }
  }
  const categorias = [...cat.entries()]
    .map(([k, v]) => ({ id: k, label: categoryOf(k).label, emoji: categoryOf(k).emoji, usd: v }))
    .sort((a, b) => b.usd - a.usd);
  const meses = monthlySpending(ctx.bundles, 6).map((m) => ({ key: m.month, label: monthLabel(m.month), usd: m.mine }));
  const periodo = desde.slice(0, 7) === hasta.slice(0, 7) && desde.endsWith("-01") ? monthLabel(desde.slice(0, 7)) : `${prettyDay(desde, true)} – ${prettyDay(hasta, true)}`;
  return {
    texto: `Tarjeta de gastos mostrada (columnas de los últimos 6 meses y barras por tipo). Período ${desde} a ${hasta}: ${salidas} salidas, tu parte ${usd(total)}. Por tipo: ${categorias.map((c) => `${c.label} ${usd(c.usd)}`).join(", ") || "nada"}. Por mes: ${meses.map((m) => `${m.label} ${usd(m.usd)}`).join(", ")}.${mayor ? ` La más cara: «${mayor.titulo}» ${usd(mayor.usd)}.` : ""}`,
    tarjeta: { tipo: "gastos", id: id(), periodo, totalUsd: total, salidas, meses, categorias, mayor },
  };
}

export function visualCuotas(ctx: PilasCtx): R {
  const hoy = todayVE();
  const cuotas = casheaDues(ctx.bundles, 60)
    .filter((d) => !d.paid)
    .slice(0, 10)
    .map((d) => ({
      tienda: d.store,
      n: d.n,
      de: d.installments,
      fecha: d.dueDate,
      dias: diffDays(d.dueDate, hoy),
      usd: d.iAmHolder ? d.amountUsd : d.myPartUsd,
      mia: d.iAmHolder,
      titular: d.holderName,
      salidaId: d.groupId,
    }));
  return {
    texto: cuotas.length
      ? `Tarjeta de cuotas mostrada (línea de tiempo). ${cuotas.map((c) => `${c.tienda} ${c.n}/${c.de} ${c.fecha} (${c.dias} días) ${usd(c.usd)} ${c.mia ? "a Cashea" : `a ${c.titular}`}`).join("; ")}`
      : "No hay cuotas de Cashea pendientes en los próximos 60 días (tarjeta vacía mostrada).",
    tarjeta: { tipo: "cuotas", id: id(), cuotas },
  };
}

export async function visualTasas(ctx: PilasCtx): Promise<R> {
  const h = await rateHistory(30);
  const r = ctx.rates;
  const pick = (k: "bcvUsd" | "bcvEur" | "usdt") => h.map((x) => x[k]).filter((v): v is number => v != null);
  return {
    texto: `Tarjeta de tasas mostrada (con curvas de 30 días y un convertidor en vivo). Dólar BCV ${r.bcvUsd}, euro BCV ${r.bcvEur}, USDT ${r.usdt ?? "sin dato"} (Bs por unidad, fecha valor ${r.bcvDate}).`,
    tarjeta: {
      tipo: "tasas",
      id: id(),
      bcvUsd: r.bcvUsd,
      bcvEur: r.bcvEur,
      usdt: r.usdt,
      fecha: r.bcvDate,
      historia: { bcvUsd: pick("bcvUsd"), bcvEur: pick("bcvEur"), usdt: pick("usdt") },
      cambio: r.change ?? {},
    },
  };
}
