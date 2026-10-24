"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { useState, useTransition } from "react";
import { Check, Clock, AlertTriangle } from "lucide-react";
import { toggleInstallment } from "@/app/actions/salidas";
import { CASHEA_LATE_FEE_USD, installmentStatus, levelOf, planProgress } from "@/lib/cashea";
import { prettyDay, relativeDue } from "@/lib/dates";
import { fmt, fmtNumber, parseAmount } from "@/lib/money";
import { useDisplay, Money } from "./display";
import { Avatar, Button, Sheet, useToast } from "./ui";

export type CasheaPlanView = {
  id: string;
  groupId?: string;
  groupName?: string;
  expenseId: string | null;
  expenseTitle: string | null;
  memberId: string;
  store: string | null;
  line: string;
  level: number;
  initialPct: number;
  count: number;
  intervalDays: number;
  totalUsd: number;
  initialUsd: number;
  purchaseDate: string;
  mode: string;
  shares: { memberId: string; usd: number }[];
  /** Modo espejo: lo que le toca a cada pana en cada cuota y cuánto le falta (ya descontado lo que pagó). */
  mirror?: Record<string, { n: number; usd: number; restUsd: number }[]>;
  rows: { id: string; n: number; dueDate: string; amountUsd: number; paidAt: string | null; paidVes: number | null; paidRate: number | null }[];
};

type MemberLite = { id: string; name: string; avatar: string; color: string };

const STATUS_STYLE = {
  pagada: { label: "Pagada", cls: "bg-mint-soft text-mint", icon: Check },
  "al-dia": { label: "Por vencer", cls: "bg-card-2 text-muted", icon: Clock },
  "vence-pronto": { label: "Vence pronto", cls: "bg-cashea/25 text-text", icon: Clock },
  "en-gracia": { label: "En gracia", cls: "bg-cashea/40 text-text", icon: AlertTriangle },
  atrasada: { label: "Atrasada", cls: "bg-rose-soft text-rose", icon: AlertTriangle },
} as const;

export function CasheaPlanCard({
  plan,
  members,
  groupId,
  meId,
  canMark,
}: {
  plan: CasheaPlanView;
  members: MemberLite[];
  groupId: string;
  meId: string;
  /** Quién marca las cuotas como pagadas a Cashea: el dueño (o quien anotó la salida si el dueño no tiene cuenta). */
  canMark?: boolean;
}) {
  const { rates } = useDisplay();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState<CasheaPlanView["rows"][number] | null>(null);
  const [ves, setVes] = useState("");
  const holder = members.find((m) => m.id === plan.memberId);
  const lvl = levelOf(plan.level);
  const prog = planProgress(plan.rows);
  const others = plan.shares.filter((s) => s.memberId !== plan.memberId && s.usd > 0);
  const iAmHolder = plan.memberId === meId;
  const mayMark = canMark ?? iAmHolder;

  const mark = (rowId: string, paid: boolean, paidVes?: number | null, rate?: number | null) =>
    start(async () => {
      const r = await toggleInstallment(groupId, rowId, paid, paidVes, rate);
      if (r.ok) toast(paid ? "Cuota marcada como pagada" : "Cuota desmarcada");
      else toast(r.error, "error");
    });

  return (
    <div className="card min-w-0 overflow-clip">
      <div className="relative bg-cashea p-5 text-cashea-ink">
        <div className="absolute top-0 right-0 h-full w-1/2 opacity-15" style={{ background: "repeating-linear-gradient(135deg, #000 0 2px, transparent 2px 12px)" }} />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black tracking-[0.18em] uppercase opacity-70">Cashea · {plan.groupName ?? "orden"}</p>
            <h3 className="display mt-1 truncate text-2xl font-extrabold">{plan.store ?? plan.expenseTitle ?? "Orden"}</h3>
            <p className="mt-1 text-sm font-medium opacity-80">
              {lvl.name} · inicial {fmtNumber(plan.initialPct, 0)}% · {plan.count} cuota{plan.count === 1 ? "" : "s"} c/{plan.intervalDays} días
            </p>
          </div>
          {holder && (
            <div className="flex shrink-0 flex-col items-center gap-1">
              <Avatar emoji={holder.avatar} color={holder.color} size={40} />
              <span className="text-[10px] font-bold">{iAmHolder ? "Tu Cashea" : holder.name}</span>
            </div>
          )}
        </div>
        <div className="relative mt-4">
          <div className="flex justify-between text-xs font-bold">
            <span>
              Pagado <Money usd={prog.paid} className="text-xs" /> de <Money usd={prog.total} className="text-xs" />
            </span>
            <span>{Math.round(prog.pct * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-black/15">
            <motion.div className="h-2.5 rounded-full bg-cashea-ink" initial={{ width: 0 }} animate={{ width: `${prog.pct * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
          </div>
        </div>
      </div>

      <ol className="divide-y divide-line">
        {plan.rows.map((r) => {
          const st = installmentStatus(r);
          const S = STATUS_STYLE[st];
          return (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className={clsx("grid size-9 shrink-0 place-items-center rounded-xl text-xs font-black", r.paidAt ? "bg-mint-soft text-mint" : "bg-card-2")}>
                {r.n === 0 ? "INI" : r.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {r.n === 0 ? "Inicial" : `Cuota ${r.n}`} · <Money usd={r.amountUsd} />
                </p>
                <p className="text-xs text-muted">
                  {prettyDay(r.dueDate, true)} · {r.paidAt ? (r.paidVes ? `pagada ${fmt(r.paidVes, "VES")} a ${fmtNumber(r.paidRate ?? 0)}` : "pagada") : relativeDue(r.dueDate)}
                  {!r.paidAt && ` · hoy ≈ ${fmt(Math.round(r.amountUsd * rates.bcvUsd), "VES")}`}
                </p>
              </div>
              <span className={clsx("hidden items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold sm:flex", S.cls)}>
                <S.icon size={12} /> {S.label}
              </span>
              {r.n > 0 &&
                mayMark &&
                (r.paidAt ? (
                  <button disabled={pending} onClick={() => mark(r.id, false)} className="text-xs font-semibold text-muted hover:text-rose">
                    Deshacer
                  </button>
                ) : (
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={pending}
                    onClick={() => {
                      setPaying(r);
                      setVes(fmtNumber((r.amountUsd * rates.bcvUsd) / 100));
                    }}
                  >
                    Pagar
                  </Button>
                ))}
            </li>
          );
        })}
      </ol>

      {plan.mode === "espejo" && others.length > 0 && (
        <div className="border-t border-line bg-card-2/50 px-5 py-4">
          <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Lo que cada pana le paga a {iAmHolder ? "ti" : holder?.name} por cuota</p>
          <div className="mt-3 space-y-2">
            {others.map((s) => {
              const m = members.find((x) => x.id === s.memberId);
              const frac = plan.totalUsd ? s.usd / plan.totalUsd : 0;
              return (
                <div key={s.memberId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="flex min-w-28 items-center gap-2 font-semibold">
                    <Avatar emoji={m?.avatar ?? "🙂"} color={m?.color ?? "#9CA3AF"} size={18} className="mr-1 align-middle" /> {s.memberId === meId ? "Tú" : m?.name}
                  </span>
                  {plan.rows.map((r) => {
                    const part = plan.mirror?.[s.memberId]?.find((x) => x.n === r.n);
                    // Verde = ese pana ya pagó su parte de esa cuota.
                    const done = part ? part.restUsd === 0 : !!r.paidAt;
                    return (
                      <span key={r.id} className={clsx("num rounded-lg px-2 py-0.5 text-xs", done ? "bg-mint-soft text-mint" : "bg-card")}>
                        {r.n === 0 ? "Ini" : `C${r.n}`} <Money usd={part ? part.usd : Math.round(r.amountUsd * frac)} className="text-xs" />
                        {done && part && part.usd > 0 && " ✓"}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            Modo espejo: cada quien paga su parte al ritmo de las cuotas, a tasa BCV del día. Si una cuota se atrasa, Cashea cobra {fmt(CASHEA_LATE_FEE_USD, "USD")} de reactivación.
          </p>
        </div>
      )}

      <Sheet open={!!paying} onClose={() => setPaying(null)} title={paying ? `Pagar cuota ${paying.n}` : ""}>
        {paying && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Cashea cobra en bolívares a tasa BCV del día que pagas. Hoy: <b className="num text-text">{fmtNumber(rates.bcvUsd)}</b> Bs/$.
            </p>
            <div className="rounded-2xl bg-card-2 p-4 text-center">
              <Money usd={paying.amountUsd} currency="USD" className="text-3xl font-bold" />
              <p className="num mt-1 text-sm text-muted">≈ {fmt(Math.round(paying.amountUsd * rates.bcvUsd), "VES")}</p>
            </div>
            <div>
              <label className="label" htmlFor="ves">
                ¿Cuántos Bs pagaste? (opcional)
              </label>
              <input id="ves" className="field num" inputMode="decimal" value={ves} onChange={(e) => setVes(e.target.value)} />
            </div>
            <Button
              className="w-full"
              size="lg"
              loading={pending}
              onClick={() => {
                const cents = parseAmount(ves);
                const rate = cents ? cents / paying.amountUsd : null;
                mark(paying.id, true, cents, rate);
                setPaying(null);
              }}
            >
              Marcar como pagada
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
