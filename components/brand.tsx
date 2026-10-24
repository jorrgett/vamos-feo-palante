import clsx from "clsx";

export const APP_NAME = "Vamos feo pa'lante";

/** El 🤙 dibujado: mano con manga roja, ondas de movimiento y un destello. */
export function BrandMark({ size = 40, className, bg = true }: { size?: number; className?: string; bg?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={clsx("shrink-0", className)} aria-hidden>
      {bg && <rect x="2" y="2" width="60" height="60" rx="19" fill="#FFD84D" />}
      <g stroke="#201A17" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".55">
      <path d="M9 22c-2 3-2 7 0 10"/><path d="M5 19c-3 5-3 11 0 16"/>
      <path d="M55 40c2-3 2-7 0-10"/><path d="M59 43c3-5 3-11 0-16"/>
      </g>
      <g stroke="#201A17" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" transform="rotate(-24 32 36)">
      <path d="M26 46h13v13H26z" fill="#FF5A3C"/>
      <path d="M25.5 46.5h14" strokeWidth="3"/>
      <path d="M41 31c1.6-6 3.4-12 5.2-17.4.8-2.4 3.4-3.6 5.6-2.6 2 .9 2.9 3.2 2.2 5.3L48.6 33" fill="#F4B183"/>
      <path d="M24 38.5c-4.2-1.4-8.6-3.4-12.6-5.4-2.1-1.1-2.9-3.7-1.8-5.8 1-1.9 3.4-2.7 5.4-1.8l11 4.9" fill="#F4B183"/>
      <rect x="22" y="27" width="26" height="21" rx="8" fill="#F4B183"/>
      <path d="M25 27.5c0-2.4 1.9-4.3 4.3-4.3s4.3 1.9 4.3 4.3" fill="#F4B183"/>
      <path d="M33.6 27.5c0-2.4 1.9-4.3 4.3-4.3s4.3 1.9 4.3 4.3" fill="#F4B183"/>
      <path d="M42.2 27.5c0-2.2 1.6-3.9 3.6-3.9" fill="#F4B183"/>
      <path d="M25.6 31.5h15.8" strokeWidth="1.6" opacity=".55"/>
      <path d="M33.6 27.6v3.6M42.2 27.6v3.6" strokeWidth="1.6" opacity=".7"/>
      <path d="M27 42.5c3 1.2 7.5 1.4 11 .2" strokeWidth="1.6" opacity=".35"/>
      </g>
      <path d="M51 9l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#FFF8EC" stroke="#201A17" strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={compact ? 36 : 44} className="-rotate-3" />
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
