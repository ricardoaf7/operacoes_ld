import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useModoVisualizacao } from "@/hooks/use-modo-visualizacao";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, FileDown, FileSpreadsheet, Pencil, X, Save, Lock } from "lucide-react";
import { VarricaoOrdemConteudo } from "@/components/VarricaoOrdemConteudo";
import { VarricaoOrdemRascunho } from "@/components/VarricaoOrdemRascunho";
import { VarricaoStatusBadge } from "@/components/VarricaoStatusBadge";
import { exportarOrdemExcel, exportarOrdemPdf } from "@/lib/varricao-ordens-export";
import {
  formatMesReferencia,
  type VarricaoOrdemPayload, type VarricaoOrdemLocal, type VarricaoConfig,
} from "@/lib/varricao-ordens-types";
import { CATEGORIA_LABELS, categoriaDaSecao } from "@/lib/varricao-utils";

interface VarricaoLocalCompleto {
  id: number;
  nome: string;
  complemento: string | null;
  regiao: string | null;
  tipo: string | null;
  secao: string;
  frequencia: string;
  dias_semana: number[] | null;
  metragem_unica: string | null;
}

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function VarricaoOrdemDetalhePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const modoVisualizacao = useModoVisualizacao();
  const podeEditar = (user?.role === "admin" || user?.role === "fiscal") && !modoVisualizacao;
  const [, params] = useRoute("/varricao/ordens/:id");
  const id = params?.id;

  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<VarricaoOrdemLocal[] | null>(null);
  const [numero, setNumero] = useState("");
  const [dataEmissao, setDataEmissao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [confirmandoFinalizar, setConfirmandoFinalizar] = useState(false);

  const { data: payload, isLoading } = useQuery<VarricaoOrdemPayload>({
    queryKey: ["/api/varricao/ordens", id],
    queryFn: async () => (await apiRequest("GET", `/api/varricao/ordens/${id}`)).json(),
    enabled: !!id,
  });

  const { data: config } = useQuery<VarricaoConfig>({
    queryKey: ["/api/varricao/config"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/config")).json(),
  });

  const { data: todosLocaisBrutos = [] } = useQuery<VarricaoLocalCompleto[]>({
    queryKey: ["/api/varricao/locais"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/locais")).json(),
    enabled: editando,
  });
  // Só locais da mesma categoria da OS podem ser incluídos
  const todosLocais = payload?.ordem
    ? todosLocaisBrutos.filter((l) => categoriaDaSecao(l.secao) === payload.ordem!.categoria)
    : [];

  function iniciarEdicao() {
    if (!payload?.ordem) return;
    setRascunho(payload.locais);
    setNumero(payload.ordem.numero);
    setDataEmissao(payload.ordem.data_emissao.slice(0, 10));
    setObservacao(payload.ordem.observacao ?? "");
    setEditando(true);
  }

  const salvarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/varricao/ordens/${id}`, {
        numero: numero.trim(),
        dataEmissao,
        observacao: observacao.trim() || null,
        locais: (rascunho ?? []).map((l) => ({ localId: l.localId, dias: l.dias })),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Ordem de serviço atualizada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/ordens"] });
      setEditando(false);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro ao salvar", description: e.message }),
  });

  const finalizarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/varricao/ordens/${id}/finalizar`, {});
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "OS finalizada!", description: "Esta é a versão que vai para a contratada." });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/ordens", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/ordens"] });
      setConfirmandoFinalizar(false);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro ao finalizar", description: e.message }),
  });

  const podeSalvar = numero.trim().length > 0 && dataEmissao && (rascunho?.length ?? 0) > 0;
  const ehRascunho = payload?.ordem?.status === "rascunho";

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/varricao/ordens">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              {payload?.ordem && (
                <>
                  <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
                    OS {payload.ordem.numero}
                    <Badge
                      variant="outline"
                      className={payload.ordem.categoria === "lavacao" ? "border-blue-400 text-blue-700 dark:text-blue-400" : "border-emerald-400 text-emerald-700 dark:text-emerald-400"}
                    >
                      {CATEGORIA_LABELS[payload.ordem.categoria]}
                    </Badge>
                    <VarricaoStatusBadge status={payload.ordem.status} />
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {formatMesReferencia(payload.ordem.mes_referencia)} · Emitida em {formatDataBR(payload.ordem.data_emissao)}
                    {payload.ordem.emitido_por && ` por ${payload.ordem.emitido_por}`}
                    {payload.ordem.status === "finalizada" && payload.ordem.finalizado_em &&
                      ` · Finalizada em ${formatDataBR(payload.ordem.finalizado_em)}${payload.ordem.finalizado_por ? ` por ${payload.ordem.finalizado_por}` : ""}`}
                  </p>
                </>
              )}
            </div>
          </div>
          {payload && !editando && (
            <div className="flex gap-2">
              {podeEditar && ehRascunho && (
                <>
                  <Button variant="outline" size="sm" onClick={iniciarEdicao}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                  </Button>
                  <Button size="sm" onClick={() => setConfirmandoFinalizar(true)}>
                    <Lock className="h-3.5 w-3.5 mr-1.5" /> Finalizar
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => exportarOrdemExcel(payload)}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportarOrdemPdf(payload)}>
                <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
              </Button>
            </div>
          )}
          {editando && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditando(false)}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!podeSalvar || salvarMutation.isPending}
                onClick={() => salvarMutation.mutate()}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {salvarMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          )}
        </div>

        {!editando && payload?.ordem?.observacao && (
          <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm text-muted-foreground">
            {payload.ordem.observacao}
          </div>
        )}

        {!editando && payload?.ordem?.status === "finalizada" && (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            Esta OS está finalizada e não pode mais ser editada diretamente — é a versão enviada à contratada.
            Ajustes durante o mês precisam de outro processo.
          </div>
        )}

        {isLoading && <p className="text-center text-sm text-muted-foreground py-10">Carregando...</p>}
        {!isLoading && !payload && <p className="text-center text-sm text-muted-foreground py-10">Ordem de serviço não encontrada.</p>}

        {editando && rascunho && (
          <>
            <div className="border rounded-lg p-4 space-y-3 bg-card">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Número da OS *</Label>
                  <Input className="mt-1" value={numero} onChange={(e) => setNumero(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Data de Emissão *</Label>
                  <Input type="date" className="mt-1" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Observação (opcional)</Label>
                <Textarea
                  className="mt-1 h-16 resize-none"
                  value={observacao}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservacao(e.target.value)}
                />
              </div>
            </div>
            <VarricaoOrdemRascunho
              mesReferencia={payload!.mesReferencia}
              locais={rascunho}
              todosLocais={todosLocais}
              config={config}
              onChange={setRascunho}
            />
          </>
        )}

        {!editando && payload && <VarricaoOrdemConteudo payload={payload} config={config} />}
      </div>

      <AlertDialog open={confirmandoFinalizar} onOpenChange={setConfirmandoFinalizar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar esta OS?</AlertDialogTitle>
            <AlertDialogDescription>
              Depois de finalizada, esta OS não poderá mais ser editada diretamente — é a versão que será
              enviada à contratada. Se precisar de ajustes durante o mês, será necessário outro processo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={finalizarMutation.isPending}
              onClick={() => finalizarMutation.mutate()}
            >
              {finalizarMutation.isPending ? "Finalizando..." : "Finalizar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
