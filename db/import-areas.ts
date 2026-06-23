import { serviceAreas } from './schema';
import * as fs from 'fs';
import * as readline from 'readline';
import { createDb } from "./client";

// Função para converter formato brasileiro para número
function parseBrazilianNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  
  // Remove aspas se houver
  value = value.replace(/"/g, '');
  
  // Remove pontos (separador de milhar) e troca vírgula por ponto
  value = value.replace(/\./g, '').replace(/,/g, '.');
  
  return parseFloat(value) || 0;
}

// Função para calcular próxima previsão baseada no ciclo de 45 dias
function calculateNextForecast(lote: number, metragem: number): string {
  const today = new Date();
  const produtividade = lote === 1 ? 85000 : 70000; // m²/dia
  
  // Dias necessários para roçar esta área
  const diasNecessarios = Math.ceil(metragem / produtividade);
  
  // Próxima previsão = hoje + ciclo (45 dias) - dias necessários
  // Isso garante que áreas menores sejam cortadas antes
  const diasAtePrevisao = 45 - diasNecessarios;
  
  const proximaPrevisao = new Date(today);
  proximaPrevisao.setDate(proximaPrevisao.getDate() + diasAtePrevisao);
  
  return proximaPrevisao.toISOString().split('T')[0];
}

interface CSVRow {
  tipo_item: string;
  endereco: string;
  bairro: string;
  metragem_m2: number;
  lat: number;
  lng: number;
  lote: number;
}

async function importAreas() {
  // Conectar ao banco
  const { pool, db } = createDb();
  
  const csvPath = '/tmp/areas_londrina.csv';
  
  console.log('🚀 Iniciando importação de áreas...');
  console.log(`📂 Lendo arquivo: ${csvPath}`);
  
  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const areas: any[] = [];
  let lineNumber = 0;
  let header: string[] = [];

  for await (const line of rl) {
    lineNumber++;
    
    // Pular cabeçalho
    if (lineNumber === 1) {
      header = line.split(',');
      continue;
    }

    // Parse CSV considerando campos entre aspas
    const fields: string[] = [];
    let currentField = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim());

    // Extrair dados
    const tipo = fields[0] || '';
    const endereco = fields[1] || '';
    const bairro = fields[2] || '';
    const metragem = parseBrazilianNumber(fields[3] || '0');
    const lat = parseBrazilianNumber(fields[4] || '0');
    const lng = parseBrazilianNumber(fields[5] || '0');
    const lote = parseInt(fields[6] || '1');
    // Validar dados essenciais
    if (!endereco || lat === 0 || lng === 0) {
      console.warn(`⚠️  Linha ${lineNumber}: dados inválidos, pulando...`);
      continue;
    }

    // Calcular próxima previsão
    const proximaPrevisao = calculateNextForecast(lote, metragem);

    // Preparar área para inserção
    const area = {
      tipo: 'Roçagem',
      endereco: endereco,
      bairro: bairro,
      lat: lat,
      lng: lng,
      lote: lote,
      servico: 'rocagem' as const,
      metragem_m2: metragem,
      status: 'Pendente' as const,
      proximaPrevisao: proximaPrevisao,
      polygon: null,
      history: [],
      ultimaRocagem: null,
      registradoPor: null,
      dataRegistro: null,
    };

    areas.push(area);
  }

  console.log(`📊 Total de áreas processadas: ${areas.length}`);
  console.log('💾 Inserindo no banco de dados em lotes...');

  // Inserir em lotes de 100 áreas por vez
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < areas.length; i += batchSize) {
    const batch = areas.slice(i, i + batchSize);
    
    try {
      await db.insert(serviceAreas).values(batch);
      inserted += batch.length;
      console.log(`✅ Inseridas ${inserted}/${areas.length} áreas`);
    } catch (error) {
      console.error(`❌ Erro ao inserir lote ${i / batchSize + 1}:`, error);
      throw error;
    }
  }

  console.log(`🎉 Importação concluída! ${inserted} áreas inseridas com sucesso.`);
  
  // Estatísticas
  const stats = {
    total: inserted,
    porLote: areas.reduce((acc, area) => {
      acc[area.lote] = (acc[area.lote] || 0) + 1;
      return acc;
    }, {} as Record<number, number>)
  };
  
  console.log('📈 Estatísticas:');
  console.log(`   Total: ${stats.total}`);
  console.log(`   Lote 1: ${stats.porLote[1] || 0}`);
  console.log(`   Lote 2: ${stats.porLote[2] || 0}`);
  
  // Fechar conexão
  await pool.end();
}

// Executar importação
importAreas()
  .then(() => {
    console.log('✨ Processo finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro durante importação:', error);
    process.exit(1);
  });
