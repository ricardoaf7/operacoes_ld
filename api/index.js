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
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var userSchema = z.object({
  id: z.number(),
  nome: z.string(),
  email: z.string().email(),
  senha: z.string(),
  role: z.enum(["admin", "gestor", "fiscal"]),
  ativo: z.boolean().default(true)
});
var insertUserSchema = userSchema.omit({ id: true });
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
      { id: 1001, tipo: "ROT", endereco: "Av. Henrique Mansano x Av. Lucia Helena Gon\xE7alves Vianna (Sanepar)", servico: "Manuten\xE7\xE3o", lat: -23.282252, lng: -51.15512, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1002, tipo: "ROT", endereco: "Av. Maring\xE1 x Rua Prof. Joaquim de Matos Barreto (Aterro Maior)", servico: "Irriga\xE7\xE3o", lat: -23.324934, lng: -51.176449, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1003, tipo: "ROT", endereco: "Pra\xE7a Rocha Pombo", servico: "Manuten\xE7\xE3o", lat: -23.3142, lng: -51.1578, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1004, tipo: "ROT", endereco: "Parque Arthur Thomas", servico: "Irriga\xE7\xE3o", lat: -23.3167, lng: -51.1789, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1005, tipo: "ROT", endereco: "Jardim Bot\xE2nico", servico: "Manuten\xE7\xE3o", lat: -23.3289, lng: -51.1567, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false }
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

// server/routes.ts
import { z as z2 } from "zod";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";
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
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "N\xE3o autenticado" });
  }
  next();
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
async function registerRoutes(app) {
  await ensureAdminExists();
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
      res.json({
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role
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
      role: user.role
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
  app.get("/api/users", requireRole("admin"), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map((u) => ({ id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo })));
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar usu\xE1rios" });
    }
  });
  app.post("/api/users", requireRole("admin"), async (req, res) => {
    try {
      const { nome, email, senha, role } = req.body;
      if (!nome || !email || !senha || !role) {
        return res.status(400).json({ error: "Todos os campos s\xE3o obrigat\xF3rios" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "Email j\xE1 cadastrado" });
      }
      const hashedPassword = await bcrypt.hash(senha, 10);
      const user = await storage.createUser({
        nome,
        email,
        senha: hashedPassword,
        role,
        ativo: true
      });
      res.json({ id: user.id, nome: user.nome, email: user.email, role: user.role, ativo: user.ativo });
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar usu\xE1rio" });
    }
  });
  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, email, senha, role, ativo } = req.body;
      const updateData = {};
      if (nome !== void 0) updateData.nome = nome;
      if (email !== void 0) updateData.email = email;
      if (role !== void 0) updateData.role = role;
      if (ativo !== void 0) updateData.ativo = ativo;
      if (senha) updateData.senha = await bcrypt.hash(senha, 10);
      const user = await storage.updateUser(id, updateData);
      if (!user) {
        return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado" });
      }
      res.json({ id: user.id, nome: user.nome, email: user.email, role: user.role, ativo: user.ativo });
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
  app.get("/api/areas/rocagem", async (req, res) => {
    try {
      const areas = await storage.getAllAreas("rocagem");
      res.json(areas);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ro\xE7agem areas" });
    }
  });
  app.get("/api/areas/light", async (req, res) => {
    try {
      const boundsParam = req.query.bounds;
      let areas = await storage.getAllAreas("rocagem");
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
  app.get("/api/areas/search", async (req, res) => {
    try {
      const query = (req.query.q || "").trim();
      if (!query) {
        res.json([]);
        return;
      }
      const results = await storage.searchAreas(query, "rocagem", 50);
      res.json(results);
    } catch (error) {
      console.error("Error searching areas:", error);
      res.status(500).json({ error: "Failed to search areas" });
    }
  });
  app.get("/api/areas/by-period", async (req, res) => {
    try {
      const { from, to, details, lote } = req.query;
      if (!from || !to || typeof from !== "string" || typeof to !== "string") {
        return res.status(400).json({ error: "Par\xE2metros 'from' e 'to' s\xE3o obrigat\xF3rios (YYYY-MM-DD)" });
      }
      const allAreas = await storage.getAllAreas("rocagem");
      const fromDate = /* @__PURE__ */ new Date(from + "T00:00:00");
      const toDate = /* @__PURE__ */ new Date(to + "T23:59:59");
      const matchingAreas = allAreas.filter((area) => {
        if (!area.ultimaRocagem) return false;
        const mowDate = new Date(area.ultimaRocagem);
        if (mowDate < fromDate || mowDate > toDate) return false;
        if (lote && typeof lote === "string" && lote !== "all") {
          const loteNum = parseInt(lote);
          if (area.lote !== loteNum) return false;
        }
        return true;
      });
      if (details === "true") {
        const detailedAreas = matchingAreas.map((area) => ({
          id: area.id,
          endereco: area.endereco || "",
          bairro: area.bairro || "",
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
  app.patch("/api/config", requireAuth, async (req, res) => {
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
        const lastMowing = new Date(data.ultimaRocagem);
        lastMowing.setHours(0, 0, 0, 0);
        const nextMowingDate = new Date(lastMowing);
        nextMowingDate.setDate(lastMowing.getDate() + 60);
        const proximaPrevisao = nextMowingDate.toISOString().split("T")[0];
        const dataComTimestamp = {
          ...data,
          dataRegistro: (/* @__PURE__ */ new Date()).toISOString(),
          manualSchedule: false,
          proximaPrevisao,
          status: "Conclu\xEDdo"
        };
        const updatedArea2 = await storage.updateArea(areaId, dataComTimestamp);
        if (!updatedArea2) {
          res.status(404).json({ error: "Area not found" });
          return;
        }
        await storage.addHistoryEntry(areaId, {
          date: data.ultimaRocagem,
          type: "completed",
          status: "Conclu\xEDdo",
          observation: data.registradoPor ? `Ro\xE7agem conclu\xEDda por ${data.registradoPor}` : "Ro\xE7agem conclu\xEDda"
        });
        const areaComHistorico = await storage.getAreaById(areaId);
        res.json(areaComHistorico);
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
      res.json(updatedArea);
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
      if (req.user?.role !== "admin") {
        res.status(403).json({ error: "Apenas administradores podem excluir hist\xF3rico" });
        return;
      }
      const areaId = parseInt(req.params.id);
      const idx = parseInt(req.params.index);
      const area = await storage.getAreaById(areaId);
      if (!area) {
        res.status(404).json({ error: "Area not found" });
        return;
      }
      const newHistory = area.history.filter((_, i) => i !== idx);
      const updated = await storage.updateArea(areaId, { history: newHistory });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to delete history entry" });
    }
  });
  app.patch("/api/areas/:id/history/:index", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
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
      const newHistory = area.history.map(
        (h, i) => i === idx ? { ...h, ...entry } : h
      );
      const updated = await storage.updateArea(areaId, { history: newHistory });
      res.json(updated);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update history entry" });
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
    configFile: true,
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
