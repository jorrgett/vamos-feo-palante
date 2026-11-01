"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setCuotasPaid } from "@/app/actions/salidas";
import { dueLabel } from "@/lib/cashea";
import { diffDays, prettyDay, todayVE } from "@/lib/dates";
import { fmt, fmtNumber } from "@/lib/money";
import { RATE_META, vesPerUsd, type RateSourceId } from "@/lib/rates-shared";
import { useDisplay } from "./display";
import { Button, Segmented, Sheet, useToast } from "./ui";

export type CuotaPart = { n: number; dueDate: string; usd: number; restUsd: number };

export const PAID_METHODS = [
  { id: "pago_movil", label: "📲 Pago móvil", cur: "VES" },
  { id: "efectivo_usd", label: "💵 Efectivo $", cur: "USD" },
  { id: "zelle", label: "⚡ Zelle", cur: "USD" },
  { id: "binance", label: "🟡 Binance", cur: "USD" },
  { id: "efectivo_bs", label: "🪙 Efectivo Bs", cur: "VES" },
  { id: "otro", label: "🔁 Otro", cur: "USD" },
] as const;

/** Marcar qué cuotas de Cashea ya pagó un pana: una, varias o todas, en cualquier orden y momento. */
export function CuotasSheet({
  salidaId,
  memberId,
  name,
  parts,
  groupRate,
  onClose,
}: {
  salidaId: string;
  memberId: string;
  name: string;
  parts: CuotaPart[];
  groupRate: RateSourceId;
  onClose: () => void;
}) {
  const { rates } = useDisplay();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const paidBefore = parts.filter((p) => p.restUsd === 0).map((p) => p.n);
  const [picked, setPicked] = useState<number[]>(paidBefore);
  const [method, setMethod] = useState<(typeof PAID_METHODS)[number]["id"]>("pago_movil");
  const [cur, setCur] = useState<"USD" | "VES">("VES");
  const rate = vesPerUsd(rates, groupRate);

  const adding = parts.filter((p) => picked.includes(p.n) && p.restUsd > 0);
  const removing = parts.filter((p) => !picked.includes(p.n) && p.restUsd === 0);
  const addUsd = adding.reduce((a, p) => a + p.restUsd, 0);
  const changed = adding.length > 0 || removing.length > 0;
  const toggle = (n: number) => setPicked((x) => (x.includes(n) ? x.filter((y) => y !== n) : [...x, n]));

  const save = () =>
    start(async () => {
      const r = await setCuotasPaid(salidaId, memberId, picked, method, cur);
      if (!r.ok) return toast(r.error, "error");
      toast(`Listo, actualicé las cuotas de ${name} ✅`);
      router.refresh();
      onClose();
    });

  return (
    <Sheet open onClose={onClose} title={`Cuotas de ${name}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Marca las que ya pagó. Lo puedes cambiar cuando quieras.</p>
          <span className="flex shrink-0 gap-3 text-xs font-semibold text-muted">
            <button type="button" className="hover:text-text" onClick={() => setPicked(parts.map((p) => p.n))}>
              Todas
            </button>
            <button type="button" className="hover:text-text" onClick={() => setPicked([])}>
              Ninguna
            </button>
          </span>
        </div>
        <ul className="space-y-2">
          {parts.map((p) => {
            const on = picked.includes(p.n);
            const days = diffDays(p.dueDate, todayVE());
            const halfPaid = p.restUsd > 0 && p.restUsd < p.usd;
            return (
              <li key={p.n}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.n)}
                  className={clsx("flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors", on ? "border-mint bg-mint-soft" : "border-line")}
                >
                  <span className={clsx("grid size-6 shrink-0 place-items-center rounded-md border-2", on ? "border-mint bg-mint text-on-color" : "border-line-strong")}>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.n === 0 ? "Inicial" : `Cuota ${p.n}`}</span>
                    <span className={clsx("block text-xs", days < 0 && !on ? "font-semibold text-rose" : "text-muted")}>
                      {prettyDay(p.dueDate, true)} · {on && p.restUsd === 0 ? "pagada" : dueLabel(days)}
                      {halfPaid && ` · abonó ${fmt(p.usd - p.restUsd, "USD")}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-bold">{fmt(halfPaid ? p.restUsd : p.usd, "USD")}</span>
                    {p.restUsd > 0 && <span className="num block text-[11px] text-muted">{fmt(Math.round(p.restUsd * rate), "VES")}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {adding.length > 0 && (
          <>
            <div className="rounded-2xl border-2 border-ink bg-sun p-3 text-center text-sun-ink">
              <p className="num text-2xl font-bold">{fmt(addUsd, "USD")}</p>
              <p className="num text-sm opacity-75">
                {fmt(Math.round(addUsd * rate), "VES")} a {RATE_META[groupRate].short} {fmtNumber(rate)} (hoy)
              </p>
            </div>
            <div>
              <p className="label">¿Cómo pagó?</p>
              <div className="grid grid-cols-2 gap-2">
                {PAID_METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMethod(m.id);
                      setCur(m.cur === "VES" ? "VES" : "USD");
                    }}
                    className={clsx("rounded-2xl border-2 px-3 py-2.5 text-sm font-semibold", method === m.id ? "border-ink bg-sun text-sun-ink" : "border-line")}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Se anota en</p>
              <Segmented
                name="cuotas-cur"
                value={cur}
                onChange={setCur}
                options={[
                  { value: "VES", label: "Bolívares" },
                  { value: "USD", label: "Dólares" },
                ]}
              />
            </div>
          </>
        )}
        {removing.length > 0 && (
          <p className="rounded-2xl bg-rose-soft p-3 text-sm text-rose">
            Se {removing.length === 1 ? "desmarca" : "desmarcan"} {removing.map((p) => (p.n === 0 ? "la inicial" : `la cuota ${p.n}`)).join(", ")} y {removing.length === 1 ? "vuelve" : "vuelven"} a estar pendiente{removing.length === 1 ? "" : "s"}.
          </p>
        )}
        <Button size="lg" className="w-full" loading={pending} disabled={!changed} onClick={save}>
          <Check size={18} /> {changed ? "Guardar" : "Sin cambios"}
        </Button>
      </div>
    </Sheet>
  );
}
