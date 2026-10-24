"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { answerPayment } from "@/app/actions/salidas";
import { payMethodOf } from "@/lib/constants";
import { fmt, type Currency } from "@/lib/money";
import { ProofAiLine, ProofButton, type ProofView } from "./proof";
import { Avatar, Button, useToast } from "./ui";

export type ConfirmView = {
  batchId: string;
  fromName: string;
  fromAvatar: string;
  fromColor: string;
  toName: string;
  totalUsd: number;
  currency: string;
  amount: number;
  method: string;
  reference: string | null;
  salidas: { id: string; title: string }[];
  settlementIds: string[];
  /** Captura del pago, si la subió (con lo que leyó la IA). */
  proof?: ProofView | null;
};

/** Pagos que me dicen que me hicieron: confirmo si me llegó o aviso que no. */
export function ConfirmPayments({ items, role }: { items: ConfirmView[]; role: "cobro" | "pago" }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <ul className="space-y-2.5">
      {items.map((c) => (
        <li key={c.batchId} className="sticker bg-card p-4">
          <div className="flex items-center gap-3">
            <Avatar emoji={c.fromAvatar} color={c.fromColor} size={42} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{role === "cobro" ? `${c.fromName} dice que te pagó` : `Le pagaste a ${c.toName}`}</p>
              <p className="text-xs text-muted">
                {payMethodOf(c.method).emoji} {payMethodOf(c.method).label}
                {c.reference ? ` · ref ${c.reference}` : ""} · {c.salidas.map((s) => s.title).join(", ")}
              </p>
            </div>
            <div className="text-right">
              <p className="num text-lg font-bold">{fmt(c.amount, c.currency as Currency)}</p>
              {c.currency !== "USD" && <p className="num text-[11px] text-muted">{fmt(c.totalUsd, "USD")}</p>}
            </div>
          </div>
          {c.proof && (
            <div className="mt-3 space-y-2">
              <ProofAiLine ai={c.proof.ai} />
              <ProofButton proof={c.proof} label={role === "cobro" ? "Ver la captura del pago" : "Ver tu comprobante"} />
            </div>
          )}
          {role === "cobro" ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="soft"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await answerPayment(c.settlementIds, false);
                    toast(r.ok ? `Le avisamos a ${c.fromName} que no te llegó` : r.error, r.ok ? "info" : "error");
                    router.refresh();
                  })
                }
              >
                <X size={16} /> No me llegó
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await answerPayment(c.settlementIds, true);
                    toast(r.ok ? "¡Confirmado! ✅" : r.error, r.ok ? "ok" : "error");
                    router.refresh();
                  })
                }
              >
                <Check size={16} /> Sí, me llegó
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">⏳ Esperando que {c.toName} confirme que le llegó.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
