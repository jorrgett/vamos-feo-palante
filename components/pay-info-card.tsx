"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PayInfo } from "@/lib/db/schema";
import { bankCode, docParts, pagoMovilBlock, phoneForBank } from "@/lib/pago-movil";

/** Datos de pago de un pana, con botones para copiar cada uno. */
export function PayInfoCard({ name, info, isMe, amountVes }: { name: string; info: PayInfo; isMe?: boolean; /** Céntimos de Bs, si hay un monto que pagar. */ amountVes?: number }) {
  const [copied, setCopied] = useState<string | null>(null);
  const pm = info.pagoMovil ?? {};
  // [clave, etiqueta, lo que se ve, lo que se copia]: se copia limpio para que el banco no lo corte.
  const rows: [string, string, string | undefined, string | undefined][] = [
    ["banco", "🏦 Banco", pm.banco, bankCode(pm.banco)],
    ["tel", "📲 Teléfono (pago móvil)", pm.telefono && phoneForBank(pm.telefono), phoneForBank(pm.telefono)],
    ["ci", `🪪 Cédula ${docParts(pm.cedula).letter}`, pm.cedula && docParts(pm.cedula).number, docParts(pm.cedula).number],
    ["zelle", "⚡ Zelle", info.zelle, info.zelle?.trim()],
    ["binance", "🟡 Binance", info.binance, info.binance?.trim()],
  ];
  const present = rows.filter(([, , v]) => v);
  const copy = async (k: string, v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(k);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };
  return (
    <section className="card p-5">
      <h2 className="display text-lg font-bold">{isMe ? "Tus datos para que te paguen" : `Datos de pago de ${name}`}</h2>
      {present.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {isMe ? (
            <>
              Todavía no los cargas.{" "}
              <Link href="/perfil#datos-de-pago" className="font-semibold text-text underline">
                Agrégalos aquí
              </Link>{" "}
              para que te puedan pagar fácil.
            </>
          ) : (
            "Todavía no ha cargado sus datos de pago."
          )}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {present.map(([k, label, v, toCopy]) => (
            <li key={k}>
              <button onClick={() => copy(k, toCopy || v!)} className="flex w-full items-center gap-3 rounded-2xl bg-card-2 px-3.5 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">{label}</span>
                  <span className="num block truncate font-semibold">{v}</span>
                </span>
                {copied === k ? <Check size={16} className="text-mint" /> : <Copy size={16} className="text-muted" />}
              </button>
            </li>
          ))}
          {pm.telefono && (
            <li>
              <button
                onClick={() => copy("todo", pagoMovilBlock(pm, amountVes))}
                className="btn-pop h-11 w-full"
              >
                {copied === "todo" ? <Check size={16} /> : <Copy size={16} />} Copiar todo para el pago móvil
              </button>
            </li>
          )}
        </ul>
      )}
      {info.nota && <p className="mt-3 text-sm text-muted">📝 {info.nota}</p>}
    </section>
  );
}
