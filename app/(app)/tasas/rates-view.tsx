"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { LineChart } from "@/components/charts";
import { useDisplay } from "@/components/display";
import { Segmented } from "@/components/ui";
import { prettyDay } from "@/lib/dates";
import { CURRENCY_META, fmt, fmtNumber, parseAmount, type Currency } from "@/lib/money";
import { RATE_META, gapPct, vesPerUsd, type RateSourceId } from "@/lib/rates-shared";

type Row = { date: string; bcvUsd?: number; bcvEur?: number; usdt?: number };

export function RatesView({ history, days }: { history: Row[]; days: number }) {
  const { rates } = useDisplay();
  const [amount, setAmount] = useState("10");
  const [from, setFrom] = useState<Currency>("USD");
  const cents = parseAmount(amount) ?? 0;
  // Bs equivalentes según cada tasa
  const toVes = (src: RateSourceId) => {
    if (from === "VES") return cents;
    if (from === "EUR") return Math.round(cents * rates.bcvEur);
    return Math.round(cents * vesPerUsd(rates, src));
  };
  const gap = gapPct(rates, "usdt");
  const gapEur = gapPct(rates, "eur");
  // Fines de semana y feriados no hay BCV nuevo: se arrastra el último valor.
  let lastUsd: number | undefined;
  let lastEur: number | undefined;
  const filled = history.map((h) => {
    lastUsd = h.bcvUsd ?? lastUsd;
    lastEur = h.bcvEur ?? lastEur;
    return { ...h, bcvUsd: h.bcvUsd ?? lastUsd, bcvEur: h.bcvEur ?? lastEur };
  });
  const recent = [...filled].reverse().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="display text-3xl font-extrabold sm:text-4xl">Tasas del día</h1>
        <p className="mt-1 text-muted">
          BCV con fecha valor {prettyDay(rates.bcvDate, true)} · USDT actualizado {rates.usdtFetchedAt ? new Date(rates.usdtFetchedAt).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }) : "—"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ["bcv", rates.bcvUsd, rates.change?.bcvUsd, "var(--viz-usd)"],
            ["usdt", rates.usdt, rates.change?.usdt, "var(--viz-usdt)"],
            ["eur", rates.bcvEur, rates.change?.bcvEur, "var(--viz-eur)"],
          ] as const
        ).map(([id, v, ch, color]) => (
          <div key={id} className="card relative overflow-clip p-5">
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
            <p className="text-sm font-semibold text-muted">{RATE_META[id].label}</p>
            <p className="num mt-1 text-4xl font-bold">{v ? fmtNumber(v) : "—"}</p>
            <p className="mt-1 text-xs text-muted">
              Bs por {id === "eur" ? "euro" : id === "usdt" ? "USDT" : "dólar"}
              {ch != null && (
                <span className="num ml-2 font-semibold text-text">
                  {ch >= 0 ? "▲" : "▼"} {fmtNumber(Math.abs(ch))}%
                </span>
              )}
            </p>
            <p className="mt-3 text-xs text-muted">{RATE_META[id].hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Histórico</h2>
            <div className="flex gap-1 rounded-full border border-line bg-card-2 p-1 text-xs font-semibold">
              {[30, 90, 365].map((d) => (
                <Link key={d} href={`/tasas?dias=${d}`} scroll={false} className={clsx("rounded-full px-3 py-1.5", d === days ? "bg-card text-text shadow-sm" : "text-muted")}>
                  {d === 365 ? "1 año" : `${d} días`}
                </Link>
              ))}
            </div>
          </div>
          <LineChart
            dates={filled.map((h) => h.date)}
            series={[
              { key: "bcv", label: "Dólar BCV", color: "var(--viz-usd)", values: filled.map((h) => h.bcvUsd ?? null) },
              { key: "usdt", label: "USDT Binance", color: "var(--viz-usdt)", values: filled.map((h) => h.usdt ?? null) },
              { key: "eur", label: "Euro BCV", color: "var(--viz-eur)", values: filled.map((h) => h.bcvEur ?? null) },
            ]}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-muted">Ver tabla (últimos 10 días)</summary>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1.5">Fecha</th>
                  <th className="py-1.5 text-right">BCV $</th>
                  <th className="py-1.5 text-right">USDT</th>
                  <th className="py-1.5 text-right">BCV €</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {recent.map((r) => (
                  <tr key={r.date}>
                    <td className="py-1.5">{prettyDay(r.date, true)}</td>
                    <td className="py-1.5 text-right">{r.bcvUsd ? fmtNumber(r.bcvUsd) : "—"}</td>
                    <td className="py-1.5 text-right">{r.usdt ? fmtNumber(r.usdt) : "—"}</td>
                    <td className="py-1.5 text-right">{r.bcvEur ? fmtNumber(r.bcvEur) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ArrowRightLeft size={17} /> Convertidor
            </h2>
            <div className="mt-4 space-y-3">
              <Segmented name="conv-from" value={from} onChange={setFrom} options={(["USD", "EUR", "VES"] as Currency[]).map((c) => ({ value: c, label: `${CURRENCY_META[c].flag} ${CURRENCY_META[c].symbol}` }))} />
              <div className="relative">
                <span className="num absolute top-1/2 left-4 -translate-y-1/2 text-xl font-bold text-muted">{CURRENCY_META[from].symbol}</span>
                <input className="field num !py-3 !pl-12 !text-2xl font-bold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              {from === "VES" ? (
                <ul className="space-y-2">
                  {(["bcv", "usdt", "eur"] as RateSourceId[]).map((s) => (
                    <li key={s} className="flex items-center justify-between rounded-2xl bg-card-2 px-4 py-3">
                      <span className="text-sm text-muted">a {RATE_META[s].label}</span>
                      <span className="num font-bold">{fmt(Math.round(cents / vesPerUsd(rates, s)), "USD")}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between rounded-2xl bg-card-2 px-4 py-3">
                    <span className="text-sm text-muted">en euros (BCV)</span>
                    <span className="num font-bold">{fmt(Math.round(cents / rates.bcvEur), "EUR")}</span>
                  </li>
                </ul>
              ) : (
                <ul className="space-y-2">
                  {(from === "EUR" ? (["eur"] as RateSourceId[]) : (["bcv", "usdt", "eur"] as RateSourceId[])).map((s) => (
                    <li key={s} className="flex items-center justify-between rounded-2xl bg-card-2 px-4 py-3">
                      <span className="text-sm text-muted">a {from === "EUR" ? "Euro BCV" : RATE_META[s].label}</span>
                      <span className="num font-bold">{fmt(toVes(s), "VES")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="card p-5 text-sm">
            <h2 className="font-semibold">Brecha cambiaria</h2>
            <p className="mt-2 text-muted">
              El USDT está <b className="num text-text">{gap != null ? fmtNumber(gap, 1) : "—"}%</b> por encima del dólar BCV y el euro BCV,{" "}
              <b className="num text-text">{gapEur != null ? fmtNumber(gapEur, 1) : "—"}%</b>. Si pagan en Bs, pónganse de acuerdo en qué tasa usar: se elige al anotar cada salida.
            </p>
            <p className="mt-3 text-xs text-faint">Fuentes: BCV vía ve.dolarapi.com (respaldo alcambio) y Binance P2P (mediana de anuncios verificados; respaldos criptoya y yadio).</p>
          </div>
        </div>
      </div>
    </div>
  );
}
