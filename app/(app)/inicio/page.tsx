import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getEverything } from "@/lib/data";
import { hasPayInfo, otherUsersExist } from "@/lib/community";
import { casheaDues, categoryBreakdown, monthlySpending } from "@/lib/insights";
import { pendingConfirmations, personBalances } from "@/lib/people";
import { rateHistory } from "@/lib/rates";
import { addDays, monthLabel, prettyDay, todayVE, ymdOf } from "@/lib/dates";
import { categoryOf } from "@/lib/constants";
import { checklistRows } from "@/lib/salida-view";
import { paidProgress } from "@/lib/share-status";
import { CasheaDueList, HeroBalance, RatesCard, Section, SeeAll } from "@/components/blocks";
import { BarList, ColumnChart } from "@/components/charts";
import { ConfirmPayments } from "@/components/confirm-payments";
import { Money } from "@/components/display";
import { PersonDebts } from "@/components/person-debts";
import { PushCard } from "@/components/push";
import { proofsFor } from "@/lib/proofs";

export const metadata: Metadata = { title: "Inicio" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Caracas" }).format(new Date()));
  if (h < 5) return { text: "Trasnochando", emoji: "🌙" };
  if (h < 12) return { text: "Buenos días", emoji: "☀️" };
  if (h < 19) return { text: "Buenas tardes", emoji: "🌤️" };
  return { text: "Buenas noches", emoji: "🌙" };
}

export default async function Inicio() {
  const user = await requireUser();
  if (!user.onboarded) redirect("/bienvenida");
  const [bundles, history, hasOthers] = await Promise.all([getEverything(user.id), rateHistory(30), otherUsersExist(user.id)]);
  const g = greeting();

  const people = personBalances(bundles);
  const owedToMe = people.reduce((a, p) => a + p.owedToMe, 0);
  const iOwe = people.reduce((a, p) => a + p.iOwe, 0);
  const theyOwe = people.filter((p) => p.owedToMe > 0).map((p) => ({ userId: p.userId, name: p.name, avatar: p.avatar, color: p.color, amount: p.owedToMe, items: p.theyOweItems }));
  const iOweList = people.filter((p) => p.iOwe > 0).map((p) => ({ userId: p.userId, name: p.name, avatar: p.avatar, color: p.color, amount: p.iOwe, items: p.iOweItems }));
  const cobros = pendingConfirmations(bundles, "cobro");
  const pagos = pendingConfirmations(bundles, "pago");
  // Las capturas de pago que subieron (las ve quien cobra y quien pagó).
  const proofs = await proofsFor([...cobros, ...pagos].flatMap((c) => c.settlementIds), user.id);
  const withProof = <T extends { settlementIds: string[] }>(c: T) => ({ ...c, proof: c.settlementIds.map((id) => proofs.get(id)).find(Boolean) ?? null });
  const toConfirm = cobros.map(withProof);
  const waiting = pagos.map(withProof);
  const open = bundles
    .filter(({ ledger }) => !ledger.group.closedAt && ledger.expenses[0])
    .map(({ ledger }) => {
      const e = ledger.expenses[0];
      const p = paidProgress(checklistRows(ledger));
      return { id: ledger.group.id, title: e.title, emoji: categoryOf(e.category).emoji, date: ymdOf(e.spentAt), totalUsd: e.amountUsd, paid: p.paid, debtors: p.debtors };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const dues = casheaDues(bundles, 45).slice(0, 4);
  const months = monthlySpending(bundles, 6).map((m) => ({ key: m.month, label: monthLabel(m.month), usd: m.mine }));
  const cats = categoryBreakdown(bundles, addDays(todayVE(), -90)).slice(0, 6);
  const spark = {
    bcvUsd: history.map((h) => h.bcvUsd).filter((v): v is number => v != null),
    bcvEur: history.map((h) => h.bcvEur).filter((v): v is number => v != null),
    usdt: history.map((h) => h.usdt).filter((v): v is number => v != null),
  };

  // Primeros pasos guiados
  const steps = [
    { done: hasPayInfo(user.payInfo), label: "Carga tus datos de pago", hint: "Para que te paguen rápido", href: "/perfil#datos-de-pago" },
    { done: hasOthers, label: "Invita a tus panas", hint: "Mándales el link por WhatsApp", href: "/panas#invitar" },
    { done: bundles.length > 0, label: "Anota tu primera salida", hint: "El que puso la plata la anota", href: "/salidas/nueva" },
  ];
  const pendingSteps = steps.filter((s) => !s.done).length;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted first-letter:uppercase">
          {new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Caracas" }).format(new Date())}
        </p>
        <h1 className="display mt-1 text-3xl font-extrabold sm:text-4xl">
          {g.text}, {user.name} {g.emoji}
        </h1>
      </div>

      {pendingSteps > 0 && (
        <section className="sticker bg-card p-5">
          <p className="display text-lg font-bold">
            Primeros pasos ({steps.length - pendingSteps}/{steps.length})
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${s.done ? "border-mint bg-mint-soft" : "border-line hover:border-ink"}`}>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${s.done ? "border-mint bg-mint text-on-color" : "border-muted"}`}>
                    {s.done && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${s.done ? "line-through opacity-60" : ""}`}>{s.label}</span>
                    <span className="block text-xs text-muted">{s.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {toConfirm.length > 0 && (
        <section id="por-confirmar" className="scroll-mt-24">
          <h2 className="display mb-3 text-xl font-bold">💸 ¿Te llegaron estos pagos?</h2>
          <ConfirmPayments items={toConfirm} role="cobro" />
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <HeroBalance net={owedToMe - iOwe} owedToMe={owedToMe} iOwe={iOwe} name={user.name} />

          {iOweList.length > 0 && (
            <Section title="Debes" action={<span className="chip">{iOweList.length}</span>}>
              <PersonDebts kind="pagar" people={iOweList} />
            </Section>
          )}
          {theyOwe.length > 0 && (
            <Section title="Te deben" action={<span className="chip">{theyOwe.length}</span>}>
              <PersonDebts kind="cobrar" people={theyOwe} />
            </Section>
          )}
          {!iOweList.length && !theyOwe.length && bundles.length > 0 && (
            <div className="card flex items-center gap-4 p-5">
              <span className="text-3xl">🤝</span>
              <div>
                <p className="font-semibold">Estás a mano con todo el mundo</p>
                <p className="text-sm text-muted">Nadie te debe y no le debes a nadie… por ahora 👀</p>
              </div>
            </div>
          )}
          {waiting.length > 0 && (
            <Section title="Esperando confirmación">
              <ConfirmPayments items={waiting} role="pago" />
            </Section>
          )}

          <Section title="Salidas abiertas" action={<SeeAll href="/salidas" />}>
            {open.length ? (
              <ul className="card divide-y divide-line overflow-clip">
                {open.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link href={`/salidas/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-card-2/60">
                      <span className="text-2xl">{s.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{s.title}</span>
                        <span className="block text-xs text-muted">
                          {prettyDay(s.date)} · {s.debtors ? `✓ ${s.paid}/${s.debtors} pagaron` : "sin deudas"}
                        </span>
                      </span>
                      <Money usd={s.totalUsd} className="text-sm font-semibold" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Link href="/salidas/nueva" className="card flex items-center justify-center gap-2 p-5 font-semibold text-muted hover:text-text">
                <Plus size={18} /> Anotar una salida
              </Link>
            )}
          </Section>

          {bundles.length > 0 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="card p-5">
                <h3 className="font-semibold">Lo que has consumido</h3>
                <p className="text-xs text-muted">Tu parte de las salidas, últimos 6 meses</p>
                <div className="mt-4">
                  <ColumnChart data={months} />
                </div>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold">¿En qué se va?</h3>
                <p className="mb-4 text-xs text-muted">Tu parte por tipo de salida, 90 días</p>
                {cats.length ? <BarList data={cats.map((c) => ({ id: c.id, label: c.label, emoji: c.emoji, usd: c.usd }))} /> : <p className="text-sm text-muted">Todavía nada.</p>}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-8">
          <PushCard compact />
          <RatesCard history={spark} />
          {dues.length > 0 && (
            <Section title="Cuotas Cashea" action={<SeeAll href="/cashea" />}>
              <CasheaDueList items={dues} />
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
