import { useState } from "react";
import { X, Edit3, Calendar, MapPin, Ruler, Hash, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ServiceArea } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/utils";
import { AREA_TIPOS_PADRAO } from "./NewAreaModal";

const CUSTOM_VALUE = "__custom__";

interface AreaInfoCardProps {
  area: ServiceArea;
  onClose: () => void;
  onUpdate?: (updatedArea: ServiceArea) => void;
}

export function AreaInfoCard({ area, onClose, onUpdate }: AreaInfoCardProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showCustomTipo, setShowCustomTipo] = useState(false);
  const [editedData, setEditedData] = useState({
    endereco: area.endereco,
    bairro: area.bairro || "",
    metragem_m2: area.metragem_m2 || 0,
    lote: area.lote || 1,
    tipo: area.tipo || "",
  });

  const updateAreaMutation = useMutation({
    mutationFn: async (data: Partial<ServiceArea>): Promise<ServiceArea> => {
      const res = await apiRequest("PATCH", `/api/areas/${area.id}`, data);
      return await res.json() as ServiceArea;
    },
    onSuccess: (updatedArea: ServiceArea) => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
      toast({
        title: "Area Atualizada",
        description: "As informacoes da area foram atualizadas com sucesso.",
      });
      setIsEditing(false);
      setShowCustomTipo(false);
      if (onUpdate) {
        onUpdate(updatedArea);
      }
    },
  });

  const handleSave = () => {
    updateAreaMutation.mutate(editedData);
  };

  const handleCancel = () => {
    setEditedData({
      endereco: area.endereco,
      bairro: area.bairro || "",
      metragem_m2: area.metragem_m2 || 0,
      lote: area.lote || 1,
      tipo: area.tipo || "",
    });
    setIsEditing(false);
    setShowCustomTipo(false);
  };

  const handleStartEditing = () => {
    setEditedData({
      endereco: area.endereco,
      bairro: area.bairro || "",
      metragem_m2: area.metragem_m2 || 0,
      lote: area.lote || 1,
      tipo: area.tipo || "",
    });
    const currentTipo = area.tipo || "";
    const isKnownTipo = AREA_TIPOS_PADRAO.some(
      (t) => t.toLowerCase() === currentTipo.toLowerCase()
    );
    setShowCustomTipo(currentTipo !== "" && !isKnownTipo);
    setIsEditing(true);
  };

  const tipoSelectValue = (() => {
    if (showCustomTipo) return CUSTOM_VALUE;
    const match = AREA_TIPOS_PADRAO.find(
      (t) => t.toLowerCase() === (editedData.tipo || "").toLowerCase()
    );
    return match || "";
  })();

  const handleTipoSelectChange = (value: string) => {
    if (value === CUSTOM_VALUE) {
      setShowCustomTipo(true);
      setEditedData({ ...editedData, tipo: "" });
    } else {
      setShowCustomTipo(false);
      setEditedData({ ...editedData, tipo: value });
    }
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold mb-2">
              Informacoes da Area
            </CardTitle>
            {area.status && typeof area.status === 'string' && (
              <Badge variant="outline" data-testid={`badge-status-${area.status.toLowerCase().replace(/\s/g, '-')}`}>
                {area.status}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-card"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              {isEditing ? (
                <div>
                  <Label htmlFor="endereco" className="text-xs">Localizacao</Label>
                  <Input
                    id="endereco"
                    value={editedData.endereco}
                    onChange={(e) =>
                      setEditedData({ ...editedData, endereco: e.target.value })
                    }
                    className="mt-1 h-8"
                    data-testid="input-endereco"
                  />
                </div>
              ) : (
                <div>
                  <p className="text-xs text-muted-foreground">Localizacao</p>
                  <p className="text-sm font-medium" data-testid="text-endereco">
                    {area.endereco}
                  </p>
                </div>
              )}
            </div>
          </div>

          {(area.bairro || isEditing) && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                {isEditing ? (
                  <div>
                    <Label htmlFor="bairro" className="text-xs">Bairro</Label>
                    <Input
                      id="bairro"
                      value={editedData.bairro}
                      onChange={(e) =>
                        setEditedData({ ...editedData, bairro: e.target.value })
                      }
                      className="mt-1 h-8"
                      data-testid="input-bairro"
                    />
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground">Bairro</p>
                    <p className="text-sm font-medium" data-testid="text-bairro">
                      {area.bairro}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(area.tipo || isEditing) && (
            <div className="flex items-start gap-3">
              <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                {isEditing ? (
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    {showCustomTipo ? (
                      <div className="flex gap-1 mt-1">
                        <Input
                          value={editedData.tipo}
                          onChange={(e) =>
                            setEditedData({ ...editedData, tipo: e.target.value })
                          }
                          placeholder="Digite o tipo"
                          className="h-8"
                          data-testid="input-tipo-custom"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setShowCustomTipo(false);
                            const fallback = AREA_TIPOS_PADRAO[0];
                            setEditedData({ ...editedData, tipo: fallback });
                          }}
                          data-testid="button-tipo-back"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Select
                        value={tipoSelectValue}
                        onValueChange={handleTipoSelectChange}
                      >
                        <SelectTrigger className="mt-1 h-8" data-testid="select-tipo">
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {AREA_TIPOS_PADRAO.map((tipo) => (
                            <SelectItem key={tipo} value={tipo}>
                              {tipo}
                            </SelectItem>
                          ))}
                          <SelectItem value={CUSTOM_VALUE}>+ Outro (digitar)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="text-sm font-medium" data-testid="text-tipo">{area.tipo}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {area.scheduledDate && (
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Previsao Atual</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium" data-testid="text-previsao">
                    {formatDateBR(area.scheduledDate)}
                  </p>
                  <Badge 
                    variant="secondary" 
                    className="text-xs" 
                    data-testid={area.manualSchedule ? "badge-manual" : "badge-automatico"}
                  >
                    {area.manualSchedule ? "Manual" : "Automatico"}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {area.proximaPrevisao && (
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Proxima Previsao</p>
                <p className="text-sm font-medium" data-testid="text-proxima-previsao">
                  {formatDateBR(area.proximaPrevisao)}
                </p>
              </div>
            </div>
          )}

          {area.ultimaRocagem && (
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-emerald-500 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Ultima Rocagem</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-ultima-rocagem">
                  {formatDateBR(area.ultimaRocagem)}
                </p>
              </div>
            </div>
          )}

          {(area.metragem_m2 || isEditing) && (
            <div className="flex items-start gap-3">
              <Ruler className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                {isEditing ? (
                  <div>
                    <Label htmlFor="metragem" className="text-xs">Area (m2)</Label>
                    <Input
                      id="metragem"
                      type="number"
                      value={editedData.metragem_m2}
                      onChange={(e) =>
                        setEditedData({
                          ...editedData,
                          metragem_m2: Number(e.target.value),
                        })
                      }
                      className="mt-1 h-8"
                      data-testid="input-metragem"
                    />
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground">Area</p>
                    <p className="text-sm font-medium font-mono" data-testid="text-metragem">
                      {area.metragem_m2?.toLocaleString('pt-BR')} m2
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(area.lote || isEditing) && (
            <div className="flex items-start gap-3">
              <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                {isEditing ? (
                  <div>
                    <Label className="text-xs">Lote</Label>
                    <Select
                      value={String(editedData.lote)}
                      onValueChange={(val) =>
                        setEditedData({ ...editedData, lote: Number(val) })
                      }
                    >
                      <SelectTrigger className="mt-1 h-8" data-testid="select-lote">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground">Lote</p>
                    <p className="text-sm font-medium" data-testid="text-lote">{area.lote}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {area.history && area.history.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-xs font-semibold">Historico</h4>
              </div>
              <ul className="space-y-1 text-xs">
                {area.history.slice(0, 5).reverse().map((item, index) => {
                  const isForecast = item.type === 'forecast';
                  return (
                    <li key={index} className={isForecast ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"}>
                      {isForecast ? 'Previsao:' : 'Ultima Rocagem:'} {formatDateBR(item.date)}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        <Separator />

        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="flex-1"
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateAreaMutation.isPending}
                className="flex-1"
                data-testid="button-save-edit"
              >
                {updateAreaMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartEditing}
              className="w-full"
              data-testid="button-edit"
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
