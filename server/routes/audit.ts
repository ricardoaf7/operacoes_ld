import type { Express, Request } from "express";
import { getPool } from "../../db/client";
import { requireRole } from "../route-helpers";

export async function ensureAuditLogTable() {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER,
        usuario_nome TEXT NOT NULL,
        acao TEXT NOT NULL,
        tipo TEXT NOT NULL,
        referencia_id INTEGER,
        descricao TEXT,
        dados_anteriores JSONB,
        dados_novos JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_tipo      ON audit_log (tipo);
      CREATE INDEX IF NOT EXISTS idx_audit_log_usuario   ON audit_log (usuario_id);
    `);
  } catch (e) {
    console.warn("audit_log table check:", e);
  }
}

export async function logAudit(
  usuarioId: number | undefined,
  usuarioNome: string,
  acao: "criou" | "editou" | "excluiu",
  tipo: string,
  referenciaId?: number,
  descricao?: string,
  dadosAnteriores?: any,
  dadosNovos?: any
) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_log (usuario_id, usuario_nome, acao, tipo, referencia_id, descricao, dados_anteriores, dados_novos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        usuarioId ?? null,
        usuarioNome,
        acao,
        tipo,
        referenciaId ?? null,
        descricao ?? null,
        dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
        dadosNovos ? JSON.stringify(dadosNovos) : null,
      ]
    );
  } catch (e) {
    console.warn("audit_log insert error:", e);
  }
}

export function registerAuditRoutes(app: Express): void {
  // ===================== AUDITORIA =====================

  app.get("/api/audit-log", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const { tipo, usuario_id, from, to, limit: lim } = req.query;
      const pool = getPool();
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (tipo) { conditions.push(`tipo = $${idx++}`); params.push(tipo); }
      if (usuario_id) { conditions.push(`usuario_id = $${idx++}`); params.push(parseInt(usuario_id as string)); }
      if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
      if (to) { conditions.push(`created_at <= $${idx++}`); params.push(to + "T23:59:59"); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitVal = Math.min(parseInt((lim as string) || "200"), 500);
      const { rows } = await pool.query(
        `SELECT id, usuario_id, usuario_nome, acao, tipo, referencia_id, descricao, dados_anteriores, dados_novos, created_at
         FROM audit_log ${where}
         ORDER BY created_at DESC
         LIMIT ${limitVal}`,
        params
      );
      res.json(rows);
    } catch (error: any) {
      console.error("Erro ao buscar audit log:", error);
      res.status(500).json({ error: "Erro ao buscar histórico" });
    }
  });

}
