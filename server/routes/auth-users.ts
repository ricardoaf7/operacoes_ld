import type { Express } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { getPool } from "../../db/client";
import { requireAuth, requireRole } from "../route-helpers";

export async function ensureUsersSetorColumn() {
  try {
    const pool = getPool();
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id)
    `);
  } catch (e) {
    console.warn("users.setor_id column check:", e);
  }
}

export async function ensureUsersContratoColumn() {
  try {
    const pool = getPool();
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS contrato VARCHAR(50)
    `);
  } catch (e) {
    console.warn("users.contrato column check:", e);
  }
}

export async function ensureSetoresTable() {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS setores (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(150) NOT NULL,
        parent_id INTEGER REFERENCES setores(id),
        ativo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Seed setores padrão se a tabela estiver vazia
    const { rows } = await pool.query("SELECT COUNT(*) FROM setores");
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO setores (nome, parent_id) VALUES
          ('Capina e Roçagem 1', NULL),
          ('Capina e Roçagem 2', NULL),
          ('Varrição', NULL),
          ('Lavação', NULL),
          ('Jardins', NULL),
          ('Lagos', NULL),
          ('Limpeza de Boca de Lobo', NULL),
          ('Coleta de Rejeitos e Orgânicos', NULL),
          ('Coleta de Recicláveis', NULL),
          ('Cidade Limpa', NULL),
          ('Fiscalização de Posturas', NULL),
          ('Utilização Vias Públicas', NULL),
          ('Feiras', NULL),
          ('Ambulantes', NULL)
      `);
      // Sub-setores de Coleta de Recicláveis
      const { rows: cr } = await pool.query("SELECT id FROM setores WHERE nome = 'Coleta de Recicláveis'");
      if (cr.length > 0) {
        await pool.query(`
          INSERT INTO setores (nome, parent_id) VALUES
            ('Cooper Região', $1),
            ('Cooperoeste', $1),
            ('Coocepeve', $1),
            ('Ecorecin', $1),
            ('Coopernorth', $1),
            ('Refum', $1),
            ('Coopermudança', $1)
        `, [cr[0].id]);
      }
    }
  } catch (e) {
    console.warn("setores table check:", e);
  }
}

export async function ensureAdminExists() {
  const existing = await storage.getUserByEmail("admin@cmtu.londrina.pr.gov.br");
  if (!existing) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await storage.createUser({
      nome: "Administrador",
      email: "admin@cmtu.londrina.pr.gov.br",
      senha: hashedPassword,
      role: "admin",
      ativo: true,
    });
    console.log("👤 Usuário admin padrão criado (admin@cmtu.londrina.pr.gov.br / admin123)");
  }
}

export function registerAuthRoutes(app: Express): void {
  // ===================== AUTH ROUTES =====================

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, senha } = req.body;
      if (!email || !senha) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.ativo) {
        return res.status(401).json({ error: "Email ou senha inválidos" });
      }

      const valid = await bcrypt.compare(senha, user.senha);
      if (!valid) {
        return res.status(401).json({ error: "Email ou senha inválidos" });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.userName = user.nome;
      req.session.userContrato = user.contrato ?? undefined;

      res.json({
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        contrato: user.contrato ?? null,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Erro ao fazer login" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Erro ao fazer logout" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    res.json({
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      contrato: user.contrato ?? null,
    });
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { senhaAtual, novaSenha } = req.body;
      if (!senhaAtual || !novaSenha) {
        return res.status(400).json({ error: "Senha atual e nova senha são obrigatórias" });
      }
      if (novaSenha.length < 4) {
        return res.status(400).json({ error: "A nova senha deve ter pelo menos 4 caracteres" });
      }

      const user = await storage.getUserById(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const valid = await bcrypt.compare(senhaAtual, user.senha);
      if (!valid) {
        return res.status(401).json({ error: "Senha atual incorreta" });
      }

      const hashedPassword = await bcrypt.hash(novaSenha, 10);
      await storage.updateUser(user.id, { senha: hashedPassword });

      res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Erro ao alterar senha" });
    }
  });

}

export function registerUserRoutes(app: Express): void {
  // ===================== USER MANAGEMENT ROUTES =====================

  // Lista simplificada para todos autenticados (dropdowns de responsável etc.)
  app.get("/api/users/list", requireAuth, async (req, res) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(`
        SELECT u.id, u.nome, u.setor_id, s.nome AS setor_nome
        FROM users u
        LEFT JOIN setores s ON s.id = u.setor_id
        WHERE u.ativo = true
        ORDER BY u.nome
      `);
      res.json(rows.map(u => ({
        id: u.id, nome: u.nome,
        setorId: u.setor_id, setorNome: u.setor_nome,
      })));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar usuários" });
    }
  });

  app.get("/api/users", requireRole("admin"), async (req, res) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(`
        SELECT u.id, u.nome, u.email, u.role, u.contrato, u.ativo, u.setor_id,
               s.nome AS setor_nome
        FROM users u
        LEFT JOIN setores s ON s.id = u.setor_id
        ORDER BY u.nome
      `);
      res.json(rows.map(u => ({
        id: u.id, nome: u.nome, email: u.email, role: u.role, contrato: u.contrato, ativo: u.ativo,
        setorId: u.setor_id, setorNome: u.setor_nome,
      })));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar usuários" });
    }
  });

  app.post("/api/users", requireRole("admin"), async (req, res) => {
    try {
      const { nome, email, senha, role, setorId, contrato } = req.body;
      if (!nome || !email || !senha || !role) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
      }
      if (role === "encarregado" && !contrato) {
        return res.status(400).json({ error: "Informe o contrato do encarregado" });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      const hashedPassword = await bcrypt.hash(senha, 10);
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO users (nome, email, senha, role, ativo, setor_id, contrato)
         VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id, nome, email, role, contrato, ativo, setor_id`,
        [nome, email, hashedPassword, role, setorId ?? null, (role === "encarregado" || role === "fiscal") ? (contrato || null) : null]
      );
      const u = rows[0];
      res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, contrato: u.contrato, ativo: u.ativo, setorId: u.setor_id });
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar usuário" });
    }
  });

  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, email, senha, role, ativo, setorId, contrato } = req.body;

      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (nome !== undefined)     { sets.push(`nome=$${i++}`);     vals.push(nome); }
      if (email !== undefined)    { sets.push(`email=$${i++}`);    vals.push(email); }
      if (role !== undefined)     { sets.push(`role=$${i++}`);     vals.push(role); }
      if (ativo !== undefined)    { sets.push(`ativo=$${i++}`);    vals.push(ativo); }
      if (setorId !== undefined)  { sets.push(`setor_id=$${i++}`); vals.push(setorId ?? null); }
      if (contrato !== undefined) { sets.push(`contrato=$${i++}`); vals.push(contrato ?? null); }
      if (senha)                  { sets.push(`senha=$${i++}`);    vals.push(await bcrypt.hash(senha, 10)); }

      if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

      vals.push(id);
      const pool = getPool();
      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${i} RETURNING id, nome, email, role, contrato, ativo, setor_id`,
        vals
      );
      if (!rows.length) return res.status(404).json({ error: "Usuário não encontrado" });
      const u = rows[0];
      res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, contrato: u.contrato, ativo: u.ativo, setorId: u.setor_id });
    } catch (error) {
      res.status(500).json({ error: "Erro ao atualizar usuário" });
    }
  });

  // Gera uma senha temporária nova pro usuário — pensado pro caso do encarregado
  // com e-mail fake, que não tem como recuperar senha sozinho. O admin copia o
  // valor devolvido aqui (só existe em texto puro nesta resposta) e repassa por
  // fora (WhatsApp, papel etc.); no banco só fica o hash, como qualquer senha.
  app.post("/api/users/:id/reset-senha", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const novaSenha = Array.from({ length: 8 }, () =>
        "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 55)]
      ).join("");
      const hashedPassword = await bcrypt.hash(novaSenha, 10);
      const pool = getPool();
      const { rows } = await pool.query(
        `UPDATE users SET senha=$1, updated_at=NOW() WHERE id=$2 RETURNING id, nome`,
        [hashedPassword, id]
      );
      if (!rows.length) return res.status(404).json({ error: "Usuário não encontrado" });
      res.json({ senha: novaSenha });
    } catch (error) {
      res.status(500).json({ error: "Erro ao resetar senha" });
    }
  });

  app.delete("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteUser(id);
      if (!deleted) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar usuário" });
    }
  });

}

export function registerSetoresRoutes(app: Express): void {
  // ===================== SETORES =====================

  app.get("/api/setores", requireAuth, async (req, res) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT * FROM setores ORDER BY parent_id NULLS FIRST, nome"
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar setores" });
    }
  });

  app.post("/api/setores", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const { nome, parentId, ativo = true } = req.body;
      if (!nome?.trim()) return res.status(400).json({ error: "Nome é obrigatório" });
      const pool = getPool();
      const { rows } = await pool.query(
        "INSERT INTO setores (nome, parent_id, ativo) VALUES ($1, $2, $3) RETURNING *",
        [nome.trim(), parentId ?? null, ativo]
      );
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar setor" });
    }
  });

  app.put("/api/setores/:id", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, parentId, ativo } = req.body;
      const pool = getPool();
      const { rows } = await pool.query(
        `UPDATE setores SET nome=$1, parent_id=$2, ativo=$3, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [nome, parentId ?? null, ativo, id]
      );
      if (!rows.length) return res.status(404).json({ error: "Setor não encontrado" });
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Erro ao atualizar setor" });
    }
  });

  app.delete("/api/setores/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      // Verificar se tem filhos
      const { rows: filhos } = await pool.query(
        "SELECT id FROM setores WHERE parent_id=$1 LIMIT 1", [id]
      );
      if (filhos.length > 0) {
        return res.status(400).json({ error: "Não é possível excluir um setor com sub-setores" });
      }
      await pool.query("DELETE FROM setores WHERE id=$1", [id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir setor" });
    }
  });
}
