import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL, costMicros, getClient, logUsage } from "@/lib/ai";
import { ahoraTexto, resumen, type PilasCtx } from "./datos";
import { ejecutar, ETIQUETAS, HERRAMIENTAS } from "./herramientas";
import { PILAS_SYSTEM } from "./prompt";
import type { EventoPilas, ImagenPilas } from "./tipos";

type Msg = Anthropic.Beta.BetaMessageParam;
type Bloque = Exclude<Msg["content"], string>[number];

/** Modelo de Pilas: el mismo de la app salvo que se indique otro. */
export const PILAS_MODEL = process.env.PILAS_MODEL || AI_MODEL;
/** Vueltas de herramientas por mensaje (cada vuelta es una llamada a la IA). */
const MAX_VUELTAS = 6;

export class PilasError extends Error {}

/**
 * Agrega el mensaje de la persona y conversa con Claude hasta que responde.
 * Devuelve el historial completo para que el teléfono lo guarde y lo mande en el próximo mensaje (sin editar lo anterior).
 */
export async function conversar(opts: {
  ctx: PilasCtx;
  historial: Msg[];
  texto: string;
  imagen?: ImagenPilas | null;
  notas?: string[];
  send: (e: EventoPilas) => void;
  signal?: AbortSignal;
}): Promise<Msg[]> {
  const { ctx, send } = opts;
  const bloques: Bloque[] = [];
  // Primer mensaje: la foto completa de las cuentas, para responder rápido sin consultar.
  if (opts.historial.length === 0) bloques.push({ type: "text", text: `<datos_de_la_app>\nAHORA: ${ahoraTexto()}\n${resumen(ctx)}\n</datos_de_la_app>` });
  if (opts.notas?.length) bloques.push({ type: "text", text: `<nota_de_la_app>\n${opts.notas.map((n) => `- ${n}`).join("\n")}\n</nota_de_la_app>` });
  if (opts.imagen) bloques.push({ type: "image", source: { type: "base64", media_type: opts.imagen.mime, data: opts.imagen.base64 } });
  bloques.push({ type: "text", text: opts.texto || "(mandó solo la foto)" });
  const messages: Msg[] = [...opts.historial, { role: "user", content: bloques }];

  const client = getClient();
  let escribio = false;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const t0 = Date.now();
    const stream = client.beta.messages.stream(
      {
        model: PILAS_MODEL,
        max_tokens: 6000,
        betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
        // Si la IA se niega por error, el servidor reintenta con el modelo de respaldo.
        fallbacks: "default",
        // Chat: esfuerzo bajo (responde rápido y gasta poco). Si algo del historial no cuadra, se descarta ese razonamiento en vez de fallar.
        output_config: { effort: "low" },
        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        // Guarda en caché todo lo anterior (instrucciones, herramientas y conversación).
        cache_control: { type: "ephemeral" },
        system: PILAS_SYSTEM,
        tools: HERRAMIENTAS,
        messages,
      },
      { signal: opts.signal },
    );

    let separar = escribio;
    for await (const ev of stream) {
      if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") send({ t: "estado", texto: ETIQUETAS[ev.content_block.name] ?? "Revisando" });
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && ev.delta.text) {
        // Entre una vuelta y otra, el texto nuevo va en otro párrafo.
        send({ t: "texto", d: separar ? `\n\n${ev.delta.text}` : ev.delta.text });
        separar = false;
        escribio = true;
      }
    }
    const msg = await stream.finalMessage();
    const u = msg.usage;
    const read = u.cache_read_input_tokens ?? 0;
    const write = u.cache_creation_input_tokens ?? 0;
    await logUsage({
      userId: ctx.user.id,
      task: "pilas",
      model: msg.model,
      inputTokens: u.input_tokens + read + write,
      outputTokens: u.output_tokens,
      costMicros: costMicros(msg.model, u.input_tokens, u.output_tokens, { read, write }),
      ok: msg.stop_reason !== "refusal",
      error: msg.stop_reason === "refusal" ? "refusal" : null,
      ms: Date.now() - t0,
    });
    console.log(`[pilas] vuelta=${vuelta} modelo=${msg.model} entrada=${u.input_tokens} cache=${read}/${write} salida=${u.output_tokens} fin=${msg.stop_reason}`);

    if (msg.stop_reason === "refusal") throw new PilasError("Uy, con eso no te puedo ayudar 😅 Pregúntame algo de tus cuentas.");
    const tools = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason === "max_tokens" && tools.length) throw new PilasError("Se me enredó la respuesta. Pídemelo más cortico.");
    messages.push({ role: "assistant", content: msg.content as Bloque[] });
    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason !== "tool_use" || !tools.length) {
      if (!escribio) send({ t: "texto", d: "Listo 👌" });
      return messages;
    }

    // Todas las herramientas de esta vuelta a la vez, y todos los resultados en un solo mensaje.
    const resultados = await Promise.all(
      tools.map(async (t) => {
        const r = await ejecutar(t.name, t.input, ctx);
        if (r.tarjeta) send({ t: "tarjeta", tarjeta: r.tarjeta });
        return { type: "tool_result" as const, tool_use_id: t.id, content: r.texto, ...(r.error ? { is_error: true } : {}) };
      }),
    );
    messages.push({ role: "user", content: resultados });
  }
  throw new PilasError("Le di muchas vueltas y no llegué. Pregúntamelo de otra forma.");
}
