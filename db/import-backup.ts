/**
 * Importa áreas do arquivo CSV de backup para o Supabase.
 * Uso: npx tsx db/import-backup.ts
 */

import * as fs from "fs";
import * as readline from "readline";
import { createDbPool } from "./client";

const CSV_PATH = "S:\\Downloads\\zeladoria_full_2026-06-23.csv";

function parseBoolean(val: string): boolean {
  return val?.trim().toLowerCase() === "true";
}

function parseNumber(val: string): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseFloat(val.trim());
  return isNaN(n) ? null : n;
}

function parseText(val: string): string | null {
  const v = val?.trim();
  return v && v !== "" ? v : null;
}

function parseJson(val: string): any {
  if (!val || val.trim() === "" || val.trim() === "null") return null;
  try {
    // CSV pode ter aspas duplas escapadas
    const clean = val.trim().replace(/""/g, '"');
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

async function main() {
  const pool = createDbPool();

  console.log("📂 Lendo CSV:", CSV_PATH);
  console.log("🔗 Conectando ao Supabase...\n");

  const fileStream = fs.createReadStream(CSV_PATH, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const lines: string[] = [];
  for await (const line of rl) {
    lines.push(line);
  }

  const header = lines[0].split(",");
  const rows = lines.slice(1).filter((l) => l.trim() !== "");

  console.log(`📊 Total de registros no arquivo: ${rows.length}\n`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  console.log("🔄 Modo: upsert (atualiza existentes, insere novos, não apaga nada)\n");

  // Processa em lotes de 50
  const BATCH_SIZE = 50;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const rawLine of batch) {
      // Parseia CSV respeitando campos com vírgulas dentro de aspas
      const cols = parseCSVLine(rawLine);

      if (cols.length < 10) {
        skipped++;
        continue;
      }

      const id             = parseNumber(cols[0]);
      const ordem          = parseNumber(cols[1]);
      const seqCadastro    = parseNumber(cols[2]);
      const tipo           = parseText(cols[3]);
      const endereco       = parseText(cols[4]);
      const bairro         = parseText(cols[5]);
      const metragem       = parseNumber(cols[6]);
      const lat            = parseNumber(cols[7]);
      const lng            = parseNumber(cols[8]);
      const lote           = parseNumber(cols[9]);
      const status         = parseText(cols[10]) || "Pendente";
      const history        = parseJson(cols[11]) ?? [];
      const polygon        = parseJson(cols[12]);
      const scheduledDate  = parseText(cols[13]);
      const proximaPrevisao= parseText(cols[14]);
      const ultimaRocagem  = parseText(cols[15]);
      const manualSchedule = parseBoolean(cols[16]);
      const daysCmp        = parseNumber(cols[17]);
      const servico        = parseText(cols[18]) || "rocagem";
      const registradoPor  = parseText(cols[19]);
      const dataRegistro   = parseText(cols[20]);
      const executando     = parseBoolean(cols[21]);
      const executandoDesde= parseText(cols[22]);

      if (!id || !tipo || !endereco || lat === null || lng === null) {
        skipped++;
        continue;
      }

      try {
        await pool.query(
          `INSERT INTO service_areas (
            id, ordem, sequencia_cadastro, tipo, endereco, bairro,
            metragem_m2, lat, lng, lote, status, history, polygon,
            scheduled_date, proxima_previsao, ultima_rocagem,
            manual_schedule, days_to_complete, servico,
            registrado_por, data_registro, fotos,
            executando, executando_desde
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
            $14, $15, $16,
            $17, $18, $19,
            $20, $21, '[]'::jsonb,
            $22, $23
          ) ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            history = EXCLUDED.history,
            proxima_previsao = EXCLUDED.proxima_previsao,
            ultima_rocagem = EXCLUDED.ultima_rocagem,
            executando = EXCLUDED.executando,
            executando_desde = EXCLUDED.executando_desde,
            polygon = EXCLUDED.polygon,
            scheduled_date = EXCLUDED.scheduled_date,
            manual_schedule = EXCLUDED.manual_schedule`,
          [
            id, ordem, seqCadastro, tipo, endereco, bairro,
            metragem, lat, lng, lote, status,
            JSON.stringify(history), polygon ? JSON.stringify(polygon) : null,
            scheduledDate, proximaPrevisao, ultimaRocagem,
            manualSchedule, daysCmp, servico,
            registradoPor, dataRegistro,
            executando, executandoDesde,
          ]
        );
        inserted++;
      } catch (err: any) {
        errors++;
        console.error(`  ❌ Erro na área ID ${id}:`, err.message);
      }
    }

    const pct = Math.round(((i + batch.length) / rows.length) * 100);
    process.stdout.write(`\r⏳ Progresso: ${i + batch.length}/${rows.length} (${pct}%)`);
  }

  // Resetar a sequência do ID para o próximo valor correto
  await pool.query(
    `SELECT setval('service_areas_id_seq', (SELECT MAX(id) FROM service_areas))`
  );

  console.log("\n");
  console.log("═══════════════════════════════");
  console.log(`✅ Inseridos:  ${inserted}`);
  console.log(`⏭️  Ignorados:  ${skipped}`);
  console.log(`❌ Erros:      ${errors}`);
  console.log("═══════════════════════════════\n");

  if (inserted > 0) {
    const { rows: total } = await pool.query("SELECT COUNT(*) FROM service_areas");
    console.log(`📊 Total no banco agora: ${total[0].count} áreas`);
  }

  await pool.end();
}

/**
 * Parseia uma linha CSV respeitando campos entre aspas que podem conter vírgulas.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
