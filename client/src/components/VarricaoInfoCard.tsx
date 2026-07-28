import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, MapPin, Ruler, Move, CheckCircle2, AlertTriangle, ImageIcon, Trash2, Navigation } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

interface FotoLocal {
  id: number;
  url: string;
  data_servico: string;
  created_at: string;
  enviado_por_nome: string | null;
  lat: number | null;
  lng: number | null;
}

interface VarricaoInfoCardProps {
  local: VarricaoLocalMapa;
  onClose: () => void;
  onAdjustPosition: () => void;
  isRelocating: boolean;
}

function dataLocalISO(diasAtras = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toLocaleDateString("en-CA");
}

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function VarricaoInfoCard({ local, onClose, onAdjustPosition, isRelocating }: VarricaoInfoCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const podeExcluir = user?.role === "admin" || user?.role === "gestor" || user?.role === "fiscal";
  const hasCoords = local.lat != null && local.lng != null;
  // Padrão: últimas duas semanas
  const [inicio, setInicio] = useState(() => dataLocalISO(13));
  const [fim, setFim] = useState(() => dataLocalISO(0));
  const [fotoParaExcluir, setFotoParaExcluir] = useState<FotoLocal | null>(null);

  const { data: fotos = [], isLoading: carregandoFotos } = useQuery<FotoLocal[]>({
    queryKey: ["/api/varricao/fotos", "local", local.id, inicio, fim],
    queryFn: async () =>
      (await apiRequest(
        "GET",
        `/api/varricao/fotos?localId=${local.id}&dataInicio=${inicio}&dataFim=${fim}`
      )).json(),
  });

  const excluirMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/varricao/fotos/${id}`);
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      toast({ title: "Foto excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/fotos"] });
      setFotoParaExcluir(null);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Erro ao excluir", description: e.message }),
  });

  const metragem = local.metragem_unica
    ? Number(local.metragem_unica).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : null;

  return (
    <Card className="w-80 shadow-lg border-2 max-h-[calc(100vh-120px)] overflow-y-auto" data-testid="varricao-info-card">
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

        {/* Fotos do local */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fotos {fotos.length > 0 && `(${fotos.length})`}
            </h4>
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <Input
              type="date"
              className="h-7 text-xs px-1.5"
              value={inicio}
              max={fim}
              onChange={(e) => setInicio(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">a</span>
            <Input
              type="date"
              className="h-7 text-xs px-1.5"
              value={fim}
              min={inicio}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          {carregandoFotos ? (
            <p className="text-xs text-muted-foreground py-2">Carregando fotos...</p>
          ) : fotos.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              Nenhuma foto no período.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {fotos.map((f) => {
                const dist = hasCoords && f.lat != null && f.lng != null
                  ? distanciaMetros(local.lat!, local.lng!, f.lat, f.lng)
                  : null;
                const distLonge = dist != null && dist > 100;
                return (
                  <div key={f.id} className="relative group">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                      title={`${formatDataBR(f.data_servico)}${f.enviado_por_nome ? ` — ${f.enviado_por_nome}` : ""}`}
                    >
                      <img
                        src={f.url}
                        alt={`Foto de ${formatDataBR(f.data_servico)}`}
                        className="aspect-square object-cover rounded-md border border-border group-hover:opacity-85 transition-opacity"
                        loading="lazy"
                      />
                      <span className="absolute bottom-0.5 right-0.5 bg-black/65 text-white text-[9px] px-1 rounded">
                        {formatDataBR(f.data_servico).slice(0, 5)}
                      </span>
                    </a>
                    {podeExcluir && (
                      <button
                        className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-red-600 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Excluir foto"
                        onClick={() => setFotoParaExcluir(f)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    {f.lat != null && f.lng != null ? (
                      <a
                        href={`https://www.google.com/maps?q=${f.lat},${f.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={
                          dist != null
                            ? `Foto tirada a ${Math.round(dist)}m do local cadastrado — ver no mapa`
                            : "Ver onde a foto foi tirada"
                        }
                        className={`absolute top-0.5 left-0.5 flex items-center gap-0.5 text-white text-[9px] px-1 py-0.5 rounded ${
                          distLonge ? "bg-amber-600" : "bg-black/60"
                        }`}
                      >
                        <Navigation className="h-2.5 w-2.5" />
                        {dist != null && `${dist < 1000 ? Math.round(dist) + "m" : (dist / 1000).toFixed(1) + "km"}`}
                      </a>
                    ) : (
                      <span
                        className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded"
                        title="Foto enviada sem GPS"
                      >
                        s/ GPS
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator className="mb-3" />

        {!hasCoords ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
            <MapPin className="h-3.5 w-3.5 inline mr-1.5" />
            Este pino âmbar (!) está no grupo de pendentes no centro do mapa.
            Arraste-o para o local correto — a posição é salva automaticamente.
          </div>
        ) : isRelocating ? (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300">
            <MapPin className="h-3.5 w-3.5 inline mr-1.5" />
            Clique no mapa ou arraste o pino para reposicionar.
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

      {createPortal(
        <AlertDialog open={!!fotoParaExcluir} onOpenChange={(v) => !v && setFotoParaExcluir(null)}>
          <AlertDialogContent className="z-[9999]">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir foto?</AlertDialogTitle>
              <AlertDialogDescription>
                A foto de {fotoParaExcluir ? formatDataBR(fotoParaExcluir.data_servico) : ""}
                {fotoParaExcluir?.enviado_por_nome ? ` enviada por ${fotoParaExcluir.enviado_por_nome}` : ""} será
                removida permanentemente. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={excluirMutation.isPending}
                onClick={() => fotoParaExcluir && excluirMutation.mutate(fotoParaExcluir.id)}
              >
                {excluirMutation.isPending ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>,
        document.body
      )}
    </Card>
  );
}
