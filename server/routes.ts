import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { storage } from "./storage";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import type { ServiceArea } from "@shared/schema";
import bcrypt from "bcryptjs";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { createDbPool } from "../db/client";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureUsersSetorColumn() {
  try {
    const pool = createDbPool();
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id)
    `);
    await pool.end();
  } catch (e) {
    console.warn("users.setor_id column check:", e);
  }
}

async function ensureSetoresTable() {
  try {
    const pool = createDbPool();
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
    await pool.end();
  } catch (e) {
    console.warn("setores table check:", e);
  }
}

async function ensureContratoConfigTable() {
  try {
    const pool = createDbPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contrato_config (
        id SERIAL PRIMARY KEY,
        lote INTEGER NOT NULL UNIQUE,
        regiao VARCHAR(100),
        processo_admin VARCHAR(100),
        pregao_eletronico VARCHAR(100),
        numero_contrato VARCHAR(100),
        contratada_nome VARCHAR(200),
        contratada_endereco VARCHAR(300),
        diretor_nome VARCHAR(150),
        gerente_nome VARCHAR(150),
        fiscal_nome VARCHAR(150),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.end();
  } catch (e) {
    console.warn("contrato_config table check:", e);
  }
}

// Função para converter ServiceArea[] para CSV compatível com Supabase
function convertToSupabaseCSV(areas: ServiceArea[]): string {
  if (areas.length === 0) {
    return 'id,ordem,sequencia_cadastro,tipo,endereco,bairro,metragem_m2,lat,lng,lote,status,history,polygon,scheduled_date,proxima_previsao,ultima_rocagem,manual_schedule,days_to_complete,servico,registrado_por,data_registro,executando,executando_desde\n';
  }

  // Headers com nomes de colunas do PostgreSQL
  const headers = [
    'id', 'ordem', 'sequencia_cadastro', 'tipo', 'endereco', 'bairro', 
    'metragem_m2', 'lat', 'lng', 'lote', 'status', 'history', 'polygon',
    'scheduled_date', 'proxima_previsao', 'ultima_rocagem', 'manual_schedule',
    'days_to_complete', 'servico', 'registrado_por', 'data_registro',
    'executando', 'executando_desde'
  ];

  // Função para escapar valores CSV
  function escapeCSVValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Converter arrays/objetos JSONB para formato Supabase
    if (typeof value === 'object') {
      // Usar JSON.stringify e escapar aspas duplas
      const jsonStr = JSON.stringify(value);
      // Escapar aspas duplas dobrando-as e envolver em aspas
      return `"${jsonStr.replace(/"/g, '""')}"`;
    }

    // Converter boolean para string lowercase
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    // Converter números
    if (typeof value === 'number') {
      return String(value);
    }

    // Strings: escapar aspas e vírgulas
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  // Construir CSV
  let csv = headers.join(',') + '\n';

  for (const area of areas) {
    const row = [
      area.id,
      area.ordem ?? '',
      area.sequenciaCadastro ?? '',
      area.tipo ?? '',
      area.endereco ?? '',
      area.bairro ?? '',
      area.metragem_m2 ?? '',
      area.lat ?? '',
      area.lng ?? '',
      area.lote ?? '',
      area.status ?? '',
      area.history ?? [],
      area.polygon ?? null,
      area.scheduledDate ?? '',
      area.proximaPrevisao ?? '',
      area.ultimaRocagem ?? '',
      area.manualSchedule ?? false,
      area.daysToComplete ?? '',
      area.servico ?? '',
      area.registradoPor ?? '',
      area.dataRegistro ?? '',
      area.executando ?? false,
      area.executandoDesde ?? '',
    ];

    csv += row.map(escapeCSVValue).join(',') + '\n';
  }

  return csv;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  next();
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    if (!roles.includes(req.session.userRole || '')) {
      return res.status(403).json({ error: "Sem permissão" });
    }
    next();
  };
}

async function ensureAdminExists() {
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

export async function registerRoutes(app: Express): Promise<void> {
  await ensureAdminExists();
  await ensureSetoresTable();
  await ensureUsersSetorColumn();
  await ensureContratoConfigTable();

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

      res.json({
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
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

  // ===================== USER MANAGEMENT ROUTES =====================

  app.get("/api/users", requireRole("admin"), async (req, res) => {
    try {
      const pool = createDbPool();
      const { rows } = await pool.query(`
        SELECT u.id, u.nome, u.email, u.role, u.ativo, u.setor_id,
               s.nome AS setor_nome
        FROM users u
        LEFT JOIN setores s ON s.id = u.setor_id
        ORDER BY u.nome
      `);
      await pool.end();
      res.json(rows.map(u => ({
        id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo,
        setorId: u.setor_id, setorNome: u.setor_nome,
      })));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar usuários" });
    }
  });

  app.post("/api/users", requireRole("admin"), async (req, res) => {
    try {
      const { nome, email, senha, role, setorId } = req.body;
      if (!nome || !email || !senha || !role) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      const hashedPassword = await bcrypt.hash(senha, 10);
      const pool = createDbPool();
      const { rows } = await pool.query(
        `INSERT INTO users (nome, email, senha, role, ativo, setor_id)
         VALUES ($1,$2,$3,$4,true,$5) RETURNING id, nome, email, role, ativo, setor_id`,
        [nome, email, hashedPassword, role, setorId ?? null]
      );
      await pool.end();
      const u = rows[0];
      res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo, setorId: u.setor_id });
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar usuário" });
    }
  });

  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, email, senha, role, ativo, setorId } = req.body;

      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (nome !== undefined)    { sets.push(`nome=$${i++}`);     vals.push(nome); }
      if (email !== undefined)   { sets.push(`email=$${i++}`);    vals.push(email); }
      if (role !== undefined)    { sets.push(`role=$${i++}`);     vals.push(role); }
      if (ativo !== undefined)   { sets.push(`ativo=$${i++}`);    vals.push(ativo); }
      if (setorId !== undefined) { sets.push(`setor_id=$${i++}`); vals.push(setorId ?? null); }
      if (senha)                 { sets.push(`senha=$${i++}`);    vals.push(await bcrypt.hash(senha, 10)); }

      if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });

      vals.push(id);
      const pool = createDbPool();
      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${i} RETURNING id, nome, email, role, ativo, setor_id`,
        vals
      );
      await pool.end();
      if (!rows.length) return res.status(404).json({ error: "Usuário não encontrado" });
      const u = rows[0];
      res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo, setorId: u.setor_id });
    } catch (error) {
      res.status(500).json({ error: "Erro ao atualizar usuário" });
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

  // ===================== EXISTING ROUTES =====================

  // Endpoint para deletar área
  app.delete("/api/areas/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const deleted = await storage.deleteArea(id);
      if (!deleted) {
        return res.status(404).json({ error: "Área não encontrada" });
      }

      res.json({ success: true, message: "Área deletada com sucesso" });
    } catch (error) {
      console.error("Delete area error:", error);
      res.status(500).json({ error: "Falha ao deletar área" });
    }
  });

  // Endpoint de backup: exportar todos os dados em JSON
  app.get("/api/backup", async (req, res) => {
    try {
      const allAreas = await storage.getAllAreas("rocagem");
      const config = await storage.getConfig();
      
      const backup = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        data: {
          areas: allAreas,
          config: config,
        },
        stats: {
          totalAreas: allAreas.length,
          areasWithMowing: allAreas.filter(a => a.ultimaRocagem).length,
        }
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=zeladoria_backup_${new Date().toISOString().split('T')[0]}.json`);
      res.json(backup);
    } catch (error) {
      console.error("Error creating backup:", error);
      res.status(500).json({ error: "Falha ao gerar backup" });
    }
  });

  app.get("/api/admin/download-csv", async (req, res) => {
    try {
      const csvPath = path.join(process.cwd(), "server", "data", "areas_londrina.csv");
      
      if (!fs.existsSync(csvPath)) {
        res.status(404).json({ error: "Arquivo CSV não encontrado no servidor" });
        return;
      }
      
      res.download(csvPath, "areas_londrina.csv");
    } catch (error) {
      console.error("Error downloading CSV:", error);
      res.status(500).json({ error: "Falha ao baixar arquivo CSV" });
    }
  });

  // Endpoint de exportação CSV para Supabase
  app.get("/api/export/csv", async (req, res) => {
    try {
      const startTime = Date.now();
      const mode = (req.query.mode as string) || 'full';
      
      if (mode !== 'full' && mode !== 'incremental') {
        res.status(400).json({ error: "Modo inválido. Use 'full' ou 'incremental'" });
        return;
      }

      let areas: any[] = [];
      let wasDefaultedToFull = false;

      if (mode === 'incremental') {
        // Tentar obter último export
        const lastExport = await storage.getLastExport('service_areas', 'full');
        
        if (!lastExport) {
          // Se não há histórico, fazer full export como fallback
          areas = await storage.getAllAreas("rocagem");
          wasDefaultedToFull = true;
        } else {
          // Exportar apenas áreas modificadas desde último export
          const lastExportDate = new Date(lastExport.exportedAt);
          areas = await storage.getAreasModifiedSince(lastExportDate);
        }
      } else {
        // Full export: todas as áreas
        areas = await storage.getAllAreas("rocagem");
      }

      // Converter para CSV com formato Supabase-compatível
      const csv = convertToSupabaseCSV(areas);
      
      // Gravar histórico de exportação
      const duration = Date.now() - startTime;
      await storage.recordExport({
        scope: 'service_areas',
        exportType: wasDefaultedToFull ? 'full' : mode as 'full' | 'incremental',
        recordCount: areas.length,
        durationMs: duration,
      });

      // Definir headers para download
      const filename = `zeladoria_${mode}_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Adicionar metadata na response se foi fallback
      if (wasDefaultedToFull) {
        res.setHeader('X-Export-Info', 'Primeira exportação - modo incremental convertido para full');
      }
      
      res.send(csv);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ error: "Falha ao exportar CSV" });
    }
  });

  app.get("/api/areas/rocagem", async (req, res) => {
    try {
      const areas = await storage.getAllAreas("rocagem");
      res.json(areas);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch roçagem areas" });
    }
  });

  // Novo endpoint otimizado: dados leves para mapa (com suporte a viewport bounds)
  app.get("/api/areas/light", async (req, res) => {
    try {
      const boundsParam = req.query.bounds as string;
      
      let areas = await storage.getAllAreas("rocagem");
      
      // Filtrar por bounds se fornecido (viewport do mapa)
      if (boundsParam) {
        try {
          const bounds = JSON.parse(boundsParam);
          // Validar bounds usando Number.isFinite para aceitar valores zero/negativos
          if (Number.isFinite(bounds.north) && Number.isFinite(bounds.south) && 
              Number.isFinite(bounds.east) && Number.isFinite(bounds.west)) {
            areas = areas.filter(area => {
              if (area.lat === null || area.lat === undefined || 
                  area.lng === null || area.lng === undefined) return false;
              return area.lat >= bounds.south && 
                     area.lat <= bounds.north && 
                     area.lng >= bounds.west && 
                     area.lng <= bounds.east;
            });
          }
        } catch (e) {
          console.error("Error parsing bounds:", e);
          res.status(400).json({ error: "Invalid bounds format" });
          return;
        }
      }
      
      // Retornar apenas campos essenciais para o mapa
      const lightAreas = areas.map(area => ({
        id: area.id,
        lat: area.lat,
        lng: area.lng,
        status: area.status,
        proximaPrevisao: area.proximaPrevisao,
        lote: area.lote,
        servico: area.servico,
        endereco: area.endereco,
        bairro: area.bairro,
        tipo: area.tipo,
        ultimaRocagem: area.ultimaRocagem,
        metragem_m2: area.metragem_m2,
        manualSchedule: area.manualSchedule,
        executando: area.executando || false,
      }));
      
      res.json(lightAreas);
    } catch (error) {
      console.error("Error fetching light areas:", error);
      res.status(500).json({ error: "Failed to fetch light areas" });
    }
  });

  // Novo endpoint: busca server-side otimizada
  app.get("/api/areas/search", async (req, res) => {
    try {
      const query = (req.query.q as string || "").trim();
      
      if (!query) {
        res.json([]);
        return;
      }
      
      // Usar método otimizado do storage que filtra direto no banco
      const results = await storage.searchAreas(query, "rocagem", 50);
      
      res.json(results);
    } catch (error) {
      console.error("Error searching areas:", error);
      res.status(500).json({ error: "Failed to search areas" });
    }
  });

  // Retorna IDs de áreas roçadas em um período específico
  app.get("/api/areas/by-period", async (req, res) => {
    try {
      const { from, to, details, lote, bairro, tipo } = req.query;
      if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
        return res.status(400).json({ error: "Parâmetros 'from' e 'to' são obrigatórios (YYYY-MM-DD)" });
      }

      const allAreas = await storage.getAllAreas('rocagem');
      const fromDate = new Date(from + 'T00:00:00');
      const toDate = new Date(to + 'T23:59:59');

      const matchingAreas = allAreas
        .filter(area => {
          if (!area.ultimaRocagem) return false;
          const mowDate = new Date(area.ultimaRocagem);
          if (mowDate < fromDate || mowDate > toDate) return false;
          if (lote && typeof lote === 'string' && lote !== 'all') {
            if (area.lote !== parseInt(lote)) return false;
          }
          if (bairro && typeof bairro === 'string' && bairro !== 'all') {
            if (area.bairro !== bairro) return false;
          }
          if (tipo && typeof tipo === 'string' && tipo !== 'all') {
            if (area.tipo !== tipo) return false;
          }
          return true;
        });

      if (details === 'true') {
        const detailedAreas = matchingAreas
          .map(area => ({
            id: area.id,
            endereco: area.endereco || '',
            bairro: area.bairro || '',
            tipo: area.tipo || '',
            metragem: area.metragem_m2 || 0,
            lote: area.lote || 0,
            ultimaRocagem: area.ultimaRocagem,
          }))
          .sort((a, b) => {
            if (a.lote !== b.lote) return a.lote - b.lote;
            return a.endereco.localeCompare(b.endereco, 'pt-BR');
          });
        
        const totalMetragem = detailedAreas.reduce((sum, a) => sum + a.metragem, 0);
        
        res.json({ 
          areas: detailedAreas, 
          count: detailedAreas.length,
          totalMetragem,
          periodo: { from, to },
          loteFilter: lote || 'all'
        });
      } else {
        const matchingIds = matchingAreas.map(area => area.id);
        res.json({ ids: matchingIds, count: matchingIds.length });
      }
    } catch (error) {
      console.error("Error fetching areas by period:", error);
      res.status(500).json({ error: "Falha ao buscar áreas por período" });
    }
  });

  // Novo endpoint: detalhes completos de uma área específica
  app.get("/api/areas/:id", async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const area = await storage.getAreaById(areaId);
      
      if (!area) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      
      res.json(area);
    } catch (error) {
      console.error("Error fetching area details:", error);
      res.status(500).json({ error: "Failed to fetch area details" });
    }
  });

  // Criar nova área de serviço
  app.post("/api/areas", requireAuth, async (req, res) => {
    try {
      const createSchema = z.object({
        tipo: z.string().min(1, "Tipo é obrigatório"),
        endereco: z.string().min(1, "Endereço é obrigatório"),
        bairro: z.string().optional(),
        metragem_m2: z.number().positive().optional(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        lote: z.number().int().min(1).max(2).optional(),
        servico: z.literal("rocagem").optional().default("rocagem"),
        status: z.enum(["Pendente", "Em Execução", "Concluído"]).default("Pendente"),
        ultimaRocagem: z.string().optional(),
      });

      const validatedData = createSchema.parse(req.body);
      
      // Calcular proximaPrevisao se área já foi roçada
      let proximaPrevisao: string | null = null;
      if (validatedData.ultimaRocagem) {
        const { calculateNextMowing } = await import('@shared/schedulingAlgorithm');
        const tempArea = {
          id: 0,
          ultimaRocagem: validatedData.ultimaRocagem,
          manualSchedule: false,
        } as any;
        
        const result = calculateNextMowing(tempArea);
        if (result) {
          proximaPrevisao = result.proximaPrevisao;
        }
      }
      
      const newArea = await storage.createArea({
        tipo: validatedData.tipo,
        endereco: validatedData.endereco,
        bairro: validatedData.bairro,
        metragem_m2: validatedData.metragem_m2,
        lat: validatedData.lat,
        lng: validatedData.lng,
        lote: validatedData.lote,
        servico: validatedData.servico,
        status: validatedData.status,
        ordem: undefined,
        sequenciaCadastro: undefined,
        history: [],
        polygon: null,
        scheduledDate: null,
        proximaPrevisao,
        ultimaRocagem: validatedData.ultimaRocagem || null,
        manualSchedule: false,
        daysToComplete: undefined,
        registradoPor: null,
        dataRegistro: null,
        fotos: [],
        executando: false,
        executandoDesde: null,
      });

      res.status(201).json(newArea);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Dados inválidos", 
          details: error.errors 
        });
        return;
      }
      console.error("Error creating area:", error);
      res.status(500).json({ error: "Falha ao criar área" });
    }
  });

  // Geocoding: buscar endereços em Londrina (Nominatim/OSM)
  app.get("/api/geocode/search", async (req, res) => {
    try {
      const query = (req.query.q as string || "").trim();
      
      if (!query || query.length < 3) {
        res.json([]);
        return;
      }

      // Usar Nominatim (OpenStreetMap) para geocoding
      const encodedQuery = encodeURIComponent(`${query}, Londrina, Paraná, Brasil`);
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodedQuery}&format=json&limit=8&` +
        `countrycodes=br&bounded=1&` +
        `viewbox=-51.22,-23.25,-51.10,-23.38`;

      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'CMTU-LD Zeladoria Dashboard'
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const results = await response.json();
      
      // Formatar resultados
      const formatted = results.map((r: any) => ({
        display_name: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        type: r.type,
        address: r.address,
        boundingbox: r.boundingbox,
      }));

      res.json(formatted);
    } catch (error) {
      console.error("Error geocoding:", error);
      res.status(500).json({ error: "Falha ao buscar endereço" });
    }
  });

  // Reverse Geocoding: obter endereço a partir de coordenadas
  app.get("/api/geocode/reverse", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);

      if (isNaN(lat) || isNaN(lng)) {
        res.status(400).json({ error: "Coordenadas inválidas" });
        return;
      }

      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?` +
        `lat=${lat}&lon=${lng}&format=json`;

      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'CMTU-LD Zeladoria Dashboard'
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const result = await response.json();
      
      res.json({
        display_name: result.display_name,
        address: result.address,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
      });
    } catch (error) {
      console.error("Error reverse geocoding:", error);
      res.status(500).json({ error: "Falha ao obter endereço" });
    }
  });

  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getAllTeams();
      res.json(teams);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teams" });
    }
  });

  app.get("/api/config", async (req, res) => {
    try {
      const config = await storage.getConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch configuration" });
    }
  });

  app.patch("/api/config", requireAuth, async (req, res) => {
    try {
      const configSchema = z.object({
        mowingProductionRate: z.object({
          lote1: z.number(),
          lote2: z.number(),
        }).partial().optional(),
        metaMensal: z.number().positive().optional(),
        metaLote1: z.number().positive().optional(),
        metaLote2: z.number().positive().optional(),
      });

      const validatedConfig = configSchema.parse(req.body);
      const updatedConfig = await storage.updateConfig(validatedConfig as any);
      res.json(updatedConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid configuration data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update configuration" });
      }
    }
  });

  app.patch("/api/areas/:id/status", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const statusSchema = z.object({
        status: z.enum(["Pendente", "Em Execução", "Concluído"]),
      });

      const { status } = statusSchema.parse(req.body);
      const updatedArea = await storage.updateAreaStatus(areaId, status);

      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }

      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid status data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update area status" });
      }
    }
  });

  app.patch("/api/teams/:id/assign", requireAuth, async (req, res) => {
    try {
      const teamId = parseInt(req.params.id);
      const assignSchema = z.object({
        areaId: z.number(),
      });

      const { areaId } = assignSchema.parse(req.body);
      const updatedTeam = await storage.assignTeamToArea(teamId, areaId);

      if (!updatedTeam) {
        res.status(404).json({ error: "Team not found" });
        return;
      }

      res.json(updatedTeam);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid assignment data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to assign team" });
      }
    }
  });

  app.patch("/api/areas/:id/polygon", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const polygonSchema = z.object({
        polygon: z.array(z.object({
          lat: z.number(),
          lng: z.number(),
        })),
      });

      const { polygon } = polygonSchema.parse(req.body);
      const updatedArea = await storage.updateAreaPolygon(areaId, polygon);

      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }

      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid polygon data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update polygon" });
      }
    }
  });

  app.patch("/api/areas/:id/position", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const positionSchema = z.object({
        lat: z.number(),
        lng: z.number(),
      });

      const { lat, lng } = positionSchema.parse(req.body);
      const updatedArea = await storage.updateAreaPosition(areaId, lat, lng);

      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }

      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid position data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update position" });
      }
    }
  });

  app.patch("/api/areas/:id/executando", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const schema = z.object({
        executando: z.boolean(),
      });

      const { executando } = schema.parse(req.body);
      const updatedArea = await storage.toggleExecutando(areaId, executando);

      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }

      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update executando status" });
      }
    }
  });

  app.post("/api/areas/reset-executando", requireAuth, async (_req, res) => {
    try {
      const count = await storage.resetAllExecutando();
      res.json({ message: `${count} áreas resetadas`, count });
    } catch (error) {
      console.error("Error resetting executando:", error);
      res.status(500).json({ error: "Failed to reset executando" });
    }
  });

  app.patch("/api/areas/:id/manual-forecast", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const manualForecastSchema = z.object({
        proximaPrevisao: z.string().min(1),
      });

      const { proximaPrevisao } = manualForecastSchema.parse(req.body);
      
      const updatedArea = await storage.updateArea(areaId, {
        proximaPrevisao,
        manualSchedule: true,
      });

      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }

      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid manual forecast data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to set manual forecast" });
      }
    }
  });

  app.patch("/api/areas/:id", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const updateSchema = z.object({
        endereco: z.string().optional(),
        bairro: z.string().optional(),
        metragem_m2: z.number().optional(),
        lote: z.number().optional(),
        tipo: z.string().optional(),
        ultimaRocagem: z.string().min(1).optional(),
        status: z.enum(["Pendente", "Em Execução", "Concluído"]).optional(),
        registradoPor: z.string().optional(),
        fotos: z.array(z.object({ url: z.string(), data: z.string() })).optional(),
      });

      const data = updateSchema.parse(req.body);
      
      // Se está registrando roçagem, adicionar ao histórico e recalcular a partir do mais recente
      if (data.ultimaRocagem) {
        const areaAtual = await storage.getAreaById(areaId);
        if (!areaAtual) { res.status(404).json({ error: "Area not found" }); return; }

        // Salva campos básicos (status, registradoPor, fotos) sem alterar ultimaRocagem/previsao ainda
        await storage.updateArea(areaId, {
          ...data,
          status: "Concluído" as const,
          dataRegistro: new Date().toISOString(),
          manualSchedule: false,
        });

        // Adiciona entrada ao histórico
        await storage.addHistoryEntry(areaId, {
          date: data.ultimaRocagem,
          type: "completed",
          status: "Concluído",
          observation: data.registradoPor
            ? `Roçagem concluída por ${data.registradoPor}`
            : "Roçagem concluída",
        });

        // Recalcula ultimaRocagem e previsão a partir da data MAIS RECENTE do histórico
        const areaAtualizada = await storage.getAreaById(areaId);
        const sync = syncFromHistory(areaAtualizada?.history ?? []);
        const final = await storage.updateArea(areaId, sync as any);

        res.json(final);
        return;
      }
      
      // Atualizações sem registro de roçagem
      const updatedArea = await storage.updateArea(areaId, data);
      
      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }

      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid area data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update area" });
      }
    }
  });

  // Calcula ultimaRocagem e proximaPrevisao a partir das entradas concluídas do histórico
  function syncFromHistory(history: { date: string; type?: string }[]) {
    const completed = history
      .filter((h) => h.type !== "forecast")
      .map((h) => h.date)
      .sort()
      .reverse();
    const ultimaRocagem = completed[0] ?? null;
    let proximaPrevisao: string | null = null;
    if (ultimaRocagem) {
      const d = new Date(ultimaRocagem);
      d.setDate(d.getDate() + 60);
      proximaPrevisao = d.toISOString().split("T")[0];
    }
    return { ultimaRocagem, proximaPrevisao };
  }

  app.post("/api/areas/:id/history", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const historyEntrySchema = z.object({
        date: z.string(),
        status: z.string(),
        observation: z.string().optional(),
      });

      const entry = historyEntrySchema.parse(req.body);
      const updatedArea = await storage.addHistoryEntry(areaId, entry);
      if (!updatedArea) { res.status(404).json({ error: "Area not found" }); return; }

      // Sincroniza ultima_rocagem com a data mais recente do histórico
      const sync = syncFromHistory(updatedArea.history);
      const final = await storage.updateArea(areaId, sync as any);
      res.json(final);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid history entry", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to add history entry" });
      }
    }
  });

  // Excluir entrada do histórico (somente admin)
  app.delete("/api/areas/:id/history/:index", requireAuth, async (req, res) => {
    try {
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Apenas administradores podem excluir histórico" });
        return;
      }
      const areaId = parseInt(req.params.id);
      const idx = parseInt(req.params.index);
      const area = await storage.getAreaById(areaId);
      if (!area) { res.status(404).json({ error: "Area not found" }); return; }
      const newHistory = area.history.filter((_, i) => i !== idx);
      const sync = syncFromHistory(newHistory);
      const updated = await storage.updateArea(areaId, { history: newHistory, ...sync } as any);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to delete history entry" });
    }
  });

  // Editar entrada do histórico (somente admin)
  app.patch("/api/areas/:id/history/:index", requireAuth, async (req, res) => {
    try {
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Apenas administradores podem editar histórico" });
        return;
      }
      const areaId = parseInt(req.params.id);
      const idx = parseInt(req.params.index);
      const entrySchema = z.object({
        date: z.string(),
        status: z.string(),
        observation: z.string().optional(),
      });
      const entry = entrySchema.parse(req.body);
      const area = await storage.getAreaById(areaId);
      if (!area) { res.status(404).json({ error: "Area not found" }); return; }
      const newHistory = area.history.map((h, i) => i === idx ? { ...h, ...entry } : h);
      const sync = syncFromHistory(newHistory);
      const updated = await storage.updateArea(areaId, { history: newHistory, ...sync } as any);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update history entry" });
      }
    }
  });

  // Upload de foto para Supabase Storage
  app.post("/api/areas/:id/photos", requireAuth, upload.single("photo"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "Nenhum arquivo enviado" }); return; }
      const areaId = parseInt(req.params.id);
      const date = req.body.date || new Date().toISOString().split("T")[0];
      const ext = req.file.originalname.split(".").pop() ?? "jpg";
      const filePath = `areas/${areaId}/${Date.now()}.${ext}`;

      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage
        .from("fotos")
        .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

      if (uploadError) {
        console.error("Supabase upload error:", uploadError);
        res.status(500).json({ error: uploadError.message });
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from("fotos").getPublicUrl(filePath);

      const area = await storage.getAreaById(areaId);
      if (!area) { res.status(404).json({ error: "Area not found" }); return; }
      const fotos = [...(area.fotos || []), { url: publicUrl, data: new Date(date + "T12:00:00").toISOString() }];
      const updated = await storage.updateArea(areaId, { fotos } as any);
      res.json(updated);
    } catch (error) {
      console.error("Photo upload error:", error);
      res.status(500).json({ error: "Erro ao fazer upload da foto" });
    }
  });

  // Excluir foto do Supabase Storage
  app.delete("/api/areas/:id/photos", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const { photoUrl } = req.body;
      if (!photoUrl) { res.status(400).json({ error: "URL da foto não informada" }); return; }

      const marker = `/storage/v1/object/public/fotos/`;
      const filePath = photoUrl.includes(marker) ? photoUrl.split(marker)[1] : null;
      if (filePath) {
        const supabase = getSupabase();
        await supabase.storage.from("fotos").remove([filePath]);
      }

      const area = await storage.getAreaById(areaId);
      if (!area) { res.status(404).json({ error: "Area not found" }); return; }
      const fotos = (area.fotos || []).filter((f: any) => f.url !== photoUrl);
      const updated = await storage.updateArea(areaId, { fotos } as any);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir foto" });
    }
  });

  app.post("/api/areas/register-daily", requireAuth, async (req, res) => {
    try {
      const registerSchema = z.object({
        areaIds: z.array(z.number()).min(1, "Selecione pelo menos uma área"),
        date: z.string(),
        type: z.enum(['completed', 'forecast']).default('completed'),
      });

      const { areaIds, date, type } = registerSchema.parse(req.body);
      await storage.registerDailyMowing(areaIds, date, type);

      const typeLabel = type === 'completed' ? 'registrada' : 'prevista';
      res.json({ 
        success: true, 
        message: `${areaIds.length} área(s) ${typeLabel}(s) com sucesso`,
        count: areaIds.length 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Dados inválidos", details: error.errors });
      } else {
        console.error("Error registering daily mowing:", error);
        res.status(500).json({ error: "Falha ao registrar roçagem" });
      }
    }
  });

  // ROTAS ADMIN PERIGOSAS REMOVIDAS:
  // - POST /api/admin/import-data (risco de sobrescrever dados existentes)
  // - POST /api/admin/clear-simulation (apaga todos os registros de roçagem)
  // - POST /api/admin/import-production (não necessário - banco é compartilhado entre dev e produção)

  // Desfazer último registro de roçagem de uma área
  app.delete("/api/areas/:id/rocagem", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      
      if (isNaN(areaId)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }
      
      // Buscar área atual
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "Área não encontrada" });
        return;
      }
      
      // Limpar o registro de roçagem e campos relacionados
      const updatedArea = await storage.updateArea(areaId, {
        ultimaRocagem: null,
        proximaPrevisao: null,
        registradoPor: null,
        dataRegistro: null,
        status: "Pendente" as const,
        manualSchedule: false,
      });
      
      if (!updatedArea) {
        res.status(500).json({ error: "Falha ao desfazer roçagem" });
        return;
      }
      
      res.json({ 
        success: true, 
        message: "Registro de roçagem removido com sucesso",
        area: updatedArea 
      });
    } catch (error) {
      console.error("Error undoing mowing:", error);
      res.status(500).json({ error: "Falha ao desfazer roçagem" });
    }
  });

  app.post("/api/admin/recalculate-schedules", requireRole("admin"), async (req, res) => {
    console.log("📅 Recalculando agendamentos de todas as áreas");
    
    try {
      const { calculateMowingSchedule } = await import('@shared/schedulingAlgorithm');
      
      console.log("📊 Buscando áreas e configurações...");
      const areas = await storage.getAllAreas('rocagem');
      const config = await storage.getConfig();
      
      console.log(`🔢 Processando ${areas.length} áreas...`);
      
      // Calcular para lote 1
      const lote1Results = calculateMowingSchedule(
        areas.filter(a => a.lote === 1),
        1,
        config.mowingProductionRate.lote1,
        new Date()
      );
      
      // Calcular para lote 2
      const lote2Results = calculateMowingSchedule(
        areas.filter(a => a.lote === 2),
        2,
        config.mowingProductionRate.lote2,
        new Date()
      );
      
      const allResults = [...lote1Results, ...lote2Results];
      console.log(`✅ ${allResults.length} previsões calculadas`);
      
      // Atualizar áreas com as previsões
      console.log("💾 Salvando previsões no banco...");
      for (const result of allResults) {
        await storage.updateArea(result.areaId, {
          proximaPrevisao: result.proximaPrevisao,
          daysToComplete: result.daysToComplete
        });
      }
      
      console.log(`✅ Agendamentos recalculados com sucesso!`);
      
      res.json({ 
        success: true, 
        message: `✅ Agendamentos recalculados para ${allResults.length} áreas!`,
        calculated: allResults.length
      });
    } catch (error: any) {
      console.error("💥 ERRO ao recalcular agendamentos:", error);
      res.status(500).json({ 
        error: "Falha ao recalcular agendamentos", 
        details: error.message
      });
    }
  });

  // Reset automático de "executando" - verifica periodicamente se há áreas
  // marcadas em dias anteriores (horário de Brasília) e reseta automaticamente.
  // Usa setInterval ao invés de setTimeout para sobreviver a reinícios do servidor.
  function getTodayBrasilia(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return formatter.format(new Date());
  }

  async function checkAndResetStaleExecutando() {
    try {
      const todayStr = getTodayBrasilia();
      const count = await storage.resetStaleExecutando(todayStr);
      if (count > 0) {
        console.log(`Reset automatico: ${count} areas tiveram "executando" resetado (marcadas antes de ${todayStr})`);
      }
    } catch (error) {
      console.error("Erro no reset automatico de executando:", error);
    }
  }

  checkAndResetStaleExecutando().then(() => {
    console.log(`Reset executando: verificacao inicial concluida (hoje Brasilia: ${getTodayBrasilia()})`);
  });
  setInterval(checkAndResetStaleExecutando, 5 * 60 * 1000);

  // Estatísticas de roçagem - metragem mensal, médias, meta
  app.get("/api/stats/rocagem", async (req, res) => {
    try {
      const config = await storage.getConfig();
      const META_LOTE1 = config.metaLote1 ?? 1562500;
      const META_LOTE2 = config.metaLote2 ?? 1562500;
      const META_MENSAL = config.metaMensal ?? (META_LOTE1 + META_LOTE2);
      const now = new Date();
      
      // Usar timezone de Brasília para determinar datas
      const brasiliaFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const todayStr = brasiliaFormatter.format(now); // "YYYY-MM-DD"
      const [yearStr, monthStr] = todayStr.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const day = parseInt(todayStr.split('-')[2]);
      
      // Período: parâmetros opcionais from/to, senão mês atual
      const fromParam = req.query.from as string | undefined;
      const toParam = req.query.to as string | undefined;
      
      const isCustomPeriod = !!(fromParam && toParam);
      const monthPrefix = `${yearStr}-${monthStr}`;
      const fromDate = fromParam || `${monthPrefix}-01`;
      const toDate = toParam || todayStr;
      
      // Calcular ontem
      const yesterdayDate = new Date(now);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = brasiliaFormatter.format(yesterdayDate);
      
      // Buscar todas áreas de roçagem
      const rocagemAreas = await storage.getAllAreas('rocagem');
      
      // Áreas roçadas no período
      const areasNoPeriodo = rocagemAreas.filter((a: ServiceArea) => {
        if (!a.ultimaRocagem) return false;
        return a.ultimaRocagem >= fromDate && a.ultimaRocagem <= toDate;
      });
      
      // Áreas roçadas ontem
      const areasOntem = rocagemAreas.filter((a: ServiceArea) => a.ultimaRocagem === yesterdayStr);
      
      // Calcular por lote
      const calcLoteStats = (areas: ServiceArea[], areasY: ServiceArea[], lote: number) => {
        const lotAreas = areas.filter((a: ServiceArea) => a.lote === lote);
        const lotAreasYesterday = areasY.filter((a: ServiceArea) => a.lote === lote);
        const totalM2 = lotAreas.reduce((sum: number, a: ServiceArea) => sum + (a.metragem_m2 || 0), 0);
        const yesterdayM2 = lotAreasYesterday.reduce((sum: number, a: ServiceArea) => sum + (a.metragem_m2 || 0), 0);
        return { totalM2, yesterdayM2, areasCount: lotAreas.length, areasYesterday: lotAreasYesterday.length };
      };
      
      const lote1 = calcLoteStats(areasNoPeriodo, areasOntem, 1);
      const lote2 = calcLoteStats(areasNoPeriodo, areasOntem, 2);
      
      const totalRocado = lote1.totalM2 + lote2.totalM2;
      const totalOntem = lote1.yesterdayM2 + lote2.yesterdayM2;
      const totalAreas = lote1.areasCount + lote2.areasCount;
      
      // Função para contar dias úteis (seg-sex) entre duas datas
      const countWeekdays = (startStr: string, endStr: string): number => {
        const start = new Date(startStr + 'T12:00:00');
        const end = new Date(endStr + 'T12:00:00');
        let count = 0;
        const current = new Date(start);
        while (current <= end) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
          }
          current.setDate(current.getDate() + 1);
        }
        return count;
      };

      // Calcular dias úteis decorridos e restantes
      let diasUteisDecorridos: number;
      let diasUteisRestantes: number;
      
      if (isCustomPeriod) {
        diasUteisDecorridos = Math.max(1, countWeekdays(fromDate, toDate));
        diasUteisRestantes = 0;
      } else {
        diasUteisDecorridos = countWeekdays(`${monthPrefix}-01`, todayStr);
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const lastDayStr = `${monthPrefix}-${String(lastDayOfMonth).padStart(2, '0')}`;
        const tomorrowDate = new Date(now);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = brasiliaFormatter.format(tomorrowDate);
        diasUteisRestantes = countWeekdays(tomorrowStr, lastDayStr);
      }
      
      // Médias (baseadas em dias úteis)
      const mediaDiaria = diasUteisDecorridos > 0 ? totalRocado / diasUteisDecorridos : 0;
      const faltaParaMeta = Math.max(0, META_MENSAL - totalRocado);
      const mediaNecessaria = diasUteisRestantes > 0 ? faltaParaMeta / diasUteisRestantes : 0;
      const percentualMeta = META_MENSAL > 0 ? (totalRocado / META_MENSAL) * 100 : 0;
      
      // Cálculos individuais por lote
      const faltaLote1 = Math.max(0, META_LOTE1 - lote1.totalM2);
      const faltaLote2 = Math.max(0, META_LOTE2 - lote2.totalM2);
      const necessariaLote1 = diasUteisRestantes > 0 ? faltaLote1 / diasUteisRestantes : 0;
      const necessariaLote2 = diasUteisRestantes > 0 ? faltaLote2 / diasUteisRestantes : 0;
      const percentLote1 = META_LOTE1 > 0 ? (lote1.totalM2 / META_LOTE1) * 100 : 0;
      const percentLote2 = META_LOTE2 > 0 ? (lote2.totalM2 / META_LOTE2) * 100 : 0;

      res.json({
        periodo: { from: fromDate, to: toDate },
        metaMensal: META_MENSAL,
        totalRocado,
        totalAreas,
        mediaDiaria,
        faltaParaMeta,
        diasDecorridos: diasUteisDecorridos,
        diasRestantes: diasUteisRestantes,
        mediaNecessaria,
        percentualMeta,
        rocadoOntem: totalOntem,
        areasOntem: lote1.areasYesterday + lote2.areasYesterday,
        lote1: {
          meta: META_LOTE1,
          totalM2: lote1.totalM2,
          areasCount: lote1.areasCount,
          mediaDiaria: diasUteisDecorridos > 0 ? lote1.totalM2 / diasUteisDecorridos : 0,
          faltaParaMeta: faltaLote1,
          mediaNecessaria: necessariaLote1,
          percentualMeta: percentLote1,
          rocadoOntem: lote1.yesterdayM2,
          areasOntem: lote1.areasYesterday,
        },
        lote2: {
          meta: META_LOTE2,
          totalM2: lote2.totalM2,
          areasCount: lote2.areasCount,
          mediaDiaria: diasUteisDecorridos > 0 ? lote2.totalM2 / diasUteisDecorridos : 0,
          faltaParaMeta: faltaLote2,
          mediaNecessaria: necessariaLote2,
          percentualMeta: percentLote2,
          rocadoOntem: lote2.yesterdayM2,
          areasOntem: lote2.areasYesterday,
        },
      });
    } catch (error) {
      console.error("Error calculating mowing stats:", error);
      res.status(500).json({ error: "Falha ao calcular estatísticas" });
    }
  });

  // ===================== ORDENS DE SERVIÇO =====================

  app.get("/api/ordens", requireAuth, async (req, res) => {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("ordens_servico")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao buscar ordens" });
    }
  });

  app.get("/api/ordens/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sb = getSupabase();

      const { data: ordem, error: e1 } = await sb
        .from("ordens_servico")
        .select("*")
        .eq("id", id)
        .single();
      if (e1) throw e1;

      const { data: areaLinks, error: e2 } = await sb
        .from("ordens_servico_areas")
        .select("area_id")
        .eq("ordem_id", id);
      if (e2) throw e2;

      const areaIds = areaLinks.map((r: any) => r.area_id);
      let areas: any[] = [];
      if (areaIds.length > 0) {
        const { data: areaData, error: e3 } = await sb
          .from("service_areas")
          .select("id, tipo, endereco, bairro, metragem_m2")
          .in("id", areaIds)
          .order("id");
        if (e3) throw e3;
        areas = areaData;
      }

      res.json({ ...ordem, areas });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao buscar ordem" });
    }
  });

  app.post("/api/ordens", requireAuth, async (req, res) => {
    try {
      const { numero, lote, mes_referencia, data_emissao, emitido_por, observacao, area_ids } = req.body;
      if (!numero || !lote || !mes_referencia || !data_emissao || !area_ids?.length) {
        return res.status(400).json({ error: "Campos obrigatórios faltando" });
      }

      const sb = getSupabase();

      const { data: ordem, error: e1 } = await sb
        .from("ordens_servico")
        .insert({ numero, lote, mes_referencia, data_emissao, emitido_por: emitido_por || req.session.userName, observacao })
        .select()
        .single();
      if (e1) throw e1;

      const links = area_ids.map((area_id: number) => ({ ordem_id: ordem.id, area_id }));
      const { error: e2 } = await sb.from("ordens_servico_areas").insert(links);
      if (e2) throw e2;

      res.status(201).json(ordem);
    } catch (error: any) {
      console.error("Erro ao criar ordem:", error);
      res.status(500).json({ error: "Erro ao criar ordem de serviço" });
    }
  });

  app.patch("/api/ordens/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { numero, lote, mes_referencia, data_emissao, observacao, area_ids } = req.body;

      const sb = getSupabase();

      const updateData: any = {};
      if (numero !== undefined) updateData.numero = numero;
      if (lote !== undefined) updateData.lote = lote;
      if (mes_referencia !== undefined) updateData.mes_referencia = mes_referencia;
      if (data_emissao !== undefined) updateData.data_emissao = data_emissao;
      if (observacao !== undefined) updateData.observacao = observacao;

      if (Object.keys(updateData).length > 0) {
        const { error: e1 } = await sb.from("ordens_servico").update(updateData).eq("id", id);
        if (e1) throw e1;
      }

      if (area_ids !== undefined) {
        const { error: e2 } = await sb.from("ordens_servico_areas").delete().eq("ordem_id", id);
        if (e2) throw e2;
        if (area_ids.length > 0) {
          const links = area_ids.map((area_id: number) => ({ ordem_id: id, area_id }));
          const { error: e3 } = await sb.from("ordens_servico_areas").insert(links);
          if (e3) throw e3;
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao atualizar ordem:", error);
      res.status(500).json({ error: "Erro ao atualizar ordem de serviço" });
    }
  });

  app.delete("/api/ordens/:id", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sb = getSupabase();
      const { error } = await sb.from("ordens_servico").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao excluir ordem" });
    }
  });

  // ===================== CONFIGURAÇÃO DE CONTRATO =====================

  app.get("/api/contrato-config/:lote", requireAuth, async (req, res) => {
    try {
      const lote = parseInt(req.params.lote);
      const pool = createDbPool();
      const result = await pool.query(
        "SELECT * FROM contrato_config WHERE lote = $1",
        [lote]
      );
      await pool.end();
      res.json(result.rows[0] ?? { lote });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao buscar configuração do contrato" });
    }
  });

  app.put("/api/contrato-config/:lote", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const lote = parseInt(req.params.lote);
      const {
        regiao, processo_admin, pregao_eletronico, numero_contrato,
        contratada_nome, contratada_endereco,
        diretor_nome, gerente_nome, fiscal_nome,
      } = req.body;

      const pool = createDbPool();
      await pool.query(`
        INSERT INTO contrato_config
          (lote, regiao, processo_admin, pregao_eletronico, numero_contrato,
           contratada_nome, contratada_endereco, diretor_nome, gerente_nome, fiscal_nome, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
        ON CONFLICT (lote) DO UPDATE SET
          regiao = EXCLUDED.regiao,
          processo_admin = EXCLUDED.processo_admin,
          pregao_eletronico = EXCLUDED.pregao_eletronico,
          numero_contrato = EXCLUDED.numero_contrato,
          contratada_nome = EXCLUDED.contratada_nome,
          contratada_endereco = EXCLUDED.contratada_endereco,
          diretor_nome = EXCLUDED.diretor_nome,
          gerente_nome = EXCLUDED.gerente_nome,
          fiscal_nome = EXCLUDED.fiscal_nome,
          updated_at = NOW()
      `, [lote, regiao, processo_admin, pregao_eletronico, numero_contrato,
          contratada_nome, contratada_endereco, diretor_nome, gerente_nome, fiscal_nome]);
      await pool.end();
      res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao salvar configuração do contrato:", error);
      res.status(500).json({ error: "Erro ao salvar configuração do contrato" });
    }
  });

  // ===================== CRONOGRAMAS SEMANAIS =====================

  app.get("/api/cronogramas", requireAuth, async (req, res) => {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("cronogramas_semanais")
        .select("*")
        .order("semana_inicio", { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao buscar cronogramas" });
    }
  });

  app.get("/api/cronogramas/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sb = getSupabase();

      const { data: cronograma, error: e1 } = await sb
        .from("cronogramas_semanais")
        .select("*")
        .eq("id", id)
        .single();
      if (e1) throw e1;

      const { data: areaLinks, error: e2 } = await sb
        .from("cronograma_areas")
        .select("area_id")
        .eq("cronograma_id", id);
      if (e2) throw e2;

      const areaIds = areaLinks.map((r: any) => r.area_id);
      let areas: any[] = [];
      if (areaIds.length > 0) {
        const { data: areaData, error: e3 } = await sb
          .from("service_areas")
          .select("id, tipo, endereco, bairro, metragem_m2, lat, lng")
          .in("id", areaIds)
          .order("id");
        if (e3) throw e3;
        areas = areaData;
      }

      res.json({ ...cronograma, areas });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao buscar cronograma" });
    }
  });

  app.post("/api/cronogramas", requireAuth, async (req, res) => {
    try {
      const { lote, semana_inicio, semana_fim, observacao, area_ids } = req.body;
      if (!lote || !semana_inicio || !semana_fim || !area_ids?.length) {
        return res.status(400).json({ error: "Campos obrigatórios faltando" });
      }

      const sb = getSupabase();

      const { data: cronograma, error: e1 } = await sb
        .from("cronogramas_semanais")
        .insert({ lote, semana_inicio, semana_fim, observacao, criado_por: req.session.userName })
        .select()
        .single();
      if (e1) throw e1;

      const links = area_ids.map((area_id: number) => ({ cronograma_id: cronograma.id, area_id }));
      const { error: e2 } = await sb.from("cronograma_areas").insert(links);
      if (e2) throw e2;

      res.status(201).json(cronograma);
    } catch (error: any) {
      console.error("Erro ao criar cronograma:", error);
      res.status(500).json({ error: "Erro ao criar cronograma" });
    }
  });

  app.patch("/api/cronogramas/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { lote, semana_inicio, semana_fim, observacao, area_ids } = req.body;

      const sb = getSupabase();

      const updateData: any = { updated_at: new Date().toISOString() };
      if (lote !== undefined) updateData.lote = lote;
      if (semana_inicio !== undefined) updateData.semana_inicio = semana_inicio;
      if (semana_fim !== undefined) updateData.semana_fim = semana_fim;
      if (observacao !== undefined) updateData.observacao = observacao;

      const { error: e1 } = await sb.from("cronogramas_semanais").update(updateData).eq("id", id);
      if (e1) throw e1;

      if (area_ids !== undefined) {
        const { error: e2 } = await sb.from("cronograma_areas").delete().eq("cronograma_id", id);
        if (e2) throw e2;
        if (area_ids.length > 0) {
          const links = area_ids.map((area_id: number) => ({ cronograma_id: id, area_id }));
          const { error: e3 } = await sb.from("cronograma_areas").insert(links);
          if (e3) throw e3;
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao atualizar cronograma:", error);
      res.status(500).json({ error: "Erro ao atualizar cronograma" });
    }
  });

  app.delete("/api/cronogramas/:id", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sb = getSupabase();
      const { error } = await sb.from("cronogramas_semanais").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao excluir cronograma" });
    }
  });

  // ===================== SETORES =====================

  app.get("/api/setores", requireAuth, async (req, res) => {
    try {
      const pool = createDbPool();
      const { rows } = await pool.query(
        "SELECT * FROM setores ORDER BY parent_id NULLS FIRST, nome"
      );
      await pool.end();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar setores" });
    }
  });

  app.post("/api/setores", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const { nome, parentId, ativo = true } = req.body;
      if (!nome?.trim()) return res.status(400).json({ error: "Nome é obrigatório" });
      const pool = createDbPool();
      const { rows } = await pool.query(
        "INSERT INTO setores (nome, parent_id, ativo) VALUES ($1, $2, $3) RETURNING *",
        [nome.trim(), parentId ?? null, ativo]
      );
      await pool.end();
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar setor" });
    }
  });

  app.put("/api/setores/:id", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, parentId, ativo } = req.body;
      const pool = createDbPool();
      const { rows } = await pool.query(
        `UPDATE setores SET nome=$1, parent_id=$2, ativo=$3, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [nome, parentId ?? null, ativo, id]
      );
      await pool.end();
      if (!rows.length) return res.status(404).json({ error: "Setor não encontrado" });
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Erro ao atualizar setor" });
    }
  });

  app.delete("/api/setores/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = createDbPool();
      // Verificar se tem filhos
      const { rows: filhos } = await pool.query(
        "SELECT id FROM setores WHERE parent_id=$1 LIMIT 1", [id]
      );
      if (filhos.length > 0) {
        await pool.end();
        return res.status(400).json({ error: "Não é possível excluir um setor com sub-setores" });
      }
      await pool.query("DELETE FROM setores WHERE id=$1", [id]);
      await pool.end();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir setor" });
    }
  });

  // Rota pública — sem autenticação
  app.get("/api/public/cronograma/:lote", async (req, res) => {
    try {
      const lote = parseInt(req.params.lote);
      const today = new Date().toISOString().split('T')[0];

      const sb = getSupabase();

      const { data: cronogramas, error: e1 } = await sb
        .from("cronogramas_semanais")
        .select("*")
        .eq("lote", lote)
        .lte("semana_inicio", today)
        .gte("semana_fim", today)
        .order("created_at", { ascending: false })
        .limit(1);
      if (e1) throw e1;

      if (!cronogramas || cronogramas.length === 0) {
        return res.json({ cronograma: null, areas: [] });
      }

      const cronograma = cronogramas[0];

      const { data: areaLinks, error: e2 } = await sb
        .from("cronograma_areas")
        .select("area_id")
        .eq("cronograma_id", cronograma.id);
      if (e2) throw e2;

      const areaIds = areaLinks.map((r: any) => r.area_id);
      let areas: any[] = [];
      if (areaIds.length > 0) {
        const { data: areaData, error: e3 } = await sb
          .from("service_areas")
          .select("id, tipo, endereco, bairro, metragem_m2, lat, lng")
          .in("id", areaIds)
          .order("id");
        if (e3) throw e3;
        areas = areaData;
      }

      res.json({ cronograma, areas });
    } catch (error: any) {
      console.error("Erro na rota pública de cronograma:", error);
      res.status(500).json({ error: "Erro ao buscar cronograma" });
    }
  });

}
