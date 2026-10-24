import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

// Fotos de perfil: solo las ven los que tienen sesión en la app. La URL lleva ?v= así que se puede guardar en caché.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  const db = await getDb();
  const [photo] = await db.select().from(schema.userPhotos).where(eq(schema.userPhotos.userId, id)).limit(1);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(Buffer.from(photo.data, "base64"), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
