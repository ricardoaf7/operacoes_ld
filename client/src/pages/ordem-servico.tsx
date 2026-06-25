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
  Pencil,
  X,
} from "lucide-react";
import { Link } from "wouter";
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
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

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

  const atualizarOrdemMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/ordens/${editandoId}`, {
        numero,
        lote: parseInt(lote),
        mes_referencia: mesRef,
        data_emissao: dataEmissao,
        observacao,
        area_ids: Array.from(selectedIds),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ordens"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ordens", editandoId] });
      toast({ title: "OS atualizada com sucesso!" });
      setDialogOpen(false);
      setVisualizandoId(editandoId);
      setEditandoId(null);
      setSelectedIds(new Set());
      setTab("historico");
    },
    onError: () => {
      toast({ title: "Erro ao atualizar a OS", variant: "destructive" });
    },
  });

  async function handleEditar(os: OrdemServico) {
    setEditandoId(os.id);
    setLote(String(os.lote) as "1" | "2");
    setNumero(os.numero);
    setMesRef(os.mes_referencia);
    setDataEmissao(os.data_emissao);
    setObservacao(os.observacao || "");
    if (os.areas) {
      setSelectedIds(new Set(os.areas.map((a) => a.id)));
    } else {
      // fetch areas if not loaded yet
      const res = await apiRequest("GET", `/api/ordens/${os.id}`);
      const data: any = await res.json();
      if (data.areas) setSelectedIds(new Set(data.areas.map((a: any) => a.id)));
    }
    setPage(0);
    setBusca("");
    setTab("nova");
  }

  const handleGerarPDF = async () => {
    if (!ordemDetalhada || generatingPdf) return;
    setGeneratingPdf(true);
    try {
      await gerarPDFOrdemServico(ordemDetalhada);
      toast({ title: "PDF gerado!", description: "Verifique sua pasta de downloads." });
    } catch (err) {
      toast({ title: "Erro ao gerar PDF", description: String(err), variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleExcel = () => {
    if (!ordemDetalhada?.areas) return;
    const totalM2 = ordemDetalhada.areas.reduce((s, a) => s + (a.metragem_m2 || 0), 0);
    const fmt = (v: number | null | undefined) =>
      v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
    const cell = (content: string, extra = "") =>
      `<td style="padding:8px;border:1px solid #c8ddd4;text-align:center;vertical-align:middle${extra}">${content}</td>`;
    const rows = ordemDetalhada.areas.map((a, i) => `
      <tr height="30" style="background:${i % 2 === 0 ? "#ffffff" : "#f2f7f4"}">
        ${cell(String(a.id))}
        ${cell(a.endereco)}
        ${cell(a.bairro || "—")}
        ${cell(a.tipo)}
        ${cell(fmt(a.metragem_m2))}
      </tr>`).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>OS ${ordemDetalhada.numero}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>td,th{font-family:Arial,sans-serif;font-size:11px;text-align:center;vertical-align:middle}</style>
</head><body>
<table style="border-collapse:collapse;width:100%">
  <colgroup>
    <col width="55">
    <col width="500">
    <col width="160">
    <col width="140">
    <col width="110">
  </colgroup>
  <tr height="36"><td colspan="5" style="padding:10px 14px;background:#1e5f3a;color:#fff;font-size:14px;font-weight:bold;text-align:center">
    CMTU — Ordem de Serviço Nº ${ordemDetalhada.numero} — Lote ${ordemDetalhada.lote}
  </td></tr>
  <tr height="28">
    <td colspan="2" style="padding:6px;background:#e8f3ee;border:1px solid #c8ddd4;text-align:center"><b>Mês:</b> ${ordemDetalhada.mes_referencia}</td>
    <td style="padding:6px;background:#e8f3ee;border:1px solid #c8ddd4;text-align:center"><b>Emissão:</b> ${formatDate(ordemDetalhada.data_emissao)}</td>
    <td style="padding:6px;background:#e8f3ee;border:1px solid #c8ddd4;text-align:center"><b>Áreas:</b> ${ordemDetalhada.areas.length}</td>
    <td style="padding:6px;background:#e8f3ee;border:1px solid #c8ddd4;text-align:center"><b>Total m²:</b> ${fmt(totalM2)}</td>
  </tr>
  ${ordemDetalhada.observacao ? `<tr height="26"><td colspan="5" style="padding:6px;background:#e8f3ee;border:1px solid #c8ddd4;text-align:center"><b>Observação:</b> ${ordemDetalhada.observacao}</td></tr>` : ""}
  <tr height="30">
    <th style="padding:8px;background:#2d7a4f;color:#fff;border:1px solid #1e5f3a;text-align:center">ID</th>
    <th style="padding:8px;background:#2d7a4f;color:#fff;border:1px solid #1e5f3a;text-align:center">Endereço</th>
    <th style="padding:8px;background:#2d7a4f;color:#fff;border:1px solid #1e5f3a;text-align:center">Bairro</th>
    <th style="padding:8px;background:#2d7a4f;color:#fff;border:1px solid #1e5f3a;text-align:center">Tipo</th>
    <th style="padding:8px;background:#2d7a4f;color:#fff;border:1px solid #1e5f3a;text-align:center">Metragem (m²)</th>
  </tr>
  ${rows}
  <tr height="30">
    <td colspan="4" style="padding:8px;background:#1e5f3a;color:#fff;font-weight:bold;border:1px solid #1e5f3a;text-align:center">TOTAL</td>
    <td style="padding:8px;background:#1e5f3a;color:#fff;font-weight:bold;border:1px solid #1e5f3a;text-align:center">${fmt(totalM2)}</td>
  </tr>
</table>
</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
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
        <Button variant="ghost" size="sm" className="mr-1 text-muted-foreground hover:text-foreground"
          onClick={() => visualizandoId ? setVisualizandoId(null) : window.history.back()}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <ClipboardList className="h-6 w-6 text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold">Ordem de Serviço</h1>
          <p className="text-sm text-muted-foreground">Capina e Roçagem</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4">
        <button
          onClick={() => { setTab("nova"); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "nova" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
        >
          {editandoId ? "Editar OS" : "Nova OS"}
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
                {(selectedIds.size > 0 || editandoId) && (
                  <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                    {editandoId ? <Pencil className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    {editandoId ? "Salvar alterações" : "Emitir OS"}
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
                  <Button variant="outline" size="sm" onClick={handleGerarPDF} disabled={generatingPdf}>
                    {generatingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                    {generatingPdf ? "Gerando..." : "Gerar PDF"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditar(ordemDetalhada)}
                  >
                    <Pencil className="h-4 w-4 mr-2" /> Editar
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


      {/* Dialog confirmar/editar OS */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Atualizar Ordem de Serviço" : "Emitir Ordem de Serviço"}</DialogTitle>
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
              onClick={() => editandoId ? atualizarOrdemMutation.mutate() : criarOrdemMutation.mutate()}
              disabled={!numero || !mesRef || criarOrdemMutation.isPending || atualizarOrdemMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {(criarOrdemMutation.isPending || atualizarOrdemMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editandoId ? "Atualizar OS" : "Salvar OS"}
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

async function gerarPDFOrdemServico(os: OrdemServico): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { loadImg, addPdfHeader, addPdfFooter, PDF_NAVY, PDF_GREEN } = await import("@/lib/pdfUtils");

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const mx = 14;

  const [londrina, cmtu, operacoes] = await Promise.all([
    loadImg("/logos/londrina.png"),
    loadImg("/logos/cmtu_vertical.png"),
    loadImg("/logos/operacoes.png"),
  ]);

  const headerBottom = addPdfHeader(
    doc, londrina, cmtu, operacoes,
    `ORDEM DE SERVIÇO Nº ${os.numero}`,
    `Capina e Roçagem — Lote ${os.lote}`,
    mx,
  );

  // --- Metadados ---
  let y = headerBottom + 5;
  const PDF_FONT = "helvetica";
  doc.setFontSize(8);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(70, 70, 70);
  doc.text(`Emitida em: ${formatDate(os.data_emissao)}`, mx, y);
  doc.text(`Por: ${os.emitido_por || "—"}`, mx + 52, y);
  doc.text(`Mês de referência: ${os.mes_referencia}`, mx + 112, y);
  y += 5;

  // --- Caixa de informações ---
  const totalM2 = os.areas?.reduce((s, a) => s + (a.metragem_m2 || 0), 0) ?? 0;
  const fmtM2 = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const boxH = os.observacao ? 16 : 11;

  doc.setFillColor(232, 243, 238);
  doc.setDrawColor(200, 220, 210);
  doc.setLineWidth(0.2);
  doc.rect(mx, y, pageW - mx * 2, boxH, "FD");

  doc.setFontSize(7.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(90, 90, 90);
  doc.text("Total de áreas", mx + 3, y + 4);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(`${os.areas?.length || 0}`, mx + 3, y + 8.5);

  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(90, 90, 90);
  doc.text("Total m²", mx + 42, y + 4);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(`${fmtM2(totalM2)} m²`, mx + 42, y + 8.5);

  if (os.observacao) {
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(90, 90, 90);
    doc.text("Observação:", mx + 3, y + 12);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(20, 20, 20);
    const obs = os.observacao.length > 90 ? os.observacao.slice(0, 87) + "..." : os.observacao;
    doc.text(obs, mx + 28, y + 12);
  }

  y += boxH + 4;

  // --- Tabela ---
  autoTable(doc, {
    startY: y,
    head: [["ID", "Endereço", "Bairro", "Tipo", "Metragem (m²)"]],
    body:
      os.areas?.map((a) => [
        String(a.id),
        a.endereco,
        a.bairro || "—",
        a.tipo,
        fmtM2(a.metragem_m2 || 0),
      ]) ?? [],
    styles: { fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
    headStyles: { fillColor: PDF_NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { halign: "center", cellWidth: 14 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 34 },
      3: { cellWidth: 30 },
      4: { halign: "right", cellWidth: 28 },
    },
    alternateRowStyles: { fillColor: [240, 248, 244] },
    margin: { left: mx, right: mx, bottom: 22 },
    theme: "grid",
  });

  const tableEndY: number = (doc as any).lastAutoTable?.finalY ?? y + 20;

  // --- Total ---
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_NAVY);
  doc.text(`Total: ${fmtM2(totalM2)} m²`, pageW - mx, tableEndY + 5, { align: "right" });

  // --- Assinaturas ---
  const sigY = tableEndY + 22;
  const pageH = doc.internal.pageSize.getHeight();
  if (sigY + 18 > pageH - 24) doc.addPage();
  const sy = sigY + 18 > pageH - 24 ? mx + 20 : sigY;

  const s1x = mx + 8;
  const s2x = pageW - mx - 73;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(s1x, sy, s1x + 68, sy);
  doc.line(s2x, sy, s2x + 68, sy);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("Fiscal responsável", s1x + 34, sy + 4, { align: "center" });
  doc.text("Responsável pela contratada", s2x + 34, sy + 4, { align: "center" });

  // --- Rodapé em todas as páginas ---
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPdfFooter(doc, i, totalPages, mx);
  }

  doc.save(`OS_${os.numero}_Lote${os.lote}.pdf`);
}

