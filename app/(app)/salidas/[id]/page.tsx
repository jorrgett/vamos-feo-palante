import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getLedger } from "@/lib/data";
import { categoriesOf, categoryLabel, categoryOf, payMethodOf } from "@/lib/constants";
import { longDay, ymdOf } from "@/lib/dates";
import { fmt, fmtNumber, type Currency } from "@/lib/money";
import { getRates } from "@/lib/rates";
import { RATE_META, vesPerUsd, type RateSourceId } from "@/lib/rates-shared";
import { casheaPlanOf, checklistRows } from "@/lib/salida-view";
import { mirrorForDebtor } from "@/lib/cashea";
import { paidProgress } from "@/lib/share-status";
import { Avatar, AvatarStack } from "@/components/ui";
import { CasheaPlanCard } from "@/components/cashea-plan";
import { ShareChecklist } from "@/components/share-checklist";
import { SalidaActions } from "@/components/salida-actions";
import { ProofButton } from "@/components/proof";
import { proofsFor } from "@/lib/proofs";
import { aiEnabled } from "@/lib/ai";
import { PilasMascota } from "@/components/pilas/mascota";

export const metadata: Metadata = { title: "Salida" };

const MODE_LABEL = { equal: "Partes iguales", exact: "Montos exactos", percent: "Porcentajes", shares: "Por partes", items: "Por consumo" } as const;

export default async function SalidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ledger = await getLedger(id, user.id);
  const e = ledger?.expenses[0];
  if (!ledger || !e) notFound();
  const byId = new Map(ledger.members.map((m) => [m.id, m]));
  const cat = categoryOf(e.category);
  const extraCats = categoriesOf(e).slice(1);
  const cur = e.currency as Currency;
  const plan = ledger.cashea.find((p) => p.expenseId === e.id);
  const date = ymdOf(e.spentAt);
  const src = e.fx.source as RateSourceId | "custom";
  const me = ledger.me.id;
  const payments = ledger.settlements.filter((s) => s.expenseId === e.id);
  // Capturas de pago (solo las que esta persona puede ver: si pagó o si cobra).
  const proofs = await proofsFor(payments.map((s) => s.id), user.id);
  const rows = checklistRows(ledger).map((r) => ({ ...r, proof: r.pendingIdsForMe.map((sid) => proofs.get(sid)).find(Boolean) ?? null }));
  const progress = paidProgress(rows);
  // Modo espejo: la parte de cada pana en cada cuota, con lo que ya pagó descontado.
  const mirrorPlan = casheaPlanOf(ledger);
  const eLike = { payers: e.payers, shares: e.shares };
  const mirrorParts = mirrorPlan
    ? Object.fromEntries(
        e.shares.flatMap((s) => {
          const m = mirrorForDebtor(mirrorPlan, eLike, payments, s.memberId);
          return m ? [[s.memberId, m.parts.map((p) => ({ n: p.n, dueDate: p.dueDate, usd: p.usd, restUsd: p.restUsd }))]] : [];
        }),
      )
    : undefined;
  const closed = !!ledger.group.closedAt;
  // En bolívares la deuda se mantiene en dólares: mientras la salida siga abierta se muestra el equivalente de hoy.
  const rateToday = vesPerUsd(await getRates(), ledger.group.rateSource as RateSourceId);
  const bsToday = cur === "VES" && !closed;
  const totalShown = bsToday ? Math.round(e.amountUsd * rateToday) : e.amount;
  const bsMoved = bsToday && Math.abs(totalShown - e.amount) > 100;
  const people = ledger.members.filter((m) => !m.leftAt || e.shares.some((s) => s.memberId === m.id));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/salidas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
        <ArrowLeft size={16} /> Salidas
      </Link>

      <article className="relative overflow-clip rounded-[1.75rem] border-2 border-ink bg-card shadow-[5px_5px_0_var(--pop)]">
        {closed && <span className="absolute top-4 right-4 rounded-full border-2 border-ink bg-card px-3 py-1 text-xs font-bold">🔒 Cerrada</span>}
        <div className="relative p-6 text-center" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${cat.color} 30%, transparent), transparent 70%)` }}>
          <span className="relative mx-auto grid size-16 place-items-center rounded-3xl border-2 border-ink bg-card text-4xl">
            {cat.emoji}
            {extraCats.length > 0 && (
              <span className="absolute -right-3 -bottom-2 rounded-full border-2 border-ink bg-card px-1.5 text-base leading-6">{extraCats.map((c) => c.emoji).join("")}</span>
            )}
          </span>
          <h1 className="display mt-4 text-3xl font-extrabold">{e.title}</h1>
          <p className="mt-1 text-sm text-muted first-letter:uppercase">
            {longDay(date)}
            {e.place ? ` · ${e.place}` : ""}
          </p>
          <div className="mt-3 flex justify-center">
            <AvatarStack people={people.map((m) => ({ emoji: m.avatar, color: m.color, name: m.name }))} size={30} max={8} />
          </div>
          <p className="num mt-4 text-5xl font-bold tracking-tight">{fmt(totalShown, cur)}</p>
          {cur !== "USD" && <p className="num mt-1 text-muted">{fmt(e.amountUsd, "USD")}</p>}
          {bsMoved && (
            <p className="mx-auto mt-3 max-w-sm rounded-2xl bg-sun/30 px-3 py-2 text-xs text-text">
              💱 Se anotó en <span className="num font-semibold">{fmt(e.amount, "VES")}</span> a {fmtNumber(e.fx.vesPerUsd)} Bs/$. Como el bolívar cambia, la deuda se mantiene en dólares y se paga al equivalente del día (hoy {fmtNumber(rateToday)} Bs/$).
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            {categoryLabel(e)} · {MODE_LABEL[e.split.mode]} · tasa {src === "custom" ? "propia" : RATE_META[src].short} {fmtNumber(e.fx.vesPerUsd)} Bs/$
          </p>
          {aiEnabled() && (
            <Link
              href={`/pilas?q=${encodeURIComponent(`Explícame la salida «${e.title}»: de dónde sale lo que le toca a cada quien`)}&s=${ledger.group.id.slice(0, 8)}`}
              className="btn-pop btn-pop-paper mt-4 py-1.5 pr-4 pl-2 text-sm"
            >
              <PilasMascota size={26} /> Que Pilas me la explique
            </Link>
          )}
        </div>
        <div className="space-y-5 border-t-2 border-dashed border-line-strong p-6">
          <section>
            <h2 className="display mb-2 text-sm font-bold text-muted">Puso la plata</h2>
            <ul className="space-y-2">
              {e.payers.map((p) => {
                const m = byId.get(p.memberId);
                const pm = payMethodOf(p.method);
                return (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar emoji={m?.avatar ?? "🙂"} color={m?.color ?? "#999"} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.memberId === me ? "Tú" : m?.name}</p>
                      <p className="text-xs text-muted">
                        {pm.emoji} {pm.label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num font-semibold">{fmt(p.amount, p.currency as Currency)}</p>
                      {p.currency !== "USD" && <p className="num text-xs text-muted">{fmt(p.amountUsd, "USD")}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h2 className="display mb-2 text-sm font-bold text-muted">A cada quien le tocó</h2>
            <ul className="divide-y divide-line">
              {[...e.shares]
                .sort((a, b) => b.amountUsd - a.amountUsd)
                .map((s) => {
                  const m = byId.get(s.memberId);
                  return (
                    <li key={s.id} className="flex items-center gap-3 py-2">
                      <Avatar emoji={m?.avatar ?? "🙂"} color={m?.color ?? "#9CA3AF"} size={26} />
                      <span className="flex-1 truncate">{s.memberId === me ? "Tú" : m?.name}</span>
                      <span className="num w-32 text-right font-semibold">
                        {bsToday ? fmt(Math.round(s.amountUsd * rateToday), "VES") : fmt(s.amount, cur)}
                        {bsToday && <span className="block text-[11px] font-normal text-muted">{fmt(s.amountUsd, "USD")}</span>}
                      </span>
                    </li>
                  );
                })}
            </ul>
            {(e.split.extras?.length ?? 0) > 0 && (
              <p className="mt-2 text-xs text-muted">Incluye: {e.split.extras!.map((x) => `${x.label} ${x.kind === "percent" ? `${x.value}%` : fmt(x.value, cur)}`).join(" · ")}</p>
            )}
          </section>
          {e.notes && <p className="rounded-2xl bg-card-2 p-4 text-sm">📝 {e.notes}</p>}
        </div>
      </article>

      <ShareChecklist salidaId={id} groupRate={ledger.group.rateSource as RateSourceId} rows={rows} closed={closed} />

      {payments.length > 0 && (
        <section className="card p-5">
          <h2 className="display mb-3 text-lg font-bold">Pagos anotados</h2>
          <ul className="space-y-2 text-sm">
            {payments.map((s) => {
              const f = byId.get(s.fromMember);
              const t = byId.get(s.toMember);
              return (
                <li key={s.id} className="flex items-center gap-3">
                  <span className="text-lg">{s.confirmedAt ? "✅" : "⏳"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {f?.id === me ? "Tú" : f?.name} → {t?.id === me ? "ti" : t?.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {payMethodOf(s.method).emoji} {payMethodOf(s.method).label}
                      {s.reference ? ` · ref ${s.reference}` : ""} · {s.confirmedAt ? "confirmado" : "por confirmar"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="num font-semibold">{fmt(s.amount, s.currency as Currency)}</span>
                    {proofs.get(s.id) && <ProofButton proof={proofs.get(s.id)!} label="Comprobante" compact />}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {plan && (
        <CasheaPlanCard
          groupId={id}
          meId={me}
          canMark={plan.memberId === me || (!byId.get(plan.memberId)?.userId && ledger.group.createdBy === user.id)}
          canMarkPanas={!closed && (plan.memberId === me || ledger.group.createdBy === user.id)}
          groupRate={ledger.group.rateSource as RateSourceId}
          members={ledger.members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, color: m.color }))}
          plan={{
            id: plan.id,
            expenseId: plan.expenseId,
            expenseTitle: e.title,
            memberId: plan.memberId,
            store: plan.store,
            line: plan.line,
            level: plan.level,
            initialPct: plan.initialPct,
            count: plan.installments,
            intervalDays: plan.intervalDays,
            totalUsd: plan.totalUsd,
            initialUsd: plan.initialUsd,
            purchaseDate: plan.purchaseDate,
            mode: plan.mode,
            shares: e.shares.map((s) => ({ memberId: s.memberId, usd: Math.round((s.amountUsd * plan.totalUsd) / e.amountUsd) })),
            mirror: mirrorParts,
            rows: plan.cuotas.map((i) => ({ id: i.id, n: i.n, dueDate: i.dueDate, amountUsd: i.amountUsd, paidAt: i.paidAt ? i.paidAt.toISOString() : null, paidVes: i.paidVes, paidRate: i.paidRate })),
          }}
        />
      )}

      <SalidaActions
        salidaId={id}
        title={e.title}
        closed={closed}
        canDelete={!ledger.group.createdBy || ledger.group.createdBy === user.id}
        allPaid={progress.done}
        members={people.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, color: m.color, hasAccount: !!m.userId, isMe: m.id === me, left: !!m.leftAt }))}
      />
    </div>
  );
}
