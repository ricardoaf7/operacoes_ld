import { serviceAreas } from "./schema";
import { eq } from "drizzle-orm";
import { createDb } from "./client";

// Criar um polígono pequeno (quadrado) ao redor de um ponto lat/lng
function createSquarePolygon(lat: number, lng: number, sizeInMeters: number = 50): Array<{lat: number, lng: number}> {
  // 1 grau de latitude ≈ 111km
  // 1 grau de longitude ≈ 111km * cos(latitude)
  const latOffset = (sizeInMeters / 111000);
  const lngOffset = (sizeInMeters / (111000 * Math.cos(lat * Math.PI / 180)));
  
  return [
    { lat: lat - latOffset, lng: lng - lngOffset }, // SW
    { lat: lat - latOffset, lng: lng + lngOffset }, // SE
    { lat: lat + latOffset, lng: lng + lngOffset }, // NE
    { lat: lat + latOffset, lng: lng - lngOffset }, // NW
    { lat: lat - latOffset, lng: lng - lngOffset }, // Fechar o polígono
  ];
}

async function addPolygons() {
  const { pool, db } = createDb();

  console.log("🔷 Adicionando polígonos às áreas de roçagem...");

  // Buscar todas as áreas de roçagem
  const areas = await db.select().from(serviceAreas).where(eq(serviceAreas.servico, 'rocagem'));
  
  console.log(`📊 Total de áreas: ${areas.length}`);
  console.log("⏳ Criando polígonos em lote...");

  // Processar em batches para performance
  const batchSize = 100;
  for (let start = 0; start < areas.length; start += batchSize) {
    const batch = areas.slice(start, start + batchSize);
    
    await Promise.all(batch.map(async (area) => {
      if (area.lat && area.lng) {
        const polygon = createSquarePolygon(area.lat, area.lng, 50);
        
        await db.update(serviceAreas)
          .set({ polygon: polygon as any })
          .where(eq(serviceAreas.id, area.id));
      }
    }));
    
    console.log(`   Processado: ${Math.min(start + batchSize, areas.length)} / ${areas.length}`);
  }

  console.log("✅ Polígonos adicionados com sucesso!");
  console.log("🎨 Agora o mapa mostrará as áreas com as diferentes cores!");
  
  await pool.end();
}

addPolygons().catch(console.error);
