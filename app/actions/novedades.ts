"use server";

import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { LATEST_RELEASE } from "@/lib/novedades";

/** Ya vio las novedades: el pantallazo no le vuelve a salir hasta la próxima publicación. */
export async function markNovedadesSeen() {
  const user = await requireUser();
  if (user.seenNovedades === LATEST_RELEASE) return { ok: true as const };
  const db = await getDb();
  await db.update(schema.users).set({ seenNovedades: LATEST_RELEASE }).where(eq(schema.users.id, user.id));
  return { ok: true as const };
}
