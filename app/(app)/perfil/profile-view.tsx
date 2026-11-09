"use client";

import clsx from "clsx";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { changePassword, logout, updateProfile, type FormState } from "@/app/actions/auth";
import { Avatar, Button, Segmented, useToast } from "@/components/ui";
import { PushCard } from "@/components/push";
import { syncThemeColor } from "@/components/theme-sync";
import { AvatarPicker } from "@/components/avatar-picker";
import { isPhoto } from "@/lib/avatar";
import { DeleteAccount, type DeletionPreview } from "./delete-account";
export type { DeletionPreview };
import { BANKS_VE, MEMBER_COLORS } from "@/lib/constants";
import { RATE_META, type RateSourceId } from "@/lib/rates-shared";
import type { CurrentUser } from "@/lib/auth";

export function ProfileView({ user, deletion, admin }: { user: CurrentUser; deletion: DeletionPreview; admin?: boolean }) {
  const toast = useToast();
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, undefined);
  const [pwState, pwAction, pwPending] = useActionState<FormState, FormData>(changePassword, undefined);
  const [avatar, setAvatar] = useState(user.avatar);
  const [color, setColor] = useState(user.color);
  const [cur, setCur] = useState(user.displayCurrency);
  const [rate, setRate] = useState<RateSourceId>(user.rateSource);
  const [banco, setBanco] = useState(user.payInfo.pagoMovil?.banco ?? "");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    try {
      const t = localStorage.getItem("vaca-theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);
  useEffect(() => {
    if (state?.ok) toast(state.ok);
    if (state?.error) toast(state.error, "error");
  }, [state, toast]);
  useEffect(() => {
    if (pwState?.ok) toast(pwState.ok);
    if (pwState?.error) toast(pwState.error, "error");
  }, [pwState, toast]);

  const applyTheme = (t: "system" | "light" | "dark") => {
    setTheme(t);
    try {
      if (t === "system") {
        localStorage.removeItem("vaca-theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("vaca-theme", t);
        document.documentElement.dataset.theme = t;
      }
    } catch {}
    syncThemeColor();
  };

  return (
    <div className="entra mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Avatar emoji={avatar} color={color} size={72} />
        <div>
          <h1 className="display text-3xl font-extrabold">{user.name}</h1>
          <p className="text-muted">{user.email}</p>
        </div>
      </div>

      {admin && (
        <Link href="/admin" className="sticker flex items-center gap-4 bg-sun p-4 text-sun-ink transition-transform active:scale-[0.99]">
          <span className="text-3xl">👑</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Eres el administrador</span>
            <span className="block text-sm opacity-80">Mira quién tiene los avisos activos y pídele a los que faltan que los activen.</span>
          </span>
          <ChevronRight size={20} />
        </Link>
      )}

      <PushCard />

      <form action={action} className="space-y-6">
        <input type="hidden" name="avatar" value={avatar} />
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="displayCurrency" value={cur} />
        <input type="hidden" name="rateSource" value={rate} />

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Cómo te ven</h2>
          <div>
            <label className="label" htmlFor="name">
              Nombre
            </label>
            <input id="name" name="name" className="field" defaultValue={user.name} required minLength={2} maxLength={40} />
          </div>
          <AvatarPicker avatar={avatar} onChange={setAvatar} color={color} hadPhoto={isPhoto(user.avatar)} />
          <p className="label !mb-0">Tu color</p>
          <div className="flex flex-wrap gap-2">
            {MEMBER_COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={clsx("size-8 rounded-full", color === c && "ring-2 ring-text ring-offset-2 ring-offset-card")} style={{ background: c }} />
            ))}
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Ver montos en</h2>
          <Segmented
            name="pref-cur"
            value={cur}
            onChange={setCur}
            options={[
              { value: "USD", label: "Dólares" },
              { value: "VES", label: "Bolívares" },
              { value: "EUR", label: "Euros" },
            ]}
          />
          {cur === "VES" && (
            <div>
              <p className="label">Usando la tasa</p>
              <Segmented name="pref-rate" value={rate} onChange={setRate} options={(["bcv", "eur", "usdt"] as RateSourceId[]).map((r) => ({ value: r, label: RATE_META[r].short }))} />
            </div>
          )}
          <div>
            <p className="label">Tema</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["system", "Sistema", Monitor],
                  ["light", "Claro", Sun],
                  ["dark", "Oscuro", Moon],
                ] as const
              ).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => applyTheme(id)} className={clsx("flex items-center justify-center gap-2 rounded-2xl border py-2.5 text-sm font-semibold", theme === id ? "border-mango bg-mango/10" : "border-line text-muted")}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="datos-de-pago" className="card scroll-mt-24 space-y-4 p-5">
          <div>
            <h2 className="font-semibold">Tus datos para que te paguen</h2>
            <p className="text-sm text-muted">Cuando alguien te deba, le salen estos datos con el monto exacto para pagarte. Solo los ven los panas.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
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
            <div>
              <label className="label" htmlFor="pmTelefono">
                Teléfono
              </label>
              <input id="pmTelefono" name="pmTelefono" className="field" inputMode="tel" placeholder="0414-1234567" defaultValue={user.payInfo.pagoMovil?.telefono ?? ""} maxLength={20} />
            </div>
            <div>
              <label className="label" htmlFor="pmCedula">
                Cédula
              </label>
              <input id="pmCedula" name="pmCedula" className="field" placeholder="V-12345678" defaultValue={user.payInfo.pagoMovil?.cedula ?? ""} maxLength={15} />
            </div>
            <div>
              <label className="label" htmlFor="zelle">
                Zelle
              </label>
              <input id="zelle" name="zelle" className="field" placeholder="correo o teléfono" defaultValue={user.payInfo.zelle ?? ""} maxLength={80} />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="binance">
                Binance Pay ID / correo
              </label>
              <input id="binance" name="binance" className="field" defaultValue={user.payInfo.binance ?? ""} maxLength={80} />
            </div>
          </div>
        </section>

        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Guardar perfil
        </Button>
      </form>

      <form action={pwAction} className="card space-y-3 p-5">
        <h2 className="font-semibold">Cambiar contraseña</h2>
        <input name="current" type="password" className="field" placeholder="Contraseña actual" autoComplete="current-password" required />
        <input name="next" type="password" className="field" placeholder="Nueva (mínimo 8)" autoComplete="new-password" minLength={8} required />
        <Button type="submit" variant="soft" loading={pwPending}>
          Actualizar contraseña
        </Button>
      </form>

      <form action={logout}>
        <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 font-semibold text-rose">
          <LogOut size={17} /> Cerrar sesión
        </button>
      </form>

      <DeleteAccount email={user.email} preview={deletion} />
    </div>
  );
}
