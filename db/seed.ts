import { serviceAreas, teams, appConfig } from "./schema";
import { createDb } from "./client";

async function seed() {
  const { pool, db } = createDb();

  console.log("🌱 Iniciando seed do banco de dados...");

  // Limpar tabelas existentes
  await db.delete(serviceAreas);
  await db.delete(teams);
  await db.delete(appConfig);

  // Inserir configuração
  await db.insert(appConfig).values({
    mowingProductionRate: {
      lote1: 85000,
      lote2: 70000,
    },
  });
  console.log("✅ Configuração inserida");

  // Inserir áreas de roçagem - Lote 1
  const rocagemLote1 = [
    { ordem: 1, tipo: "area publica", endereco: "Av Jorge Casoni - Terminal Rodoviário", bairro: "Casoni", metragem_m2: 29184.98, lat: -23.3044206, lng: -51.1513729, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 2, tipo: "praça", endereco: "Rua Carijós c/ Oraruana", bairro: "Paraná", metragem_m2: 2332.83, lat: -23.3045262, lng: -51.1480067, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 3, tipo: "area publica", endereco: "Av Saul Elkind", bairro: "Lago Parque", metragem_m2: 15234.56, lat: -23.2987, lng: -51.1623, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 4, tipo: "canteiro", endereco: "Av Madre Leônia Milito", bairro: "Centro", metragem_m2: 8765.43, lat: -23.3101, lng: -51.1628, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 5, tipo: "area publica", endereco: "Praça Sete de Setembro", bairro: "Centro", metragem_m2: 12456.78, lat: -23.3099, lng: -51.1603, lote: 1, status: "Em Execução", history: [{ date: new Date().toISOString(), status: "Iniciado", observation: "Equipe 1 iniciou trabalho" }], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 6, tipo: "praça", endereco: "Praça Rocha Pombo", bairro: "Vila Nova", metragem_m2: 9876.54, lat: -23.3142, lng: -51.1578, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 7, tipo: "area publica", endereco: "Av Bandeirantes", bairro: "Bandeirantes", metragem_m2: 18765.43, lat: -23.2876, lng: -51.1456, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 8, tipo: "canteiro", endereco: "Av Ayrton Senna", bairro: "Gleba Palhano", metragem_m2: 21234.56, lat: -23.2834, lng: -51.1823, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 9, tipo: "area publica", endereco: "Parque Arthur Thomas", bairro: "Nova Londrina", metragem_m2: 45678.90, lat: -23.3167, lng: -51.1789, lote: 1, status: "Concluído", history: [{ date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), status: "Concluído" }], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 10, tipo: "praça", endereco: "Praça Willie Davids", bairro: "Heimtal", metragem_m2: 7654.32, lat: -23.3234, lng: -51.1423, lote: 1, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
  ];

  await db.insert(serviceAreas).values(rocagemLote1);
  console.log("✅ Áreas de roçagem Lote 1 inseridas");

  // Inserir áreas de roçagem - Lote 2
  const rocagemLote2 = [
    { ordem: 1, tipo: "area publica", endereco: "Av Duque de Caxias", bairro: "Zona Sul", metragem_m2: 32145.67, lat: -23.3367, lng: -51.1534, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 2, tipo: "canteiro", endereco: "Av Inglaterra", bairro: "Cinco Conjuntos", metragem_m2: 11234.56, lat: -23.3278, lng: -51.1745, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 3, tipo: "praça", endereco: "Praça Maringá", bairro: "Cervejaria", metragem_m2: 8765.43, lat: -23.3189, lng: -51.1667, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 4, tipo: "area publica", endereco: "Av JK", bairro: "Tucanos", metragem_m2: 19876.54, lat: -23.3445, lng: -51.1623, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 5, tipo: "canteiro", endereco: "Av Higienópolis", bairro: "Higienópolis", metragem_m2: 14567.89, lat: -23.3123, lng: -51.1489, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 6, tipo: "area publica", endereco: "Parque Guanabara", bairro: "Guanabara", metragem_m2: 28765.43, lat: -23.2989, lng: -51.1823, lote: 2, status: "Em Execução", history: [{ date: new Date().toISOString(), status: "Iniciado" }], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 7, tipo: "praça", endereco: "Praça Santos Dumont", bairro: "Aeroporto", metragem_m2: 9876.54, lat: -23.3034, lng: -51.1378, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 8, tipo: "area publica", endereco: "Av Tiradentes", bairro: "Centro", metragem_m2: 16543.21, lat: -23.3087, lng: -51.1645, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 9, tipo: "canteiro", endereco: "Av Dez de Dezembro", bairro: "Centro", metragem_m2: 12345.67, lat: -23.3112, lng: -51.1590, lote: 2, status: "Pendente", history: [], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
    { ordem: 10, tipo: "praça", endereco: "Praça Primeiro de Maio", bairro: "Ouro Branco", metragem_m2: 8901.23, lat: -23.3267, lng: -51.1501, lote: 2, status: "Concluído", history: [{ date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), status: "Concluído" }], polygon: null, scheduledDate: null, manualSchedule: false, servico: "rocagem" },
  ];

  await db.insert(serviceAreas).values(rocagemLote2);
  console.log("✅ Áreas de roçagem Lote 2 inseridas");

  // Inserir jardins
  const jardins = [
    { tipo: "ROT", endereco: "Av Higienópolis - Canteiro Central", bairro: "Higienópolis", lat: -23.310789, lng: -51.177647, servico: "jardins" },
    { tipo: "ROT", endereco: "Praça Gabriel Martins", bairro: "Centro", lat: -23.310234, lng: -51.163456, servico: "jardins" },
    { tipo: "ROT", endereco: "Praça Willie Davids", bairro: "Heimtal", lat: -23.323456, lng: -51.142345, servico: "jardins" },
    { tipo: "Jardim", endereco: "Parque Municipal Arthur Thomas", bairro: "Nova Londrina", lat: -23.316723, lng: -51.178934, servico: "jardins" },
    { tipo: "Jardim", endereco: "Praça Sete de Setembro", bairro: "Centro", lat: -23.309876, lng: -51.160345, servico: "jardins" },
  ];

  await db.insert(serviceAreas).values(jardins);
  console.log("✅ Jardins inseridos");

  // Inserir equipes
  const teamsList = [
    { service: "rocagem", type: "Giro Zero", lote: 1, status: "Working", currentAreaId: null, location: { lat: -23.3044, lng: -51.1514 } },
    { service: "rocagem", type: "Giro Zero", lote: 2, status: "Working", currentAreaId: null, location: { lat: -23.3367, lng: -51.1534 } },
    { service: "rocagem", type: "Acabamento", lote: 1, status: "Idle", currentAreaId: null, location: { lat: -23.3101, lng: -51.1628 } },
    { service: "rocagem", type: "Acabamento", lote: 2, status: "Idle", currentAreaId: null, location: { lat: -23.3123, lng: -51.1489 } },
    { service: "coleta", type: "Coleta", lote: null, status: "Working", currentAreaId: null, location: { lat: -23.3099, lng: -51.1603 } },
    { service: "capina", type: "Capina", lote: null, status: "Idle", currentAreaId: null, location: { lat: -23.3142, lng: -51.1578 } },
  ];

  await db.insert(teams).values(teamsList);
  console.log("✅ Equipes inseridas");

  await pool.end();
  console.log("✨ Seed concluído com sucesso!");
}

seed().catch((error) => {
  console.error("❌ Erro durante seed:", error);
  process.exit(1);
});
