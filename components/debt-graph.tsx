"use client";

import { motion } from "motion/react";
import { useDisplay } from "./display";

type Node = { id: string; name: string; avatar: string; color: string; balance: number };
type Edge = { from: string; to: string; amount: number };

/**
 * Red de deudas: cada pana es un nodo en círculo y las flechas animadas
 * corren del que debe al que cobra. El grosor sigue al monto.
 */
export function DebtGraph({ nodes, edges, meId }: { nodes: Node[]; edges: Edge[]; meId: string }) {
  const { show } = useDisplay();
  const size = 340;
  const c = size / 2;
  const R = nodes.length <= 2 ? 95 : 125;
  const pos = new Map(
    nodes.map((n, i) => {
      const a = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
      return [n.id, { x: c + R * Math.cos(a), y: c + R * Math.sin(a) }];
    }),
  );
  const max = Math.max(...edges.map((e) => e.amount), 1);
  const nodeR = 22;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[380px]" role="img" aria-label="Quién le debe a quién">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--text)" />
        </marker>
      </defs>
      <circle cx={c} cy={c} r={R} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
      {edges.map((e, i) => {
        const a = pos.get(e.from)!;
        const b = pos.get(e.to)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        // Curva suave hacia el centro para que varias flechas no se pisen.
        const sx = a.x + ux * (nodeR + 4);
        const sy = a.y + uy * (nodeR + 4);
        const ex = b.x - ux * (nodeR + 8);
        const ey = b.y - uy * (nodeR + 8);
        const mx = (sx + ex) / 2 + (c - (sx + ex) / 2) * 0.25;
        const my = (sy + ey) / 2 + (c - (sy + ey) / 2) * 0.25;
        const w = 1.5 + (e.amount / max) * 3.5;
        const mine = e.from === meId || e.to === meId;
        return (
          <g key={`${e.from}-${e.to}`}>
            <motion.path
              d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`}
              fill="none"
              stroke={mine ? "var(--text)" : "var(--faint)"}
              strokeWidth={w}
              strokeLinecap="round"
              markerEnd="url(#arrow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.2 + i * 0.12 }}
            />
            <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} fill="none" stroke="var(--mango)" strokeWidth={w * 0.6} className="flow" opacity={mine ? 0.9 : 0.5} />
            <foreignObject x={mx - 46} y={my - 12} width={92} height={24}>
              <div className="num mx-auto w-fit rounded-full border border-line-strong bg-card px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shadow-sm">
                {show(e.amount)}
              </div>
            </foreignObject>
          </g>
        );
      })}
      {nodes.map((n, i) => {
        const p = pos.get(n.id)!;
        return (
          <motion.g key={n.id} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.06, type: "spring" }} style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
            <circle cx={p.x} cy={p.y} r={nodeR + 3} fill="var(--card)" />
            <circle cx={p.x} cy={p.y} r={nodeR} fill={n.color} />
            <text x={p.x} y={p.y + 7} textAnchor="middle" fontSize={20}>
              {n.avatar}
            </text>
            <text x={p.x} y={p.y + nodeR + 15} textAnchor="middle" className="fill-[var(--text)] text-[11px] font-semibold">
              {n.id === meId ? "Tú" : n.name.length > 10 ? n.name.slice(0, 9) + "…" : n.name}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
