"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Check, Copy, MessageCircle, Minus, Plus, Trash2, X } from "lucide-react";
import { useDisplay } from "@/components/display";
import { Button, Segmented } from "@/components/ui";
import { AVATARS, MEMBER_COLORS } from "@/lib/constants";
import { CURRENCY_META, fmt, fmtNumber, fromUsdCents, parseAmount, toUsdCents, type Currency } from "@/lib/money";
import { RATE_META, vesPerUsd, type RateSourceId } from "@/lib/rates-shared";
import { computeSplit, EXTRA_PRESETS, type Extra } from "@/lib/split";

const uid = () => Math.random().toString(36).slice(2, 8);

export function Calculator() {
  const { rates } = useDisplay();
  const [people, setPeople] = useState(() => ["Yo", "Pana 2", "Pana 3", "Pana 4"].map((name, i) => ({ id: uid(), name, avatar: AVATARS[i], color: MEMBER_COLORS[i] })));
  const [currency, setCurrency] = useState<Currency>("USD");
  const [source, setSource] = useState<RateSourceId>("bcv");
  const [mode, setMode] = useState<"equal" | "items">("equal");
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState([{ id: uid(), name: "", price: "", members: [] as string[] }]);
  const [extras, setExtras] = useState<{ id: string; label: string; kind: "percent" | "fixed"; value: string }[]>([]);
  const [copied, setCopied] = useState(false);

  const fx = { vesPerUsd: vesPerUsd(rates, source), vesPerEur: rates.bcvEur };
  const result = useMemo(() => {
    try {
      const ex: Extra[] = extras.map((e) => ({ ...e, value: e.kind === "percent" ? Number(e.value.replace(",", ".")) || 0 : (parseAmount(e.value) ?? 0) }));
      return computeSplit(
        mode === "equal"
          ? { mode: "equal", base: parseAmount(amount) ?? 0, members: people.map((p) => p.id) }
          : { mode: "items", items: items.filter((i) => parseAmount(i.price)).map((i) => ({ ...i, price: parseAmount(i.price) ?? 0, qty: 1 })) },
        ex,
      );
    } catch {
      return null;
    }
  }, [mode, amount, people, items, extras]);

  const altCurrency: Currency = currency === "VES" ? "USD" : "VES";
  const conv = (cents: number) => fromUsdCents(toUsdCents(cents, currency, fx), altCurrency, fx);

  const summary = result
    ? [
        `🤙 Vamos feo pa'lante · cuenta dividida`,
        `Total: ${fmt(result.total, currency)}${currency !== "VES" ? ` (${fmt(conv(result.total), "VES")} a ${RATE_META[source].short} ${fmtNumber(fx.vesPerUsd)})` : ""}`,
        ...people.filter((p) => result.shares[p.id]).map((p) => `• ${p.name}: ${fmt(result.shares[p.id], currency)} / ${fmt(conv(result.shares[p.id]), altCurrency)}`),
      ].join("\n")
    : "";

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">¿Cuántos son?</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPeople((p) => (p.length > 1 ? p.slice(0, -1) : p))} className="grid size-9 place-items-center rounded-full border border-line" aria-label="Uno menos">
              <Minus size={16} />
            </button>
            <span className="num w-8 text-center text-xl font-bold">{people.length}</span>
            <button
              onClick={() => setPeople((p) => [...p, { id: uid(), name: `Pana ${p.length + 1}`, avatar: AVATARS[p.length % AVATARS.length], color: MEMBER_COLORS[p.length % MEMBER_COLORS.length] }])}
              className="grid size-9 place-items-center rounded-full border border-line"
              aria-label="Uno más"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AnimatePresence>
            {people.map((p) => (
              <motion.label key={p.id} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="chip !py-1 !pl-1">
                <span className="grid size-6 place-items-center rounded-full text-sm" style={{ background: p.color }}>
                  {p.avatar}
                </span>
                <input
                  className="w-20 bg-transparent outline-none"
                  value={p.name}
                  onChange={(e) => setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
                  aria-label="Nombre"
                />
              </motion.label>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <Segmented name="calc-cur" value={currency} onChange={setCurrency} options={(["USD", "VES", "EUR", "USDT"] as Currency[]).map((c) => ({ value: c, label: `${CURRENCY_META[c].flag} ${CURRENCY_META[c].symbol}` }))} />
        <div className="grid grid-cols-3 gap-1.5">
          {(["bcv", "eur", "usdt"] as RateSourceId[]).map((s) => (
            <button key={s} onClick={() => setSource(s)} className={clsx("rounded-xl border px-2 py-2 text-center", source === s ? "border-mango bg-mango/10" : "border-line")}>
              <span className="block text-[11px] font-semibold text-muted">{RATE_META[s].short}</span>
              <span className="num block text-sm font-bold">{fmtNumber(vesPerUsd(rates, s))}</span>
            </button>
          ))}
        </div>
        <Segmented
          name="calc-mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "equal", label: "Todos igual" },
            { value: "items", label: "Por consumo" },
          ]}
        />
        {mode === "equal" ? (
          <div className="relative">
            <span className="num absolute top-1/2 left-4 -translate-y-1/2 text-2xl font-bold text-muted">{CURRENCY_META[currency].symbol}</span>
            <input className="field num !py-4 !pl-14 !text-3xl font-bold" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-2xl border border-line p-3">
                <div className="flex gap-2">
                  <input className="field flex-1" placeholder="¿Qué fue?" value={it.name} onChange={(e) => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))} />
                  <input
                    className="field num w-28 text-right"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={it.price}
                    onChange={(e) => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, price: e.target.value } : x)))}
                  />
                  <button onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((x) => x.id !== it.id) : xs))} className="grid size-11 place-items-center text-muted" aria-label="Quitar">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {people.map((p) => {
                    const on = it.members.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, members: on ? x.members.filter((m) => m !== p.id) : [...x.members, p.id] } : x)))}
                        className={clsx("rounded-full border px-2.5 py-1 text-xs", on ? "border-mango bg-mango/15 font-semibold" : "border-line text-muted")}
                      >
                        {p.avatar} {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Button variant="soft" size="sm" onClick={() => setItems((xs) => [...xs, { id: uid(), name: "", price: "", members: people.map((p) => p.id) }])}>
              <Plus size={15} /> Ítem
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {EXTRA_PRESETS.filter((p) => p.kind === "percent").map((p) => {
            const on = extras.find((e) => e.label === p.label);
            return (
              <button
                key={p.label}
                onClick={() => setExtras((x) => (on ? x.filter((e) => e.label !== p.label) : [...x, { id: uid(), label: p.label, kind: p.kind, value: String(p.value) }]))}
                className={clsx("chip", on && "border-mango !bg-mango/15")}
              >
                {on ? <X size={12} /> : <Plus size={12} />} {p.label} {p.value}%
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {result && result.total > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="sticker relative bg-sun p-6 text-sun-ink">
            <p className="display text-sm font-bold opacity-75">Total</p>
            <p className="num text-4xl font-bold">{fmt(result.total, currency)}</p>
            <p className="num text-sm opacity-75">
              {fmt(conv(result.total), altCurrency)} a {RATE_META[source].short}
            </p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {people
                .filter((p) => result.shares[p.id])
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-card p-3 text-text">
                    <span className="grid size-9 place-items-center rounded-full text-lg" style={{ background: p.color }}>
                      {p.avatar}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                    <span className="text-right">
                      <span className="num block font-bold">{fmt(result.shares[p.id], currency)}</span>
                      <span className="num block text-xs text-muted">{fmt(conv(result.shares[p.id]), altCurrency)}</span>
                    </span>
                  </li>
                ))}
            </ul>
            <div className="mt-5 flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(summary);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {}
                }}
                className="btn-pop btn-pop-paper flex-1 py-3 text-sm"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />} Copiar
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(summary)}`} target="_blank" rel="noopener noreferrer" className="btn-pop flex-1 py-3 text-sm">
                <MessageCircle size={16} /> WhatsApp
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
