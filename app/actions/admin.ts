"use server";

import { and, eq, gt, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { adminOverview, isAdmin, type PushHealth } from "@/lib/community";
import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";

const NUDGE: Record<Exclude<PushHealth, "activo">, { emoji: string; title: string; body: string }> = {
  bloqueado: {
    emoji: "🔕",
    title: "Tienes los avisos bloqueados",
    body: "Así no te enteras cuando te cobren o te paguen. Permítelos en los ajustes del teléfono: toca aquí y te digo cómo.",
  },
  instalar: {
    emoji: "📲",
    title: "Instala la app para recibir avisos",
    body: "En iPhone los avisos solo llegan con la app en la pantalla de inicio: Safari → Compartir → Agregar a inicio. Después actívalos aquí.",
  },
  "no-soportado": {
    emoji: "📵",
    title: "Tu navegador no recibe avisos",
    body: "Abre la app en Chrome (Android) o agrégala a inicio desde Safari (iPhone) para enterarte de los cobros y pagos.",
  },
  apagado: {
    emoji: "🔔",
    title: "Activa los avisos",
    body: "Así te enteras al momento cuando te cobren o te paguen. Toca aquí y actívalos en un toque.",
  },
  "sin-datos": {
    emoji: "🔔",
    title: "Activa los avisos",
    body: "Así te enteras al momento cuando te cobren o te paguen. Toca aquí y actívalos en un toque.",
  },
};

/** El administrador le pide a uno (o a todos los que faltan) que active los avisos. */
export async function nudgePush(userIds: string[]) {
  const me = await requireUser();
  if (!(await isAdmin(me.id))) return { ok: false as const, error: "Solo el administrador puede hacer esto." };
  const pending = (await adminOverview(me.id)).filter((p) => !p.isMe && p.health !== "activo" && userIds.includes(p.id));
  if (pending.length === 0) return { ok: true as const, sent: 0, skipped: 0 };

  // No repetir el mismo recordatorio en menos de 12 horas.
  const db = await getDb();
  const recent = await db
    .select({ userId: schema.notifications.userId, title: schema.notifications.title })
    .from(schema.notifications)
    .where(
      and(
        inArray(
          schema.notifications.userId,
          pending.map((p) => p.id),
        ),
        gt(schema.notifications.createdAt, new Date(Date.now() - 12 * 3_600_000)),
        eq(schema.notifications.kind, "recordatorio"),
      ),
    );
  const fresh = pending.filter((p) => {
    const health = p.health as Exclude<PushHealth, "activo">;
    return !recent.some((r) => r.userId === p.id && r.title === NUDGE[health].title);
  });
  const sent = await notify(
    fresh.map((p) => {
      const n = NUDGE[p.health as Exclude<PushHealth, "activo">];
      return { userId: p.id, kind: "recordatorio" as const, emoji: n.emoji, title: n.title, body: n.body, url: "/avisos" };
    }),
    me.id,
  );
  revalidatePath("/admin");
  return { ok: true as const, sent, skipped: pending.length - fresh.length };
}
