"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, Check, MessageCircle, Send } from "lucide-react";
import { answerPayment, markPersonPaid, markSharePaid, remindPending, remindPerson, saveSalida } from "@/app/actions/salidas";
import { sendDirect } from "@/app/actions/notifications";
import { payMethodOf } from "@/lib/constants";
import type { EstadoTarjeta, PersonaVista, Tarjeta } from "@/lib/pilas/tipos";
import { Money } from "@/components/display";
import { Avatar, Button, useToast } from "@/components/ui";
import { Confeti } from "@/components/confeti";
import { VisualBalance, VisualCuotas, VisualGastos, VisualSalida, VisualTasas } from "./visuales";

type Hecho = (estado: EstadoTarjeta, nota: string) => void;

/** Una tarjeta de Pilas: nada pasa hasta que la persona toca el botón (y ahí se usa la misma acción de la app). */
export function TarjetaPilas({ tarjeta, estado, onHecho }: { tarjeta: Tarjeta; estado?: EstadoTarjeta; onHecho: Hecho }) {
  if (tarjeta.tipo === "balance") return <VisualBalance t={tarjeta} />;
  if (tarjeta.tipo === "salida_vista") return <VisualSalida t={tarjeta} />;
  if (tarjeta.tipo === "gastos") return <VisualGastos t={tarjeta} />;
  if (tarjeta.tipo === "cuotas") return <VisualCuotas t={tarjeta} />;
  if (tarjeta.tipo === "tasas") return <VisualTasas t={tarjeta} />;
  if (tarjeta.tipo === "ir")
    return (
      <Link href={tarjeta.href} className="btn-pop btn-pop-paper w-fit px-4 py-2.5 text-sm">
        <span aria-hidden>{tarjeta.emoji}</span> {tarjeta.texto} <ArrowRight size={16} />
      </Link>
    );
  return <Accion tarjeta={tarjeta} estado={estado} onHecho={onHecho} />;
}

/** Tarjeta con botón: cuando sale bien, celebra con papelitos. */
function Accion({ tarjeta, estado, onHecho }: { tarjeta: Tarjeta; estado?: EstadoTarjeta; onHecho: Hecho }) {
  const [fiesta, setFiesta] = useState(false);
  const listo: Hecho = (e, nota) => {
    if (e.estado === "hecho") setFiesta(true);
    onHecho(e, nota);
  };
  return (
    <div className="sticker relative w-full max-w-md bg-card p-4">
      {fiesta && <Confeti />}
      {tarjeta.tipo === "salida" && <Salida t={tarjeta} estado={estado} onHecho={listo} />}
      {tarjeta.tipo === "recordar" && <Recordar t={tarjeta} estado={estado} onHecho={listo} />}
      {tarjeta.tipo === "mensaje" && <Mensaje t={tarjeta} estado={estado} onHecho={listo} />}
      {tarjeta.tipo === "pagado" && <Pagado t={tarjeta} estado={estado} onHecho={listo} />}
      {tarjeta.tipo === "confirmar" && <Confirmar t={tarjeta} estado={estado} onHecho={listo} />}
    </div>
  );
}

type P<T extends Tarjeta["tipo"]> = { t: Extract<Tarjeta, { tipo: T }>; estado?: EstadoTarjeta; onHecho: Hecho };

function Pie({ estado }: { estado: EstadoTarjeta }) {
  return (
    <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold ${estado.estado === "hecho" ? "bg-mint-soft text-mint" : "bg-card-2 text-muted"}`}>
      {estado.estado === "hecho" && <Check size={16} strokeWidth={3} />}
      <span className="min-w-0 flex-1">{estado.texto}</span>
      {estado.href && (
        <Link href={estado.href} className="inline-flex items-center gap-1 text-text underline-offset-2 hover:underline">
          Ver <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

/** Corre la acción de la app y avisa cómo le fue. */
function useAccion() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = <T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, ok: (r: T) => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) ok(r);
        else toast(r.error ?? "No se pudo.", "error");
      } catch {
        toast("Se fue la señal. Intenta de nuevo.", "error");
      }
    });
  return { pending, run };
}

function Persona({ p, children }: { p: PersonaVista; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar emoji={p.avatar} color={p.color} size={38} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.nombre}</p>
        {children}
      </div>
    </div>
  );
}

function Salida({ t, estado, onHecho }: P<"salida">) {
  const { pending, run } = useAccion();
  const v = t.vista;
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-ink bg-sun text-2xl">{v.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="display truncate text-lg leading-tight font-bold">{v.titulo}</p>
          <p className="text-xs text-muted first-letter:uppercase">
            {v.fecha} · {v.division}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2 border-y-2 border-dashed border-line-strong py-2">
        <span className="text-sm font-semibold text-muted">Total</span>
        <span className="text-right">
          <span className="num block text-xl font-bold">{v.totalTexto}</span>
          {!v.totalTexto.startsWith("$") && <Money usd={v.totalUsd} currency="USD" className="text-xs text-muted" />}
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {v.personas.map((p) => (
          <li key={p.nombre} className="flex items-center gap-2.5 text-sm">
            <Avatar emoji={p.avatar} color={p.color} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.nombre}</span>
              {(p.pusoUsd > 0 || p.yaPago) && (
                <span className="block truncate text-xs text-muted">
                  {p.pusoUsd > 0 && (
                    <>
                      💸 puso <Money usd={p.pusoUsd} />
                    </>
                  )}
                  {p.pusoUsd > 0 && p.yaPago && " · "}
                  {p.yaPago && <span className="text-mint">✓ ya pagó</span>}
                </span>
              )}
            </span>
            <span className="text-right">
              <Money usd={p.parteUsd} className="block font-semibold" />
              <span className="block text-[10px] text-faint">le toca</span>
            </span>
          </li>
        ))}
      </ul>
      {v.deudas.length > 0 && (
        <p className="mt-3 rounded-2xl bg-card-2 px-3 py-2 text-xs text-muted">
          {v.deudas.map((d, i) => (
            <span key={i} className="mr-2 inline-block">
              {d.de} → {d.a} <Money usd={d.usd} className="font-semibold text-text" />
            </span>
          ))}
        </p>
      )}
      {estado ? (
        <Pie estado={estado} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            loading={pending}
            onClick={() =>
              run(
                () => saveSalida({ ...t.input, salidaId: undefined }),
                (r) =>
                  "id" in r &&
                  onHecho({ estado: "hecho", texto: "¡Anotada! Ya les llegó el aviso 🤙", href: `/salidas/${r.id}` }, `Tocó «Anotar salida»: la salida «${v.titulo}» quedó anotada (s:${r.id.slice(0, 8)}).`),
              )
            }
          >
            Anotar salida
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => onHecho({ estado: "descartado", texto: "No se anotó." }, `Descartó la salida propuesta «${v.titulo}» (no se anotó).`)}>
            Así no
          </Button>
        </div>
      )}
    </>
  );
}

function Recordar({ t, estado, onHecho }: P<"recordar">) {
  const { pending, run } = useAccion();
  const nombres = t.personas.map((p) => p.nombre).join(", ");
  return (
    <>
      <p className="mb-3 text-sm font-bold">⏰ Recordatorio de pago</p>
      <div className="flex items-center gap-3">
        <span className="flex -space-x-2">
          {t.personas.slice(0, 4).map((p) => (
            <Avatar key={p.nombre} emoji={p.avatar} color={p.color} size={36} />
          ))}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{nombres}</p>
          <p className="truncate text-xs text-muted">{t.titulo}</p>
        </div>
        <Money usd={t.montoUsd} className="font-bold" />
      </div>
      <p className="mt-2 text-xs text-muted">{t.detalle}</p>
      {estado ? (
        <Pie estado={estado} />
      ) : (
        <Button
          className="mt-3"
          loading={pending}
          onClick={() =>
            run(
              () => (t.userId ? remindPerson(t.userId) : remindPending(t.salidaId!, t.memberId)),
              () => onHecho({ estado: "hecho", texto: `Recordatorio enviado a ${nombres}` }, `Tocó «Mandar recordatorio»: le llegó el aviso a ${nombres}.`),
            )
          }
        >
          <Send size={16} /> Mandar recordatorio
        </Button>
      )}
    </>
  );
}

function Mensaje({ t, estado, onHecho }: P<"mensaje">) {
  const { pending, run } = useAccion();
  const wa = `https://wa.me/?text=${encodeURIComponent(t.texto)}`;
  return (
    <>
      <Persona p={t.persona}>
        <p className="text-xs text-muted">Mensaje para {t.persona.nombre}</p>
      </Persona>
      <p className="mt-3 rounded-2xl rounded-tl-md bg-card-2 px-3.5 py-2.5 text-sm whitespace-pre-line">{t.texto}</p>
      {estado ? (
        <Pie estado={estado} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            loading={pending}
            onClick={() =>
              run(
                () => sendDirect(t.userId, t.texto),
                () => onHecho({ estado: "hecho", texto: `Le llegó el aviso a ${t.persona.nombre}` }, `Tocó «Mandar por la app»: ${t.persona.nombre} recibió el mensaje.`),
              )
            }
          >
            <Send size={16} /> Mandar por la app
          </Button>
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            onClick={() => onHecho({ estado: "hecho", texto: "Abierto en WhatsApp" }, `Abrió WhatsApp para mandarle el mensaje a ${t.persona.nombre}.`)}
            className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-[#1f9d55] px-4 text-sm font-semibold text-[#1f9d55] dark:border-[#3ddc84] dark:text-[#3ddc84]"
          >
            <MessageCircle size={16} /> WhatsApp
          </a>
        </div>
      )}
    </>
  );
}

function Pagado({ t, estado, onHecho }: P<"pagado">) {
  const { pending, run } = useAccion();
  return (
    <>
      <p className="mb-3 text-sm font-bold">✅ Anotar que ya te pagó</p>
      <Persona p={t.persona}>
        <p className="truncate text-xs text-muted">
          {t.detalle} · {payMethodOf(t.metodo).label}
        </p>
      </Persona>
      <p className="mt-2 text-right">
        <Money usd={t.montoUsd} className="text-xl font-bold" />
      </p>
      {estado ? (
        <Pie estado={estado} />
      ) : (
        <Button
          className="mt-2"
          loading={pending}
          onClick={() =>
            run(
              () => (t.salidaId && t.memberId ? markSharePaid(t.salidaId, t.memberId, t.metodo, t.moneda) : markPersonPaid(t.userId!, t.metodo, t.moneda)),
              () => onHecho({ estado: "hecho", texto: `Listo: ${t.persona.nombre} quedó al día` }, `Tocó «Sí, ya me pagó»: quedó anotado que ${t.persona.nombre} pagó (${t.detalle}).`),
            )
          }
        >
          <Check size={16} strokeWidth={3} /> Sí, ya me pagó
        </Button>
      )}
    </>
  );
}

function Confirmar({ t, estado, onHecho }: P<"confirmar">) {
  const { pending, run } = useAccion();
  const [seguro, setSeguro] = useState(false);
  return (
    <>
      <p className="mb-3 text-sm font-bold">💸 ¿Te llegó este pago?</p>
      <Persona p={t.persona}>
        <p className="truncate text-xs text-muted">{t.detalle}</p>
      </Persona>
      <p className="mt-2 text-right">
        <Money usd={t.montoUsd} className="text-xl font-bold" />
      </p>
      {estado ? (
        <Pie estado={estado} />
      ) : seguro ? (
        <div className="mt-3 rounded-2xl bg-rose-soft p-3 text-sm">
          <p className="font-semibold text-rose">¿Seguro que no te llegó? Se borra ese pago y le avisamos a {t.persona.nombre} para que lo revise.</p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              loading={pending}
              onClick={() =>
                run(
                  () => answerPayment(t.settlementIds, false),
                  () => onHecho({ estado: "hecho", texto: `Le avisamos a ${t.persona.nombre} que no te llegó` }, `Tocó «No me llegó»: se borró el pago de ${t.persona.nombre} y se le avisó.`),
                )
              }
            >
              Sí, no me llegó
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSeguro(false)}>
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            loading={pending}
            onClick={() =>
              run(
                () => answerPayment(t.settlementIds, true),
                () => onHecho({ estado: "hecho", texto: `Confirmado: ¡cuentas claras con ${t.persona.nombre}!` }, `Tocó «Sí, me llegó»: confirmó el pago de ${t.persona.nombre}.`),
              )
            }
          >
            <Check size={16} strokeWidth={3} /> Sí, me llegó
          </Button>
          <Button variant="soft" disabled={pending} onClick={() => setSeguro(true)}>
            No me llegó
          </Button>
        </div>
      )}
    </>
  );
}
