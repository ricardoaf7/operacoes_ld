import { useSyncExternalStore } from "react";
import { getModoVisualizacao, subscribeModoVisualizacao } from "@/lib/queryClient";

// Estado do "Modo Visualização" (fiscal de contrato consultando o serviço
// que não é dele, sem poder editar) — vive fora da árvore React porque
// precisa ser lido tanto pelo Dashboard (o botão) quanto pelo App.tsx (o
// gate de rota), que não compartilham um ancestral comum.
export function useModoVisualizacao(): boolean {
  return useSyncExternalStore(subscribeModoVisualizacao, getModoVisualizacao, () => false);
}
