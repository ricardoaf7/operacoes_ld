/**
 * Script para importar dados da planilha Google Sheets
 * URL: https://docs.google.com/spreadsheets/d/1lfKoZtNt29pykeRVIlOxQV9l8t1WheU-RyyXHxN6B8k/
 */

const SHEET_ID = '1lfKoZtNt29pykeRVIlOxQV9l8t1WheU-RyyXHxN6B8k';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

interface RawAreaData {
  tipo_item: string;
  endereco: string;
  bairro: string;
  metragem_m2: string;
  latidude: string; // typo na planilha
  longitude: string;
  lote: string;
}

interface ProcessedArea {
  id: number;
  ordem: number;
  tipo: string;
  endereco: string;
  bairro: string;
  metragem_m2: number;
  lat: number;
  lng: number;
  lote: number;
  status: "Pendente" | "Em Execução" | "Concluído";
  history: any[];
  polygon: null;
  scheduledDate: null;
  proximaPrevisao: null;
  manualSchedule: boolean;
  servico?: string;
}

function convertBrazilianNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  
  // Remove pontos (separadores de milhar) e substitui vírgula por ponto
  const cleaned = value.trim()
    .replace(/\./g, '') // Remove pontos
    .replace(/,/g, '.'); // Substitui vírgula por ponto
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseCSV(csv: string): RawAreaData[] {
  const lines = csv.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const data: RawAreaData[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim());
    
    if (values.length < headers.length) continue;
    
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    data.push(row as RawAreaData);
  }
  
  return data;
}

function processAreas(rawData: RawAreaData[]): ProcessedArea[] {
  const processed: ProcessedArea[] = [];
  
  rawData.forEach((row, index) => {
    // Pula linhas vazias ou inválidas
    if (!row.endereco || !row.tipo_item) return;
    
    const lat = convertBrazilianNumber(row.latidude);
    const lng = convertBrazilianNumber(row.longitude);
    
    // Pula se não tem coordenadas válidas
    if (lat === 0 || lng === 0) return;
    
    const lote = parseInt(row.lote) || 1;
    
    const area: ProcessedArea = {
      id: index + 1,
      ordem: index + 1,
      tipo: row.tipo_item.toLowerCase(),
      endereco: row.endereco,
      bairro: row.bairro || '',
      metragem_m2: convertBrazilianNumber(row.metragem_m2),
      lat,
      lng,
      lote,
      status: "Pendente",
      history: [],
      polygon: null,
      scheduledDate: null,
      proximaPrevisao: null,
      manualSchedule: false,
      servico: "rocagem",
    };
    
    processed.push(area);
  });
  
  return processed;
}

async function importData() {
  try {
    console.log('🔄 Baixando dados da planilha...');
    const response = await fetch(CSV_URL);
    
    if (!response.ok) {
      throw new Error(`Erro ao baixar planilha: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    console.log('✅ Dados baixados com sucesso!');
    
    console.log('🔄 Processando CSV...');
    const rawData = parseCSV(csvText);
    console.log(`📊 ${rawData.length} linhas encontradas`);
    
    console.log('🔄 Convertendo dados...');
    const areas = processAreas(rawData);
    console.log(`✅ ${areas.length} áreas válidas processadas`);
    
    // Separar por lote
    const lote1 = areas.filter(a => a.lote === 1);
    const lote2 = areas.filter(a => a.lote === 2);
    
    console.log(`📦 Lote 1: ${lote1.length} áreas`);
    console.log(`📦 Lote 2: ${lote2.length} áreas`);
    
    // Salvar em arquivo JSON
    const output = {
      lote1,
      lote2,
      total: areas.length,
      importedAt: new Date().toISOString(),
    };
    
    const fs = await import('fs/promises');
    await fs.writeFile(
      'server/imported-areas.json',
      JSON.stringify(output, null, 2),
      'utf-8'
    );
    
    console.log('✅ Dados salvos em server/imported-areas.json');
    console.log('\n📊 Resumo:');
    console.log(`   Total: ${areas.length} áreas`);
    console.log(`   Lote 1: ${lote1.length}`);
    console.log(`   Lote 2: ${lote2.length}`);
    
  } catch (error) {
    console.error('❌ Erro ao importar dados:', error);
    process.exit(1);
  }
}

// Executar importação
importData();
