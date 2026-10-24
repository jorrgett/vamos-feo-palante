import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzleNeon<typeof schema>>;

const g = globalThis as unknown as { __vacaDb?: Promise<DB> };

async function create(): Promise<DB> {
  // En local se usa PGlite (Postgres embebido) para no ensuciar la base de producción.
  if (process.env.DB_DRIVER === "pglite") {
    const { createLocalDb } = await import("./local");
    return (await createLocalDb()) as unknown as DB;
  }
  if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzleNeon({ client: pool, schema });
}

export function getDb(): Promise<DB> {
  g.__vacaDb ??= create();
  return g.__vacaDb;
}

export { schema };
