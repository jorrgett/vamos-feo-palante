"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { finishOnboarding, saveBasics, savePayInfo, type FormState } from "@/app/actions/auth";
import { BrandMark } from "@/components/brand";
import { InviteCard } from "@/components/invite-card";
import { PushCard } from "@/components/push";
import { PushGuide } from "@/components/push-guide";
import { Avatar, Button } from "@/components/ui";
import { BANKS_VE, MEMBER_COLORS } from "@/lib/constants";
import type { PayInfo } from "@/lib/db/schema";
import { AvatarPicker } from "@/components/avatar-picker";
import { isPhoto } from "@/lib/avatar";

const STEPS = ["Tú", "Cómo te pagan", "Avisos", "Panas", "¡Listo!"];

export function Onboarding({ user, inviteCode, alone }: { user: { name: string; avatar: string; color: string; payInfo: PayInfo }; inviteCode: string; alone: boolean }) {
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState(user.avatar);
  const [color, setColor] = useState(user.color);
  const [basics, basicsAction, basicsPending] = useActionState<FormState, FormData>(saveBasics, undefined);
  const [pay, payAction, payPending] = useActionState<FormState, FormData>(savePayInfo, undefined);
  const [finishing, start] = useTransition();
  useEffect(() => {
    if (basics?.ok) setStep(1);
  }, [basics]);
  useEffect(() => {
    if (pay?.ok) setStep(2);
  }, [pay]);
  const pm = user.payInfo.pagoMovil ?? {};
  const [banco, setBanco] = useState(pm.banco ?? "");

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <BrandMark size={48} className="-rotate-6" />
        <div>
          <h1 className="display text-2xl font-extrabold">¡Bienvenido, {user.name}! 🤙</h1>
          <p className="text-sm text-muted">Te dejo todo listo en 1 minuto.</p>
        </div>
      </div>
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => i < step && setStep(i)} className={clsx("h-2 flex-1 rounded-full border border-ink/20", i < step ? "bg-mint" : i === step ? "bg-mango" : "bg-card-2")} aria-label={s} />
        ))}
      </div>
      <p className="text-xs font-semibold text-muted">
        Paso {step + 1} de {STEPS.length} · <span className="text-text">{STEPS[step]}</span>
      </p>

      <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
        {step === 0 && (
          <form action={basicsAction} className="card space-y-4 p-5">
            <p className="display text-xl font-bold">¿Cómo te ven los panas?</p>
            <div className="flex items-center gap-4">
              <Avatar emoji={avatar} color={color} size={64} />
              <input name="name" className="field" defaultValue={user.name} required minLength={2} maxLength={40} aria-label="Tu nombre" />
            </div>
            <input type="hidden" name="avatar" value={avatar} />
            <input type="hidden" name="color" value={color} />
            <AvatarPicker avatar={avatar} onChange={setAvatar} color={color} hadPhoto={isPhoto(user.avatar)} />
            <p className="label !mb-0">Tu color</p>
            <div className="flex flex-wrap gap-2">
              {MEMBER_COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={clsx("size-8 rounded-full", color === c && "ring-2 ring-text ring-offset-2 ring-offset-card")} style={{ background: c }} />
              ))}
            </div>
            <Button type="submit" size="lg" className="w-full" loading={basicsPending}>
              Siguiente <ArrowRight size={17} />
            </Button>
          </form>
        )}

        {step === 1 && (
          <form action={payAction} className="card space-y-4 p-5">
            <div>
              <p className="display text-xl font-bold">¿Cómo te pagan?</p>
              <p className="text-sm text-muted">Cuando alguien te deba, le salen estos datos con el monto exacto para que te pague rapidito. Solo los ven los panas.</p>
            </div>
            <div>
              <label className="label" htmlFor="pmBanco">
                Banco (pago móvil)
              </label>
              <select id="pmBanco" name="pmBanco" className="field" value={banco} onChange={(e) => setBanco(e.target.value)}>
                <option value="">—</option>
                {BANKS_VE.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="pmTelefono">
                  Teléfono
                </label>
                <input id="pmTelefono" name="pmTelefono" className="field" inputMode="tel" placeholder="0414-1234567" defaultValue={pm.telefono} maxLength={20} />
              </div>
              <div>
                <label className="label" htmlFor="pmCedula">
                  Cédula
                </label>
                <input id="pmCedula" name="pmCedula" className="field" placeholder="V-12345678" defaultValue={pm.cedula} maxLength={15} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="zelle">
                  Zelle (opcional)
                </label>
                <input id="zelle" name="zelle" className="field" placeholder="correo o teléfono" defaultValue={user.payInfo.zelle} maxLength={80} />
              </div>
              <div>
                <label className="label" htmlFor="binance">
                  Binance (opcional)
                </label>
                <input id="binance" name="binance" className="field" placeholder="Pay ID o correo" defaultValue={user.payInfo.binance} maxLength={80} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Lo hago después
              </Button>
              <Button type="submit" loading={payPending}>
                Guardar <ArrowRight size={16} />
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="card p-5">
              <p className="display text-xl font-bold">Activa los avisos 🔔</p>
              <p className="text-sm text-muted">Para que te enteres cuando te anoten en una salida, te paguen o te recuerden algo.</p>
            </div>
            <PushCard />
            <details className="card p-5">
              <summary className="cursor-pointer font-semibold">Ver los pasos para Android y iPhone</summary>
              <PushGuide className="mt-4" />
            </details>
            <Button size="lg" className="w-full" onClick={() => setStep(3)}>
              Siguiente <ArrowRight size={17} />
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="card p-5">
              <p className="display text-xl font-bold">{alone ? "Ahora invita a tus panas" : "¿Falta alguien?"}</p>
              <p className="text-sm text-muted">
                {alone
                  ? "Eres el primero. Mándales el link: cuando entren, ya los puedes meter en las salidas."
                  : "Si algún pana todavía no está, mándale el link."}
              </p>
            </div>
            <InviteCard code={inviteCode} compact />
            <Button size="lg" className="w-full" onClick={() => setStep(4)}>
              Siguiente <ArrowRight size={17} />
            </Button>
          </div>
        )}

        {step === 4 && (
          <div className="sticker bg-sun p-6 text-center text-sun-ink">
            <BrandMark size={72} bg={false} className="mx-auto" />
            <p className="display mt-2 text-2xl font-extrabold">¡Listo, ya estás adentro!</p>
            <p className="mt-2 text-sm opacity-80">Cuando salgan, el que ponga la plata anota la salida y a cada quien le llega lo que le toca. Vamos feo pa&apos;lante 🤙</p>
            <div className="mt-5 grid gap-2">
              <Button size="lg" loading={finishing} onClick={() => start(() => finishOnboarding("/salidas/nueva"))}>
                Anotar mi primera salida
              </Button>
              <Button variant="soft" disabled={finishing} onClick={() => start(() => finishOnboarding("/inicio"))}>
                Ir al inicio
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
