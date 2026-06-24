import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Calendar, MapPin, Ruler, CheckCircle2, ChevronDown, ChevronUp, Hash, CalendarClock, Trash2, Edit2, Image as ImageIcon, Move, Undo2, Play, Square, FileText, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ServiceArea } from "@shared/schema";
import { formatDateBR } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PhotoGalleryModal } from "@/components/PhotoGalleryModal";
import { generateAreaPdf } from "@/components/AreaPdfDialog";

interface MapInfoCardProps {
  area: ServiceArea;
  onClose: () => void;
  onRegisterMowing?: () => void;
  onSetManualForecast?: () => void;
  onEdit?: () => void;
  onChangeLocation?: () => void;
  isRelocating?: boolean;
  isPublicView?: boolean;
}

export function MapInfoCard({ area, onClose, onRegisterMowing, onSetManualForecast, onEdit, onChangeLocation, isRelocating = false, isPublicView = false }: MapInfoCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isGestor = user?.role === "gestor";
  const canPerformActions = !isPublicView && !isGestor;
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUndoMowingConfirm, setShowUndoMowingConfirm] = useState(false);
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [fullArea, setFullArea] = useState<ServiceArea | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingHistoryIdx, setEditingHistoryIdx] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editObs, setEditObs] = useState("");
  const [deleteHistoryIdx, setDeleteHistoryIdx] = useState<number | null>(null);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    setFullArea(null);
    setIsExpanded(false);
  }, [area.id]);

  const fetchFullArea = async () => {
    if (fullArea) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/areas/${area.id}`);
      if (res.ok) {
        const data = await res.json();
        setFullArea(data);
      }
    } catch (err) {
      console.error("Error fetching full area:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleToggleHistory = () => {
    if (!isExpanded) {
      fetchFullArea();
    }
    setIsExpanded(!isExpanded);
  };

  const areaWithHistory = fullArea || area;

  const deleteHistoryMutation = useMutation({
    mutationFn: (idx: number) =>
      apiRequest("DELETE", `/api/areas/${area.id}/history/${idx}`),
    onSuccess: async () => {
      const res = await fetch(`/api/areas/${area.id}`);
      if (res.ok) setFullArea(await res.json());
      queryClient.invalidateQueries({ queryKey: ["/api/areas/rocagem"] });
      setDeleteHistoryIdx(null);
      toast({ title: "Entrada excluída do histórico" });
    },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  const editHistoryMutation = useMutation({
    mutationFn: ({ idx, date, observation }: { idx: number; date: string; observation: string }) =>
      apiRequest("PATCH", `/api/areas/${area.id}/history/${idx}`, {
        date,
        status: "Concluído",
        observation,
      }),
    onSuccess: async () => {
      const res = await fetch(`/api/areas/${area.id}`);
      if (res.ok) setFullArea(await res.json());
      queryClient.invalidateQueries({ queryKey: ["/api/areas/rocagem"] });
      setEditingHistoryIdx(null);
      toast({ title: "Histórico atualizado" });
    },
    onError: () => toast({ title: "Erro ao editar", variant: "destructive" }),
  });

  const deleteAreaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/areas/${area.id}`, {});
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Área Deletada",
        description: `${area.endereco} foi removida com sucesso.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
      onClose();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erro ao Deletar",
        description: "Não foi possível deletar a área.",
      });
    },
  });

  const undoMowingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/areas/${area.id}/rocagem`, {});
      return await res.json();
    },
    onSuccess: (response) => {
      toast({
        title: "Roçagem Desfeita",
        description: `O registro de roçagem foi removido de ${area.endereco}.`,
      });
      
      // Atualizar cache localmente para evitar re-fetch (preserva zoom do mapa)
      const updatedArea = response.area;
      if (updatedArea) {
        queryClient.setQueryData(["/api/areas/light", "rocagem"], (old: ServiceArea[] | undefined) => {
          if (!old) return old;
          return old.map(a => a.id === updatedArea.id ? updatedArea : a);
        });
        queryClient.setQueryData(["/api/areas", area.id], updatedArea);
      } else {
        // Fallback: invalidar se não tiver dados atualizados
        queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
        queryClient.invalidateQueries({ queryKey: ["/api/areas", area.id] });
      }
      onClose();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erro ao Desfazer",
        description: "Não foi possível desfazer o registro de roçagem.",
      });
    },
  });
  const getDaysUntilMowing = (): number | null => {
    if (!area.proximaPrevisao) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const previsao = new Date(area.proximaPrevisao);
    previsao.setHours(0, 0, 0, 0);
    const diffTime = previsao.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const toggleExecutandoMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/areas/${area.id}/executando`, {
        executando: !area.executando,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light"] });
      queryClient.invalidateQueries({ queryKey: ["/api/areas", area.id] });
      toast({
        title: area.executando ? "Execução encerrada" : "Marcado como Executando",
        description: area.executando 
          ? `${area.endereco} não está mais em execução.`
          : `${area.endereco} foi marcado como em execução.`,
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível alterar o status de execução.",
        variant: "destructive",
      });
    },
  });

  const daysUntil = getDaysUntilMowing();
  const isExecuting = area.executando === true;
  const isRocagem = area.servico === "rocagem" || !area.servico;

  return (
    <Card className="w-80 shadow-lg border-2 max-h-[calc(100vh-120px)] overflow-y-auto" data-testid="map-info-card">
      <CardContent className="p-4">
        {/* Header com botão fechar */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-sm leading-tight mb-1" data-testid="text-area-endereco">
              {area.endereco}
            </h3>
            {area.bairro && (
              <p className="text-xs text-muted-foreground">{area.bairro}</p>
            )}
            {area.lote && (
              <p className="text-xs text-muted-foreground" data-testid="text-lote">
                Lote {area.lote}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 -mt-1 -mr-1"
            data-testid="button-close-map-card"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Status Badge */}
        {isExecuting && (
          <Badge variant="default" className="mb-3 bg-green-600" data-testid="badge-em-execucao">
            Em Execução
          </Badge>
        )}

        {/* Informações principais */}
        <div className="space-y-2 mb-4">
          {area.metragem_m2 && (
            <div className="flex items-center gap-2 text-xs">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Metragem:</span>
              <span className="font-medium" data-testid="text-metragem">
                {area.metragem_m2.toLocaleString('pt-BR')} m²
              </span>
            </div>
          )}

          {isRocagem && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Última Roçagem:</span>
                <span className="font-medium" data-testid="text-ultima-rocagem">
                  {area.ultimaRocagem ? formatDateBR(area.ultimaRocagem) : "Nunca roçada"}
                </span>
              </div>

              {area.proximaPrevisao && (
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Previsão:</span>
                  <span className="font-medium" data-testid="text-previsao">
                    {formatDateBR(area.proximaPrevisao)}
                    {daysUntil !== null && (
                      <span className="ml-1 text-muted-foreground">
                        ({daysUntil === 0 ? 'hoje' : daysUntil === 1 ? 'amanhã' : `${daysUntil} dias`})
                      </span>
                    )}
                  </span>
                  {area.manualSchedule && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700" data-testid="badge-manual-forecast">
                      <CalendarClock className="h-2.5 w-2.5 mr-0.5" />
                      Manual
                    </Badge>
                  )}
                </div>
              )}
            </>
          )}

        </div>

        {isExpanded && (
          <>
            <Separator className="mb-4" />
            
            <div className="space-y-3 mb-4">
              <h4 className="font-semibold text-xs uppercase text-muted-foreground">
                Histórico de Roçagens
              </h4>
              
              {loadingHistory ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                  <span className="ml-2 text-xs text-muted-foreground">Carregando histórico...</span>
                </div>
              ) : areaWithHistory.history && areaWithHistory.history.length > 0 ? (
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {[...areaWithHistory.history]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((entry, displayIdx) => {
                      const realIdx = areaWithHistory.history.findIndex(
                        (h) => h.date === entry.date && h.observation === entry.observation
                      );
                      const isEditing = editingHistoryIdx === realIdx;
                      return (
                        <div key={displayIdx} className="text-xs p-2 bg-muted/30 rounded">
                          {isEditing ? (
                            <div className="space-y-1">
                              <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="w-full text-xs border rounded px-1 py-0.5 bg-background"
                              />
                              <input
                                type="text"
                                value={editObs}
                                onChange={(e) => setEditObs(e.target.value)}
                                placeholder="Observação"
                                className="w-full text-xs border rounded px-1 py-0.5 bg-background"
                              />
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  className="h-6 text-[10px] flex-1"
                                  onClick={() => editHistoryMutation.mutate({ idx: realIdx, date: editDate, observation: editObs })}
                                  disabled={editHistoryMutation.isPending}
                                >
                                  Salvar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px]"
                                  onClick={() => setEditingHistoryIdx(null)}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between items-start gap-2">
                                <span className="font-medium">{formatDateBR(entry.date)}</span>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                                    {entry.status}
                                  </Badge>
                                  {isAdmin && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingHistoryIdx(realIdx);
                                          setEditDate(entry.date);
                                          setEditObs(entry.observation || "");
                                        }}
                                        className="text-muted-foreground hover:text-blue-500 ml-1"
                                        title="Editar"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      <button
                                        onClick={() => setDeleteHistoryIdx(realIdx)}
                                        className="text-muted-foreground hover:text-red-500"
                                        title="Excluir"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {entry.observation && (
                                <p className="text-muted-foreground mt-1 text-[11px]">
                                  {entry.observation}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum registro de roçagem encontrado.</p>
              )}

              <Button
                variant="outline"
                disabled={loadingHistory}
                onClick={() => {
                  try {
                    const doc = generateAreaPdf(areaWithHistory);
                    const blob = doc.output("blob");
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                  } catch (err) {
                    console.error("Error generating PDF:", err);
                  }
                }}
                className="w-full h-8"
                data-testid="button-print-pdf"
              >
                <FileText className="h-3.5 w-3.5 mr-2" />
                Imprimir PDF
              </Button>
            </div>
          </>
        )}

        {/* Botões de ação */}
        <div className="flex flex-col gap-2">
          {canPerformActions && isRocagem && (
            <>
              <Button
                onClick={() => toggleExecutandoMutation.mutate()}
                variant={isExecuting ? "destructive" : "default"}
                className="w-full"
                data-testid="button-toggle-executando"
                disabled={toggleExecutandoMutation.isPending}
              >
                {isExecuting ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    {toggleExecutandoMutation.isPending ? "Salvando..." : "Parar Execução"}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {toggleExecutandoMutation.isPending ? "Salvando..." : "Marcar Executando"}
                  </>
                )}
              </Button>

              <Button
                onClick={onRegisterMowing}
                className="w-full h-9 bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-register-mowing"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Registrar Roçagem
              </Button>

              {area.ultimaRocagem && (
                <Button
                  onClick={() => setShowUndoMowingConfirm(true)}
                  variant="outline"
                  className="w-full h-9 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950"
                  data-testid="button-undo-mowing"
                  disabled={undoMowingMutation.isPending}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Desfazer Roçagem
                </Button>
              )}

              <Button
                onClick={onSetManualForecast}
                variant="outline"
                className="w-full h-9 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                data-testid="button-set-manual-forecast"
              >
                <CalendarClock className="h-4 w-4 mr-2" />
                Definir Previsão Manual
              </Button>
            </>
          )}

          <Button
            onClick={() => setShowPhotoGallery(true)}
            variant="outline"
            className="w-full h-9"
            data-testid="button-open-photo-gallery"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Fotos {(area.fotos?.length || 0) > 0 && `(${area.fotos?.length})`}
          </Button>
          
          <Button
            variant="outline"
            onClick={handleToggleHistory}
            className="w-full h-8"
            data-testid="button-view-details"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-2" />
                Ocultar Histórico
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-2" />
                Histórico
              </>
            )}
          </Button>

          {canPerformActions && (
            <>
              <Separator />

              {onChangeLocation && (
                <Button
                  onClick={onChangeLocation}
                  variant={isRelocating ? "default" : "outline"}
                  className={`w-full h-8 ${isRelocating 
                    ? "bg-blue-600 hover:bg-blue-700 text-white" 
                    : "text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700"}`}
                  data-testid="button-change-location"
                >
                  <Move className="h-3.5 w-3.5 mr-1" />
                  {isRelocating ? "Clique no Novo Local" : "Mudar Localização"}
                </Button>
              )}

              <div className="flex gap-2">
                {onEdit && (
                  <Button
                    onClick={onEdit}
                    variant="outline"
                    className="flex-1 h-8 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700"
                    data-testid="button-edit-area"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                )}
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="outline"
                  className="flex-1 h-8 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                  data-testid="button-delete-area"
                  disabled={deleteAreaMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Deletar
                </Button>
              </div>
            </>
          )}
        </div>

        <PhotoGalleryModal
          area={area}
          open={showPhotoGallery}
          onOpenChange={setShowPhotoGallery}
          readOnly={isPublicView || isGestor}
        />

      </CardContent>

      {/* Dialogs renderizados via Portal com z-index alto para ficar acima do card (z-1000) */}
      {createPortal(
        <>
          <AlertDialog open={deleteHistoryIdx !== null} onOpenChange={(open) => !open && setDeleteHistoryIdx(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir entrada do histórico?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex gap-2 justify-end">
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteHistoryIdx !== null && deleteHistoryMutation.mutate(deleteHistoryIdx)}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={deleteHistoryMutation.isPending}
                >
                  {deleteHistoryMutation.isPending ? "Excluindo..." : "Excluir"}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent data-testid="dialog-delete-confirm">
              <AlertDialogHeader>
                <AlertDialogTitle>Deletar Área?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja deletar {area.endereco}? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex gap-2 justify-end">
                <AlertDialogCancel data-testid="button-cancel-delete">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteAreaMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={deleteAreaMutation.isPending}
                  data-testid="button-confirm-delete"
                >
                  {deleteAreaMutation.isPending ? "Deletando..." : "Deletar"}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={showUndoMowingConfirm} onOpenChange={setShowUndoMowingConfirm}>
            <AlertDialogContent data-testid="dialog-undo-mowing-confirm">
              <AlertDialogHeader>
                <AlertDialogTitle>Desfazer Roçagem?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja desfazer o registro de roçagem de {area.endereco}?
                  {area.ultimaRocagem && (
                    <span className="block mt-2 font-medium">
                      Data registrada: {formatDateBR(area.ultimaRocagem)}
                      {area.registradoPor && ` (por ${area.registradoPor})`}
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex gap-2 justify-end">
                <AlertDialogCancel data-testid="button-cancel-undo-mowing">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => undoMowingMutation.mutate()}
                  className="bg-orange-600 hover:bg-orange-700"
                  disabled={undoMowingMutation.isPending}
                  data-testid="button-confirm-undo-mowing"
                >
                  {undoMowingMutation.isPending ? "Desfazendo..." : "Desfazer Roçagem"}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </>,
        document.body
      )}
    </Card>
  );
}
