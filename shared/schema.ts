import { z } from "zod";
import { pgTable, serial, text, integer, jsonb, boolean, timestamp, doublePrecision } from "drizzle-orm/pg-core";

// Service Area Schema
export const serviceAreaSchema = z.object({
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
  status: z.enum(["Pendente", "Em Execução", "Concluído"]).default("Pendente"),
  history: z.array(z.object({
    date: z.string(),
    status: z.string(),
    type: z.enum(['completed', 'forecast']).optional(),
    observation: z.string().optional(),
  })).default([]),
  polygon: z.array(z.object({
    lat: z.number(),
    lng: z.number(),
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
    data: z.string(),
  })).default([]),
  executando: z.boolean().optional().default(false),
  executandoDesde: z.string().nullable().optional(),
});

export type ServiceArea = z.infer<typeof serviceAreaSchema>;

export const insertServiceAreaSchema = serviceAreaSchema.omit({
  id: true,
  history: true,
  scheduledDate: true,
});

export type InsertServiceArea = z.infer<typeof insertServiceAreaSchema>;

// Team Schema
export const teamSchema = z.object({
  id: z.number(),
  service: z.string(),
  type: z.string(),
  lote: z.number().nullable(),
  status: z.enum(["Idle", "Assigned", "Working"]).default("Idle"),
  currentAreaId: z.number().nullable().default(null),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
});

export type Team = z.infer<typeof teamSchema>;

export const insertTeamSchema = teamSchema.omit({
  id: true,
});

export type InsertTeam = z.infer<typeof insertTeamSchema>;

// App Configuration Schema
export const appConfigSchema = z.object({
  mowingProductionRate: z.object({
    lote1: z.number(),
    lote2: z.number(),
  }),
  metaMensal: z.number().optional(),
  metaLote1: z.number().optional(),
  metaLote2: z.number().optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const updateAppConfigSchema = appConfigSchema.partial();

export type UpdateAppConfig = z.infer<typeof updateAppConfigSchema>;

// Export History Schema
export const exportHistorySchema = z.object({
  id: z.number(),
  scope: z.enum(["service_areas", "teams", "app_config"]),
  exportType: z.enum(["full", "incremental"]),
  recordCount: z.number(),
  durationMs: z.number().nullable().optional(),
  exportedAt: z.string(),
});

export type ExportHistory = z.infer<typeof exportHistorySchema>;

export const insertExportHistorySchema = exportHistorySchema.omit({
  id: true,
  exportedAt: true,
});

export type InsertExportHistory = z.infer<typeof insertExportHistorySchema>;

// Drizzle ORM Table Definitions
export const serviceAreas = pgTable("service_areas", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  service: text("service").notNull(),
  type: text("type").notNull(),
  lote: integer("lote"),
  status: text("status").notNull().default("Idle"),
  currentAreaId: integer("current_area_id"),
  location: jsonb("location").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const appConfig = pgTable("app_config", {
  id: serial("id").primaryKey(),
  mowingProductionRate: jsonb("mowing_production_rate").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Users table for authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  senha: text("senha").notNull(),
  role: text("role").notNull().default("fiscal"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userSchema = z.object({
  id: z.number(),
  nome: z.string(),
  email: z.string().email(),
  senha: z.string(),
  role: z.enum(["admin", "gestor", "fiscal"]),
  ativo: z.boolean().default(true),
});

export type User = z.infer<typeof userSchema>;

export const insertUserSchema = userSchema.omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;

// Ordens de Serviço
export const ordemServicoSchema = z.object({
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
    metragem_m2: z.number().nullable().optional(),
  })).optional(),
});

export type OrdemServico = z.infer<typeof ordemServicoSchema>;

export const insertOrdemServicoSchema = z.object({
  numero: z.string().min(1),
  lote: z.number(),
  mes_referencia: z.string().min(1),
  data_emissao: z.string(),
  emitido_por: z.string().optional(),
  observacao: z.string().optional(),
  area_ids: z.array(z.number()).min(1),
});

export type InsertOrdemServico = z.infer<typeof insertOrdemServicoSchema>;

// Configuração de Contrato por Lote
export const contratoConfigSchema = z.object({
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
  fiscal_nome: z.string().nullable().optional(),
});

export type ContratoConfig = z.infer<typeof contratoConfigSchema>;

// Cronograma Semanal
export const cronogramaSchema = z.object({
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
    lng: z.number().optional(),
  })).optional(),
});
export type Cronograma = z.infer<typeof cronogramaSchema>;

export const insertCronogramaSchema = z.object({
  lote: z.number(),
  semana_inicio: z.string().min(1),
  semana_fim: z.string().min(1),
  observacao: z.string().optional(),
  area_ids: z.array(z.number()).min(1),
});
export type InsertCronograma = z.infer<typeof insertCronogramaSchema>;

// Demandas
export const ORIGENS_DEMANDA = ["LondrinaON", "WhatsApp", "SEI", "E-mail", "Telefone", "Indicação", "Ouvidoria", "Interno"] as const;
export const TIPOS_DEMANDA = [
  "Capina e Roçagem", "Boa Praça", "Varrição", "Lagos", "Praças", "Podas",
  "Limpeza de Boca de Lobo", "Coleta de Rejeitos e Orgânicos", "Coleta de Recicláveis",
  "PEV's", "Impedimento de Calçada", "Terreno Particular Fechado com Mato Alto",
  "Terreno Particular Aberto com Mato Alto", "Descarte Irregular", "Outdoor",
  "Publicidade", "Lei Cidade Limpa", "Ambulantes", "Feiras",
  "Autorização de Uso de Espaço Público",
] as const;
export const STATUS_DEMANDA = ["aberta", "em_andamento", "concluida"] as const;

export const demandaSchema = z.object({
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
  updatedAt: z.string().optional(),
});

export type Demanda = z.infer<typeof demandaSchema>;

export const insertDemandaSchema = z.object({
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
  dadosEspecificos: z.record(z.any()).optional(),
});

export type InsertDemanda = z.infer<typeof insertDemandaSchema>;

// Notificações
export const notificacoes = pgTable("notificacoes", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull(),
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem"),
  tipo: text("tipo").notNull().default("demanda"),
  referenciaId: integer("referencia_id"),
  lida: boolean("lida").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notificacaoSchema = z.object({
  id: z.number(),
  usuarioId: z.number(),
  titulo: z.string(),
  mensagem: z.string().nullable().optional(),
  tipo: z.string().default("demanda"),
  referenciaId: z.number().nullable().optional(),
  lida: z.boolean().default(false),
  createdAt: z.string().optional(),
});

export type Notificacao = z.infer<typeof notificacaoSchema>;

// Setores
export const setores = pgTable("setores", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  parentId: integer("parent_id"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const setorSchema = z.object({
  id: z.number(),
  nome: z.string(),
  parentId: z.number().nullable().optional(),
  ativo: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Setor = z.infer<typeof setorSchema>;

export const insertSetorSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  parentId: z.number().nullable().optional(),
  ativo: z.boolean().default(true),
});

export type InsertSetor = z.infer<typeof insertSetorSchema>;

export const exportHistory = pgTable("export_history", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(),
  exportType: text("export_type").notNull(),
  recordCount: integer("record_count").notNull(),
  durationMs: integer("duration_ms"),
  exportedAt: timestamp("exported_at").defaultNow().notNull(),
});
