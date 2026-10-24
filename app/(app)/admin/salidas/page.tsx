import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { allSalidas, requireAdmin, type AdminSalida } from "@/lib/admin";
import { prettyDay } from "@/lib/dates";
import { fmt, type Currency } from "@/lib/money";
import { AvatarStack } from "@/components/ui";
import { AdminHeader } from "../admin-header";

export const metadata: Metadata = { title: "Todas las salidas" };

const FILTERS = [
  { id: "todas", label: "Todas", test: () => true },
  { id: "revisar", label: "⚠️ Revisar", test: (s: AdminSalida) => !s.ok },
  { id: "pendientes", label: "⏳ Pendientes", test: (s: AdminSalida) => !s.settled || s.pendingConfirm > 0 },
  { id: "saldadas", label: "✅ Saldadas", test: (s: AdminSalida) => s.settled && s.pendingConfirm === 0 },
] as const;

export default async function AdminSalidas({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requireAdmin();
  const { ver } = await searchParams;
  const salidas = await allSalidas();
  const filter = FILTERS.find((f) => f.id === ver) ?? FILTERS[0];
  const shown = salidas.filter(filter.test);
  const toCheck = salidas.filter((s) => !s.ok).length;
  const pendingUsd = salidas.reduce((a, s) => a + s.pendingUsd, 0);
  const pendingConfirm = salidas.reduce((a, s) => a + s.pendingConfirm, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminHeader subtitle="Las salidas de todos. Revisa que cada una cuadre y mírala como la ve cada quien." />

      <section className={clsx("sticker p-5", toCheck ? "bg-gold-soft" : "bg-mint-soft")}>
        <p className="display text-2xl font-extrabold">{toCheck ? `⚠️ ${toCheck} ${toCheck === 1 ? "salida no cuadra" : "salidas no cuadran"}` : "✅ Todas cuadran"}</p>
        <p className="mt-1 text-sm text-muted">
          {salidas.length} {salidas.length === 1 ? "salida" : "salidas"} · {pendingUsd > 0 ? `faltan ${fmt(pendingUsd, "USD")} por pagar` : "nada por pagar"}
          {pendingConfirm > 0 && ` · ${pendingConfirm} ${pendingConfirm === 1 ? "pago" : "pagos"} por confirmar`}
        </p>
      </section>

      <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar salidas">
        {FILTERS.map((f) => {
          const n = salidas.filter(f.test).length;
          return (
            <Link
              key={f.id}
              href={f.id === "todas" ? "/admin/salidas" : `/admin/salidas?ver=${f.id}`}
              className={clsx(
                "shrink-0 rounded-full border-2 px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors",
                f.id === filter.id ? "border-ink bg-card text-text" : "border-line text-muted hover:text-text",
              )}
            >
              {f.label} <span className="opacity-60">{n}</span>
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <p className="card p-5 text-sm text-muted">No hay salidas aquí.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/salidas/${s.id}`} className="card block p-4 transition-colors hover:bg-card-2/60">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-ink bg-card text-2xl">{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="text-xs text-muted first-letter:uppercase">
                      {prettyDay(s.date)}
                      {s.createdBy && ` · la anotó ${s.createdBy}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num font-bold">{fmt(s.amount, s.currency as Currency)}</p>
                    {s.currency !== "USD" && <p className="num text-xs text-muted">{fmt(s.totalUsd, "USD")}</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <AvatarStack people={s.people.map((p) => ({ emoji: p.avatar, color: p.color, name: p.name }))} size={24} max={6} />
                  <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", s.ok ? "bg-mint-soft text-mint" : "bg-rose-soft text-rose")}>
                    {s.ok ? "✅ Cuadra" : `⚠️ Revisar (${s.issues.length})`}
                  </span>
                  {(!s.settled || s.pendingConfirm === 0) && (
                    <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", s.settled ? "bg-mint-soft text-mint" : "bg-card-2 text-muted")}>
                      {s.settled ? "Saldada" : `Faltan ${fmt(s.pendingUsd, "USD")}`}
                    </span>
                  )}
                  {s.debtors > 0 && <span className="rounded-full bg-card-2 px-2 py-0.5 text-xs font-semibold text-muted">{s.paid}/{s.debtors} pagaron</span>}
                  {s.pendingConfirm > 0 && (
                    <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-bold text-gold">
                      ⏳ {s.settled ? "Todo pagado, " : ""}
                      {s.pendingConfirm} por confirmar
                    </span>
                  )}
                  {s.closed && <span className="rounded-full bg-card-2 px-2 py-0.5 text-xs font-semibold text-muted">🔒 Cerrada</span>}
                </div>
                {!s.ok && <p className="mt-2 text-xs font-semibold text-rose">{s.issues[0]}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
