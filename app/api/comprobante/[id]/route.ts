import { getCurrentUser } from "@/lib/auth";
import { proofImage } from "@/lib/proofs";

// Comprobante de pago: solo lo ven quien pagó y quien cobra.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const img = await proofImage(id, user.id);
  if (!img) return new Response(null, { status: 404 });
  return new Response(img.bytes, { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=3600" } });
}
