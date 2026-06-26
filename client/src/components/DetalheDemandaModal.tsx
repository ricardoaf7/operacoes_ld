import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Trash2 } from "lucide-react";
import type { Demanda } from "@shared/schema";
import { STATUS_DEMANDA } from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em Andamento",
  concluida: "Concluída",
};

const STATUS_COLORS: Record<string, string> = {
  aberta: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  em_andamento: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  concluida: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
}

interface Props {
  demanda: Demanda | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function DetalheDemandaModal({ demanda, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (demanda) {
      setStatus(demanda.status);
      setObservacoes(demanda.observacoes ?? "");
    }
  }, [demanda]);

  const updateMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("PATCH", `/api/demandas/${demanda!.id}`, body);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Demanda atualizada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/demandas"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/demandas/${demanda!.id}`);
      if (!res.ok) throw new Error("Erro ao excluir");
    },
    onSuccess: () => {
      toast({ title: "Demanda excluída!" });
      queryClient.invalidateQueries({ queryKey: ["/api/demandas"] });
      onOpenChange(false);
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao excluir" }),
  });

  function gerarMensagemWhatsapp(): string {
    if (!demanda) return "";
    const nome = demanda.solicitanteNome.split(" ")[0];
    return `Olá ${nome}! Informamos que a sua solicitação de *${demanda.tipo}*, registrada em ${formatDate(demanda.dataSolicitacao)}, foi atendida pela CMTU. Agradecemos o contato. Qualquer dúvida, estamos à disposição. 🌿`;
  }

  function copiarWhatsapp() {
    navigator.clipboard.writeText(gerarMensagemWhatsapp()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const canDelete = user?.role === "admin" || user?.role === "gestor";
  const hasChanged = demanda && (status !== demanda.status || observacoes !== (demanda.observacoes ?? ""));

  if (!demanda) return null;

  const dados = demanda.dadosEspecificos as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="leading-snug pr-6">#{demanda.id} — {demanda.tipo}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge className={`text-xs px-2 py-0.5 border ${STATUS_COLORS[demanda.status]}`}>
              {STATUS_LABELS[demanda.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">→ Alterar:</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {STATUS_DEMANDA.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dados principais */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm rounded-lg border border-border p-3">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Origem</span>
              <p className="font-medium">{demanda.origem}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Data</span>
              <p className="font-medium">{formatDate(demanda.dataSolicitacao)}</p>
            </div>
            {demanda.numeroProcesso && (
              <div className="col-span-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Nº Processo</span>
                <p className="font-medium">{demanda.numeroProcesso}</p>
              </div>
            )}
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Solicitante</span>
              <p className="font-medium">{demanda.solicitanteNome}</p>
            </div>
            {demanda.solicitanteWhatsapp && (
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">WhatsApp</span>
                <p className="font-medium">{demanda.solicitanteWhatsapp}</p>
              </div>
            )}
            {demanda.solicitanteOrgao && (
              <div className="col-span-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Órgão / Vereador</span>
                <p className="font-medium">{demanda.solicitanteOrgao}</p>
              </div>
            )}
            {demanda.setorNome && (
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Setor</span>
                <p className="font-medium">{demanda.setorNome}</p>
              </div>
            )}
            {demanda.responsavelNome && (
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Responsável</span>
                <p className="font-medium">{demanda.responsavelNome}</p>
              </div>
            )}
          </div>

          {/* Campos específicos Capina e Roçagem */}
          {demanda.tipo === "Capina e Roçagem" && dados && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                Capina e Roçagem
              </p>
              {(dados.local || demanda.areaEndereco) && (
                <div>
                  <span className="text-xs text-muted-foreground">Local</span>
                  <p className="font-medium">{dados.local || demanda.areaEndereco}</p>
                  {demanda.areaId && (
                    <span className="text-xs text-emerald-600">✓ Área vinculada ao sistema</span>
                  )}
                </div>
              )}
              {dados.descricao && (
                <div>
                  <span className="text-xs text-muted-foreground">Descrição</span>
                  <p>{dados.descricao}</p>
                </div>
              )}
              {dados.observacao && (
                <div>
                  <span className="text-xs text-muted-foreground">Observação</span>
                  <p>{dados.observacao}</p>
                </div>
              )}
            </div>
          )}

          {/* Observações editáveis */}
          <div>
            <label className="text-sm font-medium">Observações</label>
            <Textarea className="mt-1 h-20 resize-none" placeholder="Adicionar observações..."
              value={observacoes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservacoes(e.target.value)} />
          </div>

          {/* WhatsApp para solicitante (quando concluída) */}
          {(status === "concluida" || demanda.status === "concluida") && demanda.solicitanteWhatsapp && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                Mensagem para o Solicitante
              </p>
              <p className="text-xs text-muted-foreground bg-background rounded p-2 border border-border">
                {gerarMensagemWhatsapp()}
              </p>
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={copiarWhatsapp}>
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado!" : "Copiar mensagem"}
              </Button>
              <p className="text-[10px] text-muted-foreground">
                WhatsApp: {demanda.solicitanteWhatsapp}
              </p>
            </div>
          )}

          {/* Rodapé */}
          <div className="flex items-center gap-2 pt-1">
            {canDelete && (
              !confirmDelete ? (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1.5"
                  onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Confirmar exclusão?</span>
                  <Button variant="destructive" size="sm" className="h-7 text-xs"
                    onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                    Sim
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setConfirmDelete(false)}>
                    Não
                  </Button>
                </div>
              )
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            {hasChanged && (
              <Button disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ status, observacoes: observacoes || undefined })}>
                {updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground text-right">
            Registrada em {formatDate(demanda.createdAt ?? null)}
            {demanda.dataConclusao && ` · Concluída em ${formatDate(demanda.dataConclusao)}`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
