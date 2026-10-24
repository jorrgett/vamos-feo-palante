"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import { login, register, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui";

export function AuthForm({ mode, next, invite, first }: { mode: "login" | "register"; next?: string; invite?: string; first?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? login : register, undefined);
  const [show, setShow] = useState(false);
  const isReg = mode === "register";
  const qs = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <h1 className="display text-3xl font-extrabold">{isReg ? "¡Epa, bienvenido!" : "¡Epa, de vuelta!"}</h1>
      <p className="mt-1.5 text-muted">
        {isReg
          ? first
            ? "Eres el primero: crea tu cuenta y después invitas a los panas."
            : "Crea tu cuenta para entrar con los panas."
          : "Entra para ver quién te debe (y a quién le debes 👀)."}
      </p>

      <form action={action} className="mt-6 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        {invite && <input type="hidden" name="invitacion" value={invite} />}
        {isReg && (
          <div>
            <label className="label" htmlFor="name">
              ¿Cómo te dicen tus panas?
            </label>
            <input id="name" name="name" className="field" placeholder="Jorge" autoComplete="given-name" defaultValue={state?.fields?.name} required minLength={2} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="field"
            placeholder="tu@correo.com"
            autoComplete="email"
            inputMode="email"
            defaultValue={state?.fields?.email}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              className="field pr-12"
              placeholder={isReg ? "Mínimo 8 caracteres" : "••••••••"}
              autoComplete={isReg ? "new-password" : "current-password"}
              required
              minLength={isReg ? 8 : 1}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-text"
              aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {state?.error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-rose-soft px-3 py-2.5 text-sm font-medium text-rose" role="alert">
            {state.error}
          </motion.p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {isReg ? "Crear mi cuenta" : "Entrar"}
        </Button>
        {!isReg && (
          <p className="text-center text-sm">
            <Link href="/olvide" className="font-semibold text-muted underline-offset-4 hover:text-text hover:underline">
              Olvidé mi contraseña
            </Link>
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isReg ? (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href={"/entrar" + qs} className="font-semibold text-mango-ink underline-offset-4 hover:underline">
              Entra
            </Link>
          </>
        ) : (
          <>¿Primera vez? Pídele a un pana el link de invitación 🤙</>
        )}
      </p>
    </motion.div>
  );
}
