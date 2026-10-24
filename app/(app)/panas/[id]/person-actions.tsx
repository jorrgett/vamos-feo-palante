"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BellRing, HandCoins, MessageCircle, Send } from "lucide-react";
import { sendDirect } from "@/app/actions/notifications";
import { remindPerson } from "@/app/actions/salidas";
import { Button, Sheet, useToast } from "@/components/ui";

export function PersonActions({ userId, name, owesMe, iOwe }: { userId: string; name: string; owesMe: number; iOwe: number }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {iOwe > 0 && (
        <Link href={`/pagar?a=${userId}`} className="btn-pop h-11">
          <HandCoins size={17} /> Pagarle
        </Link>
      )}
      {owesMe > 0 && (
        <Button
          variant="soft"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await remindPerson(userId);
              toast(r.ok ? `Le llegó el recordatorio a ${name} 🔔` : r.error, r.ok ? "ok" : "error");
            })
          }
        >
          <BellRing size={16} /> Recordarle
        </Button>
      )}
      <Button variant="soft" onClick={() => setOpen(true)}>
        <MessageCircle size={16} /> Mensaje
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Mensaje para ${name}`}>
        <textarea className="field min-h-24" maxLength={300} placeholder="Escríbele algo…" value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          className="mt-3 w-full"
          size="lg"
          disabled={!text.trim()}
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await sendDirect(userId, text);
              toast(r.ok ? `Le llegó tu mensaje a ${name} 🔔` : r.error, r.ok ? "ok" : "error");
              if (r.ok) {
                setText("");
                setOpen(false);
              }
            })
          }
        >
          <Send size={16} /> Enviar
        </Button>
      </Sheet>
    </div>
  );
}
