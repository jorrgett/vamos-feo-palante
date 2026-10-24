// Verifica que las transacciones funcionen con el driver de Neon (se revierte, no deja datos).
import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

config({ path: ".env.local" });
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });
let insertedId = "";
try {
  await db.transaction(async (tx) => {
    const [g] = await tx.insert(schema.groups).values({ name: "prueba-rollback", inviteCode: "zz" + Date.now() }).returning({ id: schema.groups.id });
    insertedId = g.id;
    await tx.insert(schema.members).values({ groupId: g.id, name: "Fantasma" });
    const q = await tx.query.groups.findFirst({ where: eq(schema.groups.id, g.id), with: { members: true } });
    console.log("dentro de la transacción:", q?.name, "miembros:", q?.members.length);
    throw new Error("rollback-intencional");
  });
} catch (e) {
  console.log("transacción revertida:", (e as Error).message);
}
const after = await db.select({ n: sql<number>`count(*)::int` }).from(schema.groups).where(eq(schema.groups.id, insertedId));
const rates = await db.select({ n: sql<number>`count(*)::int` }).from(schema.rates);
console.log("grupo tras rollback:", after[0].n, "· tasas en Neon:", rates[0].n);
await pool.end();
