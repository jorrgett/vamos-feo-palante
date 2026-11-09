"use client";

import clsx from "clsx";
import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { useDisplay, Money } from "./display";
import { Sparkline } from "./charts";
import { Doodle } from "./brand";
import { fmt, fmtNumber } from "@/lib/money";
import { RATE_META, gapPct, type RateSourceId } from "@/lib/rates-shared";
import { payMethodOf } from "@/lib/constants";
import { prettyDay, relativeDue } from "@/lib/dates";

export function Section({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="display text-xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SeeAll({ href, children = "Ver todo" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-text">
      {children} <ArrowRight size={15} />
    </Link>
  );
}

export function HeroBalance({ net, owedToMe, iOwe, name }: { net: number; owedToMe: number; iOwe: number; name: string }) {
  const settled = Math.abs(net) < 1 && owedToMe < 1 && iOwe < 1;
  return (
    <div className="sticker relative bg-sun p-6 text-sun-ink sm:p-7">
      <span className="tape cinta -top-3 right-10 rotate-3" />
      <Doodle kind="squiggle" className="dibuja absolute right-5 bottom-24 hidden size-16 opacity-30 sm:block" />
      <p className="display text-sm font-bold opacity-75">{settled ? `Todo en orden, ${name}` : "Tu balance con los panas"}</p>
      <Money usd={net} sign animated className="mt-1 block text-[2.6rem] leading-none font-bold tracking-tight sm:text-6xl" />
      <p className="mt-2 text-sm opacity-75">
        {settled ? "Nadie le debe nada a nadie 🎉" : net > 0 ? "Te deben más de lo que debes 😎" : "Te toca ponerte al día 👀"}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border-2 border-ink bg-card p-3.5 text-text">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <TrendingUp size={14} /> Te deben
          </p>
          <Money usd={owedToMe} className="mt-1 block text-xl font-bold text-mint" />
        </div>
        <div className="rounded-2xl border-2 border-ink bg-card p-3.5 text-text">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <TrendingDown size={14} /> Debes
          </p>
          <Money usd={iOwe} className="mt-1 block text-xl font-bold text-rose" />
        </div>
      </div>
    </div>
  );
}

export function RatesCard({ history }: { history: { bcvUsd: number[]; bcvEur: number[]; usdt: number[] } }) {
  const { rates } = useDisplay();
  const gap = gapPct(rates, "usdt");
  const items: { id: RateSourceId; value: number | null; change?: number | null; spark: number[]; color: string }[] = [
    { id: "bcv", value: rates.bcvUsd, change: rates.change?.bcvUsd, spark: history.bcvUsd, color: "var(--viz-usd)" },
    { id: "usdt", value: rates.usdt, change: rates.change?.usdt, spark: history.usdt, color: "var(--viz-usdt)" },
    { id: "eur", value: rates.bcvEur, change: rates.change?.bcvEur, spark: history.bcvEur, color: "var(--viz-eur)" },
  ];
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="display text-lg font-bold">Tasas de hoy</h3>
        <Link href="/tasas" className="text-xs font-semibold text-muted hover:text-text">
          Detalle →
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-muted">BCV fecha valor {prettyDay(rates.bcvDate)} · Bs por unidad</p>
      <ul className="mt-4 space-y-3">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3">
            <span className="h-8 w-1 rounded-full" style={{ background: it.color }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted">{RATE_META[it.id].label}</p>
              <p className="num text-lg font-bold">{it.value ? fmtNumber(it.value) : "—"}</p>
            </div>
            <Sparkline values={it.spark} color={it.color} width={72} height={28} />
            {it.change != null && (
              <span className={clsx("num w-14 text-right text-xs font-semibold", it.change >= 0 ? "text-muted" : "text-muted")}>
                {it.change >= 0 ? "▲" : "▼"} {fmtNumber(Math.abs(it.change), 2)}%
              </span>
            )}
          </li>
        ))}
      </ul>
      {gap != null && (
        <div className="mt-4 rounded-2xl bg-card-2 px-3.5 py-2.5 text-sm">
          Brecha Binance vs BCV: <span className="num font-bold">{fmtNumber(gap, 1)}%</span>
        </div>
      )}
    </div>
  );
}

export type ActivityView = {
  id: string;
  kind: "expense" | "settlement";
  groupId: string;
  groupName: string;
  groupEmoji: string;
  date: string;
  title: string;
  emoji: string;
  amountUsd: number;
  currency: string;
  amount: number;
  myImpact: number;
  who: { name: string; avatar: string; color: string };
  whoTo?: { name: string; avatar: string; color: string };
  method?: string;
  hasCashea?: boolean;
};

export function ActivityList({ items, showGroup = true }: { items: ActivityView[]; showGroup?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={a.kind === "expense" ? `/salidas/${a.groupId}` : `/salidas/${a.groupId}`}
            className="flex items-center gap-3 py-3 transition-colors hover:bg-card-2/50"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card-2 text-xl">{a.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold">
                <span className="line-clamp-2 min-w-0 leading-snug">{a.kind === "settlement" ? `${a.who.name} → ${a.whoTo?.name}` : a.title}</span>
                {a.hasCashea && <span className="shrink-0 rounded-md bg-cashea px-1.5 py-px text-[10px] font-bold text-cashea-ink">CASHEA</span>}
              </p>
              <p className="truncate text-xs text-muted">
                {a.kind === "expense" ? `Puso ${a.who.name}` : payMethodOf(a.method ?? "otro").label}
                {showGroup && a.kind === "settlement" && ` · ${a.groupEmoji} ${a.groupName}`} · {prettyDay(a.date)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Money usd={a.amountUsd} className="block text-sm font-semibold" />
              {a.myImpact !== 0 && (
                <span className={clsx("num text-[11px] font-semibold", a.kind === "settlement" ? "text-muted" : a.myImpact > 0 ? "text-mint" : "text-rose")}>
                  {a.kind === "expense" ? (a.myImpact > 0 ? "te deben " : "debes ") : a.myImpact > 0 ? "pagaste " : "recibiste "}
                  <Money usd={Math.abs(a.myImpact)} />
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type CasheaDueView = {
  planId: string;
  groupId: string;
  groupName: string;
  store: string;
  holderName: string;
  holderAvatar: string;
  holderColor: string;
  iAmHolder: boolean;
  n: number;
  installments: number;
  dueDate: string;
  amountUsd: number;
  myPartUsd: number;
};

export function CasheaDueList({ items }: { items: CasheaDueView[] }) {
  const { rates } = useDisplay();
  return (
    <ul className="space-y-2">
      {items.map((c) => {
        const usd = c.iAmHolder ? c.amountUsd : c.myPartUsd;
        return (
          <li key={`${c.planId}-${c.n}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cashea text-center text-[10px] leading-tight font-black text-cashea-ink">
              {c.n}/{c.installments}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{c.store}</p>
              <p className="truncate text-xs text-muted">
                {c.iAmHolder ? "Tu cuota" : `Tu parte para ${c.holderName}`} · {relativeDue(c.dueDate)}
              </p>
            </div>
            <div className="text-right">
              <Money usd={usd} className="block text-sm font-bold" />
              <span className="num text-[11px] text-muted">≈ {fmt(Math.round(usd * rates.bcvUsd), "VES")}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
