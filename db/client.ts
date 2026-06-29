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

// Singleton pool — criado uma vez, reutilizado em todas as operações.
// Criar/destruir um pool por query desperdiça handshakes SSL e conexões TCP.
let _pool: InstanceType<typeof Pool> | null = null;

export function getPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    const connectionString = requireDatabaseUrl();
    _pool = new Pool({
      connectionString,
      ssl: connectionString.includes("supabase.co")
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return _pool;
}

/** @deprecated Use getPool() instead. Creates a new pool — only for one-off scripts. */
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
