import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, MapPin, Ruler, Move, CheckCircle2, AlertTriangle, ImageIcon, Pencil } from "lucide-react";
import { VarricaoLocalFormDialog } from "./VarricaoLocalFormDialog";
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
import { VarricaoFotoThumb, type VarricaoFoto } from "./VarricaoFotoThumb";
import { SECAO_LABELS, dataLocalISO, formatDataBR } from "@/lib/varricao-utils";

type FotoLocal = VarricaoFoto;

interface VarricaoInfoCardProps {
  local: VarricaoLocalMapa;
  onClose: () => void;
  onAdjustPosition: () => void;
  isRelocating: boolean;
}

export function VarricaoInfoCard({ local, onClose, onAdjustPosition, isRelocating }: VarricaoInfoCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const podeExcluir = user?.role === "admin" || user?.role === "gestor" || user?.role === "fiscal";
  const podeEditar = podeExcluir;
  const hasCoords = local.lat != null && local.lng != null;
  // Padrão: últimas duas semanas
  const [inicio, setInicio] = useState(() => dataLocalISO(13));
  const [fim, setFim] = useState(() => dataLocalISO(0));
  const [fotoParaExcluir, setFotoParaExcluir] = useState<FotoLocal | null>(null);
  const [editando, setEditando] = useState(false);

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
          <div className="flex items-center gap-0.5 -mt-1 -mr-1">
            {podeEditar && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditando(true)}
                className="h-6 w-6 text-muted-foreground"
                title="Editar local"
                data-testid="button-edit-varricao-local"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {hasCoords && !isRelocating && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onAdjustPosition}
                className="h-6 w-6 text-blue-600 dark:text-blue-400"
                title="Ajustar Posição"
                data-testid="button-adjust-varricao-position"
              >
                <Move className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6"
              data-testid="button-close-varricao-card"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
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
              {fotos.map((f) => (
                <VarricaoFotoThumb
                  key={f.id}
                  foto={f}
                  localLat={local.lat}
                  localLng={local.lng}
                  podeExcluir={podeExcluir}
                  onExcluir={setFotoParaExcluir}
                />
              ))}
            </div>
          )}
        </div>

        {(!hasCoords || isRelocating) && (
          <>
            <Separator className="mb-3" />
            {!hasCoords ? (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                <MapPin className="h-3.5 w-3.5 inline mr-1.5" />
                Este pino âmbar (!) está no grupo de pendentes no centro do mapa.
                Arraste-o para o local correto — a posição é salva automaticamente.
              </div>
            ) : (
              <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300">
                <MapPin className="h-3.5 w-3.5 inline mr-1.5" />
                Clique no mapa ou arraste o pino para reposicionar.
              </div>
            )}
          </>
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

      {podeEditar && (
        <VarricaoLocalFormDialog open={editando} onOpenChange={setEditando} local={local} />
      )}
    </Card>
  );
}
