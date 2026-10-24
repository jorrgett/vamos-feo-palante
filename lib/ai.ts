import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

// IA de la app (Claude). Modelo bueno leyendo fotos y que no gasta tanto; se cambia con ANTHROPIC_MODEL sin tocar código.
export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** Usos de IA por persona cada 24 h (escanear facturas + leer comprobantes). */
export const AI_DAILY_LIMIT = 40;

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
// Si la API key vale para varios workspaces, cada solicitud debe decir en cuál cobrar (ANTHROPIC_WORKSPACE_ID, wrkspc_…).
const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
const getClient = () =>
  (client ??= new Anthropic({ timeout: 90_000, maxRetries: 1, defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined }));

export class AiError extends Error {
  constructor(
    public code: "apagada" | "limite" | "rechazo" | "fallo",
    message: string,
  ) {
    super(message);
  }
}

/** Cuenta un uso de IA (en login_attempts con la clave ia:<id>; las filas viejas se limpian solas). */
export async function spendAiQuota(userId: string) {
  const db = await getDb();
  const key = `ia:${userId}`;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.loginAttempts)
    .where(and(eq(schema.loginAttempts.key, key), gt(schema.loginAttempts.createdAt, new Date(Date.now() - 86_400_000))));
  if (n >= AI_DAILY_LIMIT) throw new AiError("limite", "Ya usaste la IA muchas veces hoy. Vuelve mañana o anótalo a mano.");
  await db.insert(schema.loginAttempts).values({ key });
}

export type ImageInput = { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };

/** Precio de lista de Anthropic ($ por millón de tokens: entrada, salida) para estimar lo que cuesta cada uso. */
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-fable-5-1": [10, 50],
};
/** Costo en millonésimas de dólar ($ por millón de tokens = millonésimas de $ por token). */
export const costMicros = (model: string, input: number, output: number) => {
  const [i, o] = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  return Math.round(input * i + output * o);
};

type UsageRow = typeof schema.aiUsage.$inferInsert;
async function logUsage(row: UsageRow) {
  try {
    const db = await getDb();
    await db.insert(schema.aiUsage).values(row);
  } catch (e) {
    console.error("[ia] no pude anotar el uso:", (e as Error).message);
  }
}

/**
 * Una sola llamada con una imagen que devuelve JSON con el esquema dado (salida estructurada).
 * `validate` revisa y normaliza lo que vuelve antes de usarlo. Cada llamada queda anotada (tokens y costo).
 */
export async function readImageAsJson<T>(opts: {
  task: string;
  userId: string | null;
  system: string;
  prompt: string;
  image: ImageInput;
  schema: Record<string, unknown>;
  validate: (raw: unknown) => T;
  maxTokens?: number;
}): Promise<T> {
  if (!aiEnabled()) throw new AiError("apagada", "La IA todavía no está activada.");
  const t0 = Date.now();
  const base = { userId: opts.userId, task: opts.task };
  /** Anota el intento fallido y avisa con un mensaje para la persona. */
  const fail = async (code: AiError["code"], message: string, detail: string, extra: Partial<UsageRow> = {}): Promise<never> => {
    await logUsage({ ...base, model: AI_MODEL, ok: false, error: detail.slice(0, 200), ms: Date.now() - t0, ...extra });
    throw new AiError(code, message);
  };

  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await getClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 8000,
      // Si el modelo se niega por error, el servidor reintenta con el modelo de respaldo que recomienda Anthropic.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      // Esfuerzo bajo: leer una foto no necesita pensar mucho y así gasta menos.
      output_config: { effort: "low", format: { type: "json_schema", schema: opts.schema } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: opts.image.mime, data: opts.image.base64 } },
            { type: "text", text: opts.prompt },
          ],
        },
      ],
    });
  } catch (e) {
    const detail = e instanceof Anthropic.APIError ? `${e.status ?? "?"} ${e.message}` : `red: ${(e as Error).message}`;
    console.error("[ia] error:", detail);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.NotFoundError || e instanceof Anthropic.PermissionDeniedError)
      return fail("fallo", "La IA no está bien configurada. Avísale al administrador.", detail);
    if (e instanceof Anthropic.RateLimitError) return fail("fallo", "La IA está muy ocupada. Intenta en un minuto.", detail);
    if (e instanceof Anthropic.BadRequestError) return fail("fallo", "La IA no pudo leer esa foto. Prueba con otra más clara.", detail);
    if (e instanceof Anthropic.APIError) return fail("fallo", "La IA no respondió. Intenta de nuevo.", detail);
    return fail("fallo", "No pude conectar con la IA. Intenta de nuevo.", detail);
  }

  const u = res.usage;
  const spent = { model: res.model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, costMicros: costMicros(res.model, u.input_tokens, u.output_tokens) };
  console.log(`[ia] ${opts.task} modelo=${res.model} entrada=${u.input_tokens} salida=${u.output_tokens} fin=${res.stop_reason}`);
  if (res.stop_reason === "refusal") return fail("rechazo", "La IA no quiso leer esa foto. Prueba con otra.", "refusal", spent);
  if (res.stop_reason === "max_tokens") return fail("fallo", "La foto tiene demasiadas cosas para leerla de una vez.", "max_tokens", spent);
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return fail("fallo", "La IA no devolvió nada. Intenta de nuevo.", "sin texto", spent);
  let out: T;
  try {
    out = opts.validate(JSON.parse(text.text));
  } catch {
    return fail("fallo", "No entendí lo que leyó la IA. Intenta de nuevo.", "formato inesperado", spent);
  }
  await logUsage({ ...base, ...spent, ok: true, ms: Date.now() - t0 });
  return out;
}

/** Toma un archivo subido (ya comprimido por el teléfono) y lo deja listo para la IA y para guardarlo. */
export async function imageFromForm(file: FormDataEntryValue | null, maxBytes = 2_500_000): Promise<ImageInput & { bytes: number }> {
  if (!(file instanceof Blob) || file.size === 0) throw new AiError("fallo", "No llegó la foto. Intenta de nuevo.");
  if (file.size > maxBytes) throw new AiError("fallo", "La foto pesa mucho. Prueba con otra.");
  const b = new Uint8Array(await file.arrayBuffer());
  const mime =
    b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
      ? "image/jpeg"
      : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
        ? "image/png"
        : String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : null;
  if (!mime) throw new AiError("fallo", "Eso no parece una foto (usa JPG o PNG).");
  return { mime, base64: Buffer.from(b).toString("base64"), bytes: b.length };
}
