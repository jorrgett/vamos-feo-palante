"use client";

import clsx from "clsx";
import { useState } from "react";
import { Receipt } from "lucide-react";
import type { ProofAi } from "@/lib/db/schema";
import { Sheet } from "./ui";

export type ProofView = { id: string; ai: ProofAi | null };

/** Lo que leyó la IA del comprobante, con color según si cuadra. */
export function ProofAiLine({ ai, className }: { ai: ProofAi | null; className?: string }) {
  if (!ai) return null;
  const bad = ai.check.monto === "no" || ai.check.destino === "no" || !ai.leido.esComprobante;
  const good = ai.check.monto === "ok" && ai.check.destino !== "no";
  return (
    <p className={clsx("rounded-xl px-3 py-2 text-xs leading-snug", bad ? "bg-rose-soft text-rose" : good ? "bg-mint-soft text-text" : "bg-card-2 text-muted", className)}>
      {ai.resumen}
    </p>
  );
}

/** Botón para ver la captura del pago (solo la ven quien pagó y quien cobra). */
export function ProofButton({ proof, label = "Ver comprobante", compact }: { proof: ProofView; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border-2 border-line-strong font-semibold text-text transition-colors hover:border-ink",
          compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1.5 text-xs",
        )}
      >
        <Receipt size={compact ? 12 : 14} /> {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Comprobante del pago">
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/comprobante/${proof.id}`} alt="Captura del comprobante de pago" className="mx-auto max-h-[60dvh] w-auto rounded-2xl border border-line object-contain" />
          <ProofAiLine ai={proof.ai} />
          {proof.ai?.leido.referencia && <p className="text-center text-xs text-muted">Referencia: <b className="num text-text">{proof.ai.leido.referencia}</b></p>}
        </div>
      </Sheet>
    </>
  );
}
