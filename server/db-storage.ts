import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, inArray, or, ilike, and, sql, gt, lt, desc } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { ServiceArea, Team, AppConfig, ExportHistory, InsertExportHistory, User, InsertUser } from "@shared/schema";
import { serviceAreas, teams, appConfig, exportHistory, users } from "@shared/schema";
import type { IStorage } from "./storage";

neonConfig.webSocketConstructor = ws;

export class DbStorage implements IStorage {
  private db;
  private pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool);
    this.ensureExtensions();
  }

  private async ensureExtensions() {
    try {
      await this.db.execute(sql`CREATE EXTENSION IF NOT EXISTS unaccent`);
    } catch (e) {
      console.warn("Could not create unaccent extension:", e);
    }
  }

  async getAllAreas(serviceType: string): Promise<ServiceArea[]> {
    const results = await this.db
      .select()
      .from(serviceAreas)
      .where(eq(serviceAreas.servico, serviceType));
    
    return results.map(this.mapDbAreaToServiceArea);
  }

  async getAreaById(id: number): Promise<ServiceArea | undefined> {
    const results = await this.db
      .select()
      .from(serviceAreas)
      .where(eq(serviceAreas.id, id))
      .limit(1);
    
    if (results.length === 0) return undefined;
    return this.mapDbAreaToServiceArea(results[0]);
  }

  async createArea(data: Omit<ServiceArea, 'id'>): Promise<ServiceArea> {
    const insertData: any = {
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
      dataRegistro: data.dataRegistro ? new Date(data.dataRegistro) : null,
    };

    const results = await this.db
      .insert(serviceAreas)
      .values(insertData)
      .returning();

    return this.mapDbAreaToServiceArea(results[0]);
  }

  async searchAreas(query: string, serviceType: string, limit: number = 50): Promise<ServiceArea[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    
    const results = await this.db
      .select()
      .from(serviceAreas)
      .where(
        and(
          eq(serviceAreas.servico, serviceType),
          or(
            sql`unaccent(lower(${serviceAreas.endereco})) LIKE unaccent(${searchTerm})`,
            sql`unaccent(lower(${serviceAreas.bairro})) LIKE unaccent(${searchTerm})`,
            sql`CAST(${serviceAreas.lote} AS TEXT) LIKE ${searchTerm}`
          )
        )
      )
      .limit(limit);
    
    return results.map(this.mapDbAreaToServiceArea);
  }

  async updateAreaStatus(id: number, status: string): Promise<ServiceArea | undefined> {
    const results = await this.db
      .update(serviceAreas)
      .set({ status, updatedAt: new Date() })
      .where(eq(serviceAreas.id, id))
      .returning();
    
    if (results.length === 0) return undefined;
    return this.mapDbAreaToServiceArea(results[0]);
  }

  async updateAreaSchedule(id: number, scheduledDate: string): Promise<ServiceArea | undefined> {
    const results = await this.db
      .update(serviceAreas)
      .set({ scheduledDate, updatedAt: new Date() })
      .where(eq(serviceAreas.id, id))
      .returning();
    
    if (results.length === 0) return undefined;
    return this.mapDbAreaToServiceArea(results[0]);
  }

  async updateAreaPolygon(id: number, polygon: Array<{ lat: number; lng: number }>): Promise<ServiceArea | undefined> {
    const results = await this.db
      .update(serviceAreas)
      .set({ polygon: polygon as any, updatedAt: new Date() })
      .where(eq(serviceAreas.id, id))
      .returning();
    
    if (results.length === 0) return undefined;
    return this.mapDbAreaToServiceArea(results[0]);
  }

  async updateAreaPosition(id: number, lat: number, lng: number): Promise<ServiceArea | undefined> {
    const results = await this.db
      .update(serviceAreas)
      .set({ lat, lng, updatedAt: new Date() })
      .where(eq(serviceAreas.id, id))
      .returning();
    
    if (results.length === 0) return undefined;
    return this.mapDbAreaToServiceArea(results[0]);
  }

  async updateArea(id: number, data: Partial<ServiceArea>): Promise<ServiceArea | undefined> {
    // Mapear camelCase para snake_case para corresponder ao schema do banco
    const updateData: any = { updatedAt: new Date() };
    
    if (data.endereco !== undefined) updateData.endereco = data.endereco;
    if (data.bairro !== undefined) updateData.bairro = data.bairro;
    if (data.metragem_m2 !== undefined) updateData.metragem_m2 = data.metragem_m2;
    if (data.lote !== undefined) updateData.lote = data.lote;
    if (data.tipo !== undefined) updateData.tipo = data.tipo;
    if (data.ultimaRocagem !== undefined) updateData.ultimaRocagem = data.ultimaRocagem;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.proximaPrevisao !== undefined) updateData.proximaPrevisao = data.proximaPrevisao;
    if (data.polygon !== undefined) updateData.polygon = data.polygon;
    if (data.history !== undefined) updateData.history = data.history;
    if (data.registradoPor !== undefined) updateData.registradoPor = data.registradoPor;
    if (data.manualSchedule !== undefined) updateData.manualSchedule = data.manualSchedule;
    if (data.fotos !== undefined) updateData.fotos = data.fotos;
    if (data.dataRegistro !== undefined) {
      // Converter string ISO para Date object para o campo timestamp no banco
      updateData.dataRegistro = typeof data.dataRegistro === 'string' 
        ? new Date(data.dataRegistro) 
        : data.dataRegistro;
    }
    
    const results = await this.db
      .update(serviceAreas)
      .set(updateData)
      .where(eq(serviceAreas.id, id))
      .returning();
    
    if (results.length === 0) return undefined;
    return this.mapDbAreaToServiceArea(results[0]);
  }

  async deleteArea(id: number): Promise<boolean> {
    const results = await this.db
      .delete(serviceAreas)
      .where(eq(serviceAreas.id, id))
      .returning();
    
    return results.length > 0;
  }

  async addHistoryEntry(
    areaId: number, 
    entry: { date: string; status: string; type?: 'completed' | 'forecast'; observation?: string }
  ): Promise<ServiceArea | undefined> {
    const area = await this.getAreaById(areaId);
    if (!area) return undefined;

    const updatedHistory = [...area.history, entry];
    
    const results = await this.db
      .update(serviceAreas)
      .set({ history: updatedHistory as any, updatedAt: new Date() })
      .where(eq(serviceAreas.id, areaId))
      .returning();
    
    if (results.length === 0) return undefined;
    return this.mapDbAreaToServiceArea(results[0]);
  }

  async getAllTeams(): Promise<Team[]> {
    const results = await this.db.select().from(teams);
    return results.map(this.mapDbTeamToTeam);
  }

  async getTeamById(id: number): Promise<Team | undefined> {
    const results = await this.db
      .select()
      .from(teams)
      .where(eq(teams.id, id))
      .limit(1);
    
    if (results.length === 0) return undefined;
    return this.mapDbTeamToTeam(results[0]);
  }

  async assignTeamToArea(teamId: number, areaId: number): Promise<Team | undefined> {
    const results = await this.db
      .update(teams)
      .set({ 
        currentAreaId: areaId, 
        status: "Assigned",
        updatedAt: new Date()
      })
      .where(eq(teams.id, teamId))
      .returning();
    
    if (results.length === 0) return undefined;
    return this.mapDbTeamToTeam(results[0]);
  }

  async getConfig(): Promise<AppConfig> {
    const results = await this.db.select().from(appConfig).limit(1);
    
    if (results.length === 0) {
      const defaultConfig = {
        mowingProductionRate: {
          lote1: 85000,
          lote2: 70000,
        },
        metaMensal: 3125000,
        metaLote1: 1562500,
        metaLote2: 1562500,
      };
      
      const jsonbPayload = {
        lote1: 85000,
        lote2: 70000,
        metaMensal: 3125000,
        metaLote1: 1562500,
        metaLote2: 1562500,
      };
      
      await this.db
        .insert(appConfig)
        .values({ mowingProductionRate: jsonbPayload as any })
        .returning();
      
      return defaultConfig;
    }
    
    const raw = results[0].mowingProductionRate as any;
    const metaLote1 = raw.metaLote1 ?? 1562500;
    const metaLote2 = raw.metaLote2 ?? 1562500;
    return {
      mowingProductionRate: { lote1: raw.lote1, lote2: raw.lote2 },
      metaMensal: raw.metaMensal ?? (metaLote1 + metaLote2),
      metaLote1,
      metaLote2,
    };
  }

  async updateConfig(config: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.getConfig();
    const updatedRate = {
      ...current.mowingProductionRate,
      ...(config.mowingProductionRate || {}),
    };
    const updatedMetaLote1 = config.metaLote1 ?? current.metaLote1 ?? 1562500;
    const updatedMetaLote2 = config.metaLote2 ?? current.metaLote2 ?? 1562500;
    const updatedMeta = config.metaMensal ?? (updatedMetaLote1 + updatedMetaLote2);
    
    const jsonbPayload = {
      ...updatedRate,
      metaMensal: updatedMeta,
      metaLote1: updatedMetaLote1,
      metaLote2: updatedMetaLote2,
    };
    
    await this.db
      .update(appConfig)
      .set({ 
        mowingProductionRate: jsonbPayload as any,
        updatedAt: new Date()
      });
    
    return {
      mowingProductionRate: { lote1: updatedRate.lote1, lote2: updatedRate.lote2 },
      metaMensal: updatedMeta,
      metaLote1: updatedMetaLote1,
      metaLote2: updatedMetaLote2,
    };
  }

  async registerDailyMowing(areaIds: number[], date: string, type: 'completed' | 'forecast' = 'completed'): Promise<void> {
    // Importar algoritmo de agendamento
    const { recalculateAfterCompletion } = await import('@shared/schedulingAlgorithm');
    
    // 1. Atualizar cada área baseado no tipo de registro
    for (const areaId of areaIds) {
      const area = await this.getAreaById(areaId);
      if (!area) continue;
      
      const newHistory = [
        ...(area.history || []),
        {
          date: date,
          status: type === 'completed' ? "Concluído" : "Previsto",
          type: type,
          observation: type === 'completed' ? "Roçagem concluída" : "Previsão de roçagem",
        }
      ];
      
      if (type === 'completed') {
        // Registro de conclusão: atualizar ultimaRocagem e status
        await this.db
          .update(serviceAreas)
          .set({
            ultimaRocagem: date,
            status: "Concluído",
            history: newHistory as any,
            updatedAt: new Date(),
          })
          .where(eq(serviceAreas.id, areaId));
      } else {
        // Registro de previsão: apenas adicionar no histórico
        await this.db
          .update(serviceAreas)
          .set({
            history: newHistory as any,
            updatedAt: new Date(),
          })
          .where(eq(serviceAreas.id, areaId));
      }
    }
    
    // 2. Se foi registro de conclusão, recalcular previsões
    if (type === 'completed') {
      // Buscar todas as áreas e configuração
      const allAreas = await this.getAllAreas('rocagem');
      const config = await this.getConfig();
      
      // 3. Recalcular previsões para lotes afetados
      const predictions = recalculateAfterCompletion(allAreas, areaIds, config);
      
      // 4. Atualizar previsões no banco
      for (const prediction of predictions) {
        await this.db
          .update(serviceAreas)
          .set({
            proximaPrevisao: prediction.proximaPrevisao,
            daysToComplete: prediction.daysToComplete,
            updatedAt: new Date(),
          })
          .where(eq(serviceAreas.id, prediction.areaId));
      }
    }
  }

  async clearSimulationData(serviceType: string): Promise<number> {
    const areas = await this.getAllAreas(serviceType);
    
    for (const area of areas) {
      await this.db
        .update(serviceAreas)
        .set({
          history: [] as any,
          status: "Pendente",
          ultimaRocagem: null,
          proximaPrevisao: null,
          updatedAt: new Date(),
        })
        .where(eq(serviceAreas.id, area.id));
    }
    
    return areas.length;
  }

  // Export History Methods
  async getLastExport(scope: string, type: 'full' | 'incremental'): Promise<ExportHistory | null> {
    const results = await this.db
      .select()
      .from(exportHistory)
      .where(
        and(
          eq(exportHistory.scope, scope),
          eq(exportHistory.exportType, type)
        )
      )
      .orderBy(desc(exportHistory.exportedAt))
      .limit(1);

    if (results.length === 0) return null;

    const record = results[0];
    return {
      id: record.id,
      scope: record.scope as 'service_areas' | 'teams' | 'app_config',
      exportType: record.exportType as 'full' | 'incremental',
      recordCount: record.recordCount,
      durationMs: record.durationMs ?? null,
      exportedAt: record.exportedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async recordExport(data: InsertExportHistory): Promise<ExportHistory> {
    const results = await this.db
      .insert(exportHistory)
      .values({
        scope: data.scope,
        exportType: data.exportType,
        recordCount: data.recordCount,
        durationMs: data.durationMs ?? null,
      })
      .returning();

    const record = results[0];
    return {
      id: record.id,
      scope: record.scope as 'service_areas' | 'teams' | 'app_config',
      exportType: record.exportType as 'full' | 'incremental',
      recordCount: record.recordCount,
      durationMs: record.durationMs ?? null,
      exportedAt: record.exportedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async getAreasModifiedSince(timestamp: Date): Promise<ServiceArea[]> {
    const results = await this.db
      .select()
      .from(serviceAreas)
      .where(
        and(
          eq(serviceAreas.servico, 'rocagem'),
          gt(serviceAreas.updatedAt, timestamp)
        )
      );

    return results.map(this.mapDbAreaToServiceArea);
  }

  async toggleExecutando(id: number, executando: boolean): Promise<ServiceArea | undefined> {
    const results = await this.db
      .update(serviceAreas)
      .set({ 
        executando, 
        executandoDesde: executando ? new Date() : null,
        updatedAt: new Date() 
      })
      .where(eq(serviceAreas.id, id))
      .returning();
    
    if (results.length === 0) return undefined;
    return this.mapDbAreaToServiceArea(results[0]);
  }

  async resetAllExecutando(): Promise<number> {
    const result = await this.db
      .update(serviceAreas)
      .set({ 
        executando: false, 
        executandoDesde: null,
        updatedAt: new Date() 
      })
      .where(eq(serviceAreas.executando, true))
      .returning();
    
    return result.length;
  }

  async resetStaleExecutando(todayDateStr: string): Promise<number> {
    const todayStart = new Date(todayDateStr + 'T00:00:00-03:00');
    const result = await this.db
      .update(serviceAreas)
      .set({
        executando: false,
        executandoDesde: null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(serviceAreas.executando, true),
          or(
            lt(serviceAreas.executandoDesde, todayStart),
            sql`${serviceAreas.executandoDesde} IS NULL`
          )
        )
      )
      .returning();

    return result.length;
  }

  private mapDbAreaToServiceArea(dbArea: any): ServiceArea {
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
      status: dbArea.status as "Pendente" | "Em Execução" | "Concluído",
      history: (dbArea.history as any) || [],
      polygon: dbArea.polygon as any,
      scheduledDate: dbArea.scheduledDate,
      proximaPrevisao: dbArea.proximaPrevisao,
      ultimaRocagem: dbArea.ultimaRocagem,
      manualSchedule: dbArea.manualSchedule ?? false,
      daysToComplete: dbArea.daysToComplete,
      servico: dbArea.servico,
      registradoPor: dbArea.registradoPor || null,
      dataRegistro: dbArea.dataRegistro ? dbArea.dataRegistro.toISOString() : null,
      fotos: (dbArea.fotos as any) || [],
      executando: dbArea.executando ?? false,
      executandoDesde: dbArea.executandoDesde ? dbArea.executandoDesde.toISOString() : null,
    };
  }

  private mapDbTeamToTeam(dbTeam: any): Team {
    return {
      id: dbTeam.id,
      service: dbTeam.service,
      type: dbTeam.type,
      lote: dbTeam.lote,
      status: dbTeam.status as "Idle" | "Assigned" | "Working",
      currentAreaId: dbTeam.currentAreaId,
      location: dbTeam.location as { lat: number; lng: number },
    };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (results.length === 0) return undefined;
    return this.mapDbUser(results[0]);
  }

  async getUserById(id: number): Promise<User | undefined> {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (results.length === 0) return undefined;
    return this.mapDbUser(results[0]);
  }

  async getAllUsers(): Promise<User[]> {
    const results = await this.db.select().from(users);
    return results.map(this.mapDbUser);
  }

  async createUser(data: InsertUser): Promise<User> {
    const results = await this.db
      .insert(users)
      .values({
        nome: data.nome,
        email: data.email,
        senha: data.senha,
        role: data.role,
        ativo: data.ativo ?? true,
      })
      .returning();
    return this.mapDbUser(results[0]);
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const updateData: any = {};
    if (data.nome !== undefined) updateData.nome = data.nome;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.senha !== undefined) updateData.senha = data.senha;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.ativo !== undefined) updateData.ativo = data.ativo;
    updateData.updatedAt = new Date();

    const results = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    if (results.length === 0) return undefined;
    return this.mapDbUser(results[0]);
  }

  async deleteUser(id: number): Promise<boolean> {
    const results = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    return results.length > 0;
  }

  private mapDbUser(dbUser: any): User {
    return {
      id: dbUser.id,
      nome: dbUser.nome,
      email: dbUser.email,
      senha: dbUser.senha,
      role: dbUser.role as "admin" | "gestor" | "fiscal",
      ativo: dbUser.ativo,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
