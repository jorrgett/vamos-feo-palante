import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PilasMascota } from "./mascota";

/** Tarjeta de Inicio: Pilas a un toque, con preguntas listas según las cuentas de cada quien. */
export function PilasInvitacion({ sugerencias }: { sugerencias: string[] }) {
  return (
    <section className="sticker relative overflow-clip bg-card p-4">
      <div className="pointer-events-none absolute -top-10 -right-8 size-36 rounded-full bg-sun/25" aria-hidden />
      <Link href="/pilas" className="relative flex items-center gap-3">
        <PilasMascota size={52} />
        <span className="min-w-0 flex-1">
          <span className="display block text-lg leading-tight font-bold">Pregúntale a Pilas</span>
          <span className="block text-sm text-muted">Tu pana más pilas con las cuentas: explica, anota y cobra por ti.</span>
        </span>
        <ArrowRight size={20} className="shrink-0 text-muted" />
      </Link>
      <div className="relative -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        {sugerencias.slice(0, 4).map((s) => (
          <Link key={s} href={`/pilas?q=${encodeURIComponent(s)}`} className="shrink-0 rounded-full border-2 border-ink bg-card px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0_var(--pop)]">
            {s}
          </Link>
        ))}
      </div>
    </section>
  );
}
