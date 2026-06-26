import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORIGENS_DEMANDA, TIPOS_DEMANDA, type Setor } from "@shared/schema";
import type { ServiceArea } from "@shared/schema";

interface UserData { id: number; nome: string; setorId: number | null; setorNome: string | null; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const today = new Date().toISOString().split("T")[0];

export function NovaDemandaModal({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [origem, setOrigem] = useState("");
  const [numeroProcesso, setNumeroProcesso] = useState("");
  const [solicitanteNome, setSolicitanteNome] = useState("");
  const [solicitanteWhatsapp, setSolicitanteWhatsapp] = useState("");
  const [solicitanteOrgao, setSolicitanteOrgao] = useState("");
  const [dataSolicitacao, setDataSolicitacao] = useState(today);
  const [tipo, setTipo] = useState("");
  const [setorId, setSetorId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  // Campos específicos Capina e Roçagem
  const [crLocal, setCrLocal] = useState("");
  const [crAreaId, setCrAreaId] = useState("");
  const [crDescricao, setCrDescricao] = useState("");
  const [crObservacao, setCrObservacao] = useState("");
  const [areaSearch, setAreaSearch] = useState("");

  const { data: setores = [] } = useQuery<Setor[]>({
    queryKey: ["/api/setores"],
    queryFn: async () => (await apiRequest("GET", "/api/setores")).json(),
    enabled: open,
  });

  const { data: users = [] } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
    queryFn: async () => (await apiRequest("GET", "/api/users")).json(),
    enabled: open,
  });

  const { data: areas = [] } = useQuery<ServiceArea[]>({
    queryKey: ["/api/areas/rocagem"],
    queryFn: async () => (await apiRequest("GET", "/api/areas/rocagem")).json(),
    enabled: open && tipo === "Capina e Roçagem",
  });

  const setoresAtivos = setores.filter(s => s.ativo && !s.parentId);
  const setoresFilhos = setores.filter(s => s.ativo && s.parentId);

  const usuariosFiltrados = setorId
    ? users.filter(u => String(u.setorId) === setorId)
    : users;

  const areasFiltradas = areas.filter(a =>
    !areaSearch || a.endereco.toLowerCase().includes(areaSearch.toLowerCase())
  ).slice(0, 30);

  const isCapinaRocagem = tipo === "Capina e Roçagem";

  function reset() {
    setOrigem(""); setNumeroProcesso(""); setSolicitanteNome("");
    setSolicitanteWhatsapp(""); setSolicitanteOrgao(""); setDataSolicitacao(today);
    setTipo(""); setSetorId(""); setResponsavelId(""); setObservacoes("");
    setCrLocal(""); setCrAreaId(""); setCrDescricao(""); setCrObservacao(""); setAreaSearch("");
  }

  useEffect(() => { if (!open) reset(); }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        origem, numeroProcesso: numeroProcesso || undefined,
        solicitanteNome, solicitanteWhatsapp: solicitanteWhatsapp || undefined,
        solicitanteOrgao: solicitanteOrgao || undefined,
        dataSolicitacao, tipo,
        setorId: setorId ? parseInt(setorId) : undefined,
        responsavelId: responsavelId ? parseInt(responsavelId) : undefined,
        observacoes: observacoes || undefined,
      };
      if (isCapinaRocagem) {
        body.areaId = crAreaId ? parseInt(crAreaId) : undefined;
        body.dadosEspecificos = {
          local: crLocal || undefined,
          descricao: crDescricao || undefined,
          observacao: crObservacao || undefined,
        };
      }
      const res = await apiRequest("POST", "/api/demandas", body);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Demanda registrada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/demandas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notificacoes"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message }),
  });

  const canSubmit = origem && solicitanteNome && dataSolicitacao && tipo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Demanda</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Linha 1: Origem + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Origem *</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {ORIGENS_DEMANDA.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data da Solicitação *</Label>
              <Input type="date" className="mt-1" value={dataSolicitacao}
                onChange={e => setDataSolicitacao(e.target.value)} />
            </div>
          </div>

          {/* Nº Processo */}
          <div>
            <Label>Nº Processo (SEI ou outro)</Label>
            <Input className="mt-1" placeholder="Ex: 17.020.001/2026" value={numeroProcesso}
              onChange={e => setNumeroProcesso(e.target.value)} />
          </div>

          {/* Solicitante */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Solicitante *</Label>
              <Input className="mt-1" placeholder="Nome completo" value={solicitanteNome}
                onChange={e => setSolicitanteNome(e.target.value)} />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input className="mt-1" placeholder="(43) 9 9999-9999" value={solicitanteWhatsapp}
                onChange={e => setSolicitanteWhatsapp(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Órgão / Vereador</Label>
            <Input className="mt-1" placeholder="Ex: Gabinete do Ver. João Silva" value={solicitanteOrgao}
              onChange={e => setSolicitanteOrgao(e.target.value)} />
          </div>

          {/* Tipo */}
          <div>
            <Label>Tipo de Demanda *</Label>
            <Select value={tipo} onValueChange={v => { setTipo(v); setCrAreaId(""); }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o tipo..." />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {TIPOS_DEMANDA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Campos específicos: Capina e Roçagem */}
          {isCapinaRocagem && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                Detalhes — Capina e Roçagem
              </p>
              <div>
                <Label>Local / Endereço</Label>
                <Input className="mt-1" placeholder="Endereço ou referência do local" value={crLocal}
                  onChange={e => setCrLocal(e.target.value)} />
              </div>
              <div>
                <Label>Vincular a área cadastrada (opcional)</Label>
                <div className="flex gap-2 mt-1">
                  <Input placeholder="Buscar por endereço..." value={areaSearch}
                    onChange={e => { setAreaSearch(e.target.value); setCrAreaId(""); }} />
                </div>
                {areaSearch && areasFiltradas.length > 0 && !crAreaId && (
                  <div className="mt-1 border border-border rounded-md max-h-32 overflow-y-auto">
                    {areasFiltradas.map(a => (
                      <button key={a.id} type="button"
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
                        onClick={() => { setCrAreaId(String(a.id)); setAreaSearch(a.endereco); setCrLocal(a.endereco); }}>
                        <span className="font-medium">{a.endereco}</span>
                        {a.bairro && <span className="text-muted-foreground ml-1">— {a.bairro}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {crAreaId && (
                  <p className="text-xs text-emerald-600 mt-1">✓ Área vinculada — será fechada automaticamente ao executar a roçagem</p>
                )}
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea className="mt-1 h-16 resize-none" placeholder="Descreva o problema..."
                  value={crDescricao} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCrDescricao(e.target.value)} />
              </div>
              <div>
                <Label>Observação</Label>
                <Input className="mt-1" placeholder="Observações adicionais" value={crObservacao}
                  onChange={e => setCrObservacao(e.target.value)} />
              </div>
            </div>
          )}

          {/* Setor e Responsável */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Setor</Label>
              <Select value={setorId} onValueChange={v => { setSetorId(v === "none" ? "" : v); setResponsavelId(""); }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sem setor" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="none">Sem setor</SelectItem>
                  {setoresAtivos.map(s => {
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
              <Select value={responsavelId} onValueChange={v => setResponsavelId(v === "none" ? "" : v)}
                disabled={usuariosFiltrados.length === 0}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {usuariosFiltrados.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Observações gerais */}
          <div>
            <Label>Observações Gerais</Label>
            <Textarea className="mt-1 h-20 resize-none" placeholder="Informações adicionais..."
              value={observacoes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservacoes(e.target.value)} />
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Registrando..." : "Registrar Demanda"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
