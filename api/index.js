var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schedulingAlgorithm.ts
var schedulingAlgorithm_exports = {};
__export(schedulingAlgorithm_exports, {
  calculateMowingSchedule: () => calculateMowingSchedule,
  calculateNextMowing: () => calculateNextMowing,
  calculateScheduleStats: () => calculateScheduleStats,
  recalculateAfterCompletion: () => recalculateAfterCompletion
});
function calculateNextMowing(area) {
  if (area.manualSchedule) {
    return null;
  }
  if (!area.ultimaRocagem) {
    return null;
  }
  const lastMowing = new Date(area.ultimaRocagem);
  lastMowing.setHours(0, 0, 0, 0);
  const nextMowingDate = new Date(lastMowing);
  nextMowingDate.setDate(lastMowing.getDate() + MOWING_CYCLE_DAYS);
  return {
    areaId: area.id,
    proximaPrevisao: formatDate(nextMowingDate),
    daysToComplete: 1
  };
}
function calculateMowingSchedule(areas, lote, productionRate, startDate = /* @__PURE__ */ new Date()) {
  const loteAreas = areas.filter(
    (a) => a.lote === lote && a.servico === "rocagem"
  );
  const results = [];
  for (const area of loteAreas) {
    const result = calculateNextMowing(area);
    if (result) {
      results.push(result);
    }
  }
  return results;
}
function recalculateAfterCompletion(allAreas, completedAreaIds, config) {
  const affectedLotes = /* @__PURE__ */ new Set();
  for (const areaId of completedAreaIds) {
    const area = allAreas.find((a) => a.id === areaId);
    if (area && area.lote) {
      affectedLotes.add(area.lote);
    }
  }
  const allResults = [];
  const tomorrow = /* @__PURE__ */ new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const lotesArray = Array.from(affectedLotes);
  for (const lote of lotesArray) {
    const productionRate = lote === 1 ? config.mowingProductionRate.lote1 : config.mowingProductionRate.lote2;
    const loteResults = calculateMowingSchedule(
      allAreas,
      lote,
      productionRate,
      tomorrow
    );
    allResults.push(...loteResults);
  }
  return allResults;
}
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function calculateScheduleStats(areas, lote, productionRate) {
  const loteAreas = areas.filter(
    (a) => a.lote === lote && a.servico === "rocagem" && !a.manualSchedule
  );
  const schedule = calculateMowingSchedule(loteAreas, lote, productionRate);
  if (schedule.length === 0) {
    return {
      totalAreas: 0,
      totalDaysEstimated: 0,
      completionDate: "",
      areasPerDay: 0
    };
  }
  const lastSchedule = schedule[schedule.length - 1];
  const totalDays = schedule.reduce((sum, s) => sum + s.daysToComplete, 0);
  return {
    totalAreas: loteAreas.length,
    totalDaysEstimated: totalDays,
    completionDate: lastSchedule.proximaPrevisao,
    areasPerDay: productionRate
  };
}
var MOWING_CYCLE_DAYS;
var init_schedulingAlgorithm = __esm({
  "shared/schedulingAlgorithm.ts"() {
    "use strict";
    MOWING_CYCLE_DAYS = 60;
  }
});

// server/app.ts
import express2 from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

// server/routes/auth-users.ts
import bcrypt from "bcryptjs";

// server/db-storage.ts
import { eq, or, and, sql, gt, lt, desc } from "drizzle-orm";

// shared/schema.ts
import { z } from "zod";
import { pgTable, serial, text, integer, jsonb, boolean, timestamp, doublePrecision } from "drizzle-orm/pg-core";
var serviceAreaSchema = z.object({
  id: z.number(),
  ordem: z.number().optional(),
  sequenciaCadastro: z.number().optional(),
  tipo: z.string(),
  endereco: z.string(),
  bairro: z.string().optional(),
  metragem_m2: z.number().optional(),
  lat: z.number(),
  lng: z.number(),
  lote: z.number().optional(),
  status: z.enum(["Pendente", "Em Execu\xE7\xE3o", "Conclu\xEDdo"]).default("Pendente"),
  history: z.array(z.object({
    date: z.string(),
    status: z.string(),
    type: z.enum(["completed", "forecast"]).optional(),
    observation: z.string().optional()
  })).default([]),
  polygon: z.array(z.object({
    lat: z.number(),
    lng: z.number()
  })).nullable().default(null),
  scheduledDate: z.string().nullable().default(null),
  proximaPrevisao: z.string().nullable().optional(),
  ultimaRocagem: z.string().nullable().optional(),
  manualSchedule: z.boolean().optional().default(false),
  daysToComplete: z.number().optional(),
  servico: z.string().optional(),
  registradoPor: z.string().nullable().optional(),
  dataRegistro: z.string().nullable().optional(),
  fotos: z.array(z.object({
    url: z.string(),
    data: z.string()
  })).default([]),
  executando: z.boolean().optional().default(false),
  executandoDesde: z.string().nullable().optional()
});
var insertServiceAreaSchema = serviceAreaSchema.omit({
  id: true,
  history: true,
  scheduledDate: true
});
var teamSchema = z.object({
  id: z.number(),
  service: z.string(),
  type: z.string(),
  lote: z.number().nullable(),
  status: z.enum(["Idle", "Assigned", "Working"]).default("Idle"),
  currentAreaId: z.number().nullable().default(null),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  })
});
var insertTeamSchema = teamSchema.omit({
  id: true
});
var appConfigSchema = z.object({
  mowingProductionRate: z.object({
    lote1: z.number(),
    lote2: z.number()
  }),
  metaMensal: z.number().optional(),
  metaLote1: z.number().optional(),
  metaLote2: z.number().optional()
});
var updateAppConfigSchema = appConfigSchema.partial();
var exportHistorySchema = z.object({
  id: z.number(),
  scope: z.enum(["service_areas", "teams", "app_config"]),
  exportType: z.enum(["full", "incremental"]),
  recordCount: z.number(),
  durationMs: z.number().nullable().optional(),
  exportedAt: z.string()
});
var insertExportHistorySchema = exportHistorySchema.omit({
  id: true,
  exportedAt: true
});
var serviceAreas = pgTable("service_areas", {
  id: serial("id").primaryKey(),
  ordem: integer("ordem"),
  sequenciaCadastro: integer("sequencia_cadastro"),
  tipo: text("tipo").notNull(),
  endereco: text("endereco").notNull(),
  bairro: text("bairro"),
  metragem_m2: doublePrecision("metragem_m2"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  lote: integer("lote"),
  status: text("status").notNull().default("Pendente"),
  history: jsonb("history").notNull().default([]),
  polygon: jsonb("polygon"),
  scheduledDate: text("scheduled_date"),
  proximaPrevisao: text("proxima_previsao"),
  ultimaRocagem: text("ultima_rocagem"),
  manualSchedule: boolean("manual_schedule").default(false),
  daysToComplete: integer("days_to_complete"),
  servico: text("servico"),
  registradoPor: text("registrado_por"),
  dataRegistro: timestamp("data_registro"),
  fotos: jsonb("fotos").notNull().default([]),
  executando: boolean("executando").default(false),
  executandoDesde: timestamp("executando_desde"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  service: text("service").notNull(),
  type: text("type").notNull(),
  lote: integer("lote"),
  status: text("status").notNull().default("Idle"),
  currentAreaId: integer("current_area_id"),
  location: jsonb("location").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var appConfig = pgTable("app_config", {
  id: serial("id").primaryKey(),
  mowingProductionRate: jsonb("mowing_production_rate").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  senha: text("senha").notNull(),
  role: text("role").notNull().default("fiscal"),
  contrato: text("contrato"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var userSchema = z.object({
  id: z.number(),
  nome: z.string(),
  email: z.string().email(),
  senha: z.string(),
  role: z.enum(["admin", "gestor", "fiscal", "encarregado", "demo"]),
  contrato: z.string().nullable().optional(),
  ativo: z.boolean().default(true)
});
var insertUserSchema = userSchema.omit({ id: true });
var ordemServicoSchema = z.object({
  id: z.number(),
  numero: z.string(),
  lote: z.number(),
  mes_referencia: z.string(),
  data_emissao: z.string(),
  emitido_por: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  created_at: z.string().optional(),
  areas: z.array(z.object({
    id: z.number(),
    tipo: z.string(),
    endereco: z.string(),
    bairro: z.string().nullable().optional(),
    metragem_m2: z.number().nullable().optional()
  })).optional()
});
var insertOrdemServicoSchema = z.object({
  numero: z.string().min(1),
  lote: z.number(),
  mes_referencia: z.string().min(1),
  data_emissao: z.string(),
  emitido_por: z.string().optional(),
  observacao: z.string().optional(),
  area_ids: z.array(z.number()).min(1)
});
var contratoConfigSchema = z.object({
  id: z.number().optional(),
  lote: z.number(),
  regiao: z.string().nullable().optional(),
  processo_admin: z.string().nullable().optional(),
  pregao_eletronico: z.string().nullable().optional(),
  numero_contrato: z.string().nullable().optional(),
  contratada_nome: z.string().nullable().optional(),
  contratada_endereco: z.string().nullable().optional(),
  diretor_nome: z.string().nullable().optional(),
  gerente_nome: z.string().nullable().optional(),
  fiscal_nome: z.string().nullable().optional()
});
var cronogramaSchema = z.object({
  id: z.number(),
  lote: z.number(),
  semana_inicio: z.string(),
  semana_fim: z.string(),
  criado_por: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  areas: z.array(z.object({
    id: z.number(),
    tipo: z.string(),
    endereco: z.string(),
    bairro: z.string().nullable().optional(),
    metragem_m2: z.number().nullable().optional(),
    lat: z.number().optional(),
    lng: z.number().optional()
  })).optional()
});
var insertCronogramaSchema = z.object({
  lote: z.number(),
  semana_inicio: z.string().min(1),
  semana_fim: z.string().min(1),
  observacao: z.string().optional(),
  area_ids: z.array(z.number()).min(1)
});
var STATUS_DEMANDA = ["aberta", "em_andamento", "concluida"];
var demandaSchema = z.object({
  id: z.number(),
  origem: z.string(),
  numeroProcesso: z.string().nullable().optional(),
  solicitanteNome: z.string(),
  solicitanteWhatsapp: z.string().nullable().optional(),
  solicitanteOrgao: z.string().nullable().optional(),
  dataSolicitacao: z.string(),
  tipo: z.string(),
  status: z.enum(STATUS_DEMANDA).default("aberta"),
  observacoes: z.string().nullable().optional(),
  setorId: z.number().nullable().optional(),
  setorNome: z.string().nullable().optional(),
  responsavelId: z.number().nullable().optional(),
  responsavelNome: z.string().nullable().optional(),
  areaId: z.number().nullable().optional(),
  areaEndereco: z.string().nullable().optional(),
  dadosEspecificos: z.record(z.any()).nullable().optional(),
  dataConclusao: z.string().nullable().optional(),
  createdBy: z.number().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
var insertDemandaSchema = z.object({
  origem: z.string().min(1),
  numeroProcesso: z.string().optional(),
  solicitanteNome: z.string().min(1),
  solicitanteWhatsapp: z.string().optional(),
  solicitanteOrgao: z.string().optional(),
  dataSolicitacao: z.string().min(1),
  tipo: z.string().min(1),
  status: z.enum(STATUS_DEMANDA).default("aberta"),
  observacoes: z.string().optional(),
  setorId: z.number().nullable().optional(),
  responsavelId: z.number().nullable().optional(),
  areaId: z.number().nullable().optional(),
  dadosEspecificos: z.record(z.any()).optional()
});
var notificacoes = pgTable("notificacoes", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull(),
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem"),
  tipo: text("tipo").notNull().default("demanda"),
  referenciaId: integer("referencia_id"),
  lida: boolean("lida").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow()
});
var notificacaoSchema = z.object({
  id: z.number(),
  usuarioId: z.number(),
  titulo: z.string(),
  mensagem: z.string().nullable().optional(),
  tipo: z.string().default("demanda"),
  referenciaId: z.number().nullable().optional(),
  lida: z.boolean().default(false),
  createdAt: z.string().optional()
});
var setores = pgTable("setores", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  parentId: integer("parent_id"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var setorSchema = z.object({
  id: z.number(),
  nome: z.string(),
  parentId: z.number().nullable().optional(),
  ativo: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
var insertSetorSchema = z.object({
  nome: z.string().min(1, "Nome \xE9 obrigat\xF3rio"),
  parentId: z.number().nullable().optional(),
  ativo: z.boolean().default(true)
});
var exportHistory = pgTable("export_history", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(),
  exportType: text("export_type").notNull(),
  recordCount: integer("record_count").notNull(),
  durationMs: integer("duration_ms"),
  exportedAt: timestamp("exported_at").defaultNow().notNull()
});

// db/client.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
var { Pool } = pg;
function requireDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL n\xE3o est\xE1 definida");
  }
  return connectionString;
}
var _pool = null;
function getPool() {
  if (!_pool) {
    const connectionString = requireDatabaseUrl();
    _pool = new Pool({
      connectionString,
      ssl: connectionString.includes("supabase.co") ? { rejectUnauthorized: false } : void 0,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3
    });
  }
  return _pool;
}
function createDbPool(connectionString = requireDatabaseUrl()) {
  return new Pool({
    connectionString,
    ssl: connectionString.includes("supabase.co") ? { rejectUnauthorized: false } : void 0
  });
}
function createDb(connectionString = requireDatabaseUrl()) {
  const pool = createDbPool(connectionString);
  const db = drizzle(pool);
  return { pool, db };
}

// server/db-storage.ts
var DbStorage = class {
  db;
  pool;
  constructor(connectionString) {
    const { pool, db } = createDb(connectionString);
    this.pool = pool;
    this.db = db;
    this.ensureExtensions();
  }
  async ensureExtensions() {
    try {
      await this.db.execute(sql`CREATE EXTENSION IF NOT EXISTS unaccent`);
    } catch (e) {
      console.warn("Could not create unaccent extension:", e);
    }
  }
  async getAllAreas(serviceType) {
    const results = await this.db.select().from(serviceAreas).where(eq(serviceAreas.servico, serviceType));
    return results.map(this.mapDbAreaToServiceArea);
  }
  async getAreaById(id) {
    const results = await this.db.select().from(serviceAreas).where(eq(serviceAreas.id, id)).limit(1);
    if (results.length === 0) return void 0;
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async createArea(data) {
    const insertData = {
      ordem: data.ordem ?? null,
      sequenciaCadastro: data.sequenciaCadastro ?? null,
      tipo: data.tipo,
      endereco: data.endereco,
      bairro: data.bairro ?? null,
      metragem_m2: data.metragem_m2 ?? null,
      lat: data.lat,
      lng: data.lng,
      lote: data.lote ?? null,
      status: data.status || "Pendente",
      history: data.history || [],
      polygon: data.polygon ?? null,
      scheduledDate: data.scheduledDate ?? null,
      proximaPrevisao: data.proximaPrevisao ?? null,
      ultimaRocagem: data.ultimaRocagem ?? null,
      manualSchedule: data.manualSchedule ?? false,
      daysToComplete: data.daysToComplete ?? null,
      servico: data.servico ?? "rocagem",
      registradoPor: data.registradoPor ?? null,
      dataRegistro: data.dataRegistro ? new Date(data.dataRegistro) : null
    };
    const results = await this.db.insert(serviceAreas).values(insertData).returning();
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async searchAreas(query, serviceType, limit = 50) {
    const searchTerm = `%${query.toLowerCase()}%`;
    const results = await this.db.select().from(serviceAreas).where(
      and(
        eq(serviceAreas.servico, serviceType),
        or(
          sql`unaccent(lower(${serviceAreas.endereco})) LIKE unaccent(${searchTerm})`,
          sql`unaccent(lower(${serviceAreas.bairro})) LIKE unaccent(${searchTerm})`,
          sql`CAST(${serviceAreas.lote} AS TEXT) LIKE ${searchTerm}`
        )
      )
    ).limit(limit);
    return results.map(this.mapDbAreaToServiceArea);
  }
  async updateAreaStatus(id, status) {
    const results = await this.db.update(serviceAreas).set({ status, updatedAt: /* @__PURE__ */ new Date() }).where(eq(serviceAreas.id, id)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async updateAreaSchedule(id, scheduledDate) {
    const results = await this.db.update(serviceAreas).set({ scheduledDate, updatedAt: /* @__PURE__ */ new Date() }).where(eq(serviceAreas.id, id)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async updateAreaPolygon(id, polygon) {
    const results = await this.db.update(serviceAreas).set({ polygon, updatedAt: /* @__PURE__ */ new Date() }).where(eq(serviceAreas.id, id)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async updateAreaPosition(id, lat, lng) {
    const results = await this.db.update(serviceAreas).set({ lat, lng, updatedAt: /* @__PURE__ */ new Date() }).where(eq(serviceAreas.id, id)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async updateArea(id, data) {
    const updateData = { updatedAt: /* @__PURE__ */ new Date() };
    if (data.endereco !== void 0) updateData.endereco = data.endereco;
    if (data.bairro !== void 0) updateData.bairro = data.bairro;
    if (data.metragem_m2 !== void 0) updateData.metragem_m2 = data.metragem_m2;
    if (data.lote !== void 0) updateData.lote = data.lote;
    if (data.tipo !== void 0) updateData.tipo = data.tipo;
    if (data.ultimaRocagem !== void 0) updateData.ultimaRocagem = data.ultimaRocagem;
    if (data.status !== void 0) updateData.status = data.status;
    if (data.proximaPrevisao !== void 0) updateData.proximaPrevisao = data.proximaPrevisao;
    if (data.polygon !== void 0) updateData.polygon = data.polygon;
    if (data.history !== void 0) updateData.history = data.history;
    if (data.registradoPor !== void 0) updateData.registradoPor = data.registradoPor;
    if (data.manualSchedule !== void 0) updateData.manualSchedule = data.manualSchedule;
    if (data.fotos !== void 0) updateData.fotos = data.fotos;
    if (data.dataRegistro !== void 0) {
      updateData.dataRegistro = typeof data.dataRegistro === "string" ? new Date(data.dataRegistro) : data.dataRegistro;
    }
    const results = await this.db.update(serviceAreas).set(updateData).where(eq(serviceAreas.id, id)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async deleteArea(id) {
    const results = await this.db.delete(serviceAreas).where(eq(serviceAreas.id, id)).returning();
    return results.length > 0;
  }
  async addHistoryEntry(areaId, entry) {
    const area = await this.getAreaById(areaId);
    if (!area) return void 0;
    const updatedHistory = [...area.history, entry];
    const results = await this.db.update(serviceAreas).set({ history: updatedHistory, updatedAt: /* @__PURE__ */ new Date() }).where(eq(serviceAreas.id, areaId)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async getAllTeams() {
    const results = await this.db.select().from(teams);
    return results.map(this.mapDbTeamToTeam);
  }
  async getTeamById(id) {
    const results = await this.db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (results.length === 0) return void 0;
    return this.mapDbTeamToTeam(results[0]);
  }
  async assignTeamToArea(teamId, areaId) {
    const results = await this.db.update(teams).set({
      currentAreaId: areaId,
      status: "Assigned",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(teams.id, teamId)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbTeamToTeam(results[0]);
  }
  async getConfig() {
    const results = await this.db.select().from(appConfig).limit(1);
    if (results.length === 0) {
      const defaultConfig = {
        mowingProductionRate: {
          lote1: 85e3,
          lote2: 7e4
        },
        metaMensal: 3125e3,
        metaLote1: 1562500,
        metaLote2: 1562500
      };
      const jsonbPayload = {
        lote1: 85e3,
        lote2: 7e4,
        metaMensal: 3125e3,
        metaLote1: 1562500,
        metaLote2: 1562500
      };
      await this.db.insert(appConfig).values({ mowingProductionRate: jsonbPayload }).returning();
      return defaultConfig;
    }
    const raw = results[0].mowingProductionRate;
    const metaLote1 = raw.metaLote1 ?? 1562500;
    const metaLote2 = raw.metaLote2 ?? 1562500;
    return {
      mowingProductionRate: { lote1: raw.lote1, lote2: raw.lote2 },
      metaMensal: raw.metaMensal ?? metaLote1 + metaLote2,
      metaLote1,
      metaLote2
    };
  }
  async updateConfig(config) {
    const current = await this.getConfig();
    const updatedRate = {
      ...current.mowingProductionRate,
      ...config.mowingProductionRate || {}
    };
    const updatedMetaLote1 = config.metaLote1 ?? current.metaLote1 ?? 1562500;
    const updatedMetaLote2 = config.metaLote2 ?? current.metaLote2 ?? 1562500;
    const updatedMeta = config.metaMensal ?? updatedMetaLote1 + updatedMetaLote2;
    const jsonbPayload = {
      ...updatedRate,
      metaMensal: updatedMeta,
      metaLote1: updatedMetaLote1,
      metaLote2: updatedMetaLote2
    };
    await this.db.update(appConfig).set({
      mowingProductionRate: jsonbPayload,
      updatedAt: /* @__PURE__ */ new Date()
    });
    return {
      mowingProductionRate: { lote1: updatedRate.lote1, lote2: updatedRate.lote2 },
      metaMensal: updatedMeta,
      metaLote1: updatedMetaLote1,
      metaLote2: updatedMetaLote2
    };
  }
  async registerDailyMowing(areaIds, date, type = "completed") {
    const { recalculateAfterCompletion: recalculateAfterCompletion2 } = await Promise.resolve().then(() => (init_schedulingAlgorithm(), schedulingAlgorithm_exports));
    for (const areaId of areaIds) {
      const area = await this.getAreaById(areaId);
      if (!area) continue;
      const newHistory = [
        ...area.history || [],
        {
          date,
          status: type === "completed" ? "Conclu\xEDdo" : "Previsto",
          type,
          observation: type === "completed" ? "Ro\xE7agem conclu\xEDda" : "Previs\xE3o de ro\xE7agem"
        }
      ];
      if (type === "completed") {
        await this.db.update(serviceAreas).set({
          ultimaRocagem: date,
          status: "Conclu\xEDdo",
          history: newHistory,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(serviceAreas.id, areaId));
      } else {
        await this.db.update(serviceAreas).set({
          history: newHistory,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(serviceAreas.id, areaId));
      }
    }
    if (type === "completed") {
      const allAreas = await this.getAllAreas("rocagem");
      const config = await this.getConfig();
      const predictions = recalculateAfterCompletion2(allAreas, areaIds, config);
      for (const prediction of predictions) {
        await this.db.update(serviceAreas).set({
          proximaPrevisao: prediction.proximaPrevisao,
          daysToComplete: prediction.daysToComplete,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(serviceAreas.id, prediction.areaId));
      }
    }
  }
  async clearSimulationData(serviceType) {
    const areas = await this.getAllAreas(serviceType);
    for (const area of areas) {
      await this.db.update(serviceAreas).set({
        history: [],
        status: "Pendente",
        ultimaRocagem: null,
        proximaPrevisao: null,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(serviceAreas.id, area.id));
    }
    return areas.length;
  }
  // Export History Methods
  async getLastExport(scope, type) {
    const results = await this.db.select().from(exportHistory).where(
      and(
        eq(exportHistory.scope, scope),
        eq(exportHistory.exportType, type)
      )
    ).orderBy(desc(exportHistory.exportedAt)).limit(1);
    if (results.length === 0) return null;
    const record = results[0];
    return {
      id: record.id,
      scope: record.scope,
      exportType: record.exportType,
      recordCount: record.recordCount,
      durationMs: record.durationMs ?? null,
      exportedAt: record.exportedAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async recordExport(data) {
    const results = await this.db.insert(exportHistory).values({
      scope: data.scope,
      exportType: data.exportType,
      recordCount: data.recordCount,
      durationMs: data.durationMs ?? null
    }).returning();
    const record = results[0];
    return {
      id: record.id,
      scope: record.scope,
      exportType: record.exportType,
      recordCount: record.recordCount,
      durationMs: record.durationMs ?? null,
      exportedAt: record.exportedAt?.toISOString() ?? (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async getAreasModifiedSince(timestamp2) {
    const results = await this.db.select().from(serviceAreas).where(
      and(
        eq(serviceAreas.servico, "rocagem"),
        gt(serviceAreas.updatedAt, timestamp2)
      )
    );
    return results.map(this.mapDbAreaToServiceArea);
  }
  async toggleExecutando(id, executando) {
    const results = await this.db.update(serviceAreas).set({
      executando,
      executandoDesde: executando ? /* @__PURE__ */ new Date() : null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(serviceAreas.id, id)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbAreaToServiceArea(results[0]);
  }
  async resetAllExecutando() {
    const result = await this.db.update(serviceAreas).set({
      executando: false,
      executandoDesde: null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(serviceAreas.executando, true)).returning();
    return result.length;
  }
  async resetStaleExecutando(todayDateStr) {
    const todayStart = /* @__PURE__ */ new Date(todayDateStr + "T00:00:00-03:00");
    const result = await this.db.update(serviceAreas).set({
      executando: false,
      executandoDesde: null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(
      and(
        eq(serviceAreas.executando, true),
        or(
          lt(serviceAreas.executandoDesde, todayStart),
          sql`${serviceAreas.executandoDesde} IS NULL`
        )
      )
    ).returning();
    return result.length;
  }
  mapDbAreaToServiceArea(dbArea) {
    return {
      id: dbArea.id,
      ordem: dbArea.ordem,
      sequenciaCadastro: dbArea.sequencia_cadastro,
      tipo: dbArea.tipo,
      endereco: dbArea.endereco,
      bairro: dbArea.bairro,
      metragem_m2: dbArea.metragem_m2,
      lat: dbArea.lat,
      lng: dbArea.lng,
      lote: dbArea.lote,
      status: dbArea.status,
      history: dbArea.history || [],
      polygon: dbArea.polygon,
      scheduledDate: dbArea.scheduledDate,
      proximaPrevisao: dbArea.proximaPrevisao,
      ultimaRocagem: dbArea.ultimaRocagem,
      manualSchedule: dbArea.manualSchedule ?? false,
      daysToComplete: dbArea.daysToComplete,
      servico: dbArea.servico,
      registradoPor: dbArea.registradoPor || null,
      dataRegistro: dbArea.dataRegistro ? dbArea.dataRegistro.toISOString() : null,
      fotos: dbArea.fotos || [],
      executando: dbArea.executando ?? false,
      executandoDesde: dbArea.executandoDesde ? dbArea.executandoDesde.toISOString() : null
    };
  }
  mapDbTeamToTeam(dbTeam) {
    return {
      id: dbTeam.id,
      service: dbTeam.service,
      type: dbTeam.type,
      lote: dbTeam.lote,
      status: dbTeam.status,
      currentAreaId: dbTeam.currentAreaId,
      location: dbTeam.location
    };
  }
  async getUserByEmail(email) {
    const results = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (results.length === 0) return void 0;
    return this.mapDbUser(results[0]);
  }
  async getUserById(id) {
    const results = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (results.length === 0) return void 0;
    return this.mapDbUser(results[0]);
  }
  async getAllUsers() {
    const results = await this.db.select().from(users);
    return results.map(this.mapDbUser);
  }
  async createUser(data) {
    const results = await this.db.insert(users).values({
      nome: data.nome,
      email: data.email,
      senha: data.senha,
      role: data.role,
      ativo: data.ativo ?? true
    }).returning();
    return this.mapDbUser(results[0]);
  }
  async updateUser(id, data) {
    const updateData = {};
    if (data.nome !== void 0) updateData.nome = data.nome;
    if (data.email !== void 0) updateData.email = data.email;
    if (data.senha !== void 0) updateData.senha = data.senha;
    if (data.role !== void 0) updateData.role = data.role;
    if (data.ativo !== void 0) updateData.ativo = data.ativo;
    updateData.updatedAt = /* @__PURE__ */ new Date();
    const results = await this.db.update(users).set(updateData).where(eq(users.id, id)).returning();
    if (results.length === 0) return void 0;
    return this.mapDbUser(results[0]);
  }
  async deleteUser(id) {
    const results = await this.db.delete(users).where(eq(users.id, id)).returning();
    return results.length > 0;
  }
  mapDbUser(dbUser) {
    return {
      id: dbUser.id,
      nome: dbUser.nome,
      email: dbUser.email,
      senha: dbUser.senha,
      role: dbUser.role,
      contrato: dbUser.contrato ?? null,
      ativo: dbUser.ativo
    };
  }
  async close() {
    await this.pool.end();
  }
};

// server/storage.ts
function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
var MemStorage = class {
  rocagemAreas;
  jardinsAreas;
  teams;
  config;
  constructor() {
    this.config = {
      mowingProductionRate: {
        lote1: 25e3,
        lote2: 2e4
      }
    };
    this.rocagemAreas = this.initializeRocagemAreas();
    this.jardinsAreas = this.initializeJardinsAreas();
    this.teams = this.initializeTeams();
  }
  initializeRocagemAreas() {
    const sampleAreas = [
      { id: 1, ordem: 1, tipo: "area publica", endereco: "Av Jorge Casoni - Terminal Rodovi\xE1rio", bairro: "Casoni", metragem_m2: 29184.98, lat: -23.3044206, lng: -51.1513729, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 2, ordem: 2, tipo: "pra\xE7a", endereco: "Rua Carij\xF3s c/ Oraruana", bairro: "Paran\xE1", metragem_m2: 2332.83, lat: -23.3045262, lng: -51.1480067, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 3, ordem: 3, tipo: "area publica", endereco: "Av Saul Elkind", bairro: "Lago Parque", metragem_m2: 15234.56, lat: -23.2987, lng: -51.1623, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 4, ordem: 4, tipo: "canteiro", endereco: "Av Madre Le\xF4nia Milito", bairro: "Centro", metragem_m2: 8765.43, lat: -23.3101, lng: -51.1628, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 5, ordem: 5, tipo: "area publica", endereco: "Pra\xE7a Sete de Setembro", bairro: "Centro", metragem_m2: 12456.78, lat: -23.3099, lng: -51.1603, lote: 1, status: "Em Execu\xE7\xE3o", history: [{ date: (/* @__PURE__ */ new Date()).toISOString(), status: "Iniciado", observation: "Equipe 1 iniciou trabalho" }], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 6, ordem: 6, tipo: "pra\xE7a", endereco: "Pra\xE7a Rocha Pombo", bairro: "Vila Nova", metragem_m2: 9876.54, lat: -23.3142, lng: -51.1578, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 7, ordem: 7, tipo: "area publica", endereco: "Av Bandeirantes", bairro: "Bandeirantes", metragem_m2: 18765.43, lat: -23.2876, lng: -51.1456, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 8, ordem: 8, tipo: "canteiro", endereco: "Av Ayrton Senna", bairro: "Gleba Palhano", metragem_m2: 21234.56, lat: -23.2834, lng: -51.1823, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 9, ordem: 9, tipo: "area publica", endereco: "Parque Arthur Thomas", bairro: "Nova Londrina", metragem_m2: 45678.9, lat: -23.3167, lng: -51.1789, lote: 1, status: "Conclu\xEDdo", history: [{ date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1e3).toISOString(), status: "Conclu\xEDdo" }], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 10, ordem: 10, tipo: "pra\xE7a", endereco: "Pra\xE7a Willie Davids", bairro: "Heimtal", metragem_m2: 7654.32, lat: -23.3234, lng: -51.1423, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 101, ordem: 1, tipo: "area publica", endereco: "Av Duque de Caxias", bairro: "Zona Sul", metragem_m2: 32145.67, lat: -23.3367, lng: -51.1534, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 102, ordem: 2, tipo: "canteiro", endereco: "Av Inglaterra", bairro: "Cinco Conjuntos", metragem_m2: 11234.56, lat: -23.3278, lng: -51.1745, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 103, ordem: 3, tipo: "pra\xE7a", endereco: "Pra\xE7a Maring\xE1", bairro: "Cervejaria", metragem_m2: 8765.43, lat: -23.3189, lng: -51.1667, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 104, ordem: 4, tipo: "area publica", endereco: "Av JK", bairro: "Tucanos", metragem_m2: 19876.54, lat: -23.3445, lng: -51.1623, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 105, ordem: 5, tipo: "canteiro", endereco: "Av Higien\xF3polis", bairro: "Higien\xF3polis", metragem_m2: 14567.89, lat: -23.3123, lng: -51.1489, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 106, ordem: 6, tipo: "area publica", endereco: "Parque Guanabara", bairro: "Guanabara", metragem_m2: 28765.43, lat: -23.2989, lng: -51.1823, lote: 2, status: "Em Execu\xE7\xE3o", history: [{ date: (/* @__PURE__ */ new Date()).toISOString(), status: "Iniciado" }], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 107, ordem: 7, tipo: "pra\xE7a", endereco: "Pra\xE7a Santos Dumont", bairro: "Aeroporto", metragem_m2: 9876.54, lat: -23.3034, lng: -51.1378, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 108, ordem: 8, tipo: "area publica", endereco: "Av Tiradentes", bairro: "Centro", metragem_m2: 16543.21, lat: -23.3087, lng: -51.1645, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 109, ordem: 9, tipo: "canteiro", endereco: "Av Dez de Dezembro", bairro: "Centro", metragem_m2: 12345.67, lat: -23.3112, lng: -51.159, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 110, ordem: 10, tipo: "pra\xE7a", endereco: "Pra\xE7a Primeiro de Maio", bairro: "Ouro Branco", metragem_m2: 8901.23, lat: -23.3267, lng: -51.1501, lote: 2, status: "Conclu\xEDdo", history: [{ date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1e3).toISOString(), status: "Conclu\xEDdo" }], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false }
    ];
    const tipos = ["area publica", "pra\xE7a", "canteiro", "rotat\xF3ria"];
    const bairros = ["Centro", "Zona Sul", "Gleba Palhano", "Higien\xF3polis", "Casoni", "Bandeirantes", "Vila Nova", "Tucanos", "Heimtal", "Aeroporto"];
    const ruas = ["Av", "Rua", "Pra\xE7a", "Travessa"];
    const nomes = ["das Flores", "Santos Dumont", "Brasil", "Pioneiros", "Industrial", "Comercial", "Residencial", "Jardim", "Parque", "Vila"];
    let idCounter = 200;
    for (let i = 0; i < 100; i++) {
      const lote = Math.random() > 0.5 ? 1 : 2;
      const area = {
        id: idCounter++,
        ordem: i + 11,
        tipo: tipos[Math.floor(Math.random() * tipos.length)],
        endereco: `${ruas[Math.floor(Math.random() * ruas.length)]} ${nomes[Math.floor(Math.random() * nomes.length)]} ${i + 1}`,
        bairro: bairros[Math.floor(Math.random() * bairros.length)],
        metragem_m2: Math.floor(Math.random() * 4e4) + 5e3,
        lat: -23.31 + (Math.random() - 0.5) * 0.1,
        lng: -51.16 + (Math.random() - 0.5) * 0.1,
        lote,
        status: "Pendente",
        history: [],
        polygon: null,
        scheduledDate: null,
        manualSchedule: false,
        fotos: [],
        executando: false
      };
      sampleAreas.push(area);
    }
    return sampleAreas;
  }
  initializeJardinsAreas() {
    return [
      { id: 1001, fotos: [], executando: false, tipo: "ROT", endereco: "Av. Henrique Mansano x Av. Lucia Helena Gon\xE7alves Vianna (Sanepar)", servico: "Manuten\xE7\xE3o", lat: -23.282252, lng: -51.15512, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1002, fotos: [], executando: false, tipo: "ROT", endereco: "Av. Maring\xE1 x Rua Prof. Joaquim de Matos Barreto (Aterro Maior)", servico: "Irriga\xE7\xE3o", lat: -23.324934, lng: -51.176449, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1003, fotos: [], executando: false, tipo: "ROT", endereco: "Pra\xE7a Rocha Pombo", servico: "Manuten\xE7\xE3o", lat: -23.3142, lng: -51.1578, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1004, fotos: [], executando: false, tipo: "ROT", endereco: "Parque Arthur Thomas", servico: "Irriga\xE7\xE3o", lat: -23.3167, lng: -51.1789, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1005, fotos: [], executando: false, tipo: "ROT", endereco: "Jardim Bot\xE2nico", servico: "Manuten\xE7\xE3o", lat: -23.3289, lng: -51.1567, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false }
    ];
  }
  initializeTeams() {
    return [
      { id: 1, service: "rocagem", type: "Giro Zero", lote: 1, status: "Working", currentAreaId: 5, location: { lat: -23.3099, lng: -51.1603 } },
      { id: 2, service: "rocagem", type: "Acabamento", lote: 1, status: "Idle", currentAreaId: null, location: { lat: -23.3, lng: -51.15 } },
      { id: 3, service: "rocagem", type: "Coleta", lote: 1, status: "Idle", currentAreaId: null, location: { lat: -23.3, lng: -51.15 } },
      { id: 4, service: "rocagem", type: "Capina", lote: 1, status: "Idle", currentAreaId: null, location: { lat: -23.3, lng: -51.15 } },
      { id: 5, service: "rocagem", type: "Giro Zero", lote: 2, status: "Working", currentAreaId: 106, location: { lat: -23.2989, lng: -51.1823 } },
      { id: 6, service: "rocagem", type: "Acabamento", lote: 2, status: "Idle", currentAreaId: null, location: { lat: -23.31, lng: -51.16 } },
      { id: 7, service: "jardins", type: "Manuten\xE7\xE3o", lote: null, status: "Idle", currentAreaId: null, location: { lat: -23.32, lng: -51.17 } },
      { id: 8, service: "jardins", type: "Irriga\xE7\xE3o", lote: null, status: "Idle", currentAreaId: null, location: { lat: -23.32, lng: -51.17 } }
    ];
  }
  async getAllAreas(serviceType) {
    if (serviceType === "rocagem") {
      return this.rocagemAreas;
    } else if (serviceType === "jardins") {
      return this.jardinsAreas;
    }
    return [];
  }
  async getAreaById(id) {
    return [...this.rocagemAreas, ...this.jardinsAreas].find((a) => a.id === id);
  }
  async createArea(data) {
    const allAreas = [...this.rocagemAreas, ...this.jardinsAreas];
    const maxId = allAreas.length > 0 ? Math.max(...allAreas.map((a) => a.id)) : 0;
    const newArea = {
      ...data,
      id: maxId + 1,
      history: data.history || [],
      status: data.status || "Pendente"
    };
    if (data.servico === "rocagem" || !data.servico) {
      this.rocagemAreas.push(newArea);
    } else if (data.servico === "jardins") {
      this.jardinsAreas.push(newArea);
    }
    return newArea;
  }
  async searchAreas(query, serviceType, limit = 50) {
    const areas = serviceType === "rocagem" ? this.rocagemAreas : this.jardinsAreas;
    const searchNorm = removeAccents(query.toLowerCase());
    const filtered = areas.filter((area) => {
      const endereco = removeAccents((area.endereco || "").toLowerCase());
      const bairro = removeAccents((area.bairro || "").toLowerCase());
      const lote = area.lote?.toString() || "";
      return endereco.includes(searchNorm) || bairro.includes(searchNorm) || lote.includes(searchNorm);
    });
    return filtered.slice(0, limit);
  }
  async updateAreaStatus(id, status) {
    const area = await this.getAreaById(id);
    if (!area) return void 0;
    area.status = status;
    area.history.push({
      date: (/* @__PURE__ */ new Date()).toISOString(),
      status
    });
    return area;
  }
  async updateAreaSchedule(id, scheduledDate) {
    const area = await this.getAreaById(id);
    if (!area) return void 0;
    area.scheduledDate = scheduledDate;
    return area;
  }
  async updateAreaPolygon(id, polygon) {
    const area = await this.getAreaById(id);
    if (!area) return void 0;
    area.polygon = polygon;
    return area;
  }
  async updateAreaPosition(id, lat, lng) {
    const area = await this.getAreaById(id);
    if (!area) return void 0;
    area.lat = lat;
    area.lng = lng;
    return area;
  }
  async updateArea(id, data) {
    const area = await this.getAreaById(id);
    if (!area) return void 0;
    Object.assign(area, data);
    return area;
  }
  async deleteArea(id) {
    const rocIndex = this.rocagemAreas.findIndex((a) => a.id === id);
    if (rocIndex !== -1) {
      this.rocagemAreas.splice(rocIndex, 1);
      return true;
    }
    const jarIndex = this.jardinsAreas.findIndex((a) => a.id === id);
    if (jarIndex !== -1) {
      this.jardinsAreas.splice(jarIndex, 1);
      return true;
    }
    return false;
  }
  async addHistoryEntry(areaId, entry) {
    const area = await this.getAreaById(areaId);
    if (!area) return void 0;
    area.history.push(entry);
    return area;
  }
  async getAllTeams() {
    return this.teams;
  }
  async getTeamById(id) {
    return this.teams.find((t) => t.id === id);
  }
  async assignTeamToArea(teamId, areaId) {
    const team = await this.getTeamById(teamId);
    if (!team) return void 0;
    team.currentAreaId = areaId;
    team.status = "Assigned";
    return team;
  }
  async getConfig() {
    return this.config;
  }
  async updateConfig(newConfig) {
    if (newConfig.mowingProductionRate) {
      this.config.mowingProductionRate = {
        ...this.config.mowingProductionRate,
        ...newConfig.mowingProductionRate
      };
    }
    return this.config;
  }
  async registerDailyMowing(areaIds, date, type = "completed") {
    const { recalculateAfterCompletion: recalculateAfterCompletion2 } = await Promise.resolve().then(() => (init_schedulingAlgorithm(), schedulingAlgorithm_exports));
    for (const areaId of areaIds) {
      const area = await this.getAreaById(areaId);
      if (!area) continue;
      if (type === "completed") {
        area.ultimaRocagem = date;
        area.status = "Conclu\xEDdo";
        area.history.push({
          date,
          status: "Conclu\xEDdo",
          type: "completed",
          observation: "Ro\xE7agem conclu\xEDda"
        });
      } else {
        area.history.push({
          date,
          status: "Previsto",
          type: "forecast",
          observation: "Previs\xE3o de ro\xE7agem"
        });
      }
    }
    if (type === "completed") {
      const allAreas = this.rocagemAreas;
      const predictions = recalculateAfterCompletion2(allAreas, areaIds, this.config);
      for (const prediction of predictions) {
        const area = await this.getAreaById(prediction.areaId);
        if (area) {
          area.proximaPrevisao = prediction.proximaPrevisao;
          area.daysToComplete = prediction.daysToComplete;
        }
      }
    }
  }
  async clearSimulationData(serviceType) {
    const areas = await this.getAllAreas(serviceType);
    for (const area of areas) {
      area.history = [];
      area.status = "Pendente";
      area.ultimaRocagem = null;
      area.proximaPrevisao = null;
    }
    return areas.length;
  }
  // Export History Methods
  async getLastExport(scope, type) {
    return null;
  }
  async recordExport(data) {
    return {
      id: Math.floor(Math.random() * 1e4),
      scope: data.scope,
      exportType: data.exportType,
      recordCount: data.recordCount,
      durationMs: data.durationMs ?? null,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async toggleExecutando(id, executando) {
    const area = await this.getAreaById(id);
    if (!area) return void 0;
    area.executando = executando;
    area.executandoDesde = executando ? (/* @__PURE__ */ new Date()).toISOString() : null;
    return area;
  }
  async resetAllExecutando() {
    let count = 0;
    for (const area of this.rocagemAreas) {
      if (area.executando) {
        area.executando = false;
        area.executandoDesde = null;
        count++;
      }
    }
    for (const area of this.jardinsAreas) {
      if (area.executando) {
        area.executando = false;
        area.executandoDesde = null;
        count++;
      }
    }
    return count;
  }
  async resetStaleExecutando(todayDateStr) {
    let count = 0;
    const allAreas = [...this.rocagemAreas, ...this.jardinsAreas];
    for (const area of allAreas) {
      if (area.executando) {
        if (!area.executandoDesde || area.executandoDesde.substring(0, 10) < todayDateStr) {
          area.executando = false;
          area.executandoDesde = null;
          count++;
        }
      }
    }
    return count;
  }
  async getAreasModifiedSince(timestamp2) {
    return this.rocagemAreas;
  }
  memUsers = [];
  nextUserId = 1;
  async getUserByEmail(email) {
    return this.memUsers.find((u) => u.email === email);
  }
  async getUserById(id) {
    return this.memUsers.find((u) => u.id === id);
  }
  async getAllUsers() {
    return this.memUsers;
  }
  async createUser(data) {
    const user = { ...data, id: this.nextUserId++ };
    this.memUsers.push(user);
    return user;
  }
  async updateUser(id, data) {
    const user = this.memUsers.find((u) => u.id === id);
    if (!user) return void 0;
    Object.assign(user, data);
    return user;
  }
  async deleteUser(id) {
    const idx = this.memUsers.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    this.memUsers.splice(idx, 1);
    return true;
  }
};
function initializeStorage() {
  const databaseUrl = process.env.DATABASE_URL;
  const isProduction2 = process.env.NODE_ENV === "production";
  if (databaseUrl && databaseUrl.trim() !== "") {
    console.log("\u{1F5C4}\uFE0F  Usando DbStorage (PostgreSQL)");
    return new DbStorage(databaseUrl);
  }
  if (isProduction2) {
    throw new Error("DATABASE_URL is required in production");
  }
  console.log("\u{1F4BE} Usando MemStorage (in-memory)");
  return new MemStorage();
}
var storage = initializeStorage();

// server/route-helpers.ts
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
function getSupabase() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "N\xE3o autenticado" });
  }
  next();
}
function loteRestritoDoEncarregado(req) {
  if (req.session?.userRole !== "encarregado") return null;
  const contrato = req.session.userContrato || "";
  if (contrato === "rocagem_lote1") return 1;
  if (contrato === "rocagem_lote2") return 2;
  return null;
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "N\xE3o autenticado" });
    }
    if (!roles.includes(req.session.userRole || "")) {
      return res.status(403).json({ error: "Sem permiss\xE3o" });
    }
    next();
  };
}

// server/routes/auth-users.ts
async function ensureUsersSetorColumn() {
  try {
    const pool = getPool();
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id)
    `);
  } catch (e) {
    console.warn("users.setor_id column check:", e);
  }
}
async function ensureUsersContratoColumn() {
  try {
    const pool = getPool();
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS contrato VARCHAR(50)
    `);
  } catch (e) {
    console.warn("users.contrato column check:", e);
  }
}
async function ensureSetoresTable() {
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
    const { rows } = await pool.query("SELECT COUNT(*) FROM setores");
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO setores (nome, parent_id) VALUES
          ('Capina e Ro\xE7agem 1', NULL),
          ('Capina e Ro\xE7agem 2', NULL),
          ('Varri\xE7\xE3o', NULL),
          ('Lava\xE7\xE3o', NULL),
          ('Jardins', NULL),
          ('Lagos', NULL),
          ('Limpeza de Boca de Lobo', NULL),
          ('Coleta de Rejeitos e Org\xE2nicos', NULL),
          ('Coleta de Recicl\xE1veis', NULL),
          ('Cidade Limpa', NULL),
          ('Fiscaliza\xE7\xE3o de Posturas', NULL),
          ('Utiliza\xE7\xE3o Vias P\xFAblicas', NULL),
          ('Feiras', NULL),
          ('Ambulantes', NULL)
      `);
      const { rows: cr } = await pool.query("SELECT id FROM setores WHERE nome = 'Coleta de Recicl\xE1veis'");
      if (cr.length > 0) {
        await pool.query(`
          INSERT INTO setores (nome, parent_id) VALUES
            ('Cooper Regi\xE3o', $1),
            ('Cooperoeste', $1),
            ('Coocepeve', $1),
            ('Ecorecin', $1),
            ('Coopernorth', $1),
            ('Refum', $1),
            ('Coopermudan\xE7a', $1)
        `, [cr[0].id]);
      }
    }
  } catch (e) {
    console.warn("setores table check:", e);
  }
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
      ativo: true
    });
    console.log("\u{1F464} Usu\xE1rio admin padr\xE3o criado (admin@cmtu.londrina.pr.gov.br / admin123)");
  }
}
function registerAuthRoutes(app) {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, senha } = req.body;
      if (!email || !senha) {
        return res.status(400).json({ error: "Email e senha s\xE3o obrigat\xF3rios" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user || !user.ativo) {
        return res.status(401).json({ error: "Email ou senha inv\xE1lidos" });
      }
      const valid = await bcrypt.compare(senha, user.senha);
      if (!valid) {
        return res.status(401).json({ error: "Email ou senha inv\xE1lidos" });
      }
      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.userName = user.nome;
      req.session.userContrato = user.contrato ?? void 0;
      res.json({
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        contrato: user.contrato ?? null
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
      return res.status(401).json({ error: "N\xE3o autenticado" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "Usu\xE1rio n\xE3o encontrado" });
    }
    res.json({
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      contrato: user.contrato ?? null
    });
  });
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { senhaAtual, novaSenha } = req.body;
      if (!senhaAtual || !novaSenha) {
        return res.status(400).json({ error: "Senha atual e nova senha s\xE3o obrigat\xF3rias" });
      }
      if (novaSenha.length < 4) {
        return res.status(400).json({ error: "A nova senha deve ter pelo menos 4 caracteres" });
      }
      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado" });
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
function registerUserRoutes(app) {
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
      res.json(rows.map((u) => ({
        id: u.id,
        nome: u.nome,
        setorId: u.setor_id,
        setorNome: u.setor_nome
      })));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar usu\xE1rios" });
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
      res.json(rows.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        role: u.role,
        contrato: u.contrato,
        ativo: u.ativo,
        setorId: u.setor_id,
        setorNome: u.setor_nome
      })));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar usu\xE1rios" });
    }
  });
  app.post("/api/users", requireRole("admin"), async (req, res) => {
    try {
      const { nome, email, senha, role, setorId, contrato } = req.body;
      if (!nome || !email || !senha || !role) {
        return res.status(400).json({ error: "Todos os campos s\xE3o obrigat\xF3rios" });
      }
      if (role === "encarregado" && !contrato) {
        return res.status(400).json({ error: "Informe o contrato do encarregado" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "Email j\xE1 cadastrado" });
      }
      const hashedPassword = await bcrypt.hash(senha, 10);
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO users (nome, email, senha, role, ativo, setor_id, contrato)
         VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id, nome, email, role, contrato, ativo, setor_id`,
        [nome, email, hashedPassword, role, setorId ?? null, role === "encarregado" ? contrato : null]
      );
      const u = rows[0];
      res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, contrato: u.contrato, ativo: u.ativo, setorId: u.setor_id });
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar usu\xE1rio" });
    }
  });
  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, email, senha, role, ativo, setorId, contrato } = req.body;
      const sets = [];
      const vals = [];
      let i = 1;
      if (nome !== void 0) {
        sets.push(`nome=$${i++}`);
        vals.push(nome);
      }
      if (email !== void 0) {
        sets.push(`email=$${i++}`);
        vals.push(email);
      }
      if (role !== void 0) {
        sets.push(`role=$${i++}`);
        vals.push(role);
      }
      if (ativo !== void 0) {
        sets.push(`ativo=$${i++}`);
        vals.push(ativo);
      }
      if (setorId !== void 0) {
        sets.push(`setor_id=$${i++}`);
        vals.push(setorId ?? null);
      }
      if (contrato !== void 0) {
        sets.push(`contrato=$${i++}`);
        vals.push(contrato ?? null);
      }
      if (senha) {
        sets.push(`senha=$${i++}`);
        vals.push(await bcrypt.hash(senha, 10));
      }
      if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });
      vals.push(id);
      const pool = getPool();
      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${i} RETURNING id, nome, email, role, contrato, ativo, setor_id`,
        vals
      );
      if (!rows.length) return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado" });
      const u = rows[0];
      res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, contrato: u.contrato, ativo: u.ativo, setorId: u.setor_id });
    } catch (error) {
      res.status(500).json({ error: "Erro ao atualizar usu\xE1rio" });
    }
  });
  app.delete("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteUser(id);
      if (!deleted) {
        return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar usu\xE1rio" });
    }
  });
}
function registerSetoresRoutes(app) {
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
      if (!nome?.trim()) return res.status(400).json({ error: "Nome \xE9 obrigat\xF3rio" });
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
      if (!rows.length) return res.status(404).json({ error: "Setor n\xE3o encontrado" });
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Erro ao atualizar setor" });
    }
  });
  app.delete("/api/setores/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rows: filhos } = await pool.query(
        "SELECT id FROM setores WHERE parent_id=$1 LIMIT 1",
        [id]
      );
      if (filhos.length > 0) {
        return res.status(400).json({ error: "N\xE3o \xE9 poss\xEDvel excluir um setor com sub-setores" });
      }
      await pool.query("DELETE FROM setores WHERE id=$1", [id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir setor" });
    }
  });
}

// server/routes/audit.ts
async function ensureAuditLogTable() {
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
async function logAudit(usuarioId, usuarioNome, acao, tipo, referenciaId, descricao, dadosAnteriores, dadosNovos) {
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
        dadosNovos ? JSON.stringify(dadosNovos) : null
      ]
    );
  } catch (e) {
    console.warn("audit_log insert error:", e);
  }
}
function registerAuditRoutes(app) {
  app.get("/api/audit-log", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const { tipo, usuario_id, from, to, limit: lim } = req.query;
      const pool = getPool();
      const conditions = [];
      const params = [];
      let idx = 1;
      if (tipo) {
        conditions.push(`tipo = $${idx++}`);
        params.push(tipo);
      }
      if (usuario_id) {
        conditions.push(`usuario_id = $${idx++}`);
        params.push(parseInt(usuario_id));
      }
      if (from) {
        conditions.push(`created_at >= $${idx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`created_at <= $${idx++}`);
        params.push(to + "T23:59:59");
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitVal = Math.min(parseInt(lim || "200"), 500);
      const { rows } = await pool.query(
        `SELECT id, usuario_id, usuario_nome, acao, tipo, referencia_id, descricao, dados_anteriores, dados_novos, created_at
         FROM audit_log ${where}
         ORDER BY created_at DESC
         LIMIT ${limitVal}`,
        params
      );
      res.json(rows);
    } catch (error) {
      console.error("Erro ao buscar audit log:", error);
      res.status(500).json({ error: "Erro ao buscar hist\xF3rico" });
    }
  });
}

// server/routes/demandas.ts
async function ensureDemandasTable() {
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
async function ensureNotificacoesTable() {
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
async function createNotificacao(usuarioId, titulo, mensagem, referenciaId) {
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
async function ensureSolicitantesTable() {
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
function registerDemandasRoutes(app) {
  function rowToDemanda(r) {
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
      updatedAt: r.updated_at
    };
  }
  app.get("/api/demandas", requireAuth, async (req, res) => {
    try {
      const { status, tipo, origem, setor_id } = req.query;
      const pool = getPool();
      const conditions = [];
      const vals = [];
      let i = 1;
      if (status) {
        conditions.push(`d.status=$${i++}`);
        vals.push(status);
      }
      if (tipo) {
        conditions.push(`d.tipo=$${i++}`);
        vals.push(tipo);
      }
      if (origem) {
        conditions.push(`d.origem=$${i++}`);
        vals.push(origem);
      }
      if (setor_id) {
        conditions.push(`d.setor_id=$${i++}`);
        vals.push(setor_id);
      }
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
      if (!rows.length) return res.status(404).json({ error: "Demanda n\xE3o encontrada" });
      res.json(rowToDemanda(rows[0]));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar demanda" });
    }
  });
  app.post("/api/demandas", requireAuth, async (req, res) => {
    try {
      const {
        origem,
        numeroProcesso,
        solicitanteNome,
        solicitanteWhatsapp,
        solicitanteOrgao,
        dataSolicitacao,
        tipo,
        status = "aberta",
        observacoes,
        setorId,
        responsavelId,
        areaId,
        dadosEspecificos
      } = req.body;
      if (!origem || !solicitanteNome || !dataSolicitacao || !tipo) {
        return res.status(400).json({ error: "Campos obrigat\xF3rios ausentes" });
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
        origem,
        numeroProcesso ?? null,
        solicitanteNome,
        solicitanteWhatsapp ?? null,
        solicitanteOrgao ?? null,
        dataSolicitacao,
        tipo,
        status,
        observacoes ?? null,
        setorId ?? null,
        responsavelId ?? null,
        areaId ?? null,
        dadosEspecificos ? JSON.stringify(dadosEspecificos) : null,
        req.session.userId ?? null
      ]);
      const demanda = rows[0];
      await pool.query(
        `INSERT INTO solicitantes (nome, whatsapp, orgao)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (SELECT 1 FROM solicitantes WHERE lower(nome) = lower($1))`,
        [solicitanteNome, solicitanteWhatsapp ?? null, solicitanteOrgao ?? null]
      );
      if (responsavelId) {
        await createNotificacao(
          responsavelId,
          `Nova demanda: ${tipo}`,
          `${solicitanteNome}${solicitanteOrgao ? ` (${solicitanteOrgao})` : ""} \u2014 ${origem}`,
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
        origem,
        numeroProcesso,
        solicitanteNome,
        solicitanteWhatsapp,
        solicitanteOrgao,
        dataSolicitacao,
        tipo,
        status,
        observacoes,
        setorId,
        responsavelId,
        areaId,
        dadosEspecificos
      } = req.body;
      const sets = [];
      const vals = [];
      let i = 1;
      const addField = (col, val) => {
        sets.push(`${col}=$${i++}`);
        vals.push(val);
      };
      if (origem !== void 0) addField("origem", origem);
      if (numeroProcesso !== void 0) addField("numero_processo", numeroProcesso ?? null);
      if (solicitanteNome !== void 0) addField("solicitante_nome", solicitanteNome);
      if (solicitanteWhatsapp !== void 0) addField("solicitante_whatsapp", solicitanteWhatsapp ?? null);
      if (solicitanteOrgao !== void 0) addField("solicitante_orgao", solicitanteOrgao ?? null);
      if (dataSolicitacao !== void 0) addField("data_solicitacao", dataSolicitacao);
      if (tipo !== void 0) addField("tipo", tipo);
      if (status !== void 0) {
        addField("status", status);
        if (status === "concluida") addField("data_conclusao", (/* @__PURE__ */ new Date()).toISOString());
      }
      if (observacoes !== void 0) addField("observacoes", observacoes ?? null);
      if (setorId !== void 0) addField("setor_id", setorId ?? null);
      if (responsavelId !== void 0) addField("responsavel_id", responsavelId ?? null);
      if (areaId !== void 0) addField("area_id", areaId ?? null);
      if (dadosEspecificos !== void 0) addField("dados_especificos", dadosEspecificos ? JSON.stringify(dadosEspecificos) : null);
      if (!sets.length) return res.status(400).json({ error: "Nenhum campo para atualizar" });
      sets.push(`updated_at=NOW()`);
      vals.push(id);
      const pool = getPool();
      const { rows } = await pool.query(
        `UPDATE demandas SET ${sets.join(", ")} WHERE id=$${i} RETURNING *`,
        vals
      );
      if (!rows.length) return res.status(404).json({ error: "Demanda n\xE3o encontrada" });
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
  app.get("/api/notificacoes", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT * FROM notificacoes WHERE usuario_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      res.json(rows.map((r) => ({
        id: r.id,
        usuarioId: r.usuario_id,
        titulo: r.titulo,
        mensagem: r.mensagem,
        tipo: r.tipo,
        referenciaId: r.referencia_id,
        lida: r.lida,
        createdAt: r.created_at
      })));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar notifica\xE7\xF5es" });
    }
  });
  app.get("/api/notificacoes/nao-lidas", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM notificacoes WHERE usuario_id=$1 AND lida=false`,
        [userId]
      );
      res.json({ count: parseInt(rows[0].count) });
    } catch (error) {
      res.status(500).json({ error: "Erro ao contar notifica\xE7\xF5es" });
    }
  });
  app.patch("/api/notificacoes/:id/lida", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId;
      const pool = getPool();
      await pool.query(
        `UPDATE notificacoes SET lida=true WHERE id=$1 AND usuario_id=$2`,
        [id, userId]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao marcar notifica\xE7\xE3o" });
    }
  });
  app.patch("/api/notificacoes/lida-todas", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const pool = getPool();
      await pool.query(
        `UPDATE notificacoes SET lida=true WHERE usuario_id=$1 AND lida=false`,
        [userId]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao marcar notifica\xE7\xF5es" });
    }
  });
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

// server/routes/rocagem.ts
import { z as z2 } from "zod";
import * as fs from "fs";
import * as path from "path";
async function ensureContratoConfigTable() {
  try {
    const pool = getPool();
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
  } catch (e) {
    console.warn("contrato_config table check:", e);
  }
}
function convertToSupabaseCSV(areas) {
  if (areas.length === 0) {
    return "id,ordem,sequencia_cadastro,tipo,endereco,bairro,metragem_m2,lat,lng,lote,status,history,polygon,scheduled_date,proxima_previsao,ultima_rocagem,manual_schedule,days_to_complete,servico,registrado_por,data_registro,executando,executando_desde\n";
  }
  const headers = [
    "id",
    "ordem",
    "sequencia_cadastro",
    "tipo",
    "endereco",
    "bairro",
    "metragem_m2",
    "lat",
    "lng",
    "lote",
    "status",
    "history",
    "polygon",
    "scheduled_date",
    "proxima_previsao",
    "ultima_rocagem",
    "manual_schedule",
    "days_to_complete",
    "servico",
    "registrado_por",
    "data_registro",
    "executando",
    "executando_desde"
  ];
  function escapeCSVValue(value) {
    if (value === null || value === void 0) {
      return "";
    }
    if (typeof value === "object") {
      const jsonStr = JSON.stringify(value);
      return `"${jsonStr.replace(/"/g, '""')}"`;
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "number") {
      return String(value);
    }
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
  let csv = headers.join(",") + "\n";
  for (const area of areas) {
    const row = [
      area.id,
      area.ordem ?? "",
      area.sequenciaCadastro ?? "",
      area.tipo ?? "",
      area.endereco ?? "",
      area.bairro ?? "",
      area.metragem_m2 ?? "",
      area.lat ?? "",
      area.lng ?? "",
      area.lote ?? "",
      area.status ?? "",
      area.history ?? [],
      area.polygon ?? null,
      area.scheduledDate ?? "",
      area.proximaPrevisao ?? "",
      area.ultimaRocagem ?? "",
      area.manualSchedule ?? false,
      area.daysToComplete ?? "",
      area.servico ?? "",
      area.registradoPor ?? "",
      area.dataRegistro ?? "",
      area.executando ?? false,
      area.executandoDesde ?? ""
    ];
    csv += row.map(escapeCSVValue).join(",") + "\n";
  }
  return csv;
}
function registerRocagemRoutes(app) {
  app.delete("/api/areas/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "ID inv\xE1lido" });
      }
      const deleted = await storage.deleteArea(id);
      if (!deleted) {
        return res.status(404).json({ error: "\xC1rea n\xE3o encontrada" });
      }
      res.json({ success: true, message: "\xC1rea deletada com sucesso" });
    } catch (error) {
      console.error("Delete area error:", error);
      res.status(500).json({ error: "Falha ao deletar \xE1rea" });
    }
  });
  app.get("/api/backup", async (req, res) => {
    try {
      const allAreas = await storage.getAllAreas("rocagem");
      const config = await storage.getConfig();
      const backup = {
        version: "1.0",
        exportDate: (/* @__PURE__ */ new Date()).toISOString(),
        data: {
          areas: allAreas,
          config
        },
        stats: {
          totalAreas: allAreas.length,
          areasWithMowing: allAreas.filter((a) => a.ultimaRocagem).length
        }
      };
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=zeladoria_backup_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`);
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
        res.status(404).json({ error: "Arquivo CSV n\xE3o encontrado no servidor" });
        return;
      }
      res.download(csvPath, "areas_londrina.csv");
    } catch (error) {
      console.error("Error downloading CSV:", error);
      res.status(500).json({ error: "Falha ao baixar arquivo CSV" });
    }
  });
  app.get("/api/export/csv", async (req, res) => {
    try {
      const startTime = Date.now();
      const mode = req.query.mode || "full";
      if (mode !== "full" && mode !== "incremental") {
        res.status(400).json({ error: "Modo inv\xE1lido. Use 'full' ou 'incremental'" });
        return;
      }
      let areas = [];
      let wasDefaultedToFull = false;
      if (mode === "incremental") {
        const lastExport = await storage.getLastExport("service_areas", "full");
        if (!lastExport) {
          areas = await storage.getAllAreas("rocagem");
          wasDefaultedToFull = true;
        } else {
          const lastExportDate = new Date(lastExport.exportedAt);
          areas = await storage.getAreasModifiedSince(lastExportDate);
        }
      } else {
        areas = await storage.getAllAreas("rocagem");
      }
      const csv = convertToSupabaseCSV(areas);
      const duration = Date.now() - startTime;
      await storage.recordExport({
        scope: "service_areas",
        exportType: wasDefaultedToFull ? "full" : mode,
        recordCount: areas.length,
        durationMs: duration
      });
      const filename = `zeladoria_${mode}_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (wasDefaultedToFull) {
        res.setHeader("X-Export-Info", "Primeira exporta\xE7\xE3o - modo incremental convertido para full");
      }
      res.send(csv);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ error: "Falha ao exportar CSV" });
    }
  });
  app.get("/api/areas/rocagem", requireAuth, async (req, res) => {
    try {
      let areas = await storage.getAllAreas("rocagem");
      const loteRestrito = loteRestritoDoEncarregado(req);
      if (loteRestrito) areas = areas.filter((a) => a.lote === loteRestrito);
      res.json(areas);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ro\xE7agem areas" });
    }
  });
  app.get("/api/areas/light", async (req, res) => {
    try {
      const boundsParam = req.query.bounds;
      let areas = await storage.getAllAreas("rocagem");
      const loteRestrito = loteRestritoDoEncarregado(req);
      if (loteRestrito) areas = areas.filter((a) => a.lote === loteRestrito);
      if (boundsParam) {
        try {
          const bounds = JSON.parse(boundsParam);
          if (Number.isFinite(bounds.north) && Number.isFinite(bounds.south) && Number.isFinite(bounds.east) && Number.isFinite(bounds.west)) {
            areas = areas.filter((area) => {
              if (area.lat === null || area.lat === void 0 || area.lng === null || area.lng === void 0) return false;
              return area.lat >= bounds.south && area.lat <= bounds.north && area.lng >= bounds.west && area.lng <= bounds.east;
            });
          }
        } catch (e) {
          console.error("Error parsing bounds:", e);
          res.status(400).json({ error: "Invalid bounds format" });
          return;
        }
      }
      const lightAreas = areas.map((area) => ({
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
        executando: area.executando || false
      }));
      res.json(lightAreas);
    } catch (error) {
      console.error("Error fetching light areas:", error);
      res.status(500).json({ error: "Failed to fetch light areas" });
    }
  });
  app.get("/api/areas/search", requireAuth, async (req, res) => {
    try {
      const query = (req.query.q || "").trim();
      if (!query) {
        res.json([]);
        return;
      }
      let results = await storage.searchAreas(query, "rocagem", 50);
      const loteRestrito = loteRestritoDoEncarregado(req);
      if (loteRestrito) results = results.filter((a) => a.lote === loteRestrito);
      res.json(results);
    } catch (error) {
      console.error("Error searching areas:", error);
      res.status(500).json({ error: "Failed to search areas" });
    }
  });
  app.get("/api/areas/by-period", async (req, res) => {
    try {
      const { from, to, details, lote, bairro, tipo } = req.query;
      if (!from || !to || typeof from !== "string" || typeof to !== "string") {
        return res.status(400).json({ error: "Par\xE2metros 'from' e 'to' s\xE3o obrigat\xF3rios (YYYY-MM-DD)" });
      }
      const allAreas = await storage.getAllAreas("rocagem");
      const fromDate = /* @__PURE__ */ new Date(from + "T00:00:00");
      const toDate = /* @__PURE__ */ new Date(to + "T23:59:59");
      const loteRestrito = loteRestritoDoEncarregado(req);
      const matchingAreas = allAreas.filter((area) => {
        if (!area.ultimaRocagem) return false;
        const mowDate = new Date(area.ultimaRocagem);
        if (mowDate < fromDate || mowDate > toDate) return false;
        if (loteRestrito && area.lote !== loteRestrito) return false;
        if (lote && typeof lote === "string" && lote !== "all") {
          if (area.lote !== parseInt(lote)) return false;
        }
        if (bairro && typeof bairro === "string" && bairro !== "all") {
          if (area.bairro !== bairro) return false;
        }
        if (tipo && typeof tipo === "string" && tipo !== "all") {
          if (area.tipo !== tipo) return false;
        }
        return true;
      });
      if (details === "true") {
        const detailedAreas = matchingAreas.map((area) => ({
          id: area.id,
          endereco: area.endereco || "",
          bairro: area.bairro || "",
          tipo: area.tipo || "",
          metragem: area.metragem_m2 || 0,
          lote: area.lote || 0,
          ultimaRocagem: area.ultimaRocagem
        })).sort((a, b) => {
          if (a.lote !== b.lote) return a.lote - b.lote;
          return a.endereco.localeCompare(b.endereco, "pt-BR");
        });
        const totalMetragem = detailedAreas.reduce((sum, a) => sum + a.metragem, 0);
        res.json({
          areas: detailedAreas,
          count: detailedAreas.length,
          totalMetragem,
          periodo: { from, to },
          loteFilter: lote || "all"
        });
      } else {
        const matchingIds = matchingAreas.map((area) => area.id);
        res.json({ ids: matchingIds, count: matchingIds.length });
      }
    } catch (error) {
      console.error("Error fetching areas by period:", error);
      res.status(500).json({ error: "Falha ao buscar \xE1reas por per\xEDodo" });
    }
  });
  app.get("/api/areas/:id", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const loteRestrito = loteRestritoDoEncarregado(req);
      if (loteRestrito && area.lote !== loteRestrito) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      res.json(area);
    } catch (error) {
      console.error("Error fetching area details:", error);
      res.status(500).json({ error: "Failed to fetch area details" });
    }
  });
  app.post("/api/areas", requireAuth, async (req, res) => {
    try {
      const createSchema = z2.object({
        tipo: z2.string().min(1, "Tipo \xE9 obrigat\xF3rio"),
        endereco: z2.string().min(1, "Endere\xE7o \xE9 obrigat\xF3rio"),
        bairro: z2.string().optional(),
        metragem_m2: z2.number().positive().optional(),
        lat: z2.number().min(-90).max(90),
        lng: z2.number().min(-180).max(180),
        lote: z2.number().int().min(1).max(2).optional(),
        servico: z2.literal("rocagem").optional().default("rocagem"),
        status: z2.enum(["Pendente", "Em Execu\xE7\xE3o", "Conclu\xEDdo"]).default("Pendente"),
        ultimaRocagem: z2.string().optional()
      });
      const validatedData = createSchema.parse(req.body);
      let proximaPrevisao = null;
      if (validatedData.ultimaRocagem) {
        const { calculateNextMowing: calculateNextMowing2 } = await Promise.resolve().then(() => (init_schedulingAlgorithm(), schedulingAlgorithm_exports));
        const tempArea = {
          id: 0,
          ultimaRocagem: validatedData.ultimaRocagem,
          manualSchedule: false
        };
        const result = calculateNextMowing2(tempArea);
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
        ordem: void 0,
        sequenciaCadastro: void 0,
        history: [],
        polygon: null,
        scheduledDate: null,
        proximaPrevisao,
        ultimaRocagem: validatedData.ultimaRocagem || null,
        manualSchedule: false,
        daysToComplete: void 0,
        registradoPor: null,
        dataRegistro: null,
        fotos: [],
        executando: false,
        executandoDesde: null
      });
      res.status(201).json(newArea);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({
          error: "Dados inv\xE1lidos",
          details: error.errors
        });
        return;
      }
      console.error("Error creating area:", error);
      res.status(500).json({ error: "Falha ao criar \xE1rea" });
    }
  });
  app.get("/api/geocode/search", async (req, res) => {
    try {
      const query = (req.query.q || "").trim();
      if (!query || query.length < 3) {
        res.json([]);
        return;
      }
      const encodedQuery = encodeURIComponent(`${query}, Londrina, Paran\xE1, Brasil`);
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=8&countrycodes=br&bounded=1&viewbox=-51.22,-23.25,-51.10,-23.38`;
      const response = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "CMTU-LD Zeladoria Dashboard"
        }
      });
      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }
      const results = await response.json();
      const formatted = results.map((r) => ({
        display_name: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        type: r.type,
        address: r.address,
        boundingbox: r.boundingbox
      }));
      res.json(formatted);
    } catch (error) {
      console.error("Error geocoding:", error);
      res.status(500).json({ error: "Falha ao buscar endere\xE7o" });
    }
  });
  app.get("/api/geocode/reverse", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      if (isNaN(lat) || isNaN(lng)) {
        res.status(400).json({ error: "Coordenadas inv\xE1lidas" });
        return;
      }
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const response = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "CMTU-LD Zeladoria Dashboard"
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
        lng: parseFloat(result.lon)
      });
    } catch (error) {
      console.error("Error reverse geocoding:", error);
      res.status(500).json({ error: "Falha ao obter endere\xE7o" });
    }
  });
  app.get("/api/teams", async (req, res) => {
    try {
      const teams2 = await storage.getAllTeams();
      res.json(teams2);
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
  app.patch("/api/config", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const configSchema = z2.object({
        mowingProductionRate: z2.object({
          lote1: z2.number(),
          lote2: z2.number()
        }).partial().optional(),
        metaMensal: z2.number().positive().optional(),
        metaLote1: z2.number().positive().optional(),
        metaLote2: z2.number().positive().optional()
      });
      const validatedConfig = configSchema.parse(req.body);
      const updatedConfig = await storage.updateConfig(validatedConfig);
      res.json(updatedConfig);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid configuration data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update configuration" });
      }
    }
  });
  app.patch("/api/areas/:id/status", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const statusSchema = z2.object({
        status: z2.enum(["Pendente", "Em Execu\xE7\xE3o", "Conclu\xEDdo"])
      });
      const { status } = statusSchema.parse(req.body);
      const updatedArea = await storage.updateAreaStatus(areaId, status);
      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid status data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update area status" });
      }
    }
  });
  app.patch("/api/teams/:id/assign", requireAuth, async (req, res) => {
    try {
      const teamId = parseInt(req.params.id);
      const assignSchema = z2.object({
        areaId: z2.number()
      });
      const { areaId } = assignSchema.parse(req.body);
      const updatedTeam = await storage.assignTeamToArea(teamId, areaId);
      if (!updatedTeam) {
        res.status(404).json({ error: "Team not found" });
        return;
      }
      res.json(updatedTeam);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid assignment data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to assign team" });
      }
    }
  });
  app.patch("/api/areas/:id/polygon", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const polygonSchema = z2.object({
        polygon: z2.array(z2.object({
          lat: z2.number(),
          lng: z2.number()
        }))
      });
      const { polygon } = polygonSchema.parse(req.body);
      const updatedArea = await storage.updateAreaPolygon(areaId, polygon);
      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid polygon data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update polygon" });
      }
    }
  });
  app.patch("/api/areas/:id/position", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const positionSchema = z2.object({
        lat: z2.number(),
        lng: z2.number()
      });
      const { lat, lng } = positionSchema.parse(req.body);
      const updatedArea = await storage.updateAreaPosition(areaId, lat, lng);
      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid position data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update position" });
      }
    }
  });
  app.patch("/api/areas/:id/executando", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const schema = z2.object({
        executando: z2.boolean()
      });
      const { executando } = schema.parse(req.body);
      const updatedArea = await storage.toggleExecutando(areaId, executando);
      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update executando status" });
      }
    }
  });
  app.post("/api/areas/reset-executando", requireAuth, async (_req, res) => {
    try {
      const count = await storage.resetAllExecutando();
      res.json({ message: `${count} \xE1reas resetadas`, count });
    } catch (error) {
      console.error("Error resetting executando:", error);
      res.status(500).json({ error: "Failed to reset executando" });
    }
  });
  app.patch("/api/areas/:id/manual-forecast", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const manualForecastSchema = z2.object({
        proximaPrevisao: z2.string().min(1)
      });
      const { proximaPrevisao } = manualForecastSchema.parse(req.body);
      const updatedArea = await storage.updateArea(areaId, {
        proximaPrevisao,
        manualSchedule: true
      });
      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid manual forecast data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to set manual forecast" });
      }
    }
  });
  app.patch("/api/areas/:id", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const updateSchema = z2.object({
        endereco: z2.string().optional(),
        bairro: z2.string().optional(),
        metragem_m2: z2.number().optional(),
        lote: z2.number().optional(),
        tipo: z2.string().optional(),
        ultimaRocagem: z2.string().min(1).optional(),
        status: z2.enum(["Pendente", "Em Execu\xE7\xE3o", "Conclu\xEDdo"]).optional(),
        registradoPor: z2.string().optional(),
        fotos: z2.array(z2.object({ url: z2.string(), data: z2.string() })).optional()
      });
      const data = updateSchema.parse(req.body);
      if (data.ultimaRocagem) {
        const areaAtual = await storage.getAreaById(areaId);
        if (!areaAtual) {
          res.status(404).json({ error: "Area not found" });
          return;
        }
        await storage.updateArea(areaId, {
          ...data,
          status: "Conclu\xEDdo",
          dataRegistro: (/* @__PURE__ */ new Date()).toISOString(),
          manualSchedule: false
        });
        await storage.addHistoryEntry(areaId, {
          date: data.ultimaRocagem,
          type: "completed",
          status: "Conclu\xEDdo",
          observation: data.registradoPor ? `Ro\xE7agem conclu\xEDda por ${data.registradoPor}` : "Ro\xE7agem conclu\xEDda"
        });
        const areaAtualizada = await storage.getAreaById(areaId);
        const sync = syncFromHistory(areaAtualizada?.history ?? []);
        const final = await storage.updateArea(areaId, sync);
        res.json(final);
        return;
      }
      const updatedArea = await storage.updateArea(areaId, data);
      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      res.json(updatedArea);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid area data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update area" });
      }
    }
  });
  function syncFromHistory(history) {
    const completed = history.filter((h) => h.type !== "forecast").map((h) => h.date).sort().reverse();
    const ultimaRocagem = completed[0] ?? null;
    let proximaPrevisao = null;
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
      const historyEntrySchema = z2.object({
        date: z2.string(),
        status: z2.string(),
        observation: z2.string().optional()
      });
      const entry = historyEntrySchema.parse(req.body);
      const updatedArea = await storage.addHistoryEntry(areaId, entry);
      if (!updatedArea) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const sync = syncFromHistory(updatedArea.history);
      const final = await storage.updateArea(areaId, sync);
      res.json(final);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid history entry", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to add history entry" });
      }
    }
  });
  app.delete("/api/areas/:id/history/:index", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const idx = parseInt(req.params.index);
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const newHistory = area.history.filter((_, i) => i !== idx);
      const sync = syncFromHistory(newHistory);
      const updated = await storage.updateArea(areaId, { history: newHistory, ...sync });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to delete history entry" });
    }
  });
  app.patch("/api/areas/:id/history/:index", requireAuth, async (req, res) => {
    try {
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Apenas administradores podem editar hist\xF3rico" });
        return;
      }
      const areaId = parseInt(req.params.id);
      const idx = parseInt(req.params.index);
      const entrySchema = z2.object({
        date: z2.string(),
        status: z2.string(),
        observation: z2.string().optional()
      });
      const entry = entrySchema.parse(req.body);
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const newHistory = area.history.map((h, i) => i === idx ? { ...h, ...entry } : h);
      const sync = syncFromHistory(newHistory);
      const updated = await storage.updateArea(areaId, { history: newHistory, ...sync });
      res.json(updated);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update history entry" });
      }
    }
  });
  app.post("/api/areas/:id/photos", requireAuth, upload.single("photo"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }
      const areaId = parseInt(req.params.id);
      const date = req.body.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const ext = req.file.originalname.split(".").pop() ?? "jpg";
      const filePath = `areas/${areaId}/${Date.now()}.${ext}`;
      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage.from("fotos").upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (uploadError) {
        console.error("Supabase upload error:", uploadError);
        res.status(500).json({ error: uploadError.message });
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from("fotos").getPublicUrl(filePath);
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const fotos = [...area.fotos || [], { url: publicUrl, data: (/* @__PURE__ */ new Date(date + "T12:00:00")).toISOString() }];
      const updated = await storage.updateArea(areaId, { fotos });
      res.json(updated);
    } catch (error) {
      console.error("Photo upload error:", error);
      res.status(500).json({ error: "Erro ao fazer upload da foto" });
    }
  });
  app.delete("/api/areas/:id/photos", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const { photoUrl } = req.body;
      if (!photoUrl) {
        res.status(400).json({ error: "URL da foto n\xE3o informada" });
        return;
      }
      const marker = `/storage/v1/object/public/fotos/`;
      const filePath = photoUrl.includes(marker) ? photoUrl.split(marker)[1] : null;
      if (filePath) {
        const supabase = getSupabase();
        await supabase.storage.from("fotos").remove([filePath]);
      }
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const fotos = (area.fotos || []).filter((f) => f.url !== photoUrl);
      const updated = await storage.updateArea(areaId, { fotos });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir foto" });
    }
  });
  app.post("/api/areas/:id/registrar-rocagem", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const loteRestrito = loteRestritoDoEncarregado(req);
      if (loteRestrito && area.lote !== loteRestrito) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const schema = z2.object({ data: z2.string().min(1).optional() });
      const { data } = schema.parse(req.body ?? {});
      const dataServico = data || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const registradoPor = req.session.userName || void 0;
      await storage.updateArea(areaId, {
        status: "Conclu\xEDdo",
        dataRegistro: (/* @__PURE__ */ new Date()).toISOString(),
        manualSchedule: false,
        ...registradoPor ? { registradoPor } : {}
      });
      await storage.addHistoryEntry(areaId, {
        date: dataServico,
        type: "completed",
        status: "Conclu\xEDdo",
        observation: registradoPor ? `Ro\xE7agem conclu\xEDda por ${registradoPor}` : "Ro\xE7agem conclu\xEDda"
      });
      const areaAtualizada = await storage.getAreaById(areaId);
      const sync = syncFromHistory(areaAtualizada?.history ?? []);
      const final = await storage.updateArea(areaId, sync);
      res.json(final);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Dados inv\xE1lidos", details: error.errors });
      } else {
        console.error("Error registering rocagem:", error);
        res.status(500).json({ error: "Falha ao registrar ro\xE7agem" });
      }
    }
  });
  app.post("/api/areas/register-daily", requireAuth, async (req, res) => {
    try {
      const registerSchema = z2.object({
        areaIds: z2.array(z2.number()).min(1, "Selecione pelo menos uma \xE1rea"),
        date: z2.string(),
        type: z2.enum(["completed", "forecast"]).default("completed")
      });
      const { areaIds, date, type } = registerSchema.parse(req.body);
      await storage.registerDailyMowing(areaIds, date, type);
      const typeLabel = type === "completed" ? "registrada" : "prevista";
      res.json({
        success: true,
        message: `${areaIds.length} \xE1rea(s) ${typeLabel}(s) com sucesso`,
        count: areaIds.length
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Dados inv\xE1lidos", details: error.errors });
      } else {
        console.error("Error registering daily mowing:", error);
        res.status(500).json({ error: "Falha ao registrar ro\xE7agem" });
      }
    }
  });
  app.delete("/api/areas/:id/rocagem", requireAuth, async (req, res) => {
    try {
      const areaId = parseInt(req.params.id);
      if (isNaN(areaId)) {
        res.status(400).json({ error: "ID inv\xE1lido" });
        return;
      }
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "\xC1rea n\xE3o encontrada" });
        return;
      }
      const updatedArea = await storage.updateArea(areaId, {
        ultimaRocagem: null,
        proximaPrevisao: null,
        registradoPor: null,
        dataRegistro: null,
        status: "Pendente",
        manualSchedule: false
      });
      if (!updatedArea) {
        res.status(500).json({ error: "Falha ao desfazer ro\xE7agem" });
        return;
      }
      res.json({
        success: true,
        message: "Registro de ro\xE7agem removido com sucesso",
        area: updatedArea
      });
    } catch (error) {
      console.error("Error undoing mowing:", error);
      res.status(500).json({ error: "Falha ao desfazer ro\xE7agem" });
    }
  });
  app.post("/api/admin/recalculate-schedules", requireRole("admin"), async (req, res) => {
    console.log("\u{1F4C5} Recalculando agendamentos de todas as \xE1reas");
    try {
      const { calculateMowingSchedule: calculateMowingSchedule2 } = await Promise.resolve().then(() => (init_schedulingAlgorithm(), schedulingAlgorithm_exports));
      console.log("\u{1F4CA} Buscando \xE1reas e configura\xE7\xF5es...");
      const areas = await storage.getAllAreas("rocagem");
      const config = await storage.getConfig();
      console.log(`\u{1F522} Processando ${areas.length} \xE1reas...`);
      const lote1Results = calculateMowingSchedule2(
        areas.filter((a) => a.lote === 1),
        1,
        config.mowingProductionRate.lote1,
        /* @__PURE__ */ new Date()
      );
      const lote2Results = calculateMowingSchedule2(
        areas.filter((a) => a.lote === 2),
        2,
        config.mowingProductionRate.lote2,
        /* @__PURE__ */ new Date()
      );
      const allResults = [...lote1Results, ...lote2Results];
      console.log(`\u2705 ${allResults.length} previs\xF5es calculadas`);
      console.log("\u{1F4BE} Salvando previs\xF5es no banco...");
      for (const result of allResults) {
        await storage.updateArea(result.areaId, {
          proximaPrevisao: result.proximaPrevisao,
          daysToComplete: result.daysToComplete
        });
      }
      console.log(`\u2705 Agendamentos recalculados com sucesso!`);
      res.json({
        success: true,
        message: `\u2705 Agendamentos recalculados para ${allResults.length} \xE1reas!`,
        calculated: allResults.length
      });
    } catch (error) {
      console.error("\u{1F4A5} ERRO ao recalcular agendamentos:", error);
      res.status(500).json({
        error: "Falha ao recalcular agendamentos",
        details: error.message
      });
    }
  });
  function getTodayBrasilia() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(/* @__PURE__ */ new Date());
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
  setInterval(checkAndResetStaleExecutando, 5 * 60 * 1e3);
  app.get("/api/stats/rocagem", async (req, res) => {
    try {
      const config = await storage.getConfig();
      const META_LOTE1 = config.metaLote1 ?? 1562500;
      const META_LOTE2 = config.metaLote2 ?? 1562500;
      const META_MENSAL = config.metaMensal ?? META_LOTE1 + META_LOTE2;
      const now = /* @__PURE__ */ new Date();
      const brasiliaFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      const todayStr = brasiliaFormatter.format(now);
      const [yearStr, monthStr] = todayStr.split("-");
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const day = parseInt(todayStr.split("-")[2]);
      const fromParam = req.query.from;
      const toParam = req.query.to;
      const isCustomPeriod = !!(fromParam && toParam);
      const monthPrefix = `${yearStr}-${monthStr}`;
      const fromDate = fromParam || `${monthPrefix}-01`;
      const toDate = toParam || todayStr;
      const yesterdayDate = new Date(now);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = brasiliaFormatter.format(yesterdayDate);
      const rocagemAreas = await storage.getAllAreas("rocagem");
      const areasNoPeriodo = rocagemAreas.filter((a) => {
        if (!a.ultimaRocagem) return false;
        return a.ultimaRocagem >= fromDate && a.ultimaRocagem <= toDate;
      });
      const areasOntem = rocagemAreas.filter((a) => a.ultimaRocagem === yesterdayStr);
      const calcLoteStats = (areas, areasY, lote) => {
        const lotAreas = areas.filter((a) => a.lote === lote);
        const lotAreasYesterday = areasY.filter((a) => a.lote === lote);
        const totalM2 = lotAreas.reduce((sum, a) => sum + (a.metragem_m2 || 0), 0);
        const yesterdayM2 = lotAreasYesterday.reduce((sum, a) => sum + (a.metragem_m2 || 0), 0);
        return { totalM2, yesterdayM2, areasCount: lotAreas.length, areasYesterday: lotAreasYesterday.length };
      };
      const lote1 = calcLoteStats(areasNoPeriodo, areasOntem, 1);
      const lote2 = calcLoteStats(areasNoPeriodo, areasOntem, 2);
      const totalRocado = lote1.totalM2 + lote2.totalM2;
      const totalOntem = lote1.yesterdayM2 + lote2.yesterdayM2;
      const totalAreas = lote1.areasCount + lote2.areasCount;
      const countWeekdays = (startStr, endStr) => {
        const start = /* @__PURE__ */ new Date(startStr + "T12:00:00");
        const end = /* @__PURE__ */ new Date(endStr + "T12:00:00");
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
      let diasUteisDecorridos;
      let diasUteisRestantes;
      if (isCustomPeriod) {
        diasUteisDecorridos = Math.max(1, countWeekdays(fromDate, toDate));
        diasUteisRestantes = 0;
      } else {
        diasUteisDecorridos = countWeekdays(`${monthPrefix}-01`, todayStr);
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const lastDayStr = `${monthPrefix}-${String(lastDayOfMonth).padStart(2, "0")}`;
        const tomorrowDate = new Date(now);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = brasiliaFormatter.format(tomorrowDate);
        diasUteisRestantes = countWeekdays(tomorrowStr, lastDayStr);
      }
      const mediaDiaria = diasUteisDecorridos > 0 ? totalRocado / diasUteisDecorridos : 0;
      const faltaParaMeta = Math.max(0, META_MENSAL - totalRocado);
      const mediaNecessaria = diasUteisRestantes > 0 ? faltaParaMeta / diasUteisRestantes : 0;
      const percentualMeta = META_MENSAL > 0 ? totalRocado / META_MENSAL * 100 : 0;
      const faltaLote1 = Math.max(0, META_LOTE1 - lote1.totalM2);
      const faltaLote2 = Math.max(0, META_LOTE2 - lote2.totalM2);
      const necessariaLote1 = diasUteisRestantes > 0 ? faltaLote1 / diasUteisRestantes : 0;
      const necessariaLote2 = diasUteisRestantes > 0 ? faltaLote2 / diasUteisRestantes : 0;
      const percentLote1 = META_LOTE1 > 0 ? lote1.totalM2 / META_LOTE1 * 100 : 0;
      const percentLote2 = META_LOTE2 > 0 ? lote2.totalM2 / META_LOTE2 * 100 : 0;
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
          areasOntem: lote1.areasYesterday
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
          areasOntem: lote2.areasYesterday
        }
      });
    } catch (error) {
      console.error("Error calculating mowing stats:", error);
      res.status(500).json({ error: "Falha ao calcular estat\xEDsticas" });
    }
  });
  app.get("/api/ordens", requireAuth, async (req, res) => {
    try {
      const sb = getSupabase();
      let query = sb.from("ordens_servico").select("*").order("created_at", { ascending: false });
      const loteRestrito = loteRestritoDoEncarregado(req);
      if (loteRestrito) query = query.eq("lote", loteRestrito);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar ordens" });
    }
  });
  app.get("/api/ordens/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sb = getSupabase();
      const { data: ordem, error: e1 } = await sb.from("ordens_servico").select("*").eq("id", id).single();
      if (e1) throw e1;
      const loteRestrito = loteRestritoDoEncarregado(req);
      if (loteRestrito && ordem.lote !== loteRestrito) {
        res.status(404).json({ error: "Ordem n\xE3o encontrada" });
        return;
      }
      const { data: areaLinks, error: e2 } = await sb.from("ordens_servico_areas").select("area_id").eq("ordem_id", id);
      if (e2) throw e2;
      const areaIds = areaLinks.map((r) => r.area_id);
      let areas = [];
      if (areaIds.length > 0) {
        const { data: areaData, error: e3 } = await sb.from("service_areas").select("id, tipo, endereco, bairro, metragem_m2").in("id", areaIds).order("id");
        if (e3) throw e3;
        areas = areaData;
      }
      res.json({ ...ordem, areas });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar ordem" });
    }
  });
  app.post("/api/ordens", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const { numero, lote, mes_referencia, data_emissao, emitido_por, observacao, area_ids } = req.body;
      if (!numero || !lote || !mes_referencia || !data_emissao || !area_ids?.length) {
        return res.status(400).json({ error: "Campos obrigat\xF3rios faltando" });
      }
      const sb = getSupabase();
      const { data: ordem, error: e1 } = await sb.from("ordens_servico").insert({ numero, lote, mes_referencia, data_emissao, emitido_por: emitido_por || req.session.userName, observacao }).select().single();
      if (e1) throw e1;
      const links = area_ids.map((area_id) => ({ ordem_id: ordem.id, area_id }));
      const { error: e2 } = await sb.from("ordens_servico_areas").insert(links);
      if (e2) throw e2;
      await logAudit(
        req.session.userId,
        req.session.userName || "desconhecido",
        "criou",
        "ordem_servico",
        ordem.id,
        `OS ${numero} \u2014 Lote ${lote}`,
        null,
        { numero, lote, mes_referencia, data_emissao, observacao, area_ids }
      );
      res.status(201).json(ordem);
    } catch (error) {
      console.error("Erro ao criar ordem:", error);
      res.status(500).json({ error: "Erro ao criar ordem de servi\xE7o" });
    }
  });
  app.patch("/api/ordens/:id", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { numero, lote, mes_referencia, data_emissao, observacao, area_ids } = req.body;
      const sb = getSupabase();
      const { data: anterior } = await sb.from("ordens_servico").select("*").eq("id", id).single();
      const updateData = {};
      if (numero !== void 0) updateData.numero = numero;
      if (lote !== void 0) updateData.lote = lote;
      if (mes_referencia !== void 0) updateData.mes_referencia = mes_referencia;
      if (data_emissao !== void 0) updateData.data_emissao = data_emissao;
      if (observacao !== void 0) updateData.observacao = observacao;
      if (Object.keys(updateData).length > 0) {
        const { error: e1 } = await sb.from("ordens_servico").update(updateData).eq("id", id);
        if (e1) throw e1;
      }
      if (area_ids !== void 0) {
        const { error: e2 } = await sb.from("ordens_servico_areas").delete().eq("ordem_id", id);
        if (e2) throw e2;
        if (area_ids.length > 0) {
          const links = area_ids.map((area_id) => ({ ordem_id: id, area_id }));
          const { error: e3 } = await sb.from("ordens_servico_areas").insert(links);
          if (e3) throw e3;
        }
      }
      await logAudit(
        req.session.userId,
        req.session.userName || "desconhecido",
        "editou",
        "ordem_servico",
        id,
        `OS ${anterior?.numero || id} \u2014 Lote ${anterior?.lote || "?"}`,
        anterior,
        { ...updateData, area_ids }
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao atualizar ordem:", error);
      res.status(500).json({ error: "Erro ao atualizar ordem de servi\xE7o" });
    }
  });
  app.delete("/api/ordens/:id", requireRole("admin", "gestor", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sb = getSupabase();
      const { data: anterior } = await sb.from("ordens_servico").select("*").eq("id", id).single();
      const { error } = await sb.from("ordens_servico").delete().eq("id", id);
      if (error) throw error;
      await logAudit(
        req.session.userId,
        req.session.userName || "desconhecido",
        "excluiu",
        "ordem_servico",
        id,
        `OS ${anterior?.numero || id} \u2014 Lote ${anterior?.lote || "?"}`,
        anterior,
        null
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir ordem" });
    }
  });
  app.get("/api/contrato-config/:lote", requireAuth, async (req, res) => {
    try {
      const lote = parseInt(req.params.lote);
      const pool = getPool();
      const result = await pool.query(
        "SELECT * FROM contrato_config WHERE lote = $1",
        [lote]
      );
      res.json(result.rows[0] ?? { lote });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar configura\xE7\xE3o do contrato" });
    }
  });
  app.put("/api/contrato-config/:lote", requireRole("admin", "gestor"), async (req, res) => {
    try {
      const lote = parseInt(req.params.lote);
      const {
        regiao,
        processo_admin,
        pregao_eletronico,
        numero_contrato,
        contratada_nome,
        contratada_endereco,
        diretor_nome,
        gerente_nome,
        fiscal_nome
      } = req.body;
      const pool = getPool();
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
      `, [
        lote,
        regiao,
        processo_admin,
        pregao_eletronico,
        numero_contrato,
        contratada_nome,
        contratada_endereco,
        diretor_nome,
        gerente_nome,
        fiscal_nome
      ]);
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao salvar configura\xE7\xE3o do contrato:", error);
      res.status(500).json({ error: "Erro ao salvar configura\xE7\xE3o do contrato" });
    }
  });
  app.get("/api/cronogramas", requireAuth, async (req, res) => {
    try {
      const sb = getSupabase();
      const { data, error } = await sb.from("cronogramas_semanais").select("*").order("semana_inicio", { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar cronogramas" });
    }
  });
  app.get("/api/cronogramas/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sb = getSupabase();
      const { data: cronograma, error: e1 } = await sb.from("cronogramas_semanais").select("*").eq("id", id).single();
      if (e1) throw e1;
      const { data: areaLinks, error: e2 } = await sb.from("cronograma_areas").select("area_id").eq("cronograma_id", id);
      if (e2) throw e2;
      const areaIds = areaLinks.map((r) => r.area_id);
      let areas = [];
      if (areaIds.length > 0) {
        const { data: areaData, error: e3 } = await sb.from("service_areas").select("id, tipo, endereco, bairro, metragem_m2, lat, lng").in("id", areaIds).order("id");
        if (e3) throw e3;
        areas = areaData;
      }
      res.json({ ...cronograma, areas });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar cronograma" });
    }
  });
  app.post("/api/cronogramas", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const { lote, semana_inicio, semana_fim, observacao, area_ids } = req.body;
      if (!lote || !semana_inicio || !semana_fim || !area_ids?.length) {
        return res.status(400).json({ error: "Campos obrigat\xF3rios faltando" });
      }
      const sb = getSupabase();
      const { data: cronograma, error: e1 } = await sb.from("cronogramas_semanais").insert({ lote, semana_inicio, semana_fim, observacao, criado_por: req.session.userName }).select().single();
      if (e1) throw e1;
      const links = area_ids.map((area_id) => ({ cronograma_id: cronograma.id, area_id }));
      const { error: e2 } = await sb.from("cronograma_areas").insert(links);
      if (e2) throw e2;
      await logAudit(
        req.session.userId,
        req.session.userName || "desconhecido",
        "criou",
        "cronograma",
        cronograma.id,
        `Cronograma Lote ${lote} \u2014 ${semana_inicio} a ${semana_fim}`,
        null,
        { lote, semana_inicio, semana_fim, observacao, area_ids }
      );
      res.status(201).json(cronograma);
    } catch (error) {
      console.error("Erro ao criar cronograma:", error);
      res.status(500).json({ error: "Erro ao criar cronograma" });
    }
  });
  app.patch("/api/cronogramas/:id", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { lote, semana_inicio, semana_fim, observacao, area_ids } = req.body;
      const sb = getSupabase();
      const { data: anterior } = await sb.from("cronogramas_semanais").select("*").eq("id", id).single();
      const updateData = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (lote !== void 0) updateData.lote = lote;
      if (semana_inicio !== void 0) updateData.semana_inicio = semana_inicio;
      if (semana_fim !== void 0) updateData.semana_fim = semana_fim;
      if (observacao !== void 0) updateData.observacao = observacao;
      const { error: e1 } = await sb.from("cronogramas_semanais").update(updateData).eq("id", id);
      if (e1) throw e1;
      if (area_ids !== void 0) {
        const { error: e2 } = await sb.from("cronograma_areas").delete().eq("cronograma_id", id);
        if (e2) throw e2;
        if (area_ids.length > 0) {
          const links = area_ids.map((area_id) => ({ cronograma_id: id, area_id }));
          const { error: e3 } = await sb.from("cronograma_areas").insert(links);
          if (e3) throw e3;
        }
      }
      await logAudit(
        req.session.userId,
        req.session.userName || "desconhecido",
        "editou",
        "cronograma",
        id,
        `Cronograma Lote ${anterior?.lote || "?"} \u2014 ${anterior?.semana_inicio || ""} a ${anterior?.semana_fim || ""}`,
        anterior,
        { ...updateData, area_ids }
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao atualizar cronograma:", error);
      res.status(500).json({ error: "Erro ao atualizar cronograma" });
    }
  });
  app.delete("/api/cronogramas/:id", requireRole("admin", "gestor", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sb = getSupabase();
      const { data: anterior } = await sb.from("cronogramas_semanais").select("*").eq("id", id).single();
      const { error } = await sb.from("cronogramas_semanais").delete().eq("id", id);
      if (error) throw error;
      await logAudit(
        req.session.userId,
        req.session.userName || "desconhecido",
        "excluiu",
        "cronograma",
        id,
        `Cronograma Lote ${anterior?.lote || "?"} \u2014 ${anterior?.semana_inicio || ""} a ${anterior?.semana_fim || ""}`,
        anterior,
        null
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir cronograma" });
    }
  });
  app.get("/api/public/cronograma/:lote", async (req, res) => {
    try {
      const lote = parseInt(req.params.lote);
      const sb = getSupabase();
      let cronograma = null;
      if (req.query.id) {
        const { data, error } = await sb.from("cronogramas_semanais").select("*").eq("id", req.query.id).eq("lote", lote).single();
        if (error) throw error;
        cronograma = data;
      } else {
        const now = /* @__PURE__ */ new Date();
        const todayStr = now.toISOString().split("T")[0];
        const diaSemana = now.getDay();
        const mostrarProximaSemana = diaSemana === 0 || diaSemana >= 5;
        if (mostrarProximaSemana) {
          const { data: proxima, error: ep } = await sb.from("cronogramas_semanais").select("*").eq("lote", lote).gt("semana_inicio", todayStr).order("semana_inicio", { ascending: true }).limit(1);
          if (ep) throw ep;
          cronograma = proxima?.[0] ?? null;
        }
        if (!cronograma) {
          const { data: atual, error: ea } = await sb.from("cronogramas_semanais").select("*").eq("lote", lote).lte("semana_inicio", todayStr).gte("semana_fim", todayStr).order("created_at", { ascending: false }).limit(1);
          if (ea) throw ea;
          cronograma = atual?.[0] ?? null;
        }
        if (!cronograma) {
          const { data: recente, error: er } = await sb.from("cronogramas_semanais").select("*").eq("lote", lote).order("semana_inicio", { ascending: false }).limit(1);
          if (er) throw er;
          cronograma = recente?.[0] ?? null;
        }
      }
      if (!cronograma) {
        return res.json({ cronograma: null, areas: [] });
      }
      const { data: areaLinks, error: e2 } = await sb.from("cronograma_areas").select("area_id").eq("cronograma_id", cronograma.id);
      if (e2) throw e2;
      const areaIds = areaLinks.map((r) => r.area_id);
      let areas = [];
      if (areaIds.length > 0) {
        const { data: areaData, error: e3 } = await sb.from("service_areas").select("id, tipo, endereco, bairro, metragem_m2, lat, lng").in("id", areaIds).order("id");
        if (e3) throw e3;
        areas = areaData;
      }
      res.json({ cronograma, areas });
    } catch (error) {
      console.error("Erro na rota p\xFAblica de cronograma:", error);
      res.status(500).json({ error: "Erro ao buscar cronograma" });
    }
  });
}

// server/routes/varricao.ts
async function ensureVarricaoLocaisTable() {
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
async function ensureVarricaoConfigTable() {
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
var SECOES_POR_CATEGORIA = {
  varricao: ["varricao", "varricao_2turno"],
  lavacao: ["lavagem_vias_noturna", "lavagem_pracas_noturna", "lavagem_vias_diurna", "lavagem_pracas_diurna"],
  sanitario: ["sanitarios"]
};
function secaoCategoria(secao) {
  if (secao.startsWith("lavagem")) return "lavacao";
  if (secao === "sanitarios") return "sanitario";
  return "varricao";
}
async function ensureVarricaoOrdensTable() {
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
function diasDoMesParaLocal(local, ano, mes) {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const diaSemana = new Date(ano, mes - 1, d).getDay();
    const programado = local.frequencia === "diario" ? diaSemana >= 1 && diaSemana <= 6 : (local.dias_semana ?? []).includes(diaSemana);
    if (programado) dias.push(d);
  }
  return dias;
}
function formatarDiasTexto(dias, frequencia) {
  if (frequencia === "diario") return "Di\xE1rio (seg. a s\xE1b.)";
  if (dias.length === 0) return "\u2014";
  const strs = dias.map((d) => String(d).padStart(2, "0"));
  if (strs.length === 1) return strs[0];
  return strs.slice(0, -1).join(", ") + " e " + strs[strs.length - 1];
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}
function normalizarNome(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function calcularLocaisDoMes(locais, ano, mes) {
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
      metragemTotal: metragemUnica != null ? metragemUnica * dias.length : 0
    };
  }).filter((l) => l.dias.length > 0);
}
function detectarDuplicatas(locais) {
  const duplicatas = [];
  const identidades = locais.map((l) => ({
    id: l.localId,
    label: `${l.nome}${l.complemento ? ` (${l.complemento})` : ""}`,
    norm: normalizarNome(`${l.nome} ${l.complemento ?? ""}`)
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
          distancia: dist
        });
      }
    }
  }
  return duplicatas;
}
function subtotais(locais, campo) {
  const m = /* @__PURE__ */ new Map();
  locais.forEach((l) => {
    const chave = l[campo] ?? "Sem defini\xE7\xE3o";
    if (!m.has(chave)) m.set(chave, { quantidade: 0, metragemTotal: 0 });
    const acc = m.get(chave);
    acc.quantidade++;
    acc.metragemTotal += l.metragemTotal;
  });
  return Array.from(m.entries()).map(([chave, v]) => ({ chave, ...v })).sort((a, b) => b.metragemTotal - a.metragemTotal);
}
async function idsBaseParaNovaOrdem(pool, categoria, referenciaId) {
  let base = null;
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
  if (!base) return { ids: null, referencia: null };
  const { rows: daBase } = await pool.query(
    `SELECT local_id FROM varricao_ordens_locais WHERE ordem_id=$1 AND local_id IS NOT NULL`,
    [base.id]
  );
  const ids = new Set(daBase.map((r) => r.local_id));
  const { rows: jaFinalizadosAlgumaVez } = await pool.query(`
    SELECT DISTINCT l.local_id FROM varricao_ordens_locais l
    JOIN varricao_ordens o ON o.id = l.ordem_id
    WHERE o.status='finalizada' AND o.categoria=$1 AND l.local_id IS NOT NULL
  `, [categoria]);
  const idsJaVistos = new Set(jaFinalizadosAlgumaVez.map((r) => r.local_id));
  const { rows: todosAtivos } = await pool.query(
    `SELECT id FROM varricao_locais WHERE ativo IS NOT FALSE AND secao = ANY($1::text[])`,
    [secoesDaCategoria]
  );
  todosAtivos.forEach((l) => {
    if (!idsJaVistos.has(l.id)) ids.add(l.id);
  });
  return {
    ids: Array.from(ids),
    referencia: { id: base.id, numero: base.numero, mesReferencia: base.mes_referencia }
  };
}
function totaisPorCategoria(locais) {
  const totais = { varricao: 0, lavacao: 0, sanitario: 0 };
  locais.forEach((l) => {
    totais[secaoCategoria(l.secao)] += l.metragemTotal;
  });
  return totais;
}
async function ensureVarricaoFotosTable() {
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
function registerVarricaoRoutes(app) {
  app.get("/api/varricao/locais", requireAuth, async (req, res) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT * FROM varricao_locais ORDER BY regiao, nome`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar locais de varri\xE7\xE3o" });
    }
  });
  app.post("/api/varricao/locais", requireAuth, async (req, res) => {
    try {
      const {
        nome,
        complemento,
        regiao,
        tipo,
        secao,
        metragemUnica,
        frequencia,
        diasSemana,
        lat,
        lng
      } = req.body;
      if (!nome || !String(nome).trim()) {
        return res.status(400).json({ error: "Nome do local \xE9 obrigat\xF3rio" });
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
          lat != null && lng != null ? "manual" : "pendente"
        ]
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error("Erro ao criar local de varri\xE7\xE3o:", error);
      res.status(500).json({ error: "Erro ao criar local" });
    }
  });
  app.patch("/api/varricao/locais/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const campos = {
        nome: "nome",
        complemento: "complemento",
        regiao: "regiao",
        tipo: "tipo",
        secao: "secao",
        metragemUnica: "metragem_unica",
        frequencia: "frequencia",
        lat: "lat",
        lng: "lng",
        geocodeStatus: "geocode_status",
        ativo: "ativo"
      };
      const sets = [];
      const vals = [];
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
      if (!rows.length) return res.status(404).json({ error: "Local n\xE3o encontrado" });
      res.json(rows[0]);
    } catch (error) {
      console.error("Erro ao atualizar local de varri\xE7\xE3o:", error);
      res.status(500).json({ error: "Erro ao atualizar local" });
    }
  });
  app.delete("/api/varricao/locais/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rowCount } = await pool.query("DELETE FROM varricao_locais WHERE id=$1", [id]);
      if (!rowCount) return res.status(404).json({ error: "Local n\xE3o encontrado" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir local" });
    }
  });
  app.get("/api/varricao/ordens/preview", requireAuth, async (req, res) => {
    try {
      const mes = String(req.query.mes ?? "");
      const m = mes.match(/^(\d{4})-(\d{2})$/);
      if (!m) return res.status(400).json({ error: "Informe o m\xEAs no formato YYYY-MM" });
      const ano = parseInt(m[1]), mesNum = parseInt(m[2]);
      const categoria = String(req.query.categoria ?? "");
      if (categoria !== "varricao" && categoria !== "lavacao") {
        return res.status(400).json({ error: "Informe a categoria: varricao ou lavacao" });
      }
      const referenciaId = req.query.referenciaId ? parseInt(String(req.query.referenciaId)) : void 0;
      const pool = getPool();
      const { ids: idsBase, referencia } = await idsBaseParaNovaOrdem(pool, categoria, referenciaId);
      const secoesDaCategoria = SECOES_POR_CATEGORIA[categoria];
      const { rows: locaisRaw } = idsBase ? await pool.query(
        "SELECT * FROM varricao_locais WHERE id = ANY($1::int[]) AND ativo IS NOT FALSE ORDER BY regiao, nome",
        [idsBase]
      ) : await pool.query(
        "SELECT * FROM varricao_locais WHERE secao = ANY($1::text[]) AND ativo IS NOT FALSE ORDER BY regiao, nome",
        [secoesDaCategoria]
      );
      const locais = calcularLocaisDoMes(locaisRaw, ano, mesNum);
      const duplicatas = detectarDuplicatas(locais);
      const totalMetragem = locais.reduce((s, l) => s + l.metragemTotal, 0);
      const { rows: existente } = await pool.query(
        "SELECT id, numero, status FROM varricao_ordens WHERE mes_referencia=$1 AND categoria=$2",
        [mes, categoria]
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
        referenciaUsada: referencia
      });
    } catch (error) {
      console.error("Erro ao gerar pr\xE9via da OS de varri\xE7\xE3o:", error);
      res.status(500).json({ error: "Erro ao calcular a pr\xE9via" });
    }
  });
  app.get("/api/varricao/config", requireAuth, async (req, res) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query("SELECT * FROM varricao_config WHERE id=1");
      res.json(rows[0] ?? { metragem_maxima_varricao: null, metragem_maxima_lavacao: null });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar configura\xE7\xE3o" });
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
      res.status(500).json({ error: "Erro ao salvar configura\xE7\xE3o" });
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
      res.status(500).json({ error: "Erro ao buscar ordens de servi\xE7o" });
    }
  });
  app.get("/api/varricao/ordens/combinado", requireAuth, async (req, res) => {
    try {
      const mes = String(req.query.mes ?? "");
      const m = mes.match(/^(\d{4})-(\d{2})$/);
      if (!m) return res.status(400).json({ error: "Informe o m\xEAs no formato YYYY-MM" });
      const ano = parseInt(m[1]), mesNum = parseInt(m[2]);
      const pool = getPool();
      const { rows: ordensDoMes } = await pool.query(
        `SELECT * FROM varricao_ordens WHERE mes_referencia=$1 AND categoria IN ('varricao','lavacao')`,
        [mes]
      );
      const ordemVarricao = ordensDoMes.find((o) => o.categoria === "varricao") ?? null;
      const ordemLavacao = ordensDoMes.find((o) => o.categoria === "lavacao") ?? null;
      const faltando = [];
      if (!ordemVarricao || ordemVarricao.status !== "finalizada") faltando.push("Varri\xE7\xE3o");
      if (!ordemLavacao || ordemLavacao.status !== "finalizada") faltando.push("Lava\xE7\xE3o");
      if (faltando.length) {
        return res.status(400).json({
          error: `Finalize a OS de ${faltando.join(" e ")} deste m\xEAs antes de gerar o documento combinado.`,
          faltando
        });
      }
      const [{ rows: locaisVarricaoRaw }, { rows: locaisLavacaoRaw }] = await Promise.all([
        pool.query("SELECT * FROM varricao_ordens_locais WHERE ordem_id=$1", [ordemVarricao.id]),
        pool.query("SELECT * FROM varricao_ordens_locais WHERE ordem_id=$1", [ordemLavacao.id])
      ]);
      const mapear = (l) => ({
        localId: l.local_id,
        nome: l.nome,
        complemento: l.complemento,
        regiao: l.regiao,
        tipo: l.tipo,
        secao: l.secao,
        metragemUnica: l.metragem_unica != null ? Number(l.metragem_unica) : null,
        dias: l.dias,
        diasTexto: l.dias_texto,
        metragemTotal: l.metragem_total != null ? Number(l.metragem_total) : 0
      });
      const { rows: sanitariosRaw } = await pool.query(
        "SELECT * FROM varricao_locais WHERE secao = ANY($1::text[]) AND ativo IS NOT FALSE",
        [SECOES_POR_CATEGORIA.sanitario]
      );
      const locaisSanitarios = calcularLocaisDoMes(sanitariosRaw, ano, mesNum);
      const locais = [
        ...locaisVarricaoRaw.map(mapear),
        ...locaisLavacaoRaw.map(mapear),
        ...locaisSanitarios
      ];
      const totalMetragem = locais.reduce((s, l) => s + l.metragemTotal, 0);
      res.json({
        mesReferencia: mes,
        ordem: {
          numero: `Varri\xE7\xE3o ${ordemVarricao.numero} \xB7 Lava\xE7\xE3o ${ordemLavacao.numero}`,
          mes_referencia: mes,
          data_emissao: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          emitido_por: req.session.userName ?? null,
          observacao: null,
          status: "finalizada",
          finalizado_por: null,
          finalizado_em: null,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        locais,
        subtotaisRegiao: subtotais(locais, "regiao"),
        subtotaisSecao: subtotais(locais, "secao"),
        totaisPorCategoria: totaisPorCategoria(locais),
        totalLocais: locais.length,
        totalMetragem
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
      if (!ordens.length) return res.status(404).json({ error: "Ordem de servi\xE7o n\xE3o encontrada" });
      const { rows: locaisRaw } = await pool.query(
        "SELECT * FROM varricao_ordens_locais WHERE ordem_id=$1 ORDER BY regiao, nome",
        [id]
      );
      const locais = locaisRaw.map((l) => ({
        localId: l.local_id,
        nome: l.nome,
        complemento: l.complemento,
        regiao: l.regiao,
        tipo: l.tipo,
        secao: l.secao,
        metragemUnica: l.metragem_unica != null ? Number(l.metragem_unica) : null,
        dias: l.dias,
        diasTexto: l.dias_texto,
        metragemTotal: l.metragem_total != null ? Number(l.metragem_total) : 0
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
        totalMetragem
      });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar ordem de servi\xE7o" });
    }
  });
  app.post("/api/varricao/ordens", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const { numero, mesReferencia, categoria, dataEmissao, observacao, locais: locaisEscolhidos } = req.body;
      if (!numero || !mesReferencia || !dataEmissao) {
        return res.status(400).json({ error: "N\xFAmero, m\xEAs de refer\xEAncia e data de emiss\xE3o s\xE3o obrigat\xF3rios" });
      }
      if (categoria !== "varricao" && categoria !== "lavacao") {
        return res.status(400).json({ error: "Categoria inv\xE1lida \u2014 deve ser varricao ou lavacao" });
      }
      if (!Array.isArray(locaisEscolhidos) || locaisEscolhidos.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos um local para esta ordem de servi\xE7o" });
      }
      const mMes = String(mesReferencia).match(/^(\d{4})-(\d{2})$/);
      if (!mMes) return res.status(400).json({ error: "M\xEAs de refer\xEAncia inv\xE1lido" });
      const diasUteisDoMes = diasDoMesParaLocal(
        { frequencia: "diario", dias_semana: null },
        parseInt(mMes[1]),
        parseInt(mMes[2])
      );
      const pool = getPool();
      const { rows: jaExiste } = await pool.query(
        "SELECT id, numero FROM varricao_ordens WHERE mes_referencia=$1 AND categoria=$2",
        [mesReferencia, categoria]
      );
      if (jaExiste.length) {
        return res.status(409).json({
          error: `J\xE1 existe a OS ${jaExiste[0].numero} para este m\xEAs/categoria. Edite-a em vez de criar outra.`,
          ordemExistenteId: jaExiste[0].id
        });
      }
      const secoesPermitidas = new Set(SECOES_POR_CATEGORIA[categoria]);
      const idsUnicos = Array.from(new Set(locaisEscolhidos.map((l) => Number(l.localId))));
      const { rows: locaisRaw } = await pool.query(
        "SELECT * FROM varricao_locais WHERE id = ANY($1::int[])",
        [idsUnicos]
      );
      const porId = new Map(locaisRaw.map((l) => [l.id, l]));
      const locais = [];
      for (const item of locaisEscolhidos) {
        const local = porId.get(Number(item.localId));
        if (!local || !secoesPermitidas.has(local.secao)) continue;
        const dias = Array.isArray(item.dias) ? item.dias.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31).sort((a, b) => a - b) : [];
        if (dias.length === 0) continue;
        const metragemUnica = local.metragem_unica != null ? Number(local.metragem_unica) : null;
        const ehDiarioCompleto = dias.length === diasUteisDoMes.length && dias.every((d, i) => d === diasUteisDoMes[i]);
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
          metragemTotal: metragemUnica != null ? metragemUnica * dias.length : 0
        });
      }
      if (locais.length === 0) {
        return res.status(400).json({ error: "Nenhum local v\xE1lido informado" });
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
            ordem.id,
            l.localId,
            l.nome,
            l.complemento,
            l.regiao,
            l.tipo,
            l.secao,
            l.metragemUnica,
            JSON.stringify(l.dias),
            l.diasTexto,
            l.metragemTotal
          ]
        );
      }
      res.status(201).json(ordem);
    } catch (error) {
      console.error("Erro ao emitir ordem de servi\xE7o de varri\xE7\xE3o:", error);
      res.status(500).json({ error: "Erro ao emitir a ordem de servi\xE7o" });
    }
  });
  app.patch("/api/varricao/ordens/:id", requireRole("admin", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { numero, dataEmissao, observacao, locais: locaisEscolhidos } = req.body;
      if (!Array.isArray(locaisEscolhidos) || locaisEscolhidos.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos um local para esta ordem de servi\xE7o" });
      }
      const pool = getPool();
      const { rows: existentes } = await pool.query("SELECT * FROM varricao_ordens WHERE id=$1", [id]);
      if (!existentes.length) return res.status(404).json({ error: "Ordem de servi\xE7o n\xE3o encontrada" });
      if (existentes[0].status === "finalizada") {
        return res.status(400).json({
          error: "Esta OS j\xE1 foi finalizada e n\xE3o pode mais ser editada diretamente. Ajustes durante o m\xEAs precisam de outro processo."
        });
      }
      const mesReferencia = existentes[0].mes_referencia;
      const categoriaDaOrdem = existentes[0].categoria;
      const secoesPermitidas = new Set(SECOES_POR_CATEGORIA[categoriaDaOrdem]);
      const mMes = String(mesReferencia).match(/^(\d{4})-(\d{2})$/);
      const diasUteisDoMes = diasDoMesParaLocal(
        { frequencia: "diario", dias_semana: null },
        parseInt(mMes[1]),
        parseInt(mMes[2])
      );
      const idsUnicos = Array.from(new Set(locaisEscolhidos.map((l) => Number(l.localId))));
      const { rows: locaisRaw } = await pool.query(
        "SELECT * FROM varricao_locais WHERE id = ANY($1::int[])",
        [idsUnicos]
      );
      const porId = new Map(locaisRaw.map((l) => [l.id, l]));
      const locais = [];
      for (const item of locaisEscolhidos) {
        const local = porId.get(Number(item.localId));
        if (!local || !secoesPermitidas.has(local.secao)) continue;
        const dias = Array.isArray(item.dias) ? item.dias.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31).sort((a, b) => a - b) : [];
        if (dias.length === 0) continue;
        const metragemUnica = local.metragem_unica != null ? Number(local.metragem_unica) : null;
        const ehDiarioCompleto = dias.length === diasUteisDoMes.length && dias.every((d, i) => d === diasUteisDoMes[i]);
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
          metragemTotal: metragemUnica != null ? metragemUnica * dias.length : 0
        });
      }
      if (locais.length === 0) {
        return res.status(400).json({ error: "Nenhum local v\xE1lido informado" });
      }
      const sets = [];
      const vals = [];
      if (numero !== void 0) {
        vals.push(numero);
        sets.push(`numero=$${vals.length}`);
      }
      if (dataEmissao !== void 0) {
        vals.push(dataEmissao);
        sets.push(`data_emissao=$${vals.length}`);
      }
      if (observacao !== void 0) {
        vals.push(observacao || null);
        sets.push(`observacao=$${vals.length}`);
      }
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
            id,
            l.localId,
            l.nome,
            l.complemento,
            l.regiao,
            l.tipo,
            l.secao,
            l.metragemUnica,
            JSON.stringify(l.dias),
            l.diasTexto,
            l.metragemTotal
          ]
        );
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao atualizar ordem de servi\xE7o de varri\xE7\xE3o:", error);
      res.status(500).json({ error: "Erro ao atualizar a ordem de servi\xE7o" });
    }
  });
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
        return res.status(400).json({ error: "OS n\xE3o encontrada ou j\xE1 finalizada" });
      }
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Erro ao finalizar a ordem de servi\xE7o" });
    }
  });
  app.delete("/api/varricao/ordens/:id", requireRole("admin", "gestor", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rowCount } = await pool.query("DELETE FROM varricao_ordens WHERE id=$1", [id]);
      if (!rowCount) return res.status(404).json({ error: "Ordem de servi\xE7o n\xE3o encontrada" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir ordem de servi\xE7o" });
    }
  });
  app.post("/api/varricao/fotos", requireAuth, upload.single("photo"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Nenhuma foto enviada" });
      const localId = parseInt(req.body.localId);
      if (!localId) return res.status(400).json({ error: "Local \xE9 obrigat\xF3rio" });
      const dataServico = req.body.dataServico || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const lat = req.body.lat ? parseFloat(req.body.lat) : null;
      const lng = req.body.lng ? parseFloat(req.body.lng) : null;
      const pool = getPool();
      const { rows: locais } = await pool.query(
        "SELECT id FROM varricao_locais WHERE id=$1",
        [localId]
      );
      if (!locais.length) return res.status(404).json({ error: "Local n\xE3o encontrado" });
      const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
      const filePath = `varricao/${localId}/${Date.now()}.${ext}`;
      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage.from("fotos").upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
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
      console.error("Erro no upload de foto de varri\xE7\xE3o:", error);
      res.status(500).json({ error: "Erro ao enviar a foto" });
    }
  });
  app.delete("/api/varricao/fotos/:id", requireRole("admin", "gestor", "fiscal"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pool = getPool();
      const { rows } = await pool.query("SELECT url FROM varricao_fotos WHERE id=$1", [id]);
      if (!rows.length) return res.status(404).json({ error: "Foto n\xE3o encontrada" });
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
      console.error("Erro ao excluir foto de varri\xE7\xE3o:", error);
      res.status(500).json({ error: "Erro ao excluir a foto" });
    }
  });
  app.get("/api/varricao/fotos", requireAuth, async (req, res) => {
    try {
      const conds = [];
      const vals = [];
      if (req.query.dataInicio && req.query.dataFim) {
        vals.push(String(req.query.dataInicio), String(req.query.dataFim));
        conds.push(`f.data_servico BETWEEN $1 AND $2`);
      } else {
        const data = String(req.query.data ?? (/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
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

// server/routes.ts
async function registerRoutes(app) {
  await ensureSetoresTable();
  await ensureUsersSetorColumn();
  await ensureUsersContratoColumn();
  await ensureAdminExists();
  await ensureAuditLogTable();
  await ensureDemandasTable();
  await ensureNotificacoesTable();
  await ensureSolicitantesTable();
  await ensureContratoConfigTable();
  await ensureVarricaoLocaisTable();
  await ensureVarricaoFotosTable();
  await ensureVarricaoOrdensTable();
  await ensureVarricaoConfigTable();
  app.use((req, res, next) => {
    if (req.session?.userRole === "encarregado" && req.path.startsWith("/api/")) {
      const contrato = req.session.userContrato || "";
      let permitido = req.path.startsWith("/api/auth/");
      if (!permitido && contrato === "varricao") {
        permitido = req.path === "/api/varricao/locais" && req.method === "GET" || req.path.startsWith("/api/varricao/fotos");
      }
      if (!permitido && contrato.startsWith("rocagem")) {
        permitido = req.method === "GET" && (req.path.startsWith("/api/areas") || req.path.startsWith("/api/ordens")) || req.method === "POST" && /^\/api\/areas\/\d+\/photos$/.test(req.path) || req.method === "POST" && /^\/api\/areas\/\d+\/registrar-rocagem$/.test(req.path);
      }
      if (!permitido) {
        return res.status(403).json({ error: "Acesso restrito ao contrato do encarregado" });
      }
    }
    next();
  });
  app.use((req, res, next) => {
    if (req.session?.userRole === "demo" && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && req.path.startsWith("/api/") && !req.path.startsWith("/api/auth/")) {
      if (req.method === "DELETE") {
        return res.json({ success: true, demo: true });
      }
      return res.status(req.method === "POST" ? 201 : 200).json({
        id: 99999,
        demo: true,
        success: true,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    next();
  });
  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerRocagemRoutes(app);
  registerAuditRoutes(app);
  registerDemandasRoutes(app);
  registerVarricaoRoutes(app);
  registerSetoresRoutes(app);
}

// server/vite.ts
import express from "express";
import fs2 from "fs";
import path2 from "path";
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app, server) {
  const { createServer: createViteServer, createLogger } = await import("vite");
  const { nanoid } = await import("nanoid");
  const viteLogger = createLogger();
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/app.ts
function isProduction() {
  return process.env.NODE_ENV === "production";
}
function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  if (isProduction()) {
    throw new Error("SESSION_SECRET is required in production");
  }
  return "zeladoria-dev-secret";
}
function createSessionStore() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (isProduction()) {
      throw new Error("DATABASE_URL is required in production");
    }
    return void 0;
  }
  const PgStore = connectPgSimple(session);
  return new PgStore({
    conString: databaseUrl,
    createTableIfMissing: true
  });
}
function registerBaseMiddleware(app) {
  if (isProduction()) {
    app.set("trust proxy", 1);
  }
  app.use(
    express2.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express2.urlencoded({ extended: false }));
  app.use(
    session({
      store: createSessionStore(),
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1e3,
        httpOnly: true,
        secure: isProduction(),
        sameSite: "lax"
      }
    })
  );
  app.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    let capturedJsonResponse;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path3.startsWith("/api")) {
        let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "\u2026";
        }
        log(logLine);
      }
    });
    next();
  });
}
function registerErrorHandler(app) {
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
}
async function configureApp(app, options = {}) {
  registerBaseMiddleware(app);
  await registerRoutes(app);
  registerErrorHandler(app);
  if (options.serveClient) {
    if (app.get("env") === "development") {
      if (!options.server) {
        throw new Error("HTTP server is required to run Vite in development");
      }
      await setupVite(app, options.server);
    } else {
      serveStatic(app);
    }
  }
  return app;
}
async function createApp(options = {}) {
  const app = express2();
  return configureApp(app, options);
}

// api/index.ts
var appPromise;
function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveClient: false }).catch((err) => {
      console.error("=== ERRO FATAL NA INICIALIZA\xC7\xC3O ===");
      console.error(err);
      appPromise = void 0;
      throw err;
    });
  }
  return appPromise;
}
async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error("=== ERRO NO HANDLER ===", err);
    res.status(500).json({
      error: "Erro na inicializa\xE7\xE3o do servidor",
      message: err?.message || String(err),
      stack: process.env.NODE_ENV !== "production" ? err?.stack : void 0
    });
  }
}
export {
  handler as default
};
