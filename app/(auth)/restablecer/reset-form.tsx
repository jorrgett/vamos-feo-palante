"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { resetPassword, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, undefined);
  const [show, setShow] = useState(false);
  return (
    <div>
      <h1 className="display text-3xl font-extrabold">Contraseña nueva 🔑</h1>
      <p className="mt-1.5 text-muted">Escoge una que te acuerdes (mínimo 8 caracteres). Al guardarla entras directo.</p>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">
            Contraseña nueva
          </label>
          <div className="relative">
            <input id="password" name="password" type={show ? "text" : "password"} className="field pr-12" minLength={8} autoComplete="new-password" required />
            <button type="button" onClick={() => setShow((x) => !x)} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted" aria-label="Mostrar contraseña">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {state?.error && (
          <p className="rounded-xl bg-rose-soft px-3 py-2.5 text-sm font-medium text-rose">
            {state.error}{" "}
            <Link href="/olvide" className="underline">
              Pedir otro
            </Link>
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Guardar y entrar
        </Button>
      </form>
    </div>
  );
}
