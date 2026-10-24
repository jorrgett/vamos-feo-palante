"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDisplay } from "./display";
import { fmtNumber } from "@/lib/money";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

function compactNum(v: number) {
  if (v >= 1_000_000) return `${fmtNumber(v / 1_000_000, v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 1000) return `${fmtNumber(v / 1000, v % 1000 ? 1 : 0)}K`;
  return fmtNumber(v, 0);
}

function Tooltip({ x, y, children, width }: { x: number; y: number; children: React.ReactNode; width: number }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line-strong bg-card px-3 py-2 text-xs shadow-xl"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

/** Columnas (una serie): lo que consumiste por mes. */
export function ColumnChart({ data, height = 180 }: { data: { key: string; label: string; usd: number }[]; height?: number }) {
  const { convert, show } = useDisplay();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => convert(d.usd) / 100);
  const max = niceMax(Math.max(...values, 0));
  const padL = 36;
  const padB = 24;
  const padT = 22;
  const innerW = Math.max(0, width - padL - 4);
  const innerH = height - padB - padT;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.5);
  const ticks = [0, max / 2, max];
  const maxIdx = values.indexOf(Math.max(...values));
  const last = data.length - 1;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Consumo por mes">
          {ticks.map((t) => {
            const y = padT + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line x1={padL} x2={width} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={padL - 8} y={y + 3} textAnchor="end" className="num fill-[var(--faint)] text-[10px]">
                  {compactNum(t)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const v = values[i];
            const h = Math.max(v > 0 ? 3 : 0, (v / max) * innerH);
            const x = padL + band * i + band / 2 - barW / 2;
            const y = padT + innerH - h;
            const r = Math.min(4, h);
            const path = h > 0 ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z` : "";
            const showLabel = v > 0 && (i === maxIdx || i === last);
            return (
              <g
                key={d.key}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                className="outline-none"
              >
                <rect x={padL + band * i} y={padT} width={band} height={innerH + padB} fill="transparent" />
                {path && (
                  <motion.path
                    d={path}
                    fill="var(--viz-bar)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ transformOrigin: `${x + barW / 2}px ${padT + innerH}px` }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 140, damping: 18 }}
                  />
                )}
                {showLabel && hover === null && (
                  <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="num fill-[var(--muted)] text-[10px] font-semibold">
                    {compactNum(v)}
                  </text>
                )}
                <text x={padL + band * i + band / 2} y={height - 6} textAnchor="middle" className="fill-[var(--muted)] text-[11px] capitalize">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={padL + band * hover + band / 2} y={padT + innerH - (values[hover] / max) * innerH} width={width}>
          <div className="num text-sm font-bold">{show(data[hover].usd)}</div>
          <div className="text-muted capitalize">{data[hover].label}</div>
        </Tooltip>
      )}
    </div>
  );
}

/** Barras horizontales de una sola serie (p. ej. por categoría). */
export function BarList({ data }: { data: { id: string; label: string; emoji: string; usd: number }[] }) {
  const { show } = useDisplay();
  const max = Math.max(...data.map((d) => d.usd), 1);
  return (
    <ul className="space-y-3">
      {data.map((d, i) => (
        <li key={d.id} className="group" title={`${d.label}: ${show(d.usd)}`}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 truncate">
              <span aria-hidden>{d.emoji}</span>
              {d.label}
            </span>
            <span className="num text-xs font-semibold text-muted">{show(d.usd)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-card-2">
            <motion.div
              className="h-2 rounded-full bg-viz-bar group-hover:brightness-110"
              initial={{ width: 0 }}
              whileInView={{ width: `${(d.usd / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Saldos por persona: barras divergentes desde el cero (derecha = le deben, izquierda = debe). */
export function BalanceBars({ rows }: { rows: { id: string; name: string; emoji: string; usd: number; me?: boolean }[] }) {
  const { show } = useDisplay();
  const max = Math.max(...rows.map((r) => Math.abs(r.usd)), 1);
  return (
    <ul className="space-y-2.5" aria-label="Saldo de cada persona">
      {rows.map((r, i) => {
        const pct = (Math.abs(r.usd) / max) * 50;
        const pos = r.usd > 0;
        const zero = Math.abs(r.usd) < 1;
        return (
          <li key={r.id} className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,9rem)_1fr]">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span aria-hidden>{r.emoji}</span>
              <span className={`truncate ${r.me ? "font-bold" : ""}`}>{r.me ? `${r.name} (tú)` : r.name}</span>
            </span>
            <div className="relative h-7">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
              {!zero && (
                <motion.div
                  className="absolute top-1/2 h-3.5 -translate-y-1/2"
                  style={{
                    background: pos ? "var(--viz-pos)" : "var(--viz-neg)",
                    borderRadius: pos ? "0 4px 4px 0" : "4px 0 0 4px",
                    left: pos ? "50%" : undefined,
                    right: pos ? undefined : "50%",
                  }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${pct}%` }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span
                className="num absolute top-1/2 -translate-y-1/2 text-xs font-semibold whitespace-nowrap text-text"
                style={
                  zero
                    ? { left: "50%", transform: "translate(-50%,-50%)", background: "var(--card)", padding: "0 6px" }
                    : pos
                      ? pct > 30
                        ? { right: `${50 - pct + 1}%`, color: "white" }
                        : { left: `calc(${50 + pct}% + 6px)` }
                      : pct > 30
                        ? { left: `${50 - pct + 1}%`, color: "white" }
                        : { right: `calc(${50 + pct}% + 6px)` }
                }
              >
                {zero ? "a mano ✓" : show(r.usd, { sign: true })}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export type LineSeries = { key: string; label: string; color: string; values: (number | null)[] };

/** Líneas con cursor: histórico de tasas. Un solo eje (todas en Bs por unidad). */
export function LineChart({ dates, series, height = 260 }: { dates: string[]; series: LineSeries[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  // Eje con marcas redondas (p. ej. 200 · 400 · 600 · 800 · 1.000).
  const step = niceMax(((hi - lo) || hi || 1) / 4);
  const min = Math.max(0, Math.floor(lo / step) * step);
  const max = Math.max(min + step, Math.ceil(hi / step) * step);
  const x = (i: number) => padL + (dates.length <= 1 ? innerW / 2 : (i / (dates.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;
  const ticks = useMemo(() => Array.from({ length: Math.round((max - min) / step) + 1 }, (_, k) => min + k * step), [min, max, step]);
  const xTicks = useMemo(() => {
    const n = Math.min(5, dates.length);
    return Array.from({ length: n }, (_, k) => Math.round((k * (dates.length - 1)) / Math.max(1, n - 1)));
  }, [dates.length]);
  const fmtDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("es-VE", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round((px / rect.width) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted" aria-label="Leyenda">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && dates.length > 0 && (
          <svg width={width} height={height} role="img" aria-label="Histórico de tasas">
            {ticks.map((t, k) => (
              <g key={k}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" />
                <text x={padL - 8} y={y(t) + 3} textAnchor="end" className="num fill-[var(--faint)] text-[10px]">
                  {compactNum(Math.round(t))}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
                {fmtDate(dates[i])}
              </text>
            ))}
            {series.map((s, k) => (
              <motion.path
                key={s.key}
                d={paths[k]}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: k * 0.15, ease: "easeInOut" }}
              />
            ))}
            {series.map((s) => {
              const lastIdx = s.values.findLastIndex((v) => v != null);
              if (lastIdx < 0) return null;
              return <circle key={s.key} cx={x(lastIdx)} cy={y(s.values[lastIdx]!)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />;
            })}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--line-strong)" />
                {series.map((s) =>
                  s.values[hover] != null ? (
                    <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                  ) : null,
                )}
              </g>
            )}
            <rect
              x={padL}
              y={padT}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover !== null && width > 0 && (
          <Tooltip x={x(hover)} y={padT + 10} width={width}>
            <div className="mb-1 font-semibold text-muted">{fmtDate(dates[hover])}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="num font-bold">{s.values[hover] != null ? fmtNumber(s.values[hover]!) : "—"}</span>
              </div>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Mini tendencia sin ejes para las tarjetas de tasas. */
export function Sparkline({ values, color, width = 96, height = 32 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 3 - ((v - lo) / span) * (height - 6)}`);
  const lastY = height - 3 - ((values[values.length - 1] - lo) / span) * (height - 6);
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      <circle cx={width} cy={lastY} r={3} fill={color} />
    </svg>
  );
}
