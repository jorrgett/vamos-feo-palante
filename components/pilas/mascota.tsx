"use client";

import clsx from "clsx";
import { useId } from "react";

// Pilas 🔋: una pila con cara. Se carga (sube y baja la carga) mientras piensa y sonríe grande cuando algo sale bien.
// Usa colores fijos de la marca para verse igual en modo claro y oscuro, como un sticker.
const TINTA = "#231C16";
const PAPEL = "#FFFAF0";
const SOL = "#FFD84D";
const MANGO = "#F0562A";

export type EstadoMascota = "normal" | "pensando" | "feliz";

export function PilasMascota({ size = 40, estado = "normal", className, title }: { size?: number; estado?: EstadoMascota; className?: string; title?: string }) {
  const clip = `pilas-cuerpo-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 68 84"
      width={(size * 68) / 84}
      height={size}
      className={clsx("pilas-mascota shrink-0 overflow-visible", `pilas-${estado}`, className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="8" y="14" width="50" height="64" rx="17" />
        </clipPath>
      </defs>
      {/* Sombra dura */}
      <rect x="11" y="17" width="50" height="64" rx="17" fill={TINTA} />
      {/* Tapita */}
      <rect x="23" y="5" width="20" height="12" rx="5" fill={PAPEL} stroke={TINTA} strokeWidth="3.5" />
      {/* Cuerpo */}
      <rect x="8" y="14" width="50" height="64" rx="17" fill={PAPEL} />
      {/* Carga */}
      <g clipPath={`url(#${clip})`}>
        <g className="pilas-nivel">
          <path className="pilas-ola" fill={SOL} d="M-32 56 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 V96 H-32 Z" />
        </g>
      </g>
      <rect x="8" y="14" width="50" height="64" rx="17" fill="none" stroke={TINTA} strokeWidth="3.5" />
      {/* Cachetes */}
      <ellipse cx="17.5" cy="47" rx="4" ry="2.6" fill={MANGO} opacity="0.32" />
      <ellipse cx="48.5" cy="47" rx="4" ry="2.6" fill={MANGO} opacity="0.32" />
      {/* Cara */}
      <g className="pilas-mirada">
        {estado === "feliz" ? (
          <g fill="none" stroke={TINTA} strokeWidth="3.2" strokeLinecap="round">
            <path d="M21 40 q4 -5 8 0" />
            <path d="M37 40 q4 -5 8 0" />
          </g>
        ) : (
          <g className="pilas-ojos" fill={TINTA}>
            <ellipse cx="25" cy="38" rx="3.4" ry="4.5" />
            <ellipse cx="41" cy="38" rx="3.4" ry="4.5" />
            <circle cx="26.2" cy="36.4" r="1.1" fill={PAPEL} />
            <circle cx="42.2" cy="36.4" r="1.1" fill={PAPEL} />
          </g>
        )}
        {estado === "feliz" ? (
          <path d="M24 46 q9 11 18 0 z" fill={TINTA} stroke={TINTA} strokeWidth="2.4" strokeLinejoin="round" />
        ) : estado === "pensando" ? (
          <path d="M28 49 q5 -3 10 0" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" />
        ) : (
          <path d="M25.5 46.5 q7.5 7 15 0" fill="none" stroke={TINTA} strokeWidth="3.2" strokeLinecap="round" />
        )}
      </g>
      {/* Rayo */}
      <path className="pilas-rayo" d="M35.5 57 l-7.5 11 h5.5 l-2.5 8 l9 -12 h-5.5 l2.5 -7 z" fill={MANGO} stroke={TINTA} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
