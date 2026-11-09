import "server-only";
// Las herramientas de Pilas. Las de leer consultan las cuentas de quien escribe; las de «proponer» solo arman
// una tarjeta con un botón: nada se anota ni se envía hasta que la persona lo toca.
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { SalidaInput } from "@/app/actions/salidas";
import { CATEGORIES, categoryOf, PAY_METHODS, payMethodOf } from "@/lib/constants";
import { prettyDay, todayVE, ymdOf } from "@/lib/dates";
import { allocate, CURRENCIES, fmt, toCents, toUsdCents, type Currency } from "@/lib/money";
import { pendingConfirmations, personBalances } from "@/lib/people";
import { getRatesForDate } from "@/lib/rates";
import { vesPerUsd, type RateSourceId } from "@/lib/rates-shared";
import { debtSplit, remainingTo, shareStatuses } from "@/lib/share-status";
import { computeSplit, sharesToUsd, SplitError, type Extra, type SplitInput } from "@/lib/split";
import {
  buscarPana,
  buscarSalida,
  convertir,
  detalleSalida,
  gastos,
  listarSalidas,
  NoEncontrado,
  primeroDeMes,
  ref,
  resumen,
  usd,
  yo,
  type PilasCtx,
} from "./datos";
import type { PersonaVista, Tarjeta } from "./tipos";

const CAT_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const METODOS = PAY_METHODS.map((m) => m.id) as [string, ...string[]];
const fechaZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.");

const S = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties: props,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });
const pana = str("Ref del pana (p:xxxxxxxx) o su nombre. «yo» es quien escribe.");
const salida = str("Ref de la salida (s:xxxxxxxx) o su nombre.");

export const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "mis_cuentas",
    description:
      "Estado actualizado de las cuentas de quien escribe: lo que debe y a quién, lo que le deben, pagos por confirmar, salidas abiertas, cuotas de Cashea y tasas de hoy. Úsala cuando los datos puedan haber cambiado.",
    input_schema: S({}),
  },
  {
    name: "ver_salida",
    description:
      "Todo el detalle de una salida: cuenta, tasa, cómo se dividió (ítems, extras), quién puso la plata, cuánto le toca a cada quien, quién ya pagó, pagos anotados y Cashea. Úsala para explicar de dónde sale una deuda.",
    input_schema: S({ salida }, ["salida"]),
  },
  {
    name: "buscar_salidas",
    description: "Lista salidas (también las cerradas) con filtros opcionales: texto del nombre o lugar, un pana que fue, rango de fechas y estado.",
    input_schema: S({
      texto: str("Parte del nombre, lugar o tipo."),
      pana: str("Solo salidas donde fue este pana (ref o nombre)."),
      desde: str("AAAA-MM-DD"),
      hasta: str("AAAA-MM-DD"),
      estado: { type: "string", enum: ["abiertas", "cerradas", "todas"] },
    }),
  },
  {
    name: "gastos",
    description:
      "Cuánto ha consumido quien escribe (su parte) en un período: total, por tipo de salida, por mes, su salida más cara y quién puso más plata. Sin fechas: el mes en curso.",
    input_schema: S({ desde: str("AAAA-MM-DD"), hasta: str("AAAA-MM-DD") }),
  },
  {
    name: "convertir",
    description: "Convierte un monto entre dólares, bolívares, euros y USDT con las tasas de hoy. Úsala siempre en vez de calcular tasas de memoria.",
    input_schema: S(
      {
        monto: { type: "number", description: "En unidades (20.5 = 20,50), no en centavos." },
        de: { type: "string", enum: [...CURRENCIES] },
        a: { type: "string", enum: [...CURRENCIES] },
        tasa: { type: "string", enum: ["bcv", "usdt"], description: "Para el dólar: BCV (oficial) o Binance. Sin indicar: la preferida de la persona." },
      },
      ["monto", "de", "a"],
    ),
  },
  {
    name: "proponer_salida",
    description:
      "Arma una salida nueva y se la muestra a la persona en una tarjeta con el botón «Anotar». No anota nada por sí sola. Necesitas qué fue, el monto y la moneda, quiénes fueron y quién puso la plata. Para Cashea, porcentajes o casos raros, manda a la persona al formulario con mostrar_boton.",
    input_schema: S(
      {
        titulo: str("Nombre corto: «Arepera del viernes», «Playa en Choroní»."),
        categoria: { type: "string", enum: CAT_IDS, description: "Tipo principal." },
        categorias_extra: { type: "array", items: { type: "string", enum: CAT_IDS } },
        fecha: str("AAAA-MM-DD. Sin indicar: hoy. No puede ser futura."),
        lugar: str("Opcional."),
        notas: str("Opcional."),
        moneda: { type: "string", enum: [...CURRENCIES], description: "Moneda de la cuenta." },
        tasa: { type: "string", enum: ["bcv", "usdt", "eur"], description: "Tasa para convertir. Sin indicar: la preferida de la persona." },
        participantes: { type: "array", items: { type: "string" }, description: "Quiénes fueron (refs o nombres de panas registrados). Quien escribe va incluido aunque no lo pongas." },
        pagadores: {
          type: "array",
          description: "Quién puso la plata. Con un solo pagador sin monto, se asume que pagó todo.",
          items: S(
            {
              pana,
              monto: { type: "number", description: "En unidades de su moneda." },
              moneda: { type: "string", enum: [...CURRENCIES], description: "Si pagó en otra moneda que la cuenta." },
              metodo: { type: "string", enum: METODOS },
            },
            ["pana"],
          ),
        },
        division: S(
          {
            modo: { type: "string", enum: ["igual", "montos", "items"] },
            total: { type: "number", description: "Modo igual: el monto de la cuenta antes de extras, en unidades." },
            entre: { type: "array", items: { type: "string" }, description: "Modo igual: si no se divide entre todos, entre quiénes." },
            montos: { type: "array", items: S({ pana, monto: { type: "number" } }, ["pana", "monto"]), description: "Modo montos: lo de cada quien, en unidades." },
            items: {
              type: "array",
              description: "Modo items: lo que pidió cada quien (de la factura).",
              items: S(
                {
                  nombre: { type: "string" },
                  precio: { type: "number", description: "Precio unitario en unidades." },
                  cantidad: { type: "number" },
                  panas: { type: "array", items: { type: "string" }, description: "Quiénes lo consumieron (se reparte igual entre ellos)." },
                },
                ["nombre", "precio", "panas"],
              ),
            },
          },
          ["modo"],
        ),
        extras: {
          type: "array",
          description: "Servicio, propina, IVA, IGTF, delivery… Se reparten en proporción a lo de cada quien.",
          items: S({ nombre: { type: "string" }, tipo: { type: "string", enum: ["porcentaje", "fijo"] }, valor: { type: "number" } }, ["nombre", "tipo", "valor"]),
        },
        ya_pagaron: { type: "array", items: { type: "string" }, description: "Panas que ya le pagaron su parte a quien puso la plata." },
      },
      ["titulo", "categoria", "moneda", "participantes", "pagadores", "division"],
    ),
  },
  {
    name: "proponer_recordatorio",
    description:
      "Tarjeta para mandarle un recordatorio de pago (aviso en la app y notificación) a un pana que le debe a quien escribe, o a los que faltan por pagar en una salida.",
    input_schema: S({ pana: str("A quién (ref o nombre). Sin salida: le recuerda todo lo que le debe."), salida: str("Opcional: solo esa salida.") }),
  },
  {
    name: "proponer_mensaje",
    description:
      "Tarjeta con un mensaje para un pana, que la persona puede mandar como aviso de la app o por WhatsApp. Escríbelo tú en tono venezolano, cariñoso y corto (máx. 280 caracteres).",
    input_schema: S({ pana, texto: { type: "string" } }, ["pana", "texto"]),
  },
  {
    name: "proponer_marcar_pagado",
    description:
      "Tarjeta para que quien cobra anote que un pana ya le pagó: todo lo que le debía o solo su parte de una salida. Úsala cuando la persona diga que le pagaron por fuera de la app.",
    input_schema: S({
      pana,
      salida: str("Opcional: solo esa salida."),
      metodo: { type: "string", enum: METODOS },
      moneda: { type: "string", enum: ["USD", "VES"] },
    }),
  },
  {
    name: "proponer_confirmar_pago",
    description: "Tarjeta para confirmar (o rechazar) un pago que un pana dice que le hizo a quien escribe y que está esperando confirmación.",
    input_schema: S({ pago: str("Ref del pago (pago:xxxxxxxx) o el nombre de quien pagó.") }, ["pago"]),
  },
  {
    name: "mostrar_boton",
    description: "Botón para abrir una pantalla de la app. Úsalo para pagar (ahí están los datos para copiar), ver una salida, el formulario completo, Cashea, tasas, perfil, invitar, etc.",
    input_schema: S(
      {
        destino: {
          type: "string",
          enum: ["pagar", "salida", "editar_salida", "nueva_salida", "pana", "panas", "invitar", "cashea", "tasas", "historial", "perfil_pago", "perfil", "avisos", "calculadora"],
        },
        pana: str("Para «pagar» o «pana»."),
        salida: str("Para «salida», «editar_salida» o «pagar» una salida."),
        texto: str("Texto del botón (opcional)."),
      },
      ["destino"],
    ),
  },
];

/** Lo que se ve en el chat mientras corre cada herramienta. */
export const ETIQUETAS: Record<string, string> = {
  mis_cuentas: "Revisando tus cuentas",
  ver_salida: "Abriendo la salida",
  buscar_salidas: "Buscando en tus salidas",
  gastos: "Sacando la cuenta de tus gastos",
  convertir: "Calculando a la tasa de hoy",
  proponer_salida: "Armando la salida",
  proponer_recordatorio: "Preparando el recordatorio",
  proponer_mensaje: "Redactando el mensaje",
  proponer_marcar_pagado: "Preparando el pago",
  proponer_confirmar_pago: "Buscando ese pago",
  mostrar_boton: "Buscando la pantalla",
};

export type Resultado = { texto: string; tarjeta?: Tarjeta; error?: boolean };

const id = () => randomUUID().slice(0, 8);
const vista = (p: { name: string; avatar: string; color: string }): PersonaVista => ({ nombre: p.name, avatar: p.avatar, color: p.color });
const defaultMethod = (c: Currency) => (c === "USD" ? "efectivo_usd" : c === "VES" ? "pago_movil" : c === "EUR" ? "efectivo_eur" : "binance");
const monedaDeMetodo = (m?: string): "USD" | "VES" => (m && payMethodOf(m).currency === "VES" ? "VES" : "USD");
const listaZ = z.array(z.string().trim().min(1)).max(60);

export async function ejecutar(name: string, raw: unknown, ctx: PilasCtx): Promise<Resultado> {
  try {
    switch (name) {
      case "mis_cuentas":
        return { texto: resumen(ctx) };
      case "ver_salida": {
        const i = z.object({ salida: z.string().min(1) }).parse(raw);
        return { texto: detalleSalida(ctx, buscarSalida(ctx, i.salida)) };
      }
      case "buscar_salidas": {
        const i = z
          .object({ texto: z.string().optional(), pana: z.string().optional(), desde: fechaZ.optional(), hasta: fechaZ.optional(), estado: z.enum(["abiertas", "cerradas", "todas"]).optional() })
          .parse(raw);
        return { texto: listarSalidas(ctx, i) };
      }
      case "gastos": {
        const i = z.object({ desde: fechaZ.optional(), hasta: fechaZ.optional() }).parse(raw);
        return { texto: gastos(ctx, i.desde ?? primeroDeMes(), i.hasta ?? todayVE()) };
      }
      case "convertir": {
        const i = z.object({ monto: z.number().min(0).max(1e12), de: z.enum(CURRENCIES), a: z.enum(CURRENCIES), tasa: z.enum(["bcv", "usdt"]).optional() }).parse(raw);
        return { texto: convertir(ctx, i.monto, i.de, i.a, i.tasa) };
      }
      case "proponer_salida":
        return await proponerSalida(raw, ctx);
      case "proponer_recordatorio":
        return proponerRecordatorio(raw, ctx);
      case "proponer_mensaje": {
        const i = z.object({ pana: z.string().min(1), texto: z.string().trim().min(1).max(300) }).parse(raw);
        const p = buscarPana(ctx, i.pana);
        if (p.isMe) return { texto: "No te puedes mandar mensajes a ti mismo.", error: true };
        return {
          texto: `Tarjeta lista con el mensaje para ${p.name}: la persona lo manda con un toque (aviso de la app o WhatsApp). Todavía NO se ha enviado.`,
          tarjeta: { tipo: "mensaje", id: id(), userId: p.id, persona: vista(p), texto: i.texto },
        };
      }
      case "proponer_marcar_pagado":
        return proponerPagado(raw, ctx);
      case "proponer_confirmar_pago":
        return proponerConfirmar(raw, ctx);
      case "mostrar_boton":
        return mostrarBoton(raw, ctx);
      default:
        return { texto: `No existe la herramienta «${name}».`, error: true };
    }
  } catch (e) {
    if (e instanceof NoEncontrado) return { texto: e.message, error: true };
    if (e instanceof z.ZodError) return { texto: `Datos inválidos: ${e.issues.map((x) => `${x.path.join(".") || "entrada"}: ${x.message}`).join("; ")}`, error: true };
    console.error("[pilas] herramienta", name, (e as Error).message);
    return { texto: "Falló esa consulta. Discúlpate y sugiere hacerlo desde la pantalla de la app.", error: true };
  }
}

// ── proponer_salida ──
const salidaZ = z.object({
  titulo: z.string().trim().min(1).max(80),
  categoria: z.enum(CAT_IDS),
  categorias_extra: z.array(z.enum(CAT_IDS)).max(CATEGORIES.length).optional(),
  fecha: fechaZ.optional(),
  lugar: z.string().trim().max(80).optional(),
  notas: z.string().trim().max(500).optional(),
  moneda: z.enum(CURRENCIES),
  tasa: z.enum(["bcv", "usdt", "eur"]).optional(),
  participantes: listaZ,
  pagadores: z
    .array(z.object({ pana: z.string().min(1), monto: z.number().positive().max(1e11).optional(), moneda: z.enum(CURRENCIES).optional(), metodo: z.enum(METODOS).optional() }))
    .min(1)
    .max(10),
  division: z.object({
    modo: z.enum(["igual", "montos", "items"]),
    total: z.number().positive().max(1e11).optional(),
    entre: listaZ.optional(),
    montos: z.array(z.object({ pana: z.string().min(1), monto: z.number().min(0).max(1e11) })).max(60).optional(),
    items: z
      .array(z.object({ nombre: z.string().trim().min(1).max(80), precio: z.number().min(0).max(1e11), cantidad: z.number().positive().max(1000).optional(), panas: listaZ.min(1) }))
      .max(150)
      .optional(),
  }),
  extras: z.array(z.object({ nombre: z.string().trim().min(1).max(40), tipo: z.enum(["porcentaje", "fijo"]), valor: z.number().min(0).max(1e11) })).max(8).optional(),
  ya_pagaron: listaZ.optional(),
});

/** Arma la salida igual que el formulario (mismo cálculo) y la deja lista para «Anotar». */
export async function armarSalida(raw: unknown, ctx: PilasCtx): Promise<{ input: SalidaInput; vista: Extract<Tarjeta, { tipo: "salida" }>["vista"]; resumen: string }> {
  const d = salidaZ.parse(raw);
  const me = yo(ctx);
  const fecha = d.fecha ?? todayVE();
  if (fecha > todayVE()) throw new NoEncontrado("La fecha no puede ser futura.");
  const P = (q: string) => buscarPana(ctx, q);
  const byId = new Map(ctx.panas.map((p) => [p.id, p]));

  const payers = d.pagadores.map((p) => ({ ...p, id: P(p.pana).id }));
  const participants = [...new Set([me.id, ...d.participantes.map((q) => P(q).id), ...payers.map((p) => p.id)])];
  if (participants.length < 2) throw new NoEncontrado("Una salida es de al menos 2 panas: ¿quién más fue?");

  const cur = d.moneda;
  let split: SplitInput;
  if (d.division.modo === "igual") {
    if (!d.division.total) throw new NoEncontrado("Falta el monto de la cuenta (division.total).");
    const entre = d.division.entre?.length ? [...new Set(d.division.entre.map((q) => P(q).id))] : participants;
    for (const x of entre) if (!participants.includes(x)) participants.push(x);
    split = { mode: "equal", base: toCents(d.division.total), members: entre };
  } else if (d.division.modo === "montos") {
    if (!d.division.montos?.length) throw new NoEncontrado("Faltan los montos de cada quien (division.montos).");
    const amounts: Record<string, number> = {};
    for (const m of d.division.montos) {
      const pid = P(m.pana).id;
      amounts[pid] = (amounts[pid] ?? 0) + toCents(m.monto);
      if (!participants.includes(pid)) participants.push(pid);
    }
    split = { mode: "exact", amounts };
  } else {
    if (!d.division.items?.length) throw new NoEncontrado("Faltan los ítems (division.items).");
    const items = d.division.items.map((it, k) => {
      const members = [...new Set(it.panas.map((q) => P(q).id))];
      for (const x of members) if (!participants.includes(x)) participants.push(x);
      return { id: `i${k + 1}`, name: it.nombre, price: toCents(it.precio), qty: it.cantidad ?? 1, members };
    });
    split = { mode: "items", items };
  }
  const extras: Extra[] = (d.extras ?? [])
    .filter((x) => x.valor > 0)
    .map((x, k) => ({ id: `x${k + 1}`, label: x.nombre, kind: x.tipo === "porcentaje" ? "percent" : "fixed", value: x.tipo === "porcentaje" ? x.valor : toCents(x.valor) }));

  let res;
  try {
    res = computeSplit(split, extras);
  } catch (e) {
    throw new NoEncontrado(e instanceof SplitError ? e.message : "No pude calcular la división.");
  }

  // Tasas del día de la salida (como el formulario).
  const source = (d.tasa ?? ctx.user.rateSource) as RateSourceId;
  const rates = fecha < todayVE() ? ((await getRatesForDate(fecha)) ?? ctx.rates) : ctx.rates;
  const fx = { vesPerUsd: vesPerUsd(rates, source), vesPerEur: rates.bcvEur, vesPerUsdt: rates.usdt };
  const totalUsd = toUsdCents(res.total, cur, fx);

  if (payers.length > 1 && payers.some((p) => !p.monto)) throw new NoEncontrado("Con varios pagadores necesito cuánto puso cada uno.");
  const payerRows = payers.map((p) => {
    const c = p.monto ? (p.moneda ?? cur) : cur;
    const amount = p.monto ? toCents(p.monto) : res.total;
    return { memberId: p.id, currency: c, amount, method: p.metodo ?? defaultMethod(c), usd: toUsdCents(amount, c, fx) };
  });
  const paidUsd = payerRows.reduce((a, p) => a + p.usd, 0);
  if (Math.abs(paidUsd - totalUsd) > Math.max(3, Math.round(totalUsd * 0.005))) {
    throw new NoEncontrado(
      `Lo que pusieron (${usd(paidUsd)}) no cuadra con el total de la cuenta ${fmt(res.total, cur)} (${usd(totalUsd)})${extras.length ? ", que ya incluye los extras" : ""}. Pregúntale a la persona cuál es el monto correcto.`,
    );
  }
  if (payerRows.filter((p) => p.method === "cashea").length) throw new NoEncontrado("Con Cashea hay que anotarla en el formulario (lleva cuotas): manda mostrar_boton con destino nueva_salida.");
  const payersUsd = allocate(totalUsd, payerRows.map((p) => p.usd));
  const sharesUsd = sharesToUsd(res.shares, totalUsd);

  const eLike = {
    payers: payerRows.map((p, i) => ({ memberId: p.memberId, amountUsd: payersUsd[i] })),
    shares: Object.entries(sharesUsd).map(([memberId, amountUsd]) => ({ memberId, amountUsd })),
  };
  const debtors = new Set(participants.filter((x) => debtSplit(eLike, x).length));
  const yaPagaron = [...new Set((d.ya_pagaron ?? []).map((q) => P(q).id))].filter((x) => debtors.has(x));

  const input: SalidaInput = {
    participants,
    title: d.titulo,
    category: d.categoria,
    extraCategories: (d.categorias_extra ?? []).filter((c) => c !== d.categoria),
    place: d.lugar || undefined,
    notes: d.notas || undefined,
    date: fecha,
    currency: cur,
    fx: { source, vesPerUsd: fx.vesPerUsd, vesPerEur: fx.vesPerEur, vesPerUsdt: fx.vesPerUsdt ?? null, date: rates.bcvDate },
    split: {
      mode: split.mode,
      base: split.mode === "equal" ? split.base : undefined,
      members: split.mode === "equal" ? split.members : undefined,
      amounts: split.mode === "exact" ? split.amounts : undefined,
      items: split.mode === "items" ? split.items : undefined,
      extras,
    },
    payers: payerRows.map(({ memberId, currency, amount, method }) => ({ memberId, currency, amount, method })),
    paidMembers: yaPagaron,
  };

  const name = (x: string) => byId.get(x)?.name ?? "?";
  const deudas = participants.flatMap((x) => debtSplit(eLike, x).map((t) => ({ de: name(x), a: name(t.to), usd: t.amountUsd })));
  const division =
    (split.mode === "equal" ? `Partes iguales entre ${split.members.length}` : split.mode === "exact" ? "Montos exactos" : "Por lo que pidió cada quien") +
    (extras.length ? ` · con ${extras.map((x) => (x.kind === "percent" && !x.label.includes(String(x.value)) ? `${x.label} ${x.value} %` : x.label)).join(", ")}` : "");
  const cat = categoryOf(d.categoria);
  const v = {
    titulo: d.titulo,
    emoji: cat.emoji,
    fecha: prettyDay(fecha, true),
    totalTexto: fmt(res.total, cur),
    totalUsd,
    division,
    personas: participants.map((x) => ({
      ...vista(byId.get(x) ?? { name: "?", avatar: "🙂", color: "#999" }),
      parteUsd: sharesUsd[x] ?? 0,
      pusoUsd: eLike.payers.filter((p) => p.memberId === x).reduce((a, p) => a + p.amountUsd, 0),
      yaPago: yaPagaron.includes(x),
    })),
    deudas,
  };
  const resumenTxt = [
    `«${d.titulo}» ${cat.emoji} · ${fecha} · total ${fmt(res.total, cur)}${cur !== "USD" ? ` = ${usd(totalUsd)} (tasa ${source.toUpperCase()} ${fmt(Math.round(fx.vesPerUsd * 100), "VES")})` : ""} · ${division}`,
    `Partes: ${participants.map((x) => `${name(x)} ${usd(sharesUsd[x] ?? 0)}`).join(", ")}`,
    `Puso la plata: ${payerRows.map((p) => `${name(p.memberId)} ${fmt(p.amount, p.currency)} (${payMethodOf(p.method).label})`).join("; ")}`,
    deudas.length ? `Quedarían debiendo: ${deudas.map((t) => `${t.de} → ${t.a} ${usd(t.usd)}${yaPagaron.some((y) => name(y) === t.de) ? " (ya pagó)" : ""}`).join("; ")}` : "Nadie quedaría debiendo.",
  ].join("\n");
  return { input, vista: v, resumen: resumenTxt };
}

async function proponerSalida(raw: unknown, ctx: PilasCtx): Promise<Resultado> {
  const { input, vista: v, resumen: r } = await armarSalida(raw, ctx);
  return {
    texto: `Tarjeta lista con el botón «Anotar salida». TODAVÍA NO ESTÁ ANOTADA: la persona la revisa y la anota con un toque.\n${r}`,
    tarjeta: { tipo: "salida", id: id(), input, vista: v },
  };
}

// ── Recordatorios, pagos y confirmaciones ──
function proponerRecordatorio(raw: unknown, ctx: PilasCtx): Resultado {
  const i = z.object({ pana: z.string().optional(), salida: z.string().optional() }).parse(raw);
  const p = i.pana ? buscarPana(ctx, i.pana) : null;
  if (p?.isMe) return { texto: "No te puedes mandar recordatorios a ti mismo.", error: true };
  if (i.salida) {
    const b = buscarSalida(ctx, i.salida);
    const { ledger } = b;
    const e = ledger.expenses[0];
    if (!e) return { texto: "Esa salida no tiene cuenta.", error: true };
    const eLike = { payers: e.payers.map((x) => ({ memberId: x.memberId, amountUsd: x.amountUsd })), shares: e.shares.map((x) => ({ memberId: x.memberId, amountUsd: x.amountUsd })) };
    const linked = ledger.settlements.filter((s) => s.expenseId === e.id);
    const member = p ? ledger.members.find((m) => m.userId === p.id) : null;
    if (p && !member) return { texto: `${p.name} no fue a «${e.title}».`, error: true };
    const pend = shareStatuses(eLike, linked).filter((st) => (st.status === "falta" || st.status === "parcial") && (!member || st.memberId === member.id));
    const who = pend.map((st) => ({ st, m: ledger.members.find((x) => x.id === st.memberId)! })).filter((x) => x.m?.userId && x.m.id !== ledger.me.id);
    if (!who.length) return { texto: `En «${e.title}» ${p ? `${p.name} no debe nada` : "nadie con cuenta debe nada"} (o ya pagó y falta confirmar).`, error: true };
    const total = who.reduce((a, x) => a + x.st.owesUsd - x.st.paidUsd, 0);
    return {
      texto: `Tarjeta lista para recordarle a ${who.map((x) => x.m.name).join(", ")} lo de «${e.title}» (${usd(total)}). Todavía NO se ha enviado.`,
      tarjeta: {
        tipo: "recordar",
        id: id(),
        salidaId: ledger.group.id,
        memberId: member?.id,
        titulo: `«${e.title}»`,
        personas: who.map((x) => vista(x.m)),
        montoUsd: total,
        detalle: who.map((x) => `${x.m.name}: ${usd(x.st.owesUsd - x.st.paidUsd)}`).join(" · "),
      },
    };
  }
  if (!p) return { texto: "Dime a quién recordarle (pana) o de qué salida.", error: true };
  const pb = personBalances(ctx.bundles).find((x) => x.userId === p.id);
  if (!pb?.owedToMe) return { texto: `${p.name} no le debe nada a quien escribe.`, error: true };
  return {
    texto: `Tarjeta lista para recordarle a ${p.name} que debe ${usd(pb.owedToMe)} (${pb.theyOweItems.map((x) => `«${x.title}»`).join(", ")}). Todavía NO se ha enviado.`,
    tarjeta: {
      tipo: "recordar",
      id: id(),
      userId: p.id,
      titulo: `Todo lo que te debe ${p.name}`,
      personas: [vista(p)],
      montoUsd: pb.owedToMe,
      detalle: pb.theyOweItems.map((x) => `«${x.title}» ${usd(x.remainingUsd)}`).join(" · "),
    },
  };
}

function proponerPagado(raw: unknown, ctx: PilasCtx): Resultado {
  const i = z.object({ pana: z.string().min(1), salida: z.string().optional(), metodo: z.enum(METODOS).optional(), moneda: z.enum(["USD", "VES"]).optional() }).parse(raw);
  const p = buscarPana(ctx, i.pana);
  if (p.isMe) return { texto: "Para lo que debe quien escribe, usa mostrar_boton con destino pagar.", error: true };
  const metodo = i.metodo ?? "otro";
  const moneda = i.moneda ?? monedaDeMetodo(i.metodo);
  if (i.salida) {
    const { ledger } = buscarSalida(ctx, i.salida);
    const e = ledger.expenses[0];
    const m = ledger.members.find((x) => x.userId === p.id);
    if (!e || !m) return { texto: `${p.name} no está en esa salida.`, error: true };
    const eLike = { payers: e.payers.map((x) => ({ memberId: x.memberId, amountUsd: x.amountUsd })), shares: e.shares.map((x) => ({ memberId: x.memberId, amountUsd: x.amountUsd })) };
    const linked = ledger.settlements.filter((s) => s.expenseId === e.id);
    const parts = debtSplit(eLike, m.id);
    const iCollect = parts.some((x) => x.to === ledger.me.id);
    const creator = !!ledger.group.createdBy && ledger.group.createdBy === ctx.user.id;
    if (!iCollect && !creator) return { texto: `Solo quien cobra o quien anotó «${e.title}» puede marcar ese pago.`, error: true };
    const rest = parts.reduce((a, x) => a + remainingTo(eLike, linked, m.id, x.to), 0);
    if (rest <= 0) return { texto: `${p.name} ya no debe nada en «${e.title}».`, error: true };
    if (ledger.cashea.some((c) => c.expenseId === e.id && c.mode === "espejo"))
      return { texto: "Esa salida es con Cashea por cuotas: las cuotas se marcan en la salida. Manda mostrar_boton con destino salida.", error: true };
    return {
      texto: `Tarjeta lista para anotar que ${p.name} ya pagó su parte de «${e.title}» (${usd(rest)}). Todavía NO está anotado.`,
      tarjeta: { tipo: "pagado", id: id(), persona: vista(p), salidaId: ledger.group.id, memberId: m.id, metodo, moneda, montoUsd: rest, detalle: `Su parte de «${e.title}»` },
    };
  }
  const pb = personBalances(ctx.bundles).find((x) => x.userId === p.id);
  if (!pb?.owedToMe) return { texto: `${p.name} no le debe nada a quien escribe.`, error: true };
  return {
    texto: `Tarjeta lista para anotar que ${p.name} ya pagó todo lo que debía (${usd(pb.owedToMe)}). Todavía NO está anotado.`,
    tarjeta: { tipo: "pagado", id: id(), persona: vista(p), userId: p.id, metodo, moneda, montoUsd: pb.owedToMe, detalle: pb.theyOweItems.map((x) => `«${x.title}»`).join(", ") },
  };
}

function proponerConfirmar(raw: unknown, ctx: PilasCtx): Resultado {
  const i = z.object({ pago: z.string().min(1) }).parse(raw);
  const cobros = pendingConfirmations(ctx.bundles, "cobro");
  if (!cobros.length) return { texto: "No hay pagos esperando confirmación de quien escribe.", error: true };
  const hex = i.pago.trim().toLowerCase().replace(/^pago\s*:\s*/, "");
  let c = cobros.filter((x) => /^[0-9a-f]{4,}$/.test(hex) && x.batchId.startsWith(hex));
  if (!c.length) {
    const p = buscarPana(ctx, i.pago);
    c = cobros.filter((x) => x.fromUserId === p.id);
  }
  if (c.length !== 1)
    return { texto: c.length ? `Hay ${c.length} pagos de esa persona; usa la ref: ${c.map((x) => `${ref("pago", x.batchId)} ${usd(x.totalUsd)}`).join(", ")}.` : "No encontré ese pago por confirmar.", error: true };
  const x = c[0];
  return {
    texto: `Tarjeta lista: ${x.fromName} dice que pagó ${usd(x.totalUsd)}. La persona toca «Sí, me llegó» o «No me llegó». Todavía NO está confirmado.`,
    tarjeta: {
      tipo: "confirmar",
      id: id(),
      settlementIds: x.settlementIds,
      persona: { nombre: x.fromName, avatar: x.fromAvatar, color: x.fromColor },
      montoUsd: x.totalUsd,
      detalle: `${x.currency !== "USD" ? `${fmt(x.amount, x.currency as Currency)} · ` : ""}${payMethodOf(x.method).label}${x.reference ? ` · ref ${x.reference}` : ""} · ${x.salidas.map((s) => `«${s.title}»`).join(", ")} · ${prettyDay(ymdOf(x.createdAt))}`,
    },
  };
}

function mostrarBoton(raw: unknown, ctx: PilasCtx): Resultado {
  const i = z.object({ destino: z.string(), pana: z.string().optional(), salida: z.string().optional(), texto: z.string().max(40).optional() }).parse(raw);
  const p = i.pana ? buscarPana(ctx, i.pana) : null;
  const s = i.salida ? buscarSalida(ctx, i.salida).ledger.group.id : null;
  const R: Record<string, [string, string, string] | null> = {
    pagar: [p && !p.isMe ? `/pagar?a=${p.id}${s ? `&s=${s}` : ""}` : "/pagar", p && !p.isMe ? `Pagarle a ${p.name}` : "Pagar", "💸"],
    salida: s ? [`/salidas/${s}`, "Ver la salida", "🧾"] : null,
    editar_salida: s ? [`/salidas/${s}/editar`, "Editar la salida", "✏️"] : null,
    nueva_salida: ["/salidas/nueva", "Anotar en el formulario", "📝"],
    pana: p ? [`/panas/${p.id}`, `Ver a ${p.name}`, "🙂"] : null,
    panas: ["/panas", "Ver los panas", "👥"],
    invitar: ["/panas#invitar", "Invitar a un pana", "📨"],
    cashea: ["/cashea", "Ver Cashea", "🛍️"],
    tasas: ["/tasas", "Ver las tasas", "📈"],
    historial: ["/historial", "Ver el historial", "🗂️"],
    perfil_pago: ["/perfil#datos-de-pago", "Mis datos de pago", "📲"],
    perfil: ["/perfil", "Mi perfil", "⚙️"],
    avisos: ["/avisos", "Ver los avisos", "🔔"],
    calculadora: ["/calculadora", "Abrir la calculadora", "🧮"],
  };
  const r = R[i.destino];
  if (!r) return { texto: `Para «${i.destino}» falta ${i.destino.includes("salida") ? "la salida" : "el pana"}.`, error: true };
  return { texto: `Botón «${i.texto || r[1]}» mostrado.`, tarjeta: { tipo: "ir", id: id(), href: r[0], texto: i.texto || r[1], emoji: r[2] } };
}

