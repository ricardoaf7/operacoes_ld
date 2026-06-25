import { useState, useMemo, useRef } from "react";
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
  Printer,
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
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  const handlePDF = () => {
    if (!ordemDetalhada) return;
    setPdfPreviewOpen(true);
  };

  const handleImprimir = () => {
    iframeRef.current?.contentWindow?.print();
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
        <Link href="/">
          <Button variant="ghost" size="sm" className="mr-1 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </Link>
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
                  <Button variant="outline" size="sm" onClick={handlePDF}>
                    <FileText className="h-4 w-4 mr-2" /> PDF / Imprimir
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

      {/* Preview PDF */}
      {pdfPreviewOpen && ordemDetalhada && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 flex-shrink-0">
            <span className="font-semibold text-sm flex-1">
              Pré-visualização — OS Nº {ordemDetalhada.numero}
            </span>
            <Button variant="outline" size="sm" onClick={handleImprimir}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir / Salvar PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPdfPreviewOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Fechar
            </Button>
          </div>
          <div className="flex-1 overflow-hidden bg-gray-200 p-4">
            <iframe
              ref={iframeRef}
              srcDoc={gerarHTMLImpressao(ordemDetalhada)}
              className="w-full h-full rounded shadow-lg bg-white"
              title="Preview OS"
            />
          </div>
          <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground text-center">
            Para salvar como PDF: clique em "Imprimir / Salvar PDF" → selecione "Salvar como PDF" na impressora
          </div>
        </div>
      )}

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

function gerarHTMLImpressao(os: OrdemServico): string {
  const totalM2 = os.areas?.reduce((s, a) => s + (a.metragem_m2 || 0), 0) ?? 0;
  const fmt = (v: number | null | undefined) =>
    v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  const rows = os.areas
    ?.map(
      (a, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : "#f2f7f4"}">
        <td style="padding:6px 8px;border:1px solid #c8ddd4;text-align:center">${a.id}</td>
        <td style="padding:6px 8px;border:1px solid #c8ddd4">${a.endereco}</td>
        <td style="padding:6px 8px;border:1px solid #c8ddd4;text-align:center">${a.bairro || "—"}</td>
        <td style="padding:6px 8px;border:1px solid #c8ddd4;text-align:center">${a.tipo}</td>
        <td style="padding:6px 8px;border:1px solid #c8ddd4;text-align:right">${fmt(a.metragem_m2)}</td>
      </tr>`
    )
    .join("");

  const origin = window.location.origin;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>OS ${os.numero}</title>
<style>
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;margin:16px 20px;color:#222}
  .logos{display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:3px solid #1a2e5a;margin-bottom:10px}
  .logos img{height:44px;object-fit:contain;max-width:160px}
  .logos-center{text-align:center;flex:1;padding:0 12px}
  .logos-center p{margin:0;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px}
  .logos-center img{height:22px;object-fit:contain;margin-top:4px}
  h1{font-size:15px;margin:0 0 2px;color:#1a2e5a;font-weight:bold}
  .sub{margin:0;font-size:10px;color:#2d7a4f;font-weight:bold}
  .emit{font-size:10px;color:#555;margin-top:6px}
  .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;background:#e8f3ee;padding:8px 10px;border-radius:4px;border:1px solid #c8ddd4}
  .meta div{font-size:10px}.meta strong{display:block;font-size:11px;margin-top:1px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  th{background:#1a2e5a;color:#fff;padding:7px 8px;border:1px solid #14234a;text-align:left}
  th:first-child{text-align:center}th:last-child{text-align:right}
  .total{margin-top:10px;text-align:right;font-size:12px;font-weight:bold;color:#1a2e5a}
  .assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:50px}
  .assinatura{border-top:1px solid #555;padding-top:6px;text-align:center;font-size:10px;color:#333}
  @media print{
    body{margin:8px 12px}
    @page{
      margin-bottom:28mm;
      @bottom-left{content:"Rua Prof. João Cândido, 1.213 — CEP 86.010-001 — CNPJ 86.731.320/0001-37 — Fone (43) 3379-7900 — Londrina – PR";font-size:7.5pt;color:#666}
      @bottom-center{content:"www.cmtuld.com.br  |  opera@cmtuld.com.br";font-size:7.5pt;color:#666}
      @bottom-right{content:"Pág. " counter(page) " / " counter(pages);font-size:7.5pt;color:#666}
    }
  }
</style></head><body>
<div class="logos">
  <img src="${origin}/logos/londrina.png" alt="Londrina">
  <div class="logos-center">
    <p>Companhia Municipal de Trânsito e Urbanização</p>
    <h1>ORDEM DE SERVIÇO Nº ${os.numero}</h1>
    <p class="sub">Capina e Roçagem — Lote ${os.lote}</p>
    <img src="${origin}/logos/operacoes.png" alt="Diretoria de Operações">
  </div>
  <img src="${origin}/logos/cmtu.png" alt="CMTU">
</div>
<p class="emit">Emitida em: <strong>${formatDate(os.data_emissao)}</strong> &nbsp;|&nbsp; Por: <strong>${os.emitido_por || "—"}</strong></p>
<div class="meta">
  <div>Mês de referência<strong>${os.mes_referencia}</strong></div>
  <div>Total de áreas<strong>${os.areas?.length}</strong></div>
  <div>Total m²<strong>${fmt(totalM2)} m²</strong></div>
  ${os.observacao ? `<div style="grid-column:span 3">Observação<strong>${os.observacao}</strong></div>` : ""}
</div>
<table>
  <thead><tr>
    <th style="width:48px;text-align:center">ID</th>
    <th>Endereço</th>
    <th style="width:135px">Bairro</th>
    <th style="width:115px">Tipo</th>
    <th style="width:95px;text-align:right">Metragem (m²)</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="total">Total: ${fmt(totalM2)} m²</div>
<div class="assinaturas">
  <div class="assinatura">Fiscal responsável</div>
  <div class="assinatura">Responsável pela contratada</div>
</div>
</body></html>`;
}
