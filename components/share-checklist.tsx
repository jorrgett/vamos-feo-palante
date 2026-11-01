"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellRing, Check, Hourglass, Undo2, X } from "lucide-react";
import {
  answerPayment,
  markSharePaid,
  remindPending,
  unmarkSharePaid,
} from "@/app/actions/salidas";
import { dueLabel } from "@/lib/cashea";
import { fmt, fmtNumber } from "@/lib/money";
import { RATE_META, vesPerUsd, type RateSourceId } from "@/lib/rates-shared";
import { useDisplay, Money } from "./display";
import { CuotasSheet, PAID_METHODS, type CuotaPart } from "./cuotas-sheet";
import { ProofAiLine, ProofButton, type ProofView } from "./proof";
import { Avatar, Button, Segmented, Sheet, useToast } from "./ui";

export type ChecklistRow = {
  memberId: string;
  userId: string | null;
  name: string;
  avatar: string;
  color: string;
  isMe: boolean;
  shareUsd: number;
  putUsd: number;
  owesUsd: number;
  paidUsd: number;
  pendingUsd: number;
  status: "puso" | "pagado" | "por-confirmar" | "parcial" | "falta";
  /** A quién le debe (nombres de los que pusieron la plata). */
  owesTo: string;
  /** userId del que cobra (el primero), para el botón «Pagar mi parte». */
  creditorUserId: string | null;
  /** ¿Soy yo quien le cobra a esta persona? */
  iCollect: boolean;
  /** Pagos por confirmar de esta persona hacia mí. */
  pendingIdsForMe: string[];
  /** Captura del pago por confirmar (con lo que leyó la IA). */
  proof?: ProofView | null;
  /** ¿Puedo marcar sus pagos? (cobro yo o yo anoté la salida). */
  canMark?: boolean;
  /** Cashea en espejo: todas sus cuotas y lo que falta de cada una. */
  cuotaParts?: CuotaPart[] | null;
  /** Si se paga por cuotas (Cashea en espejo): la próxima cuota de esta persona. */
  cuota?: { n: number; count: number; dueDate: string; daysLeft: number; payUsd: number; overdueUsd: number; holderUserId: string | null } | null;
};

const METHODS = PAID_METHODS;

export function ShareChecklist({
  salidaId,
  groupRate,
  rows,
  closed,
  readOnly = false,
}: {
  salidaId: string;
  groupRate: RateSourceId;
  rows: ChecklistRow[];
  closed: boolean;
  /** Solo mirar (el administrador viendo como otra persona): sin botones. */
  readOnly?: boolean;
}) {
  const { rates } = useDisplay();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState<ChecklistRow | null>(null);
  const [cuotasOf, setCuotasOf] = useState<ChecklistRow | null>(null);
  const [method, setMethod] =
    useState<(typeof METHODS)[number]["id"]>("pago_movil");
  const [cur, setCur] = useState<"USD" | "VES">("VES");
  const rate = vesPerUsd(rates, groupRate);

  const debtors = rows.filter((r) => r.owesUsd > 0);
  const putters = rows.filter((r) => r.status === "puso" && r.putUsd > 0);
  const paid = debtors.filter((r) => r.status === "pagado").length;
  const waiting = debtors.filter((r) => r.status === "por-confirmar").length;
  const missing = debtors.filter(
    (r) => r.status === "falta" || r.status === "parcial",
  );
  const pct = debtors.length ? paid / debtors.length : 1;
  const pendingUsd = debtors.reduce(
    (a, r) => a + Math.max(0, r.owesUsd - r.paidUsd),
    0,
  );
  const iCollectSomeone = debtors.some((r) => r.iCollect);

  const remind = (memberId?: string) =>
    start(async () => {
      const r = await remindPending(salidaId, memberId);
      if (!r.ok) return toast(r.error, "error");
      toast(
        r.sent
          ? `Recordatorio enviado a ${r.sent} ${r.sent === 1 ? "pana" : "panas"} 🔔`
          : "Nadie tiene pendiente esta salida 🎉",
      );
    });

  const answer = (ids: string[], ok: boolean, name: string) =>
    start(async () => {
      const r = await answerPayment(ids, ok);
      toast(
        r.ok
          ? ok
            ? `Listo, confirmaste el pago de ${name} ✅`
            : `Le avisamos a ${name} que no te llegó`
          : r.error,
        r.ok ? (ok ? "ok" : "info") : "error",
      );
      router.refresh();
    });

  return (
    <section className="card overflow-clip">
      <div className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="display text-xl font-bold">¿Quién ya pagó?</h2>
            <p className="text-sm text-muted">
              {debtors.length === 0 ? (
                "Aquí nadie le debe a nadie."
              ) : pct === 1 ? (
                "¡Todos pagaron! 🎉"
              ) : pendingUsd === 0 ? (
                `Todos pagaron · falta confirmar ${waiting === 1 ? "1 pago" : `${waiting} pagos`} ⏳`
              ) : (
                <>
                  Faltan{" "}
                  <Money usd={pendingUsd} className="font-semibold text-text" />{" "}
                  por pagar
                  {waiting > 0 && ` · ${waiting} por confirmar`}
                </>
              )}
            </p>
          </div>
          {debtors.length > 0 && (
            <p className="display text-3xl font-extrabold">
              {paid}
              <span className="text-lg text-muted">/{debtors.length}</span>
            </p>
          )}
        </div>
        {debtors.length > 0 && (
          <div className="mt-3 h-3 overflow-clip rounded-full border-2 border-ink bg-card-2">
            <motion.div
              className="h-full bg-mint"
              initial={{ width: 0 }}
              animate={{ width: `${pct * 100}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        )}
      </div>

      <ul className="divide-y divide-line border-t border-line">
        {putters.map((r) => (
          <li key={r.memberId} className="flex items-center gap-3 px-5 py-3">
            <Avatar emoji={r.avatar} color={r.color} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.isMe ? "Tú" : r.name}</p>
              <p className="text-xs text-muted">
                {r.isMe ? "Pusiste" : "Puso"} <Money usd={r.putUsd} /> ·{" "}
                {r.isMe ? "tu" : "su"} parte <Money usd={r.shareUsd} />
              </p>
            </div>
            <span className="rounded-full bg-sun px-2.5 py-1 text-xs font-bold text-sun-ink">
              Puso la plata 💪
            </span>
          </li>
        ))}
        {debtors.map((r) => {
          const rest = Math.max(0, r.owesUsd - r.paidUsd);
          return (
            <li
              key={r.memberId}
              className={clsx(
                "flex flex-wrap items-center gap-3 px-5 py-3",
                r.status === "pagado" && "bg-mint-soft/60",
                r.status === "por-confirmar" && "bg-sun/15",
              )}
            >
              <Avatar emoji={r.avatar} color={r.color} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {r.isMe ? "Tú" : r.name}
                  {r.status === "pagado" && (
                    <Check
                      size={16}
                      className="ml-1 inline text-mint"
                      strokeWidth={3}
                    />
                  )}
                  {r.status === "por-confirmar" && (
                    <Hourglass
                      size={14}
                      className="ml-1 inline text-mango-ink"
                    />
                  )}
                </p>
                <p className="text-xs text-muted">
                  {r.status === "pagado" ? (
                    <>
                      {r.isMe ? "Pagaste" : "Pagó"} <Money usd={r.paidUsd} /> a{" "}
                      {r.owesTo}
                    </>
                  ) : r.status === "por-confirmar" ? (
                    <>
                      {r.isMe ? "Pagaste" : "Dice que pagó"}{" "}
                      <Money usd={r.paidUsd} /> ·{" "}
                      {r.iCollect
                        ? "confírmalo 👉"
                        : `falta que ${r.owesTo} confirme`}
                    </>
                  ) : r.cuota ? (
                    <>
                      <span className={clsx("font-semibold", r.cuota.daysLeft < 0 ? "text-rose" : "text-text")}>
                        {r.cuota.n === 0 ? "Inicial" : `Cuota ${r.cuota.n}/${r.cuota.count}`}:{" "}
                        <Money usd={r.cuota.payUsd} /> · {dueLabel(r.cuota.daysLeft)}
                      </span>
                      <span className="block">
                        En total {r.isMe ? "le debes" : "le debe"} <Money usd={rest} /> a {r.owesTo}, por cuotas de Cashea
                        {r.pendingUsd > 0 && (
                          <>
                            {" "}
                            · ⏳ <Money usd={r.pendingUsd} /> por confirmar
                          </>
                        )}
                      </span>
                    </>
                  ) : r.status === "parcial" ? (
                    <>
                      {r.isMe ? "Abonaste" : "Abonó"} <Money usd={r.paidUsd} />{" "}
                      · falta <Money usd={rest} />
                    </>
                  ) : (
                    <>
                      {r.isMe ? "Le debes" : "Le debe"}{" "}
                      <Money usd={r.owesUsd} /> a {r.owesTo} ·{" "}
                      <span className="num">
                        {fmt(Math.round(rest * rate), "VES")}
                      </span>
                    </>
                  )}
                </p>
              </div>
              {r.status === "por-confirmar" && r.proof && (
                <div className="basis-full space-y-2 pl-[50px]">
                  <ProofAiLine ai={r.proof.ai} />
                  <ProofButton
                    proof={r.proof}
                    label="Ver la captura del pago"
                    compact
                  />
                </div>
              )}
              {!readOnly && (
                <div className="flex basis-full items-center justify-end gap-1.5 empty:hidden sm:basis-auto">
                  {r.status === "por-confirmar" &&
                    r.iCollect &&
                    r.pendingIdsForMe.length > 0 && (
                      <>
                        <Button
                          size="sm"
                          variant="soft"
                          disabled={pending}
                          onClick={() =>
                            answer(r.pendingIdsForMe, false, r.name)
                          }
                        >
                          <X size={14} /> No me llegó
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            answer(r.pendingIdsForMe, true, r.name)
                          }
                        >
                          <Check size={14} /> Confirmar
                        </Button>
                      </>
                    )}
                  {r.status === "pagado" && r.canMark && !closed && r.cuotaParts && (
                    <button
                      disabled={pending}
                      onClick={() => setCuotasOf(r)}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-text"
                    >
                      <Undo2 size={13} /> Cambiar cuotas
                    </button>
                  )}
                  {r.status === "pagado" && r.canMark && !closed && !r.cuotaParts && (
                    <button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const x = await unmarkSharePaid(salidaId, r.memberId);
                          toast(
                            x.ok
                              ? `${r.name} vuelve a estar pendiente`
                              : x.error,
                            x.ok ? "info" : "error",
                          );
                          router.refresh();
                        })
                      }
                      className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-text"
                    >
                      <Undo2 size={13} /> Deshacer
                    </button>
                  )}
                  {(r.status === "falta" || r.status === "parcial") &&
                    !closed && (
                      <>
                        {r.isMe && r.cuota ? (
                          <>
                            <Link
                              href={`/pagar?a=${r.cuota.holderUserId ?? r.creditorUserId ?? ""}&s=${salidaId}&todo=1`}
                              className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-text"
                            >
                              Pagar todo
                            </Link>
                            <Link
                              href={`/pagar?a=${r.cuota.holderUserId ?? r.creditorUserId ?? ""}&s=${salidaId}`}
                              className="btn-pop h-9 px-3.5 text-sm"
                            >
                              Pagar {r.cuota.n === 0 ? "inicial" : "cuota"}
                            </Link>
                          </>
                        ) : r.isMe ? (
                          <Link
                            href={`/pagar?a=${r.creditorUserId ?? ""}&s=${salidaId}`}
                            className="btn-pop h-9 px-3.5 text-sm"
                          >
                            Pagar mi parte
                          </Link>
                        ) : r.canMark ? (
                          <>
                            {r.userId && (
                              <button
                                disabled={pending}
                                onClick={() => remind(r.memberId)}
                                className="grid size-9 place-items-center rounded-full border-2 border-line-strong text-muted hover:border-ink hover:text-text"
                                aria-label={`Recordarle a ${r.name}`}
                                title="Recordarle"
                              >
                                <BellRing size={15} />
                              </button>
                            )}
                            {r.cuotaParts ? (
                              <Button size="sm" onClick={() => setCuotasOf(r)} disabled={pending}>
                                Marcar cuotas
                              </Button>
                            ) : (
                              <Button size="sm" onClick={() => setPaying(r)} disabled={pending}>
                                {r.iCollect ? "Ya me pagó" : "Ya pagó"}
                              </Button>
                            )}
                          </>
                        ) : null}
                      </>
                    )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {iCollectSomeone && missing.length > 1 && !closed && !readOnly && (
        <div className="border-t border-line p-4">
          <Button
            variant="soft"
            className="w-full"
            loading={pending}
            onClick={() => remind()}
          >
            <BellRing size={16} /> Recordarle a los {missing.length} que faltan
          </Button>
        </div>
      )}

      <Sheet
        open={!!paying}
        onClose={() => setPaying(null)}
        title={paying ? (paying.iCollect ? `${paying.name} te pagó su parte` : `${paying.name} ya pagó su parte`) : ""}
      >
        {paying && (
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-ink bg-sun p-4 text-center text-sun-ink">
              <p className="num text-3xl font-bold">
                {fmt(paying.owesUsd - paying.paidUsd, "USD")}
              </p>
              <p className="num text-sm opacity-75">
                {fmt(
                  Math.round((paying.owesUsd - paying.paidUsd) * rate),
                  "VES",
                )}{" "}
                a {RATE_META[groupRate].short} {fmtNumber(rate)}
              </p>
            </div>
            <div>
              <p className="label">¿Cómo pagó?</p>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMethod(m.id);
                      setCur(m.cur === "VES" ? "VES" : "USD");
                    }}
                    className={clsx(
                      "rounded-2xl border-2 px-3 py-2.5 text-sm font-semibold",
                      method === m.id
                        ? "border-ink bg-sun text-sun-ink"
                        : "border-line",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Se anota en</p>
              <Segmented
                name="paid-cur"
                value={cur}
                onChange={setCur}
                options={[
                  { value: "VES", label: "Bolívares" },
                  { value: "USD", label: "Dólares" },
                ]}
              />
            </div>
            <Button
              size="lg"
              className="w-full"
              loading={pending}
              onClick={() => {
                const r = paying;
                setPaying(null);
                start(async () => {
                  const x = await markSharePaid(
                    salidaId,
                    r.memberId,
                    method,
                    cur,
                  );
                  toast(
                    x.ok ? `¡Listo! ${r.name} quedó al día ✅` : x.error,
                    x.ok ? "ok" : "error",
                  );
                  router.refresh();
                });
              }}
            >
              <Check size={18} /> {paying.iCollect ? "Sí, ya me pagó" : "Sí, ya pagó"}
            </Button>
          </div>
        )}
      </Sheet>
      {cuotasOf?.cuotaParts && (
        <CuotasSheet
          key={cuotasOf.memberId}
          salidaId={salidaId}
          memberId={cuotasOf.memberId}
          name={cuotasOf.name}
          parts={cuotasOf.cuotaParts}
          groupRate={groupRate}
          onClose={() => setCuotasOf(null)}
        />
      )}
    </section>
  );
}
