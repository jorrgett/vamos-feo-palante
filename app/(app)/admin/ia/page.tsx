import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { AI_DAILY_LIMIT, AI_MODEL, aiEnabled } from "@/lib/ai";
import { aiUsageOverview, fmtCost, fmtWhen, requireAdmin } from "@/lib/admin";
import { Avatar } from "@/components/ui";
import { AdminHeader } from "../admin-header";

export const metadata: Metadata = { title: "Consumo de IA" };

const TASK = { factura: "🧾 Factura", comprobante: "📎 Comprobante" } as Record<string, string>;
const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("es-VE", { maximumFractionDigits: 1 })} mil` : String(n));

export default async function AdminIa() {
  await requireAdmin();
  const { periods, byUser, recent } = await aiUsageOverview();
  const all = periods[periods.length - 1].t;
  const on = aiEnabled();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminHeader subtitle="Cuánto se ha gastado en IA, quién la usa y si está fallando." />

      <section className={clsx("sticker p-5", on ? "bg-sun text-sun-ink" : "bg-card-2")}>
        <p className="text-sm font-semibold opacity-75">{on ? "IA activa" : "IA apagada"}</p>
        <p className="display mt-1 text-2xl font-extrabold break-all">{AI_MODEL}</p>
        <p className="mt-2 text-sm opacity-80">
          Límite: {AI_DAILY_LIMIT} usos por persona al día
          {all.calls > 0 && ` · promedio ${fmtCost(Math.round(all.costMicros / all.calls))} por uso`}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {periods.map(({ label, t }) => (
          <div key={label} className="card p-4">
            <p className="text-xs font-semibold text-muted">{label}</p>
            <p className="num display mt-1 text-2xl font-extrabold">{fmtCost(t.costMicros)}</p>
            <p className="mt-1 text-xs text-muted">
              {t.calls === 1 ? "1 uso" : `${t.calls} usos`}
              {t.calls - t.ok > 0 && <span className="font-semibold text-rose"> · {t.calls - t.ok} fallaron</span>}
            </p>
            {t.calls > 0 && (
              <p className="mt-0.5 text-[11px] text-faint">
                {tokens(t.inputTokens)} tokens leídos · {tokens(t.outputTokens)} escritos
              </p>
            )}
          </div>
        ))}
      </section>

      <section>
        <h2 className="display mb-3 text-xl font-bold">
          Por persona <span className="chip align-middle">{byUser.length}</span>
        </h2>
        {byUser.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Nadie ha usado la IA todavía. Cuando alguien escanee una factura o suba un comprobante, sale aquí.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-clip">
            {byUser.map((u) => {
              const row = (
                <>
                  <Avatar emoji={u.avatar} color={u.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{u.name}</p>
                    <p className="text-xs text-muted">
                      {u.facturas > 0 && `🧾 ${u.facturas} ${u.facturas === 1 ? "factura" : "facturas"}`}
                      {u.facturas > 0 && u.comprobantes > 0 && " · "}
                      {u.comprobantes > 0 && `📎 ${u.comprobantes} ${u.comprobantes === 1 ? "comprobante" : "comprobantes"}`}
                      {u.fallos > 0 && <span className="font-semibold text-rose"> · {u.fallos} fallaron</span>}
                    </p>
                    <p className="text-[11px] text-faint">Último uso: {fmtWhen(u.last)}</p>
                  </div>
                  <p className="num font-bold">{fmtCost(u.costMicros)}</p>
                </>
              );
              return (
                <li key={u.userId ?? "anon"}>
                  {u.userId ? (
                    <Link href={`/admin/panas/${u.userId}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card-2/60">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="display mb-3 text-xl font-bold">Últimos usos</h2>
          <ul className="card divide-y divide-line overflow-clip text-sm">
            {recent.map((r) => (
              <li key={r.id} className={clsx("px-4 py-3", !r.ok && "bg-rose-soft/40")}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-semibold">
                    {r.ok ? "✅" : "⚠️"} {TASK[r.task] ?? r.task} · {r.name}
                  </p>
                  <p className="num shrink-0 font-semibold">{fmtCost(r.costMicros)}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {fmtWhen(r.at)} · {(r.ms / 1000).toLocaleString("es-VE", { maximumFractionDigits: 1 })} s
                  {r.inputTokens + r.outputTokens > 0 && ` · ${tokens(r.inputTokens)} + ${tokens(r.outputTokens)} tokens`}
                  {r.model !== AI_MODEL && ` · ${r.model}`}
                </p>
                {r.error && <p className="mt-1 text-xs font-semibold break-words text-rose">{r.error}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-muted">
        El costo es un estimado con el precio de lista de Anthropic. Lo que cobran de verdad lo ves en console.anthropic.com.
      </p>
    </div>
  );
}
