"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { AlertTriangle, Bell, Compass, Globe, EllipsisVertical, MonitorSmartphone, Settings, Share, SquarePlus } from "lucide-react";
import { Segmented } from "./ui";

type Platform = "android" | "iphone";

type Step = { icon: React.ComponentType<{ size?: number }>; title: string; text: React.ReactNode };

const ANDROID: Step[] = [
  { icon: Globe, title: "Ábrela en Chrome", text: "Entra a vamosfeopalante.vercel.app desde Google Chrome e inicia sesión." },
  {
    icon: EllipsisVertical,
    title: "Instálala (recomendado)",
    text: (
      <>
        Toca el menú <b>⋮</b> arriba a la derecha → <b>«Agregar a pantalla principal»</b> o <b>«Instalar app»</b> → <b>Instalar</b>. Te queda el ícono de la motico.
      </>
    ),
  },
  {
    icon: Bell,
    title: "Activa los avisos",
    text: (
      <>
        Abre la app, ve a <b>Avisos</b> (la campanita) o a <b>Perfil</b> y toca <b>«Activar avisos»</b>. Cuando Chrome pregunte, toca <b>«Permitir»</b>.
      </>
    ),
  },
  { icon: MonitorSmartphone, title: "Prueba que llegan", text: <>Toca <b>«Probar»</b>: en unos segundos te llega un aviso de prueba 🤙.</> },
];

const ANDROID_HELP: React.ReactNode[] = [
  <>
    Si le diste a «Bloquear»: en Chrome toca el <b>candado</b> (o los ajustes) junto a la dirección → <b>Permisos → Notificaciones → Permitir</b>, y vuelve a tocar «Activar avisos».
  </>,
  <>
    Revisa <b>Ajustes del teléfono → Apps → Chrome</b> (o «Vamos feo pa&apos;lante» si la instalaste) <b>→ Notificaciones</b> y que estén encendidas.
  </>,
  <>
    Si usas <b>ahorro de batería</b> o «No molestar», los avisos pueden llegar tarde. En algunos Xiaomi/Huawei hay que permitir que Chrome «se inicie solo».
  </>,
];

const IPHONE: Step[] = [
  {
    icon: Compass,
    title: "Ábrela en Safari",
    text: "Tiene que ser Safari (no Chrome ni el navegador de WhatsApp o Instagram). Entra a vamosfeopalante.vercel.app.",
  },
  {
    icon: Share,
    title: "Agrégala a la pantalla de inicio",
    text: (
      <>
        Toca <b>Compartir</b> (el cuadrito con la flecha hacia arriba) → baja y toca <b>«Agregar a pantalla de inicio»</b> → <b>Agregar</b>.
      </>
    ),
  },
  {
    icon: SquarePlus,
    title: "Ábrela desde el ícono nuevo",
    text: "Cierra Safari y abre la app desde el ícono de la motico en tu pantalla de inicio. Inicia sesión otra vez si te lo pide.",
  },
  {
    icon: Bell,
    title: "Activa los avisos",
    text: (
      <>
        Dentro de la app ve a <b>Avisos</b> (la campanita) o a <b>Perfil</b>, toca <b>«Activar avisos»</b> y luego <b>«Permitir»</b>.
      </>
    ),
  },
  { icon: MonitorSmartphone, title: "Prueba que llegan", text: <>Toca <b>«Probar»</b> y te debe llegar un aviso de prueba 🤙.</> },
];

const IPHONE_HELP: React.ReactNode[] = [
  <>
    Necesitas <b>iOS 16.4 o más nuevo</b> (Ajustes → General → Información). En versiones viejas Apple no deja recibir avisos de páginas web.
  </>,
  <>
    Si no te salió la pregunta o dijiste que no: <b>Ajustes → Notificaciones → Vamos feo pa&apos;lante → Permitir notificaciones</b>.
  </>,
  <>
    Si tienes un <b>modo Concentración</b> o «No molestar» activo, agrega la app a las permitidas.
  </>,
  <>Los avisos solo llegan a la app instalada en la pantalla de inicio, no a Safari.</>,
];

function detect(): { platform: Platform; iosOld: boolean; standalone: boolean } {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const m = ua.match(/OS (\d+)_(\d+)/);
  const iosOld = ios && !!m && (Number(m[1]) < 16 || (Number(m[1]) === 16 && Number(m[2]) < 4));
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return { platform: ios ? "iphone" : "android", iosOld, standalone };
}

export function PushGuide({ className }: { className?: string }) {
  const [platform, setPlatform] = useState<Platform>("android");
  const [info, setInfo] = useState<{ iosOld: boolean; standalone: boolean } | null>(null);
  useEffect(() => {
    const d = detect();
    setPlatform(d.platform);
    setInfo({ iosOld: d.iosOld, standalone: d.standalone });
  }, []);
  const steps = platform === "android" ? ANDROID : IPHONE;
  const help = platform === "android" ? ANDROID_HELP : IPHONE_HELP;

  return (
    <div className={className}>
      <Segmented
        name="push-guide"
        value={platform}
        onChange={setPlatform}
        options={[
          { value: "android", label: "🤖 Android" },
          { value: "iphone", label: "📱 iPhone" },
        ]}
      />

      {platform === "iphone" && info?.iosOld && (
        <p className="mt-3 flex gap-2 rounded-2xl bg-rose-soft p-3 text-sm text-rose">
          <AlertTriangle size={18} className="shrink-0" /> Tu iPhone tiene una versión de iOS anterior a 16.4: actualízalo para poder recibir avisos.
        </p>
      )}
      {platform === "iphone" && info && !info.standalone && (
        <p className="mt-3 rounded-2xl border-2 border-ink bg-sun p-3 text-sm text-sun-ink">
          👉 Ahora mismo la estás viendo en el navegador. Sigue el paso 2 y ábrela desde el ícono para poder activar los avisos.
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-sun font-bold text-sun-ink">{i + 1}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex items-center gap-1.5 font-semibold">
                <s.icon size={16} /> {s.title}
              </p>
              <p className="mt-0.5 text-sm text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <details className="mt-4 rounded-2xl bg-card-2 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Settings size={15} /> ¿No te llegan? Revisa esto
        </summary>
        <ul className={clsx("mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted")}>
          {help.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
