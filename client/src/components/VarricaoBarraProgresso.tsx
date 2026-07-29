import { AlertTriangle } from "lucide-react";
import { formatMetragem } from "@/lib/varricao-ordens-types";

interface VarricaoBarraProgressoProps {
  label: string;
  atual: number;
  maximo: number | null;
}

export function VarricaoBarraProgresso({ label, atual, maximo }: VarricaoBarraProgressoProps) {
  const pct = maximo ? Math.min(100, (atual / maximo) * 100) : 0;
  const estourou = maximo != null && atual > maximo;
  return (
    <div className="bg-card border rounded-xl p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${estourou ? "text-red-600 dark:text-red-400" : ""}`}>
        {formatMetragem(atual)} m²
        {maximo != null && (
          <span className="text-sm font-normal text-muted-foreground"> / {formatMetragem(maximo)} m²</span>
        )}
      </p>
      {maximo != null ? (
        <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full transition-all ${estourou ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-2">Sem teto configurado</p>
      )}
      {estourou && (
        <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Acima do teto contratual
        </p>
      )}
    </div>
  );
}
