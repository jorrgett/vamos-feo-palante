"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { ActivityList, type ActivityView } from "@/components/blocks";
import { Money } from "@/components/display";
import { Button, EmptyState, Segmented } from "@/components/ui";
import { monthLabel } from "@/lib/dates";
import { payMethodOf } from "@/lib/constants";

type Item = ActivityView & { category?: string };

export function HistoryView({ items, groups }: { items: Item[]; groups: { id: string; name: string; emoji: string }[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [kind, setKind] = useState<"all" | "expense" | "settlement">("all");
  const [month, setMonth] = useState("all");
  const months = useMemo(() => [...new Set(items.map((i) => i.date.slice(0, 7)))].sort().reverse(), [items]);

  const filtered = items.filter(
    (i) =>
      (group === "all" || i.groupId === group) &&
      (kind === "all" || i.kind === kind) &&
      (month === "all" || i.date.startsWith(month)) &&
      (!q || `${i.title} ${i.who.name} ${i.whoTo?.name ?? ""} ${i.groupName}`.toLowerCase().includes(q.toLowerCase())),
  );
  const spent = filtered.filter((i) => i.kind === "expense").reduce((a, i) => a + i.amountUsd, 0);
  const myNet = filtered.reduce((a, i) => a + i.myImpact, 0);

  const exportCsv = () => {
    const head = ["fecha", "tipo", "salida", "concepto", "categoria", "pagó", "recibió", "moneda", "monto", "monto_usd", "mi_efecto_usd", "método"];
    const rows = filtered.map((i) => [
      i.date,
      i.kind === "expense" ? "gasto" : "pago",
      i.groupName,
      i.title,
      i.category ?? "",
      i.who.name,
      i.whoTo?.name ?? "",
      i.currency,
      (i.amount / 100).toFixed(2),
      (i.amountUsd / 100).toFixed(2),
      (i.myImpact / 100).toFixed(2),
      i.method ? payMethodOf(i.method).label : "",
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pa-lante-historial-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="entra space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl font-extrabold sm:text-4xl">Historial</h1>
          <p className="mt-1 text-muted">Todo lo que se ha anotado en tus salidas y pagos.</p>
        </div>
        <Button variant="soft" onClick={exportCsv} disabled={!filtered.length}>
          <Download size={16} /> Exportar CSV
        </Button>
      </div>

      <div className="card space-y-3 p-4">
        <div className="relative">
          <Search size={17} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input className="field pl-10" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className="field" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Salida">
            <option value="all">Todas las salidas</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji} {g.name}
              </option>
            ))}
          </select>
          <select className="field" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes">
            <option value="all">Todos los meses</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)} {m.slice(0, 4)}
              </option>
            ))}
          </select>
          <Segmented
            name="hist-kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "Todo" },
              { value: "expense", label: "Gastos" },
              { value: "settlement", label: "Pagos" },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="card min-w-0 p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted sm:text-xs">Movimientos</p>
          <p className="num mt-1 text-base font-bold sm:text-xl">{filtered.length}</p>
        </div>
        <div className="card min-w-0 p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted sm:text-xs">Gastado</p>
          <Money usd={spent} compact className="mt-1 block text-base font-bold whitespace-nowrap sm:text-xl" />
        </div>
        <div className="card min-w-0 p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted sm:text-xs">Tu neto</p>
          <Money usd={myNet} sign className="mt-1 block text-base font-bold whitespace-nowrap sm:text-xl" />
        </div>
      </div>

      {filtered.length ? (
        <div className="card px-4">
          <ActivityList items={filtered} />
        </div>
      ) : (
        <EmptyState emoji="🔎" title="Nada por aquí">
          Prueba con otros filtros.
        </EmptyState>
      )}
    </div>
  );
}
