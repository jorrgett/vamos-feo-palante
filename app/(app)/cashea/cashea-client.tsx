"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useDisplay, Money } from "@/components/display";
import { Avatar, Segmented } from "@/components/ui";
import { CASHEA_GRACE_DAYS, CASHEA_LATE_FEE_USD, CASHEA_LEVELS, CASHEA_LINES, casheaSchedule, levelOf } from "@/lib/cashea";
import { longDay, prettyDay, relativeDue, todayVE, diffDays } from "@/lib/dates";
import { fmt, fmtNumber, parseAmount } from "@/lib/money";

type Due = {
  planId: string;
  groupId: string;
  groupName: string;
  store: string;
  holderName: string;
  holderAvatar: string;
  holderColor: string;
  iAmHolder: boolean;
  n: number;
  installments: number;
  dueDate: string;
  amountUsd: number;
  myPartUsd: number;
};

export function CasheaTimeline({ items }: { items: Due[] }) {
  const { rates } = useDisplay();
  if (items.length === 0)
    return (
      <div className="card p-6 text-center">
        <p className="text-4xl">🛍️</p>
        <p className="mt-2 font-semibold">Sin cuotas por pagar</p>
        <p className="text-sm text-muted">Cuando alguien pague un gasto con Cashea, sus cuotas aparecen aquí.</p>
      </div>
    );
  const byDate = new Map<string, Due[]>();
  for (const d of items) byDate.set(d.dueDate, [...(byDate.get(d.dueDate) ?? []), d]);
  return (
    <ol className="relative space-y-4 border-l-2 border-dashed border-line-strong pl-6">
      {[...byDate.entries()].map(([date, list], i) => {
        const late = diffDays(date, todayVE()) < 0;
        return (
          <motion.li key={date} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative">
            <span className={clsx("absolute top-1 -left-[33px] size-4 rounded-full ring-4 ring-bg", late ? "bg-rose" : "bg-cashea")} />
            <p className="text-sm font-bold first-letter:uppercase">
              {longDay(date)} <span className={clsx("font-semibold", late ? "text-rose" : "text-muted")}>· {relativeDue(date)}</span>
            </p>
            <div className="mt-2 space-y-2">
              {list.map((d) => {
                const usd = d.iAmHolder ? d.amountUsd : d.myPartUsd;
                return (
                  <Link key={`${d.planId}-${d.n}`} href={`/salidas/${d.groupId}`} className="card flex items-center gap-3 p-3">
                    <Avatar emoji={d.holderAvatar} color={d.holderColor} size={34} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-semibold">
                        {d.store} · cuota {d.n}/{d.installments}
                      </p>
                      <p className="truncate text-xs text-muted">{d.iAmHolder ? `Le pagas a Cashea · ${d.groupName}` : `Tu parte para ${d.holderName} · ${d.groupName}`}</p>
                    </div>
                    <div className="text-right">
                      <Money usd={usd} className="block text-sm font-bold" />
                      <span className="num text-[11px] text-muted">≈ {fmt(Math.round(usd * rates.bcvUsd), "VES")}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function CasheaSimulator() {
  const { rates } = useDisplay();
  const today = todayVE();
  const [amount, setAmount] = useState("100");
  const [level, setLevel] = useState(3);
  const [promo, setPromo] = useState(false);
  const [line, setLine] = useState("principal");
  const [people, setPeople] = useState(1);
  const lvl = levelOf(level);
  const pct = promo ? lvl.promoPct : lvl.initialPct;
  const lineInfo = CASHEA_LINES.find((l) => l.id === line)!;
  const total = parseAmount(amount) ?? 0;
  const s = casheaSchedule({ totalUsd: total, initialPct: pct, installments: lineInfo.installments, intervalDays: 14, purchaseDate: today });
  const tooLow = (lineInfo.minLevel && level < lineInfo.minLevel) || (lineInfo.minUsd && total < lineInfo.minUsd);

  return (
    <div className="card overflow-clip">
      <div className="border-b border-line p-5">
        <h2 className="display text-xl font-bold">Simulador Cashea</h2>
        <p className="text-sm text-muted">¿Cuánto pagas hoy y cuánto en cada cuota?</p>
      </div>
      <div className="space-y-4 p-5">
        <div className="relative">
          <span className="num absolute top-1/2 left-4 -translate-y-1/2 text-xl font-bold text-muted">$</span>
          <input className="field num !py-3 !pl-10 !text-2xl font-bold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {CASHEA_LEVELS.map((l) => (
            <button
              key={l.level}
              onClick={() => setLevel(l.level)}
              className={clsx("rounded-xl border-2 px-2 py-2.5 text-center", level === l.level ? "border-ink bg-cashea text-cashea-ink" : "border-line")}
            >
              <span className="block text-sm font-bold">{l.name}</span>
              <span className={clsx("num block text-[11px]", level === l.level ? "opacity-75" : "text-muted")}>{promo ? l.promoPct : l.initialPct}% inicial</span>
            </button>
          ))}
        </div>
        <select className="field" value={line} onChange={(e) => setLine(e.target.value)}>
          {CASHEA_LINES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label} · {l.installments} cuota{l.installments > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <button onClick={() => setPromo(!promo)} className={clsx("chip w-full justify-center !py-2", promo && "border-cashea !bg-cashea/25")}>
          <Sparkles size={13} /> Días del Club (oct–dic 2026) {promo ? "activado" : "desactivado"}
        </button>
        {tooLow && <p className="rounded-xl bg-rose-soft px-3 py-2 text-xs text-rose">{lineInfo.hint}: con este nivel o monto normalmente no aplica.</p>}

        <div className="rounded-2xl bg-card-2 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Inicial hoy ({fmtNumber(pct, 0)}%)</span>
            <span className="num text-xl font-bold">{fmt(s.initialUsd, "USD")}</span>
          </div>
          <p className="num text-right text-xs text-muted">{fmt(Math.round(s.initialUsd * rates.bcvUsd), "VES")}</p>
          <ol className="mt-3 space-y-1.5 border-t border-line pt-3">
            {s.rows.slice(1).map((r) => (
              <li key={r.n} className="flex justify-between text-sm">
                <span className="text-muted">
                  Cuota {r.n} · {prettyDay(r.dueDate, true)}
                </span>
                <span className="num font-semibold">{fmt(r.amountUsd, "USD")}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="label">¿Entre cuántos panas?</p>
          <Segmented name="sim-people" size="sm" value={String(people)} onChange={(v) => setPeople(Number(v))} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} />
          {people > 1 && (
            <p className="mt-2 text-sm">
              Cada uno: <b className="num">{fmt(Math.round(s.initialUsd / people), "USD")}</b> de inicial y <b className="num">{fmt(Math.round((s.rows[1]?.amountUsd ?? 0) / people), "USD")}</b> por cuota.
            </p>
          )}
        </div>
      </div>
      <details className="border-t border-line p-5 text-sm">
        <summary className="cursor-pointer font-semibold">Cómo funciona Cashea (resumen)</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
          <li>Pagas una inicial en la tienda y el resto en cuotas iguales sin intereses cada 14 días.</li>
          <li>Los montos están en dólares; las cuotas se pagan en Bs a tasa BCV del día que pagas.</li>
          <li>Hay {CASHEA_GRACE_DAYS} días de gracia; después, {fmt(CASHEA_LATE_FEE_USD, "USD")} de reactivación por cada cuota atrasada y bajas de nivel.</li>
          <li>Puedes adelantar cuotas (ganas más puntos del Club), pero no hay descuento en dólares.</li>
          <li>Si lo financiado supera tu línea disponible, la inicial sube para cubrir la diferencia.</li>
        </ul>
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">Nivel</th>
              <th className="py-1 text-right">Inicial</th>
              <th className="py-1 text-right">Días del Club</th>
            </tr>
          </thead>
          <tbody>
            {CASHEA_LEVELS.map((l) => (
              <tr key={l.level} className="border-t border-line">
                <td className="py-1.5">
                  {l.name}
                </td>
                <td className="num py-1.5 text-right">{l.initialPct}%</td>
                <td className="num py-1.5 text-right">{l.promoPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-faint">Según la web de Cashea y la prensa, revisado el 16-10-2026. Cashea cambia sus condiciones seguido: confirma en tu app.</p>
      </details>
    </div>
  );
}
