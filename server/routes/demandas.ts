import type { Express } from "express";
import { getPool } from "../../db/client";
import { requireAuth, requireRole } from "../route-helpers";

export async function ensureDemandasTable() {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS demandas (
        id SERIAL PRIMARY KEY,
        origem TEXT NOT NULL,
        numero_processo TEXT,
        solicitante_nome TEXT NOT NULL,
        solicitante_whatsapp TEXT,
        solicitante_orgao TEXT,
        data_solicitacao DATE NOT NULL,
        tipo TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'aberta',
        observacoes TEXT,
        setor_id INTEGER,
        responsavel_id INTEGER,
        area_id INTEGER,
        dados_especificos JSONB,
        data_conclusao TIMESTAMPTZ,
        created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_demandas_status     ON demandas (status);
      CREATE INDEX IF NOT EXISTS idx_demandas_tipo       ON demandas (tipo);
      CREATE INDEX IF NOT EXISTS idx_demandas_created_at ON demandas (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_demandas_setor      ON demandas (setor_id) WHERE setor_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_demandas_responsavel ON demandas (responsavel_id) WHERE responsavel_id IS NOT NULL;
    `);
  } catch (e) {
    console.warn("demandas table check:", e);
  }
}

export async function ensureNotificacoesTable() {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notificacoes (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        titulo TEXT NOT NULL,
        mensagem TEXT,
        tipo TEXT NOT NULL DEFAULT 'demanda',
        referencia_id INTEGER,
        lida BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario    ON notificacoes (usuario_id);
      CREATE INDEX IF NOT EXISTS idx_notificacoes_nao_lidas  ON notificacoes (usuario_id) WHERE lida = false;
    `);
  } catch (e) {
    console.warn("notificacoes table check:", e);
  }
}

// Helper para criar notificação (usado pelas rotas de demandas)
async function createNotificacao(usuarioId: number, titulo: string, mensagem?: string, referenciaId?: number) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, referencia_id)
       VALUES ($1, $2, $3, 'demanda', $4)`,
      [usuarioId, titulo, mensagem ?? null, referenciaId ?? null]
    );
  } catch (e) {
    console.warn("createNotificacao error:", e);
  }
}

export async function ensureSolicitantesTable() {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS solicitantes (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        whatsapp TEXT,
        orgao TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_solicitantes_nome ON solicitantes (lower(nome));
    `);
  } catch (e) {
    console.warn("solicitantes table check:", e);
  }
}

export function registerDemandasRoutes(app: Express): void {
  // ===================== DEMANDAS =====================

  function rowToDemanda(r: any) {
    return {
      id: r.id,
      origem: r.origem,
      numeroProcesso: r.numero_processo,
      solicitanteNome: r.solicitante_nome,
      solicitanteWhatsapp: r.solicitante_whatsapp,
      solicitanteOrgao: r.solicitante_orgao,
      dataSolicitacao: r.data_solicitacao,
      tipo: r.tipo,
      status: r.status,
      observacoes: r.observacoes,
      setorId: r.setor_id,
      setorNome: r.setor_nome ?? null,
      responsavelId: r.responsavel_id,
      responsavelNome: r.responsavel_nome ?? null,
      areaId: r.area_id,
      areaEndereco: r.area_endereco ?? null,
      dadosEspecificos: r.dados_especificos,
      dataConclusao: r.data_conclusao,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  app.get("/api/demandas", requireAuth, async (req, res) => {
    try {
      const { status, tipo, origem, setor_id } = req.query;
      const pool = getPool();
      const conditions: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (status)   { conditions.push(`d.status=$${i++}`);   vals.push(status); }
      if (tipo)     { conditions.push(`d.tipo=$${i++}`);     vals.push(tipo); }
      if (origem)   { conditions.push(`d.origem=$${i++}`);   vals.push(origem); }
      if (setor_id) { conditions.push(`d.setor_id=$${i++}`); vals.push(setor_id); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await pool.query(`
        SELECT d.*,
               s.nome AS setor_nome,
               u.nome AS responsavel_nome,
               sa.endereco AS area_endereco
        FROM demandas d
        LEFT JOIN setores s ON s.id = d.setor_id
        LEFT JOIN users u ON u.id = d.responsavel_id
        LEFT JOIN service_areas sa ON sa.id = d.area_id
        ${where}
        ORDER BY d.created_at DESC
        LIMIT 200
      `, vals);
      res.json(rows.map(rowToDemanda));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar demandas" });
    }
  });

  app.get("/api/demandas/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rows } = await pool.query(`
        SELECT d.*,
               s.nome AS setor_nome,
               u.nome AS responsavel_nome,
               sa.endereco AS area_endereco
        FROM demandas d
        LEFT JOIN setores s ON s.id = d.setor_id
        LEFT JOIN users u ON u.id = d.responsavel_id
        LEFT JOIN service_areas sa ON sa.id = d.area_id
        WHERE d.id=$1
      `, [id]);
      if (!rows.length) return res.status(404).json({ error: "Demanda não encontrada" });
      res.json(rowToDemanda(rows[0]));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar demanda" });
    }
  });

  app.post("/api/demandas", requireAuth, async (req, res) => {
    try {
      const {
        origem, numeroProcesso, solicitanteNome, solicitanteWhatsapp, solicitanteOrgao,
        dataSolicitacao, tipo, status = "aberta", observacoes,
        setorId, responsavelId, areaId, dadosEspecificos,
      } = req.body;
      if (!origem || !solicitanteNome || !dataSolicitacao || !tipo) {
        return res.status(400).json({ error: "Campos obrigatórios ausentes" });
      }
      const pool = getPool();
      const { rows } = await pool.query(`
        INSERT INTO demandas
          (origem, numero_processo, solicitante_nome, solicitante_whatsapp, solicitante_orgao,
           data_solicitacao, tipo, status, observacoes, setor_id, responsavel_id, area_id,
           dados_especificos, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *
      `, [
        origem, numeroProcesso ?? null, solicitanteNome, solicitanteWhatsapp ?? null,
        solicitanteOrgao ?? null, dataSolicitacao, tipo, status, observacoes ?? null,
        setorId ?? null, responsavelId ?? null, areaId ?? null,
        dadosEspecificos ? JSON.stringify(dadosEspecificos) : null,
        req.session.userId ?? null,
      ]);
      const demanda = rows[0];
      // Auto-salvar solicitante no banco de dados
      await pool.query(
        `INSERT INTO solicitantes (nome, whatsapp, orgao)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (SELECT 1 FROM solicitantes WHERE lower(nome) = lower($1))`,
        [solicitanteNome, solicitanteWhatsapp ?? null, solicitanteOrgao ?? null]
      );
      // Notificar responsável
      if (responsavelId) {
        await createNotificacao(
          responsavelId,
          `Nova demanda: ${tipo}`,
          `${solicitanteNome}${solicitanteOrgao ? ` (${solicitanteOrgao})` : ""} — ${origem}`,
          demanda.id
        );
      }
      res.json(rowToDemanda(demanda));
    } catch (error) {
      console.error("Erro ao criar demanda:", error);
      res.status(500).json({ error: "Erro ao criar demanda" });
    }
  });

  app.patch("/api/demandas/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const {
        origem, numeroProcesso, solicitanteNome, solicitanteWhatsapp, solicitanteOrgao,
        dataSolicitacao, tipo, status, observacoes, setorId, responsavelId, areaId, dadosEspecificos,
      } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      const addField = (col: string, val: any) => { sets.push(`${col}=$${i++}`); vals.push(val); };
      if (origem !== undefined)              addField("origem", origem);
      if (numeroProcesso !== undefined)      addField("numero_processo", numeroProcesso ?? null);
      if (solicitanteNome !== undefined)     addField("solicitante_nome", solicitanteNome);
      if (solicitanteWhatsapp !== undefined) addField("solicitante_whatsapp", solicitanteWhatsapp ?? null);
      if (solicitanteOrgao !== undefined)    addField("solicitante_orgao", solicitanteOrgao ?? null);
      if (dataSolicitacao !== undefined)     addField("data_solicitacao", dataSolicitacao);
      if (tipo !== undefined)                addField("tipo", tipo);
      if (status !== undefined) {
        addField("status", status);
        if (status === "concluida") addField("data_conclusao", new Date().toISOString());
      }
      if (observacoes !== undefined)         addField("observacoes", observacoes ?? null);
      if (setorId !== undefined)             addField("setor_id", setorId ?? null);
      if (responsavelId !== undefined)       addField("responsavel_id", responsavelId ?? null);
      if (areaId !== undefined)              addField("area_id", areaId ?? null);
      if (dadosEspecificos !== undefined)    addField("dados_especificos", dadosEspecificos ? JSON.stringify(dadosEspecificos) : null);
      if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });
      sets.push(`updated_at=NOW()`);
      vals.push(id);
      const pool = getPool();
      const { rows } = await pool.query(
        `UPDATE demandas SET ${sets.join(", ")} WHERE id=$${i} RETURNING *`, vals
      );
      if (!rows.length) return res.status(404).json({ error: "Demanda não encontrada" });
      res.json(rowToDemanda(rows[0]));
    } catch (error) {
      res.status(500).json({ error: "Erro ao atualizar demanda" });
    }
  });

  app.delete("/api/demandas/:id", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      await pool.query("DELETE FROM demandas WHERE id=$1", [id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir demanda" });
    }
  });

  // ===================== NOTIFICAÇÕES =====================

  app.get("/api/notificacoes", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT * FROM notificacoes WHERE usuario_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      res.json(rows.map(r => ({
        id: r.id,
        usuarioId: r.usuario_id,
        titulo: r.titulo,
        mensagem: r.mensagem,
        tipo: r.tipo,
        referenciaId: r.referencia_id,
        lida: r.lida,
        createdAt: r.created_at,
      })));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar notificações" });
    }
  });

  app.get("/api/notificacoes/nao-lidas", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM notificacoes WHERE usuario_id=$1 AND lida=false`,
        [userId]
      );
      res.json({ count: parseInt(rows[0].count) });
    } catch (error) {
      res.status(500).json({ error: "Erro ao contar notificações" });
    }
  });

  app.patch("/api/notificacoes/:id/lida", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId!;
      const pool = getPool();
      await pool.query(
        `UPDATE notificacoes SET lida=true WHERE id=$1 AND usuario_id=$2`,
        [id, userId]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao marcar notificação" });
    }
  });

  app.patch("/api/notificacoes/lida-todas", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const pool = getPool();
      await pool.query(
        `UPDATE notificacoes SET lida=true WHERE usuario_id=$1 AND lida=false`,
        [userId]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao marcar notificações" });
    }
  });

  // ===================== SOLICITANTES =====================

  app.get("/api/solicitantes", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "");
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id, nome, whatsapp, orgao FROM solicitantes
         WHERE lower(nome) LIKE lower($1)
         ORDER BY nome LIMIT 8`,
        [`%${q}%`]
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar solicitantes" });
    }
  });

}
