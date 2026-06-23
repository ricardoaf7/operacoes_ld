import { createDbPool } from "./client";

const pool = createDbPool();

// Busca a área e mostra o histórico completo
const { rows } = await pool.query(`
  SELECT id, endereco, bairro, lote, status,
         history,
         jsonb_array_length(history) as total_historico,
         ultima_rocagem,
         proxima_previsao
  FROM service_areas
  WHERE unaccent(lower(endereco)) ILIKE unaccent(lower('%dez de dezembro%'))
  ORDER BY lote, id
`);

if (rows.length === 0) {
  console.log("Nenhuma área encontrada com 'dez de dezembro'");
} else {
  for (const row of rows) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`ID: ${row.id} | ${row.endereco} | Bairro: ${row.bairro} | Lote: ${row.lote}`);
    console.log(`Status: ${row.status} | Última roçagem: ${row.ultima_rocagem}`);
    console.log(`Total de entradas no histórico: ${row.total_historico}`);
    console.log(`\nHistórico completo:`);
    const hist = Array.isArray(row.history) ? row.history : [];
    if (hist.length === 0) {
      console.log("  (vazio)");
    } else {
      hist.forEach((h: any, i: number) => {
        console.log(`  [${i+1}] ${h.date} — ${h.status} — ${h.observation || ""}`);
      });
    }
  }
}

// Estatísticas gerais do histórico em todos os registros
const { rows: stats } = await pool.query(`
  SELECT
    COUNT(*) as total_areas,
    COUNT(*) FILTER (WHERE jsonb_array_length(history) = 0) as sem_historico,
    COUNT(*) FILTER (WHERE jsonb_array_length(history) = 1) as hist_1,
    COUNT(*) FILTER (WHERE jsonb_array_length(history) >= 2) as hist_2_mais,
    MAX(jsonb_array_length(history)) as max_entradas
  FROM service_areas
`);

console.log(`\n${"═".repeat(60)}`);
console.log("ESTATÍSTICAS GERAIS DO HISTÓRICO:");
console.log(`  Total de áreas: ${stats[0].total_areas}`);
console.log(`  Sem histórico ([]): ${stats[0].sem_historico}`);
console.log(`  Com 1 entrada: ${stats[0].hist_1}`);
console.log(`  Com 2 ou mais: ${stats[0].hist_2_mais}`);
console.log(`  Máximo de entradas numa área: ${stats[0].max_entradas}`);

await pool.end();
