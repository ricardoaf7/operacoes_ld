import { Badge } from "@/components/ui/badge";
import type { VarricaoOrdemStatus } from "@/lib/varricao-ordens-types";

export function VarricaoStatusBadge({ status }: { status: VarricaoOrdemStatus }) {
  if (status === "finalizada") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-normal">
        Finalizada
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400 font-normal">
      Rascunho
    </Badge>
  );
}
