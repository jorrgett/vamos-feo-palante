"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getLedger, summarize } from "@/lib/data";
import { fmt } from "@/lib/money";
import { notify, pushEnabled, unreadCount } from "@/lib/notify";
import { getRates } from "@/lib/rates";
import { vesPerUsd, type RateSourceId } from "@/lib/rates-shared";

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }),
});

export async function savePushSubscription(sub: unknown) {
  const user = await requireUser();
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return { ok: false as const, error: "Suscripción inválida." };
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  const db = await getDb();
  await db
    .insert(schema.pushSubscriptions)
    .values({ userId: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: ua })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: ua },
    });
  return { ok: true as const };
}

const deviceSchema = z.object({
  push: z.enum(["no-soportado", "ios-instalar", "bloqueado", "apagado", "encendido"]),
  platform: z.enum(["iphone", "android", "computadora", "otro"]),
  installed: z.boolean(),
  subscription: subSchema.optional(),
});

/**
 * Cada teléfono avisa (al abrir la app) si tiene los avisos activos, bloqueados, etc. y cuándo entró.
 * Si el teléfono ya tenía avisos pero el servidor no lo sabe (p. ej. tras limpiar la base), se vuelve a guardar.
 */
export async function reportDevice(input: unknown) {
  const user = await requireUser();
  const parsed = deviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };
  const { subscription, ...status } = parsed.data;
  const db = await getDb();
  await db.update(schema.users).set({ deviceStatus: status, lastSeenAt: new Date() }).where(eq(schema.users.id, user.id));
  if (status.push === "encendido" && subscription) await savePushSubscription(subscription);
  return { ok: true as const };
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireUser();
  const db = await getDb();
  await db
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, user.id)));
  return { ok: true as const };
}

export async function sendTestPush() {
  const user = await requireUser();
  if (!pushEnabled()) return { ok: false as const, error: "Las notificaciones push no están configuradas en el servidor." };
  // Se manda "a sí mismo": el actor va vacío para que sí llegue.
  await notify(
    [{ userId: user.id, kind: "mensaje", emoji: "🤙", title: "¡Funciona!", body: "Así te van a llegar los avisos de los panas.", url: "/avisos" }],
    null,
    { wait: true },
  );
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function markAllRead() {
  const user = await requireUser();
  const db = await getDb();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  // Sin revalidar: la campanita se apaga sola en /avisos y así los nuevos se siguen viendo como nuevos en esta visita.
}

/** Borra avisos propios (uno, varios o todos). Se borran de verdad de la base. */
export async function deleteNotifications(ids: string[] | "todos") {
  const user = await requireUser();
  const db = await getDb();
  const mine = eq(schema.notifications.userId, user.id);
  if (ids === "todos") await db.delete(schema.notifications).where(mine);
  else {
    const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 300);
    if (valid.length === 0) return { ok: true as const };
    await db.delete(schema.notifications).where(and(mine, inArray(schema.notifications.id, valid)));
  }
  return { ok: true as const };
}

export async function myUnreadCount() {
  const user = await requireUser();
  return unreadCount(user.id);
}

const messageSchema = z.object({
  groupId: z.string().uuid(),
  /** "all" = todo el grupo, o la lista de miembros elegidos. */
  to: z.union([z.literal("all"), z.array(z.string().uuid()).min(1).max(60)]),
  text: z.string().trim().min(1, "Escribe el mensaje.").max(300),
  /** Agrega a cada quien lo que debe en el grupo. */
  includeDebt: z.boolean().default(false),
});

export type MessageInput = z.input<typeof messageSchema>;

/** Aviso manual a todo el grupo o a panas específicos. */
export async function sendGroupMessage(input: MessageInput) {
  const user = await requireUser();
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const ledger = await getLedger(d.groupId, user.id);
  if (!ledger) return { ok: false as const, error: "No tienes acceso a esa salida." };
  const targets = ledger.members.filter((m) => !m.leftAt && m.id !== ledger.me.id && (d.to === "all" || d.to.includes(m.id)));
  if (targets.length === 0) return { ok: false as const, error: "Elige al menos a un pana." };

  const summary = d.includeDebt ? summarize(ledger) : null;
  // Con debts por salida, el saldo de cada quien en ESTA salida es lo que le toca pagar o cobrar.
  const rate = d.includeDebt ? vesPerUsd(await getRates(), ledger.group.rateSource as RateSourceId) : 0;
  const sinCuenta = targets.filter((m) => !m.userId).map((m) => m.name);
  const sent = await notify(
    targets
      .filter((m) => m.userId)
      .map((m) => {
        const bal = summary?.balances[m.id] ?? 0;
        const extra =
          summary && bal < -1
            ? `\nSegún la libreta debes ${fmt(-bal, "USD")} (${fmt(Math.round(-bal * rate), "VES")}).`
            : summary && bal > 1
              ? `\nPor cierto: a ti te deben ${fmt(bal, "USD")} 😎`
              : "";
        return {
          userId: m.userId!,
          groupId: d.groupId,
          kind: "mensaje" as const,
          emoji: ledger.group.emoji,
          title: `${ledger.me.name} · ${ledger.group.name}`,
          body: d.text + extra,
          url: `/salidas/${d.groupId}`,
        };
      }),
    user.id,
  );
  return { ok: true as const, sent, sinCuenta };
}


/** Mensaje directo a un pana. */
export async function sendDirect(toUserId: string, text: string) {
  const user = await requireUser();
  const body = text.trim().slice(0, 300);
  if (!body) return { ok: false as const, error: "Escribe el mensaje." };
  if (toUserId === user.id) return { ok: false as const, error: "No te puedes mandar avisos a ti mismo 😅" };
  const sent = await notify([{ userId: toUserId, kind: "mensaje", emoji: "💬", title: `${user.name} te escribió`, body, url: `/panas/${user.id}` }], user.id);
  return { ok: true as const, sent };
}

/** Le pide a un pana que cargue sus datos de pago (para poder pagarle). */
export async function askPayInfo(toUserId: string) {
  const user = await requireUser();
  const sent = await notify(
    [
      {
        userId: toUserId,
        kind: "mensaje",
        emoji: "📲",
        title: `${user.name} quiere pagarte`,
        body: "Pero no tienes tus datos de pago cargados. Agrégalos en tu perfil (pago móvil, Zelle o Binance) para que te puedan pagar.",
        url: "/perfil#datos-de-pago",
      },
    ],
    user.id,
  );
  return { ok: true as const, sent };
}
