"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Link2, MessageCircle, RefreshCw, Share2 } from "lucide-react";
import { newInviteCode } from "@/app/actions/community";
import { Button, useToast } from "./ui";

export function InviteCard({ code: initialCode, compact }: { code: string; compact?: boolean }) {
  const toast = useToast();
  const [code, setCode] = useState(initialCode);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/unirse/${code}`;
  const text = `¡Epa! Métete en «Vamos feo pa'lante» 🤙 para llevar las cuentas de las salidas sin enredos: ${link}`;

  return (
    <div id="invitar" className="card scroll-mt-24 p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <Link2 size={17} /> Invita a tus panas
      </h3>
      {!compact && <p className="mt-1 text-sm text-muted">Solo pueden entrar los que tengan este link. Al registrarse quedan conectados con todos.</p>}
      <div className="num mt-3 truncate rounded-xl bg-card-2 px-3 py-2.5 text-xs">{origin ? link : "…"}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="btn-pop h-10 text-sm">
          <MessageCircle size={15} /> WhatsApp
        </a>
        <Button
          variant="soft"
          size="sm"
          className="h-10"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: "Vamos feo pa'lante", text, url: link });
              else {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            } catch {}
          }}
        >
          {copied ? <Check size={15} /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 size={15} /> : <Copy size={15} />} {copied ? "Copiado" : "Compartir"}
        </Button>
      </div>
      {!compact && (
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Hacer un link nuevo? El anterior deja de funcionar (los que ya entraron siguen adentro).")) return;
            start(async () => {
              const r = await newInviteCode();
              setCode(r);
              toast("Link nuevo listo");
            });
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 py-1.5 text-xs text-muted hover:text-text"
        >
          <RefreshCw size={12} /> Hacer un link nuevo
        </button>
      )}
    </div>
  );
}
