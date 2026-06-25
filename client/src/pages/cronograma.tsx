import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  Search,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ServiceArea } from "@shared/schema";

function formatDate(d: string) {
  if (!d) return "";
  const s = d.split("T")[0];
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}

function getWeekDates(offsetWeeks: number) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offsetWeeks * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { inicio: fmt(monday), fim: fmt(friday) };
}

const PER_PAGE = 50;

export default function CronogramaPage() {
  const [activeTab, setActiveTab] = useState<"novo" | "historico">("novo");
  const [lote, setLote] = useState<number>(1);
  const [semanaInicio, setSemanaInicio] = useState("");
  const [semanaFim, setSemanaFim] = useState("");
  const [observacao, setObservacao] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [osCarregada, setOsCarregada] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: todasAreas = [] } = useQuery<ServiceArea[]>({
    queryKey: ["/api/service-areas"],
  });

  const { data: cronogramas = [] } = useQuery<any[]>({
    queryKey: ["/api/cronogramas"],
  });

  const { data: ordens = [] } = useQuery<any[]>({
    queryKey: ["/api/ordens"],
  });

  // Ao mudar o lote, pré-seleciona áreas da OS mais recente daquele lote
  useEffect(() => {
    if (editingId) return;
    const osDoLote = (ordens as any[])
      .filter((o) => o.lote === lote)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    if (osDoLote.length === 0) {
      setSelectedIds(new Set());
      setOsCarregada(null);
      return;
    }
    const ultima = osDoLote[0];
    apiRequest("GET", `/api/ordens/${ultima.id}`)
      .then((r) => r.json())
      .then((data: any) => {
        if (data.areas) {
          setSelectedIds(new Set(data.areas.map((a: any) => a.id)));
          setOsCarregada(ultima.numero);
        }
      });
  }, [lote, ordens, editingId]);

  const areasFiltradas = useMemo(() => {
    const base = todasAreas
      .filter((a) => a.lote === lote)
      .sort((a, b) => a.id - b.id);
    if (!busca.trim()) return base;
    const q = busca.toLowerCase();
    return base.filter(
      (a) =>
        a.endereco.toLowerCase().includes(q) ||
        (a.bairro || "").toLowerCase().includes(q) ||
        (a.tipo || "").toLowerCase().includes(q)
    );
  }, [todasAreas, lote, busca]);

  const totalPages = Math.ceil(areasFiltradas.length / PER_PAGE);
  const pageAreas = areasFiltradas.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const selectedAreas = useMemo(
    () => todasAreas.filter((a) => selectedIds.has(a.id)),
    [todasAreas, selectedIds]
  );
  const totalMetragem = selectedAreas.reduce(
    (s, a) => s + (a.metragem_m2 || 0),
    0
  );

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiRequest("POST", "/api/cronogramas", data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Cronograma salvo com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/cronogramas"] });
      resetForm();
    },
    onError: () =>
      toast({ title: "Erro ao salvar cronograma", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiRequest("PATCH", `/api/cronogramas/${id}`, data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Cronograma atualizado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/cronogramas"] });
      resetForm();
    },
    onError: () =>
      toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/cronogramas/${id}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Cronograma excluído" });
      queryClient.invalidateQueries({ queryKey: ["/api/cronogramas"] });
      setConfirmDelete(null);
    },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  function resetForm() {
    setSelectedIds(new Set());
    setSemanaInicio("");
    setSemanaFim("");
    setObservacao("");
    setEditingId(null);
    setOsCarregada(null);
    setPage(1);
  }

  async function handleEdit(cronograma: any) {
    setActiveTab("novo");
    setEditingId(cronograma.id);
    setLote(cronograma.lote);
    setSemanaInicio(cronograma.semana_inicio);
    setSemanaFim(cronograma.semana_fim);
    setObservacao(cronograma.observacao || "");
    const r = await apiRequest("GET", `/api/cronogramas/${cronograma.id}`);
    const data = await r.json();
    if (data.areas) {
      setSelectedIds(new Set(data.areas.map((a: any) => a.id)));
    }
  }

  function handleSubmit() {
    if (!semanaInicio || !semanaFim) {
      toast({ title: "Informe o período da semana", variant: "destructive" });
      return;
    }
    if (selectedIds.size === 0) {
      toast({ title: "Selecione ao menos uma área", variant: "destructive" });
      return;
    }
    const data = {
      lote,
      semana_inicio: semanaInicio,
      semana_fim: semanaFim,
      observacao: observacao || undefined,
      area_ids: Array.from(selectedIds),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  }

  function toggleArea(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function togglePage(checked: boolean) {
    const next = new Set(selectedIds);
    pageAreas.forEach((a) => (checked ? next.add(a.id) : next.delete(a.id)));
    setSelectedIds(next);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-emerald-700 text-white px-6 py-4 flex items-center gap-3 flex-shrink-0">
        <Link href="/">
          <button className="p-1 rounded hover:bg-emerald-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <CalendarDays className="h-6 w-6" />
        <div>
          <h1 className="text-lg font-bold">Cronograma Semanal</h1>
          <p className="text-xs text-emerald-200">Programação de roçagem</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex-shrink-0">
        <div className="flex px-6">
          {(["novo", "historico"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-emerald-600 text-emerald-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "novo"
                ? editingId
                  ? "Editar Cronograma"
                  : "Novo Cronograma"
                : "Histórico"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 flex-1 overflow-auto">
        {/* ── NOVO / EDITAR ── */}
        {activeTab === "novo" && (
          <div className="space-y-5 max-w-5xl">
            {/* Lote + datas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Lote</label>
                <select
                  value={lote}
                  onChange={(e) => {
                    setLote(Number(e.target.value));
                    setSelectedIds(new Set());
                    setPage(1);
                  }}
                  className="w-full border rounded-md px-3 py-2 bg-background text-sm"
                >
                  <option value={1}>Lote 1 — Zona Norte</option>
                  <option value={2}>Lote 2 — Zona Sul</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Início da semana
                </label>
                <input
                  type="date"
                  value={semanaInicio}
                  onChange={(e) => setSemanaInicio(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Fim da semana
                </label>
                <input
                  type="date"
                  value={semanaFim}
                  onChange={(e) => setSemanaFim(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 bg-background text-sm"
                />
              </div>
            </div>

            {/* Quick selectors */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const { inicio, fim } = getWeekDates(0);
                  setSemanaInicio(inicio);
                  setSemanaFim(fim);
                }}
                className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors"
              >
                Semana atual
              </button>
              <button
                onClick={() => {
                  const { inicio, fim } = getWeekDates(1);
                  setSemanaInicio(inicio);
                  setSemanaFim(fim);
                }}
                className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors"
              >
                Próxima semana
              </button>
            </div>

            {/* Summary */}
            {selectedIds.size > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    {selectedIds.size} área
                    {selectedIds.size !== 1 ? "s" : ""} selecionada
                    {selectedIds.size !== 1 ? "s" : ""}
                  </span>
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 ml-3">
                    Total:{" "}
                    {totalMetragem.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    m²
                  </span>
                </div>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  Limpar seleção
                </button>
              </div>
            )}

            {/* Banner OS carregada */}
            {osCarregada && !editingId && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5 flex items-center justify-between">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Áreas da OS <span className="font-semibold">{osCarregada}</span> pré-selecionadas. Adicione ou remova conforme necessário.
                </p>
                <button
                  onClick={() => { setSelectedIds(new Set()); setOsCarregada(null); }}
                  className="text-xs text-blue-600 hover:underline ml-4 flex-shrink-0"
                >
                  Limpar
                </button>
              </div>
            )}

            {/* Search */}
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por endereço, bairro ou tipo..."
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPage(1);
                  }}
                  className="w-full border rounded-md pl-9 pr-4 py-2 bg-background text-sm"
                />
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {areasFiltradas.length} área
                {areasFiltradas.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={
                            pageAreas.length > 0 &&
                            pageAreas.every((a) => selectedIds.has(a.id))
                          }
                          onChange={(e) => togglePage(e.target.checked)}
                          className="accent-emerald-600"
                        />
                      </th>
                      <th className="px-3 py-2 text-left font-medium w-14">
                        ID
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Endereço
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Bairro
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Tipo</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Metragem (m²)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageAreas.map((area, idx) => (
                      <tr
                        key={area.id}
                        onClick={() => toggleArea(area.id)}
                        className={`border-t cursor-pointer hover:bg-muted/30 transition-colors ${
                          selectedIds.has(area.id)
                            ? "bg-emerald-50 dark:bg-emerald-950/20"
                            : idx % 2 !== 0
                            ? "bg-muted/10"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(area.id)}
                            onChange={() => {}}
                            className="accent-emerald-600"
                          />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {area.id}
                        </td>
                        <td className="px-3 py-2">{area.endereco}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {area.bairro || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {area.tipo}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {area.metragem_m2
                            ? area.metragem_m2.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {pageAreas.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          Nenhuma área encontrada
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="border-t px-4 py-2 flex items-center justify-between bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-2 py-1 text-xs border rounded hover:bg-accent disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="px-2 py-1 text-xs border rounded hover:bg-accent disabled:opacity-40"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Observação */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Observação (opcional)
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                placeholder="Ex: Prioridade para áreas com atraso..."
                className="w-full border rounded-md px-3 py-2 bg-background text-sm resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {editingId ? "Atualizar Cronograma" : "Salvar Cronograma"}
              </button>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="px-6 py-2.5 border rounded-md text-sm font-medium hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {activeTab === "historico" && (
          <div className="space-y-3 max-w-4xl">
            {cronogramas.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum cronograma cadastrado ainda</p>
              </div>
            ) : (
              cronogramas.map((c: any) => (
                <div
                  key={c.id}
                  className="border rounded-lg p-4 flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">
                        Lote {c.lote}
                      </span>
                      <span className="text-sm font-medium">
                        {formatDate(c.semana_inicio)} —{" "}
                        {formatDate(c.semana_fim)}
                      </span>
                    </div>
                    {c.observacao && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.observacao}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Criado por {c.criado_por || "Sistema"} em{" "}
                      {formatDate(c.created_at || "")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={`/public/cronograma/${c.lote}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors flex items-center gap-1.5"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver público
                    </a>
                    <button
                      onClick={() => handleEdit(c)}
                      className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors flex items-center gap-1.5"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                    <button
                      onClick={() => setConfirmDelete(c.id)}
                      className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="h-3 w-3" />
                      Excluir
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-semibold mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-muted-foreground mb-4">
              As áreas programadas serão removidas da página pública imediatamente.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
