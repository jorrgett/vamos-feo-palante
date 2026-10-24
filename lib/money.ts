// Dinero en unidades mínimas (centavos) para no arrastrar errores de coma flotante.
// El libro contable de cada grupo vive en centavos de dólar (USD).

export const CURRENCIES = ["USD", "VES", "EUR", "USDT"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_META: Record<Currency, { symbol: string; label: string; flag: string }> = {
  USD: { symbol: "$", label: "Dólares", flag: "🇺🇸" },
  VES: { symbol: "Bs", label: "Bolívares", flag: "🇻🇪" },
  EUR: { symbol: "€", label: "Euros", flag: "🇪🇺" },
  USDT: { symbol: "₮", label: "USDT", flag: "🪙" },
};

const nf2 = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });

export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** "$ 1.234,50" · "Bs 45.210,00" · "€ 12,00" */
export function fmt(cents: number, currency: Currency = "USD", opts: { sign?: boolean; compact?: boolean } = {}): string {
  const abs = Math.abs(cents) / 100;
  const body = opts.compact && abs >= 10000 ? compact(abs) : nf2.format(abs);
  const sign = cents < 0 ? "−" : opts.sign && cents > 0 ? "+" : "";
  return `${sign}${CURRENCY_META[currency].symbol} ${body}`;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${nf2.format(n / 1_000_000)} M`;
  return `${nf0.format(n / 1000)} mil`;
}

export function fmtNumber(n: number, decimals = 2): string {
  return new Intl.NumberFormat("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

/** Acepta "1.234,56", "1234.56", "1,234.56", "1234,5", "Bs. 45.000" … y devuelve centavos. */
export function parseAmount(input: string): number | null {
  let s = input.replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // El último separador es el decimal.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // En Venezuela la coma es el decimal; varias comas sí son separadores de miles.
    s = s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1) {
    const parts = s.split(".");
    // "45.000" o "1.234.567" → miles; "12.5" → decimal
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] !== "0")) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? toCents(n) : null;
}

/**
 * Reparte `total` centavos según pesos, garantizando que la suma sea exacta
 * (método del mayor residuo; los empates se resuelven por orden).
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * w) / sum);
  const base = raw.map((r) => (total >= 0 ? Math.floor(r) : Math.ceil(r)));
  let rest = total - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: Math.abs(r - base[i]) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const step = rest >= 0 ? 1 : -1;
  for (let k = 0; rest !== 0; k = (k + 1) % order.length) {
    base[order[k].i] += step;
    rest -= step;
  }
  return base;
}

/** Tasas para convertir: bolívares por cada unidad de la moneda. */
export type FxSnapshot = {
  /** Bs por 1 USD usados para convertir bolívares ↔ dólares en este registro. */
  vesPerUsd: number;
  /** Bs por 1 EUR (BCV). */
  vesPerEur?: number | null;
  /** Bs por 1 USDT (Binance P2P). */
  vesPerUsdt?: number | null;
};

/** Convierte centavos de `currency` a centavos de USD con el snapshot de tasas. */
export function toUsdCents(cents: number, currency: Currency, fx: FxSnapshot): number {
  switch (currency) {
    case "USD":
      return cents;
    case "VES":
      return Math.round(cents / fx.vesPerUsd);
    case "EUR": {
      const eur = fx.vesPerEur ?? fx.vesPerUsd * 1.08;
      return Math.round((cents * eur) / fx.vesPerUsd);
    }
    case "USDT": {
      // El USDT se toma 1:1 con el dólar en el libro del grupo.
      return cents;
    }
  }
}

export function fromUsdCents(usdCents: number, currency: Currency, fx: FxSnapshot): number {
  switch (currency) {
    case "USD":
    case "USDT":
      return usdCents;
    case "VES":
      return Math.round(usdCents * fx.vesPerUsd);
    case "EUR": {
      const eur = fx.vesPerEur ?? fx.vesPerUsd * 1.08;
      return Math.round((usdCents * fx.vesPerUsd) / eur);
    }
  }
}
