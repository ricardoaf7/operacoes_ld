import type { ServiceArea, Team, AppConfig, ExportHistory, InsertExportHistory, User, InsertUser } from "@shared/schema";

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export interface IStorage {
  // Service Areas
  getAllAreas(serviceType: string): Promise<ServiceArea[]>;
  getAreaById(id: number): Promise<ServiceArea | undefined>;
  createArea(data: Omit<ServiceArea, 'id'>): Promise<ServiceArea>;
  searchAreas(query: string, serviceType: string, limit?: number): Promise<ServiceArea[]>;
  updateAreaStatus(id: number, status: string): Promise<ServiceArea | undefined>;
  updateAreaSchedule(id: number, scheduledDate: string): Promise<ServiceArea | undefined>;
  updateAreaPolygon(id: number, polygon: Array<{ lat: number; lng: number }>): Promise<ServiceArea | undefined>;
  updateAreaPosition(id: number, lat: number, lng: number): Promise<ServiceArea | undefined>;
  updateArea(id: number, data: Partial<ServiceArea>): Promise<ServiceArea | undefined>;
  deleteArea(id: number): Promise<boolean>;
  addHistoryEntry(areaId: number, entry: { date: string; status: string; type?: 'completed' | 'forecast'; observation?: string }): Promise<ServiceArea | undefined>;
  registerDailyMowing(areaIds: number[], date: string, type: 'completed' | 'forecast'): Promise<void>;
  clearSimulationData(serviceType: string): Promise<number>;
  
  // Teams
  getAllTeams(): Promise<Team[]>;
  getTeamById(id: number): Promise<Team | undefined>;
  assignTeamToArea(teamId: number, areaId: number): Promise<Team | undefined>;
  
  // Configuration
  getConfig(): Promise<AppConfig>;
  updateConfig(config: Partial<AppConfig>): Promise<AppConfig>;
  
  // Executando (em execução diária)
  toggleExecutando(id: number, executando: boolean): Promise<ServiceArea | undefined>;
  resetAllExecutando(): Promise<number>;
  resetStaleExecutando(todayDateStr: string): Promise<number>;
  
  // Export History
  getLastExport(scope: string, type: 'full' | 'incremental'): Promise<ExportHistory | null>;
  recordExport(data: InsertExportHistory): Promise<ExportHistory>;
  getAreasModifiedSince(timestamp: Date): Promise<ServiceArea[]>;

  // Users
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
}

// Função legada de cálculo de agendamento - DEPRECADA
// Use shared/schedulingAlgorithm.ts para novos cálculos
async function calculateMowingScheduleWithHolidays(areas: ServiceArea[], config: AppConfig): Promise<void> {
  const { calculateMowingSchedule } = await import('@shared/schedulingAlgorithm');
  
  // Calcular para lote 1
  const lote1Results = calculateMowingSchedule(
    areas,
    1,
    config.mowingProductionRate.lote1,
    new Date()
  );
  
  // Calcular para lote 2
  const lote2Results = calculateMowingSchedule(
    areas,
    2,
    config.mowingProductionRate.lote2,
    new Date()
  );
  
  // Aplicar resultados às áreas
  const allResults = [...lote1Results, ...lote2Results];
  for (const result of allResults) {
    const area = areas.find(a => a.id === result.areaId);
    if (area) {
      area.proximaPrevisao = result.proximaPrevisao;
      area.daysToComplete = result.daysToComplete;
    }
  }
}

export class MemStorage implements IStorage {
  private rocagemAreas: ServiceArea[];
  private jardinsAreas: ServiceArea[];
  private teams: Team[];
  private config: AppConfig;

  constructor() {
    this.config = {
      mowingProductionRate: {
        lote1: 25000,
        lote2: 20000,
      },
    };

    this.rocagemAreas = this.initializeRocagemAreas();
    this.jardinsAreas = this.initializeJardinsAreas();
    this.teams = this.initializeTeams();

    // Nota: MemStorage é usado apenas para desenvolvimento
    // O cálculo automático de previsões agora usa o algoritmo com feriados
    // via registerDailyMowing() e o novo shared/schedulingAlgorithm.ts
  }

  private initializeRocagemAreas(): ServiceArea[] {
    const sampleAreas: ServiceArea[] = [
      { id: 1, ordem: 1, tipo: "area publica", endereco: "Av Jorge Casoni - Terminal Rodoviário", bairro: "Casoni", metragem_m2: 29184.98, lat: -23.3044206, lng: -51.1513729, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 2, ordem: 2, tipo: "praça", endereco: "Rua Carijós c/ Oraruana", bairro: "Paraná", metragem_m2: 2332.83, lat: -23.3045262, lng: -51.1480067, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 3, ordem: 3, tipo: "area publica", endereco: "Av Saul Elkind", bairro: "Lago Parque", metragem_m2: 15234.56, lat: -23.2987, lng: -51.1623, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 4, ordem: 4, tipo: "canteiro", endereco: "Av Madre Leônia Milito", bairro: "Centro", metragem_m2: 8765.43, lat: -23.3101, lng: -51.1628, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 5, ordem: 5, tipo: "area publica", endereco: "Praça Sete de Setembro", bairro: "Centro", metragem_m2: 12456.78, lat: -23.3099, lng: -51.1603, lote: 1, status: "Em Execução", history: [{ date: new Date().toISOString(), status: "Iniciado", observation: "Equipe 1 iniciou trabalho" }], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 6, ordem: 6, tipo: "praça", endereco: "Praça Rocha Pombo", bairro: "Vila Nova", metragem_m2: 9876.54, lat: -23.3142, lng: -51.1578, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 7, ordem: 7, tipo: "area publica", endereco: "Av Bandeirantes", bairro: "Bandeirantes", metragem_m2: 18765.43, lat: -23.2876, lng: -51.1456, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 8, ordem: 8, tipo: "canteiro", endereco: "Av Ayrton Senna", bairro: "Gleba Palhano", metragem_m2: 21234.56, lat: -23.2834, lng: -51.1823, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 9, ordem: 9, tipo: "area publica", endereco: "Parque Arthur Thomas", bairro: "Nova Londrina", metragem_m2: 45678.90, lat: -23.3167, lng: -51.1789, lote: 1, status: "Concluído", history: [{ date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), status: "Concluído" }], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 10, ordem: 10, tipo: "praça", endereco: "Praça Willie Davids", bairro: "Heimtal", metragem_m2: 7654.32, lat: -23.3234, lng: -51.1423, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      
      { id: 101, ordem: 1, tipo: "area publica", endereco: "Av Duque de Caxias", bairro: "Zona Sul", metragem_m2: 32145.67, lat: -23.3367, lng: -51.1534, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 102, ordem: 2, tipo: "canteiro", endereco: "Av Inglaterra", bairro: "Cinco Conjuntos", metragem_m2: 11234.56, lat: -23.3278, lng: -51.1745, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 103, ordem: 3, tipo: "praça", endereco: "Praça Maringá", bairro: "Cervejaria", metragem_m2: 8765.43, lat: -23.3189, lng: -51.1667, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 104, ordem: 4, tipo: "area publica", endereco: "Av JK", bairro: "Tucanos", metragem_m2: 19876.54, lat: -23.3445, lng: -51.1623, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 105, ordem: 5, tipo: "canteiro", endereco: "Av Higienópolis", bairro: "Higienópolis", metragem_m2: 14567.89, lat: -23.3123, lng: -51.1489, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 106, ordem: 6, tipo: "area publica", endereco: "Parque Guanabara", bairro: "Guanabara", metragem_m2: 28765.43, lat: -23.2989, lng: -51.1823, lote: 2, status: "Em Execução", history: [{ date: new Date().toISOString(), status: "Iniciado" }], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 107, ordem: 7, tipo: "praça", endereco: "Praça Santos Dumont", bairro: "Aeroporto", metragem_m2: 9876.54, lat: -23.3034, lng: -51.1378, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 108, ordem: 8, tipo: "area publica", endereco: "Av Tiradentes", bairro: "Centro", metragem_m2: 16543.21, lat: -23.3087, lng: -51.1645, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 109, ordem: 9, tipo: "canteiro", endereco: "Av Dez de Dezembro", bairro: "Centro", metragem_m2: 12345.67, lat: -23.3112, lng: -51.1590, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
      { id: 110, ordem: 10, tipo: "praça", endereco: "Praça Primeiro de Maio", bairro: "Ouro Branco", metragem_m2: 8901.23, lat: -23.3267, lng: -51.1501, lote: 2, status: "Concluído", history: [{ date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), status: "Concluído" }], polygon: null, scheduledDate: null, manualSchedule: false, fotos: [], executando: false },
    ];

    const tipos = ["area publica", "praça", "canteiro", "rotatória"];
    const bairros = ["Centro", "Zona Sul", "Gleba Palhano", "Higienópolis", "Casoni", "Bandeirantes", "Vila Nova", "Tucanos", "Heimtal", "Aeroporto"];
    const ruas = ["Av", "Rua", "Praça", "Travessa"];
    const nomes = ["das Flores", "Santos Dumont", "Brasil", "Pioneiros", "Industrial", "Comercial", "Residencial", "Jardim", "Parque", "Vila"];

    let idCounter = 200;
    for (let i = 0; i < 100; i++) {
      const lote = Math.random() > 0.5 ? 1 : 2;
      const area: ServiceArea = {
        id: idCounter++,
        ordem: i + 11,
        tipo: tipos[Math.floor(Math.random() * tipos.length)],
        endereco: `${ruas[Math.floor(Math.random() * ruas.length)]} ${nomes[Math.floor(Math.random() * nomes.length)]} ${i + 1}`,
        bairro: bairros[Math.floor(Math.random() * bairros.length)],
        metragem_m2: Math.floor(Math.random() * 40000) + 5000,
        lat: -23.31 + (Math.random() - 0.5) * 0.1,
        lng: -51.16 + (Math.random() - 0.5) * 0.1,
        lote,
        status: "Pendente",
        history: [],
        polygon: null,
        scheduledDate: null,
        manualSchedule: false,
        fotos: [],
        executando: false,
      };
      sampleAreas.push(area);
    }

    return sampleAreas;
  }

  private initializeJardinsAreas(): ServiceArea[] {
    return [
      { id: 1001, tipo: "ROT", endereco: "Av. Henrique Mansano x Av. Lucia Helena Gonçalves Vianna (Sanepar)", servico: "Manutenção", lat: -23.282252, lng: -51.155120, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1002, tipo: "ROT", endereco: "Av. Maringá x Rua Prof. Joaquim de Matos Barreto (Aterro Maior)", servico: "Irrigação", lat: -23.324934, lng: -51.176449, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1003, tipo: "ROT", endereco: "Praça Rocha Pombo", servico: "Manutenção", lat: -23.314200, lng: -51.157800, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1004, tipo: "ROT", endereco: "Parque Arthur Thomas", servico: "Irrigação", lat: -23.316700, lng: -51.178900, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
      { id: 1005, tipo: "ROT", endereco: "Jardim Botânico", servico: "Manutenção", lat: -23.328900, lng: -51.156700, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false },
    ];
  }

  private initializeTeams(): Team[] {
    return [
      { id: 1, service: "rocagem", type: "Giro Zero", lote: 1, status: "Working", currentAreaId: 5, location: { lat: -23.3099, lng: -51.1603 } },
      { id: 2, service: "rocagem", type: "Acabamento", lote: 1, status: "Idle", currentAreaId: null, location: { lat: -23.30, lng: -51.15 } },
      { id: 3, service: "rocagem", type: "Coleta", lote: 1, status: "Idle", currentAreaId: null, location: { lat: -23.30, lng: -51.15 } },
      { id: 4, service: "rocagem", type: "Capina", lote: 1, status: "Idle", currentAreaId: null, location: { lat: -23.30, lng: -51.15 } },
      { id: 5, service: "rocagem", type: "Giro Zero", lote: 2, status: "Working", currentAreaId: 106, location: { lat: -23.2989, lng: -51.1823 } },
      { id: 6, service: "rocagem", type: "Acabamento", lote: 2, status: "Idle", currentAreaId: null, location: { lat: -23.31, lng: -51.16 } },
      { id: 7, service: "jardins", type: "Manutenção", lote: null, status: "Idle", currentAreaId: null, location: { lat: -23.32, lng: -51.17 } },
      { id: 8, service: "jardins", type: "Irrigação", lote: null, status: "Idle", currentAreaId: null, location: { lat: -23.32, lng: -51.17 } },
    ];
  }

  async getAllAreas(serviceType: string): Promise<ServiceArea[]> {
    if (serviceType === "rocagem") {
      return this.rocagemAreas;
    } else if (serviceType === "jardins") {
      return this.jardinsAreas;
    }
    return [];
  }

  async getAreaById(id: number): Promise<ServiceArea | undefined> {
    return [...this.rocagemAreas, ...this.jardinsAreas].find(a => a.id === id);
  }

  async createArea(data: Omit<ServiceArea, 'id'>): Promise<ServiceArea> {
    const allAreas = [...this.rocagemAreas, ...this.jardinsAreas];
    const maxId = allAreas.length > 0 ? Math.max(...allAreas.map(a => a.id)) : 0;
    const newArea: ServiceArea = {
      ...data,
      id: maxId + 1,
      history: data.history || [],
      status: data.status || "Pendente",
    };

    if (data.servico === "rocagem" || !data.servico) {
      this.rocagemAreas.push(newArea);
    } else if (data.servico === "jardins") {
      this.jardinsAreas.push(newArea);
    }

    return newArea;
  }

  async searchAreas(query: string, serviceType: string, limit: number = 50): Promise<ServiceArea[]> {
    const areas = serviceType === "rocagem" ? this.rocagemAreas : this.jardinsAreas;
    const searchNorm = removeAccents(query.toLowerCase());
    
    const filtered = areas.filter(area => {
      const endereco = removeAccents((area.endereco || "").toLowerCase());
      const bairro = removeAccents((area.bairro || "").toLowerCase());
      const lote = area.lote?.toString() || "";
      
      return endereco.includes(searchNorm) || 
             bairro.includes(searchNorm) || 
             lote.includes(searchNorm);
    });
    
    return filtered.slice(0, limit);
  }

  async updateAreaStatus(id: number, status: string): Promise<ServiceArea | undefined> {
    const area = await this.getAreaById(id);
    if (!area) return undefined;

    area.status = status as any;
    area.history.push({
      date: new Date().toISOString(),
      status: status,
    });

    // Nota: MemStorage não recalcula automaticamente
    // Em produção, use DbStorage que tem o algoritmo com feriados

    return area;
  }

  async updateAreaSchedule(id: number, scheduledDate: string): Promise<ServiceArea | undefined> {
    const area = await this.getAreaById(id);
    if (!area) return undefined;

    area.scheduledDate = scheduledDate;
    return area;
  }

  async updateAreaPolygon(id: number, polygon: Array<{ lat: number; lng: number }>): Promise<ServiceArea | undefined> {
    const area = await this.getAreaById(id);
    if (!area) return undefined;

    area.polygon = polygon;
    return area;
  }

  async updateAreaPosition(id: number, lat: number, lng: number): Promise<ServiceArea | undefined> {
    const area = await this.getAreaById(id);
    if (!area) return undefined;

    area.lat = lat;
    area.lng = lng;
    return area;
  }

  async updateArea(id: number, data: Partial<ServiceArea>): Promise<ServiceArea | undefined> {
    const area = await this.getAreaById(id);
    if (!area) return undefined;

    Object.assign(area, data);
    return area;
  }

  async deleteArea(id: number): Promise<boolean> {
    const rocIndex = this.rocagemAreas.findIndex(a => a.id === id);
    if (rocIndex !== -1) {
      this.rocagemAreas.splice(rocIndex, 1);
      return true;
    }

    const jarIndex = this.jardinsAreas.findIndex(a => a.id === id);
    if (jarIndex !== -1) {
      this.jardinsAreas.splice(jarIndex, 1);
      return true;
    }

    return false;
  }

  async addHistoryEntry(areaId: number, entry: { date: string; status: string; type?: 'completed' | 'forecast'; observation?: string }): Promise<ServiceArea | undefined> {
    const area = await this.getAreaById(areaId);
    if (!area) return undefined;

    area.history.push(entry);
    return area;
  }

  async getAllTeams(): Promise<Team[]> {
    return this.teams;
  }

  async getTeamById(id: number): Promise<Team | undefined> {
    return this.teams.find(t => t.id === id);
  }

  async assignTeamToArea(teamId: number, areaId: number): Promise<Team | undefined> {
    const team = await this.getTeamById(teamId);
    if (!team) return undefined;

    team.currentAreaId = areaId;
    team.status = "Assigned";

    return team;
  }

  async getConfig(): Promise<AppConfig> {
    return this.config;
  }

  async updateConfig(newConfig: Partial<AppConfig>): Promise<AppConfig> {
    if (newConfig.mowingProductionRate) {
      this.config.mowingProductionRate = {
        ...this.config.mowingProductionRate,
        ...newConfig.mowingProductionRate,
      };
      // Nota: MemStorage não recalcula automaticamente
      // Em produção, use DbStorage que tem o algoritmo com feriados
    }
    return this.config;
  }

  async registerDailyMowing(areaIds: number[], date: string, type: 'completed' | 'forecast' = 'completed'): Promise<void> {
    // Importar algoritmo de agendamento
    const { recalculateAfterCompletion } = await import('@shared/schedulingAlgorithm');
    
    // 1. Atualizar cada área baseado no tipo de registro
    for (const areaId of areaIds) {
      const area = await this.getAreaById(areaId);
      if (!area) continue;
      
      if (type === 'completed') {
        // Registro de conclusão: atualizar ultimaRocagem e status
        area.ultimaRocagem = date;
        area.status = "Concluído";
        area.history.push({
          date: date,
          status: "Concluído",
          type: 'completed',
          observation: "Roçagem concluída",
        });
      } else {
        // Registro de previsão: apenas adicionar no histórico
        area.history.push({
          date: date,
          status: "Previsto",
          type: 'forecast',
          observation: "Previsão de roçagem",
        });
      }
    }
    
    // 2. Se foi registro de conclusão, recalcular previsões para lotes afetados
    if (type === 'completed') {
      const allAreas = this.rocagemAreas;
      const predictions = recalculateAfterCompletion(allAreas, areaIds, this.config);
      
      // 3. Atualizar previsões em memória
      for (const prediction of predictions) {
        const area = await this.getAreaById(prediction.areaId);
        if (area) {
          area.proximaPrevisao = prediction.proximaPrevisao;
          area.daysToComplete = prediction.daysToComplete;
        }
      }
    }
  }

  async clearSimulationData(serviceType: string): Promise<number> {
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
  async getLastExport(scope: string, type: 'full' | 'incremental'): Promise<ExportHistory | null> {
    // MemStorage: Não persiste histórico de exportação
    return null;
  }

  async recordExport(data: InsertExportHistory): Promise<ExportHistory> {
    // MemStorage: Simula gravação de histórico
    return {
      id: Math.floor(Math.random() * 10000),
      scope: data.scope,
      exportType: data.exportType,
      recordCount: data.recordCount,
      durationMs: data.durationMs ?? null,
      exportedAt: new Date().toISOString(),
    };
  }

  async toggleExecutando(id: number, executando: boolean): Promise<ServiceArea | undefined> {
    const area = await this.getAreaById(id);
    if (!area) return undefined;
    area.executando = executando;
    area.executandoDesde = executando ? new Date().toISOString() : null;
    return area;
  }

  async resetAllExecutando(): Promise<number> {
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

  async resetStaleExecutando(todayDateStr: string): Promise<number> {
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

  async getAreasModifiedSince(timestamp: Date): Promise<ServiceArea[]> {
    return this.rocagemAreas;
  }

  private memUsers: User[] = [];
  private nextUserId = 1;

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.memUsers.find(u => u.email === email);
  }

  async getUserById(id: number): Promise<User | undefined> {
    return this.memUsers.find(u => u.id === id);
  }

  async getAllUsers(): Promise<User[]> {
    return this.memUsers;
  }

  async createUser(data: InsertUser): Promise<User> {
    const user: User = { ...data, id: this.nextUserId++ };
    this.memUsers.push(user);
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.memUsers.find(u => u.id === id);
    if (!user) return undefined;
    Object.assign(user, data);
    return user;
  }

  async deleteUser(id: number): Promise<boolean> {
    const idx = this.memUsers.findIndex(u => u.id === id);
    if (idx === -1) return false;
    this.memUsers.splice(idx, 1);
    return true;
  }
}

import { DbStorage } from "./db-storage";

// Inicializar storage baseado em variável de ambiente
function initializeStorage() {
  const databaseUrl = process.env.DATABASE_URL;
  const isProduction = process.env.NODE_ENV === "production";
  
  if (databaseUrl && databaseUrl.trim() !== "") {
    console.log("🗄️  Usando DbStorage (PostgreSQL)");
    return new DbStorage(databaseUrl);
  }

  if (isProduction) {
    throw new Error("DATABASE_URL is required in production");
  }

  console.log("💾 Usando MemStorage (in-memory)");
  return new MemStorage();
}

export const storage = initializeStorage();
