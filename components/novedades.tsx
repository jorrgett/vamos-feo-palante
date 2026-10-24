"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { markNovedadesSeen } from "@/app/actions/novedades";
import { prettyDay } from "@/lib/dates";
import type { Release } from "@/lib/novedades";
import { Button, Sheet } from "./ui";

/** Una entrada de novedades (se usa en el pantallazo y en la página). */
export function ReleaseCard({ r, compact }: { r: Release; compact?: boolean }) {
  return (
    <section className={compact ? "space-y-2" : "card space-y-3 p-5"}>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sun text-2xl">{r.emoji}</span>
        <div className="min-w-0">
          <p className="display text-lg leading-tight font-bold">{r.title}</p>
          <p className="text-xs text-muted first-letter:uppercase">{prettyDay(r.date, true)}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {r.items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-[0.95rem] leading-snug">
            <span className="shrink-0">{it.emoji}</span>
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pantallazo con lo nuevo: sale una sola vez a cada quien después de cada publicación. */
export function NovedadesModal({ releases }: { releases: Release[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(path !== "/novedades");
  // No interrumpe un formulario a medias (anotar salida, pagar, bienvenida): sale cuando termines.
  const busy = /^\/(salidas\/nueva|salidas\/[^/]+\/editar|pagar|bienvenida|novedades)/.test(path);
  const close = () => {
    setOpen(false);
    markNovedadesSeen().catch(() => {});
  };
  return (
    <Sheet open={open && !busy} onClose={close} title="¡Hay novedades! 🎉">
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="-mt-2 mb-4 text-sm text-muted">
        Mejoramos la app. Esto es lo nuevo:
      </motion.p>
      <div className="space-y-5">
        {releases.map((r) => (
          <ReleaseCard key={r.id} r={r} compact />
        ))}
      </div>
      <div className="mt-6 grid gap-2">
        <Button size="lg" className="w-full" onClick={close}>
          ¡Chévere! 🤙
        </Button>
        <Link href="/novedades" onClick={close} className="py-2 text-center text-sm font-semibold text-muted hover:text-text">
          Ver todas las novedades
        </Link>
      </div>
    </Sheet>
  );
}

/** En la página de Novedades: con solo entrar ya cuenta como visto. */
export function MarkNovedadesSeen() {
  useEffect(() => {
    markNovedadesSeen().catch(() => {});
  }, []);
  return null;
}
