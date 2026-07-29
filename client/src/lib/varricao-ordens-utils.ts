// Helpers de edição do rascunho da OS — espelham (client-side, só para exibição
// responsiva) a lógica que o servidor recalcula com autoridade ao salvar.

export function diasUteisDoMes(ano: number, mes: number): number[] {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias: number[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const diaSemana = new Date(ano, mes - 1, d).getDay();
    if (diaSemana >= 1 && diaSemana <= 6) dias.push(d);
  }
  return dias;
}

export function diasDoMesParaLocal(
  local: { frequencia: string; dias_semana: number[] | null },
  ano: number,
  mes: number
): number[] {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias: number[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const diaSemana = new Date(ano, mes - 1, d).getDay();
    const programado = local.frequencia === "diario"
      ? diaSemana >= 1 && diaSemana <= 6
      : (local.dias_semana ?? []).includes(diaSemana);
    if (programado) dias.push(d);
  }
  return dias;
}

export function formatarDiasTexto(dias: number[], diasUteis: number[]): string {
  const ehDiarioCompleto = dias.length === diasUteis.length && dias.every((d, i) => d === diasUteis[i]);
  if (ehDiarioCompleto) return "Diário (seg. a sáb.)";
  if (dias.length === 0) return "—";
  const strs = [...dias].sort((a, b) => a - b).map((d) => String(d).padStart(2, "0"));
  if (strs.length === 1) return strs[0];
  return strs.slice(0, -1).join(", ") + " e " + strs[strs.length - 1];
}

import type { VarricaoOrdemLocal, VarricaoOrdemSubtotal } from "./varricao-ordens-types";

export function calcularSubtotais(
  locais: VarricaoOrdemLocal[],
  campo: "regiao" | "secao"
): VarricaoOrdemSubtotal[] {
  const m = new Map<string, { quantidade: number; metragemTotal: number }>();
  locais.forEach((l) => {
    const chave = (l[campo] ?? "Sem definição") as string;
    if (!m.has(chave)) m.set(chave, { quantidade: 0, metragemTotal: 0 });
    const acc = m.get(chave)!;
    acc.quantidade++;
    acc.metragemTotal += l.metragemTotal;
  });
  return Array.from(m.entries())
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => b.metragemTotal - a.metragemTotal);
}
