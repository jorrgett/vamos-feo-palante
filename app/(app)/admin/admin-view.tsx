"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BellRing } from "lucide-react";
import { nudgePush } from "@/app/actions/admin";
import type { AdminPana, PushHealth } from "@/lib/community";
import { Avatar, Button, useToast } from "@/components/ui";

type Row = Omit<AdminPana, "joinedAt" | "lastSeenAt" | "devices"> & {
  joinedAt: number;
  lastSeenAt: number | null;
  devices: { label: string; since: number }[];
};

const HEALTH: Record<PushHealth, { emoji: string; label: string; hint: string; tone: string }> = {
  activo: { emoji: "✅", label: "Avisos activos", hint: "", tone: "bg-mint-soft text-mint" },
  bloqueado: { emoji: "⛔", label: "Los bloqueó", hint: "Tiene que permitirlos en los ajustes del teléfono.", tone: "bg-rose-soft text-rose" },
  instalar: { emoji: "📲", label: "Falta instalar la app", hint: "En iPhone los avisos solo llegan con la app en la pantalla de inicio.", tone: "bg-gold-soft text-gold" },
  "no-soportado": { emoji: "📵", label: "Su navegador no los soporta", hint: "Que la abra en Chrome (Android) o la agregue a inicio desde Safari (iPhone).", tone: "bg-card-2 text-muted" },
  apagado: { emoji: "⏳", label: "No los ha activado", hint: "Entró a la app pero no los ha encendido.", tone: "bg-gold-soft text-gold" },
  "sin-datos": { emoji: "❔", label: "Sin datos todavía", hint: "No ha abierto la app desde que se agregó este panel.", tone: "bg-card-2 text-muted" },
};

const PLATFORM = { iphone: "iPhone", android: "Android", computadora: "computadora", otro: "otro equipo" } as const;

function ago(ts: number, now: number) {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 2) return "ahorita";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export function AdminView({ panas, now }: { panas: Row[]; now: number }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = panas.filter((p) => p.health === "activo");
  const missing = panas.filter((p) => p.health !== "activo");
  const nudgeable = missing.filter((p) => !p.isMe);
  const pct = panas.length ? active.length / panas.length : 0;
  const counts = (Object.keys(HEALTH) as PushHealth[]).map((h) => ({ h, n: panas.filter((p) => p.health === h).length })).filter((c) => c.n > 0);

  const nudge = (ids: string[]) =>
    start(async () => {
      const r = await nudgePush(ids);
      if (!r.ok) return toast(r.error, "error");
      if (r.sent) toast(r.sent === 1 ? "Listo, le llegó el aviso para que los active 🔔" : `Listo, les llegó el aviso a ${r.sent} panas 🔔`);
      else toast(r.skipped ? "Ya se lo pediste hace poco: espera unas horas" : "Nadie pendiente 🎉", "info");
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <section className="sticker bg-sun p-5 text-sun-ink">
        <p className="text-sm font-semibold opacity-75">Avisos activos</p>
        <p className="display mt-1 text-4xl font-extrabold">
          {active.length} <span className="text-xl opacity-70">de {panas.length} panas</span>
        </p>
        <div className="mt-3 h-3 overflow-clip rounded-full border-2 border-ink bg-card">
          <motion.div className="h-full bg-mint" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {counts.map(({ h, n }) => (
            <span key={h} className="rounded-full border-2 border-ink bg-card px-2.5 py-1 text-xs font-bold text-text">
              {HEALTH[h].emoji} {n} {HEALTH[h].label.toLowerCase()}
            </span>
          ))}
        </div>
        {nudgeable.length > 0 && (
          <Button className="mt-4 w-full" variant="soft" loading={pending} onClick={() => nudge(nudgeable.map((p) => p.id))}>
            <BellRing size={16} /> Pedirle a {nudgeable.length === 1 ? "1 pana" : `los ${nudgeable.length}`} que los active{nudgeable.length === 1 ? "" : "n"}
          </Button>
        )}
      </section>

      {missing.length > 0 && <List title="Les faltan los avisos" rows={missing} now={now} pending={pending} onNudge={(id) => nudge([id])} />}
      {active.length > 0 && <List title="Con avisos activos" rows={active} now={now} pending={pending} />}

      <p className="text-center text-xs text-muted">
        Se actualiza solo cada vez que alguien abre la app. El aviso para activarlos les llega a la campanita de la app.
      </p>
    </div>
  );
}

function List({ title, rows, now, pending, onNudge }: { title: string; rows: Row[]; now: number; pending: boolean; onNudge?: (id: string) => void }) {
  return (
    <section>
      <h2 className="display mb-3 text-xl font-bold">
        {title} <span className="chip align-middle">{rows.length}</span>
      </h2>
      <ul className="card divide-y divide-line overflow-clip">
        {rows.map((p) => {
          const h = HEALTH[p.health];
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <Avatar emoji={p.avatar} color={p.color} size={42} />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/panas/${p.id}`} className="block truncate font-semibold underline-offset-2 hover:underline">
                  {p.name} {p.isMe && <span className="text-xs font-normal text-muted">(tú)</span>} <span className="text-xs font-normal text-muted">· ver sus cuentas ›</span>
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", h.tone)}>
                    {h.emoji} {h.label}
                  </span>
                  {p.devices.length > 0 && <span className="text-xs text-muted">en {[...new Set(p.devices.map((d) => d.label))].join(" y ")}</span>}
                </p>
                {h.hint && <p className="mt-1 text-xs text-muted">{h.hint}</p>}
                <p className="mt-1 text-xs text-faint">
                  {p.lastSeenAt ? `Entró ${ago(p.lastSeenAt, now)}` : `Se unió ${ago(p.joinedAt, now)}`}
                  {p.platform && ` · ${PLATFORM[p.platform]}${p.platform === "iphone" || p.platform === "android" ? (p.installed ? " (app instalada)" : " (navegador)") : ""}`}
                  {!p.hasPayInfo && " · sin datos de pago"}
                  {!p.onboarded && " · no terminó la bienvenida"}
                </p>
              </div>
              {onNudge && !p.isMe && (
                <div className="flex basis-full justify-end sm:basis-auto">
                  <Button size="sm" variant="soft" disabled={pending} onClick={() => onNudge(p.id)}>
                    <BellRing size={14} /> Pedirle que los active
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
