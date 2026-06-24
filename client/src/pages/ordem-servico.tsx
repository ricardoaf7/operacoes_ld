import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ClipboardList,
  Plus,
  FileText,
  Sheet,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import type { OrdemServico } from "@shared/schema";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const PAGE_SIZE = 50;

export default function OrdemServicoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"nova" | "historico">("nova");
  const [lote, setLote] = useState<"1" | "2">("1");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [numero, setNumero] = useState("");
  const [mesRef, setMesRef] = useState(() => {
    const d = new Date();
    return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
  });
  const [dataEmissao, setDataEmissao] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [observacao, setObservacao] = useState("");
  const [visualizandoId, setVisualizandoId] = useState<number | null>(null);

  const { data: areas = [], isLoading: loadingAreas } = useQuery<any[]>({
    queryKey: ["/api/areas/light"],
  });

  const { data: ordens = [], isLoading: loadingOrdens } = useQuery<OrdemServico[]>({
    queryKey: ["/api/ordens"],
  });

  const { data: ordemDetalhada } = useQuery<OrdemServico>({
    queryKey: ["/api/ordens", visualizandoId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ordens/${visualizandoId}`);
      return res.json();
    },
    enabled: !!visualizandoId,
  });

  const areasFiltradas = useMemo(() => {
    return areas
      .filter((a) => a.lote === parseInt(lote))
      .filter((a) => {
        if (!busca) return true;
        const q = busca.toLowerCase();
        return (
          a.endereco?.toLowerCase().includes(q) ||
          a.bairro?.toLowerCase().includes(q) ||
          a.tipo?.toLowerCase().includes(q)
        );
      })
      .sort((a: any, b: any) => a.id - b.id);
  }, [areas, lote, busca]);

  const totalPages = Math.ceil(areasFiltradas.length / PAGE_SIZE);
  const paginaAtual = areasFiltradas.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalM2Selecionado = useMemo(() => {
    return areas
      .filter((a: any) => selectedIds.has(a.id))
      .reduce((acc: number, a: any) => acc + (a.metragem_m2 || 0), 0);
  }, [areas, selectedIds]);

  const toggleArea = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePagina = () => {
    const idsPage = paginaAtual.map((a: any) => a.id);
    const allSelected = idsPage.every((id: number) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) idsPage.forEach((id: number) => next.delete(id));
      else idsPage.forEach((id: number) => next.add(id));
      return next;
    });
  };

  const criarOrdemMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ordens", {
        numero,
        lote: parseInt(lote),
        mes_referencia: mesRef,
        data_emissao: dataEmissao,
        observacao,
        area_ids: Array.from(selectedIds),
      });
      return res.json();
    },
    onSuccess: (ordem: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ordens"] });
      toast({ title: "OS criada", description: `Ordem ${numero} salva com sucesso.` });
      setDialogOpen(false);
      setSelectedIds(new Set());
      setVisualizandoId(ordem.id);
      setTab("historico");
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar a ordem.", variant: "destructive" });
    },
  });

  const excluirOrdemMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/ordens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ordens"] });
      setVisualizandoId(null);
      toast({ title: "OS excluída" });
    },
  });

  const handlePDF = () => {
    if (!ordemDetalhada) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(gerarHTMLImpressao(ordemDetalhada));
    win.document.close();
    win.print();
  };

  const handleExcel = () => {
    if (!ordemDetalhada?.areas) return;
    const cabecalho = `ORDEM DE SERVIÇO Nº ${ordemDetalhada.numero}\nLote ${ordemDetalhada.lote} — ${ordemDetalhada.mes_referencia}\nEmitida em: ${formatDate(ordemDetalhada.data_emissao)}\n\n`;
    const header = "ID\tTIPO\tENDEREÇO\tBAIRRO\tMETRAGEM (m²)\n";
    const rows = ordemDetalhada.areas
      .map((a) => `${a.id}\t${a.tipo}\t${a.endereco}\t${a.bairro || ""}\t${a.metragem_m2 || ""}`)
      .join("\n");
    const total = `\n\nTOTAL DE ÁREAS: ${ordemDetalhada.areas.length}\nTOTAL M²: ${ordemDetalhada.areas.reduce((s, a) => s + (a.metragem_m2 || 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
    const content = "﻿" + cabecalho + header + rows + total;
    const blob = new Blob([content], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OS_${ordemDetalhada.numero.replace(/\//g, "-")}_Lote${ordemDetalhada.lote}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-6 pb-4 border-b">
        <ClipboardList className="h-6 w-6 text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold">Ordem de Serviço</h1>
          <p className="text-sm text-muted-foreground">Capina e Roçagem</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4">
        <button
          onClick={() => setTab("nova")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "nova" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
        >
          Nova OS
        </button>
        <button
          onClick={() => { setTab("historico"); setVisualizandoId(null); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "historico" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
        >
          Histórico
          {ordens.length > 0 && (
            <Badge variant="secondary" className="ml-2">{ordens.length}</Badge>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 pt-4">
        {tab === "nova" ? (
          <div className="space-y-4">
            {/* Controles */}
            <div className="flex flex-wrap gap-3 items-end justify-between">
              <div className="flex gap-3 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Lote</Label>
                  <Select value={lote} onValueChange={(v) => { setLote(v as "1" | "2"); setPage(0); setSelectedIds(new Set()); }}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Lote 1</SelectItem>
                      <SelectItem value="2">Lote 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Buscar</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Endereço, bairro ou tipo..."
                      value={busca}
                      onChange={(e) => { setBusca(e.target.value); setPage(0); }}
                      className="pl-8 w-64"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} área{selectedIds.size !== 1 ? "s" : ""} selecionada{selectedIds.size !== 1 ? "s" : ""}
                  {selectedIds.size > 0 && (
                    <span className="ml-1 text-emerald-600 font-medium">
                      ({totalM2Selecionado.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²)
                    </span>
                  )}
                </span>
                {selectedIds.size > 0 && (
                  <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Emitir OS
                  </Button>
                )}
              </div>
            </div>

            {/* Tabela */}
            {loadingAreas ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-auto max-h-[calc(100vh-280px)]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th className="w-10 px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                          checked={paginaAtual.length > 0 && paginaAtual.every((a: any) => selectedIds.has(a.id))}
                          onChange={togglePagina}
                        />
                      </th>
                      <th className="px-3 py-3 text-left font-medium w-16">ID</th>
                      <th className="px-3 py-3 text-left font-medium">Endereço</th>
                      <th className="px-3 py-3 text-left font-medium w-36">Bairro</th>
                      <th className="px-3 py-3 text-left font-medium w-32">Tipo</th>
                      <th className="px-3 py-3 text-right font-medium w-28">Metragem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginaAtual.map((area: any, i: number) => (
                      <tr
                        key={area.id}
                        onClick={() => toggleArea(area.id)}
                        className={`border-t cursor-pointer transition-colors ${
                          selectedIds.has(area.id)
                            ? "bg-emerald-50 dark:bg-emerald-950/30"
                            : i % 2 === 0 ? "hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/30"
                        }`}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                            checked={selectedIds.has(area.id)}
                            onChange={() => toggleArea(area.id)}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{area.id}</td>
                        <td className="px-3 py-2.5 font-medium">{area.endereco}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{area.bairro || "—"}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className="text-xs">{area.tipo}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {area.metragem_m2
                            ? `${area.metragem_m2.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                    <span className="text-xs text-muted-foreground">
                      Página {page + 1} de {totalPages} — {areasFiltradas.length} áreas
                    </span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* HISTÓRICO */
          <div className="space-y-4">
            {loadingOrdens ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : ordens.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma ordem emitida ainda.</p>
              </div>
            ) : visualizandoId && ordemDetalhada ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => setVisualizandoId(null)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <h2 className="font-bold text-lg">OS Nº {ordemDetalhada.numero}</h2>
                  <Badge variant="secondary">Lote {ordemDetalhada.lote}</Badge>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={handleExcel}>
                    <Sheet className="h-4 w-4 mr-2" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePDF}>
                    <FileText className="h-4 w-4 mr-2" /> PDF / Imprimir
                  </Button>
                  {(user?.role === "admin" || user?.role === "gestor") && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Excluir esta ordem de serviço?")) excluirOrdemMutation.mutate(visualizandoId);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/20 text-sm">
                  <div><span className="text-muted-foreground">Mês de referência:</span> <strong>{ordemDetalhada.mes_referencia}</strong></div>
                  <div><span className="text-muted-foreground">Data de emissão:</span> <strong>{formatDate(ordemDetalhada.data_emissao)}</strong></div>
                  <div><span className="text-muted-foreground">Emitida por:</span> <strong>{ordemDetalhada.emitido_por || "—"}</strong></div>
                  {ordemDetalhada.observacao && (
                    <div className="col-span-3"><span className="text-muted-foreground">Observação:</span> {ordemDetalhada.observacao}</div>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{ordemDetalhada.areas?.length} áreas</span>
                  <span className="text-emerald-600 font-medium">
                    Total: {ordemDetalhada.areas?.reduce((s, a) => s + (a.metragem_m2 || 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
                  </span>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-3 text-left font-medium w-16">ID</th>
                        <th className="px-3 py-3 text-left font-medium">Endereço</th>
                        <th className="px-3 py-3 text-left font-medium w-36">Bairro</th>
                        <th className="px-3 py-3 text-left font-medium w-32">Tipo</th>
                        <th className="px-3 py-3 text-right font-medium w-28">Metragem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordemDetalhada.areas?.map((area, i) => (
                        <tr key={area.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                          <td className="px-3 py-2 text-muted-foreground">{area.id}</td>
                          <td className="px-3 py-2 font-medium">{area.endereco}</td>
                          <td className="px-3 py-2 text-muted-foreground">{area.bairro || "—"}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs">{area.tipo}</Badge>
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {area.metragem_m2
                              ? `${area.metragem_m2.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Clique em uma OS para ver os detalhes.</p>
                {ordens.map((os) => (
                  <button
                    key={os.id}
                    onClick={() => setVisualizandoId(os.id)}
                    className="w-full flex items-center gap-4 p-4 border rounded-lg hover:bg-accent text-left transition-colors"
                  >
                    <ClipboardList className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">OS Nº {os.numero}</span>
                        <Badge variant="secondary">Lote {os.lote}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{os.mes_referencia} — emitida em {formatDate(os.data_emissao)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialog confirmar OS */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Emitir Ordem de Serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Número da OS *</Label>
                <Input
                  placeholder="Ex: 006/2026"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de emissão</Label>
                <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Mês de referência *</Label>
              <Select value={mesRef} onValueChange={setMesRef}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => {
                    const ano = new Date().getFullYear();
                    return (
                      <SelectItem key={m} value={`${m} ${ano}`}>{m} {ano}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder="Observações para a contratada..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
              />
            </div>
            <Separator />
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Áreas selecionadas:</span>
                <strong>{selectedIds.size}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total m²:</span>
                <strong className="text-emerald-600">{totalM2Selecionado.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lote:</span>
                <strong>{lote}</strong>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => criarOrdemMutation.mutate()}
              disabled={!numero || !mesRef || criarOrdemMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {criarOrdemMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

function gerarHTMLImpressao(os: OrdemServico): string {
  const totalM2 = os.areas?.reduce((s, a) => s + (a.metragem_m2 || 0), 0) ?? 0;
  const rows = os.areas
    ?.map(
      (a, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9f9f9"}">
        <td style="padding:6px 8px;border:1px solid #ddd">${a.id}</td>
        <td style="padding:6px 8px;border:1px solid #ddd">${a.endereco}</td>
        <td style="padding:6px 8px;border:1px solid #ddd">${a.bairro || "—"}</td>
        <td style="padding:6px 8px;border:1px solid #ddd">${a.tipo}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">${a.metragem_m2?.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) ?? "—"}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>OS ${os.numero}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#222}
  h1{font-size:16px;margin:0}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #2d7a4f;padding-bottom:12px}
  .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;background:#f5f5f5;padding:10px;border-radius:4px}
  .meta div{font-size:11px}.meta strong{display:block;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#2d7a4f;color:#fff;padding:8px;text-align:left;border:1px solid #2d7a4f}
  .total{margin-top:12px;text-align:right;font-size:13px;font-weight:bold;color:#2d7a4f}
  .assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:60px}
  .assinatura{border-top:1px solid #222;padding-top:8px;text-align:center;font-size:11px}
  @media print{body{margin:10px}}
</style></head><body>
<div class="header">
  <div>
    <p style="margin:0;font-size:11px;color:#666">CMTU — Companhia Municipal de Trânsito e Urbanização</p>
    <h1>ORDEM DE SERVIÇO Nº ${os.numero}</h1>
    <p style="margin:4px 0 0;color:#2d7a4f;font-weight:bold">Capina e Roçagem — Lote ${os.lote}</p>
  </div>
  <div style="text-align:right;font-size:11px">
    <div>Emitida em: <strong>${formatDate(os.data_emissao)}</strong></div>
    <div>Por: <strong>${os.emitido_por || "—"}</strong></div>
  </div>
</div>
<div class="meta">
  <div>Mês de referência<strong>${os.mes_referencia}</strong></div>
  <div>Total de áreas<strong>${os.areas?.length}</strong></div>
  <div>Total m²<strong>${totalM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²</strong></div>
  ${os.observacao ? `<div style="grid-column:span 3">Observação<strong>${os.observacao}</strong></div>` : ""}
</div>
<table>
  <thead><tr>
    <th style="width:50px">ID</th>
    <th>Endereço</th>
    <th style="width:140px">Bairro</th>
    <th style="width:120px">Tipo</th>
    <th style="width:90px;text-align:right">Metragem (m²)</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="total">Total: ${totalM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²</div>
<div class="assinaturas">
  <div class="assinatura">Fiscal responsável</div>
  <div class="assinatura">Responsável pela contratada</div>
</div>
</body></html>`;
}
