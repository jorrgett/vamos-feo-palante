"use client";

import { motion } from "motion/react";
import { useMemo } from "react";

const COLORES = ["#FFD84D", "#F0562A", "#0F8F6B", "#7B5CD6", "#1F7FC4", "#FF8FA3"];
/** Azar fijo por papelito (igual en cada render). */
const azar = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Lluvia de papelitos que sale de un punto (para celebrar). Se pinta una vez y se va sola. */
export function Confeti({ cuantos = 26, className = "" }: { cuantos?: number; className?: string }) {
  const piezas = useMemo(
    () =>
      Array.from({ length: cuantos }, (_, i) => {
        const ang = (Math.PI * 2 * i) / cuantos + azar(i) * 0.5;
        const dist = 60 + azar(i + 100) * 90;
        return {
          x: Math.cos(ang) * dist,
          y: Math.sin(ang) * dist * 0.7 - 30,
          r: azar(i + 200) * 540 - 270,
          c: COLORES[i % COLORES.length],
          w: 5 + azar(i + 300) * 5,
          redondo: i % 3 === 0,
        };
      }),
    [cuantos],
  );
  return (
    <span className={`pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-visible ${className}`} aria-hidden>
      {piezas.map((p, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ width: p.w, height: p.redondo ? p.w : p.w * 1.8, background: p.c, borderRadius: p.redondo ? 999 : 2 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 80], opacity: [1, 1, 0], rotate: p.r, scale: 1 }}
          transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], times: [0, 0.45, 1] }}
        />
      ))}
    </span>
  );
}
