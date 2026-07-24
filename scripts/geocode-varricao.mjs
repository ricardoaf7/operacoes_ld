// Geocodifica os locais de varrição pendentes via Nominatim (OpenStreetMap).
// Uso: node scripts/geocode-varricao.mjs
import "dotenv/config";
import pg from "pg";

// Porta 6543 (transaction pooler) é bloqueada na rede da CMTU; 5432 funciona
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL.replace(":6543", ":5432"),
});

// Caixa aproximada de Londrina para restringir e validar resultados
const BBOX = { lonMin: -51.35, latMin: -23.45, lonMax: -50.95, latMax: -23.15 };

function expandirAbreviacoes(nome) {
  return nome
    .replace(/^Av\.\s*/i, "Avenida ")
    .replace(/^Al\.\s*/i, "Alameda ")
    .replace(/^R\.\s*/i, "Rua ")
    .replace(/^Pç\.\s*/i, "Praça ")
    .replace(/\bPref\.\s*/gi, "Prefeito ")
    .replace(/\bProf\.\s*/gi, "Professor ");
}

async function geocode(nome) {
  const q = `${expandirAbreviacoes(nome)}, Londrina, Paraná, Brasil`;
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br" +
    `&viewbox=${BBOX.lonMin},${BBOX.latMin},${BBOX.lonMax},${BBOX.latMax}&bounded=1` +
    `&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "CMTU-Zeladoria/1.0 (dashboard interno)" },
  });
  if (!r.ok) return null;
  const data = await r.json();
  if (!data.length) return null;
  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  const dentro =
    lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lonMin && lng <= BBOX.lonMax;
  return dentro ? { lat, lng } : null;
}

const { rows: locais } = await pool.query(
  `SELECT id, nome FROM varricao_locais WHERE geocode_status='pendente' ORDER BY nome`
);
console.log(`Pendentes: ${locais.length}`);

const cache = new Map();
let ok = 0, revisar = 0, feitos = 0;

for (const l of locais) {
  const chave = l.nome.toLowerCase();
  let resultado;
  if (cache.has(chave)) {
    resultado = cache.get(chave);
  } else {
    try {
      resultado = await geocode(l.nome);
    } catch {
      resultado = null;
    }
    cache.set(chave, resultado);
    await new Promise((r) => setTimeout(r, 1100)); // limite do Nominatim: 1 req/s
  }

  if (resultado) {
    await pool.query(
      `UPDATE varricao_locais SET lat=$1, lng=$2, geocode_status='ok', updated_at=NOW() WHERE id=$3`,
      [resultado.lat, resultado.lng, l.id]
    );
    ok++;
  } else {
    await pool.query(
      `UPDATE varricao_locais SET geocode_status='revisar', updated_at=NOW() WHERE id=$1`,
      [l.id]
    );
    revisar++;
  }
  feitos++;
  if (feitos % 25 === 0) console.log(`  ${feitos}/${locais.length}...`);
}

console.log(`\nConcluído: ${ok} localizados | ${revisar} para revisar manualmente`);
await pool.end();
