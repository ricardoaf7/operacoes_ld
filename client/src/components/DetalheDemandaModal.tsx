import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Trash2, Pencil, X } from "lucide-react";
import type { Demanda, Setor } from "@shared/schema";
import { STATUS_DEMANDA, ORIGENS_DEMANDA, TIPOS_DEMANDA } from "@shared/schema";

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
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return String(d); }
}
function toInputDate(d: string | null | undefined): string {
  if (!d) return "";
  try { return new Date(d).toISOString().split("T")[0]; } catch { return ""; }
}

interface UserData { id: number; nome: string; setorId: number | null; }

interface Props {
  demanda: Demanda | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function DetalheDemandaModal({ demanda, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();

  // Modo visualização
  const [status, setStatus] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Modo edição
  const [editMode, setEditMode] = useState(false);
  const [eOrigem, setEOrigem] = useState("");
  const [eProtocolo, setEProtocolo] = useState("");
  const [eDataSolicitacao, setEDataSolicitacao] = useState("");
  const [eSolicitanteNome, setESolicitanteNome] = useState("");
  const [eSolicitanteWhatsapp, setESolicitanteWhatsapp] = useState("");
  const [eSolicitanteOrgao, setESolicitanteOrgao] = useState("");
  const [eTipo, setETipo] = useState("");
  const [eSetorId, setESetorId] = useState("");
  const [eResponsavelId, setEResponsavelId] = useState("");
  // Campos Capina e Roçagem
  const [eCrLocal, setECrLocal] = useState("");
  const [eCrDescricao, setECrDescricao] = useState("");
  const [eCrObservacao, setECrObservacao] = useState("");

  const { data: setores = [] } = useQuery<Setor[]>({
    queryKey: ["/api/setores"],
    queryFn: async () => (await apiRequest("GET", "/api/setores")).json(),
    enabled: open && editMode,
  });

  const { data: users = [] } = useQuery<UserData[]>({
    queryKey: ["/api/users/list"],
    queryFn: async () => (await apiRequest("GET", "/api/users/list")).json(),
    enabled: open && editMode,
  });

  const setoresPai = setores.filter(s => s.ativo && !s.parentId);
  const setoresFilhos = setores.filter(s => s.ativo && s.parentId);
  const usuariosDoSetor = eSetorId ? users.filter(u => String(u.setorId) === eSetorId) : users;

  useEffect(() => {
    if (demanda) {
      setStatus(demanda.status);
      setObservacoes(demanda.observacoes ?? "");
    }
  }, [demanda]);

  function abrirEdicao() {
    if (!demanda) return;
    setEOrigem(demanda.origem);
    setEProtocolo(demanda.numeroProcesso ?? "");
    setEDataSolicitacao(toInputDate(demanda.dataSolicitacao));
    setESolicitanteNome(demanda.solicitanteNome);
    setESolicitanteWhatsapp(demanda.solicitanteWhatsapp ?? "");
    setESolicitanteOrgao(demanda.solicitanteOrgao ?? "");
    setETipo(demanda.tipo);
    setESetorId(demanda.setorId ? String(demanda.setorId) : "");
    setEResponsavelId(demanda.responsavelId ? String(demanda.responsavelId) : "");
    const d = demanda.dadosEspecificos as any;
    setECrLocal(d?.local ?? "");
    setECrDescricao(d?.descricao ?? "");
    setECrObservacao(d?.observacao ?? "");
    setEditMode(true);
  }

  // Auto-popular responsável ao mudar serviço no modo de edição
  useEffect(() => {
    if (!editMode || !eSetorId || users.length === 0) return;
    const match = users.find(u => String(u.setorId) === eSetorId);
    if (match) setEResponsavelId(String(match.id));
  }, [eSetorId]);

  const updateMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("PATCH", `/api/demandas/${demanda!.id}`, body);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Demanda atualizada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/demandas"] });
      setEditMode(false);
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

  function salvarEdicao() {
    const body: any = {
      origem: eOrigem,
      numeroProcesso: eProtocolo || undefined,
      solicitanteNome: eSolicitanteNome,
      solicitanteWhatsapp: eSolicitanteWhatsapp || undefined,
      solicitanteOrgao: eSolicitanteOrgao || undefined,
      dataSolicitacao: eDataSolicitacao,
      tipo: eTipo,
      setorId: eSetorId ? parseInt(eSetorId) : undefined,
      responsavelId: eResponsavelId ? parseInt(eResponsavelId) : undefined,
      status,
      observacoes: observacoes || undefined,
    };
    if (eTipo === "Capina e Roçagem") {
      body.dadosEspecificos = {
        local: eCrLocal || undefined,
        descricao: eCrDescricao || undefined,
        observacao: eCrObservacao || undefined,
      };
    }
    updateMutation.mutate(body);
  }

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
  const hasChangedView = demanda && !editMode && (status !== demanda.status || observacoes !== (demanda.observacoes ?? ""));

  if (!demanda) return null;
  const dados = demanda.dadosEspecificos as any;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setEditMode(false); setConfirmDelete(false); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="leading-snug flex-1">#{demanda.id} — {editMode ? eTipo || demanda.tipo : demanda.tipo}</DialogTitle>
            {!editMode ? (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={abrirEdicao} title="Editar demanda">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => setEditMode(false)} title="Cancelar edição">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">

          {/* ===== MODO VISUALIZAÇÃO ===== */}
          {!editMode && (
            <>
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

              {/* Dados */}
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
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Protocolo</span>
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
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Serviço</span>
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

              {/* Capina e Roçagem */}
              {demanda.tipo === "Capina e Roçagem" && dados && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2 text-sm">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Capina e Roçagem</p>
                  {(dados.local || demanda.areaEndereco) && (
                    <div>
                      <span className="text-xs text-muted-foreground">Local</span>
                      <p className="font-medium">{dados.local || demanda.areaEndereco}</p>
                      {demanda.areaId && <span className="text-xs text-emerald-600">✓ Área vinculada ao sistema</span>}
                    </div>
                  )}
                  {dados.descricao && <div><span className="text-xs text-muted-foreground">Descrição</span><p>{dados.descricao}</p></div>}
                  {dados.observacao && <div><span className="text-xs text-muted-foreground">Observação</span><p>{dados.observacao}</p></div>}
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="text-sm font-medium">Observações</label>
                <Textarea className="mt-1 h-20 resize-none" placeholder="Adicionar observações..."
                  value={observacoes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservacoes(e.target.value)} />
              </div>

              {/* WhatsApp */}
              {(status === "concluida" || demanda.status === "concluida") && demanda.solicitanteWhatsapp && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Mensagem para o Solicitante</p>
                  <p className="text-xs text-muted-foreground bg-background rounded p-2 border border-border">{gerarMensagemWhatsapp()}</p>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={copiarWhatsapp}>
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copiado!" : "Copiar mensagem"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">WhatsApp: {demanda.solicitanteWhatsapp}</p>
                </div>
              )}

              {/* Rodapé visualização */}
              <div className="flex items-center gap-2 pt-1">
                {canDelete && (!confirmDelete ? (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1.5"
                    onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive">Confirmar exclusão?</span>
                    <Button variant="destructive" size="sm" className="h-7 text-xs"
                      onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>Sim</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setConfirmDelete(false)}>Não</Button>
                  </div>
                ))}
                <div className="flex-1" />
                <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                {hasChangedView && (
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
            </>
          )}

          {/* ===== MODO EDIÇÃO ===== */}
          {editMode && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Origem *</Label>
                  <Select value={eOrigem} onValueChange={setEOrigem}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                      {ORIGENS_DEMANDA.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data da Solicitação *</Label>
                  <Input type="date" className="mt-1" value={eDataSolicitacao}
                    onChange={e => setEDataSolicitacao(e.target.value)} />
                </div>
              </div>

              <div>
                <Label>Protocolo</Label>
                <Input className="mt-1" placeholder="Nº SEI, processo ou protocolo"
                  value={eProtocolo} onChange={e => setEProtocolo(e.target.value)} />
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Solicitante *</Label>
                  <Input className="mt-1" value={eSolicitanteNome} onChange={e => setESolicitanteNome(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>WhatsApp</Label>
                    <Input className="mt-1" placeholder="(43) 9 9999-9999"
                      value={eSolicitanteWhatsapp} onChange={e => setESolicitanteWhatsapp(e.target.value)} />
                  </div>
                  <div>
                    <Label>Órgão / Vereador</Label>
                    <Input className="mt-1" placeholder="Gabinete, secretaria..."
                      value={eSolicitanteOrgao} onChange={e => setESolicitanteOrgao(e.target.value)} />
                  </div>
                </div>
              </div>

              <div>
                <Label>Tipo de Demanda *</Label>
                <Select value={eTipo} onValueChange={setETipo}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {TIPOS_DEMANDA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Capina e Roçagem — campos específicos */}
              {eTipo === "Capina e Roçagem" && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                    Detalhes — Capina e Roçagem
                  </p>
                  <div>
                    <Label>Local / Endereço</Label>
                    <Input className="mt-1" placeholder="Endereço ou referência do local"
                      value={eCrLocal} onChange={e => setECrLocal(e.target.value)} />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Textarea className="mt-1 h-16 resize-none" placeholder="Descreva o problema..."
                      value={eCrDescricao} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setECrDescricao(e.target.value)} />
                  </div>
                  <div>
                    <Label>Observação</Label>
                    <Input className="mt-1" placeholder="Observações adicionais"
                      value={eCrObservacao} onChange={e => setECrObservacao(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Serviço</Label>
                  <Select value={eSetorId} onValueChange={v => setESetorId(v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Sem serviço" /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="none">Sem serviço</SelectItem>
                      {setoresPai.map(s => {
                        const filhos = setoresFilhos.filter(f => f.parentId === s.id);
                        return filhos.length > 0 ? (
                          <div key={s.id}>
                            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.nome}</div>
                            {filhos.map(f => <SelectItem key={f.id} value={String(f.id)}>&nbsp;&nbsp;{f.nome}</SelectItem>)}
                          </div>
                        ) : (
                          <SelectItem key={s.id} value={String(s.id)}>{s.nome}</SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Select value={eResponsavelId} onValueChange={v => setEResponsavelId(v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="none">Sem responsável</SelectItem>
                      {usuariosDoSetor.map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {STATUS_DEMANDA.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea className="mt-1 h-20 resize-none" placeholder="Informações adicionais..."
                  value={observacoes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservacoes(e.target.value)} />
              </div>

              {/* Rodapé edição */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setEditMode(false)}>
                  Cancelar
                </Button>
                <Button className="flex-1" disabled={updateMutation.isPending || !eOrigem || !eSolicitanteNome || !eTipo}
                  onClick={salvarEdicao}>
                  {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
