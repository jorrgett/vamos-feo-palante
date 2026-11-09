import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AiError, aiEnabled, spendPilasQuota } from "@/lib/ai";
import { cargarCtx } from "@/lib/pilas/datos";
import { conversar, PilasError } from "@/lib/pilas/conversar";
import type { EventoPilas } from "@/lib/pilas/tipos";

// Pilas responde en vivo: una línea JSON por evento (texto, estado, tarjeta y al final el historial).
export const maxDuration = 120;

const bodyZ = z.object({
  historial: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.union([z.string(), z.array(z.record(z.string(), z.unknown())).max(200)]) }))
    .max(160),
  texto: z.string().trim().max(2000),
  imagen: z
    .object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().min(100).max(2_200_000) })
    .nullable()
    .optional(),
  notas: z.array(z.string().trim().min(1).max(400)).max(8).optional(),
});

const json = (status: number, error: string) => Response.json({ error }, { status });

/** Revisa que la foto sea de verdad una imagen del tipo que dice. */
function fotoValida(mime: string, base64: string) {
  const b = Buffer.from(base64.slice(0, 24), "base64");
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8;
  if (mime === "image/png") return b[0] === 0x89 && b[1] === 0x50;
  return b.subarray(0, 4).toString() === "RIFF";
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json(401, "Tu sesión se cerró. Vuelve a entrar.");
  if (!aiEnabled()) return json(503, "Pilas todavía no está activado.");

  const raw = await req.text();
  if (raw.length > 4_000_000) return json(413, "Esta conversación ya está muy larga. Empieza una nueva 🔋");
  let body: z.infer<typeof bodyZ>;
  try {
    body = bodyZ.parse(JSON.parse(raw));
  } catch {
    return json(400, "No entendí ese mensaje. Intenta de nuevo.");
  }
  if (!body.texto && !body.imagen) return json(400, "Escribe algo 🙂");
  if (body.historial.length > 150) return json(413, "Esta conversación ya está muy larga. Empieza una nueva 🔋");
  if (body.historial.length && body.historial[0].role !== "user") return json(400, "La conversación se dañó. Empieza una nueva.");
  if (body.imagen && !fotoValida(body.imagen.mime, body.imagen.base64)) return json(400, "Eso no parece una foto (usa JPG o PNG).");

  try {
    await spendPilasQuota(user.id);
  } catch (e) {
    if (e instanceof AiError) return json(429, e.message);
    throw e;
  }

  const ctx = await cargarCtx(user);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: EventoPilas) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          // El teléfono ya cerró la conexión.
        }
      };
      try {
        const historial = await conversar({
          ctx,
          historial: body.historial as Anthropic.Beta.BetaMessageParam[],
          texto: body.texto,
          imagen: body.imagen,
          notas: body.notas,
          send,
          signal: req.signal,
        });
        send({ t: "fin", historial });
      } catch (e) {
        if (e instanceof PilasError) send({ t: "error", texto: e.message });
        else if (e instanceof Anthropic.APIUserAbortError) {
          // La persona se fue de la pantalla.
        } else {
          const detail = e instanceof Anthropic.APIError ? `${e.status ?? "?"} ${e.message}` : (e as Error).message;
          console.error("[pilas] error:", detail);
          send({
            t: "error",
            texto:
              e instanceof Anthropic.RateLimitError
                ? "Pilas está burda de ocupado. Intenta en un minuto."
                : e instanceof Anthropic.BadRequestError
                  ? "Algo de esta conversación no le cuadró a la IA. Empieza una nueva 🔋"
                  : "Se me fue la señal 📶 Intenta de nuevo.",
          });
        }
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
