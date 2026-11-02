"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, MessageCircle, Paperclip, Send } from "lucide-react";
import { attachProof, payDebts } from "@/app/actions/salidas";
import { askPayInfo } from "@/app/actions/notifications";
import { Money, useDisplay } from "@/components/display";
import { compressImage } from "@/components/image-tools";
import { ProofAiLine } from "@/components/proof";
import { Avatar, Button, EmptyState, useToast } from "@/components/ui";
import { cuotasLabel, dueLabel } from "@/lib/cashea";
import { prettyDay } from "@/lib/dates";
import { fmt, fmtNumber, type Currency } from "@/lib/money";
import { amountForBank, bankCode, docParts, pagoMovilBlock, phoneForBank } from "@/lib/pago-movil";
import { RATE_META, vesPerUsd, type RateSourceId } from "@/lib/rates-shared";
import type { PayInfo, ProofAi } from "@/lib/db/schema";

export type Creditor = {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  amount: number;
  items: {
    salidaId: string;
    title: string;
    emoji: string;
    date: string;
    remainingUsd: number;
    rateSource: string;
    /** Si se paga por cuotas de Cashea: la próxima (por defecto se paga esa). */
    cuota?: { n: number; count: number; dueDate: string; daysLeft: number; payUsd: number; pending: { n: number; dueDate: string; daysLeft: number; restUsd: number }[] } | null;
    /** Si se anotó en bolívares: la tasa de ese día. */
    registeredRate?: number | null;
  }[];
  payInfo: PayInfo;
};

type Method = { id: string; label: string; currency: Currency; needsRef: boolean };

const STEPS = ["¿A quién?", "¿Qué le pagas?", "¿Cómo le pagas?", "Confirmar"];

export function PayWizard({ creditors, preselect, salida, aiOn, payAll }: { creditors: Creditor[]; preselect?: string; salida?: string; aiOn: boolean; payAll?: boolean }) {
  const { rates } = useDisplay();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [to, setTo] = useState<string | undefined>(preselect ?? (creditors.length === 1 ? creditors[0].userId : undefined));
  const [step, setStep] = useState(to ? 1 : 0);
  const c = creditors.find((x) => x.userId === to);
  const [picked, setPicked] = useState<string[]>(() => {
    const cc = creditors.find((x) => x.userId === (preselect ?? (creditors.length === 1 ? creditors[0].userId : undefined)));
    if (!cc) return [];
    return salida && cc.items.some((i) => i.salidaId === salida) ? [salida] : cc.items.map((i) => i.salidaId);
  });
  const [method, setMethod] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number; currency: Currency; name: string } | null>(null);
  const [asked, setAsked] = useState(false);
  // Captura del pago (opcional): se sube antes de confirmar y la IA la revisa.
  const [proof, setProof] = useState<{ id: string; preview: string; ai: ProofAi | null; aiError?: string } | null>(null);
  const [uploading, startUpload] = useTransition();

  // En las salidas por cuotas de Cashea se eligen las cuotas que se pagan: una, varias o todas.
  type Item = Creditor["items"][number];
  const [cuotaPicks, setCuotaPicks] = useState<Record<string, number[]>>({});
  /** Por defecto, lo vencido o, si no hay nada vencido, la próxima cuota. Con «Pagar todo», todas. */
  const defaultCuotas = (i: Item, all = !!payAll) => {
    const p = i.cuota!.pending;
    const late = p.filter((x) => x.daysLeft < 0);
    return (all ? p : late.length ? late : p.slice(0, 1)).map((x) => x.n);
  };
  const cuotasOf = (i: Item) => cuotaPicks[i.salidaId] ?? defaultCuotas(i);
  const allCuotas = (i: Item) => cuotasOf(i).length === i.cuota!.pending.length;
  // Siempre queda al menos una marcada; para no pagar esa salida se desmarca la salida.
  const toggleCuota = (i: Item, n: number) => {
    const cur = cuotasOf(i);
    if (cur.includes(n) && cur.length === 1) return;
    setCuotaPicks((x) => ({ ...x, [i.salidaId]: cur.includes(n) ? cur.filter((y) => y !== n) : [...cur, n] }));
  };
  const amountOf = (i: Item) => (i.cuota ? i.cuota.pending.filter((p) => cuotasOf(i).includes(p.n)).reduce((a, p) => a + p.restUsd, 0) : i.remainingUsd);
  const selected = c?.items.filter((i) => picked.includes(i.salidaId)) ?? [];
  const usd = selected.reduce((a, i) => a + amountOf(i), 0);
  const ves = selected.reduce((a, i) => a + Math.round(amountOf(i) * vesPerUsd(rates, i.rateSource as RateSourceId)), 0);
  // Salidas anotadas en Bs a otra tasa: se le explica por qué el monto no es el de cuando se anotó.
  const moved = selected
    .filter((i) => i.registeredRate)
    .map((i) => ({ title: i.title, then: Math.round(amountOf(i) * i.registeredRate!), now: Math.round(amountOf(i) * vesPerUsd(rates, i.rateSource as RateSourceId)) }))
    .filter((x) => Math.abs(x.now - x.then) > 100);
  /** Las cuotas que se pagan de cada salida por cuotas. */
  const cuotas = Object.fromEntries(selected.filter((i) => i.cuota).map((i) => [i.salidaId, cuotasOf(i)]));
  const rateLabel = [...new Set(selected.map((i) => RATE_META[i.rateSource as RateSourceId]?.short ?? "BCV $"))].join(" / ");

  const pm = c?.payInfo.pagoMovil ?? {};
  const methods: Method[] = useMemo(() => {
    const m: Method[] = [];
    if (pm.telefono) m.push({ id: "pago_movil", label: "📲 Pago móvil", currency: "VES", needsRef: true });
    if (c?.payInfo.zelle) m.push({ id: "zelle", label: "⚡ Zelle", currency: "USD", needsRef: true });
    if (c?.payInfo.binance) m.push({ id: "binance", label: "🟡 Binance", currency: "USDT", needsRef: true });
    m.push({ id: "efectivo_usd", label: "💵 Efectivo $", currency: "USD", needsRef: false });
    m.push({ id: "efectivo_bs", label: "🪙 Efectivo Bs", currency: "VES", needsRef: false });
    return m;
  }, [pm.telefono, c?.payInfo.zelle, c?.payInfo.binance]);
  const chosen = methods.find((m) => m.id === method);
  const amountIn = (cur: Currency) => (cur === "VES" ? ves : usd);

  /** Sube la captura del pago; si la IA la lee, completa la referencia sola. */
  const uploadProof = (file: File | undefined, input: HTMLInputElement) => {
    if (!file || !c || !chosen) return;
    startUpload(async () => {
      try {
        const blob = await compressImage(file, 1600, 0.85);
        const fd = new FormData();
        fd.append("foto", blob, "comprobante.jpg");
        fd.append("pago", JSON.stringify({ toUserId: c.userId, salidaIds: picked, method: chosen.id, currency: chosen.currency, cuotas }));
        const r = await attachProof(fd);
        if (!r.ok) return toast(r.error, "error");
        if (proof) URL.revokeObjectURL(proof.preview);
        setProof({ id: r.proofId, preview: URL.createObjectURL(blob), ai: r.ai, aiError: r.aiError });
        // La referencia se completa sola (y se reemplaza si la anterior también la había puesto la IA).
        const ref = r.ai?.leido.referencia;
        if (ref && (!reference || reference === proof?.ai?.leido.referencia)) setReference(ref);
      } catch {
        toast("No pude abrir esa captura. Prueba con otra.", "error");
      } finally {
        input.value = "";
      }
    });
  };

  const copy = async (k: string, v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(k);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  if (done)
    return (
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="sticker bg-card p-8 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.25, 1] }} className="mx-auto grid size-20 place-items-center rounded-full border-2 border-ink bg-mint text-on-color">
          <Check size={40} strokeWidth={3} />
        </motion.div>
        <p className="display mt-4 text-2xl font-extrabold">¡Anotado!</p>
        <p className="mt-2 text-muted">
          Le avisamos a <b className="text-text">{done.name}</b> que le pagaste <b className="num text-text">{fmt(done.amount, done.currency)}</b>. Cuando confirme que le llegó, te llega un aviso ✅
        </p>
        <Link href="/inicio" className="btn-pop mt-6 h-11 px-6">
          Volver al inicio
        </Link>
      </motion.div>
    );

  if (creditors.length === 0)
    return (
      <EmptyState emoji="🎉" title="No le debes a nadie" action={<Link href="/inicio" className="btn-pop h-11 px-6">Volver al inicio</Link>}>
        Estás al día con todos los panas. ¡Vamos feo pa&apos;lante!
      </EmptyState>
    );

  return (
    <div className="space-y-4 pb-28">
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className={clsx("h-2 flex-1 rounded-full border border-ink/20", i < step ? "bg-mint" : i === step ? "bg-mango" : "bg-card-2")} />
        ))}
      </div>
      <p className="text-xs font-semibold text-muted">
        Paso {step + 1} de {STEPS.length} · <span className="text-text">{STEPS[step]}</span>
      </p>

      {step === 0 && (
        <div className="space-y-2.5">
          {creditors.map((x) => (
            <button
              key={x.userId}
              onClick={() => {
                setTo(x.userId);
                setPicked(x.items.map((i) => i.salidaId));
                setMethod(null);
                setStep(1);
              }}
              className="card flex w-full items-center gap-3 p-3.5 text-left hover:border-line-strong"
            >
              <Avatar emoji={x.avatar} color={x.color} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{x.name}</span>
                <span className="block text-xs text-muted">
                  {x.items.length} {x.items.length === 1 ? "salida" : "salidas"}
                </span>
              </span>
              <Money usd={x.amount} className="text-lg font-bold text-rose" />
            </button>
          ))}
        </div>
      )}

      {step === 1 && c && (
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <Avatar emoji={c.avatar} color={c.color} size={44} />
            <p className="font-semibold">¿Qué le estás pagando a {c.name}?</p>
          </div>
          <ul className="mt-4 space-y-2">
            {c.items.map((i) => {
              const on = picked.includes(i.salidaId);
              return (
                <li key={i.salidaId}>
                  <button
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== i.salidaId) : [...p, i.salidaId]))}
                    className={clsx("flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left", on ? "border-mint bg-mint-soft" : "border-line")}
                  >
                    <span className={clsx("grid size-6 place-items-center rounded-md border-2", on ? "border-mint bg-mint text-on-color" : "border-line-strong")}>{on && <Check size={14} strokeWidth={3} />}</span>
                    <span className="text-xl">{i.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{i.title}</span>
                      <span className="block text-xs text-muted">{prettyDay(i.date)}</span>
                    </span>
                    <Money usd={on ? amountOf(i) : i.remainingUsd} className="font-bold" />
                  </button>
                  {on && i.cuota?.pending.length === 1 && (
                    <p className="mt-1.5 pl-9 text-xs text-muted">
                      {i.cuota.n === 0 ? "La inicial" : `Cuota ${i.cuota.n}/${i.cuota.count}`} · {dueLabel(i.cuota.pending[0].daysLeft)}
                    </p>
                  )}
                  {on && i.cuota && i.cuota.pending.length > 1 && (
                    <div className="mt-1.5 space-y-1.5 pl-9">
                      {i.cuota.pending.map((p) => {
                        const sel = cuotasOf(i).includes(p.n);
                        return (
                          <button
                            key={p.n}
                            type="button"
                            aria-pressed={sel}
                            onClick={() => toggleCuota(i, p.n)}
                            className={clsx("flex w-full items-center gap-2.5 rounded-xl border-2 px-2.5 py-2 text-left text-xs font-semibold", sel ? "border-mint bg-mint-soft text-text" : "border-line text-muted")}
                          >
                            <span className={clsx("grid size-5 shrink-0 place-items-center rounded-md border-2", sel ? "border-mint bg-mint text-on-color" : "border-line-strong")}>{sel && <Check size={12} strokeWidth={3} />}</span>
                            <span className="min-w-0 flex-1">
                              {p.n === 0 ? "Inicial" : `Cuota ${p.n}/${i.cuota!.count}`}
                              <span className={clsx("block font-normal", p.daysLeft < 0 ? "text-rose" : "opacity-75")}>{dueLabel(p.daysLeft)}</span>
                            </span>
                            <span className="num shrink-0 text-sm">{fmt(p.restUsd, "USD")}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        aria-pressed={allCuotas(i)}
                        onClick={() => setCuotaPicks((x) => ({ ...x, [i.salidaId]: allCuotas(i) ? defaultCuotas(i, false) : i.cuota!.pending.map((p) => p.n) }))}
                        className={clsx("flex w-full items-center gap-2.5 rounded-xl border-2 px-2.5 py-2 text-left text-xs font-semibold", allCuotas(i) ? "border-ink bg-sun text-sun-ink" : "border-line text-muted")}
                      >
                        <span className="min-w-0 flex-1">
                          Todo de una
                          <span className="block font-normal opacity-75">y quedas al día</span>
                        </span>
                        <span className="num shrink-0 text-sm">{fmt(i.remainingUsd, "USD")}</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 rounded-2xl border-2 border-ink bg-sun p-4 text-center text-sun-ink">
            <p className="text-xs font-bold opacity-70">Total a pagar</p>
            <p className="num text-3xl font-bold">{fmt(usd, "USD")}</p>
            <p className="num text-sm opacity-80">
              {fmt(ves, "VES")} a {rateLabel || "BCV $"} de hoy
            </p>
          </div>
          {moved.length > 0 && (
            <div className="mt-3 rounded-2xl bg-card-2 p-3 text-xs text-muted">
              <p className="font-semibold text-text">💱 Se paga al equivalente de hoy</p>
              {moved.map((x) => (
                <p key={x.title} className="mt-1">
                  «{x.title}» se anotó como <span className="num">{fmt(x.then, "VES")}</span>, pero el bolívar cambió: hoy son <b className="num text-text">{fmt(x.now, "VES")}</b>.
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && c && (
        <div className="space-y-4">
          <div className="card p-5">
            <p className="font-semibold">¿Cómo le vas a pagar a {c.name}?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={clsx("rounded-2xl border-2 px-3 py-3 text-sm font-semibold", method === m.id ? "border-ink bg-sun text-sun-ink" : "border-line")}
                >
                  {m.label}
                  <span className="num mt-0.5 block text-xs font-normal opacity-70">{fmt(amountIn(m.currency), m.currency)}</span>
                </button>
              ))}
            </div>
            {!pm.telefono && !c.payInfo.zelle && !c.payInfo.binance && (
              <div className="mt-4 rounded-2xl bg-card-2 p-3 text-sm">
                <p>
                  <b>{c.name}</b> todavía no ha cargado sus datos de pago (pago móvil, Zelle o Binance).
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={asked || pending}
                    onClick={() =>
                      start(async () => {
                        await askPayInfo(c.userId);
                        setAsked(true);
                        toast(`Le pedimos a ${c.name} que cargue sus datos 🔔`);
                      })
                    }
                  >
                    <Send size={14} /> {asked ? "Ya se los pediste" : "Pedirle sus datos"}
                  </Button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`¡Epa ${c.name}! Te quiero pagar los ${fmt(usd, "USD")} (${fmt(ves, "VES")}). ¿Me pasas tus datos de pago móvil? 🤙`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold"
                  >
                    <MessageCircle size={14} /> Por WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>

          {chosen && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="sticker bg-card p-5">
              <p className="display text-lg font-bold">
                {chosen.id === "pago_movil"
                  ? "Hazle el pago móvil con estos datos"
                  : chosen.id === "zelle"
                    ? "Mándale el Zelle aquí"
                    : chosen.id === "binance"
                      ? "Mándale los USDT por Binance"
                      : "Entrégaselo en persona"}
              </p>
              <ul className="mt-3 space-y-2">
                {(
                  // [clave, etiqueta, lo que se ve, lo que se copia]: se copia limpio para que el banco no lo corte.
                  (chosen.id === "pago_movil"
                    ? [
                        ["banco", "🏦 Banco", pm.banco, bankCode(pm.banco)],
                        ["tel", "📲 Teléfono", pm.telefono && phoneForBank(pm.telefono), phoneForBank(pm.telefono)],
                        ["ci", `🪪 Cédula ${docParts(pm.cedula).letter}`, pm.cedula && docParts(pm.cedula).number, docParts(pm.cedula).number],
                        ["monto", "💰 Monto en Bs", fmtNumber(ves / 100), amountForBank(ves)],
                      ]
                    : chosen.id === "zelle"
                      ? [
                          ["zelle", "⚡ Zelle", c.payInfo.zelle, c.payInfo.zelle?.trim()],
                          // Zelle y Binance usan punto decimal.
                          ["monto", "💰 Monto en $", fmtNumber(usd / 100), (usd / 100).toFixed(2)],
                        ]
                      : chosen.id === "binance"
                        ? [
                            ["binance", "🟡 Binance Pay ID / correo", c.payInfo.binance, c.payInfo.binance?.trim()],
                            ["monto", "💰 Monto en USDT", fmtNumber(usd / 100), (usd / 100).toFixed(2)],
                          ]
                        : [["monto", `💰 Monto en ${chosen.currency === "VES" ? "Bs" : "$"}`, fmtNumber(amountIn(chosen.currency) / 100), amountForBank(amountIn(chosen.currency))]]) as [string, string, string | undefined, string | undefined][]
                )
                  .filter(([, , v]) => v)
                  .map(([k, label, v, toCopy]) => (
                    <li key={k}>
                      <button onClick={() => copy(k, toCopy || v!)} className="flex w-full items-center gap-3 rounded-2xl bg-card-2 px-3.5 py-2.5 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs text-muted">{label}</span>
                          <span className={clsx("num block truncate font-semibold", k === "monto" && "text-xl")}>{v}</span>
                        </span>
                        {copied === k ? <Check size={16} className="text-mint" /> : <Copy size={16} className="text-muted" />}
                      </button>
                    </li>
                  ))}
              </ul>
              {chosen.id === "pago_movil" && (
                <Button
                  className="mt-3 w-full"
                  onClick={() => copy("todo", pagoMovilBlock(pm, ves))}
                >
                  {copied === "todo" ? <Check size={16} /> : <Copy size={16} />} Copiar todo
                </Button>
              )}
              <p className="mt-3 text-xs text-muted">
                {chosen.id.startsWith("efectivo")
                  ? `Dale la plata a ${c.name} cuando lo veas y anótalo aquí para que te lo confirme.`
                  : chosen.id === "binance"
                    ? "Abre Binance, mándale los USDT y vuelve aquí para anotarlo."
                    : "Abre la app de tu banco, haz el pago y vuelve aquí para anotarlo."}{" "}
                {chosen.id === "pago_movil" && "Se copia sin puntos, guiones ni letras, como lo piden los bancos."}{" "}
                {chosen.currency === "VES" && `Monto calculado a ${rateLabel || "BCV $"} de hoy.`}
              </p>
            </motion.div>
          )}
        </div>
      )}

      {step === 3 && c && chosen && (
        <div className="card space-y-4 p-5">
          <p className="display text-xl font-bold">¿Ya le pagaste a {c.name}?</p>
          <div className="rounded-2xl bg-card-2 p-4 text-sm">
            <p className="num text-2xl font-bold">{fmt(amountIn(chosen.currency), chosen.currency)}</p>
            <p className="text-muted">
              {chosen.label} · {selected.map((i) => (i.cuota ? `${i.title} (${cuotasLabel(cuotasOf(i))})` : i.title)).join(", ")}
            </p>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-line-strong p-3">
            {proof ? (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proof.preview} alt="Tu captura del pago" className="h-20 w-16 shrink-0 rounded-lg border border-line object-cover" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold">📎 Captura lista: {c.name} la va a ver</p>
                  {proof.ai ? <ProofAiLine ai={proof.ai} /> : proof.aiError ? <p className="text-xs text-muted">{proof.aiError}</p> : null}
                  <label className="inline-flex cursor-pointer text-xs font-semibold text-muted underline">
                    Cambiar captura
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => uploadProof(e.target.files?.[0], e.target)} />
                  </label>
                </div>
              </div>
            ) : (
              <label className={clsx("flex cursor-pointer items-center gap-3", uploading && "pointer-events-none opacity-70")}>
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card-2">
                  {uploading ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Paperclip size={20} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{uploading ? (aiOn ? "Subiendo y revisando con IA…" : "Subiendo…") : "Adjuntar la captura del pago"}</span>
                  <span className="block text-xs text-muted">
                    {aiOn ? "Opcional. La IA lee el monto y la referencia y revisa que cuadre." : `Opcional. ${c.name} la va a ver para confirmar más rápido.`}
                  </span>
                </span>
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => uploadProof(e.target.files?.[0], e.target)} />
              </label>
            )}
          </div>
          {chosen.needsRef && (
            <div>
              <label className="label" htmlFor="ref">
                Número de referencia (opcional, ayuda a {c.name} a ubicarlo)
              </label>
              <input id="ref" className="field num" inputMode="numeric" placeholder="Ej.: 0123456" maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}
          <p className="text-xs text-muted">Al tocar el botón le llega un aviso a {c.name} para que confirme que le llegó.</p>
          <Button
            size="lg"
            className="w-full"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await payDebts({ toUserId: c.userId, salidaIds: picked, method: chosen.id, currency: chosen.currency, reference: reference || undefined, proofId: proof?.id, cuotas });
                if (r.ok) setDone({ amount: r.amount, currency: chosen.currency, name: c.name });
                else toast(r.error, "error");
              })
            }
          >
            <Check size={18} /> Sí, ya le pagué
          </Button>
        </div>
      )}

      {/* Navegación */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg lg:left-[264px]">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} /> Atrás
            </Button>
          ) : (
            <span className="text-xs text-muted">Elige a quién le vas a pagar</span>
          )}
          <span className="flex-1" />
          {step === 1 && (
            <Button disabled={!picked.length} onClick={() => setStep(2)}>
              Siguiente <ArrowRight size={16} />
            </Button>
          )}
          {step === 2 && (
            <Button disabled={!chosen} onClick={() => setStep(3)}>
              Ya lo hice, siguiente <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
