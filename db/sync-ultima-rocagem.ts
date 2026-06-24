/**
 * Corrige ultimaRocagem e proximaPrevisao para refletir
 * a data mais recente do array history em cada área.
 */
import { createDbPool } from "./client";

const pool = createDbPool();

const { rows } = await pool.query(`
  SELECT id, ultima_rocagem, proxima_previsao, history
  FROM service_areas
  WHERE jsonb_array_length(history) > 0
`);

let updated = 0;
let skipped = 0;

for (const row of rows) {
  const history: { date: string; type?: string }[] = row.history ?? [];
  const completed = history
    .filter((h) => h.type !== "forecast")
    .map((h) => h.date)
    .sort()
    .reverse();

  const ultimaRocagem = completed[0] ?? null;
  if (!ultimaRocagem) { skipped++; continue; }

  const d = new Date(ultimaRocagem);
  d.setDate(d.getDate() + 60);
  const proximaPrevisao = d.toISOString().split("T")[0];

  if (ultimaRocagem === row.ultima_rocagem && proximaPrevisao === row.proxima_previsao) {
    skipped++;
    continue;
  }

  await pool.query(
    `UPDATE service_areas SET ultima_rocagem = $1, proxima_previsao = $2 WHERE id = $3`,
    [ultimaRocagem, proximaPrevisao, row.id]
  );
  updated++;
}

console.log(`✅ Atualizadas: ${updated} áreas`);
console.log(`⏭️  Já estavam corretas: ${skipped} áreas`);

await pool.end();
