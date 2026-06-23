import { createDbPool } from "./client";

const pool = createDbPool();
const result = await pool.query("SELECT setval('service_areas_id_seq', 10000)");
console.log("Sequência ajustada — próxima área criada aqui terá ID >= 10001");
await pool.end();
