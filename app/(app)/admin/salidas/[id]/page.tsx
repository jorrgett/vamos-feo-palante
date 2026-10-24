import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft } from "lucide-react";
import { auditLedger, fmtWhen, proofAiFor, requireAdmin, type AuditRow } from "@/lib/admin";
import { getLedgerAs } from "@/lib/data";
import { categoryOf, payMethodOf } from "@/lib/constants";
import { longDay, ymdOf } from "@/lib/dates";
import { fmt, type Currency } from "@/lib/money";
import type { RateSourceId } from "@/lib/rates-shared";
import { checklistRows } from "@/lib/salida-view";
import { remainingTo } from "@/lib/share-status";
import { Avatar } from "@/components/ui";
import { ProofAiLine } from "@/components/proof";
import { ShareChecklist } from "@/components/share-checklist";

export const metadata: Metadata = { title: "Revisar salida" };

const usd = (c: number) => fmt(c, "USD");

/** Qué papel tiene cada quien en la salida, visto desde su saldo. */
function role(r: AuditRow) {
  if (r.balance > 1) return { emoji: "💪", label: "le deben", tone: "text-mint" };
  if (r.balance < -1) return { emoji: "💸", label: "debe", tone: "text-rose" };
  if (r.sentPending || r.receivedPending) return { emoji: "⏳", label: "falta confirmar", tone: "text-gold" };
  return { emoji: "✓", label: "a mano", tone: "text-muted" };
}

/** Un dato corto que no se parte a la mitad en el teléfono. */
const Stat = ({ children }: { children: React.ReactNode }) => <span className="whitespace-nowrap">{children}</span>;

export default async function AdminSalida({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ como?: string }> }) {
  const admin = await requireAdmin();
  const [{ id }, { como }] = await Promise.all([params, searchParams]);
  const ledger = await getLedgerAs(id, como);
  const e = ledger?.expenses[0];
  if (!ledger || !e) notFound();

  const audit = auditLedger(ledger);
  const me = ledger.me;
  const byId = new Map(ledger.members.map((m) => [m.id, m]));
  const cat = categoryOf(e.category);
  const cur = e.currency as Currency;
  const closed = !!ledger.group.closedAt;
  const inSalida = audit.rows.filter((r) => r.share > 0 || r.put > 0 || r.sent > 0 || r.received > 0);
  const firstCreditor = inSalida.find((r) => r.balance > 1) ?? inSalida.find((r) => r.put > 0);
  const firstDebtor = inSalida.find((r) => r.balance < -1) ?? inSalida.find((r) => r.put === 0 && r.share > 0);
  const payments = ledger.settlements.filter((s) => s.expenseId === e.id);
  const unconfirmed = payments.filter((s) => !s.confirmedAt).length;
  const proofs = await proofAiFor(payments.map((s) => s.id));
  // «¿Quién ya pagó?» tal cual lo ve esa persona (sin botones ni fotos de comprobantes).
  const rows = checklistRows(ledger).map((r) => ({ ...r, proof: null }));

  // Lo que esa persona ve que le deben y que debe en esta salida, pana por pana.
  const eLike = {
    payers: e.payers.map((p) => ({ memberId: p.memberId, amountUsd: p.amountUsd })),
    shares: e.shares.map((s) => ({ memberId: s.memberId, amountUsd: s.amountUsd })),
  };
  const others = ledger.members
    .filter((m) => m.id !== me.id)
    .map((m) => ({ m, theyOwe: remainingTo(eLike, payments, m.id, me.id), iOwe: remainingTo(eLike, payments, me.id, m.id) }))
    .filter((x) => x.theyOwe || x.iOwe);
  const waiting = payments.filter((s) => !s.confirmedAt && (s.fromMember === me.id || s.toMember === me.id));
  const owedToMe = others.reduce((a, x) => a + x.theyOwe, 0);
  const iOwe = others.reduce((a, x) => a + x.iOwe, 0);
  const adminIsIn = ledger.members.some((m) => m.userId === admin.id && !m.leftAt);
  const href = (memberId: string) => `/admin/salidas/${id}?como=${memberId}`;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/admin/salidas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
        <ArrowLeft size={16} /> Todas las salidas
      </Link>

      <header className="card flex items-center gap-3 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-ink bg-card text-3xl">{cat.emoji}</span>
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-2xl font-extrabold">{e.title}</h1>
          <p className="text-xs text-muted first-letter:uppercase">
            {longDay(ymdOf(e.spentAt))}
            {closed && " · 🔒 cerrada"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-lg font-bold">{fmt(e.amount, cur)}</p>
          {cur !== "USD" && <p className="num text-xs text-muted">{usd(e.amountUsd)}</p>}
        </div>
      </header>

      {/* Cuadre */}
      <section className="card overflow-clip">
        <div className={clsx("p-5", audit.ok ? "bg-mint-soft" : "bg-rose-soft")}>
          <p className="display text-xl font-extrabold">{audit.ok ? "✅ Cuadra" : "⚠️ Hay que revisar"}</p>
          <p className="mt-1 text-sm text-muted">
            {audit.ok
              ? audit.settled
                ? unconfirmed
                  ? `Los números dan y todo está pagado, pero falta confirmar ${unconfirmed === 1 ? "1 pago" : `${unconfirmed} pagos`}.`
                  : "Todo pagado y confirmado. Los números dan."
                : "Los números dan; solo faltan pagos."
              : "Algo no da. Esto es lo que encontré:"}
          </p>
          {!audit.ok && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-rose">
              {audit.issues.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
        <ul className="divide-y divide-line">
          {inSalida.map((r) => {
            const ro = role(r);
            return (
              <li key={r.memberId} className="flex items-start gap-3 px-4 py-3">
                <Avatar emoji={r.avatar} color={r.color} size={34} ghost={!r.userId} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {r.userId ? (
                      <Link href={`/admin/panas/${r.userId}`} className="underline-offset-2 hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      r.name
                    )}
                  </p>
                  <p className="flex flex-wrap gap-x-2 text-xs leading-relaxed text-muted">
                    <Stat>le tocó {usd(r.share)}</Stat>
                    <Stat>puso {usd(r.put)}</Stat>
                    {r.sent > 0 && (
                      <Stat>
                        pagó {usd(r.sent)}
                        {r.sentPending ? ` (⏳ ${usd(r.sentPending)} sin confirmar)` : ""}
                      </Stat>
                    )}
                    {r.received > 0 && (
                      <Stat>
                        recibió {usd(r.received)}
                        {r.receivedPending ? ` (⏳ ${usd(r.receivedPending)} sin confirmar)` : ""}
                      </Stat>
                    )}
                  </p>
                </div>
                <p className={clsx("num shrink-0 text-right text-sm font-bold", ro.tone)}>
                  {ro.emoji} {ro.label}
                  {Math.abs(r.balance) > 1 && <span className="block">{usd(Math.abs(r.balance))}</span>}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="flex flex-wrap gap-x-2 border-t border-line px-4 py-2.5 text-xs text-muted">
          <Stat>Cuenta {usd(audit.total)}</Stat>
          <Stat>· partes {usd(audit.rows.reduce((a, r) => a + r.share, 0))}</Stat>
          <Stat>· puesto {usd(audit.rows.reduce((a, r) => a + r.put, 0))}</Stat>
          <Stat>· saldos {usd(audit.rows.reduce((a, r) => a + r.balance, 0))}</Stat>
        </p>
      </section>

      {/* Ver como */}
      <section className="space-y-3">
        <div>
          <h2 className="display text-xl font-bold">Ver como</h2>
          <p className="text-sm text-muted">Mira la salida como la ve cada quien: el que cobra o el que debe.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={firstCreditor ? href(firstCreditor.memberId) : "#"}
            aria-disabled={!firstCreditor}
            className={clsx("rounded-2xl border-2 p-3 text-sm font-semibold", firstCreditor && me.id === firstCreditor.memberId ? "border-ink bg-sun text-sun-ink" : "border-line", !firstCreditor && "pointer-events-none opacity-50")}
          >
            💪 Como si me debieran
            <span className="block truncate text-xs font-normal opacity-75">{firstCreditor ? `vista de ${firstCreditor.name}` : "nadie cobra"}</span>
          </Link>
          <Link
            href={firstDebtor ? href(firstDebtor.memberId) : "#"}
            aria-disabled={!firstDebtor}
            className={clsx("rounded-2xl border-2 p-3 text-sm font-semibold", firstDebtor && me.id === firstDebtor.memberId ? "border-ink bg-sun text-sun-ink" : "border-line", !firstDebtor && "pointer-events-none opacity-50")}
          >
            💸 Como si yo debiera
            <span className="block truncate text-xs font-normal opacity-75">{firstDebtor ? `vista de ${firstDebtor.name}` : "nadie debe"}</span>
          </Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {inSalida.map((r) => {
            const ro = role(r);
            return (
              <Link
                key={r.memberId}
                href={href(r.memberId)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full border-2 py-1 pr-3 pl-1 text-sm font-semibold transition-colors",
                  r.memberId === me.id ? "border-ink bg-card" : "border-line text-muted hover:text-text",
                )}
              >
                <Avatar emoji={r.avatar} color={r.color} size={24} />
                {r.name}
                <span className="text-xs font-normal">{ro.emoji}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="sticker bg-sun p-4 text-sun-ink">
        <p className="text-sm font-semibold opacity-75">Así la ve</p>
        <p className="display flex items-center gap-2 text-2xl font-extrabold">
          <Avatar emoji={me.avatar} color={me.color} size={32} /> {me.name}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border-2 border-ink bg-card p-2.5 text-text">
            <p className="text-xs text-muted">Le deben</p>
            <p className="num text-lg font-bold text-mint">{usd(owedToMe)}</p>
          </div>
          <div className="rounded-xl border-2 border-ink bg-card p-2.5 text-text">
            <p className="text-xs text-muted">Debe</p>
            <p className="num text-lg font-bold text-rose">{usd(iOwe)}</p>
          </div>
        </div>
        {others.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm">
            {others.map(({ m, theyOwe, iOwe }) => (
              <li key={m.id}>
                {theyOwe > 0 && (
                  <>
                    {m.name} le debe <b className="num">{usd(theyOwe)}</b>
                  </>
                )}
                {iOwe > 0 && (
                  <>
                    Le debe <b className="num">{usd(iOwe)}</b> a {m.name}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {waiting.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm">
            {waiting.map((s) => (
              <li key={s.id}>
                ⏳{" "}
                {s.fromMember === me.id ? (
                  <>
                    Le pagó <b className="num">{usd(s.amountUsd)}</b> a {byId.get(s.toMember)?.name}: falta que lo confirme
                  </>
                ) : (
                  <>
                    {byId.get(s.fromMember)?.name} dice que le pagó <b className="num">{usd(s.amountUsd)}</b>: le toca confirmarlo
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {owedToMe === 0 && iOwe === 0 && waiting.length === 0 && <p className="mt-2 text-sm">Está a mano en esta salida ✓</p>}
        {!me.userId && <p className="mt-2 text-xs opacity-75">👻 No tiene cuenta: así se vería si la tuviera.</p>}
      </section>

      <ShareChecklist salidaId={id} groupRate={ledger.group.rateSource as RateSourceId} rows={rows} closed={closed} readOnly />

      <section className="card p-5">
        <h2 className="display mb-3 text-lg font-bold">Pagos anotados</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">Nadie ha anotado pagos todavía.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {payments.map((s) => {
              const f = byId.get(s.fromMember);
              const t = byId.get(s.toMember);
              const pm = payMethodOf(s.method);
              const ai = proofs.get(s.id);
              return (
                <li key={s.id} className="flex items-start gap-3">
                  <span className="text-lg">{s.confirmedAt ? "✅" : "⏳"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {f?.name ?? "?"} → {t?.name ?? "?"}
                    </span>
                    <span className="block text-xs text-muted">
                      {pm.emoji} {pm.label}
                      {s.reference ? ` · ref ${s.reference}` : ""} · {fmtWhen(s.paidAt)} · {s.confirmedAt ? "confirmado" : "por confirmar"}
                    </span>
                    {proofs.has(s.id) && (
                      <span className="mt-1 block text-xs">
                        📎 Con comprobante
                        {ai && <ProofAiLine ai={ai} className="mt-1" />}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold">{fmt(s.amount, s.currency as Currency)}</span>
                    {s.currency !== "USD" && <span className="num block text-xs text-muted">{usd(s.amountUsd)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {adminIsIn && (
        <Link href={`/salidas/${id}`} className="block text-center text-sm font-semibold text-muted underline-offset-2 hover:text-text hover:underline">
          Abrir la salida como tú (con botones)
        </Link>
      )}
    </div>
  );
}
