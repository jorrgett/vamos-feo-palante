import "server-only";
import webpush from "web-push";
import { after } from "next/server";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";

export type NotifyInput = {
  userId: string;
  groupId?: string | null;
  /** «diario» = el recordatorio automático de cada mañana (se reemplaza al día siguiente). */
  kind: "gasto" | "pago" | "parte" | "recordatorio" | "mensaje" | "cashea" | "grupo" | "diario";
  emoji?: string;
  title: string;
  body?: string;
  url?: string;
};

let vapid: boolean | null = null;
function vapidReady(): boolean {
  if (vapid !== null) return vapid;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (vapid = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:avisos@vamosfeopalante.app", pub, priv);
  return (vapid = true);
}

export const pushEnabled = () => vapidReady();

/**
 * Guarda los avisos (campanita) y los manda por push a los teléfonos de cada quien.
 * Nunca se le avisa a quien hizo la acción.
 */
export async function notify(items: NotifyInput[], actorUserId?: string | null, opts: { wait?: boolean } = {}) {
  const seen = new Set<string>();
  const list = items.filter((i) => {
    if (!i.userId || i.userId === actorUserId) return false;
    const key = `${i.userId}|${i.title}|${i.body ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (list.length === 0) return 0;
  const db = await getDb();
  await db.insert(schema.notifications).values(
    list.map((i) => ({
      userId: i.userId,
      groupId: i.groupId ?? null,
      actorUserId: actorUserId ?? null,
      kind: i.kind,
      emoji: i.emoji ?? "🔔",
      title: i.title.slice(0, 140),
      body: (i.body ?? "").slice(0, 400),
      url: i.url ?? null,
    })),
  );
  if (opts.wait) await sendPush(list);
  else after(() => sendPush(list));
  return list.length;
}

async function sendPush(list: NotifyInput[]) {
  if (!vapidReady()) return;
  const db = await getDb();
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(inArray(schema.pushSubscriptions.userId, [...new Set(list.map((l) => l.userId))]));
  const dead: string[] = [];
  await Promise.all(
    list.flatMap((item) =>
      subs
        .filter((s) => s.userId === item.userId)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: `${item.emoji ?? "🔔"} ${item.title}`, body: item.body ?? "", url: item.url ?? "/avisos", tag: `${item.kind}-${item.groupId ?? ""}` }),
              { TTL: 60 * 60 * 24, urgency: item.kind === "recordatorio" || item.kind === "cashea" ? "high" : "normal" },
            );
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) dead.push(s.id);
            else console.warn("[push]", code, (e as Error).message);
          }
        }),
    ),
  );
  if (dead.length) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, dead));
}

export async function unreadCount(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function listNotifications(userId: string, limit = 80) {
  const db = await getDb();
  return db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

/** userId de cada miembro con cuenta (los panas sin cuenta no reciben avisos). */
export function userIdsOf(members: { id: string; userId: string | null }[], memberIds: string[]): Map<string, string> {
  const set = new Set(memberIds);
  return new Map(members.filter((m) => set.has(m.id) && m.userId).map((m) => [m.id, m.userId!]));
}
