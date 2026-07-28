import { X, MapPin, Ruler, Move, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { VarricaoLocalMapa } from "./DashboardMap";

const SECAO_LABELS: Record<string, string> = {
  varricao: "Varrição",
  varricao_2turno: "Varrição — 2º turno",
  sanitarios: "Sanitários",
  lavagem_vias_noturna: "Lavagem de vias (noturna)",
  lavagem_pracas_noturna: "Lavagem de praças (noturna)",
  lavagem_vias_diurna: "Lavagem de vias (diurna)",
  lavagem_pracas_diurna: "Lavagem de praças (diurna)",
};

interface VarricaoInfoCardProps {
  local: VarricaoLocalMapa;
  onClose: () => void;
  onAdjustPosition: () => void;
  isRelocating: boolean;
}

export function VarricaoInfoCard({ local, onClose, onAdjustPosition, isRelocating }: VarricaoInfoCardProps) {
  const hasCoords = local.lat != null && local.lng != null;
  const metragem = local.metragem_unica
    ? Number(local.metragem_unica).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : null;

  return (
    <Card className="w-80 shadow-lg border-2" data-testid="varricao-info-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-sm leading-tight mb-1" data-testid="text-varricao-nome">
              {local.nome}
            </h3>
            {local.complemento && (
              <p className="text-xs text-muted-foreground">{local.complemento}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 -mt-1 -mr-1"
            data-testid="button-close-varricao-card"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="outline" className="font-normal">
            {SECAO_LABELS[local.secao] ?? local.secao}
          </Badge>
          {local.tipo && <Badge variant="outline" className="font-normal">{local.tipo}</Badge>}
          {local.regiao && <Badge variant="outline" className="font-normal">{local.regiao}</Badge>}
        </div>

        <div className="space-y-2 mb-4">
          {metragem && (
            <div className="flex items-center gap-2 text-xs">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Metragem:</span>
              <span className="font-medium">{metragem}</span>
            </div>
          )}

          {hasCoords ? (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                {local.geocode_status === "manual" ? "Posição ajustada manualmente" : "Localização confirmada"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Sem posição no mapa</span>
            </div>
          )}
        </div>

        <Separator className="mb-3" />

        {!hasCoords || isRelocating ? (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300">
            <MapPin className="h-3.5 w-3.5 inline mr-1.5" />
            {hasCoords
              ? "Clique no mapa ou arraste o pino para reposicionar."
              : "Clique no mapa onde fica este local para posicioná-lo."}
          </div>
        ) : (
          <Button
            onClick={onAdjustPosition}
            variant="outline"
            className="w-full h-9 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700"
            data-testid="button-adjust-varricao-position"
          >
            <Move className="h-3.5 w-3.5 mr-2" />
            Ajustar Posição
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
