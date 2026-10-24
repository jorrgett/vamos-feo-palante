"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "🔔 Avisos" },
  { href: "/admin/salidas", label: "🎉 Salidas" },
  { href: "/admin/ia", label: "🤖 IA" },
];

/** Pestañas del panel del administrador. */
export function AdminTabs() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" || path.startsWith("/admin/panas") : path.startsWith(href));
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-card-2 p-1" aria-label="Secciones del administrador">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={clsx("rounded-xl px-2 py-2 text-center text-sm font-semibold transition-colors", active(t.href) ? "border border-line-strong bg-card text-text shadow-sm" : "text-muted hover:text-text")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
