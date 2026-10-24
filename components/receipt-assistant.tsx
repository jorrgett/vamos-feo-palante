"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Lightbulb, ScanLine, Sparkles, Users } from "lucide-react";
import { scanReceipt } from "@/app/actions/ia";
import type { ReceiptRead } from "@/lib/ai-tasks";
import { categoryOf } from "@/lib/constants";
import { allocate, fmt, type Currency } from "@/lib/money";
import { compressImage } from "./image-tools";
import { Avatar, Button, Sheet, useToast } from "./ui";

type Person = { id: string; name: string; avatar: string; color: string; isMe: boolean };

/** Lo que el asistente le pasa al formulario de la salida (montos en centavos). */
export type ReceiptApply = {
  currency: "USD" | "VES" | "EUR" | null;
  mode: "equal" | "items";
  base: number;
  items: { name: string; price: number; members: string[] }[];
  extras: { label: string; kind: "percent" | "fixed"; value: number }[];
  place: string | null;
  date: string | null;
  category: string;
};

type Stage = "leyendo" | "resumen" | "asignar";

/**
 * Asistente de la cuenta: escanea la factura con IA y hace las preguntas justas para dividirla
 * (¿igual o cada quien lo suyo? ¿quién pidió cada cosa? ¿sumamos el servicio?).
 */
export function ReceiptAssistant({ people, currentCurrency, onApply }: { people: Person[]; currentCurrency: Currency; onApply: (r: ReceiptApply) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("leyendo");
  const [receipt, setReceipt] = useState<ReceiptRead | null>(null);
  const [useCharge, setUseCharge] = useState<boolean[]>([]);
  const [who, setWho] = useState<string[][]>([]);
  const [idx, setIdx] = useState(0);
  const [reading, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const cur = (receipt?.moneda ?? currentCurrency) as Currency;
  const money = (c: number) => fmt(c, cur);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setOpen(true);
    setStage("leyendo");
    setReceipt(null);
    start(async () => {
      try {
        const blob = await compressImage(file, 1568, 0.85);
        const fd = new FormData();
        fd.append("foto", blob, "factura.jpg");
        const r = await scanReceipt(fd);
        if (!r.ok) {
          setOpen(false);
          return toast(r.error, "error");
        }
        setReceipt(r.receipt);
        setUseCharge(r.receipt.cargos.map(() => true));
        setWho(r.receipt.items.map(() => []));
        setIdx(0);
        setStage("resumen");
      } catch {
        setOpen(false);
        toast("No pude abrir esa foto. Prueba con otra.", "error");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  };

  // ── Cuentas con lo que leyó la IA
  const itemsSum = receipt?.items.reduce((a, i) => a + i.total, 0) ?? 0;
  const discount = Math.min(receipt?.descuento ?? 0, itemsSum);
  const base = receipt ? (itemsSum > 0 ? itemsSum - discount : (receipt.subtotal ?? receipt.total ?? 0)) : 0;
  const charges = (receipt?.cargos ?? []).map((c, i) => ({ ...c, on: useCharge[i] ?? true }));
  const chargeAmount = (c: (typeof charges)[number]) => (c.monto != null ? c.monto : Math.round((base * (c.porcentaje ?? 0)) / 100));
  const computedTotal = base + charges.filter((c) => c.on).reduce((a, c) => a + chargeAmount(c), 0);
  const allOn = charges.every((c) => c.on);
  const mismatch = receipt?.total != null && allOn && Math.abs(computedTotal - receipt.total) > Math.max(Math.round(receipt.total * 0.01), 100);

  const extras = (): ReceiptApply["extras"] =>
    charges
      .filter((c) => c.on)
      .map((c) => (c.monto != null ? { label: c.etiqueta, kind: "fixed" as const, value: c.monto } : { label: c.etiqueta, kind: "percent" as const, value: c.porcentaje ?? 0 }))
      .filter((e) => e.value > 0);

  const finish = (mode: "equal" | "items", opts: { useReceiptTotal?: boolean } = {}) => {
    if (!receipt) return;
    // El descuento se reparte en los precios para que la suma quede exacta.
    const prices = discount > 0 ? allocate(itemsSum - discount, receipt.items.map((i) => i.total)) : receipt.items.map((i) => i.total);
    onApply({
      currency: receipt.moneda,
      mode,
      base: opts.useReceiptTotal && receipt.total ? receipt.total : base,
      items: receipt.items.map((it, i) => ({ name: it.cantidad > 1 ? `${it.nombre} ×${it.cantidad}` : it.nombre, price: prices[i], members: who[i] ?? [] })),
      extras: opts.useReceiptTotal ? [] : extras(),
      place: receipt.comercio,
      date: receipt.fecha,
      category: receipt.categoria,
    });
    setOpen(false);
    toast(mode === "items" ? "¡Listo! Cada quien con lo suyo 🤙" : "¡Listo! Dividido entre todos 🤙");
  };

  const toggle = (id: string) => setWho((w) => w.map((list, i) => (i === idx ? (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]) : list)));
  const setAll = () => setWho((w) => w.map((list, i) => (i === idx ? (list.length === people.length ? [] : people.map((p) => p.id)) : list)));
  const current = receipt?.items[idx];
  const chosen = who[idx] ?? [];

  return (
    <>
      <div className="relative overflow-clip rounded-2xl border-2 border-ink bg-sun p-4 text-sun-ink">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-text">
            <ScanLine size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">¿Tienes la factura?</p>
            <p className="text-xs opacity-80">Tómale una foto y la IA saca los montos, el IVA y el servicio. Después te pregunto quién pidió qué.</p>
          </div>
        </div>
        <label className={clsx("btn-pop mt-3 h-11 w-full cursor-pointer text-sm", reading && "pointer-events-none opacity-70")}>
          <Camera size={18} /> {reading ? "Leyendo…" : "Escanear la factura"}
          <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </div>

      <Sheet open={open} onClose={() => !reading && setOpen(false)} title="Asistente de la cuenta 🤖">
        <AnimatePresence mode="wait">
          {stage === "leyendo" && (
            <motion.div key="leyendo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid place-items-center gap-3 py-10 text-center">
              <motion.span animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 1.2 }} className="text-5xl">
                🧾
              </motion.span>
              <p className="font-semibold">Leyendo la factura…</p>
              <p className="text-sm text-muted">Tarda unos segundos.</p>
            </motion.div>
          )}

          {stage === "resumen" && receipt && (
            <motion.div key="resumen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card-2 text-2xl">{categoryOf(receipt.categoria).emoji}</span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{receipt.comercio ?? "Factura"}</p>
                  <p className="text-xs text-muted">
                    {receipt.items.length} {receipt.items.length === 1 ? "cosa" : "cosas"}
                    {receipt.fecha ? ` · ${receipt.fecha.split("-").reverse().join("/")}` : ""} · en {cur === "VES" ? "bolívares" : cur === "EUR" ? "euros" : "dólares"}
                  </p>
                </div>
              </div>

              {receipt.items.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-card-2 p-3 text-sm">
                  {receipt.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {it.cantidad > 1 && <b className="num">{it.cantidad}× </b>}
                        {it.nombre}
                      </span>
                      <span className="num shrink-0">{money(it.total)}</span>
                    </li>
                  ))}
                  {discount > 0 && (
                    <li className="flex justify-between gap-3 text-mint">
                      <span>Descuento</span>
                      <span className="num">−{money(discount)}</span>
                    </li>
                  )}
                </ul>
              )}

              {charges.length > 0 && (
                <div>
                  <p className="label">¿Sumamos estos cargos? (se reparten según lo que consumió cada quien)</p>
                  <div className="flex flex-wrap gap-2">
                    {charges.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setUseCharge((u) => u.map((v, j) => (j === i ? !v : v)))}
                        className={clsx("inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold", c.on ? "border-ink bg-sun text-sun-ink" : "border-line text-muted line-through")}
                      >
                        {c.on && <Check size={14} />} {c.etiqueta} <span className="num">{money(chargeAmount(c))}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-end justify-between rounded-2xl border-2 border-ink p-3">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-right">
                  <span className="num block text-2xl font-bold">{money(computedTotal)}</span>
                  {receipt.total != null && receipt.total !== computedTotal && <span className="num block text-xs text-muted">la factura dice {money(receipt.total)}</span>}
                </span>
              </div>

              {mismatch && (
                <div className="rounded-2xl bg-rose-soft p-3 text-sm text-rose">
                  La suma no cuadra con el total de la factura. Revisa los montos después, o usa el total de la factura dividido igual.
                  <button type="button" onClick={() => finish("equal", { useReceiptTotal: true })} className="mt-2 block font-bold underline">
                    Usar {money(receipt.total!)} y dividir igual
                  </button>
                </div>
              )}

              {receipt.notas.length > 0 && (
                <ul className="space-y-1.5">
                  {receipt.notas.map((n, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted">
                      <Lightbulb size={16} className="mt-0.5 shrink-0 text-gold" /> {n}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <p className="display mb-2 text-lg font-bold">¿Cómo lo dividimos?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => finish("equal")} className="rounded-2xl border-2 border-line p-3 text-left transition-colors hover:border-ink">
                    <Users size={20} />
                    <span className="mt-1 block font-bold">Igual entre todos</span>
                    <span className="block text-xs text-muted">{people.length} panas · {money(Math.round(computedTotal / Math.max(1, people.length)))} c/u</span>
                  </button>
                  <button
                    type="button"
                    disabled={receipt.items.length < 2}
                    onClick={() => setStage("asignar")}
                    className="rounded-2xl border-2 border-ink bg-sun p-3 text-left text-sun-ink disabled:opacity-40"
                  >
                    <Sparkles size={20} />
                    <span className="mt-1 block font-bold">Cada quien lo suyo</span>
                    <span className="block text-xs opacity-75">Te pregunto quién pidió qué</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {stage === "asignar" && receipt && current && (
            <motion.div key={`item-${idx}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
                  <span>
                    {idx + 1} de {receipt.items.length}
                  </span>
                  <span>{who.filter((w) => w.length).length} listos</span>
                </div>
                <div className="h-2 overflow-clip rounded-full bg-card-2">
                  <motion.div className="h-full bg-mango" animate={{ width: `${((idx + 1) / receipt.items.length) * 100}%` }} />
                </div>
              </div>
              <div className="rounded-2xl bg-card-2 p-4 text-center">
                <p className="text-sm text-muted">¿Quién pidió…?</p>
                <p className="display mt-1 text-2xl leading-tight font-extrabold">
                  {current.cantidad > 1 && <span className="num">{current.cantidad}× </span>}
                  {current.nombre}
                </p>
                <p className="num mt-1 font-semibold">{money(current.total)}</p>
                {chosen.length > 1 && <p className="mt-1 text-xs text-muted">Se reparte entre {chosen.length}: {money(Math.round(current.total / chosen.length))} c/u</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {people.map((p) => {
                  const on = chosen.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={clsx("flex items-center gap-2 rounded-2xl border-2 p-2 text-left", on ? "border-ink bg-sun text-sun-ink" : "border-line")}
                    >
                      <Avatar emoji={p.avatar} color={p.color} size={30} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.isMe ? "Yo" : p.name}</span>
                      {on && <Check size={16} />}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={setAll} className="w-full rounded-2xl border-2 border-dashed border-line-strong py-2 text-sm font-semibold text-muted hover:text-text">
                {chosen.length === people.length ? "Quitar a todos" : "Fue para todos 🍻"}
              </button>
              <div className="flex gap-2">
                <Button variant="soft" onClick={() => (idx === 0 ? setStage("resumen") : setIdx(idx - 1))}>
                  <ArrowLeft size={16} /> Atrás
                </Button>
                {idx < receipt.items.length - 1 ? (
                  <Button className="flex-1" disabled={chosen.length === 0} onClick={() => setIdx(idx + 1)}>
                    Siguiente <ArrowRight size={16} />
                  </Button>
                ) : (
                  <Button className="flex-1" disabled={chosen.length === 0 || who.some((w) => w.length === 0)} onClick={() => finish("items")}>
                    <Check size={16} /> Listo, dividir
                  </Button>
                )}
              </div>
              {idx === receipt.items.length - 1 && who.some((w) => w.length === 0) && (
                <p className="text-center text-xs text-muted">Falta decir quién pidió {who.filter((w) => w.length === 0).length === 1 ? "una cosa" : `${who.filter((w) => w.length === 0).length} cosas`}: vuelve atrás.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Sheet>
    </>
  );
}
