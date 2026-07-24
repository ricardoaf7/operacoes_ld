// Importa os locais de varrição/lavagem da planilha "OS Barreiras" para varricao_locais.
// Uso: node scripts/import-varricao.mjs "S:\Downloads\OS Barreiras - JULHO 2026.xlsx" [--wipe]
import "dotenv/config";
import xlsx from "xlsx";
import pg from "pg";

const arquivo = process.argv[2];
const wipe = process.argv.includes("--wipe");
if (!arquivo) {
  console.error("Informe o caminho da planilha.");
  process.exit(1);
}

const SECOES = [
  { match: /EQUIPE DO SEGUNDO TURNO/i, secao: "varricao_2turno" },
  { match: /INSTALA..ES SANITARIAS/i, secao: "sanitarios" },
  { match: /LAVAGEM DE VIAS\s*-\s*NOTURNA/i, secao: "lavagem_vias_noturna" },
  { match: /LAVAGEM DE PRA.AS\s*-\s*NOTURNA/i, secao: "lavagem_pracas_noturna" },
  { match: /LAVAGEM DE VIAS\s*-\s*DIURNA/i, secao: "lavagem_vias_diurna" },
  { match: /LAVAGENS?\s+DE PRA.AS\s*-\s*DIURNA/i, secao: "lavagem_pracas_diurna" },
  { match: /VARRI..O DE PRA.AS/i, secao: "varricao" },
];
// Linhas de título que NÃO mudam a seção de dados (só agrupadores/totais)
const IGNORAR_TITULO = /TOTAL DAS|LAVAGEM DE VIAS E LOGRADOUROS P/i;

// Mês/ano de referência da planilha (para calcular dia da semana das datas)
const MES = 7, ANO = 2026;

function separarNomeComplemento(endereco) {
  let texto = String(endereco).trim().replace(/\s+/g, " ");
  const partes = [];
  // 1) conteúdo entre parênteses vira complemento
  texto = texto.replace(/\(([^)]*)\)?/g, (_, dentro) => {
    if (dentro.trim()) partes.push(dentro.trim());
    return " ";
  }).replace(/\s+/g, " ").trim();
  // 2) o que vem depois do primeiro traço (com espaço ao redor) vira complemento
  const m = texto.match(/\s*[-–]\s/);
  if (m) {
    const idx = texto.search(/\s*[-–]\s/);
    const depois = texto.slice(idx).replace(/^\s*[-–]\s*/, "").trim();
    if (depois) partes.push(depois);
    texto = texto.slice(0, idx).trim();
  }
  return { nome: texto, complemento: partes.join(" — ") || null };
}

function derivarFrequencia(datas) {
  const txt = String(datas).replace(/\s+/g, " ").trim();
  if (/DIARIO|DIÁRIO|\d{1,2}\s+a\s+\d{1,2}\//i.test(txt)) {
    return { frequencia: "diario", diasSemana: null };
  }
  // remove as terminações /07/2026 e palavras, sobra a lista de dias do mês
  const soDias = txt
    .replace(new RegExp(`\\/0?${MES}\\/${ANO}`, "g"), "")
    .replace(/[A-Za-zÀ-ú]+/g, " ");
  const dias = [...soDias.matchAll(/\d{1,2}/g)]
    .map((m) => parseInt(m[0]))
    .filter((d) => d >= 1 && d <= 31);
  const semana = [...new Set(dias.map((d) => new Date(ANO, MES - 1, d).getDay()))].sort();
  if (semana.length === 0) return { frequencia: "diario", diasSemana: null };
  return { frequencia: "semanal", diasSemana: semana };
}

// ---------- leitura ----------
const wb = xlsx.readFile(arquivo);
const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

let secaoAtual = "varricao";
const locais = [];
for (const r of rows.slice(1)) {
  const [endereco, regiao, tipo, metragem, datas] = r.map((c) => String(c).trim());
  if (!endereco) continue;
  // linha de título de seção?
  if (!regiao && !tipo && !metragem) {
    const s = SECOES.find((x) => x.match.test(endereco));
    if (s) secaoAtual = s.secao;
    else if (!IGNORAR_TITULO.test(endereco)) console.log(`(título ignorado: ${endereco})`);
    continue;
  }
  const { nome, complemento } = separarNomeComplemento(endereco);
  const { frequencia, diasSemana } = derivarFrequencia(datas);
  locais.push({
    nome, complemento,
    regiao: regiao || null,
    tipo: tipo || null,
    secao: secaoAtual,
    metragem: metragem ? parseFloat(String(metragem).replace(",", ".")) : null,
    frequencia, diasSemana,
  });
}

console.log(`\nLocais lidos: ${locais.length}`);
const porSecao = {};
locais.forEach((l) => (porSecao[l.secao] = (porSecao[l.secao] || 0) + 1));
console.table(porSecao);
console.log("\nAmostras da separação nome/complemento:");
locais.filter((l) => l.complemento).slice(0, 8).forEach((l) =>
  console.log(`  "${l.nome}"  +  [${l.complemento}]`)
);

// ---------- gravação ----------
// Porta 6543 (transaction pooler) é bloqueada na rede da CMTU; 5432 funciona
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL.replace(":6543", ":5432"),
});

await pool.query(`
  CREATE TABLE IF NOT EXISTS varricao_locais (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    complemento TEXT,
    regiao VARCHAR(100),
    tipo VARCHAR(50),
    secao VARCHAR(50) NOT NULL DEFAULT 'varricao',
    metragem_unica NUMERIC,
    frequencia VARCHAR(30) NOT NULL DEFAULT 'diario',
    dias_semana JSONB,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    geocode_status VARCHAR(20) DEFAULT 'pendente',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_varricao_locais_secao ON varricao_locais (secao);
  CREATE INDEX IF NOT EXISTS idx_varricao_locais_regiao ON varricao_locais (regiao);
`);

const { rows: existentes } = await pool.query("SELECT COUNT(*)::int AS n FROM varricao_locais");
if (existentes[0].n > 0) {
  if (!wipe) {
    console.error(`\nA tabela já tem ${existentes[0].n} locais. Use --wipe para substituir tudo.`);
    await pool.end();
    process.exit(1);
  }
  await pool.query("DELETE FROM varricao_locais");
  console.log(`\n(${existentes[0].n} registros anteriores removidos)`);
}

let ok = 0;
for (const l of locais) {
  await pool.query(
    `INSERT INTO varricao_locais
       (nome, complemento, regiao, tipo, secao, metragem_unica, frequencia, dias_semana)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [l.nome, l.complemento, l.regiao, l.tipo, l.secao, l.metragem,
     l.frequencia, l.diasSemana ? JSON.stringify(l.diasSemana) : null]
  );
  ok++;
}
console.log(`\nGravados no banco: ${ok} locais.`);
await pool.end();
