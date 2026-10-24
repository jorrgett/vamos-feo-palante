"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, undefined);
  if (state?.ok)
    return (
      <div className="text-center">
        <p className="text-5xl">📬</p>
        <h1 className="display mt-3 text-2xl font-extrabold">Revisa tu correo</h1>
        <p className="mt-2 text-muted">{state.ok}</p>
        <ol className="mt-5 space-y-2 rounded-2xl bg-card-2 p-4 text-left text-sm">
          <li>1. Abre el correo de «Vamos feo pa&apos;lante».</li>
          <li>2. Toca «Crear contraseña nueva» (vale por 1 hora).</li>
          <li>3. Escribe tu contraseña nueva y listo.</li>
        </ol>
        <Link href="/entrar" className="btn-pop btn-pop-paper mt-6 h-11 px-6">
          Volver a entrar
        </Link>
      </div>
    );
  return (
    <div>
      <h1 className="display text-3xl font-extrabold">¿Se te olvidó? 🙈</h1>
      <p className="mt-1.5 text-muted">Tranquilo. Escribe tu correo y te mandamos un link para crear una contraseña nueva.</p>
      <form action={action} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Correo con el que te registraste
          </label>
          <input id="email" name="email" type="email" className="field" placeholder="tu@correo.com" autoComplete="email" defaultValue={state?.fields?.email} required />
        </div>
        {state?.error && <p className="rounded-xl bg-rose-soft px-3 py-2.5 text-sm font-medium text-rose">{state.error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Mandarme el link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/entrar" className="font-semibold text-muted hover:text-text">
          ← Volver
        </Link>
      </p>
    </div>
  );
}
