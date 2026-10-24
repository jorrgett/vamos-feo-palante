import "server-only";
import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "./db";
import type { ProofAi } from "./db/schema";

export type ProofView = { id: string; ai: ProofAi | null };

/** Comprobantes de esos pagos que esta persona puede ver (quien pagó o quien cobra). */
export async function proofsFor(settlementIds: string[], viewerId: string): Promise<Map<string, ProofView>> {
  const out = new Map<string, ProofView>();
  if (settlementIds.length === 0) return out;
  const db = await getDb();
  const to = alias(schema.members, "to_member");
  const rows = await db
    .select({ id: schema.paymentProofs.id, settlementId: schema.paymentProofs.settlementId, uploaderId: schema.paymentProofs.uploaderId, ai: schema.paymentProofs.ai, payee: to.userId })
    .from(schema.paymentProofs)
    .innerJoin(schema.settlements, eq(schema.settlements.id, schema.paymentProofs.settlementId))
    .innerJoin(to, eq(to.id, schema.settlements.toMember))
    .where(inArray(schema.paymentProofs.settlementId, settlementIds.slice(0, 500)));
  for (const r of rows) if (r.settlementId && (r.uploaderId === viewerId || r.payee === viewerId)) out.set(r.settlementId, { id: r.id, ai: r.ai });
  return out;
}

/** El comprobante solo si esta persona lo puede ver. */
export async function proofImage(proofId: string, viewerId: string) {
  const db = await getDb();
  const to = alias(schema.members, "to_member");
  const [r] = await db
    .select({ mime: schema.paymentProofs.mime, data: schema.paymentProofs.data, uploaderId: schema.paymentProofs.uploaderId, payee: to.userId })
    .from(schema.paymentProofs)
    .leftJoin(schema.settlements, eq(schema.settlements.id, schema.paymentProofs.settlementId))
    .leftJoin(to, eq(to.id, schema.settlements.toMember))
    .where(eq(schema.paymentProofs.id, proofId))
    .limit(1);
  if (!r || (r.uploaderId !== viewerId && r.payee !== viewerId)) return null;
  return { mime: r.mime, bytes: Buffer.from(r.data, "base64") };
}
