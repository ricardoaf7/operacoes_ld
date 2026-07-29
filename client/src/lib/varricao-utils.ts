// Utilitários compartilhados entre as telas de Varrição (mapa, encarregado, painel de cobertura)

export const SECAO_LABELS: Record<string, string> = {
  varricao: "Varrição",
  varricao_2turno: "Varrição — 2º turno",
  sanitarios: "Sanitários",
  lavagem_vias_noturna: "Lavagem de vias (noturna)",
  lavagem_pracas_noturna: "Lavagem de praças (noturna)",
  lavagem_vias_diurna: "Lavagem de vias (diurna)",
  lavagem_pracas_diurna: "Lavagem de praças (diurna)",
};

// Os 3 serviços do contrato: Varrição e Lavação são cobradas em unidades
// diferentes (metro linear × metro quadrado) e por isso têm Ordens de
// Serviço e tetos de metragem separados; Sanitário é simples (1 local,
// diário) e não passa por rascunho/finalização própria.
export type VarricaoCategoria = "varricao" | "lavacao" | "sanitario";

export const CATEGORIA_LABELS: Record<VarricaoCategoria, string> = {
  varricao: "Varrição",
  lavacao: "Lavação",
  sanitario: "Sanitário",
};

export const SECOES_POR_CATEGORIA: Record<VarricaoCategoria, string[]> = {
  varricao: ["varricao", "varricao_2turno"],
  lavacao: ["lavagem_vias_noturna", "lavagem_pracas_noturna", "lavagem_vias_diurna", "lavagem_pracas_diurna"],
  sanitario: ["sanitarios"],
};

export function categoriaDaSecao(secao: string): VarricaoCategoria {
  if (secao.startsWith("lavagem")) return "lavacao";
  if (secao === "sanitarios") return "sanitario";
  return "varricao";
}

export interface VarricaoLocalAgenda {
  frequencia: string;
  dias_semana: number[] | null;
}

// Data no formato YYYY-MM-DD, sem depender do fuso do navegador na conversão
export function dataLocalISO(diasAtras = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toLocaleDateString("en-CA");
}

// Dia da semana (0=Dom...6=Sáb) de uma data "YYYY-MM-DD", sem risco de virar o dia
// por causa de fuso horário (new Date("YYYY-MM-DD") interpreta como UTC)
export function diaDaSemana(dataISO: string): number {
  const [y, m, d] = dataISO.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function programadoNaData(local: VarricaoLocalAgenda, dataISO: string): boolean {
  const dia = diaDaSemana(dataISO);
  if (local.frequencia === "diario") return dia >= 1 && dia <= 6;
  return (local.dias_semana ?? []).includes(dia);
}

export function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistancia(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
