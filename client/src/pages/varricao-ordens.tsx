import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Plus, FileText, Trash2, MapPin, Settings, FileStack } from "lucide-react";
import { Link } from "wouter";
import { formatMesReferencia, formatMetragem, type VarricaoOrdemRegistro } from "@/lib/varricao-ordens-types";
import { VarricaoStatusBadge } from "@/components/VarricaoStatusBadge";
import { CATEGORIA_LABELS } from "@/lib/varricao-utils";
import { VarricaoDocumentoCombinadoDialog } from "@/components/VarricaoDocumentoCombinadoDialog";
import { useModoVisualizacao } from "@/hooks/use-modo-visualizacao";

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function VarricaoOrdensPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const modoVisualizacao = useModoVisualizacao();
  const podeEmitir = (user?.role === "admin" || user?.role === "fiscal") && !modoVisualizacao;
  const podeExcluir = (user?.role === "admin" || user?.role === "gestor" || user?.role === "fiscal") && !modoVisualizacao;
  const podeConfigurar = user?.role === "admin" || user?.role === "gestor";
  const [paraExcluir, setParaExcluir] = useState<VarricaoOrdemRegistro | null>(null);
  const [mostrarCombinado, setMostrarCombinado] = useState(false);

  const { data: ordens = [], isLoading } = useQuery<VarricaoOrdemRegistro[]>({
    queryKey: ["/api/varricao/ordens"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/ordens")).json(),
  });

  const excluirMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/varricao/ordens/${id}`);
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      toast({ title: "Ordem de serviço excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/ordens"] });
      setParaExcluir(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message }),
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Ordens de Serviço — Varrição</h1>
              <p className="text-sm text-muted-foreground">
                Documento mensal com os dias de varrição/lavação de cada local
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {podeConfigurar && (
              <Link href="/varricao/configuracoes">
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" /> Teto de Metragem
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={() => setMostrarCombinado(true)}>
              <FileStack className="h-4 w-4 mr-2" /> Documento Combinado
            </Button>
            {podeEmitir && (
              <Link href="/varricao/ordens/nova">
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> Nova OS
                </Button>
              </Link>
            )}
          </div>
        </div>

        {isLoading && <p className="text-center text-sm text-muted-foreground py-10">Carregando...</p>}

        {!isLoading && ordens.length === 0 && (
          <div className="text-center py-16 border rounded-lg">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma ordem de serviço emitida ainda.</p>
          </div>
        )}

        <div className="space-y-2">
          {ordens.map((o) => (
            <div key={o.id} className="border rounded-lg p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors">
              <Link href={`/varricao/ordens/${o.id}`} className="flex-1 min-w-0">
                <p className="font-medium flex items-center gap-2 flex-wrap">
                  OS {o.numero} <span className="text-muted-foreground font-normal">— {formatMesReferencia(o.mes_referencia)}</span>
                  <Badge
                    variant="outline"
                    className={o.categoria === "lavacao" ? "border-blue-400 text-blue-700 dark:text-blue-400" : "border-emerald-400 text-emerald-700 dark:text-emerald-400"}
                  >
                    {CATEGORIA_LABELS[o.categoria]}
                  </Badge>
                  <VarricaoStatusBadge status={o.status} />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                  <span>Emitida em {formatDataBR(o.data_emissao)}</span>
                  {o.emitido_por && <span>por {o.emitido_por}</span>}
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {o.total_locais ?? 0} locais
                  </span>
                  <span>{formatMetragem(Number(o.total_metragem ?? 0))} m²</span>
                </p>
              </Link>
              {podeExcluir && (
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                  onClick={() => setParaExcluir(o)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <AlertDialog open={!!paraExcluir} onOpenChange={(v) => !v && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ordem de serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              A OS {paraExcluir?.numero} ({paraExcluir && formatMesReferencia(paraExcluir.mes_referencia)}) será
              excluída permanentemente, junto com a lista de locais e dias vinculados. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={excluirMutation.isPending}
              onClick={() => paraExcluir && excluirMutation.mutate(paraExcluir.id)}
            >
              {excluirMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <VarricaoDocumentoCombinadoDialog open={mostrarCombinado} onOpenChange={setMostrarCombinado} />
    </div>
  );
}
