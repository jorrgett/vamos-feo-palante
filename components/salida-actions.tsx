"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Lock, Megaphone, Pencil, Trash2, Unlock } from "lucide-react";
import { deleteSalida, setSalidaClosed } from "@/app/actions/salidas";
import { NoticeComposer } from "./notice-composer";
import { Button, Sheet, useToast } from "./ui";

type M = { id: string; name: string; avatar: string; color: string; hasAccount: boolean; isMe: boolean; left?: boolean };

export function SalidaActions({
  salidaId,
  title,
  closed,
  canDelete,
  allPaid,
  members,
}: {
  salidaId: string;
  title: string;
  closed: boolean;
  canDelete: boolean;
  allPaid: boolean;
  members: M[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirmDel, setConfirmDel] = useState(false);
  const [composer, setComposer] = useState(false);

  const toggleClosed = () =>
    start(async () => {
      const r = await setSalidaClosed(salidaId, !closed);
      toast(r.ok ? (closed ? "Salida reabierta 🔓" : "Salida cerrada 🔒 ¡Cuentas claras!") : r.error, r.ok ? "ok" : "error");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {!closed && allPaid && (
        <div className="sticker flex flex-wrap items-center gap-3 bg-mint-soft p-4">
          <span className="text-2xl">🎉</span>
          <p className="min-w-0 flex-1 text-sm font-semibold">Todos pagaron. ¿La cerramos para que no salga más en pendientes?</p>
          <Button size="sm" onClick={toggleClosed} loading={pending}>
            <Lock size={14} /> Cerrar salida
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="soft" onClick={() => setComposer(true)}>
          <Megaphone size={16} /> Avisar
        </Button>
        {!closed ? (
          <Link href={`/salidas/${salidaId}/editar`} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-card-2 font-semibold hover:border-line-strong">
            <Pencil size={16} /> Editar
          </Link>
        ) : (
          <span className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-dashed border-line text-sm text-muted">🔒 Cerrada</span>
        )}
        <Button variant="soft" onClick={toggleClosed} loading={pending}>
          {closed ? <Unlock size={16} /> : <Lock size={16} />} {closed ? "Reabrir" : "Cerrar"}
        </Button>
        <Button variant="danger" onClick={() => (canDelete ? setConfirmDel(true) : toast("Solo quien anotó la salida la puede borrar. Puedes cerrarla.", "info"))}>
          <Trash2 size={16} /> Borrar
        </Button>
      </div>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title="¿Borrar esta salida?">
        <p className="text-sm text-muted">
          Se borra <b className="text-text">«{title}»</b> para todos: la cuenta, los pagos anotados, el plan de Cashea y sus avisos. No se puede deshacer.
        </p>
        <p className="mt-2 text-sm text-muted">Si solo quieres que no aparezca en pendientes, mejor ciérrala 🔒.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={() => setConfirmDel(false)}>
            Mejor no
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteSalida(salidaId);
                if (r.ok) {
                  toast("Salida borrada");
                  router.push("/salidas");
                  router.refresh();
                } else toast(r.error, "error");
              })
            }
          >
            <Trash2 size={16} /> Sí, borrar
          </Button>
        </div>
      </Sheet>
      <NoticeComposer open={composer} onClose={() => setComposer(false)} groupId={salidaId} groupName={title} members={members} />
    </div>
  );
}
