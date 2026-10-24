"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { deleteNotifications, markAllRead } from "@/app/actions/notifications";
import { PushCard } from "@/components/push";
import { PushGuide } from "@/components/push-guide";
import { Button, EmptyState, Sheet, useToast } from "@/components/ui";
import { prettyDay } from "@/lib/dates";

type Item = { id: string; emoji: string; title: string; body: string; url: string | null; kind: string; unread: boolean; day: string; time: string };

/** Distancia (px) que hay que deslizar a la izquierda para borrar un aviso. */
const SWIPE = 96;

export function NoticesView({ items }: { items: Item[] }) {
  const toast = useToast();
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [pending, start] = useTransition();
  // Los que eran nuevos al abrir la página (al marcarse como leídos la página se refresca y se perdería).
  const [fresh] = useState(() => new Set(items.filter((i) => i.unread).map((i) => i.id)));

  // Al abrir la página se dan por leídos (la campanita se apaga).
  useEffect(() => {
    if (items.some((i) => i.unread)) markAllRead();
  }, [items]);

  const visible = items.filter((i) => !removed.has(i.id)).map((i) => ({ ...i, unread: i.unread || fresh.has(i.id) }));
  // "Las que ya viste" = las que ya estaban leídas antes de abrir la página (las nuevas se quedan hasta la próxima vez).
  const seen = visible.filter((i) => !i.unread);

  const remove = (ids: string[] | "todos", msg?: string) => {
    const gone = ids === "todos" ? visible.map((i) => i.id) : ids;
    setRemoved((r) => new Set([...r, ...gone]));
    start(async () => {
      const r = await deleteNotifications(ids);
      if (!r.ok) {
        setRemoved((prev) => new Set([...prev].filter((id) => !gone.includes(id))));
        return toast("No se pudo borrar. Intenta de nuevo.", "error");
      }
      if (msg) toast(msg, "info");
    });
  };

  const days = new Map<string, Item[]>();
  for (const i of visible) days.set(i.day, [...(days.get(i.day) ?? []), i]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="display text-3xl font-extrabold sm:text-4xl">Avisos 🔔</h1>
        <p className="mt-1 text-muted">Lo que ha pasado en tus salidas: cuentas nuevas, pagos por confirmar y recordatorios.</p>
      </div>
      <PushCard />
      <details className="card group p-5" open={visible.length === 0}>
        <summary className="display cursor-pointer text-lg font-bold">📲 Cómo activar los avisos en Android y iPhone</summary>
        <PushGuide className="mt-4" />
      </details>

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {seen.length > 0 && (
            <Button size="sm" variant="soft" disabled={pending} onClick={() => remove(seen.map((i) => i.id), seen.length === 1 ? "Borraste 1 aviso 🧹" : `Borraste ${seen.length} avisos 🧹`)}>
              <Trash2 size={14} /> Borrar los que ya viste ({seen.length})
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmAll(true)}>
            Borrar todos
          </Button>
          <p className="w-full text-xs text-muted">Desliza un aviso a la izquierda para borrarlo. Los que viste hace más de 30 días se borran solos.</p>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState emoji="📭" title="Nada por aquí">
          Cuando alguien anote una cuenta, te pague o te recuerde algo, te sale aquí.
        </EmptyState>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day}>
            <p className="display mb-2 text-sm font-bold text-muted first-letter:uppercase">{prettyDay(day, true)}</p>
            <ul className="card divide-y divide-line overflow-clip">
              <AnimatePresence initial={false}>
                {list.map((n) => (
                  <Notice key={n.id} n={n} onDelete={() => remove([n.id])} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))
      )}

      <Sheet open={confirmAll} onClose={() => setConfirmAll(false)} title="¿Borrar todos los avisos?">
        <p className="text-muted">Se borran los {visible.length} avisos de tu campanita. No se puede deshacer, pero tus salidas y pagos no cambian.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={() => setConfirmAll(false)}>
            Mejor no
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmAll(false);
              remove("todos", "Listo, campanita limpia 🧹");
            }}
          >
            <Trash2 size={16} /> Sí, borrar
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Notice({ n, onDelete }: { n: Item; onDelete: () => void }) {
  const dragged = useRef(false);
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-card-2 text-xl">{n.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className={clsx("text-[0.95rem]", n.unread ? "font-bold" : "font-medium")}>{n.title}</p>
        {n.body && <p className="mt-0.5 text-sm whitespace-pre-line text-muted">{n.body}</p>}
        <p className="mt-1 text-[11px] text-faint" suppressHydrationWarning>
          {new Date(n.time).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" })}
        </p>
      </div>
      {n.unread && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-mango" aria-label="Nuevo" />}
    </>
  );
  return (
    <motion.li layout exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="relative overflow-clip">
      {/* Lo que aparece detrás al deslizar */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-end gap-2 bg-rose px-5 text-sm font-bold text-on-color">
        <Trash2 size={18} /> Borrar
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0 }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          if (info.offset.x < -SWIPE) onDelete();
          setTimeout(() => (dragged.current = false), 0);
        }}
        className="relative flex items-start bg-card"
      >
        {n.url ? (
          <Link
            href={n.url}
            draggable={false}
            onClickCapture={(e) => dragged.current && e.preventDefault()}
            className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 transition-colors hover:bg-card-2/60"
          >
            {inner}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4">{inner}</div>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="mt-2 mr-2 grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-rose-soft hover:text-rose"
          aria-label={`Borrar aviso: ${n.title}`}
          title="Borrar"
        >
          <X size={16} />
        </button>
      </motion.div>
    </motion.li>
  );
}
