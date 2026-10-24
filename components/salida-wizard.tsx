"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Minus, Plus, Sparkles, Trash2, X } from "lucide-react";
import { saveSalida, type SalidaInput } from "@/app/actions/salidas";
import { ratesForDate } from "@/app/actions/rates";
import { CATEGORIES, PAY_METHODS, payMethodOf } from "@/lib/constants";
import { CASHEA_DEFAULT_INTERVAL, CASHEA_LEVELS, CASHEA_LINES, casheaSchedule, inClubDays, levelOf } from "@/lib/cashea";
import { prettyDay, todayVE } from "@/lib/dates";
import { CURRENCY_META, fmt, fmtNumber, fromUsdCents, parseAmount, toUsdCents, type Currency } from "@/lib/money";
import { computeSplit, EXTRA_PRESETS, sharesToUsd, SplitError, type Extra, type SplitInput, type SplitItem, type SplitMode } from "@/lib/split";
import { shareStatuses } from "@/lib/share-status";
import { RATE_META, vesPerUsd, type RateSourceId, type RatesSnapshot } from "@/lib/rates-shared";
import { useDisplay } from "./display";
import { Avatar, Button, Segmented, useToast } from "./ui";
import { ReceiptAssistant, type ReceiptApply } from "./receipt-assistant";

export type FormMember = { id: string; name: string; avatar: string; color: string; isMe: boolean; hasAccount: boolean };

type FxSource = RateSourceId | "custom";
type PayerRow = { key: string; memberId: string; currency: Currency; amount: string; method: string };

export type SalidaInitial = {
  salidaId: string;
  participants: string[];
  title: string;
  category: string;
  extraCategories?: string[];
  place: string | null;
  notes: string | null;
  date: string;
  currency: Currency;
  fx: { source: FxSource; vesPerUsd: number; vesPerEur?: number | null; vesPerUsdt?: number | null };
  split: SalidaInput["split"];
  payers: { memberId: string; currency: Currency; amount: number; method: string }[];
  cashea?: { level: number; initialPct: number; installments: number; intervalDays: number; mode: string; store: string | null; line: string } | null;
  /** Estado de cada quien en la cuenta al momento de editar. */
  paid?: Record<string, "pagado" | "parcial" | "falta">;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const centsToInput = (c: number) => (c ? fmtNumber(c / 100) : "");
const defaultMethod = (c: Currency) => (c === "USD" ? "efectivo_usd" : c === "VES" ? "pago_movil" : c === "EUR" ? "efectivo_eur" : "binance");

const STEPS = ["¿Qué salida fue?", "¿Quiénes fueron?", "La cuenta", "¿Quién puso la plata?", "¿Quién ya pagó su parte?", "Revisa y anota"];

export function SalidaWizard({
  people,
  meId,
  defaultRate,
  initial,
  aiOn = false,
}: {
  /** Todos los panas registrados (y los «Ex pana» de esta salida, si se edita). */
  people: FormMember[];
  meId: string;
  defaultRate: RateSourceId;
  initial?: SalidaInitial;
  /** Si la IA está activa: escanear la factura. */
  aiOn?: boolean;
}) {
  const groupRate = defaultRate;
  const [step, setStep] = useState(0);
  const [participants, setParticipants] = useState<string[]>(initial?.participants ?? [meId]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const members = useMemo(() => people.filter((p) => participants.includes(p.id)), [people, participants]);
  const router = useRouter();
  const toast = useToast();
  const { rates: todayRates } = useDisplay();
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Datos básicos
  const [title, setTitle] = useState(initial?.title ?? "");
  // Una o varias categorías; la primera que se marca es la principal (el emoji de la salida).
  const [categories, setCategories] = useState<string[]>(() => [...new Set([initial?.category ?? "comida", ...(initial?.extraCategories ?? [])])]);
  const toggleCategory = (id: string) =>
    setCategories((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((c) => c !== id) : cur) : [...cur, id]));
  const [place, setPlace] = useState(initial?.place ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [date, setDate] = useState(initial?.date ?? todayVE());

  // ── Moneda y tasa
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "USD");
  const [rates, setRates] = useState<RatesSnapshot>(todayRates);
  const [fxSource, setFxSource] = useState<FxSource>(initial?.fx.source ?? groupRate);
  const [customRate, setCustomRate] = useState(initial?.fx.source === "custom" ? fmtNumber(initial.fx.vesPerUsd) : "");
  const [ratesLoading, setRatesLoading] = useState(false);

  useEffect(() => {
    if (initial && date === initial.date) return;
    let alive = true;
    setRatesLoading(true);
    ratesForDate(date)
      .then((r) => alive && r && setRates(r))
      .finally(() => alive && setRatesLoading(false));
    return () => {
      alive = false;
    };
  }, [date, initial]);

  const fx = useMemo(() => {
    if (initial && date === initial.date && fxSource === initial.fx.source && fxSource !== "custom")
      return { vesPerUsd: initial.fx.vesPerUsd, vesPerEur: initial.fx.vesPerEur ?? rates.bcvEur, vesPerUsdt: initial.fx.vesPerUsdt ?? rates.usdt };
    const custom = parseAmount(customRate);
    const vpu = fxSource === "custom" ? (custom ? custom / 100 : vesPerUsd(rates, groupRate)) : vesPerUsd(rates, fxSource);
    return { vesPerUsd: vpu, vesPerEur: rates.bcvEur, vesPerUsdt: rates.usdt };
  }, [fxSource, customRate, rates, groupRate, initial, date]);

  // ── División
  const s0 = initial?.split;
  const [mode, setMode] = useState<SplitMode>(s0?.mode ?? "equal");
  const [amount, setAmount] = useState(s0?.base ? centsToInput(s0.base) : "");
  const [selected, setSelected] = useState<string[]>(
    s0?.members ?? (s0 ? Object.keys(s0.amounts ?? s0.percents ?? s0.weights ?? {}) : members.map((m) => m.id)),
  );
  const [exact, setExact] = useState<Record<string, string>>(Object.fromEntries(Object.entries(s0?.amounts ?? {}).map(([k, v]) => [k, centsToInput(v)])));
  const [percents, setPercents] = useState<Record<string, string>>(Object.fromEntries(Object.entries(s0?.percents ?? {}).map(([k, v]) => [k, String(v)])));
  const [weights, setWeights] = useState<Record<string, number>>(s0?.weights ?? Object.fromEntries(people.map((m) => [m.id, 1])));
  const [items, setItems] = useState<(Omit<SplitItem, "price"> & { price: string })[]>(
    s0?.items?.map((i) => ({ ...i, price: centsToInput(i.price) })) ?? [{ id: uid(), name: "", price: "", qty: 1, members: [] }],
  );
  const [extras, setExtras] = useState<(Omit<Extra, "value"> & { value: string })[]>(
    s0?.extras?.map((e) => ({ ...e, value: e.kind === "percent" ? String(e.value) : centsToInput(e.value) })) ?? [],
  );

  // Al cambiar quiénes fueron: los nuevos entran a la división y los que salen se quitan de todo.
  const [prevParticipants, setPrevParticipants] = useState(participants);
  if (prevParticipants !== participants) {
    const added = participants.filter((id) => !prevParticipants.includes(id));
    const inP = (id: string) => participants.includes(id);
    setPrevParticipants(participants);
    setSelected((s) => [...s.filter(inP), ...added]);
    setWeights((w) => ({ ...Object.fromEntries(added.map((id) => [id, 1])), ...w }));
    setExact((x) => Object.fromEntries(Object.entries(x).filter(([k]) => inP(k))));
    setPercents((x) => Object.fromEntries(Object.entries(x).filter(([k]) => inP(k))));
    setItems((xs) => xs.map((i) => ({ ...i, members: i.members.filter(inP) })));
  }

  /** Lo que leyó el asistente de la factura pasa al formulario (montos, cargos y quién pidió qué). */
  const applyReceipt = (r: ReceiptApply) => {
    if (r.currency) setCurrency(r.currency);
    setMode(r.mode);
    if (r.mode === "equal") {
      setAmount(centsToInput(r.base));
      setSelected(members.map((m) => m.id));
    } else {
      setItems(r.items.map((i) => ({ id: uid(), name: i.name, price: centsToInput(i.price), qty: 1, members: i.members })));
    }
    setExtras(r.extras.map((e) => ({ id: uid(), label: e.label.slice(0, 40), kind: e.kind, value: e.kind === "percent" ? String(e.value) : centsToInput(e.value) })));
    if (!place.trim() && r.place) setPlace(r.place.slice(0, 80));
    if (r.date) setDate(r.date);
  };

  const splitInput: SplitInput | null = useMemo(() => {
    const base = parseAmount(amount) ?? 0;
    switch (mode) {
      case "equal":
        return { mode, base, members: selected };
      case "exact":
        return { mode, amounts: Object.fromEntries(Object.entries(exact).map(([k, v]) => [k, parseAmount(v) ?? 0])) };
      case "percent":
        return { mode, base, percents: Object.fromEntries(Object.entries(percents).map(([k, v]) => [k, Number(v.replace(",", ".")) || 0])) };
      case "shares":
        return { mode, base, weights: Object.fromEntries(Object.entries(weights).filter(([k]) => selected.includes(k))) };
      case "items":
        return {
          mode,
          items: items
            .filter((i) => parseAmount(i.price))
            .map((i) => ({ ...i, price: parseAmount(i.price) ?? 0 })),
        };
    }
  }, [mode, amount, selected, exact, percents, weights, items]);

  const extrasParsed: Extra[] = extras.map((e) => ({
    ...e,
    value: e.kind === "percent" ? Number(e.value.replace(",", ".")) || 0 : (parseAmount(e.value) ?? 0),
  }));

  const split = useMemo(() => {
    try {
      return { ok: true as const, r: computeSplit(splitInput!, extrasParsed) };
    } catch (e) {
      return { ok: false as const, error: e instanceof SplitError ? e.message : "Revisa los montos." };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitInput, JSON.stringify(extras)]);

  const total = split.ok ? split.r.total : 0;
  const totalUsd = toUsdCents(total, currency, fx);
  const exactTarget = parseAmount(amount) ?? 0;
  const exactAssigned = mode === "exact" && split.ok ? split.r.base : 0;

  // ── Pagadores
  const [multi, setMulti] = useState((initial?.payers.length ?? 1) > 1);
  const [payers, setPayersState] = useState<PayerRow[]>(
    initial?.payers.map((p) => ({ key: uid(), memberId: p.memberId, currency: p.currency, amount: centsToInput(p.amount), method: p.method })) ?? [
      { key: uid(), memberId: meId, currency: "USD", amount: "", method: "efectivo_usd" },
    ],
  );

  const setPayers = setPayersState;
  // Si alguien que puso plata ya no está en la salida, se reemplaza por ti.
  useEffect(() => {
    setPayersState((ps) => (ps.some((p) => !participants.includes(p.memberId)) ? ps.map((p) => (participants.includes(p.memberId) ? p : { ...p, memberId: meId })) : ps));
  }, [participants, meId]);

  // Con un solo pagador, su monto sigue al total.
  useEffect(() => {
    if (multi) return;
    setPayers((ps) => [{ ...ps[0], currency, amount: total ? centsToInput(total) : "", method: ps[0].method === "cashea" ? "cashea" : payMethodOf(ps[0].method).currency === currency ? ps[0].method : defaultMethod(currency) }]);
  }, [multi, total, currency]);

  const payersUsd = payers.map((p) => toUsdCents(parseAmount(p.amount) ?? 0, p.currency, fx));
  /** Cambia la moneda de un pago conservando su valor. */
  const recur = (row: PayerRow, to: Currency): PayerRow => {
    if (row.currency === to) return row;
    const c = parseAmount(row.amount);
    return { ...row, currency: to, amount: c ? centsToInput(fromUsdCents(toUsdCents(c, row.currency, fx), to, fx)) : row.amount };
  };
  const paidUsd = payersUsd.reduce((a, b) => a + b, 0);
  const diffUsd = paidUsd - totalUsd;
  const tolerance = Math.max(3, Math.round(totalUsd * 0.005));
  const casheaPayer = payers.find((p) => p.method === "cashea");

  // ── Cashea
  const c0 = initial?.cashea;
  const [level, setLevel] = useState(c0?.level ?? 3);
  // La promo "Días del Club" sólo aplica en aliados seleccionados: arranca apagada.
  const [promo, setPromo] = useState(false);
  const [initialPct, setInitialPct] = useState(String(c0?.initialPct ?? levelOf(3).initialPct));
  const [line, setLine] = useState(c0?.line ?? "principal");
  const [cuotas, setCuotas] = useState(c0?.installments ?? 3);
  const [interval, setInterval] = useState(c0?.intervalDays ?? CASHEA_DEFAULT_INTERVAL);
  const [casheaMode, setCasheaMode] = useState<"espejo" | "inmediato">((c0?.mode as "espejo") ?? "espejo");
  const [availableLine, setAvailableLine] = useState("");
  const [store, setStore] = useState(c0?.store ?? "");

  useEffect(() => {
    if (promo && !inClubDays(date)) {
      setPromo(false);
      setInitialPct(String(levelOf(level).initialPct));
    }
  }, [date, promo, level]);
  const pickLevel = (n: number, p = promo) => {
    setLevel(n);
    setInitialPct(String(p ? levelOf(n).promoPct : levelOf(n).initialPct));
  };
  const casheaUsd = casheaPayer ? payersUsd[payers.indexOf(casheaPayer)] : 0;
  const schedule = casheaPayer
    ? casheaSchedule({
        totalUsd: casheaUsd,
        initialPct: Number(initialPct.replace(",", ".")) || 0,
        installments: cuotas,
        intervalDays: interval,
        purchaseDate: date,
        availableLineUsd: parseAmount(availableLine) ?? null,
      })
    : null;

  // ── Quién ya pagó su parte (se calcula en vivo con lo que va quedando)
  const initialPaid = initial?.paid ?? {};
  const [paidState, setPaidState] = useState<Record<string, "pagado" | "parcial" | "falta">>(initialPaid);
  const debtors = useMemo(() => {
    if (!split.ok || totalUsd <= 0) return [];
    const usdShares = sharesToUsd(split.r.shares, totalUsd);
    const e = {
      payers: payers.map((p, i) => ({ memberId: p.memberId, amountUsd: payersUsd[i] })),
      shares: Object.entries(usdShares).map(([memberId, amountUsd]) => ({ memberId, amountUsd })),
    };
    return shareStatuses(e, []).filter((x) => x.owesUsd > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, totalUsd, JSON.stringify(payers.map((p) => [p.memberId, payersUsd[payers.indexOf(p)]]))]);
  const stateOf = (id: string) => paidState[id] ?? "falta";

  // ── Guardar
  const canSave =
    title.trim().length > 0 &&
    split.ok &&
    total > 0 &&
    Math.abs(diffUsd) <= tolerance &&
    (mode !== "exact" || !exactTarget || exactAssigned === exactTarget) &&
    (fxSource !== "custom" || !!parseAmount(customRate));

  const submit = () => {
    if (!splitInput || !split.ok) return;
    setError(null);
    const payload: SalidaInput = {
      salidaId: initial?.salidaId,
      participants,
      title: title.trim(),
      category: categories[0],
      extraCategories: categories.slice(1),
      place: place.trim() || undefined,
      notes: notes.trim() || undefined,
      date,
      currency,
      fx: { source: fxSource, vesPerUsd: fx.vesPerUsd, vesPerEur: fx.vesPerEur, vesPerUsdt: fx.vesPerUsdt ?? null, date: rates.bcvDate },
      split: {
        mode,
        base: mode === "exact" || mode === "items" ? undefined : parseAmount(amount) ?? 0,
        members: mode === "equal" ? selected : undefined,
        amounts: mode === "exact" ? (splitInput as { amounts: Record<string, number> }).amounts : undefined,
        percents: mode === "percent" ? (splitInput as { percents: Record<string, number> }).percents : undefined,
        weights: mode === "shares" ? (splitInput as { weights: Record<string, number> }).weights : undefined,
        items: mode === "items" ? (splitInput as { items: SplitItem[] }).items : undefined,
        extras: extrasParsed.filter((e) => e.value > 0),
      },
      payers: payers
        .filter((p) => (parseAmount(p.amount) ?? 0) > 0)
        .map((p) => ({ memberId: p.memberId, currency: p.currency, amount: parseAmount(p.amount) ?? 0, method: p.method })),
      cashea: casheaPayer
        ? {
            level,
            initialPct: Number(initialPct.replace(",", ".")) || 0,
            installments: cuotas,
            intervalDays: interval,
            discountPct: 0,
            mode: casheaMode,
            store: store.trim() || undefined,
            line: line as "principal",
            availableLineUsd: parseAmount(availableLine) ?? null,
          }
        : undefined,
      paidMembers: debtors.filter((x) => stateOf(x.memberId) === "pagado").map((x) => x.memberId),
      unpaidMembers: Object.entries(initialPaid)
        .filter(([id, st]) => st !== "falta" && stateOf(id) === "falta")
        .map(([id]) => id),
    };
    start(async () => {
      const r = await saveSalida(payload);
      if (r.ok) {
        toast(initial ? "Salida actualizada" : "¡Salida anotada! 🤙 Ya les llegó el aviso");
        router.push(`/salidas/${r.id}`);
        router.refresh();
      } else {
        setError(r.error);
        toast(r.error, "error");
      }
    });
  };

  // Qué falta en cada paso para poder seguir (guía al usuario).
  const blockers: (string | null)[] = [
    title.trim() ? null : "Ponle un nombre a la salida (ej.: Pizzas en casa de Luis).",
    participants.length >= 2 ? null : "Elige al menos a otro pana que haya ido.",
    !split.ok
      ? split.error
      : total <= 0
        ? "Escribe cuánto fue la cuenta."
        : mode === "exact" && exactTarget && exactAssigned !== exactTarget
          ? "Los montos de cada quien no suman el total."
          : fxSource === "custom" && !parseAmount(customRate)
            ? "Escribe la tasa que usaron."
            : null,
    Math.abs(diffUsd) <= tolerance ? null : diffUsd < 0 ? `Falta ${fmt(-diffUsd, "USD")} por asignar entre los que pusieron.` : `Sobran ${fmt(diffUsd, "USD")} en lo que pusieron.`,
    null,
    null,
  ];
  const canNext = blockers[step] === null;
  const go = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const sym = CURRENCY_META[currency].symbol;
  const memberById = (id: string) => members.find((m) => m.id === id);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-32">
      {/* Progreso del asistente */}
      <div className="sticky top-16 z-30 -mx-4 bg-bg px-4 py-2 sm:mx-0 sm:px-0">
        <div className="flex items-center justify-between text-xs font-semibold text-muted">
          <span>
            Paso {step + 1} de {STEPS.length} · <span className="text-text">{STEPS[step]}</span>
          </span>
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)} className="flex items-center gap-1 hover:text-text">
              <ArrowLeft size={13} /> Atrás
            </button>
          )}
        </div>
        <div className="mt-1.5 flex gap-1">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              aria-label={`Ir al paso ${i + 1}`}
              disabled={i > step && blockers.slice(0, i).some((b) => b !== null)}
              onClick={() => go(i)}
              className={clsx("h-2 flex-1 rounded-full border border-ink/20 transition-colors", i < step ? "bg-mint" : i === step ? "bg-mango" : "bg-card-2")}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
      <Card step={1} title={STEPS[0]}>
        <input
          className="field display !text-xl font-bold"
          placeholder="Ej.: Pizzas donde Luis"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          autoFocus={!initial}
        />
        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {CATEGORIES.map((c) => {
            const on = categories.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCategory(c.id)}
                className={clsx(
                  "relative flex min-w-0 flex-col items-center gap-1 rounded-xl border-2 px-1 py-2 text-center text-[11px] leading-tight font-semibold transition-all",
                  on ? "border-mango bg-mango/15 text-text" : "border-line text-muted hover:text-text",
                )}
              >
                {on && categories.length > 1 && (
                  <Check size={12} strokeWidth={3} className="absolute top-1 right-1 text-mango-ink" aria-hidden />
                )}
                <span className="text-xl leading-none">{c.emoji}</span>
                <span className="line-clamp-2">{c.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {categories.length > 1
            ? `${categories.map((id) => CATEGORIES.find((c) => c.id === id)?.label).join(" + ")} · la salida sale con ${CATEGORIES.find((c) => c.id === categories[0])?.emoji}`
            : "Puedes marcar varias si fue de todo un poco."}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="place">
              Lugar (opcional)
            </label>
            <input id="place" className="field" placeholder="Ej.: La Casa" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="date">
              Fecha
            </label>
            <input id="date" type="date" className="field" value={date} max={todayVE()} onChange={(e) => setDate(e.target.value || todayVE())} />
          </div>
        </div>
      </Card>
      )}

      {step === 1 && (
      <Card step={2} title={STEPS[1]}>
        <p className="-mt-2 mb-3 text-sm text-muted">Toca a los panas que fueron. Solo salen los que tienen cuenta: si falta alguien, invítalo desde «Panas».</p>
        {people.length > 8 && (
          <input className="field mb-3" placeholder="Buscar pana…" value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} />
        )}
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>
            <b className="text-text">{participants.length}</b> {participants.length === 1 ? "persona" : "personas"} en esta salida
          </span>
          <button
            type="button"
            className="font-semibold hover:text-text"
            onClick={() => setParticipants(participants.length === people.length ? [meId] : people.map((p) => p.id))}
          >
            {participants.length === people.length ? "Solo yo" : "Todos"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {people
            .filter((p) => !peopleQuery || p.name.toLowerCase().includes(peopleQuery.toLowerCase()))
            .map((p) => {
              const on = participants.includes(p.id);
              const locked = p.isMe && !initial;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={locked}
                  onClick={() => setParticipants((xs) => (on ? xs.filter((x) => x !== p.id) : [...xs, p.id]))}
                  className={clsx("flex items-center gap-2.5 rounded-2xl border-2 p-2.5 text-left transition-all", on ? "border-ink bg-sun text-sun-ink" : "border-line")}
                >
                  <Avatar emoji={p.avatar} color={p.color} size={34} ghost={!p.hasAccount} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.isMe ? "Yo" : p.name}</span>
                  <span className={clsx("grid size-5 shrink-0 place-items-center rounded-full", on ? "bg-ink text-sun" : "border border-line-strong")}>{on && <Check size={12} strokeWidth={3} />}</span>
                </button>
              );
            })}
        </div>
        {people.length <= 1 && (
          <p className="mt-3 rounded-2xl bg-card-2 p-3 text-sm">
            Todavía no hay más panas registrados. Ve a <b>Panas → Invitar</b> y mándales el link por WhatsApp.
          </p>
        )}
      </Card>
      )}

      {step === 2 && (
        <>
      {aiOn && !initial && <ReceiptAssistant people={members} currentCurrency={currency} onApply={applyReceipt} />}
      {/* 2 · Cuánto */}
      <Card step={3} title="¿Cuánto fue y en qué moneda?">
        <Segmented
          name="currency"
          value={currency}
          onChange={(c) => setCurrency(c)}
          options={(["USD", "VES", "EUR", "USDT"] as Currency[]).map((c) => ({ value: c, label: `${CURRENCY_META[c].flag} ${CURRENCY_META[c].symbol}` }))}
        />
        {mode !== "items" && (
          <div className="mt-4">
            <label className="label" htmlFor="amount">
              {mode === "exact" ? "Total de la cuenta" : "Monto de la cuenta"}
            </label>
            <div className="relative">
              <span className="num absolute top-1/2 left-4 -translate-y-1/2 text-2xl font-bold text-muted">{sym}</span>
              <input
                id="amount"
                className="field num !py-4 !pl-14 !text-3xl font-bold"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
        )}
        {(currency === "VES" || currency === "EUR" || payers.some((p) => p.currency !== currency)) && (
          <RatePicker source={fxSource} setSource={setFxSource} rates={rates} custom={customRate} setCustom={setCustomRate} loading={ratesLoading} date={date} />
        )}
        {total > 0 && currency !== "USD" && currency !== "USDT" && (
          <p className="mt-3 text-sm text-muted">
            Equivale a <b className="num text-text">{fmt(totalUsd, "USD")}</b>
            {currency === "VES" && ` a ${fmtNumber(fx.vesPerUsd)} Bs/$`}
          </p>
        )}
        {total > 0 && currency === "USD" && (
          <p className="mt-3 text-sm text-muted">
            En bolívares: <b className="num text-text">{fmt(fromUsdCents(total, "VES", fx), "VES")}</b> a {fxSource === "custom" ? "tasa propia" : RATE_META[fxSource].short}
          </p>
        )}
      </Card>
      {/* 3 · División */}
      <Card step={3} title="¿Cómo se divide?">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label="Cómo se divide">
          {(
            [
              { value: "equal", label: "Igual", hint: "Todos igual" },
              { value: "items", label: "Consumo", hint: "Lo que pidió" },
              { value: "exact", label: "Exacto", hint: "Montos a mano" },
              { value: "percent", label: "Porcentaje", hint: "% por pana" },
              { value: "shares", label: "Partes", hint: "Ej.: 2 a 1" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={mode === o.value}
              onClick={() => setMode(o.value)}
              className={clsx(
                "min-w-0 rounded-xl border-2 px-1.5 py-2 text-center transition-all",
                mode === o.value ? "border-ink bg-sun text-sun-ink" : "border-line text-muted hover:text-text",
              )}
            >
              <span className="block truncate text-sm font-bold">{o.label}</span>
              <span className={clsx("block truncate text-[10.5px]", mode === o.value ? "opacity-75" : "text-faint")}>{o.hint}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="mt-4">
            {mode === "equal" && (
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-muted">
                  <span>
                    Elige quiénes están en esta cuenta · <b className="text-text">{selected.length}</b> de {members.length}
                  </span>
                  <button type="button" className="font-semibold hover:text-text" onClick={() => setSelected(selected.length === members.length ? [] : members.map((m) => m.id))}>
                    {selected.length === members.length ? "Ninguno" : "Todos"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {members.map((m) => {
                    const on = selected.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelected((s) => (on ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                        className={clsx("flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all", on ? "border-mango bg-mango/10" : "border-line opacity-55")}
                      >
                        <Avatar emoji={m.avatar} color={m.color} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{m.isMe ? "Yo" : m.name}</span>
                          {on && split.ok && <span className="num block text-xs text-muted">{fmt(split.r.shares[m.id] ?? 0, currency)}</span>}
                        </span>
                        <span className={clsx("grid size-5 place-items-center rounded-full", on ? "bg-mango text-[#1a1220]" : "border border-line-strong")}>{on && <Check size={12} strokeWidth={3} />}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mode === "exact" && (
              <div className="space-y-2">
                {members.map((m) => (
                  <PersonRow key={m.id} m={m} right={<MoneyInput value={exact[m.id] ?? ""} onChange={(v) => setExact((x) => ({ ...x, [m.id]: v }))} sym={sym} />} />
                ))}
                {exactTarget > 0 && (
                  <p className={clsx("num text-right text-sm font-semibold", exactAssigned === exactTarget ? "text-mint" : "text-rose")}>
                    {exactAssigned === exactTarget ? "✓ Cuadra" : exactAssigned < exactTarget ? `Faltan ${fmt(exactTarget - exactAssigned, currency)}` : `Sobran ${fmt(exactAssigned - exactTarget, currency)}`}
                  </p>
                )}
              </div>
            )}

            {mode === "percent" && (
              <div className="space-y-2">
                {members.map((m) => (
                  <PersonRow
                    key={m.id}
                    m={m}
                    sub={split.ok && split.r.shares[m.id] ? fmt(split.r.shares[m.id], currency) : undefined}
                    right={
                      <div className="relative w-28">
                        <input
                          className="field num pr-8 text-right"
                          inputMode="decimal"
                          placeholder="0"
                          value={percents[m.id] ?? ""}
                          onChange={(e) => setPercents((p) => ({ ...p, [m.id]: e.target.value }))}
                        />
                        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-muted">%</span>
                      </div>
                    }
                  />
                ))}
                <p className="num text-right text-sm text-muted">
                  Suma: {fmtNumber(Object.values(percents).reduce((a, v) => a + (Number(v.replace(",", ".")) || 0), 0), 1)}%
                  <button
                    type="button"
                    className="ml-3 font-semibold text-text"
                    onClick={() => setPercents(Object.fromEntries(members.map((m, i) => [m.id, fmtNumber(i === 0 ? 100 - Math.floor(100 / members.length) * (members.length - 1) : Math.floor(100 / members.length), 0)])))}
                  >
                    Repartir parejo
                  </button>
                </p>
              </div>
            )}

            {mode === "shares" && (
              <div className="space-y-2">
                <p className="text-xs text-muted">Ej.: el que comió doble pone 2 partes; el que solo tomó agua, ½.</p>
                {members.map((m) => {
                  const w = selected.includes(m.id) ? (weights[m.id] ?? 1) : 0;
                  return (
                    <PersonRow
                      key={m.id}
                      m={m}
                      sub={split.ok && split.r.shares[m.id] ? fmt(split.r.shares[m.id], currency) : undefined}
                      right={
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="grid size-9 place-items-center rounded-full border border-line"
                            onClick={() => {
                              const nw = Math.max(0, w - 0.5);
                              setWeights((x) => ({ ...x, [m.id]: nw }));
                              setSelected((s) => (nw === 0 ? s.filter((y) => y !== m.id) : s.includes(m.id) ? s : [...s, m.id]));
                            }}
                            aria-label="Menos"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="num w-10 text-center font-bold">{fmtNumber(w, w % 1 ? 1 : 0)}</span>
                          <button
                            type="button"
                            className="grid size-9 place-items-center rounded-full border border-line"
                            onClick={() => {
                              setWeights((x) => ({ ...x, [m.id]: w + 0.5 }));
                              setSelected((s) => (s.includes(m.id) ? s : [...s, m.id]));
                            }}
                            aria-label="Más"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            )}

            {mode === "items" && (
              <ItemsEditor items={items} setItems={setItems} members={members} sym={sym} currency={currency} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Extras */}
        <div className="mt-5 border-t border-line pt-4">
          <p className="label">Extras (se reparten según lo que consumió cada quien)</p>
          <div className="flex flex-wrap gap-1.5">
            {EXTRA_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setExtras((x) => [...x, { id: uid(), label: p.label, kind: p.kind, value: p.kind === "percent" ? String(p.value) : "" }])}
                className="chip hover:border-line-strong"
              >
                <Plus size={12} /> {p.label}
                {p.kind === "percent" ? ` ${p.value}%` : ""}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            {extras.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <input className="field flex-1" value={e.label} onChange={(ev) => setExtras((x) => x.map((y) => (y.id === e.id ? { ...y, label: ev.target.value } : y)))} />
                <div className="relative w-32">
                  <input
                    className="field num pr-9 text-right"
                    inputMode="decimal"
                    value={e.value}
                    placeholder="0"
                    onChange={(ev) => setExtras((x) => x.map((y) => (y.id === e.id ? { ...y, value: ev.target.value } : y)))}
                  />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">{e.kind === "percent" ? "%" : sym}</span>
                </div>
                <button type="button" onClick={() => setExtras((x) => x.filter((y) => y.id !== e.id))} className="grid size-9 place-items-center text-muted hover:text-rose" aria-label="Quitar">
                  <X size={16} />
                </button>
              </div>
            ))}
            {extras.some((e) => e.label === "IGTF") && <p className="text-xs text-muted">El IGTF (3 %) aplica cuando se paga en divisas en comercios que lo cobran.</p>}
          </div>
        </div>

        {/* Resumen de la división */}
        {split.ok && total > 0 ? (
          <div className="mt-5 rounded-2xl bg-card-2 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-muted">Total</span>
              <span className="num text-2xl font-bold">{fmt(total, currency)}</span>
            </div>
            {split.r.extras.length > 0 && (
              <p className="num mt-0.5 text-right text-xs text-muted">
                {fmt(split.r.base, currency)} + {split.r.extras.map((e) => `${e.label} ${fmt(e.amount, currency)}`).join(" + ")}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(split.r.shares).map(([id, v]) => {
                const m = memberById(id);
                return (
                  <span key={id} className="chip !bg-card">
                    <Avatar emoji={m?.avatar ?? "🙂"} color={m?.color ?? "#9CA3AF"} size={18} className="mr-1 align-middle" /> {m?.isMe ? "Yo" : m?.name} <b className="num">{fmt(v, currency)}</b>
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          !split.ok && (parseAmount(amount) || mode === "items") && <p className="mt-4 text-sm text-rose">{split.error}</p>
        )}
      </Card>
        </>
      )}

      {step === 3 && (
      <Card step={4} title={STEPS[3]}>
        <Segmented
          name="multi"
          value={multi ? "multi" : "one"}
          onChange={(v) => setMulti(v === "multi")}
          options={[
            { value: "one", label: "Una persona" },
            { value: "multi", label: "Varios / mixto" },
          ]}
        />
        <div className="mt-4 space-y-3">
          {payers.map((p, idx) => (
            <div key={p.key} className="rounded-2xl border border-line p-3">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPayers((ps) => ps.map((x) => (x.key === p.key ? { ...x, memberId: m.id } : x)))}
                    className={clsx("flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-all", p.memberId === m.id ? "border-mango bg-mango/15 font-semibold" : "border-line text-muted")}
                  >
                    <Avatar emoji={m.avatar} color={m.color} size={24} /> {m.isMe ? "Yo" : m.name}
                  </button>
                ))}
              </div>
              <div className={clsx("mt-2 grid gap-2", multi && "md:grid-cols-[1fr_1.2fr]")}>
                <div className="relative">
                  <select
                    className="field appearance-none pr-9"
                    value={p.method}
                    onChange={(e) => {
                      const method = e.target.value;
                      const mc = payMethodOf(method).currency as Currency;
                      setPayers((ps) => ps.map((x) => (x.key === p.key ? (multi ? recur({ ...x, method }, mc) : { ...x, method, currency }) : x)));
                    }}
                  >
                    {PAY_METHODS.map((m) => (
                      <option key={m.id} value={m.id} disabled={m.id === "cashea" && !!casheaPayer && casheaPayer.key !== p.key}>
                        {m.emoji} {m.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
                </div>
                {multi && (
                  <div className="flex gap-2">
                    <select
                      className="field w-20 shrink-0"
                      value={p.currency}
                      onChange={(e) => setPayers((ps) => ps.map((x) => (x.key === p.key ? recur(x, e.target.value as Currency) : x)))}
                      aria-label="Moneda"
                    >
                      {(["USD", "VES", "EUR", "USDT"] as Currency[]).map((c) => (
                        <option key={c} value={c}>
                          {CURRENCY_META[c].symbol}
                        </option>
                      ))}
                    </select>
                    <MoneyInput
                      className="min-w-0 flex-1"
                      value={p.amount}
                      onChange={(v) => setPayers((ps) => ps.map((x) => (x.key === p.key ? { ...x, amount: v } : x)))}
                      sym={CURRENCY_META[p.currency].symbol}
                    />
                    {payers.length > 1 && (
                      <button type="button" onClick={() => setPayers((ps) => ps.filter((x) => x.key !== p.key))} className="grid size-11 shrink-0 place-items-center text-muted hover:text-rose" aria-label="Quitar">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {multi && p.currency !== currency && parseAmount(p.amount) ? (
                <p className="num mt-1.5 text-xs text-muted">≈ {fmt(payersUsd[idx], "USD")}</p>
              ) : null}
            </div>
          ))}
        </div>
        {multi && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => {
                const restUsd = Math.max(0, totalUsd - paidUsd);
                const free = members.find((m) => !payers.some((p) => p.memberId === m.id)) ?? members[0];
                setPayers((ps) => [...ps, { key: uid(), memberId: free.id, currency: "USD", amount: restUsd ? centsToInput(restUsd) : "", method: "efectivo_usd" }]);
              }}
            >
              <Plus size={15} /> Otro pago
            </Button>
            {totalUsd > 0 && (
              <span className={clsx("num text-sm font-semibold", Math.abs(diffUsd) <= tolerance ? "text-mint" : "text-rose")}>
                {Math.abs(diffUsd) <= tolerance ? "✓ Cuadra con el total" : diffUsd < 0 ? `Faltan ${fmt(-diffUsd, "USD")}` : `Sobran ${fmt(diffUsd, "USD")}`}
              </span>
            )}
          </div>
        )}

        {/* Cashea */}
        <AnimatePresence>
          {casheaPayer && schedule && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-clip">
              <div className="mt-4 rounded-3xl border-2 border-cashea/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 font-bold">
                    <span className="rounded-md bg-cashea px-2 py-0.5 text-xs font-black text-cashea-ink">CASHEA</span> Plan de pago
                  </p>
                  {inClubDays(date) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPromo(!promo);
                        pickLevel(level, !promo);
                      }}
                      className={clsx("chip", promo && "border-cashea !bg-cashea/25")}
                    >
                      <Sparkles size={12} /> Días del Club {promo ? "✓" : ""}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">Nivel de {memberById(casheaPayer.memberId)?.isMe ? "tu" : `la cuenta de ${memberById(casheaPayer.memberId)?.name}`} Cashea:</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {CASHEA_LEVELS.map((l) => (
                    <button
                      key={l.level}
                      type="button"
                      onClick={() => pickLevel(l.level)}
                      className={clsx("rounded-xl border-2 px-2 py-2.5 text-center transition-all", level === l.level ? "border-ink bg-cashea text-cashea-ink" : "border-line")}
                    >
                      <span className="block text-sm font-bold">{l.name}</span>
                      <span className={clsx("num block text-[11px]", level === l.level ? "opacity-75" : "text-muted")}>{promo ? l.promoPct : l.initialPct}% inicial</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="label">Inicial %</label>
                    <input className="field num" inputMode="decimal" value={initialPct} onChange={(e) => setInitialPct(e.target.value)} />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className="label">Tipo de plan</label>
                    <select
                      className="field"
                      value={line}
                      onChange={(e) => {
                        setLine(e.target.value);
                        setCuotas(CASHEA_LINES.find((l) => l.id === e.target.value)?.installments ?? 3);
                      }}
                    >
                      {CASHEA_LINES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label} ({l.installments} cuota{l.installments > 1 ? "s" : ""})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Cada (días)</label>
                    <input className="field num" inputMode="numeric" value={interval} onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 14))} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Tienda (opcional)</label>
                    <input className="field" placeholder={place || "Tienda"} value={store} onChange={(e) => setStore(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Línea disponible $ (opcional)</label>
                    <input className="field num" inputMode="decimal" placeholder="Sin límite" value={availableLine} onChange={(e) => setAvailableLine(e.target.value)} />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted">{CASHEA_LINES.find((l) => l.id === line)?.hint}. Si lo financiado supera tu línea, la inicial sube.</p>

                <div className="mt-4 rounded-2xl bg-card-2 p-3">
                  {schedule.raisedByLine && <p className="mb-2 text-xs font-semibold text-rose">La línea no alcanza: la inicial sube a {fmt(schedule.initialUsd, "USD")}.</p>}
                  <ol className="space-y-1.5">
                    {schedule.rows.map((r) => (
                      <li key={r.n} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className={clsx("grid size-6 place-items-center rounded-md text-[10px] font-black", r.n === 0 ? "bg-cashea text-cashea-ink" : "bg-card")}>{r.n === 0 ? "INI" : r.n}</span>
                          {r.label} · <span className="text-muted">{prettyDay(r.dueDate, true)}</span>
                        </span>
                        <span className="num font-semibold">
                          {fmt(r.amountUsd, "USD")} <span className="text-xs font-normal text-muted">≈ {fmt(Math.round(r.amountUsd * rates.bcvUsd), "VES")}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-[11px] text-muted">Sin intereses. Las cuotas se pagan en Bs a tasa BCV del día de pago; los Bs de arriba son con la tasa de hoy.</p>
                </div>

                <p className="label mt-4">¿Cómo te pagan los panas su parte?</p>
                <Segmented
                  name="cashea-mode"
                  value={casheaMode}
                  onChange={setCasheaMode}
                  options={[
                    { value: "espejo", label: "Al ritmo de las cuotas" },
                    { value: "inmediato", label: "Todo de una" },
                  ]}
                />
                <p className="mt-1.5 text-xs text-muted">
                  {casheaMode === "espejo"
                    ? "Cada quien paga su % de la inicial hoy y su % de cada cuota cuando vence. La app te avisa qué está vencido."
                    : "Los panas te deben su parte completa desde hoy, aunque tú pagues en cuotas."}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      )}

      {step === 4 && (
      <Card step={5} title={STEPS[4]}>
        {debtors.length === 0 ? (
          <p className="text-sm text-muted">Cuando cuadre el monto y quién puso la plata, aquí marcas quién ya te pagó y quién falta.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-xs text-muted">
              <span>
                <b className="text-text">{debtors.filter((x) => stateOf(x.memberId) === "pagado").length}</b> de {debtors.length} ya pagaron
              </span>
              <span className="flex gap-3 font-semibold">
                <button type="button" className="hover:text-text" onClick={() => setPaidState((p) => ({ ...p, ...Object.fromEntries(debtors.map((x) => [x.memberId, "pagado" as const])) }))}>
                  Todos pagaron
                </button>
                <button type="button" className="hover:text-text" onClick={() => setPaidState((p) => ({ ...p, ...Object.fromEntries(debtors.map((x) => [x.memberId, "falta" as const])) }))}>
                  Nadie
                </button>
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {debtors.map((x) => {
                const m = memberById(x.memberId);
                const st = stateOf(x.memberId);
                return (
                  <button
                    key={x.memberId}
                    type="button"
                    onClick={() => setPaidState((p) => ({ ...p, [x.memberId]: st === "pagado" ? "falta" : "pagado" }))}
                    className={clsx(
                      "flex items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition-all",
                      st === "pagado" ? "border-mint bg-mint-soft" : st === "parcial" ? "border-mango/60 bg-mango/10" : "border-line",
                    )}
                  >
                    <Avatar emoji={m?.avatar ?? "🙂"} color={m?.color ?? "#999"} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{m?.isMe ? "Yo" : m?.name}</span>
                      <span className="num block text-xs text-muted">debe {fmt(x.owesUsd, "USD")}</span>
                    </span>
                    <span className={clsx("rounded-full px-2.5 py-1 text-xs font-bold", st === "pagado" ? "bg-mint text-on-color" : st === "parcial" ? "bg-mango text-on-color" : "bg-card-2 text-muted")}>
                      {st === "pagado" ? "Ya pagó ✓" : st === "parcial" ? "Pagó una parte" : "Falta"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Toca a cada quien para marcarlo. Después también lo puedes cambiar desde la cuenta, y a los que falten les llega el aviso.</p>
          </>
        )}
      </Card>
      )}

      {step === 5 && (
      <Card step={6} title={STEPS[5]}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 rounded-2xl bg-card-2 p-3">
            <span className={clsx("shrink-0", categories.length > 2 ? "text-xl" : categories.length > 1 ? "text-2xl" : "text-3xl")}>
              {categories
                .slice(0, 3)
                .map((id) => CATEGORIES.find((c) => c.id === id)?.emoji)
                .join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="display truncate text-lg font-bold">{title || "Sin nombre"}</p>
              <p className="text-muted">
                {prettyDay(date, true)}
                {place ? ` · ${place}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => go(0)} className="text-xs font-semibold text-muted underline">
              Cambiar
            </button>
          </div>
          <div className="rounded-2xl bg-card-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">Total</span>
              <span className="num text-xl font-bold">{fmt(total, currency)}</span>
            </div>
            {currency !== "USD" && <p className="num text-right text-xs text-muted">{fmt(totalUsd, "USD")}</p>}
            <ul className="mt-2 space-y-1">
              {split.ok &&
                Object.entries(split.r.shares).map(([id, v]) => {
                  const m = memberById(id);
                  const st = debtors.find((d) => d.memberId === id);
                  return (
                    <li key={id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <Avatar emoji={m?.avatar ?? "🙂"} color={m?.color ?? "#9CA3AF"} size={18} className="mr-1 align-middle" /> {m?.isMe ? "Yo" : m?.name}
                      </span>
                      <span className="num text-xs">
                        {fmt(v, currency)}
                        {payers.some((p) => p.memberId === id && parseAmount(p.amount))
                          ? " · puso 💪"
                          : st
                            ? stateOf(id) === "pagado"
                              ? " · ya pagó ✓"
                              : " · debe"
                            : ""}
                      </span>
                    </li>
                  );
                })}
            </ul>
            <button type="button" onClick={() => go(2)} className="mt-2 text-xs font-semibold text-muted underline">
              Cambiar la cuenta
            </button>
          </div>
          <p className="rounded-2xl border-2 border-ink bg-sun p-3 text-sun-ink">
            🔔 Al anotarla, a cada pana le llega un aviso con lo que le toca y cómo pagarte.
          </p>
          <div>
            <label className="label" htmlFor="notes">
              Notas (opcional)
            </label>
            <textarea id="notes" className="field min-h-20" placeholder="Ej.: el postre lo invitó Ana" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
        </div>
      </Card>
      )}

      {error && <p className="rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-rose">{error}</p>}

      {/* Barra fija: siguiente / anotar */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg lg:left-[264px]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            {blockers[step] ? (
              <p className="text-xs leading-snug text-muted">👉 {blockers[step]}</p>
            ) : (
              <>
                <p className="text-xs text-muted">Total</p>
                <p className="num truncate text-lg font-bold">
                  {fmt(total, currency)}
                  {currency !== "USD" && total > 0 && <span className="ml-2 text-sm font-normal text-muted">{fmt(totalUsd, "USD")}</span>}
                </p>
              </>
            )}
          </div>
          {step < STEPS.length - 1 ? (
            <Button size="lg" onClick={() => go(step + 1)} disabled={!canNext}>
              Siguiente <ArrowRight size={18} />
            </Button>
          ) : (
            <Button size="lg" onClick={submit} disabled={!canSave} loading={saving}>
              {initial ? "Guardar cambios" : "Anotar salida"} 🤙
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


function Card({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: step * 0.05 }} className="card p-5">
      <h2 className="mb-4 flex items-center gap-2.5 font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-text text-xs font-bold text-bg">{step}</span>
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function PersonRow({ m, right, sub }: { m: FormMember; right: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar emoji={m.avatar} color={m.color} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{m.isMe ? "Yo" : m.name}</span>
        {sub && <span className="num block text-xs text-muted">{sub}</span>}
      </span>
      {right}
    </div>
  );
}

function MoneyInput({ value, onChange, sym, className = "w-36" }: { value: string; onChange: (v: string) => void; sym: string; className?: string }) {
  return (
    <div className={clsx("relative", className)}>
      <span className="num absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">{sym}</span>
      <input className="field num pl-9 text-right" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function RatePicker({
  source,
  setSource,
  rates,
  custom,
  setCustom,
  loading,
  date,
}: {
  source: FxSource;
  setSource: (s: FxSource) => void;
  rates: RatesSnapshot;
  custom: string;
  setCustom: (s: string) => void;
  loading: boolean;
  date: string;
}) {
  const opts: { id: FxSource; label: string; value: number | null }[] = [
    { id: "bcv", label: "BCV $", value: rates.bcvUsd },
    { id: "eur", label: "BCV €", value: rates.bcvEur },
    { id: "usdt", label: "USDT", value: rates.usdt },
    { id: "custom", label: "Otra", value: null },
  ];
  return (
    <div className={clsx("mt-4 rounded-2xl border border-line p-3 transition-opacity", loading && "opacity-60")}>
      <p className="mb-2 text-xs font-semibold text-muted">
        Tasa para convertir Bs ↔ $ {date !== todayVE() && `(del ${prettyDay(date)})`}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSource(o.id)}
            className={clsx("rounded-xl border px-2 py-2 text-center transition-all", source === o.id ? "border-mango bg-mango/10" : "border-line")}
          >
            <span className="block text-[11px] font-semibold text-muted">{o.label}</span>
            <span className="num block text-sm font-bold">{o.value ? fmtNumber(o.value) : "✏️"}</span>
          </button>
        ))}
      </div>
      {source === "custom" && (
        <input className="field num mt-2" inputMode="decimal" placeholder="Bs por dólar, ej. 950,00" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />
      )}
    </div>
  );
}

function ItemsEditor({
  items,
  setItems,
  members,
  sym,
  currency,
}: {
  items: (Omit<SplitItem, "price"> & { price: string })[];
  setItems: React.Dispatch<React.SetStateAction<(Omit<SplitItem, "price"> & { price: string })[]>>;
  members: FormMember[];
  sym: string;
  currency: Currency;
}) {
  const update = (id: string, patch: Partial<Omit<SplitItem, "price"> & { price: string }>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const subtotal = items.reduce((a, i) => a + Math.round((parseAmount(i.price) ?? 0) * i.qty), 0);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Anota cada cosa y toca quién la consumió. Si la compartieron, marca a todos los que comieron.</p>
      {items.map((it, idx) => (
        <motion.div key={it.id} layout className="rounded-2xl border border-line p-3">
          <div className="flex gap-2">
            <input className="field flex-1" placeholder={`Ítem ${idx + 1} (ej. Tequeños)`} value={it.name} onChange={(e) => update(it.id, { name: e.target.value })} />
            <button type="button" onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((x) => x.id !== it.id) : xs))} className="grid size-11 place-items-center text-muted hover:text-rose" aria-label="Quitar ítem">
              <Trash2 size={16} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <MoneyInput value={it.price} onChange={(v) => update(it.id, { price: v })} sym={sym} />
            <div className="flex items-center gap-1 rounded-full border border-line px-1">
              <button type="button" className="grid size-8 place-items-center" onClick={() => update(it.id, { qty: Math.max(1, it.qty - 1) })} aria-label="Menos">
                <Minus size={14} />
              </button>
              <span className="num w-6 text-center text-sm font-bold">{it.qty}</span>
              <button type="button" className="grid size-8 place-items-center" onClick={() => update(it.id, { qty: it.qty + 1 })} aria-label="Más">
                <Plus size={14} />
              </button>
            </div>
            <span className="num ml-auto text-sm font-semibold text-muted">{fmt(Math.round((parseAmount(it.price) ?? 0) * it.qty), currency)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = it.members.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => update(it.id, { members: on ? it.members.filter((x) => x !== m.id) : [...it.members, m.id] })}
                  className={clsx("flex items-center gap-1 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs transition-all", on ? "border-mango bg-mango/15 font-semibold" : "border-line text-muted")}
                >
                  <Avatar emoji={m.avatar} color={m.color} size={22} /> {m.isMe ? "Yo" : m.name}
                </button>
              );
            })}
            <button type="button" onClick={() => update(it.id, { members: it.members.length === members.length ? [] : members.map((m) => m.id) })} className="px-2 text-xs font-semibold text-muted hover:text-text">
              {it.members.length === members.length ? "Nadie" : "Todos"}
            </button>
          </div>
        </motion.div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="soft" size="sm" onClick={() => setItems((xs) => [...xs, { id: uid(), name: "", price: "", qty: 1, members: [] }])}>
          <Plus size={15} /> Agregar ítem
        </Button>
        <span className="num text-sm text-muted">
          Subtotal <b className="text-text">{fmt(subtotal, currency)}</b>
        </span>
      </div>
    </div>
  );
}
