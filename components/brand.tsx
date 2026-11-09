import clsx from "clsx";
import Image from "next/image";
import mano from "./marca/mano.png";

export const APP_NAME = "Vamos feo pa'lante";

/** El 🤙 del logo (diseñado con IA en el estilo de Pilas): cuadro amarillo y la mano aparte, para que salude. */
export function BrandMark({
  size = 40,
  className,
  bg = true,
  vivo = false,
  priority = false,
}: {
  size?: number;
  className?: string;
  bg?: boolean;
  /** Hace el «shaka» de vez en cuando (y siempre al pasarle el dedo o el mouse). */
  vivo?: boolean;
  priority?: boolean;
}) {
  return (
    <span className={clsx("marca relative inline-grid shrink-0 place-items-center", vivo && "marca-viva", className)} style={{ width: size, height: size }} aria-hidden>
      {bg && <span className="absolute inset-0 rounded-[30%] bg-[#FFD84D]" />}
      <Image src={mano} alt="" width={size} height={size} priority={priority} draggable={false} className="marca-mano relative size-full select-none" />
    </span>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={compact ? 36 : 44} className="-rotate-3" vivo priority />
      <span className={clsx("display leading-[0.95] font-extrabold", compact && "hidden sm:inline")}>
        <span className="block text-[1.05rem]">vamos feo</span>
        <span className="block text-[1.05rem] text-mango">pa&apos;lante</span>
      </span>
    </span>
  );
}

/** Garabatos de libreta para decorar. */
export function Doodle({ kind, className }: { kind: "star" | "squiggle" | "arrow" | "heart"; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      {kind === "star" && <path {...common} d="M24 6l4.5 12.5L41 20l-10 8 3.5 13L24 33.5 13.5 41 17 28 7 20l12.5-1.5z" />}
      {kind === "squiggle" && <path {...common} d="M4 30c5-10 9-10 12 0s7 10 12 0 9-10 12 0 5 6 6 4" />}
      {kind === "arrow" && <path {...common} d="M6 34c10-14 22-18 34-14M33 13l7 7-8 5" />}
      {kind === "heart" && <path {...common} d="M24 40S8 30 8 18c0-6 5-10 10-9 3 .5 5 2.5 6 5 1-2.5 3-4.5 6-5 5-1 10 3 10 9 0 12-16 22-16 22z" />}
    </svg>
  );
}
