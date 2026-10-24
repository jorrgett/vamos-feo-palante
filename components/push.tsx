"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Bell, BellOff, CircleHelp, Smartphone } from "lucide-react";
import { removePushSubscription, reportDevice, savePushSubscription, sendTestPush } from "@/app/actions/notifications";
import { Button, Sheet, useToast } from "./ui";
import { PushGuide } from "./push-guide";

type PushState = "cargando" | "no-soportado" | "ios-instalar" | "bloqueado" | "apagado" | "encendido";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function usePush() {
  const [state, setState] = useState<PushState>("cargando");
  const [sub, setSub] = useState<PushSubscription | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isStandalone() ? "ios-instalar" : "no-soportado");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const existing = await reg.pushManager.getSubscription();
      setSub(existing);
      if (Notification.permission === "denied") setState("bloqueado");
      else setState(existing ? "encendido" : "apagado");
    })().catch(() => setState("no-soportado"));
  }, []);

  const enable = useCallback(async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) throw new Error("Falta la clave pública de notificaciones.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "bloqueado" : "apagado");
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const r = await savePushSubscription(JSON.parse(JSON.stringify(s)));
    if (!r.ok) throw new Error(r.error);
    setSub(s);
    setState("encendido");
    window.dispatchEvent(new Event("vaca:push-changed"));
    return true;
  }, []);

  const disable = useCallback(async () => {
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setSub(null);
    setState("apagado");
    window.dispatchEvent(new Event("vaca:push-changed"));
  }, [sub]);

  return { state, enable, disable };
}

const platformOf = () => {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "iphone" as const;
  if (/android/i.test(ua)) return "android" as const;
  if (/windows|macintosh|linux|cros/i.test(ua)) return "computadora" as const;
  return "otro" as const;
};

/** Le cuenta al servidor, sin molestar, si este teléfono tiene los avisos activos (lo ve el administrador). */
async function readDevice() {
  const platform = platformOf();
  const installed = isStandalone();
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return { push: platform === "iphone" && !installed ? ("ios-instalar" as const) : ("no-soportado" as const), platform, installed };
  const reg = await navigator.serviceWorker.getRegistration("/");
  const existing = reg ? await reg.pushManager.getSubscription() : null;
  const permission = Notification.permission;
  const push = permission === "denied" ? ("bloqueado" as const) : existing && permission === "granted" ? ("encendido" as const) : ("apagado" as const);
  return { push, platform, installed, subscription: push === "encendido" && existing ? JSON.parse(JSON.stringify(existing)) : undefined };
}

export function DeviceReporter({ userId }: { userId: string }) {
  useEffect(() => {
    const KEY = `vaca-device:${userId}`;
    const run = async (force = false) => {
      if (document.visibilityState !== "visible") return;
      try {
        const d = await readDevice();
        const sig = `${d.push}|${d.platform}|${d.installed}|${d.subscription?.endpoint ?? ""}`;
        let last: { sig?: string; at?: number } = {};
        try {
          last = JSON.parse(localStorage.getItem(KEY) ?? "{}");
        } catch {}
        // Se reporta si algo cambió, o cada 30 min para saber cuándo entró por última vez.
        if (!force && last.sig === sig && Date.now() - (last.at ?? 0) < 30 * 60_000) return;
        const r = await reportDevice(d);
        if (r.ok) {
          try {
            localStorage.setItem(KEY, JSON.stringify({ sig, at: Date.now() }));
          } catch {}
        }
      } catch {}
    };
    const onVisible = () => run();
    const onChanged = () => run(true);
    run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("vaca:push-changed", onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("vaca:push-changed", onChanged);
    };
  }, [userId]);
  return null;
}

/** Tarjeta para activar las notificaciones en este teléfono. */
export function PushCard({ compact }: { compact?: boolean }) {
  const { state, enable, disable } = usePush();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [guide, setGuide] = useState(false);

  if (state === "cargando") return <div className="skeleton h-24" />;
  if (compact && state === "encendido") return null;

  return (
    <div className="card relative p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-ink bg-sun text-sun-ink">
          {state === "encendido" ? <Bell size={20} /> : state === "bloqueado" ? <BellOff size={20} /> : <Smartphone size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {state === "encendido" ? "Avisos activados en este teléfono" : "Activa los avisos en este teléfono"}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {state === "ios-instalar" &&
              "En iPhone primero hay que agregar la app a la pantalla de inicio y abrirla desde ese ícono. Mira los pasos 👇"}
            {state === "no-soportado" && "Este navegador no soporta notificaciones. Prueba con Chrome, Safari o la app instalada."}
            {state === "bloqueado" && "Bloqueaste las notificaciones para esta página. Actívalas en los ajustes del navegador."}
            {state === "apagado" && "Te avisamos cuando alguien anote una cuenta, te pague o te recuerde algo."}
            {state === "encendido" && "Te llegan los avisos de tus salidas aunque tengas la app cerrada."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {state === "apagado" && (
              <Button
                size="sm"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    try {
                      if (await enable()) toast("¡Listo! Te van a llegar los avisos 🔔");
                    } catch (e) {
                      toast((e as Error).message || "No se pudo activar", "error");
                    }
                  })
                }
              >
                <Bell size={15} /> Activar avisos
              </Button>
            )}
            {state === "encendido" && (
              <>
                <Button
                  size="sm"
                  variant="soft"
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await sendTestPush();
                      toast(r.ok ? "Te mandé uno de prueba" : r.error, r.ok ? "ok" : "error");
                    })
                  }
                >
                  Probar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => start(() => disable())}>
                  Desactivar
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setGuide(true)}>
              <CircleHelp size={15} /> ¿Cómo se activan?
            </Button>
          </div>
        </div>
      </div>
      <Sheet open={guide} onClose={() => setGuide(false)} title="Activar avisos en tu teléfono">
        <PushGuide />
      </Sheet>
    </div>
  );
}
