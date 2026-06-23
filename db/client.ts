import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;

export function requireDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida");
  }

  return connectionString;
}

export function createDbPool(connectionString: string = requireDatabaseUrl()) {
  return new Pool({
    connectionString,
    ssl: connectionString.includes("supabase.co")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export function createDb(connectionString: string = requireDatabaseUrl()) {
  const pool = createDbPool(connectionString);
  const db = drizzle(pool);

  return { pool, db };
}
