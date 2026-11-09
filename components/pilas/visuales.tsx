"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bell, Check, ChevronDown } from "lucide-react";
import { remindPending, remindPerson } from "@/app/actions/salidas";
import { fmt, fmtNumber, parseAmount } from "@/lib/money";
import type { Tarjeta } from "@/lib/pilas/tipos";
import { BarList, ColumnChart, Sparkline } from "@/components/charts";
import { Money } from "@/components/display";
import { Avatar, useToast } from "@/components/ui";

type V<T extends Tarjeta["tipo"]> = { t: Extract<Tarjeta, { tipo: T }> };
const SUAVE = [0.16, 1, 0.3, 1] as const;

function Caja({ titulo, children, className = "" }: { titulo: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`sticker w-full max-w-md bg-card p-4 ${className}`}>
      <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{titulo}</p>
      {children}
    </div>
  );
}

/** Botón que corre un recordatorio y se queda en «Enviado ✓». */
function Recordar({ accion, texto = "Recordarle" }: { accion: () => Promise<{ ok: boolean; error?: string }>; texto?: string }) {
  const [hecho, setHecho] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      disabled={hecho || pending}
      onClick={() =>
        start(async () => {
          const r = await accion().catch(() => ({ ok: false, error: "Se fue la señal." }));
          if (r.ok) setHecho(true);
          else toast(r.error ?? "No se pudo.", "error");
        })
      }
      className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-ink bg-card px-3.5 text-sm font-semibold shadow-[2px_2px_0_var(--pop)] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:shadow-none"
    >
      {hecho ? <Check size={15} strokeWidth={3} className="text-mint" /> : pending ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Bell size={15} />}
      {hecho ? "Enviado" : texto}
    </button>
  );
}

// ── Balance ──
export function VisualBalance({ t }: V<"balance">) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const neto = t.meDebenUsd - t.deboUsd;
  const suma = t.meDebenUsd + t.deboUsd || 1;
  const max = Math.max(...t.personas.map((p) => Math.max(p.meDebeUsd, p.leDeboUsd)), 1);
  return (
    <Caja titulo="Tu balance con los panas">
      <Money usd={neto} sign animated className="block text-4xl font-bold tracking-tight" />
      <p className="mt-0.5 text-sm text-muted">{neto > 0 ? "Te deben más de lo que debes 😎" : neto < 0 ? "Te toca ponerte al día 👀" : "Todo en orden 🤝"}</p>
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full bg-card-2" role="img" aria-label="Lo que te deben frente a lo que debes">
        <motion.span className="h-full rounded-full" style={{ background: "var(--viz-pos)" }} initial={{ width: 0 }} animate={{ width: `${(t.meDebenUsd / suma) * 100}%` }} transition={{ duration: 0.9, ease: SUAVE }} />
        <motion.span className="ml-auto h-full rounded-full" style={{ background: "var(--viz-neg)" }} initial={{ width: 0 }} animate={{ width: `${(t.deboUsd / suma) * 100}%` }} transition={{ duration: 0.9, delay: 0.1, ease: SUAVE }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>
          <span className="mr-1 inline-block size-2 rounded-full" style={{ background: "var(--viz-pos)" }} />
          Te deben <Money usd={t.meDebenUsd} className="font-semibold text-text" />
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full" style={{ background: "var(--viz-neg)" }} />
          Debes <Money usd={t.deboUsd} className="font-semibold text-text" />
        </span>
      </div>
      {t.personas.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-card-2 p-3 text-center text-sm">Estás a mano con todo el mundo 🤝</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {t.personas.map((p, i) => {
            const open = abierto === p.userId;
            const net = p.meDebeUsd - p.leDeboUsd;
            return (
              <motion.li key={p.userId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.06 }}>
                <button onClick={() => setAbierto(open ? null : p.userId)} className="flex w-full items-center gap-3 py-2.5 text-left" aria-expanded={open}>
                  <Avatar emoji={p.avatar} color={p.color} size={34} />
                  <span className="min-w-[3.5rem] flex-1 truncate font-semibold">{p.nombre}</span>
                  <span className="relative h-2 w-10 shrink-0 sm:w-24" aria-hidden>
                    <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line-strong" />
                    {p.leDeboUsd > 0 && (
                      <motion.span className="absolute top-0 right-1/2 h-2 rounded-l-full" style={{ background: "var(--viz-neg)" }} initial={{ width: 0 }} animate={{ width: `${(p.leDeboUsd / max) * 50}%` }} transition={{ duration: 0.7, delay: 0.25 + i * 0.06, ease: SUAVE }} />
                    )}
                    {p.meDebeUsd > 0 && (
                      <motion.span className="absolute top-0 left-1/2 h-2 rounded-r-full" style={{ background: "var(--viz-pos)" }} initial={{ width: 0 }} animate={{ width: `${(p.meDebeUsd / max) * 50}%` }} transition={{ duration: 0.7, delay: 0.25 + i * 0.06, ease: SUAVE }} />
                    )}
                  </span>
                  <Money usd={net} sign className="shrink-0 text-right text-sm font-semibold" />
                  <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: SUAVE }} className="overflow-hidden">
                      <ul className="space-y-1 pb-2 pl-12 text-sm">
                        {p.items.map((x, j) => (
                          <li key={j}>
                            <Link href={`/salidas/${x.salidaId}`} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1 hover:bg-card-2">
                              <span className="truncate">«{x.titulo}»</span>
                              <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                                {x.usd > 0 ? "te debe" : "le debes"} <Money usd={Math.abs(x.usd)} className="font-semibold text-text" />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2 pb-3 pl-12">
                        {p.leDeboUsd > 0 && (
                          <Link href={`/pagar?a=${p.userId}`} className="btn-pop h-9 px-3.5 text-sm">
                            💸 Pagarle
                          </Link>
                        )}
                        {p.meDebeUsd > 0 && <Recordar accion={() => remindPerson(p.userId)} />}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Caja>
  );
}

// ── Una salida ──
const ESTADO = {
  puso: { icono: "💸", color: "var(--sun)", texto: "Puso la plata" },
  pagado: { icono: "✓", color: "var(--viz-pos)", texto: "Ya pagó" },
  "por-confirmar": { icono: "⏳", color: "var(--gold)", texto: "Por confirmar" },
  parcial: { icono: "½", color: "var(--gold)", texto: "Pagó una parte" },
  falta: { icono: "!", color: "var(--viz-neg)", texto: "No ha pagado" },
} as const;

export function VisualSalida({ t }: V<"salida_vista">) {
  const [sel, setSel] = useState<number | null>(null);
  const pct = t.debenUsd ? Math.min(1, t.pagadoUsd / t.debenUsd) : 1;
  const R = 38;
  const C = 2 * Math.PI * R;
  const p = sel != null ? t.personas[sel] : null;
  return (
    <Caja titulo={t.cerrada ? "Salida cerrada 🔒" : "Así va la salida"}>
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <svg viewBox="0 0 96 96" className="size-24 -rotate-90" aria-hidden>
            <circle cx="48" cy="48" r={R} fill="none" stroke="var(--card-2)" strokeWidth="10" />
            <motion.circle
              cx="48"
              cy="48"
              r={R}
              fill="none"
              stroke="var(--viz-pos)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - pct) }}
              transition={{ duration: 1.1, ease: SUAVE, delay: 0.15 }}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-center">
            <span>
              <span className="num block text-xl leading-none font-bold">{Math.round(pct * 100)}%</span>
              <span className="text-[10px] font-semibold text-muted">pagado</span>
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="display truncate text-lg leading-tight font-bold">
            {t.emoji} {t.titulo}
          </p>
          <p className="text-xs text-muted first-letter:uppercase">{t.fecha}</p>
          <p className="num mt-1 text-lg font-bold">{t.totalTexto}</p>
          {t.debenUsd > t.pagadoUsd && (
            <p className="text-xs text-muted">
              Falta <Money usd={t.debenUsd - t.pagadoUsd} className="font-semibold text-text" /> por pagar
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-3">
        {t.personas.map((x, i) => {
          const e = ESTADO[x.estado];
          return (
            <motion.button
              key={i}
              onClick={() => setSel(sel === i ? null : i)}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 20, delay: 0.2 + i * 0.05 }}
              whileTap={{ scale: 0.9 }}
              className={`flex w-14 flex-col items-center gap-1 rounded-2xl py-1 ${sel === i ? "bg-card-2" : ""}`}
              aria-label={`${x.nombre}: ${e.texto}`}
            >
              <span className="relative">
                <Avatar emoji={x.avatar} color={x.color} size={40} />
                <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-card text-[10px] font-bold text-[#231c16]" style={{ background: e.color }}>
                  {e.icono}
                </span>
              </span>
              <span className="w-full truncate text-center text-[11px] font-semibold">{x.yo ? "Tú" : x.nombre}</span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        {p && (
          <motion.p key={sel} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-2 rounded-2xl bg-card-2 px-3 py-2 text-sm">
            <span className="font-semibold">{p.yo ? "Tú" : p.nombre}</span> · le tocaba <Money usd={p.parteUsd} className="font-semibold" />. {p.detalle}.
          </motion.p>
        )}
      </AnimatePresence>
      {!p && <p className="mt-2 text-center text-[11px] text-faint">Toca a un pana para ver su detalle</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/salidas/${t.salidaId}`} className="btn-pop btn-pop-paper h-9 px-3.5 text-sm">
          Ver salida <ArrowRight size={15} />
        </Link>
        {t.puedoRecordar && <Recordar accion={() => remindPending(t.salidaId)} texto="Recordar a los que faltan" />}
      </div>
    </Caja>
  );
}

// ── Gastos ──
export function VisualGastos({ t }: V<"gastos">) {
  const [vista, setVista] = useState<"mes" | "tipo">(t.categorias.length ? "tipo" : "mes");
  return (
    <Caja titulo={`Tus gastos · ${t.periodo}`}>
      <Money usd={t.totalUsd} animated className="block text-3xl font-bold tracking-tight" />
      <p className="text-sm text-muted">
        Tu parte en {t.salidas} {t.salidas === 1 ? "salida" : "salidas"}
      </p>
      <div className="mt-3 grid grid-cols-2 rounded-full bg-card-2 p-1 text-sm font-semibold" role="tablist">
        {(["tipo", "mes"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setVista(k)} className={`relative rounded-full py-1.5 ${vista === k ? "text-text" : "text-muted"}`}>
            {vista === k && <motion.span layoutId={`gastos-tab-${t.id}`} className="absolute inset-0 rounded-full border border-line-strong bg-card shadow-sm" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
            <span className="relative">{k === "tipo" ? "Por tipo" : "Últimos 6 meses"}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, x: vista === "mes" ? 16 : -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="mt-4">
          {vista === "mes" ? (
            <ColumnChart data={t.meses} height={170} />
          ) : t.categorias.length ? (
            <BarList data={t.categorias} />
          ) : (
            <p className="rounded-2xl bg-card-2 p-3 text-center text-sm text-muted">Nada en este período. Mira los últimos 6 meses 👉</p>
          )}
        </motion.div>
      </AnimatePresence>
      {t.mayor && (
        <p className="mt-3 text-xs text-muted">
          La más cara: <span className="font-semibold text-text">«{t.mayor.titulo}»</span> · <Money usd={t.mayor.usd} className="font-semibold text-text" />
        </p>
      )}
    </Caja>
  );
}

// ── Cuotas de Cashea ──
const cuando = (d: number) => (d === 0 ? "vence hoy" : d === 1 ? "mañana" : d > 1 ? `en ${d} días` : d === -1 ? "venció ayer" : `venció hace ${-d} días`);

export function VisualCuotas({ t }: V<"cuotas">) {
  if (!t.cuotas.length)
    return (
      <Caja titulo="Tus cuotas de Cashea">
        <p className="rounded-2xl bg-card-2 p-3 text-center text-sm">No tienes cuotas pendientes 🎉</p>
      </Caja>
    );
  return (
    <Caja titulo="Tus próximas cuotas de Cashea">
      <ol className="relative mt-1 space-y-3 pl-6">
        <motion.span className="absolute top-2 bottom-2 left-[7px] w-0.5 origin-top rounded-full bg-line-strong" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.6, ease: SUAVE }} />
        {t.cuotas.map((c, i) => {
          const urg = c.dias < 0 ? "var(--viz-neg)" : c.dias <= 3 ? "var(--gold)" : "var(--viz-pos)";
          return (
            <motion.li key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.07 }} className="relative">
              <span className="absolute top-1.5 -left-6 size-4 rounded-full border-2 border-card" style={{ background: urg, boxShadow: `0 0 0 3px color-mix(in oklab, ${urg} 25%, transparent)` }} />
              <Link href={`/salidas/${c.salidaId}`} className="flex items-start justify-between gap-3 rounded-2xl px-2 py-1 hover:bg-card-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.tienda}</span>
                  <span className="block text-xs text-muted">
                    {c.n === 0 ? "Inicial" : `Cuota ${c.n}/${c.de}`} · {c.mia ? "a Cashea" : `a ${c.titular}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Money usd={c.usd} className="block font-bold" />
                  <span className="text-[11px] font-semibold" style={{ color: c.dias < 0 ? "var(--rose)" : c.dias <= 3 ? "var(--gold)" : "var(--muted)" }}>
                    {cuando(c.dias)}
                  </span>
                </span>
              </Link>
            </motion.li>
          );
        })}
      </ol>
    </Caja>
  );
}

// ── Tasas con convertidor ──
export function VisualTasas({ t }: V<"tasas">) {
  const [monto, setMonto] = useState("20");
  const [de, setDe] = useState<"USD" | "EUR" | "VES">("USD");
  const n = parseAmount(monto) ?? 0;
  const v = n / 100;
  const tiles = [
    { k: "Dólar BCV", v: t.bcvUsd, c: t.cambio.bcvUsd, h: t.historia.bcvUsd, color: "var(--sky)" },
    { k: "Euro BCV", v: t.bcvEur, c: t.cambio.bcvEur, h: t.historia.bcvEur, color: "var(--violet)" },
    ...(t.usdt ? [{ k: "Binance", v: t.usdt, c: t.cambio.usdt, h: t.historia.usdt, color: "var(--mango)" }] : []),
  ];
  const filas: { label: string; out: string }[] =
    de === "USD"
      ? [{ label: "a BCV", out: fmt(Math.round(v * t.bcvUsd * 100), "VES") }, ...(t.usdt ? [{ label: "a Binance", out: fmt(Math.round(v * t.usdt * 100), "VES") }] : [])]
      : de === "EUR"
        ? [{ label: "a euro BCV", out: fmt(Math.round(v * t.bcvEur * 100), "VES") }]
        : [
            { label: "dólares BCV", out: fmt(Math.round((v / t.bcvUsd) * 100), "USD") },
            ...(t.usdt ? [{ label: "dólares Binance", out: fmt(Math.round((v / t.usdt) * 100), "USD") }] : []),
            { label: "euros BCV", out: fmt(Math.round((v / t.bcvEur) * 100), "EUR") },
          ];
  return (
    <Caja titulo="Tasas de hoy">
      <div className="grid grid-cols-1 gap-2">
        {tiles.map((x, i) => (
          <motion.div key={x.k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center gap-3 rounded-2xl bg-card-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-muted">{x.k}</span>
              <span className="num text-lg font-bold">{fmtNumber(x.v)}</span>
              {x.c != null && (
                <span className={`ml-2 text-xs font-semibold ${x.c >= 0 ? "text-rose" : "text-mint"}`}>
                  {x.c >= 0 ? "▲" : "▼"} {fmtNumber(Math.abs(x.c))}%
                </span>
              )}
            </span>
            <Sparkline values={x.h} color={x.color} width={88} height={30} />
          </motion.div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border-2 border-dashed border-line-strong p-3">
        <p className="mb-2 text-xs font-bold text-muted">Convertidor</p>
        <div className="flex gap-2">
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" className="field num !py-2 text-lg font-bold" aria-label="Monto a convertir" />
          <div className="flex shrink-0 rounded-full bg-card-2 p-1 text-sm font-bold">
            {(["USD", "EUR", "VES"] as const).map((c) => (
              <button key={c} onClick={() => setDe(c)} className={`rounded-full px-2.5 ${de === c ? "bg-card text-text shadow-sm" : "text-muted"}`} aria-pressed={de === c}>
                {c === "USD" ? "$" : c === "EUR" ? "€" : "Bs"}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-2 space-y-1">
          {filas.map((f) => (
            <li key={f.label} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted">{f.label}</span>
              <motion.span key={f.out} initial={{ opacity: 0.4, y: -3 }} animate={{ opacity: 1, y: 0 }} className="num font-bold">
                {f.out}
              </motion.span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-[11px] text-faint">Bs por unidad · fecha valor BCV {t.fecha}</p>
    </Caja>
  );
}
