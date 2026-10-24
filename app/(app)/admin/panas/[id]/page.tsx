import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft } from "lucide-react";
import { aiUsageOf, auditLedger, fmtCost, fmtWhen, requireAdmin, userBasics } from "@/lib/admin";
import { getEverything } from "@/lib/data";
import { categoryOf } from "@/lib/constants";
import { prettyDay, ymdOf } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { personBalances } from "@/lib/people";
import { Avatar } from "@/components/ui";

export const metadata: Metadata = { title: "Ficha del pana" };

const usd = (c: number) => fmt(c, "USD");

export default async function AdminPana({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const p = await userBasics(id);
  if (!p) notFound();
  const [bundles, ai] = await Promise.all([getEverything(id), aiUsageOf(id)]);
  const people = personBalances(bundles);
  const owedToThem = people.reduce((a, x) => a + x.owedToMe, 0);
  const theyOwe = people.reduce((a, x) => a + x.iOwe, 0);
  const salidas = bundles
    .filter(({ ledger }) => ledger.expenses[0])
    .map(({ ledger, summary }) => {
      const e = ledger.expenses[0];
      return {
        id: ledger.group.id,
        memberId: ledger.me.id,
        title: e.title,
        emoji: categoryOf(e.category).emoji,
        date: ymdOf(e.spentAt),
        balance: summary.balances[ledger.me.id] ?? 0,
        waiting: ledger.settlements.filter((st) => !st.confirmedAt && (st.fromMember === ledger.me.id || st.toMember === ledger.me.id)).length,
        ok: auditLedger(ledger).ok,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const wrong = salidas.filter((s) => !s.ok).length;
  const waiting = salidas.reduce((a, s) => a + s.waiting, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
        <ArrowLeft size={16} /> Panas
      </Link>

      <div className="sticker flex items-center gap-4 bg-card p-5">
        <Avatar emoji={p.avatar} color={p.color} size={64} />
        <div className="min-w-0">
          <h1 className="display truncate text-3xl font-extrabold">{p.name}</h1>
          <p className="text-sm text-muted">
            {salidas.length} {salidas.length === 1 ? "salida" : "salidas"}
            {p.lastSeenAt && ` · entró ${fmtWhen(p.lastSeenAt)}`}
          </p>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Le deben</p>
          <p className="num display mt-1 text-2xl font-extrabold text-mint">{usd(owedToThem)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Debe</p>
          <p className="num display mt-1 text-2xl font-extrabold text-rose">{usd(theyOwe)}</p>
        </div>
      </section>

      {waiting > 0 && (
        <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm font-semibold">
          ⏳ Tiene {waiting === 1 ? "1 pago" : `${waiting} pagos`} sin confirmar (que hizo o que le hicieron)
        </p>
      )}

      <section>
        <h2 className="display mb-1 text-xl font-bold">Con cada pana</h2>
        <p className="mb-3 text-sm text-muted">Lo mismo que {p.name} ve en su inicio y en Panas.</p>
        {people.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Está a mano con todos ✓</p>
        ) : (
          <ul className="card divide-y divide-line overflow-clip">
            {people.map((x) => (
              <li key={x.userId} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar emoji={x.avatar} color={x.color} size={36} />
                  <Link href={`/admin/panas/${x.userId}`} className="min-w-0 flex-1 truncate font-semibold underline-offset-2 hover:underline">
                    {x.name}
                  </Link>
                  <div className="shrink-0 text-right text-sm">
                    {x.owedToMe > 0 && (
                      <p className="font-semibold text-mint">
                        le debe <span className="num">{usd(x.owedToMe)}</span> a {p.name}
                      </p>
                    )}
                    {x.iOwe > 0 && (
                      <p className="font-semibold text-rose">
                        {p.name} le debe <span className="num">{usd(x.iOwe)}</span>
                      </p>
                    )}
                  </div>
                </div>
                <ul className="mt-1.5 space-y-0.5 pl-12 text-xs text-muted">
                  {x.theyOweItems.map((it) => (
                    <li key={`a${it.salidaId}`}>
                      {it.emoji} {it.title}: {x.name} le debe <span className="num">{usd(it.remainingUsd)}</span>
                    </li>
                  ))}
                  {x.iOweItems.map((it) => (
                    <li key={`b${it.salidaId}`}>
                      {it.emoji} {it.title}: le debe <span className="num">{usd(it.remainingUsd)}</span> a {x.name}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="display mb-3 text-xl font-bold">
          Sus salidas{" "}
          {wrong > 0 && <span className="rounded-full bg-rose-soft px-2 py-0.5 align-middle text-xs font-bold text-rose">⚠️ {wrong} no cuadran</span>}
        </h2>
        {salidas.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Todavía no está en ninguna salida.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-clip">
            {salidas.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/salidas/${s.id}?como=${s.memberId}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card-2/60">
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {s.title} {!s.ok && "⚠️"}
                    </p>
                    <p className="text-xs text-muted first-letter:uppercase">{prettyDay(s.date)} · verla como {p.name}</p>
                  </div>
                  <p className={clsx("num shrink-0 text-right text-sm font-bold", s.balance > 1 ? "text-mint" : s.balance < -1 ? "text-rose" : s.waiting ? "text-gold" : "text-muted")}>
                    {s.balance > 1 ? `le deben ${usd(s.balance)}` : s.balance < -1 ? `debe ${usd(-s.balance)}` : s.waiting ? "⏳ por confirmar" : "a mano ✓"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex items-center gap-3 p-4">
        <span className="text-2xl">🤖</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Uso de IA</p>
          <p className="text-xs text-muted">
            {ai.calls === 0 ? "No la ha usado" : `${ai.calls} ${ai.calls === 1 ? "uso" : "usos"} en total · ${ai.last30} en los últimos 30 días`}
          </p>
        </div>
        <p className="num font-bold">{fmtCost(ai.costMicros)}</p>
      </section>
    </div>
  );
}
