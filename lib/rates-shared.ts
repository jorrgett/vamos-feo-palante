// Tipos y utilidades de tasas que sirven tanto en el servidor como en el navegador.

export type RateSourceId = "bcv" | "usdt" | "eur";

export type RatesSnapshot = {
  /** Bs por 1 USD, tasa oficial BCV. */
  bcvUsd: number;
  /** Bs por 1 EUR, tasa oficial BCV. */
  bcvEur: number;
  /** Bs por 1 USDT, promedio Binance P2P. */
  usdt: number | null;
  /** Fecha valor de la tasa BCV (YYYY-MM-DD). */
  bcvDate: string;
  /** Cuándo se consultó (ISO). */
  fetchedAt: string;
  usdtFetchedAt: string | null;
  /** Variación vs. el día anterior, en %. */
  change?: { bcvUsd?: number | null; bcvEur?: number | null; usdt?: number | null };
};

export const RATE_META: Record<RateSourceId, { label: string; short: string; hint: string; color: string }> = {
  bcv: { label: "Dólar BCV", short: "BCV $", hint: "Tasa oficial del Banco Central", color: "var(--sky)" },
  eur: { label: "Euro BCV", short: "BCV €", hint: "Muchos comercios cobran el $ a esta tasa", color: "var(--violet)" },
  usdt: { label: "Dólar Binance", short: "USDT", hint: "Promedio P2P de Binance", color: "var(--mango)" },
};

/** Bs por cada dólar según la tasa elegida. */
export function vesPerUsd(rates: RatesSnapshot, source: RateSourceId): number {
  if (source === "usdt") return rates.usdt ?? rates.bcvUsd;
  if (source === "eur") return rates.bcvEur;
  return rates.bcvUsd;
}

/** Brecha porcentual entre una tasa y la oficial. */
export function gapPct(rates: RatesSnapshot, source: RateSourceId = "usdt"): number | null {
  const v = vesPerUsd(rates, source);
  if (!v || !rates.bcvUsd) return null;
  return ((v - rates.bcvUsd) / rates.bcvUsd) * 100;
}
