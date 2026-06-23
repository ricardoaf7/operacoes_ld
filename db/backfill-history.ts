/**
 * Backfill: adiciona ultima_rocagem no array history para áreas que
 * já foram roçadas mas não têm essa data registrada no histórico.
 * Executar uma única vez após a correção do bug.
 */

import { createDbPool } from "./client";

const pool = createDbPool();

const { rows: areas } = await pool.query(`
  SELECT id, ultima_rocagem, history
  FROM service_areas
  WHERE ultima_rocagem IS NOT NULL
    AND ultima_rocagem != ''
`);

console.log(`\nVerificando ${areas.length} áreas com ultima_rocagem definida...\n`);

let updated = 0;
let skipped = 0;

for (const area of areas) {
  const ultimaRocagem = area.ultima_rocagem as string;
  const history: any[] = Array.isArray(area.history) ? area.history : [];

  // Verifica se essa data já está no histórico
  const jaExiste = history.some((h) => h.date === ultimaRocagem);

  if (jaExiste) {
    skipped++;
    continue;
  }

  // Adiciona a entrada de histórico da ultima_rocagem
  const novaEntrada = {
    date: ultimaRocagem,
    type: "completed",
    status: "Concluído",
    observation: "Roçagem concluída (backfill)",
  };

  const novoHistorico = [...history, novaEntrada].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  await pool.query(
    `UPDATE service_areas SET history = $1::jsonb WHERE id = $2`,
    [JSON.stringify(novoHistorico), area.id]
  );

  updated++;
}

console.log(`✅ Atualizadas: ${updated} áreas`);
console.log(`⏭️  Já tinham o registro: ${skipped} áreas`);
console.log(`\nTotal de áreas com histórico agora:`);

const { rows: stats } = await pool.query(`
  SELECT
    COUNT(*) FILTER (WHERE jsonb_array_length(history) = 0) as sem_historico,
    COUNT(*) FILTER (WHERE jsonb_array_length(history) >= 1) as com_historico,
    MAX(jsonb_array_length(history)) as max_entradas
  FROM service_areas
`);

console.log(`  Com histórico: ${stats[0].com_historico}`);
console.log(`  Sem histórico: ${stats[0].sem_historico}`);
console.log(`  Máximo de entradas: ${stats[0].max_entradas}`);

await pool.end();
