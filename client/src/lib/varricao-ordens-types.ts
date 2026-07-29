export interface VarricaoOrdemLocal {
  localId: number;
  nome: string;
  complemento: string | null;
  regiao: string | null;
  tipo: string | null;
  secao: string;
  metragemUnica: number | null;
  dias: number[];
  diasTexto: string;
  metragemTotal: number;
}

export interface VarricaoOrdemSubtotal {
  chave: string;
  quantidade: number;
  metragemTotal: number;
}

export interface VarricaoOrdemDuplicata {
  nomeA: string;
  nomeB: string;
  localIdA: number;
  localIdB: number;
  distancia: number;
}

export type VarricaoOrdemStatus = "rascunho" | "finalizada";
export type VarricaoOrdemCategoria = "varricao" | "lavacao";

export interface VarricaoOrdemRegistro {
  id: number;
  numero: string;
  mes_referencia: string;
  categoria: VarricaoOrdemCategoria;
  data_emissao: string;
  emitido_por: string | null;
  observacao: string | null;
  status: VarricaoOrdemStatus;
  finalizado_por: string | null;
  finalizado_em: string | null;
  created_at: string;
  total_locais?: number;
  total_metragem?: number | string;
}

export interface VarricaoTotaisPorCategoria {
  varricao: number;
  lavacao: number;
  sanitario: number;
}

export interface VarricaoOrdemPayload {
  ordem?: VarricaoOrdemRegistro;
  mesReferencia: string;
  categoria?: VarricaoOrdemCategoria;
  locais: VarricaoOrdemLocal[];
  duplicatas?: VarricaoOrdemDuplicata[];
  subtotaisRegiao: VarricaoOrdemSubtotal[];
  subtotaisSecao: VarricaoOrdemSubtotal[];
  totaisPorCategoria?: VarricaoTotaisPorCategoria;
  totalLocais: number;
  totalMetragem: number;
  ordemExistente?: { id: number; numero: string; status: VarricaoOrdemStatus } | null;
  referenciaUsada?: { id: number; numero: string; mesReferencia: string } | null;
}

export interface VarricaoConfig {
  metragem_maxima_varricao: number | string | null;
  metragem_maxima_lavacao: number | string | null;
}

export function formatMesReferencia(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${nomes[m - 1]}/${y}`;
}

export function formatMetragem(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
