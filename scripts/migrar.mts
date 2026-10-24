// Aplica las migraciones a Neon: npx tsx scripts/migrar.ts
import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

config({ path: ".env.local" });
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
const { rows } = await pool.query("select table_name from information_schema.tables where table_schema='public' order by 1");
console.log("Tablas:", rows.map((r) => r.table_name).join(", "));
await pool.end();
