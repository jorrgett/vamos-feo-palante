"use server";

import { requireUser } from "@/lib/auth";
import { AiError, aiEnabled, imageFromForm, spendAiQuota } from "@/lib/ai";
import { readReceipt, type ReceiptRead } from "@/lib/ai-tasks";

/** Escanea la foto de una factura y devuelve lo que leyó (no guarda la foto). */
export async function scanReceipt(formData: FormData): Promise<{ ok: true; receipt: ReceiptRead } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!aiEnabled()) return { ok: false, error: "La IA todavía no está activada." };
  try {
    const image = await imageFromForm(formData.get("foto"));
    await spendAiQuota(user.id);
    const receipt = await readReceipt(image, user.id);
    if (!receipt.esFactura) return { ok: false, error: "Eso no parece una factura. Tómale una foto de frente a la cuenta, con buena luz." };
    if (receipt.items.length === 0 && receipt.total == null) return { ok: false, error: "No pude leer los montos. Prueba con una foto más cerca y con buena luz." };
    return { ok: true, receipt };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, error: e.message };
    console.error("[ia] factura:", (e as Error).message);
    return { ok: false, error: "No pude leer la factura. Intenta de nuevo." };
  }
}
