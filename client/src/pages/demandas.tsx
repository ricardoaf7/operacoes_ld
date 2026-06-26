import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NovaDemandaModal } from "@/components/NovaDemandaModal";
import { DetalheDemandaModal } from "@/components/DetalheDemandaModal";
import { Plus, Search, ClipboardList, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import type { Demanda } from "@shared/schema";
import { TIPOS_DEMANDA, ORIGENS_DEMANDA } from "@shared/schema";

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

export default function DemandasPage() {
  const [showNova, setShowNova] = useState(false);
  const [detalhe, setDetalhe] = useState<Demanda | null>(null);
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroOrigem, setFiltroOrigem] = useState("todos");

  const { data: demandas = [], isLoading } = useQuery<Demanda[]>({
    queryKey: ["/api/demandas"],
    queryFn: async () => (await apiRequest("GET", "/api/demandas")).json(),
    refetchInterval: 60000,
  });

  const filtradas = demandas.filter(d => {
    if (filtroStatus !== "todos" && d.status !== filtroStatus) return false;
    if (filtroTipo !== "todos" && d.tipo !== filtroTipo) return false;
    if (filtroOrigem !== "todos" && d.origem !== filtroOrigem) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.solicitanteNome.toLowerCase().includes(q) ||
        d.tipo.toLowerCase().includes(q) ||
        (d.numeroProcesso ?? "").toLowerCase().includes(q) ||
        (d.solicitanteOrgao ?? "").toLowerCase().includes(q) ||
        (d.responsavelNome ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totais = {
    total: demandas.length,
    aberta: demandas.filter(d => d.status === "aberta").length,
    em_andamento: demandas.filter(d => d.status === "em_andamento").length,
    concluida: demandas.filter(d => d.status === "concluida").length,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Demandas</h1>
          <div className="flex-1" />
          <Button size="sm" className="gap-1.5" onClick={() => setShowNova(true)}>
            <Plus className="h-4 w-4" />
            Nova Demanda
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {/* Cards de resumo */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: totais.total, color: "text-foreground" },
            { label: "Abertas", value: totais.aberta, color: "text-amber-600" },
            { label: "Em Andamento", value: totais.em_andamento, color: "text-blue-600" },
            { label: "Concluídas", value: totais.concluida, color: "text-emerald-600" },
          ].map(c => (
            <div key={c.label} className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Buscar por solicitante, tipo, processo..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="aberta">Abertas</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="concluida">Concluídas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="todos">Todas as origens</SelectItem>
              {ORIGENS_DEMANDA.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-8 text-sm w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {TIPOS_DEMANDA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {demandas.length === 0 ? "Nenhuma demanda registrada ainda." : "Nenhuma demanda encontrada com os filtros aplicados."}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-12">#</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Data</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Solicitante</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24 hidden md:table-cell">Origem</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Responsável</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((d, i) => (
                  <tr
                    key={d.id}
                    className={`border-b border-border/50 last:border-0 cursor-pointer transition-colors hover:bg-muted/40 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    onClick={() => setDetalhe(d)}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{d.id}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(d.dataSolicitacao)}</td>
                    <td className="px-3 py-2.5 font-medium max-w-[200px]">
                      <span className="truncate block">{d.tipo}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium truncate max-w-[150px]">{d.solicitanteNome}</div>
                      {d.solicitanteOrgao && (
                        <div className="text-xs text-muted-foreground truncate max-w-[150px]">{d.solicitanteOrgao}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{d.origem}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                      {d.responsavelNome ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={`text-[10px] px-1.5 py-0 border ${STATUS_COLORS[d.status]}`}>
                        {STATUS_LABELS[d.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/50 bg-muted/20">
              {filtradas.length} {filtradas.length === 1 ? "demanda" : "demandas"}
              {filtradas.length !== demandas.length && ` de ${demandas.length} total`}
            </div>
          </div>
        )}
      </div>

      <NovaDemandaModal open={showNova} onOpenChange={setShowNova} />
      <DetalheDemandaModal demanda={detalhe} open={!!detalhe} onOpenChange={v => { if (!v) setDetalhe(null); }} />
    </div>
  );
}
