import "server-only";
import { after } from "next/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { addDays, todayVE } from "./dates";
import type { RatesSnapshot } from "./rates-shared";

// Fuentes verificadas el 16-10-2026:
//  · BCV $ y €: ve.dolarapi.com (scrapea al BCV cada hora) → respaldo: api.alcambio.app (GraphQL).
//  · USDT: Binance P2P (bapi, mediana sin anuncios promocionados) → criptoya → yadio.
// Todo se guarda en la tabla `rates` (una fila por fuente y fecha) para tener histórico propio.

const TIMEOUT = 6000;
const BCV_MAX_AGE_MS = 30 * 60_000;
const USDT_MAX_AGE_MS = 10 * 60_000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

type Bcv = { usd: number; eur: number; date: string };

async function bcvFromDolarApi(): Promise<Bcv> {
  type Row = { moneda: string; fuente: string; promedio: number; fechaActualizacion: string };
  const rows = await getJson<Row[]>("https://ve.dolarapi.com/v1/cotizaciones");
  const usd = rows.find((r) => r.moneda === "USD" && r.fuente === "oficial");
  const eur = rows.find((r) => r.moneda === "EUR" && r.fuente === "oficial");
  if (!usd?.promedio || !eur?.promedio) throw new Error("dolarapi sin datos");
  return { usd: usd.promedio, eur: eur.promedio, date: usd.fechaActualizacion.slice(0, 10) };
}

async function bcvFromAlCambio(): Promise<Bcv> {
  type Resp = {
    data: {
      getCountryConversions: {
        conversionRates: { baseValue: number; official: boolean; rateCurrency: { code: string } }[];
        dateBcv: number;
      };
    };
  };
  const body = {
    operationName: "getCountryConversions",
    variables: { countryCode: "VE" },
    query:
      "query getCountryConversions($countryCode: String!) { getCountryConversions(payload: {countryCode: $countryCode}) { conversionRates { baseValue official rateCurrency { code } } dateBcv } }",
  };
  const r = await getJson<Resp>("https://api.alcambio.app/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const conv = r.data.getCountryConversions;
  const usd = conv.conversionRates.find((c) => c.official && c.rateCurrency.code === "USD")?.baseValue;
  const eur = conv.conversionRates.find((c) => c.official && c.rateCurrency.code === "EUR")?.baseValue;
  if (!usd || !eur) throw new Error("alcambio sin datos");
  return { usd, eur, date: todayVE(new Date(conv.dateBcv)) };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function binanceSide(tradeType: "BUY" | "SELL"): Promise<number> {
  type Resp = {
    code: string;
    data: { adv: { price: string }; advertiser: { monthOrderCount: number; monthFinishRate: number }; privilegeType: number | null }[];
  };
  const r = await getJson<Resp>("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fiat: "VES",
      asset: "USDT",
      tradeType,
      page: 1,
      rows: 20,
      transAmount: "100000",
      payTypes: [],
      publisherType: null,
      countries: [],
      proMerchantAds: false,
      shieldMerchantAds: false,
    }),
  });
  if (r.code !== "000000" || !r.data?.length) throw new Error("binance sin anuncios");
  const good = r.data.filter((d) => d.privilegeType == null);
  const trusted = good.filter((d) => d.advertiser.monthFinishRate >= 0.9 && d.advertiser.monthOrderCount >= 30);
  const pool = (trusted.length >= 5 ? trusted : good).slice(0, 10).map((d) => Number(d.adv.price));
  if (pool.length === 0) throw new Error("binance sin precios");
  return median(pool);
}

async function usdtFromBinance(): Promise<number> {
  const [buy, sell] = await Promise.all([binanceSide("BUY"), binanceSide("SELL")]);
  return (buy + sell) / 2;
}

async function usdtFromCriptoYa(): Promise<number> {
  const r = await getJson<{ ask: number; bid: number }>("https://criptoya.com/api/binancep2p/USDT/VES/100");
  if (!r.ask || !r.bid) throw new Error("criptoya sin datos");
  return (r.ask + r.bid) / 2;
}

async function usdtFromYadio(): Promise<number> {
  const r = await getJson<{ stats: { median: number } }>("https://api.yadio.io/market/stats?currency=VES&asset=USDT&side=buy");
  if (!r.stats?.median) throw new Error("yadio sin datos");
  return r.stats.median;
}

async function firstOk<T>(fns: (() => Promise<T>)[]): Promise<T | null> {
  for (const fn of fns) {
    try {
      return await fn();
    } catch (e) {
      console.warn("[tasas]", (e as Error).message);
    }
  }
  return null;
}

async function upsertRate(source: string, value: number, date: string) {
  const db = await getDb();
  await db
    .insert(schema.rates)
    .values({ source, value, date, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.rates.source, schema.rates.date],
      set: { value, fetchedAt: new Date() },
    });
}

export async function refreshBcv(): Promise<Bcv | null> {
  const bcv = await firstOk([bcvFromDolarApi, bcvFromAlCambio]);
  if (bcv) {
    await upsertRate("bcv_usd", bcv.usd, bcv.date);
    await upsertRate("bcv_eur", bcv.eur, bcv.date);
  }
  return bcv;
}

export async function refreshUsdt(): Promise<number | null> {
  const usdt = await firstOk([usdtFromBinance, usdtFromCriptoYa, usdtFromYadio]);
  if (usdt) await upsertRate("usdt", Math.round(usdt * 100) / 100, todayVE());
  return usdt;
}

type RateRow = typeof schema.rates.$inferSelect;

async function latest(source: string, onOrBefore: string, take = 2): Promise<RateRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.rates)
    .where(and(eq(schema.rates.source, source), lte(schema.rates.date, onOrBefore)))
    .orderBy(desc(schema.rates.date))
    .limit(take);
}

const pctChange = (rows: RateRow[]) => (rows.length >= 2 && rows[1].value ? ((rows[0].value - rows[1].value) / rows[1].value) * 100 : null);

function snapshot(usd: RateRow[], eur: RateRow[], usdt: RateRow[]): RatesSnapshot {
  return {
    bcvUsd: usd[0].value,
    bcvEur: eur[0]?.value ?? usd[0].value * 1.12,
    usdt: usdt[0]?.value ?? null,
    bcvDate: usd[0].date,
    fetchedAt: usd[0].fetchedAt.toISOString(),
    usdtFetchedAt: usdt[0]?.fetchedAt.toISOString() ?? null,
    change: { bcvUsd: pctChange(usd), bcvEur: pctChange(eur), usdt: pctChange(usdt) },
  };
}

/** Tasas vigentes. Lee de la base y refresca en segundo plano si están viejas. */
export async function getRates(): Promise<RatesSnapshot> {
  const today = todayVE();
  let [usd, eur, usdt] = await Promise.all([latest("bcv_usd", today), latest("bcv_eur", today), latest("usdt", today)]);

  if (usd.length === 0) {
    // Primera vez: hay que esperar a la consulta.
    await Promise.all([refreshBcv(), refreshUsdt()]);
    [usd, eur, usdt] = await Promise.all([latest("bcv_usd", today), latest("bcv_eur", today), latest("usdt", today)]);
    if (usd.length === 0) {
      // Sin red ni datos: valores de referencia para que la app no se caiga.
      const now = new Date().toISOString();
      return { bcvUsd: 880.1159, bcvEur: 985.7298, usdt: 999.5, bcvDate: "2026-10-16", fetchedAt: now, usdtFetchedAt: now };
    }
  } else {
    const now = Date.now();
    const bcvStale = usd[0].date !== today && now - usd[0].fetchedAt.getTime() > BCV_MAX_AGE_MS;
    const usdtStale = !usdt[0] || now - usdt[0].fetchedAt.getTime() > USDT_MAX_AGE_MS;
    if (bcvStale || usdtStale) {
      after(async () => {
        if (bcvStale) await markFetched("bcv_usd", usd[0]).then(refreshBcv);
        if (usdtStale) await refreshUsdt();
      });
    }
  }
  return snapshot(usd, eur, usdt);
}

/** Evita que varias visitas seguidas disparen la misma consulta mientras el BCV no publica. */
async function markFetched(source: string, row: RateRow) {
  const db = await getDb();
  await db.update(schema.rates).set({ fetchedAt: new Date() }).where(and(eq(schema.rates.source, source), eq(schema.rates.date, row.date)));
}

/** Tasas que aplicaban en una fecha: la de fecha valor más reciente que no sea posterior. */
export async function getRatesForDate(ymd: string): Promise<RatesSnapshot | null> {
  const [usd, eur, usdt] = await Promise.all([latest("bcv_usd", ymd), latest("bcv_eur", ymd), latest("usdt", ymd)]);
  if (usd.length === 0) return null;
  return snapshot(usd, eur, usdt);
}

export async function rateHistory(days = 90) {
  const db = await getDb();
  const since = addDays(todayVE(), -days);
  const rows = await db
    .select({ source: schema.rates.source, value: schema.rates.value, date: schema.rates.date })
    .from(schema.rates)
    .where(gte(schema.rates.date, since))
    .orderBy(schema.rates.date);
  const map = new Map<string, { date: string; bcvUsd?: number; bcvEur?: number; usdt?: number }>();
  for (const r of rows) {
    const cur = map.get(r.date) ?? { date: r.date };
    if (r.source === "bcv_usd") cur.bcvUsd = r.value;
    if (r.source === "bcv_eur") cur.bcvEur = r.value;
    if (r.source === "usdt") cur.usdt = r.value;
    map.set(r.date, cur);
  }
  return [...map.values()];
}

/** Carga el histórico oficial del BCV (desde 2023) y el paralelo de yadio para el USDT. */
export async function seedHistory() {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.rates).where(eq(schema.rates.source, "bcv_usd"));
  if (n > 300) return { skipped: true, n };
  type H = { promedio: number; fecha: string };
  const [usd, eur] = await Promise.all([
    getJson<H[]>("https://ve.dolarapi.com/v1/historicos/dolares/oficial"),
    getJson<H[]>("https://ve.dolarapi.com/v1/historicos/euros/oficial"),
  ]);
  const toRows = (source: string, list: H[]) =>
    list.filter((h) => h.promedio && /^\d{4}-\d{2}-\d{2}$/.test(h.fecha)).map((h) => ({ source, value: h.promedio, date: h.fecha }));
  let usdtRows: { source: string; value: number; date: string }[] = [];
  try {
    // yadio da el promedio de mercado libre diario; sirve como aproximación histórica del USDT.
    const hist = await getJson<{ date: string; rate: number }[]>("https://api.yadio.io/hist/365/VES");
    usdtRows = hist
      .filter((h) => h.rate)
      .map((h) => {
        const [mm, dd, yyyy] = h.date.split("/");
        return { source: "usdt", value: Math.round(h.rate * 100) / 100, date: `${yyyy}-${mm}-${dd}` };
      });
  } catch (e) {
    console.warn("[tasas] sin histórico de yadio", (e as Error).message);
  }
  const all = [...toRows("bcv_usd", usd), ...toRows("bcv_eur", eur), ...usdtRows];
  for (let i = 0; i < all.length; i += 500) {
    await db.insert(schema.rates).values(all.slice(i, i + 500)).onConflictDoNothing();
  }
  return { inserted: all.length };
}
