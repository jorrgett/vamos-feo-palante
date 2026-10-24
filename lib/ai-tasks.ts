import "server-only";
import { z } from "zod";
import { readImageAsJson, type ImageInput } from "./ai";
import { CATEGORIES } from "./constants";
import { todayVE } from "./dates";
import type { PayInfo, ProofAi } from "./db/schema";

const nullable = (type: "string" | "number") => ({ anyOf: [{ type }, { type: "null" }] });
const cents = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100));
const short = (s: string | null | undefined, max = 80) => (s ? s.trim().slice(0, max) || null : null);

// ── Facturas ───────────────────────────────────────────────────────────────

const CHARGE_KINDS = ["iva", "servicio", "propina", "igtf", "delivery", "otro"] as const;
const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_factura", "comercio", "fecha", "moneda", "categoria", "items", "subtotal", "cargos", "descuento", "total", "notas"],
  properties: {
    es_factura: { type: "boolean" },
    comercio: nullable("string"),
    fecha: nullable("string"),
    moneda: { anyOf: [{ type: "string", enum: ["USD", "VES", "EUR"] }, { type: "null" }] },
    categoria: { type: "string", enum: CATEGORY_IDS },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nombre", "cantidad", "total"],
        properties: { nombre: { type: "string" }, cantidad: { type: "number" }, total: { type: "number" } },
      },
    },
    subtotal: nullable("number"),
    cargos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "etiqueta", "porcentaje", "monto"],
        properties: {
          tipo: { type: "string", enum: [...CHARGE_KINDS] },
          etiqueta: { type: "string" },
          porcentaje: nullable("number"),
          monto: nullable("number"),
        },
      },
    },
    descuento: nullable("number"),
    total: nullable("number"),
    notas: { type: "array", items: { type: "string" } },
  },
};

const RawReceipt = z.object({
  es_factura: z.boolean(),
  comercio: z.string().nullable(),
  fecha: z.string().nullable(),
  moneda: z.enum(["USD", "VES", "EUR"]).nullable(),
  categoria: z.string(),
  items: z.array(z.object({ nombre: z.string(), cantidad: z.number(), total: z.number() })),
  subtotal: z.number().nullable(),
  cargos: z.array(z.object({ tipo: z.enum(CHARGE_KINDS), etiqueta: z.string(), porcentaje: z.number().nullable(), monto: z.number().nullable() })),
  descuento: z.number().nullable(),
  total: z.number().nullable(),
  notas: z.array(z.string()),
});

export type ReceiptRead = {
  esFactura: boolean;
  comercio: string | null;
  /** AAAA-MM-DD, solo si es una fecha válida y no es del futuro. */
  fecha: string | null;
  moneda: "USD" | "VES" | "EUR" | null;
  categoria: string;
  /** Montos en centavos de la moneda de la factura. */
  items: { nombre: string; cantidad: number; total: number }[];
  subtotal: number | null;
  cargos: { tipo: (typeof CHARGE_KINDS)[number]; etiqueta: string; porcentaje: number | null; monto: number | null }[];
  descuento: number | null;
  total: number | null;
  notas: string[];
};

const RECEIPT_SYSTEM = `Lees fotos de facturas, tickets y cuentas de restaurantes, bares, supermercados y comercios de Venezuela para que un grupo de amigos divida la cuenta. Devuelves solo los datos pedidos.

Reglas:
- Números: en Venezuela el punto separa los miles y la coma los decimales (1.234,50 = 1234.5). Devuelve números normales con punto decimal y sin símbolos.
- moneda: "VES" si los montos están en bolívares (Bs, Bs.D, Bs.S, VES), "USD" si están en dólares ($, USD, REF), "EUR" si están en euros. Si hay montos en las dos, usa la moneda del total a pagar.
- items: solo lo que se consumió (platos, bebidas, productos). No incluyas subtotales, impuestos, servicio, propina, IGTF, descuentos ni el total. El total de cada ítem es el precio de esa línea (cantidad × precio unitario). Usa nombres cortos y legibles (corrige abreviaturas obvias: "CERV POLAR 355" → "Cerveza Polar").
- cargos: lo que se suma aparte del consumo: IVA, servicio (suele ser 10 %), propina, IGTF (3 % por pagar en divisas), delivery u otro. Pon el monto si aparece y el porcentaje si aparece.
- subtotal: la suma del consumo antes de los cargos, si aparece. total: lo que hay que pagar.
- descuento: el monto descontado, si hay.
- fecha: en formato AAAA-MM-DD si se ve.
- categoria: la que mejor describa el comercio.
- notas: hasta 3 observaciones cortas y útiles para dividir la cuenta (por ejemplo: "El servicio ya viene incluido en el total", "La foto está cortada abajo", "No aparece la propina"). En español de Venezuela, tuteando.
- es_factura: false si la foto no es una factura, ticket o cuenta.
- Si un dato no se ve, pon null. No inventes nada.`;

export async function readReceipt(image: ImageInput, userId: string): Promise<ReceiptRead> {
  const today = todayVE();
  return readImageAsJson({
    task: "factura",
    userId,
    system: RECEIPT_SYSTEM,
    prompt: `Lee esta factura. Hoy es ${today}.`,
    image,
    schema: RECEIPT_SCHEMA,
    validate: (raw) => {
      const r = RawReceipt.parse(raw);
      const fecha = r.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) && r.fecha <= today && r.fecha >= "2020-01-01" ? r.fecha : null;
      return {
        esFactura: r.es_factura,
        comercio: short(r.comercio, 60),
        fecha,
        moneda: r.moneda,
        categoria: CATEGORY_IDS.includes(r.categoria) ? r.categoria : "otro",
        items: r.items
          .filter((i) => i.total > 0 && i.nombre.trim())
          .slice(0, 60)
          .map((i) => ({ nombre: i.nombre.trim().slice(0, 60), cantidad: Math.max(1, Math.round(i.cantidad) || 1), total: cents(i.total)! })),
        subtotal: cents(r.subtotal),
        cargos: r.cargos
          .filter((c) => (c.monto ?? 0) > 0 || (c.porcentaje ?? 0) > 0)
          .slice(0, 6)
          .map((c) => ({ tipo: c.tipo, etiqueta: c.etiqueta.trim().slice(0, 30) || c.tipo, porcentaje: c.porcentaje, monto: cents(c.monto) })),
        descuento: cents(r.descuento),
        total: cents(r.total),
        notas: r.notas.map((n) => n.trim().slice(0, 160)).filter(Boolean).slice(0, 3),
      };
    },
  });
}

// ── Comprobantes de pago ─────────────────────────────────────────────────────

const PROOF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_comprobante", "monto", "moneda", "referencia", "fecha", "banco_origen", "banco_destino", "telefono_destino", "cedula_destino", "cuenta_destino"],
  properties: {
    es_comprobante: { type: "boolean" },
    monto: nullable("number"),
    moneda: { anyOf: [{ type: "string", enum: ["VES", "USD", "USDT", "EUR"] }, { type: "null" }] },
    referencia: nullable("string"),
    fecha: nullable("string"),
    banco_origen: nullable("string"),
    banco_destino: nullable("string"),
    telefono_destino: nullable("string"),
    cedula_destino: nullable("string"),
    cuenta_destino: nullable("string"),
  },
};

const RawProof = z.object({
  es_comprobante: z.boolean(),
  monto: z.number().nullable(),
  moneda: z.enum(["VES", "USD", "USDT", "EUR"]).nullable(),
  referencia: z.string().nullable(),
  fecha: z.string().nullable(),
  banco_origen: z.string().nullable(),
  banco_destino: z.string().nullable(),
  telefono_destino: z.string().nullable(),
  cedula_destino: z.string().nullable(),
  cuenta_destino: z.string().nullable(),
});

const PROOF_SYSTEM = `Lees capturas de comprobantes de pago de Venezuela (pago móvil, transferencias, Zelle, Binance Pay, PayPal, efectivo con recibo) para confirmar un pago entre amigos. Devuelves solo los datos pedidos.

Reglas:
- monto: lo que se transfirió (no el saldo, no comisiones). En Venezuela el punto separa los miles y la coma los decimales (8.801,16 = 8801.16). Devuelve un número normal con punto decimal.
- moneda: "VES" para bolívares, "USD" para dólares (Zelle, PayPal), "USDT" para Binance/cripto en USDT, "EUR" para euros.
- referencia: el número de referencia, operación o confirmación, tal cual aparece.
- fecha: la del pago tal cual aparece.
- banco_destino, telefono_destino, cedula_destino, cuenta_destino (correo, usuario o número de cuenta): los datos de quien RECIBE el pago, tal cual aparecen.
- es_comprobante: false si la imagen no es un comprobante de pago.
- Si un dato no se ve, pon null. No inventes nada.`;

export type ProofExpected = {
  /** Lo que se debía, en centavos, por moneda. */
  VES: number;
  USD: number;
  EUR: number;
  payInfo: PayInfo;
  creditorName: string;
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const fmtN = (c: number) => (c / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lee el comprobante y lo compara con lo que se debía (monto y a quién se le pagó). */
export async function readProof(image: ImageInput, expected: ProofExpected, userId: string): Promise<ProofAi> {
  const p = await readImageAsJson({
    task: "comprobante",
    userId,
    system: PROOF_SYSTEM,
    prompt: "Lee este comprobante de pago.",
    image,
    schema: PROOF_SCHEMA,
    maxTokens: 3000,
    validate: (raw) => RawProof.parse(raw),
  });
  const leido: ProofAi["leido"] = {
    esComprobante: p.es_comprobante,
    monto: p.monto != null && Number.isFinite(p.monto) ? Math.round(p.monto * 100) / 100 : null,
    moneda: p.moneda,
    referencia: short(p.referencia, 40),
    fecha: short(p.fecha, 40),
    bancoOrigen: short(p.banco_origen, 60),
    bancoDestino: short(p.banco_destino, 60),
    telefonoDestino: short(p.telefono_destino, 30),
    cedulaDestino: short(p.cedula_destino, 30),
    cuentaDestino: short(p.cuenta_destino, 80),
  };
  if (!leido.esComprobante) return { leido, check: { monto: "?", destino: "?" }, resumen: "🤔 La IA no ve un comprobante de pago en esta foto." };

  // ¿El monto cuadra? (tolerancia: 1 % o un poquito por redondeo)
  let monto: "ok" | "no" | "?" = "?";
  let montoTxt = "";
  if (leido.monto != null && leido.moneda) {
    const cur = leido.moneda === "USDT" ? "USD" : leido.moneda;
    const want = expected[cur];
    const got = Math.round(leido.monto * 100);
    const sym = leido.moneda === "VES" ? "Bs" : leido.moneda === "EUR" ? "€" : leido.moneda === "USDT" ? "USDT" : "$";
    if (want > 0) {
      const tol = Math.max(Math.round(want * 0.01), cur === "VES" ? 100 : 5);
      monto = Math.abs(got - want) <= tol ? "ok" : "no";
      montoTxt = monto === "ok" ? `${sym} ${fmtN(got)}, cuadra con lo que se debía` : `${sym} ${fmtN(got)}, pero se debían ${sym} ${fmtN(want)}`;
    } else montoTxt = `${sym} ${fmtN(got)}`;
  }

  // ¿Le llegó a la persona correcta? (teléfono o cédula del pago móvil, o el Zelle/Binance que tiene cargado)
  let destino: "ok" | "no" | "?" = "?";
  const pm = expected.payInfo.pagoMovil ?? {};
  const tel = digits(leido.telefonoDestino).slice(-7);
  const ci = digits(leido.cedulaDestino);
  const cuenta = (leido.cuentaDestino ?? "").toLowerCase();
  const checks: boolean[] = [];
  if (tel.length >= 7 && digits(pm.telefono).length >= 7) checks.push(digits(pm.telefono).endsWith(tel));
  if (ci.length >= 5 && digits(pm.cedula).length >= 5) checks.push(digits(pm.cedula) === ci);
  const alt = [expected.payInfo.zelle, expected.payInfo.binance].filter(Boolean).map((s) => s!.toLowerCase());
  if (cuenta && alt.length) checks.push(alt.some((a) => cuenta.includes(a) || a.includes(cuenta) || (digits(a).length >= 7 && digits(cuenta).endsWith(digits(a).slice(-7)))));
  if (checks.length) destino = checks.some(Boolean) ? "ok" : "no";

  const partes = [
    montoTxt && `${monto === "ok" ? "✅" : monto === "no" ? "⚠️" : "🧾"} ${montoTxt}`,
    leido.referencia && `ref ${leido.referencia}`,
    destino === "ok" ? `✅ le llegó a ${expected.creditorName}` : destino === "no" ? `⚠️ los datos de destino no son los de ${expected.creditorName}` : null,
  ].filter(Boolean);
  return { leido, check: { monto, destino }, resumen: partes.length ? `🤖 ${partes.join(" · ")}` : "🤖 La IA no pudo leer el monto de la captura." };
}
