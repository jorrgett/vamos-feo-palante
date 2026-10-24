"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Calculator,
  CalendarClock,
  History,
  Home,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Settings,
  TrendingUp,
  Users,
  HandCoins,
  PartyPopper,
  UserPlus,
  Crown,
  Sparkles,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { myUnreadCount } from "@/app/actions/notifications";
import { Logo } from "./brand";
import { CurrencySwitch, useDisplay } from "./display";
import { Avatar, Sheet } from "./ui";
import { fmtNumber } from "@/lib/money";

type NavUser = { name: string; avatar: string; color: string; email: string };
type NavGroup = { id: string; name: string; emoji: string; color: string };

const MAIN = [
  { href: "/inicio", label: "Inicio", icon: Home },
  { href: "/salidas", label: "Salidas", icon: PartyPopper },
  { href: "/panas", label: "Panas", icon: Users },
  { href: "/avisos", label: "Avisos", icon: Bell },
  { href: "/cashea", label: "Cashea", icon: CalendarClock },
  { href: "/tasas", label: "Tasas", icon: TrendingUp },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/calculadora", label: "Calculadora", icon: Calculator },
  { href: "/novedades", label: "Novedades", icon: Sparkles },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** Cantidad de avisos sin leer; se refresca sola cada minuto mientras la app está a la vista. */
function useUnread(initial: number) {
  const [n, setN] = useState(initial);
  const path = usePathname();
  useEffect(() => setN(initial), [initial]);
  useEffect(() => {
    if (path === "/avisos") setN(0);
  }, [path]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") myUnreadCount().then(setN).catch(() => {});
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return n;
}

function NoticeBell({ unread }: { unread: number }) {
  const n = useUnread(unread);
  const path = usePathname();
  return (
    <Link
      href="/avisos"
      aria-label={n ? `Avisos (${n} sin leer)` : "Avisos"}
      className={clsx(
        "relative grid size-10 shrink-0 place-items-center rounded-full border-2 transition-colors",
        path === "/avisos" ? "border-ink bg-sun text-sun-ink" : "border-line-strong bg-card text-text hover:border-ink",
      )}
    >
      <motion.span animate={n ? { rotate: [0, -16, 14, -8, 0] } : {}} transition={{ duration: 0.8, repeat: n ? Infinity : 0, repeatDelay: 4 }}>
        <Bell size={18} />
      </motion.span>
      {n > 0 && (
        <span className="num absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-bg bg-mango px-1 text-[10px] font-bold text-on-color">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ user, groups, admin, news }: { user: NavUser; groups: NavGroup[]; admin?: boolean; news?: boolean }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
      <Link href="/inicio" className="px-2">
        <Logo />
      </Link>
      <QuickAdd groups={groups} variant="sidebar" />
      <nav className="mt-4 space-y-1">
        {[...MAIN, ...(admin ? [{ href: "/admin", label: "Administrador", icon: Crown }] : [])].map((item) => {
          const active = isActive(path, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[0.95rem] font-medium transition-colors",
                active ? "text-text" : "text-muted hover:text-text",
              )}
            >
              {active && <motion.span layoutId="side-active" className="absolute inset-0 -z-10 rounded-2xl border border-line bg-card" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
              <item.icon size={19} strokeWidth={active ? 2.4 : 2} className={active ? "text-mango-ink" : ""} />
              {item.label}
              {news && item.href === "/novedades" && <span className="ml-auto rounded-full bg-mango px-2 py-0.5 text-[10px] font-bold text-on-color">Nuevo</span>}
            </Link>
          );
        })}
      </nav>
      {groups.length > 0 && (
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto scrollbar-none">
          <p className="display px-3 pb-2 text-sm font-bold text-faint">salidas abiertas</p>
          <div className="space-y-0.5">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/salidas/${g.id}`}
                className={clsx(
                  "flex items-center gap-2.5 truncate rounded-xl px-3 py-2 text-sm transition-colors",
                  path.startsWith(`/salidas/${g.id}`) ? "bg-card-2 text-text" : "text-muted hover:text-text",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-base" style={{ background: `color-mix(in oklab, ${g.color} 22%, transparent)` }}>
                  {g.emoji}
                </span>
                <span className="truncate">{g.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto pt-4">
        <Link href="/perfil" className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5 transition-colors hover:border-line-strong">
          <Avatar emoji={user.avatar} color={user.color} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-xs text-muted">{user.email}</span>
          </span>
          <Settings size={17} className="text-muted" />
        </Link>
      </div>
    </aside>
  );
}

export function TopBar({ user, unread }: { user: NavUser; unread: number }) {
  const { rates, rateSource } = useDisplay();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link href="/inicio" className="lg:hidden">
          <Logo compact />
        </Link>
        <Link href="/tasas" className="chip ml-auto hidden sm:inline-flex" title="Tasas de hoy">
          <span className="size-1.5 animate-pulse rounded-full bg-mint" />
          BCV <span className="num">{fmtNumber(rates.bcvUsd)}</span>
          <span className="text-faint">·</span> € <span className="num">{fmtNumber(rates.bcvEur)}</span>
          {rates.usdt && (
            <>
              <span className="text-faint">·</span> USDT <span className="num">{fmtNumber(rates.usdt)}</span>
            </>
          )}
        </Link>
        <CurrencySwitch className="ml-auto sm:ml-0" />
        <NoticeBell unread={unread} />
        <Link href="/perfil" className="hidden sm:block lg:hidden" aria-label="Perfil">
          <Avatar emoji={user.avatar} color={user.color} size={34} />
        </Link>
        <span className="sr-only">Tasa de visualización: {rateSource}</span>
      </div>
    </header>
  );
}

// Pantallas paso a paso: tienen su propia barra abajo, así que se esconde la navegación.
const FLOWS = [/^\/salidas\/nueva/, /^\/salidas\/[^/]+\/editar/, /^\/pagar/, /^\/bienvenida/];

export function BottomNav({ groups, admin, news }: { groups: NavGroup[]; admin?: boolean; news?: boolean }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  if (FLOWS.some((r) => r.test(path))) return null;
  const items = [
    { href: "/inicio", label: "Inicio", icon: Home },
    { href: "/salidas", label: "Salidas", icon: PartyPopper },
    null,
    { href: "/panas", label: "Panas", icon: Users },
  ];
  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {items.map((item) =>
            item === null ? (
              <QuickAdd key="add" groups={groups} variant="fab" />
            ) : (
              <Link key={item.href} href={item.href} className="relative flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold">
                <item.icon size={22} strokeWidth={isActive(path, item.href) ? 2.4 : 1.9} className={isActive(path, item.href) ? "text-mango-ink" : "text-muted"} />
                <span className={isActive(path, item.href) ? "text-text" : "text-muted"}>{item.label}</span>
                {isActive(path, item.href) && <motion.span layoutId="tab-dot" className="absolute -top-1 h-1 w-6 rounded-full bg-mango" />}
              </Link>
            ),
          )}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-muted">
            <Menu size={22} strokeWidth={1.9} />
            Más
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Más opciones">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { href: "/cashea", label: "Cashea", icon: CalendarClock, tint: "var(--gold)" },
            { href: "/tasas", label: "Tasas del día", icon: TrendingUp, tint: "var(--sky)" },
            { href: "/avisos", label: "Avisos", icon: Bell, tint: "var(--coral)" },
            { href: "/historial", label: "Historial", icon: History, tint: "var(--violet)" },
            { href: "/calculadora", label: "Calculadora", icon: Calculator, tint: "var(--mango)" },
            { href: "/perfil", label: "Mi perfil", icon: Settings, tint: "var(--mint)" },
            { href: "/novedades", label: "Novedades", icon: Sparkles, tint: "var(--mango-ink)" },
            ...(admin ? [{ href: "/admin", label: "Administrador", icon: Crown, tint: "var(--gold)" }] : []),
          ].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMore(false)} className="card relative flex flex-col gap-3 p-4 transition-transform active:scale-[0.98]">
              <span className="grid size-10 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${l.tint} 18%, transparent)`, color: l.tint }}>
                <l.icon size={20} />
              </span>
              <span className="font-semibold">{l.label}</span>
              {news && l.href === "/novedades" && <span className="absolute top-3 right-3 rounded-full bg-mango px-2 py-0.5 text-[10px] font-bold text-on-color">Nuevo</span>}
            </Link>
          ))}
        </div>
        <form action={logout} className="mt-4">
          <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-sm font-semibold text-rose">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </form>
      </Sheet>
    </>
  );
}

/** Botón "+" con las acciones rápidas. */
function QuickAdd({ variant }: { groups?: NavGroup[]; variant: "fab" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const options = [
    { href: "/salidas/nueva", icon: Receipt, title: "Anotar una salida", sub: "Fuimos a comer, a tomar, a la playa… y alguien puso la plata", tint: "var(--mango)" },
    { href: "/pagar", icon: HandCoins, title: "Pagarle a un pana", sub: "Te muestro sus datos y cuánto le debes", tint: "var(--mint)" },
    { href: "/panas#invitar", icon: UserPlus, title: "Invitar a un pana", sub: "Mándale el link para que entre", tint: "var(--violet)" },
    { href: "/calculadora", icon: Calculator, title: "Calculadora rápida", sub: "Dividir sin anotar nada", tint: "var(--sky)" },
  ];

  return (
    <>
      {variant === "fab" ? (
        <div className="flex justify-center">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setOpen(true)} className="btn-pop -mt-7 size-14 !rounded-2xl ring-4 ring-bg" aria-label="Anotar algo">
            <Plus size={28} strokeWidth={2.6} />
          </motion.button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="btn-pop mt-6 !rounded-2xl px-4 py-3">
          <Plus size={19} strokeWidth={2.6} /> Anotar algo
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="¿Qué quieres hacer?">
        <div className="space-y-2.5">
          {options.map((o) => (
            <button
              key={o.href}
              onClick={() => go(o.href)}
              className="flex w-full items-center gap-4 rounded-2xl border border-line bg-card-2 p-4 text-left transition-colors hover:border-line-strong"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${o.tint} 20%, transparent)`, color: o.tint }}>
                <o.icon size={21} />
              </span>
              <span>
                <span className="block font-semibold">{o.title}</span>
                <span className="block text-sm text-muted">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
