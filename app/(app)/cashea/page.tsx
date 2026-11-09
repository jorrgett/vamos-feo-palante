import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getEverything } from "@/lib/data";
import { casheaDues } from "@/lib/insights";
import { planProgress } from "@/lib/cashea";
import { CasheaPlanCard, type CasheaPlanView } from "@/components/cashea-plan";
import { Money } from "@/components/display";
import { CasheaSimulator, CasheaTimeline } from "./cashea-client";

export const metadata: Metadata = { title: "Cashea" };

export default async function CasheaPage() {
  const user = await requireUser();
  const bundles = await getEverything(user.id);
  const dues = casheaDues(bundles, 120);
  const plans: { plan: CasheaPlanView; groupId: string; meId: string; members: { id: string; name: string; avatar: string; color: string }[] }[] = [];
  let pendingMine = 0;
  for (const { ledger } of bundles) {
    for (const p of ledger.cashea) {
      const expense = ledger.expenses.find((e) => e.id === p.expenseId);
      const involved = p.memberId === ledger.me.id || expense?.shares.some((s) => s.memberId === ledger.me.id);
      if (!involved) continue;
      if (p.memberId === ledger.me.id) pendingMine += planProgress(p.cuotas).pending;
      plans.push({
        groupId: ledger.group.id,
        meId: ledger.me.id,
        members: ledger.members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, color: m.color })),
        plan: {
          id: p.id,
          groupName: ledger.group.name,
          expenseId: p.expenseId,
          expenseTitle: expense?.title ?? null,
          memberId: p.memberId,
          store: p.store,
          line: p.line,
          level: p.level,
          initialPct: p.initialPct,
          count: p.installments,
          intervalDays: p.intervalDays,
          totalUsd: p.totalUsd,
          initialUsd: p.initialUsd,
          purchaseDate: p.purchaseDate,
          mode: p.mode,
          shares: (expense?.shares ?? []).map((s) => ({ memberId: s.memberId, usd: expense ? Math.round((s.amountUsd * p.totalUsd) / expense.amountUsd) : 0 })),
          rows: p.cuotas.map((i) => ({ id: i.id, n: i.n, dueDate: i.dueDate, amountUsd: i.amountUsd, paidAt: i.paidAt?.toISOString() ?? null, paidVes: i.paidVes, paidRate: i.paidRate })),
        },
      });
    }
  }
  const active = plans.filter((p) => p.plan.rows.some((r) => !r.paidAt));
  const finished = plans.filter((p) => !p.plan.rows.some((r) => !r.paidAt));
  const myPartOthers = dues.filter((d) => !d.iAmHolder).reduce((a, d) => a + d.myPartUsd, 0);

  return (
    <div className="entra space-y-8">
      <div className="relative overflow-clip rounded-[1.75rem] bg-cashea p-6 text-cashea-ink sm:p-8">
        <div className="absolute inset-y-0 right-0 w-2/3 opacity-10" style={{ background: "repeating-linear-gradient(135deg, #000 0 3px, transparent 3px 16px)" }} />
        <p className="relative text-xs font-black tracking-[0.2em] uppercase opacity-70">Cashea entre panas</p>
        <h1 className="display relative mt-1 text-4xl font-extrabold sm:text-5xl">Tus cuotas, claritas</h1>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-black/10 p-4">
            <p className="text-xs font-bold opacity-70">Te falta pagarle a Cashea</p>
            <Money usd={pendingMine} className="text-2xl font-bold" />
          </div>
          <div className="rounded-2xl bg-black/10 p-4">
            <p className="text-xs font-bold opacity-70">Tu parte de Cashea de otros</p>
            <Money usd={myPartOthers} className="text-2xl font-bold" />
          </div>
          <div className="rounded-2xl bg-black/10 p-4">
            <p className="text-xs font-bold opacity-70">Órdenes activas</p>
            <p className="num text-2xl font-bold">{active.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <h2 className="display text-xl font-bold">Próximos vencimientos</h2>
          <CasheaTimeline items={dues} />
          {active.length > 0 && <h2 className="display pt-2 text-xl font-bold">Órdenes activas</h2>}
          <div className="grid grid-cols-1 gap-5">
            {active.map((p) => (
              <CasheaPlanCard key={p.plan.id} plan={p.plan} members={p.members} groupId={p.groupId} meId={p.meId} />
            ))}
          </div>
          {finished.length > 0 && (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-muted">Órdenes pagadas ({finished.length})</summary>
              <div className="mt-4 grid grid-cols-1 gap-5">
                {finished.map((p) => (
                  <CasheaPlanCard key={p.plan.id} plan={p.plan} members={p.members} groupId={p.groupId} meId={p.meId} />
                ))}
              </div>
            </details>
          )}
        </div>
        <aside className="space-y-6">
          <CasheaSimulator />
        </aside>
      </div>
    </div>
  );
}
