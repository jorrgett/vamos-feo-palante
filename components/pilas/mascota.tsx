"use client";

import clsx from "clsx";
import { useCallback, useEffect, useId, useRef, useState } from "react";

// Pilas 🔋: una pila con cara, brazos y patitas. Se carga mientras piensa, salúda de vez en cuando y sonríe grande
// cuando algo sale bien. Usa colores fijos de la marca para verse igual en modo claro y oscuro, como un sticker.
const TINTA = "#231C16";
const PAPEL = "#FFFAF0";
const SOL = "#FFD84D";
const MANGO = "#F0562A";

export type EstadoMascota = "normal" | "pensando" | "feliz";
type Gesto = "saluda" | "guino" | "mira" | "brinca" | null;

const GESTOS: Exclude<Gesto, null>[] = ["saluda", "saluda", "guino", "mira", "brinca"];
const DURACION: Record<Exclude<Gesto, null>, number> = { saluda: 1900, guino: 700, mira: 1600, brinca: 900 };

const quieto = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function PilasMascota({
  size = 40,
  estado = "normal",
  className,
  title,
  vivo = false,
  cadaSeg = [9, 18],
}: {
  size?: number;
  estado?: EstadoMascota;
  className?: string;
  title?: string;
  /** Saluda y hace gestos solo de vez en cuando, y reacciona al pasarle el dedo o el mouse. */
  vivo?: boolean;
  /** Cada cuánto (segundos, mín. y máx.) hace un gesto. */
  cadaSeg?: [number, number];
}) {
  const clip = `pilas-cuerpo-${useId().replace(/:/g, "")}`;
  const [gesto, setGesto] = useState<Gesto>(null);
  const fin = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hacer = useCallback((g: Exclude<Gesto, null>) => {
    if (quieto()) return;
    clearTimeout(fin.current);
    setGesto(g);
    fin.current = setTimeout(() => setGesto(null), DURACION[g]);
  }, []);

  // Gestos al azar: el primero (un saludo) poco después de aparecer.
  const [a, b] = cadaSeg;
  useEffect(() => {
    if (!vivo || estado !== "normal") return;
    let t: ReturnType<typeof setTimeout>;
    let primero = true;
    const programar = () => {
      const ms = primero ? 900 + Math.random() * 1600 : (a + Math.random() * (b - a)) * 1000;
      t = setTimeout(() => {
        if (document.visibilityState === "visible") hacer(primero ? "saluda" : GESTOS[Math.floor(Math.random() * GESTOS.length)]);
        primero = false;
        programar();
      }, ms);
    };
    programar();
    return () => clearTimeout(t);
  }, [vivo, estado, a, b, hacer]);

  useEffect(() => () => clearTimeout(fin.current), []);

  const cara = estado === "feliz" || gesto === "brinca" ? "feliz" : estado;
  return (
    <svg
      viewBox="0 0 76 88"
      width={(size * 76) / 88}
      height={size}
      className={clsx("pilas-mascota shrink-0 overflow-visible", `pilas-${estado}`, gesto && `pilas-g-${gesto}`, className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      onPointerEnter={vivo ? () => hacer("saluda") : undefined}
      onPointerDown={vivo ? () => hacer("brinca") : undefined}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="12" y="14" width="50" height="64" rx="17" />
        </clipPath>
      </defs>
      <g className="pilas-cuerpo-todo">
        {/* Patitas */}
        <g fill={TINTA}>
          <ellipse className="pilas-pata-i" cx="27" cy="82.5" rx="6.2" ry="3.4" />
          <ellipse className="pilas-pata-d" cx="48" cy="82.5" rx="6.2" ry="3.4" />
        </g>
        {/* Brazos (detrás del cuerpo, salen del hombro) */}
        <g className="pilas-brazo-i">
          <path d="M14 52 V71" stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
          <circle cx="14" cy="74" r="4" fill={PAPEL} stroke={TINTA} strokeWidth="2.6" />
        </g>
        <g className="pilas-brazo-d">
          <path d="M60 52 V71" stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
          <circle cx="60" cy="74" r="4" fill={PAPEL} stroke={TINTA} strokeWidth="2.6" />
        </g>
        {/* Sombra dura */}
        <rect x="15" y="17" width="50" height="64" rx="17" fill={TINTA} />
        {/* Tapita */}
        <rect x="27" y="5" width="20" height="12" rx="5" fill={PAPEL} stroke={TINTA} strokeWidth="3.5" />
        {/* Cuerpo */}
        <rect x="12" y="14" width="50" height="64" rx="17" fill={PAPEL} />
        {/* Carga */}
        <g clipPath={`url(#${clip})`}>
          <g className="pilas-nivel">
            <path className="pilas-ola" fill={SOL} d="M-28 56 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 V96 H-28 Z" />
          </g>
        </g>
        <rect x="12" y="14" width="50" height="64" rx="17" fill="none" stroke={TINTA} strokeWidth="3.5" />
        {/* Cachetes */}
        <ellipse className="pilas-cachete" cx="21.5" cy="47" rx="4" ry="2.6" fill={MANGO} opacity="0.32" />
        <ellipse className="pilas-cachete" cx="52.5" cy="47" rx="4" ry="2.6" fill={MANGO} opacity="0.32" />
        {/* Cara */}
        <g className="pilas-mirada">
          {cara === "feliz" ? (
            <g fill="none" stroke={TINTA} strokeWidth="3.2" strokeLinecap="round">
              <path d="M25 40 q4 -5 8 0" />
              <path d="M41 40 q4 -5 8 0" />
            </g>
          ) : (
            <g fill={TINTA}>
              <g className="pilas-ojos">
                <ellipse cx="29" cy="38" rx="3.4" ry="4.5" />
                <circle cx="30.2" cy="36.4" r="1.1" fill={PAPEL} />
              </g>
              <g className="pilas-ojos pilas-ojo-d">
                <ellipse cx="45" cy="38" rx="3.4" ry="4.5" />
                <circle cx="46.2" cy="36.4" r="1.1" fill={PAPEL} />
              </g>
            </g>
          )}
          {cara === "feliz" || gesto === "saluda" ? (
            <path d="M28 46 q9 11 18 0 z" fill={TINTA} stroke={TINTA} strokeWidth="2.4" strokeLinejoin="round" />
          ) : cara === "pensando" ? (
            <path d="M32 49 q5 -3 10 0" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" />
          ) : (
            <path d="M29.5 46.5 q7.5 7 15 0" fill="none" stroke={TINTA} strokeWidth="3.2" strokeLinecap="round" />
          )}
        </g>
        {/* Rayo */}
        <path className="pilas-rayo" d="M39.5 57 l-7.5 11 h5.5 l-2.5 8 l9 -12 h-5.5 l2.5 -7 z" fill={MANGO} stroke={TINTA} strokeWidth="1.8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
