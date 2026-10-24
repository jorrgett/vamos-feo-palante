"use server";

import { and, eq, ilike, inArray, isNotNull, ne, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { getInviteCode, userCount } from "@/lib/community";
import { mailEnabled, resetEmail, sendMail } from "@/lib/mail";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  clientIp,
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  SESSION_COOKIE,
  recordFailedAttempt,
  requireUser,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/auth";
import { AVATARS, MEMBER_COLORS } from "@/lib/constants";
import { isPhoto, photoPath } from "@/lib/avatar";
import { LATEST_RELEASE } from "@/lib/novedades";
import { getDb, schema } from "@/lib/db";

export type FormState = { error?: string; ok?: string; fields?: Record<string, string> } | undefined;

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/inicio";
};

const registerSchema = z.object({
  name: z.string().trim().min(2, "Tu nombre debe tener al menos 2 letras.").max(40),
  email: z.string().trim().toLowerCase().email("Ese correo no se ve bien."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200),
});

export async function register(_: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(["name", "email", "password"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { name: raw.name, email: raw.email } };
  const { name, email, password } = parsed.data;

  const ipKey = `reg:${await clientIp()}`;
  if (await tooManyAttempts(ipKey)) return { error: "Demasiados intentos. Espera unos minutos.", fields: { name, email } };

  // Solo con invitación (el primero de todos entra libre).
  const invite = String(formData.get("invitacion") ?? "").trim();
  if ((await userCount()) > 0 && invite !== (await getInviteCode())) {
    await recordFailedAttempt(ipKey);
    return { error: "Para crear cuenta necesitas el link de invitación de un pana. Pídeselo 🙏", fields: { name, email } };
  }

  const db = await getDb();
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (exists) {
    await recordFailedAttempt(ipKey);
    return { error: "Ya existe una cuenta con ese correo. ¿Quieres entrar?", fields: { name, email } };
  }

  const [user] = await db
    .insert(schema.users)
    .values({
      name,
      email,
      passwordHash: await hashPassword(password),
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      color: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
      // Los nuevos no ven el pantallazo de novedades viejas (ya tienen la bienvenida).
      seenNovedades: LATEST_RELEASE,
    })
    .returning({ id: schema.users.id });

  await createSession(user.id);
  redirect("/bienvenida");
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y tu contraseña.", fields: { email } };

  const key = `login:${email}`;
  const ipKey = `login-ip:${await clientIp()}`;
  if ((await tooManyAttempts(key)) || (await tooManyAttempts(ipKey)))
    return { error: "Demasiados intentos fallidos. Espera 15 minutos.", fields: { email } };

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    await recordFailedAttempt(key);
    await recordFailedAttempt(ipKey);
    return { error: "Correo o contraseña incorrectos.", fields: { email } };
  }
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

// ── Avatar: emoji o foto ────────────────────────────────────────────────

/** Un emoji corto, o la foto que ya tiene esa persona (no se acepta la ruta de la foto de otro). */
const avatarOk = (avatar: string, current: string) => (isPhoto(avatar) ? avatar === current : avatar.length <= 16 && [...avatar].length <= 4);

/** Si cambió la foto por un emoji, la foto se borra de la base. */
async function dropPhotoIfReplaced(userId: string, current: string, next: string) {
  if (isPhoto(current) && !isPhoto(next)) {
    const db = await getDb();
    await db.delete(schema.userPhotos).where(eq(schema.userPhotos.userId, userId));
  }
}

function photoMime(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Si una foto no abre en el teléfono, queda anotado en los logs del servidor (sin guardar nada en la base). */
export async function reportPhotoProblem(detail: string) {
  const user = await getCurrentUser();
  const ua = (await headers()).get("user-agent") ?? "";
  console.warn("[foto] no abrió:", JSON.stringify({ user: user?.id ?? null, detail: String(detail).slice(0, 300), ua: ua.slice(0, 200) }));
}

/** Sube la foto de perfil (el teléfono ya la manda recortada y chiquita) y la pone como avatar en todas sus salidas. */
export async function uploadPhoto(formData: FormData): Promise<{ ok: true; avatar: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "No llegó la foto. Intenta de nuevo." };
  if (file.size > 400_000) return { ok: false, error: "La foto pesa mucho. Prueba con otra." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = photoMime(bytes);
  if (!mime) return { ok: false, error: "Eso no parece una foto (usa JPG o PNG)." };
  const db = await getDb();
  const data = Buffer.from(bytes).toString("base64");
  await db
    .insert(schema.userPhotos)
    .values({ userId: user.id, mime, data })
    .onConflictDoUpdate({ target: schema.userPhotos.userId, set: { mime, data, updatedAt: new Date() } });
  const avatar = photoPath(user.id, Date.now());
  await db.update(schema.users).set({ avatar }).where(eq(schema.users.id, user.id));
  await db.update(schema.members).set({ avatar }).where(eq(schema.members.userId, user.id));
  revalidatePath("/", "layout");
  return { ok: true, avatar };
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(40),
  avatar: z.string().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  displayCurrency: z.enum(["USD", "VES", "EUR"]),
  rateSource: z.enum(["bcv", "usdt", "eur"]),
  pmBanco: z.string().max(60).optional(),
  pmTelefono: z.string().max(20).optional(),
  pmCedula: z.string().max(15).optional(),
  zelle: z.string().max(80).optional(),
  binance: z.string().max(80).optional(),
  nota: z.string().max(140).optional(),
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(
    Object.keys(profileSchema.shape).map((k) => [k, formData.get(k) === null ? undefined : String(formData.get(k))]),
  );
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { error: "Revisa los datos del perfil." };
  const d = parsed.data;
  if (!avatarOk(d.avatar, user.avatar)) return { error: "Elige un emoji o sube tu foto." };
  await dropPhotoIfReplaced(user.id, user.avatar, d.avatar);
  const db = await getDb();
  await db
    .update(schema.users)
    .set({
      name: d.name,
      avatar: d.avatar,
      color: d.color,
      displayCurrency: d.displayCurrency,
      rateSource: d.rateSource,
      payInfo: {
        pagoMovil: { banco: d.pmBanco || undefined, telefono: d.pmTelefono || undefined, cedula: d.pmCedula || undefined },
        zelle: d.zelle || undefined,
        binance: d.binance || undefined,
        nota: d.nota || undefined,
      },
    })
    .where(eq(schema.users.id, user.id));
  // El avatar y el nombre se reflejan en todos sus grupos.
  await db
    .update(schema.members)
    .set({ name: d.name, avatar: d.avatar, color: d.color })
    .where(eq(schema.members.userId, user.id));
  revalidatePath("/", "layout");
  return { ok: "Perfil guardado." };
}

export async function setDisplayCurrency(currency: "USD" | "VES" | "EUR", rateSource?: "bcv" | "usdt" | "eur") {
  const user = await requireUser();
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ displayCurrency: currency, ...(rateSource ? { rateSource } : {}) })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
}

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  const db = await getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(current, row.passwordHash))) return { error: "La contraseña actual no coincide." };
  await db.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, user.id));
  // Cierra las demás sesiones.
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  await createSession(user.id);
  return { ok: "Contraseña actualizada. Cerramos tus otras sesiones." };
}

/**
 * Elimina la cuenta de verdad (borrado físico). Queda:
 *  · Nada del usuario: fila, correo, contraseña, sesiones, datos de pago, avisos y teléfonos.
 *  · En grupos que comparte con otros con cuenta, su lugar pasa a "Ex pana" (sin nombre ni vínculo)
 *    para que las cuentas de los demás sigan cuadrando.
 *  · Los grupos donde nadie más tiene cuenta se borran completos.
 */
export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const confirmText = String(formData.get("confirm") ?? "")
    .trim()
    .toUpperCase();
  if (confirmText !== "ELIMINAR") return { error: "Escribe ELIMINAR para confirmar." };
  const db = await getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) return { error: "La contraseña no coincide." };

  await db.transaction(async (tx) => {
    const mine = await tx.select().from(schema.members).where(eq(schema.members.userId, user.id));
    const sharedGroups: string[] = [];
    for (const m of mine) {
      const others = await tx
        .select({ id: schema.members.id })
        .from(schema.members)
        .where(and(eq(schema.members.groupId, m.groupId), isNotNull(schema.members.userId), ne(schema.members.userId, user.id)))
        .limit(1);
      if (others.length === 0) {
        // Nadie más tiene cuenta en ese grupo: se borra completo (miembros, cuentas, pagos, Cashea y avisos van en cascada).
        await tx.delete(schema.groups).where(eq(schema.groups.id, m.groupId));
      } else {
        sharedGroups.push(m.groupId);
        await tx
          .update(schema.members)
          .set({ userId: null, name: "Ex pana", avatar: "👤", color: "#9CA3AF", role: "member", leftAt: m.leftAt ?? new Date() })
          .where(eq(schema.members.id, m.id));
      }
    }
    // Avisos que generó para otros y avisos de esos grupos que lo mencionan por nombre.
    await tx.delete(schema.notifications).where(eq(schema.notifications.actorUserId, user.id));
    if (sharedGroups.length && row.name.trim().length >= 3) {
      const like = `%${row.name.trim().replace(/[%_\\]/g, "")}%`;
      await tx
        .delete(schema.notifications)
        .where(
          and(
            inArray(schema.notifications.groupId, sharedGroups),
            or(ilike(schema.notifications.title, like), ilike(schema.notifications.body, like)),
          ),
        );
    }
    await tx.delete(schema.loginAttempts).where(inArray(schema.loginAttempts.key, [`login:${row.email}`, `reset:${row.email}`, `ia:${row.id}`]));
    // La fila del usuario arrastra sesiones, avisos recibidos, suscripciones push, su foto y los comprobantes que subió (ON DELETE CASCADE);
    // las referencias de "creado por" quedan en NULL.
    await tx.delete(schema.users).where(eq(schema.users.id, user.id));
  });

  (await cookies()).delete(SESSION_COOKIE);
  redirect("/?adios=1");
}

// ── Olvidé mi contraseña ────────────────────────────────────────────────

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Escribe el correo con el que te registraste.", fields: { email } };
  // En local sin Gmail configurado, el link se imprime en la consola del servidor para poder probar.
  const devOnly = !mailEnabled() && process.env.NODE_ENV === "development";
  if (!mailEnabled() && !devOnly) return { error: "La recuperación por correo todavía no está activada. Avísale al que administra la app.", fields: { email } };
  const ipKey = `reset:${await clientIp()}`;
  const mailKey = `reset:${email}`;
  if ((await tooManyAttempts(ipKey)) || (await tooManyAttempts(mailKey))) return { error: "Ya pediste varios links. Espera 15 minutos.", fields: { email } };
  await recordFailedAttempt(ipKey);
  await recordFailedAttempt(mailKey);

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, user.id));
    await db.insert(schema.passwordResets).values({ id: sha(token), userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000) });
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
    const link = `${origin}/restablecer?token=${token}`;
    const { text, html } = resetEmail(user.name, link);
    if (devOnly) {
      console.log("[correo:dev] link para restablecer:", link);
    } else {
      try {
        await sendMail(user.email, "Tu link para crear una contraseña nueva 🤙", text, html);
      } catch (e) {
        console.error("[correo]", (e as Error).message);
        return { error: "No pude mandar el correo ahorita. Intenta de nuevo en un rato.", fields: { email } };
      }
    }
  }
  // Mismo mensaje exista o no la cuenta (para no revelar quién está registrado).
  return { ok: "Si ese correo está registrado, te llegó un link para crear una contraseña nueva. Revisa también Spam." };
}

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  const db = await getDb();
  const [row] = await db.select().from(schema.passwordResets).where(eq(schema.passwordResets.id, sha(token))).limit(1);
  if (!row || row.expiresAt < new Date()) return { error: "Este link ya venció o ya se usó. Pide uno nuevo." };
  await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, row.userId));
  await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, row.userId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
  await createSession(row.userId);
  redirect("/inicio");
}

// ── Bienvenida guiada ───────────────────────────────────────────────────

const basicsSchema = z.object({
  name: z.string().trim().min(2).max(40),
  avatar: z.string().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function saveBasics(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = basicsSchema.safeParse({ name: formData.get("name"), avatar: formData.get("avatar"), color: formData.get("color") });
  if (!parsed.success) return { error: "Revisa tu nombre." };
  if (!avatarOk(parsed.data.avatar, user.avatar)) return { error: "Elige un emoji o sube tu foto." };
  await dropPhotoIfReplaced(user.id, user.avatar, parsed.data.avatar);
  const db = await getDb();
  await db.update(schema.users).set(parsed.data).where(eq(schema.users.id, user.id));
  await db.update(schema.members).set(parsed.data).where(eq(schema.members.userId, user.id));
  revalidatePath("/", "layout");
  return { ok: "listo" };
}

export async function savePayInfo(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const get = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max) || undefined;
  const db = await getDb();
  await db
    .update(schema.users)
    .set({
      payInfo: {
        pagoMovil: { banco: get("pmBanco", 60), telefono: get("pmTelefono", 20), cedula: get("pmCedula", 15) },
        zelle: get("zelle", 80),
        binance: get("binance", 80),
        nota: get("nota", 140),
      },
    })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: "listo" };
}

export async function finishOnboarding(next = "/inicio") {
  const user = await requireUser();
  const db = await getDb();
  await db.update(schema.users).set({ onboardedAt: new Date() }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/inicio");
}
