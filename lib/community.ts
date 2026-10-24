import "server-only";
import { asc, count, eq, ne } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "./db";
import { inviteCode } from "./ids";

// Todos los panas registrados están conectados entre sí; para entrar hace falta el link de invitación.

export async function getInviteCode(): Promise<string> {
  const db = await getDb();
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "invite_code")).limit(1);
  if (row) return row.value;
  const code = inviteCode(10);
  await db.insert(schema.appSettings).values({ key: "invite_code", value: code }).onConflictDoNothing();
  const [again] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "invite_code")).limit(1);
  return again?.value ?? code;
}

export async function rotateInviteCode(): Promise<string> {
  const db = await getDb();
  const code = inviteCode(10);
  await db
    .insert(schema.appSettings)
    .values({ key: "invite_code", value: code })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: code, updatedAt: new Date() } });
  return code;
}

export async function userCount(): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ n: count() }).from(schema.users);
  return Number(r?.n ?? 0);
}

export type Pana = { id: string; name: string; avatar: string; color: string; hasPayInfo: boolean; isMe: boolean };

/** Todos los usuarios activos (los que se pueden agregar a una salida). */
export async function listPanas(meId: string): Promise<Pana[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, avatar: schema.users.avatar, color: schema.users.color, payInfo: schema.users.payInfo })
    .from(schema.users)
    .orderBy(asc(schema.users.name));
  return rows
    .map((u) => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      color: u.color,
      hasPayInfo: hasPayInfo(u.payInfo),
      isMe: u.id === meId,
    }))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe));
}

export function hasPayInfo(p: schema.PayInfo | null | undefined): boolean {
  return !!(p?.pagoMovil?.telefono || p?.zelle || p?.binance);
}

export async function getPayInfo(userId: string): Promise<schema.PayInfo> {
  const db = await getDb();
  const [r] = await db.select({ p: schema.users.payInfo }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return r?.p ?? {};
}

export async function otherUsersExist(meId: string) {
  const db = await getDb();
  const [r] = await db.select({ n: count() }).from(schema.users).where(ne(schema.users.id, meId));
  return Number(r?.n ?? 0) > 0;
}

// ── Administrador ─────────────────────────────────────────────────────────
// El administrador es el primero que se registró (si borra su cuenta, pasa al siguiente).

export const adminUserId = cache(async (): Promise<string | null> => {
  const db = await getDb();
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).orderBy(asc(schema.users.createdAt)).limit(1);
  return u?.id ?? null;
});

export const isAdmin = async (userId: string) => (await adminUserId()) === userId;

export type PushHealth = "activo" | "bloqueado" | "instalar" | "no-soportado" | "apagado" | "sin-datos";

export type AdminPana = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  color: string;
  isMe: boolean;
  joinedAt: Date;
  lastSeenAt: Date | null;
  onboarded: boolean;
  hasPayInfo: boolean;
  health: PushHealth;
  /** Teléfonos/computadoras con avisos activos. */
  devices: { label: string; since: Date }[];
  platform: schema.DeviceStatus["platform"] | null;
  installed: boolean | null;
};

const deviceLabel = (ua: string | null) => {
  const s = ua ?? "";
  if (/iphone|ipad|ipod/i.test(s)) return "iPhone";
  if (/android/i.test(s)) return "Android";
  if (/macintosh|windows|linux|cros/i.test(s)) return "Computadora";
  return "Otro";
};

/** Quién tiene los avisos activos y quién no (solo para el administrador). */
export async function adminOverview(meId: string): Promise<AdminPana[]> {
  const db = await getDb();
  const [users, subs] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.createdAt)),
    db
      .select({ userId: schema.pushSubscriptions.userId, ua: schema.pushSubscriptions.userAgent, at: schema.pushSubscriptions.createdAt })
      .from(schema.pushSubscriptions),
  ]);
  return users.map((u) => {
    const devices = subs.filter((s) => s.userId === u.id).map((s) => ({ label: deviceLabel(s.ua), since: s.at }));
    const ds = u.deviceStatus;
    const health: PushHealth = devices.length
      ? "activo"
      : !ds
        ? "sin-datos"
        : ds.push === "bloqueado"
          ? "bloqueado"
          : ds.push === "ios-instalar"
            ? "instalar"
            : ds.push === "no-soportado"
              ? "no-soportado"
              : "apagado";
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      color: u.color,
      isMe: u.id === meId,
      joinedAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      onboarded: !!u.onboardedAt,
      hasPayInfo: hasPayInfo(u.payInfo),
      health,
      devices,
      platform: ds?.platform ?? null,
      installed: ds?.installed ?? null,
    };
  });
}
