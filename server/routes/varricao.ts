import type { Express } from "express";
import { getPool } from "../../db/client";
import { getSupabase, upload, requireAuth, requireRole } from "../route-helpers";

export async function ensureVarricaoLocaisTable() {
  try {
    const pool = getPool();
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
  } catch (e) {
    console.warn("varricao_locais table check:", e);
  }
}

export async function ensureVarricaoConfigTable() {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS varricao_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        metragem_maxima_varricao NUMERIC,
        metragem_maxima_lavacao NUMERIC,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT varricao_config_singleton CHECK (id = 1)
      );
    `);
  } catch (e) {
    console.warn("varricao_config table check:", e);
  }
}

// Categoria orçamentária de uma seção — usada para conferir o teto de metragem
// contratual de Varrição e de Lavação (Sanitários não tem teto definido)
// Os 3 serviços do contrato: Varrição e Lavação são cobradas em unidades
// diferentes (metro linear × metro quadrado) — cada uma tem sua própria
// Ordem de Serviço (rascunho/finalizada) e teto de metragem. Sanitário é
// simples (1 local, diário) e não tem rascunho/finalização própria — entra
// direto no documento combinado, calculado na hora.
type VarricaoCategoria = "varricao" | "lavacao" | "sanitario";

const SECOES_POR_CATEGORIA: Record<VarricaoCategoria, string[]> = {
  varricao: ["varricao", "varricao_2turno"],
  lavacao: ["lavagem_vias_noturna", "lavagem_pracas_noturna", "lavagem_vias_diurna", "lavagem_pracas_diurna"],
  sanitario: ["sanitarios"],
};

function secaoCategoria(secao: string): VarricaoCategoria {
  if (secao.startsWith("lavagem")) return "lavacao";
  if (secao === "sanitarios") return "sanitario";
  return "varricao";
}

export async function ensureVarricaoOrdensTable() {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS varricao_ordens (
        id SERIAL PRIMARY KEY,
        numero VARCHAR(50) NOT NULL,
        mes_referencia VARCHAR(7) NOT NULL,
        data_emissao DATE NOT NULL,
        emitido_por VARCHAR(150),
        observacao TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
        finalizado_por VARCHAR(150),
        finalizado_em TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE varricao_ordens ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'rascunho';
      ALTER TABLE varricao_ordens ADD COLUMN IF NOT EXISTS finalizado_por VARCHAR(150);
      ALTER TABLE varricao_ordens ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMPTZ;
      ALTER TABLE varricao_ordens ADD COLUMN IF NOT EXISTS categoria VARCHAR(20) NOT NULL DEFAULT 'varricao';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_varricao_ordens_mes_categoria ON varricao_ordens (mes_referencia, categoria);
      CREATE TABLE IF NOT EXISTS varricao_ordens_locais (
        id SERIAL PRIMARY KEY,
        ordem_id INTEGER NOT NULL REFERENCES varricao_ordens(id) ON DELETE CASCADE,
        local_id INTEGER REFERENCES varricao_locais(id) ON DELETE SET NULL,
        nome TEXT NOT NULL,
        complemento TEXT,
        regiao VARCHAR(100),
        tipo VARCHAR(50),
        secao VARCHAR(50) NOT NULL,
        metragem_unica NUMERIC,
        dias JSONB NOT NULL,
        dias_texto VARCHAR(400),
        metragem_total NUMERIC
      );
      CREATE INDEX IF NOT EXISTS idx_varricao_ordens_mes ON varricao_ordens (mes_referencia);
      CREATE INDEX IF NOT EXISTS idx_varricao_ordens_locais_ordem ON varricao_ordens_locais (ordem_id);
    `);
  } catch (e) {
    console.warn("varricao_ordens table check:", e);
  }
}

// Dias do mês (1..N) em que um local é atendido, dado sua frequência
function diasDoMesParaLocal(
  local: { frequencia: string; dias_semana: number[] | null },
  ano: number,
  mes: number // 1-12
): number[] {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias: number[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const diaSemana = new Date(ano, mes - 1, d).getDay();
    const programado = local.frequencia === "diario"
      ? diaSemana >= 1 && diaSemana <= 6
      : (local.dias_semana ?? []).includes(diaSemana);
    if (programado) dias.push(d);
  }
  return dias;
}

function formatarDiasTexto(dias: number[], frequencia: string): string {
  if (frequencia === "diario") return "Diário (seg. a sáb.)";
  if (dias.length === 0) return "—";
  const strs = dias.map((d) => String(d).padStart(2, "0"));
  if (strs.length === 1) return strs[0];
  return strs.slice(0, -1).join(", ") + " e " + strs[strs.length - 1];
}

// Distância de edição entre duas strings — usada para avisar sobre possíveis
// nomes duplicados/digitados diferente (ex.: "Tomy" vs "Tomi" Nakagawa)
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

interface LocalComputado {
  localId: number;
  nome: string;
  complemento: string | null;
  regiao: string | null;
  tipo: string | null;
  secao: string;
  metragemUnica: number | null;
  dias: number[];
  diasTexto: string;
  metragemTotal: number;
}

function calcularLocaisDoMes(locais: any[], ano: number, mes: number): LocalComputado[] {
  return locais.map((l) => {
    const dias = diasDoMesParaLocal(l, ano, mes);
    const metragemUnica = l.metragem_unica != null ? Number(l.metragem_unica) : null;
    return {
      localId: l.id,
      nome: l.nome,
      complemento: l.complemento,
      regiao: l.regiao,
      tipo: l.tipo,
      secao: l.secao,
      metragemUnica,
      dias,
      diasTexto: formatarDiasTexto(dias, l.frequencia),
      metragemTotal: metragemUnica != null ? metragemUnica * dias.length : 0,
    };
  }).filter((l) => l.dias.length > 0);
}

// Identidade completa (nome + complemento) para detectar duplicidade real,
// já que o mesmo nome de rua se repete legitimamente com complementos diferentes
function detectarDuplicatas(locais: LocalComputado[]) {
  const duplicatas: { nomeA: string; nomeB: string; localIdA: number; localIdB: number; distancia: number }[] = [];
  const identidades = locais.map((l) => ({
    id: l.localId,
    label: `${l.nome}${l.complemento ? ` (${l.complemento})` : ""}`,
    norm: normalizarNome(`${l.nome} ${l.complemento ?? ""}`),
  }));
  for (let i = 0; i < identidades.length; i++) {
    for (let j = i + 1; j < identidades.length; j++) {
      const dist = levenshtein(identidades[i].norm, identidades[j].norm);
      if (dist <= 2) {
        duplicatas.push({
          nomeA: identidades[i].label,
          nomeB: identidades[j].label,
          localIdA: identidades[i].id,
          localIdB: identidades[j].id,
          distancia: dist,
        });
      }
    }
  }
  return duplicatas;
}

function subtotais(locais: LocalComputado[], campo: "regiao" | "secao") {
  const m = new Map<string, { quantidade: number; metragemTotal: number }>();
  locais.forEach((l) => {
    const chave = (l[campo] ?? "Sem definição") as string;
    if (!m.has(chave)) m.set(chave, { quantidade: 0, metragemTotal: 0 });
    const acc = m.get(chave)!;
    acc.quantidade++;
    acc.metragemTotal += l.metragemTotal;
  });
  return Array.from(m.entries())
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => b.metragemTotal - a.metragemTotal);
}

// Conjunto de locais que serve de ponto de partida para uma nova OS: respeita
// a decisão de inclusão/exclusão da última OS FINALIZADA (uma exclusão feita
// pelo fiscal continua valendo até ele decidir o contrário), mas locais que
// nunca apareceram em nenhuma OS finalizada entram automaticamente (recém-
// cadastrados). Se nunca houve OS finalizada, começa com todos os ativos.
interface BaseParaNovaOrdem {
  ids: number[] | null; // null = usar todos os ativos (nunca houve referência)
  referencia: { id: number; numero: string; mesReferencia: string } | null;
}

// categoria: escopa tudo à categoria da OS sendo criada (varrição e lavação
// têm históricos/referências totalmente independentes um do outro).
// referenciaId: se informado, usa ESSA OS finalizada específica como base
// (ex.: dezembro/2025 para gerar dezembro/2026, em vez do mês imediatamente
// anterior, que pode ter calendário/feriados bem diferentes). Se omitido,
// usa a última finalizada da mesma categoria automaticamente.
async function idsBaseParaNovaOrdem(
  pool: any,
  categoria: "varricao" | "lavacao",
  referenciaId?: number
): Promise<BaseParaNovaOrdem> {
  let base: { id: number; numero: string; mes_referencia: string } | null = null;

  if (referenciaId) {
    const { rows } = await pool.query(
      `SELECT id, numero, mes_referencia FROM varricao_ordens WHERE id=$1 AND status='finalizada' AND categoria=$2`,
      [referenciaId, categoria]
    );
    base = rows[0] ?? null;
  } else {
    const { rows } = await pool.query(
      `SELECT id, numero, mes_referencia FROM varricao_ordens WHERE status='finalizada' AND categoria=$1 ORDER BY mes_referencia DESC, created_at DESC LIMIT 1`,
      [categoria]
    );
    base = rows[0] ?? null;
  }

  const secoesDaCategoria = SECOES_POR_CATEGORIA[categoria];

  if (!base) return { ids: null, referencia: null }; // nunca houve finalizada nesta categoria: usar todos os ativos dela

  const { rows: daBase } = await pool.query(
    `SELECT local_id FROM varricao_ordens_locais WHERE ordem_id=$1 AND local_id IS NOT NULL`,
    [base.id]
  );
  const ids = new Set<number>(daBase.map((r: any) => r.local_id));

  // Locais que nunca apareceram em NENHUMA OS finalizada desta categoria
  // (recém-cadastrados) entram automaticamente
  const { rows: jaFinalizadosAlgumaVez } = await pool.query(`
    SELECT DISTINCT l.local_id FROM varricao_ordens_locais l
    JOIN varricao_ordens o ON o.id = l.ordem_id
    WHERE o.status='finalizada' AND o.categoria=$1 AND l.local_id IS NOT NULL
  `, [categoria]);
  const idsJaVistos = new Set<number>(jaFinalizadosAlgumaVez.map((r: any) => r.local_id));

  const { rows: todosAtivos } = await pool.query(
    `SELECT id FROM varricao_locais WHERE ativo IS NOT FALSE AND secao = ANY($1::text[])`,
    [secoesDaCategoria]
  );
  todosAtivos.forEach((l: any) => { if (!idsJaVistos.has(l.id)) ids.add(l.id); });

  return {
    ids: Array.from(ids),
    referencia: { id: base.id, numero: base.numero, mesReferencia: base.mes_referencia },
  };
}

function totaisPorCategoria(locais: LocalComputado[]) {
  const totais: Record<VarricaoCategoria, number> = { varricao: 0, lavacao: 0, sanitario: 0 };
  locais.forEach((l) => {
    totais[secaoCategoria(l.secao)] += l.metragemTotal;
  });
  return totais;
}

export async function ensureVarricaoFotosTable() {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS varricao_fotos (
        id SERIAL PRIMARY KEY,
        local_id INTEGER NOT NULL REFERENCES varricao_locais(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        data_servico DATE NOT NULL,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        enviado_por_id INTEGER,
        enviado_por_nome VARCHAR(150),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_varricao_fotos_data ON varricao_fotos (data_servico);
      CREATE INDEX IF NOT EXISTS idx_varricao_fotos_local ON varricao_fotos (local_id);
    `);
  } catch (e) {
    console.warn("varricao_fotos table check:", e);
  }
}

export function registerVarricaoRoutes(app: Express): void {
  // ===================== VARRIÇÃO — LOCAIS =====================

  app.get("/api/varricao/locais", requireAuth, async (req, res) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT * FROM varricao_locais ORDER BY regiao, nome`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar locais de varrição" });
    }
  });

  app.post("/api/varricao/locais", requireAuth, async (req, res) => {
    try {
      const {
        nome, complemento, regiao, tipo, secao, metragemUnica,
        frequencia, diasSemana, lat, lng,
      } = req.body;
      if (!nome || !String(nome).trim()) {
        return res.status(400).json({ error: "Nome do local é obrigatório" });
      }
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO varricao_locais
           (nome, complemento, regiao, tipo, secao, metragem_unica, frequencia, dias_semana, lat, lng, geocode_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          String(nome).trim(),
          complemento || null,
          regiao || null,
          tipo || null,
          secao || "varricao",
          metragemUnica ?? null,
          frequencia || "diario",
          diasSemana ? JSON.stringify(diasSemana) : null,
          lat ?? null,
          lng ?? null,
          lat != null && lng != null ? "manual" : "pendente",
        ]
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error("Erro ao criar local de varrição:", error);
      res.status(500).json({ error: "Erro ao criar local" });
    }
  });

  app.patch("/api/varricao/locais/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const campos: Record<string, string> = {
        nome: "nome", complemento: "complemento", regiao: "regiao",
        tipo: "tipo", secao: "secao", metragemUnica: "metragem_unica",
        frequencia: "frequencia", lat: "lat", lng: "lng",
        geocodeStatus: "geocode_status", ativo: "ativo",
      };
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, col] of Object.entries(campos)) {
        if (key in req.body) {
          vals.push(req.body[key]);
          sets.push(`${col}=$${vals.length}`);
        }
      }
      if ("diasSemana" in req.body) {
        vals.push(req.body.diasSemana ? JSON.stringify(req.body.diasSemana) : null);
        sets.push(`dias_semana=$${vals.length}`);
      }
      // Reposicionar o pino manualmente confirma a localização
      if ("lat" in req.body && "lng" in req.body && !("geocodeStatus" in req.body)) {
        sets.push(`geocode_status='manual'`);
      }
      if (sets.length === 0) {
        return res.status(400).json({ error: "Nenhum campo para atualizar" });
      }
      sets.push("updated_at=NOW()");
      vals.push(id);
      const pool = getPool();
      const { rows } = await pool.query(
        `UPDATE varricao_locais SET ${sets.join(", ")} WHERE id=$${vals.length} RETURNING *`,
        vals
      );
      if (!rows.length) return res.status(404).json({ error: "Local não encontrado" });
      res.json(rows[0]);
    } catch (error) {
      console.error("Erro ao atualizar local de varrição:", error);
      res.status(500).json({ error: "Erro ao atualizar local" });
    }
  });

  app.delete("/api/varricao/locais/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rowCount } = await pool.query("DELETE FROM varricao_locais WHERE id=$1", [id]);
      if (!rowCount) return res.status(404).json({ error: "Local não encontrado" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir local" });
    }
  });


  // ===================== VARRIÇÃO — ORDENS DE SERVIÇO =====================

  // Prévia (não salva): calcula os dias do mês para cada local ativo
  app.get("/api/varricao/ordens/preview", requireAuth, async (req, res) => {
    try {
      const mes = String(req.query.mes ?? ""); // "YYYY-MM"
      const m = mes.match(/^(\d{4})-(\d{2})$/);
      if (!m) return res.status(400).json({ error: "Informe o mês no formato YYYY-MM" });
      const ano = parseInt(m[1]), mesNum = parseInt(m[2]);

      const categoria = String(req.query.categoria ?? "");
      if (categoria !== "varricao" && categoria !== "lavacao") {
        return res.status(400).json({ error: "Informe a categoria: varricao ou lavacao" });
      }

      const referenciaId = req.query.referenciaId ? parseInt(String(req.query.referenciaId)) : undefined;

      const pool = getPool();
      const { ids: idsBase, referencia } = await idsBaseParaNovaOrdem(pool, categoria, referenciaId);
      const secoesDaCategoria = SECOES_POR_CATEGORIA[categoria];
      const { rows: locaisRaw } = idsBase
        ? await pool.query(
            "SELECT * FROM varricao_locais WHERE id = ANY($1::int[]) AND ativo IS NOT FALSE ORDER BY regiao, nome",
            [idsBase]
          )
        : await pool.query(
            "SELECT * FROM varricao_locais WHERE secao = ANY($1::text[]) AND ativo IS NOT FALSE ORDER BY regiao, nome",
            [secoesDaCategoria]
          );

      const locais = calcularLocaisDoMes(locaisRaw, ano, mesNum);
      const duplicatas = detectarDuplicatas(locais);
      const totalMetragem = locais.reduce((s, l) => s + l.metragemTotal, 0);

      const { rows: existente } = await pool.query(
        "SELECT id, numero, status FROM varricao_ordens WHERE mes_referencia=$1 AND categoria=$2", [mes, categoria]
      );

      res.json({
        mesReferencia: mes,
        categoria,
        locais,
        duplicatas,
        subtotaisRegiao: subtotais(locais, "regiao"),
        subtotaisSecao: subtotais(locais, "secao"),
        totaisPorCategoria: totaisPorCategoria(locais),
        totalLocais: locais.length,
        totalMetragem,
        ordemExistente: existente[0] ?? null,
        referenciaUsada: referencia,
      });
    } catch (error) {
      console.error("Erro ao gerar prévia da OS de varrição:", error);
      res.status(500).json({ error: "Erro ao calcular a prévia" });
    }
  });

  // Config: teto contratual de metragem para Varrição e Lavação
  app.get("/api/varricao/config", requireAuth, async (req, res) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query("SELECT * FROM varricao_config WHERE id=1");
      res.json(rows[0] ?? { metragem_maxima_varricao: null, metragem_maxima_lavacao: null });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar configuração" });
    }
  });

  app.put("/api/varricao/config", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const { metragemMaximaVarricao, metragemMaximaLavacao } = req.body;
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO varricao_config (id, metragem_maxima_varricao, metragem_maxima_lavacao, updated_at)
         VALUES (1, $1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET
           metragem_maxima_varricao = EXCLUDED.metragem_maxima_varricao,
           metragem_maxima_lavacao = EXCLUDED.metragem_maxima_lavacao,
           updated_at = NOW()
         RETURNING *`,
        [metragemMaximaVarricao ?? null, metragemMaximaLavacao ?? null]
      );
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Erro ao salvar configuração" });
    }
  });

  app.get("/api/varricao/ordens", requireAuth, async (req, res) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(`
        SELECT o.*, COUNT(l.id)::int AS total_locais, COALESCE(SUM(l.metragem_total), 0) AS total_metragem
        FROM varricao_ordens o
        LEFT JOIN varricao_ordens_locais l ON l.ordem_id = o.id
        GROUP BY o.id
        ORDER BY o.mes_referencia DESC, o.created_at DESC
      `);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar ordens de serviço" });
    }
  });

  // Documento combinado: junta a OS finalizada de Varrição + a de Lavação do
  // mês + os Sanitários (calculados na hora, sem OS própria) num único
  // payload exportável — igual ao documento que a Mariane já monta hoje.
  // Não salva nada novo no banco, só monta o resultado para exportar.
  app.get("/api/varricao/ordens/combinado", requireAuth, async (req, res) => {
    try {
      const mes = String(req.query.mes ?? "");
      const m = mes.match(/^(\d{4})-(\d{2})$/);
      if (!m) return res.status(400).json({ error: "Informe o mês no formato YYYY-MM" });
      const ano = parseInt(m[1]), mesNum = parseInt(m[2]);

      const pool = getPool();

      const { rows: ordensDoMes } = await pool.query(
        `SELECT * FROM varricao_ordens WHERE mes_referencia=$1 AND categoria IN ('varricao','lavacao')`,
        [mes]
      );
      const ordemVarricao = ordensDoMes.find((o: any) => o.categoria === "varricao") ?? null;
      const ordemLavacao = ordensDoMes.find((o: any) => o.categoria === "lavacao") ?? null;

      const faltando: string[] = [];
      if (!ordemVarricao || ordemVarricao.status !== "finalizada") faltando.push("Varrição");
      if (!ordemLavacao || ordemLavacao.status !== "finalizada") faltando.push("Lavação");
      if (faltando.length) {
        return res.status(400).json({
          error: `Finalize a OS de ${faltando.join(" e ")} deste mês antes de gerar o documento combinado.`,
          faltando,
        });
      }

      const [{ rows: locaisVarricaoRaw }, { rows: locaisLavacaoRaw }] = await Promise.all([
        pool.query("SELECT * FROM varricao_ordens_locais WHERE ordem_id=$1", [ordemVarricao.id]),
        pool.query("SELECT * FROM varricao_ordens_locais WHERE ordem_id=$1", [ordemLavacao.id]),
      ]);

      const mapear = (l: any): LocalComputado => ({
        localId: l.local_id,
        nome: l.nome,
        complemento: l.complemento,
        regiao: l.regiao,
        tipo: l.tipo,
        secao: l.secao,
        metragemUnica: l.metragem_unica != null ? Number(l.metragem_unica) : null,
        dias: l.dias,
        diasTexto: l.dias_texto,
        metragemTotal: l.metragem_total != null ? Number(l.metragem_total) : 0,
      });

      // Sanitário não tem OS própria — calcula ao vivo a partir da frequência,
      // igual à prévia das outras categorias
      const { rows: sanitariosRaw } = await pool.query(
        "SELECT * FROM varricao_locais WHERE secao = ANY($1::text[]) AND ativo IS NOT FALSE",
        [SECOES_POR_CATEGORIA.sanitario]
      );
      const locaisSanitarios = calcularLocaisDoMes(sanitariosRaw, ano, mesNum);

      const locais: LocalComputado[] = [
        ...locaisVarricaoRaw.map(mapear),
        ...locaisLavacaoRaw.map(mapear),
        ...locaisSanitarios,
      ];
      const totalMetragem = locais.reduce((s, l) => s + l.metragemTotal, 0);

      res.json({
        mesReferencia: mes,
        ordem: {
          numero: `Varrição ${ordemVarricao.numero} · Lavação ${ordemLavacao.numero}`,
          mes_referencia: mes,
          data_emissao: new Date().toISOString().split("T")[0],
          emitido_por: req.session.userName ?? null,
          observacao: null,
          status: "finalizada",
          finalizado_por: null,
          finalizado_em: null,
          created_at: new Date().toISOString(),
        },
        locais,
        subtotaisRegiao: subtotais(locais, "regiao"),
        subtotaisSecao: subtotais(locais, "secao"),
        totaisPorCategoria: totaisPorCategoria(locais),
        totalLocais: locais.length,
        totalMetragem,
      });
    } catch (error) {
      console.error("Erro ao gerar documento combinado:", error);
      res.status(500).json({ error: "Erro ao gerar o documento combinado" });
    }
  });

  app.get("/api/varricao/ordens/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rows: ordens } = await pool.query("SELECT * FROM varricao_ordens WHERE id=$1", [id]);
      if (!ordens.length) return res.status(404).json({ error: "Ordem de serviço não encontrada" });

      const { rows: locaisRaw } = await pool.query(
        "SELECT * FROM varricao_ordens_locais WHERE ordem_id=$1 ORDER BY regiao, nome", [id]
      );
      const locais: LocalComputado[] = locaisRaw.map((l) => ({
        localId: l.local_id,
        nome: l.nome,
        complemento: l.complemento,
        regiao: l.regiao,
        tipo: l.tipo,
        secao: l.secao,
        metragemUnica: l.metragem_unica != null ? Number(l.metragem_unica) : null,
        dias: l.dias,
        diasTexto: l.dias_texto,
        metragemTotal: l.metragem_total != null ? Number(l.metragem_total) : 0,
      }));
      const totalMetragem = locais.reduce((s, l) => s + l.metragemTotal, 0);

      res.json({
        ordem: ordens[0],
        mesReferencia: ordens[0].mes_referencia,
        locais,
        subtotaisRegiao: subtotais(locais, "regiao"),
        subtotaisSecao: subtotais(locais, "secao"),
        totaisPorCategoria: totaisPorCategoria(locais),
        totalLocais: locais.length,
        totalMetragem,
      });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar ordem de serviço" });
    }
  });

  app.post("/api/varricao/ordens", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const { numero, mesReferencia, categoria, dataEmissao, observacao, locais: locaisEscolhidos } = req.body;
      if (!numero || !mesReferencia || !dataEmissao) {
        return res.status(400).json({ error: "Número, mês de referência e data de emissão são obrigatórios" });
      }
      if (categoria !== "varricao" && categoria !== "lavacao") {
        return res.status(400).json({ error: "Categoria inválida — deve ser varricao ou lavacao" });
      }
      if (!Array.isArray(locaisEscolhidos) || locaisEscolhidos.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos um local para esta ordem de serviço" });
      }
      const mMes = String(mesReferencia).match(/^(\d{4})-(\d{2})$/);
      if (!mMes) return res.status(400).json({ error: "Mês de referência inválido" });
      const diasUteisDoMes = diasDoMesParaLocal(
        { frequencia: "diario", dias_semana: null }, parseInt(mMes[1]), parseInt(mMes[2])
      );

      const pool = getPool();

      const { rows: jaExiste } = await pool.query(
        "SELECT id, numero FROM varricao_ordens WHERE mes_referencia=$1 AND categoria=$2", [mesReferencia, categoria]
      );
      if (jaExiste.length) {
        return res.status(409).json({
          error: `Já existe a OS ${jaExiste[0].numero} para este mês/categoria. Edite-a em vez de criar outra.`,
          ordemExistenteId: jaExiste[0].id,
        });
      }

      // O cliente decide QUAIS locais e QUAIS dias entram (mobilidade para
      // remanejar entre locais fixos e variáveis, respeitar teto de metragem
      // etc.) — mas o servidor sempre recalcula a metragem a partir dos dados
      // atuais do local, nunca confiando em números vindos do cliente.
      const secoesPermitidas = new Set(SECOES_POR_CATEGORIA[categoria as "varricao" | "lavacao"]);
      const idsUnicos = Array.from(new Set(locaisEscolhidos.map((l: any) => Number(l.localId))));
      const { rows: locaisRaw } = await pool.query(
        "SELECT * FROM varricao_locais WHERE id = ANY($1::int[])", [idsUnicos]
      );
      const porId = new Map(locaisRaw.map((l) => [l.id, l]));

      const locais: LocalComputado[] = [];
      for (const item of locaisEscolhidos) {
        const local = porId.get(Number(item.localId));
        // Não deixa entrar local de outra categoria (ex.: lavação numa OS de varrição)
        if (!local || !secoesPermitidas.has(local.secao)) continue;
        const dias: number[] = Array.isArray(item.dias)
          ? item.dias.filter((d: any) => Number.isInteger(d) && d >= 1 && d <= 31).sort((a: number, b: number) => a - b)
          : [];
        if (dias.length === 0) continue;
        const metragemUnica = local.metragem_unica != null ? Number(local.metragem_unica) : null;
        // "Diário" só se os dias baterem exatamente com todos os dias úteis do
        // mês (seg-sáb) — se o usuário editou/removeu algum dia, mostra a lista real
        const ehDiarioCompleto =
          dias.length === diasUteisDoMes.length && dias.every((d, i) => d === diasUteisDoMes[i]);
        locais.push({
          localId: local.id,
          nome: local.nome,
          complemento: local.complemento,
          regiao: local.regiao,
          tipo: local.tipo,
          secao: local.secao,
          metragemUnica,
          dias,
          diasTexto: formatarDiasTexto(dias, ehDiarioCompleto ? "diario" : "semanal"),
          metragemTotal: metragemUnica != null ? metragemUnica * dias.length : 0,
        });
      }
      if (locais.length === 0) {
        return res.status(400).json({ error: "Nenhum local válido informado" });
      }

      const { rows: ordemRows } = await pool.query(
        `INSERT INTO varricao_ordens (numero, mes_referencia, categoria, data_emissao, emitido_por, observacao, status)
         VALUES ($1,$2,$3,$4,$5,$6,'rascunho') RETURNING *`,
        [numero, mesReferencia, categoria, dataEmissao, req.session.userName ?? null, observacao || null]
      );
      const ordem = ordemRows[0];

      for (const l of locais) {
        await pool.query(
          `INSERT INTO varricao_ordens_locais
             (ordem_id, local_id, nome, complemento, regiao, tipo, secao, metragem_unica, dias, dias_texto, metragem_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            ordem.id, l.localId, l.nome, l.complemento, l.regiao, l.tipo, l.secao,
            l.metragemUnica, JSON.stringify(l.dias), l.diasTexto, l.metragemTotal,
          ]
        );
      }

      res.status(201).json(ordem);
    } catch (error) {
      console.error("Erro ao emitir ordem de serviço de varrição:", error);
      res.status(500).json({ error: "Erro ao emitir a ordem de serviço" });
    }
  });

  // Reabrir e ajustar uma OS já emitida (locais/dias podem mudar durante o
  // mês por necessidade operacional — ex.: concentrar recursos numa região)
  app.patch("/api/varricao/ordens/:id", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { numero, dataEmissao, observacao, locais: locaisEscolhidos } = req.body;
      if (!Array.isArray(locaisEscolhidos) || locaisEscolhidos.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos um local para esta ordem de serviço" });
      }

      const pool = getPool();
      const { rows: existentes } = await pool.query("SELECT * FROM varricao_ordens WHERE id=$1", [id]);
      if (!existentes.length) return res.status(404).json({ error: "Ordem de serviço não encontrada" });
      if (existentes[0].status === "finalizada") {
        return res.status(400).json({
          error: "Esta OS já foi finalizada e não pode mais ser editada diretamente. Ajustes durante o mês precisam de outro processo.",
        });
      }
      const mesReferencia = existentes[0].mes_referencia;
      const categoriaDaOrdem = existentes[0].categoria as "varricao" | "lavacao";
      const secoesPermitidas = new Set(SECOES_POR_CATEGORIA[categoriaDaOrdem]);

      const mMes = String(mesReferencia).match(/^(\d{4})-(\d{2})$/);
      const diasUteisDoMes = diasDoMesParaLocal(
        { frequencia: "diario", dias_semana: null }, parseInt(mMes![1]), parseInt(mMes![2])
      );

      const idsUnicos = Array.from(new Set(locaisEscolhidos.map((l: any) => Number(l.localId))));
      const { rows: locaisRaw } = await pool.query(
        "SELECT * FROM varricao_locais WHERE id = ANY($1::int[])", [idsUnicos]
      );
      const porId = new Map(locaisRaw.map((l) => [l.id, l]));

      const locais: LocalComputado[] = [];
      for (const item of locaisEscolhidos) {
        const local = porId.get(Number(item.localId));
        // Não deixa entrar local de outra categoria (ex.: lavação numa OS de varrição)
        if (!local || !secoesPermitidas.has(local.secao)) continue;
        const dias: number[] = Array.isArray(item.dias)
          ? item.dias.filter((d: any) => Number.isInteger(d) && d >= 1 && d <= 31).sort((a: number, b: number) => a - b)
          : [];
        if (dias.length === 0) continue;
        const metragemUnica = local.metragem_unica != null ? Number(local.metragem_unica) : null;
        const ehDiarioCompleto =
          dias.length === diasUteisDoMes.length && dias.every((d, i) => d === diasUteisDoMes[i]);
        locais.push({
          localId: local.id,
          nome: local.nome,
          complemento: local.complemento,
          regiao: local.regiao,
          tipo: local.tipo,
          secao: local.secao,
          metragemUnica,
          dias,
          diasTexto: formatarDiasTexto(dias, ehDiarioCompleto ? "diario" : "semanal"),
          metragemTotal: metragemUnica != null ? metragemUnica * dias.length : 0,
        });
      }
      if (locais.length === 0) {
        return res.status(400).json({ error: "Nenhum local válido informado" });
      }

      const sets: string[] = [];
      const vals: any[] = [];
      if (numero !== undefined) { vals.push(numero); sets.push(`numero=$${vals.length}`); }
      if (dataEmissao !== undefined) { vals.push(dataEmissao); sets.push(`data_emissao=$${vals.length}`); }
      if (observacao !== undefined) { vals.push(observacao || null); sets.push(`observacao=$${vals.length}`); }
      if (sets.length > 0) {
        vals.push(id);
        await pool.query(`UPDATE varricao_ordens SET ${sets.join(", ")} WHERE id=$${vals.length}`, vals);
      }

      await pool.query("DELETE FROM varricao_ordens_locais WHERE ordem_id=$1", [id]);
      for (const l of locais) {
        await pool.query(
          `INSERT INTO varricao_ordens_locais
             (ordem_id, local_id, nome, complemento, regiao, tipo, secao, metragem_unica, dias, dias_texto, metragem_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            id, l.localId, l.nome, l.complemento, l.regiao, l.tipo, l.secao,
            l.metragemUnica, JSON.stringify(l.dias), l.diasTexto, l.metragemTotal,
          ]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao atualizar ordem de serviço de varrição:", error);
      res.status(500).json({ error: "Erro ao atualizar a ordem de serviço" });
    }
  });

  // Torna a OS imutável — é a versão que vai para a contratada. Ajustes após
  // isso precisam de outro processo (ainda a definir), não edição direta.
  app.post("/api/varricao/ordens/:id/finalizar", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rows } = await pool.query(
        `UPDATE varricao_ordens
         SET status='finalizada', finalizado_por=$1, finalizado_em=NOW()
         WHERE id=$2 AND status='rascunho'
         RETURNING *`,
        [req.session.userName ?? null, id]
      );
      if (!rows.length) {
        return res.status(400).json({ error: "OS não encontrada ou já finalizada" });
      }
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Erro ao finalizar a ordem de serviço" });
    }
  });

  app.delete("/api/varricao/ordens/:id", requireRole("admin", "gestor", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rowCount } = await pool.query("DELETE FROM varricao_ordens WHERE id=$1", [id]);
      if (!rowCount) return res.status(404).json({ error: "Ordem de serviço não encontrada" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir ordem de serviço" });
    }
  });


  // ===================== VARRIÇÃO — FOTOS =====================

  app.post("/api/varricao/fotos", requireAuth, upload.single("photo"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Nenhuma foto enviada" });
      const localId = parseInt(req.body.localId);
      if (!localId) return res.status(400).json({ error: "Local é obrigatório" });

      const dataServico = req.body.dataServico || new Date().toISOString().split("T")[0];
      const lat = req.body.lat ? parseFloat(req.body.lat) : null;
      const lng = req.body.lng ? parseFloat(req.body.lng) : null;

      const pool = getPool();
      const { rows: locais } = await pool.query(
        "SELECT id FROM varricao_locais WHERE id=$1", [localId]
      );
      if (!locais.length) return res.status(404).json({ error: "Local não encontrado" });

      const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
      const filePath = `varricao/${localId}/${Date.now()}.${ext}`;

      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage
        .from("fotos")
        .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (uploadError) {
        console.error("Supabase upload error (varricao):", uploadError);
        return res.status(500).json({ error: uploadError.message });
      }
      const { data: { publicUrl } } = supabase.storage.from("fotos").getPublicUrl(filePath);

      const { rows } = await pool.query(
        `INSERT INTO varricao_fotos (local_id, url, data_servico, lat, lng, enviado_por_id, enviado_por_nome)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [localId, publicUrl, dataServico, lat, lng, req.session.userId ?? null, req.session.userName ?? null]
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error("Erro no upload de foto de varrição:", error);
      res.status(500).json({ error: "Erro ao enviar a foto" });
    }
  });

  // Excluir foto: apenas fiscalização (encarregado não apaga registro enviado)
  app.delete("/api/varricao/fotos/:id", requireRole("admin", "gestor", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rows } = await pool.query("SELECT url FROM varricao_fotos WHERE id=$1", [id]);
      if (!rows.length) return res.status(404).json({ error: "Foto não encontrada" });

      // Remove o arquivo do Supabase Storage
      const marker = `/storage/v1/object/public/fotos/`;
      const idx = rows[0].url.indexOf(marker);
      if (idx >= 0) {
        const filePath = decodeURIComponent(rows[0].url.slice(idx + marker.length));
        const supabase = getSupabase();
        await supabase.storage.from("fotos").remove([filePath]);
      }

      await pool.query("DELETE FROM varricao_fotos WHERE id=$1", [id]);
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao excluir foto de varrição:", error);
      res.status(500).json({ error: "Erro ao excluir a foto" });
    }
  });

  app.get("/api/varricao/fotos", requireAuth, async (req, res) => {
    try {
      const conds: string[] = [];
      const vals: any[] = [];
      if (req.query.dataInicio && req.query.dataFim) {
        // Período livre (ex.: card do ponto no mapa)
        vals.push(String(req.query.dataInicio), String(req.query.dataFim));
        conds.push(`f.data_servico BETWEEN $1 AND $2`);
      } else {
        const data = String(req.query.data ?? new Date().toISOString().split("T")[0]);
        vals.push(data);
        conds.push(`f.data_servico = $1`);
      }
      if (req.query.localId) {
        vals.push(parseInt(String(req.query.localId)));
        conds.push(`f.local_id = $${vals.length}`);
      }
      if (req.query.minhas === "1") {
        vals.push(req.session.userId);
        conds.push(`f.enviado_por_id = $${vals.length}`);
      }
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT f.*, l.nome AS local_nome, l.complemento AS local_complemento, l.regiao AS local_regiao
         FROM varricao_fotos f
         JOIN varricao_locais l ON l.id = f.local_id
         WHERE ${conds.join(" AND ")}
         ORDER BY f.created_at DESC`,
        vals
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar fotos" });
    }
  });

}
