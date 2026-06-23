import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, MapPin, Users, Clock, CheckCircle, Play } from "lucide-react";
import type { ServiceArea, Team } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/utils";

interface AreaDetailsModalProps {
  area: ServiceArea;
  teams: Team[];
  onClose: () => void;
}

export function AreaDetailsModal({ area, teams, onClose }: AreaDetailsModalProps) {
  const { toast } = useToast();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  const idleTeams = teams.filter((t) => (t.service === "rocagem" || !t.service) && t.status === "Idle");

  const startServiceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/areas/${area.id}/status`, {
        status: "Em Execução",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
      toast({
        title: "Serviço Iniciado",
        description: `O serviço em ${area.endereco} foi iniciado.`,
      });
      onClose();
    },
  });

  const completeServiceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/areas/${area.id}/status`, {
        status: "Concluído",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
      toast({
        title: "Serviço Concluído",
        description: `O serviço em ${area.endereco} foi marcado como concluído.`,
      });
      onClose();
    },
  });

  const assignTeamMutation = useMutation({
    mutationFn: async (teamId: number) => {
      return await apiRequest("PATCH", `/api/teams/${teamId}/assign`, {
        areaId: area.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({
        title: "Equipe Atribuída",
        description: "A equipe foi atribuída com sucesso.",
      });
      onClose();
    },
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Em Execução":
        return "default";
      case "Concluído":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" data-testid="modal-area-details">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-xl mb-2">{area.endereco}</DialogTitle>
              <Badge variant={getStatusBadgeVariant(area.status)} data-testid={`badge-status-${area.status.toLowerCase().replace(/\s/g, '-')}`}>
                {area.status}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Detalhes da Área
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {area.bairro && (
                <div>
                  <span className="text-muted-foreground">Bairro:</span>
                  <p className="font-medium" data-testid="text-bairro">{area.bairro}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Tipo:</span>
                <p className="font-medium" data-testid="text-tipo">{area.tipo}</p>
              </div>
              {area.metragem_m2 && (
                <div>
                  <span className="text-muted-foreground">Metragem:</span>
                  <p className="font-medium font-mono" data-testid="text-metragem">
                    {area.metragem_m2.toLocaleString('pt-BR')} m²
                  </p>
                </div>
              )}
              {area.lote && (
                <div>
                  <span className="text-muted-foreground">Lote:</span>
                  <p className="font-medium" data-testid="text-lote">{area.lote}</p>
                </div>
              )}
            </div>
          </section>

          {area.scheduledDate && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Próximo Serviço
                </h3>
                <div className="bg-muted/50 rounded-md p-4">
                  <p className="text-sm">
                    Próxima roçagem estimada em:{" "}
                    <span className="font-semibold" data-testid="text-scheduled-date">
                      {formatDateBR(area.scheduledDate)}
                    </span>
                  </p>
                </div>
              </section>
            </>
          )}

          {area.history && area.history.length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Histórico de Serviço
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {area.history.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 text-sm p-2 rounded-md hover-elevate"
                    >
                      <CheckCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium">{item.status}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateBR(item.date)}
                        </p>
                        {item.observation && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.observation}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <Separator />

          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Atribuir Equipe
            </h3>
            <div className="flex gap-3">
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger className="flex-1" data-testid="select-team">
                  <SelectValue placeholder="Selecione uma equipe disponível" />
                </SelectTrigger>
                <SelectContent>
                  {idleTeams.length === 0 ? (
                    <SelectItem value="none" disabled data-testid="option-no-teams">
                      Nenhuma equipe disponível
                    </SelectItem>
                  ) : (
                    idleTeams.map((team) => (
                      <SelectItem 
                        key={team.id} 
                        value={team.id.toString()}
                        data-testid={`option-team-${team.id}`}
                      >
                        Equipe {team.id} - {team.type} {team.lote && `(Lote ${team.lote})`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={() => assignTeamMutation.mutate(Number(selectedTeamId))}
                disabled={!selectedTeamId || assignTeamMutation.isPending}
                data-testid="button-assign-team"
              >
                {assignTeamMutation.isPending ? "Atribuindo..." : "Atribuir"}
              </Button>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          {area.status === "Pendente" && (
            <Button
              onClick={() => startServiceMutation.mutate()}
              disabled={startServiceMutation.isPending}
              className="gap-2"
              data-testid="button-start-service"
            >
              <Play className="h-4 w-4" />
              {startServiceMutation.isPending ? "Iniciando..." : "Iniciar Serviço"}
            </Button>
          )}
          {area.status === "Em Execução" && (
            <Button
              onClick={() => completeServiceMutation.mutate()}
              disabled={completeServiceMutation.isPending}
              className="gap-2"
              data-testid="button-complete-service"
            >
              <CheckCircle className="h-4 w-4" />
              {completeServiceMutation.isPending ? "Concluindo..." : "Concluir Serviço"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} data-testid="button-close-modal">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
