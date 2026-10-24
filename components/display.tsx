"use client";

import { animate, useInView, useMotionValue, useTransform, motion } from "motion/react";
import { createContext, use, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setDisplayCurrency } from "@/app/actions/auth";
import { fmt, type Currency } from "@/lib/money";
import { RATE_META, vesPerUsd, type RateSourceId, type RatesSnapshot } from "@/lib/rates-shared";

export type DisplayCurrency = "USD" | "VES" | "EUR";

type Ctx = {
  currency: DisplayCurrency;
  rateSource: RateSourceId;
  rates: RatesSnapshot;
  setCurrency: (c: DisplayCurrency, r?: RateSourceId) => void;
  /** USD centavos → centavos de la moneda en pantalla. */
  convert: (usdCents: number, currency?: DisplayCurrency) => number;
  show: (usdCents: number, opts?: { sign?: boolean; currency?: DisplayCurrency; compact?: boolean }) => string;
  pending: boolean;
};

const DisplayContext = createContext<Ctx | null>(null);

export function DisplayProvider({
  initialCurrency,
  initialRateSource,
  rates,
  children,
}: {
  initialCurrency: DisplayCurrency;
  initialRateSource: RateSourceId;
  rates: RatesSnapshot;
  children: React.ReactNode;
}) {
  const [currency, setCur] = useState<DisplayCurrency>(initialCurrency);
  const [rateSource, setRate] = useState<RateSourceId>(initialRateSource);
  const [pending, start] = useTransition();

  const value = useMemo<Ctx>(() => {
    const convert = (usd: number, c: DisplayCurrency = currency) => {
      if (c === "USD") return usd;
      if (c === "VES") return Math.round(usd * vesPerUsd(rates, rateSource));
      return Math.round((usd * rates.bcvUsd) / rates.bcvEur);
    };
    return {
      currency,
      rateSource,
      rates,
      pending,
      convert,
      show: (usd, opts = {}) => fmt(convert(usd, opts.currency), (opts.currency ?? currency) as Currency, opts),
      setCurrency: (c, r) => {
        setCur(c);
        if (r) setRate(r);
        start(() => setDisplayCurrency(c, r));
      },
    };
  }, [currency, rateSource, rates, pending]);

  return <DisplayContext value={value}>{children}</DisplayContext>;
}

export function useDisplay(): Ctx {
  const ctx = use(DisplayContext);
  if (!ctx) throw new Error("useDisplay fuera de DisplayProvider");
  return ctx;
}

/** Monto en la moneda que el usuario eligió ver. */
export function Money({
  usd,
  sign,
  className,
  currency,
  animated,
  compact,
}: {
  usd: number;
  sign?: boolean;
  className?: string;
  currency?: DisplayCurrency;
  animated?: boolean;
  compact?: boolean;
}) {
  const { convert, currency: cur } = useDisplay();
  const c = currency ?? cur;
  const value = convert(usd, c);
  if (animated) return <AnimatedMoney cents={value} currency={c} sign={sign} className={className} />;
  return (
    <span className={`num ${className ?? ""}`} suppressHydrationWarning>
      {fmt(value, c as Currency, { sign, compact })}
    </span>
  );
}

function AnimatedMoney({ cents, currency, sign, className }: { cents: number; currency: DisplayCurrency; sign?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => fmt(Math.round(v), currency as Currency, { sign }));
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, cents, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [cents, inView, mv]);
  return (
    <motion.span ref={ref} className={`num ${className ?? ""}`}>
      {text}
    </motion.span>
  );
}

/** Selector rápido de moneda/tasa para ver los montos. */
export function CurrencySwitch({ className }: { className?: string }) {
  const { currency, rateSource, setCurrency } = useDisplay();
  const options: { id: string; label: string; c: DisplayCurrency; r?: RateSourceId }[] = [
    { id: "USD", label: "$", c: "USD" },
    { id: "VES-bcv", label: "Bs·BCV", c: "VES", r: "bcv" },
    { id: "VES-eur", label: "Bs·€", c: "VES", r: "eur" },
    { id: "VES-usdt", label: "Bs·USDT", c: "VES", r: "usdt" },
    { id: "EUR", label: "€", c: "EUR" },
  ];
  const active = currency === "VES" ? `VES-${rateSource}` : currency;
  return (
    <div className={`relative flex shrink-0 rounded-full border border-line bg-card-2 p-1 text-[11px] font-semibold sm:text-xs ${className ?? ""}`} role="radiogroup" aria-label="Ver montos en">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={active === o.id}
          title={o.r ? `Bolívares a tasa ${RATE_META[o.r].label}` : o.c === "USD" ? "Dólares" : "Euros"}
          onClick={() => setCurrency(o.c, o.r)}
          className="relative z-10 rounded-full px-2 py-1.5 whitespace-nowrap transition-colors data-[on=true]:text-[#1a1220] sm:px-2.5"
          data-on={active === o.id}
        >
          {active === o.id && (
            <motion.span layoutId="cur-pill" className="absolute inset-0 -z-10 rounded-full bg-mango" transition={{ type: "spring", bounce: 0.25, duration: 0.45 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}
