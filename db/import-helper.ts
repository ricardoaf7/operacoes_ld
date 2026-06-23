import { serviceAreas, teams, appConfig } from "./schema";
import * as fs from "fs";
import * as path from "path";
import { createDb } from "./client";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function convertBrazilianNumber(value: string): number | null {
  if (!value || value === '') return null;
  
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  
  return isNaN(num) ? null : num;
}

export async function importRealData(csvContent?: string) {
  const { pool, db } = createDb();

  try {
    let content: string;
    
    if (csvContent) {
      content = csvContent;
    } else {
      const projectCsvPath = path.join(process.cwd(), "server", "data", "areas_londrina.csv");
      const tmpCsvPath = "/tmp/areas_londrina.csv";
      
      let csvPath: string;
      if (fs.existsSync(projectCsvPath)) {
        csvPath = projectCsvPath;
      } else if (fs.existsSync(tmpCsvPath)) {
        csvPath = tmpCsvPath;
      } else {
        throw new Error("Arquivo CSV não encontrado. Tentou: " + projectCsvPath + " e " + tmpCsvPath);
      }
      
      content = fs.readFileSync(csvPath, 'utf-8');
    }
    
    const lines = content.split('\n').filter(line => line.trim() !== '');
    
    const dataLines = lines.slice(1);
    
    await db.delete(serviceAreas);
    await db.delete(teams);
    await db.delete(appConfig);
    
    await db.insert(appConfig).values({
      mowingProductionRate: {
        lote1: 110000,
        lote2: 80000,
      },
    });
    
    const batchSize = 100;
    let inserted = 0;
    let skipped = 0;
    
    for (let i = 0; i < dataLines.length; i += batchSize) {
      const batch = dataLines.slice(i, i + batchSize);
      const areasToInsert: any[] = [];
      
      for (const line of batch) {
        const fields = parseCSVLine(line);
        
        if (fields.length < 7) {
          skipped++;
          continue;
        }
        
        const [tipo_item, endereco, bairro, metragem_m2, latidude, longitude, lote] = fields;
        
        const lat = convertBrazilianNumber(latidude);
        const lng = convertBrazilianNumber(longitude);
        const metragem = convertBrazilianNumber(metragem_m2);
        const loteNum = parseInt(lote);
        
        if (lat === null || lng === null || isNaN(loteNum)) {
          skipped++;
          continue;
        }
        
        areasToInsert.push({
          tipo: tipo_item || 'area publica',
          endereco: endereco,
          bairro: bairro || null,
          metragem_m2: metragem,
          lat: lat,
          lng: lng,
          lote: loteNum,
          servico: 'rocagem',
          status: 'Pendente',
          history: [],
          polygon: null,
          scheduledDate: null,
          proximaPrevisao: null,
          ultimaRocagem: null,
          manualSchedule: false,
        });
      }
      
      if (areasToInsert.length > 0) {
        await db.insert(serviceAreas).values(areasToInsert);
        inserted += areasToInsert.length;
      }
    }
    
    const teamsList = [
      { service: "rocagem", type: "Giro Zero", lote: 1, status: "Working", currentAreaId: null, location: { lat: -23.3044, lng: -51.1514 } },
      { service: "rocagem", type: "Giro Zero", lote: 2, status: "Working", currentAreaId: null, location: { lat: -23.3367, lng: -51.1534 } },
      { service: "rocagem", type: "Acabamento", lote: 1, status: "Idle", currentAreaId: null, location: { lat: -23.3101, lng: -51.1628 } },
      { service: "rocagem", type: "Acabamento", lote: 2, status: "Idle", currentAreaId: null, location: { lat: -23.3123, lng: -51.1489 } },
      { service: "coleta", type: "Coleta", lote: null, status: "Working", currentAreaId: null, location: { lat: -23.3099, lng: -51.1603 } },
      { service: "capina", type: "Capina", lote: null, status: "Idle", currentAreaId: null, location: { lat: -23.3142, lng: -51.1578 } },
    ];
    
    await db.insert(teams).values(teamsList);
    
    await pool.end();
    
    return { inserted, skipped };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
