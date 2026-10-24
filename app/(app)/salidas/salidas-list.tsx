"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { Money } from "@/components/display";
import { AvatarStack, EmptyState, Segmented } from "@/components/ui";

export type SalidaCard = {
  id: string;
  title: string;
  emoji: string;
  /** Emojis de las otras categorías que se marcaron. */
  extraEmojis?: string;
  color: string;
  date: string;
  dateLabel: string;
  place: string | null;
  totalUsd: number;
  people: { emoji: string; color: string; name: string }[];
  closed: boolean;
  paid: number;
  debtors: number;
  waiting: number;
  toCollect: number;
  toPay: number;
  /** Mi próxima cuota cuando la salida se paga por cuotas de Cashea. */
  nextCuota?: { usd: number; label: string; late: boolean } | null;
};

export function SalidasList({ cards }: { cards: SalidaCard[] }) {
  const [tab, setTab] = useState<"abiertas" | "cerradas">("abiertas");
  const [q, setQ] = useState("");
  const open = cards.filter((c) => !c.closed);
  const closed = cards.filter((c) => c.closed);
  const list = (tab === "abiertas" ? open : closed).filter((c) => !q || `${c.title} ${c.place ?? ""} ${c.people.map((p) => p.name).join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  if (cards.length === 0)
    return (
      <EmptyState emoji="🍻" title="Todavía no hay salidas" action={<Link href="/salidas/nueva" className="btn-pop h-11 px-6">Anotar la primera</Link>}>
        Cuando salgan (a comer, a tomar, a la playa…) el que puso la plata la anota en 1 minuto y a cada quien le llega lo que le toca.
      </EmptyState>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Segmented
          name="salidas-tab"
          value={tab}
          onChange={setTab}
          className="sm:w-80"
          options={[
            { value: "abiertas", label: `Abiertas (${open.length})` },
            { value: "cerradas", label: `Cerradas (${closed.length})` },
          ]}
        />
        <div className="relative flex-1">
          <Search size={17} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input className="field pl-10" placeholder="Buscar salida, lugar o pana…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{tab === "abiertas" ? "No hay salidas abiertas. ¡Todo al día! 🤙" : "Todavía no hay salidas cerradas."}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} href={`/salidas/${c.id}`} className={clsx("card group relative overflow-clip p-5 transition-all hover:-translate-y-1 hover:border-line-strong", c.closed && "opacity-80")}>
              <div className="absolute -top-10 -right-10 size-32 rounded-full opacity-25 blur-2xl" style={{ background: c.color }} />
              <div className="relative flex items-start justify-between gap-3">
                <span className="relative grid size-14 place-items-center rounded-2xl border-2 border-ink bg-card text-3xl">
                  {c.emoji}
                  {c.extraEmojis && (
                    <span className="absolute -right-2 -bottom-2 rounded-full border-2 border-ink bg-card px-1 text-xs leading-5">{c.extraEmojis}</span>
                  )}
                </span>
                <div className="text-right">
                  <Money usd={c.totalUsd} className="text-lg font-bold" />
                  <p className="text-xs text-muted">{c.dateLabel}</p>
                </div>
              </div>
              <h2 className="display relative mt-3 truncate text-xl font-bold">{c.title}</h2>
              <div className="relative mt-1 flex items-center gap-2">
                <AvatarStack people={c.people} size={24} max={5} />
                {c.place && <span className="truncate text-xs text-muted">· {c.place}</span>}
              </div>
              <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs font-semibold">
                {c.closed ? (
                  <span className="chip">🔒 Cerrada</span>
                ) : c.debtors === 0 ? (
                  <span className="chip">Nadie debe nada</span>
                ) : (
                  <span className={clsx("chip", c.paid === c.debtors && "!border-mint !bg-mint-soft")}>
                    ✓ {c.paid}/{c.debtors} pagaron
                  </span>
                )}
                {c.waiting > 0 && <span className="chip !bg-sun/30">⏳ {c.waiting} por confirmar</span>}
                {c.toPay > 0 && c.nextCuota ? (
                  <span className={clsx("ml-auto text-right", c.nextCuota.late ? "text-rose" : "text-text")}>
                    <Money usd={c.nextCuota.usd} />
                    <span className="block text-[11px] font-normal text-muted">{c.nextCuota.label}</span>
                  </span>
                ) : (
                  c.toPay > 0 && (
                    <span className="ml-auto text-rose">
                      Debes <Money usd={c.toPay} />
                    </span>
                  )
                )}
                {c.toCollect > 0 && (
                  <span className="ml-auto text-mint">
                    Te deben <Money usd={c.toCollect} />
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
