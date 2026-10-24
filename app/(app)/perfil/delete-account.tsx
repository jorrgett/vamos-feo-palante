"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteAccount, type FormState } from "@/app/actions/auth";
import { Money } from "@/components/display";
import { Button, Sheet } from "@/components/ui";

export type DeletionPreview = {
  alone: { id: string; name: string; emoji: string }[];
  shared: { id: string; name: string; emoji: string; balance: number }[];
};

export function DeleteAccount({ email, preview }: { email: string; preview: DeletionPreview }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, undefined);
  const [confirm, setConfirm] = useState("");
  const owes = preview.shared.filter((g) => g.balance < -1);
  const owed = preview.shared.filter((g) => g.balance > 1);

  return (
    <section className="rounded-[1.25rem] border-2 border-dashed border-rose/50 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-rose">
        <AlertTriangle size={18} /> Zona de peligro
      </h2>
      <p className="mt-1 text-sm text-muted">
        Eliminar tu cuenta la borra para siempre de la base de datos: tu correo, contraseña, sesiones, datos de pago, avisos y teléfonos registrados. No se puede deshacer.
      </p>
      <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>
        <Trash2 size={16} /> Eliminar mi cuenta
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="¿Seguro que te vas? 🥲">
        <form action={action} className="space-y-4">
          <div className="space-y-2 text-sm">
            <p>
              Se borra <b>todo lo tuyo</b> ({email}) de forma física. No queda copia ni papelera.
            </p>
            {preview.alone.length > 0 && (
              <div className="rounded-2xl bg-rose-soft p-3">
                <p className="font-semibold text-rose">Salidas que se borran completas (nadie más tiene cuenta):</p>
                <p className="mt-1">{preview.alone.map((g) => `${g.emoji} ${g.name}`).join(" · ")}</p>
              </div>
            )}
            {preview.shared.length > 0 && (
              <div className="rounded-2xl bg-card-2 p-3">
                <p className="font-semibold">En estas salidas tu lugar queda como «Ex pana», sin tu nombre ni nada tuyo, para que las cuentas de los demás sigan cuadrando:</p>
                <p className="mt-1">{preview.shared.map((g) => `${g.emoji} ${g.name}`).join(" · ")}</p>
              </div>
            )}
            {owes.length > 0 && (
              <p className="rounded-2xl border-2 border-ink bg-sun p-3 text-sun-ink">
                ⚠️ Todavía debes plata en{" "}
                {owes.map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && ", "}
                    {g.name} (<Money usd={-g.balance} />)
                  </span>
                ))}
                . Lo justo es saldar antes de irte 😅
              </p>
            )}
            {owed.length > 0 && (
              <p className="rounded-2xl bg-mint-soft p-3">
                💸 Te deben plata en{" "}
                {owed.map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && ", "}
                    {g.name} (<Money usd={g.balance} />)
                  </span>
                ))}
                . Si borras la cuenta ya no vas a poder ver ni cobrar esas deudas aquí.
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="del-password">
              Tu contraseña
            </label>
            <input id="del-password" name="password" type="password" className="field" autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="del-confirm">
              Escribe <b className="text-rose">ELIMINAR</b> para confirmar
            </label>
            <input id="del-confirm" name="confirm" className="field uppercase" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {state?.error && <p className="rounded-xl bg-rose-soft px-3 py-2.5 text-sm font-medium text-rose">{state.error}</p>}
          <Button type="submit" variant="danger" size="lg" className="w-full" loading={pending} disabled={confirm.trim().toUpperCase() !== "ELIMINAR"}>
            <Trash2 size={17} /> Eliminar mi cuenta para siempre
          </Button>
        </form>
      </Sheet>
    </section>
  );
}
