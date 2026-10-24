"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, useTransition } from "react";
import { BellRing, Check, ChevronDown } from "lucide-react";
import { markPersonPaid, remindPerson } from "@/app/actions/salidas";
import { dueLabel } from "@/lib/cashea";
import { fmt } from "@/lib/money";
import { prettyDay } from "@/lib/dates";
import { Money, useDisplay } from "./display";
import { Avatar, Button, Segmented, Sheet, useToast } from "./ui";

export type PersonDebtView = {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  amount: number;
  hasPayInfo?: boolean;
  items: {
    salidaId: string;
    title: string;
    emoji: string;
    date: string;
    remainingUsd: number;
    /** Si se paga por cuotas de Cashea: la próxima. */
    cuota?: { n: number; dueDate: string; daysLeft: number; payUsd: number } | null;
  }[];
};

/** La cuota que vence primero entre las salidas de esa persona (si hay alguna por cuotas). */
const nextCuotaOf = (p: PersonDebtView) =>
  p.items
    .filter((i) => i.cuota)
    .sort((a, b) => a.cuota!.dueDate.localeCompare(b.cuota!.dueDate))[0]?.cuota ?? null;

/** Lista de panas que me deben («cobrar») o a los que les debo («pagar»). */
export function PersonDebts({ kind, people }: { kind: "cobrar" | "pagar"; people: PersonDebtView[] }) {
  const { rates } = useDisplay();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [marking, setMarking] = useState<PersonDebtView | null>(null);
  const [cur, setCur] = useState<"VES" | "USD">("VES");

  return (
    <ul className="space-y-2.5">
      {people.map((p) => (
        <li key={p.userId} className="card overflow-clip">
          <div className="flex flex-wrap items-center gap-3 p-3.5">
            <Link href={`/panas/${p.userId}`} className="shrink-0">
              <Avatar emoji={p.avatar} color={p.color} size={44} />
            </Link>
            <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === p.userId ? null : p.userId)}>
              <p className="truncate">
                {kind === "cobrar" ? (
                  <>
                    <b>{p.name}</b> te debe
                  </>
                ) : (
                  <>
                    Le debes a <b>{p.name}</b>
                  </>
                )}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted">
                {p.items.length} {p.items.length === 1 ? "salida" : "salidas"} <ChevronDown size={13} className={clsx("transition-transform", open === p.userId && "rotate-180")} />
              </p>
              {nextCuotaOf(p) && (
                <p className={clsx("text-xs font-semibold", nextCuotaOf(p)!.daysLeft < 0 ? "text-rose" : "text-text")}>
                  💳 {kind === "pagar" ? "Tu" : "Su"} próxima cuota: <Money usd={nextCuotaOf(p)!.payUsd} /> · {dueLabel(nextCuotaOf(p)!.daysLeft)}
                </p>
              )}
            </button>
            <div className="text-right">
              <Money usd={p.amount} className={clsx("block text-lg font-bold", kind === "cobrar" ? "text-mint" : "text-rose")} />
              <span className="num text-[11px] text-muted">{fmt(Math.round(p.amount * rates.bcvUsd), "VES")}</span>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              {kind === "pagar" ? (
                <Link href={`/pagar?a=${p.userId}`} className="btn-pop h-10 flex-1 px-4 text-sm sm:flex-none">
                  Pagarle
                </Link>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="soft"
                    className="h-10 flex-1 sm:flex-none"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await remindPerson(p.userId);
                        toast(r.ok ? `Le llegó el recordatorio a ${p.name} 🔔` : r.error, r.ok ? "ok" : "error");
                      })
                    }
                  >
                    <BellRing size={14} /> Recordarle
                  </Button>
                  <Button size="sm" className="h-10 flex-1 sm:flex-none" onClick={() => setMarking(p)}>
                    <Check size={14} /> Ya me pagó
                  </Button>
                </>
              )}
            </div>
          </div>
          {open === p.userId && (
            <ul className="border-t border-line bg-card-2/50 px-4 py-2 text-sm">
              {p.items.map((it) => (
                <li key={it.salidaId}>
                  <Link href={`/salidas/${it.salidaId}`} className="flex items-center gap-2 py-1.5 hover:underline">
                    <span>{it.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {it.title}
                      {it.cuota && (
                        <span className="block text-[11px] text-muted">
                          {it.cuota.n === 0 ? "Inicial" : `Cuota ${it.cuota.n}`} <Money usd={it.cuota.payUsd} /> · {dueLabel(it.cuota.daysLeft)}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted">{prettyDay(it.date)}</span>
                    <Money usd={it.remainingUsd} className="text-xs font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
      <Sheet open={!!marking} onClose={() => setMarking(null)} title={marking ? `¿${marking.name} ya te pagó todo?` : ""}>
        {marking && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Se marcan como pagadas sus {marking.items.length} salidas ({fmt(marking.amount, "USD")}). Usa esto cuando te pagó todo junto.
            </p>
            <Segmented
              name="mark-cur"
              value={cur}
              onChange={setCur}
              options={[
                { value: "VES", label: "Me pagó en Bs" },
                { value: "USD", label: "Me pagó en $" },
              ]}
            />
            <Button
              size="lg"
              className="w-full"
              loading={pending}
              onClick={() => {
                const p = marking;
                setMarking(null);
                start(async () => {
                  const r = await markPersonPaid(p.userId, cur === "VES" ? "pago_movil" : "efectivo_usd", cur);
                  toast(r.ok ? `¡Listo! ${p.name} quedó al día ✅` : r.error, r.ok ? "ok" : "error");
                });
              }}
            >
              <Check size={18} /> Sí, ya me pagó
            </Button>
          </div>
        )}
      </Sheet>
    </ul>
  );
}
