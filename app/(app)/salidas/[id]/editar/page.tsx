import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listPanas } from "@/lib/community";
import { getLedger } from "@/lib/data";
import { ymdOf } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import type { RateSourceId } from "@/lib/rates-shared";
import { shareStatuses } from "@/lib/share-status";
import { SalidaWizard, type SalidaInitial } from "@/components/salida-wizard";

export const metadata: Metadata = { title: "Editar salida" };

export default async function EditarSalida({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ledger = await getLedger(id, user.id);
  const e = ledger?.expenses[0];
  if (!ledger || !e) notFound();
  const plan = ledger.cashea.find((p) => p.expenseId === e.id);
  // En el asistente cada persona se identifica por su usuario (o por su miembro si es un «Ex pana»).
  const keyOf = new Map(ledger.members.map((m) => [m.id, m.userId ?? m.id]));
  const K = (mid: string) => keyOf.get(mid) ?? mid;
  const panas = await listPanas(user.id);
  const involved = new Set([...e.payers.map((p) => p.memberId), ...e.shares.map((s) => s.memberId)]);
  const exPanas = ledger.members.filter((m) => !m.userId && involved.has(m.id));
  const people = [
    ...panas.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, isMe: p.isMe, hasAccount: true })),
    ...exPanas.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, color: m.color, isMe: false, hasAccount: false })),
  ];
  const s = e.split;
  const initial: SalidaInitial = {
    salidaId: id,
    participants: ledger.members.filter((m) => !m.leftAt || involved.has(m.id)).map((m) => K(m.id)),
    title: e.title,
    category: e.category,
    extraCategories: e.extraCategories,
    place: e.place,
    notes: e.notes,
    date: ymdOf(e.spentAt),
    currency: e.currency as Currency,
    fx: { source: e.fx.source as SalidaInitial["fx"]["source"], vesPerUsd: e.fx.vesPerUsd, vesPerEur: e.fx.vesPerEur, vesPerUsdt: e.fx.vesPerUsdt },
    split: {
      ...s,
      members: s.members?.map(K),
      amounts: s.amounts && Object.fromEntries(Object.entries(s.amounts).map(([k, v]) => [K(k), v])),
      percents: s.percents && Object.fromEntries(Object.entries(s.percents).map(([k, v]) => [K(k), v])),
      weights: s.weights && Object.fromEntries(Object.entries(s.weights).map(([k, v]) => [K(k), v])),
      items: s.items?.map((i) => ({ ...i, members: i.members.map(K) })),
    },
    payers: e.payers.map((p) => ({ memberId: K(p.memberId), currency: p.currency as Currency, amount: p.amount, method: p.method })),
    paid: Object.fromEntries(
      shareStatuses(
        { payers: e.payers.map((p) => ({ memberId: p.memberId, amountUsd: p.amountUsd })), shares: e.shares.map((x) => ({ memberId: x.memberId, amountUsd: x.amountUsd })) },
        ledger.settlements.filter((x) => x.expenseId === e.id),
      )
        .filter((x) => x.status !== "puso")
        .map((x) => [K(x.memberId), x.status === "pagado" || x.status === "por-confirmar" ? "pagado" : (x.status as "parcial" | "falta")]),
    ),
    cashea: plan ? { level: plan.level, initialPct: plan.initialPct, installments: plan.installments, intervalDays: plan.intervalDays, mode: plan.mode, store: plan.store, line: plan.line } : null,
  };
  return (
    <div>
      <div className="mx-auto mb-4 max-w-3xl">
        <Link href={`/salidas/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
          <ArrowLeft size={16} /> Volver a la salida
        </Link>
        <h1 className="display mt-2 text-3xl font-extrabold sm:text-4xl">Editar salida</h1>
      </div>
      <SalidaWizard people={people} meId={user.id} defaultRate={ledger.group.rateSource as RateSourceId} initial={initial} />
    </div>
  );
}
