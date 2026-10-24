"use client";

import clsx from "clsx";
import { useEffect, useState, useTransition } from "react";
import { Megaphone, MessageCircle, Send } from "lucide-react";
import { sendGroupMessage } from "@/app/actions/notifications";
import { Avatar, Button, Segmented, Sheet, useToast } from "./ui";

type M = { id: string; name: string; avatar: string; color: string; hasAccount: boolean; isMe: boolean; left?: boolean };

const TEMPLATES = [
  { emoji: "💸", text: "Epa, cuadremos las cuentas que hay deudas pendientes 👀" },
  { emoji: "🍻", text: "¿Salimos este finde? Vamos feo pa'lante 🤙" },
  { emoji: "🧾", text: "Anoté una cuenta nueva, revisen cuánto les toca." },
  { emoji: "🙏", text: "Al que le falte pagar, cuando pueda me avisa. ¡Gracias!" },
  { emoji: "🛍️", text: "Se viene la cuota de Cashea, porfa pásenme su parte." },
];

export function NoticeComposer({
  open,
  onClose,
  groupId,
  groupName,
  members,
  preselect,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  members: M[];
  preselect?: string | null;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const others = members.filter((m) => !m.isMe && !m.left);
  const [to, setTo] = useState<"all" | "some">(preselect ? "some" : "all");
  const [picked, setPicked] = useState<string[]>(preselect ? [preselect] : []);
  const [text, setText] = useState("");
  const [includeDebt, setIncludeDebt] = useState(true);
  const [ghosts, setGhosts] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTo(preselect ? "some" : "all");
    setPicked(preselect ? [preselect] : []);
    setGhosts([]);
  }, [open, preselect]);

  const targets = to === "all" ? others : others.filter((m) => picked.includes(m.id));
  const withoutAccount = targets.filter((m) => !m.hasAccount);

  const send = () =>
    start(async () => {
      const r = await sendGroupMessage({ groupId, to: to === "all" ? "all" : picked, text, includeDebt });
      if (!r.ok) return toast(r.error, "error");
      if (r.sent) toast(`Aviso enviado a ${r.sent} ${r.sent === 1 ? "pana" : "panas"} 🔔`);
      if (r.sinCuenta.length) setGhosts(r.sinCuenta);
      else {
        setText("");
        onClose();
      }
    });

  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Megaphone size={20} /> Avisar en {groupName}</span>}>
      <div className="space-y-4">
        <Segmented
          name="notice-to"
          value={to}
          onChange={setTo}
          options={[
            { value: "all", label: `A todos (${others.length})` },
            { value: "some", label: "Elegir a quién" },
          ]}
        />
        {to === "some" && (
          <div className="flex flex-wrap gap-2">
            {others.map((m) => {
              const on = picked.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                  className={clsx("flex items-center gap-1.5 rounded-full border-2 py-1 pr-3 pl-1 text-sm transition-all", on ? "border-ink bg-sun font-semibold text-sun-ink" : "border-line text-muted")}
                >
                  <Avatar emoji={m.avatar} color={m.color} size={24} ghost={!m.hasAccount} /> {m.name}
                </button>
              );
            })}
          </div>
        )}

        <div>
          <p className="label">Mensajes rápidos</p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t.text} type="button" onClick={() => setText(t.text)} className="chip text-left hover:border-line-strong">
                {t.emoji} <span className="max-w-52 truncate">{t.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="notice-text">
            Mensaje
          </label>
          <textarea id="notice-text" className="field min-h-24" maxLength={300} placeholder="Escribe lo que les quieres decir…" value={text} onChange={(e) => setText(e.target.value)} />
          <p className="mt-1 text-right text-[11px] text-faint">{text.length}/300</p>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-line p-3">
          <input type="checkbox" className="size-5 accent-[var(--mango)]" checked={includeDebt} onChange={(e) => setIncludeDebt(e.target.checked)} />
          <span className="text-sm">
            <b>Incluir lo que debe cada quien</b>
            <span className="block text-xs text-muted">A cada uno le llega su propio monto en $ y Bs.</span>
          </span>
        </label>

        {withoutAccount.length > 0 && (
          <p className="rounded-2xl bg-card-2 p-3 text-xs text-muted">
            {withoutAccount.map((m) => m.name).join(", ")} todavía no {withoutAccount.length === 1 ? "tiene" : "tienen"} cuenta, así que no les llega el aviso. Mándales el mensaje por WhatsApp.
          </p>
        )}

        {ghosts.length > 0 && (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${text}\n\n— ${groupName} · Vamos feo pa'lante 🤙`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-pop btn-pop-paper h-11 w-full"
          >
            <MessageCircle size={16} /> Mandárselo a {ghosts.join(", ")} por WhatsApp
          </a>
        )}

        <Button size="lg" className="w-full" loading={pending} disabled={!text.trim() || (to === "some" && picked.length === 0)} onClick={send}>
          <Send size={17} /> Enviar aviso {to === "all" ? "a todos" : picked.length ? `a ${picked.length}` : ""}
        </Button>
      </div>
    </Sheet>
  );
}
