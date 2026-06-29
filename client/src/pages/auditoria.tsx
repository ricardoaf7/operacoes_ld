import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Shield, User, Calendar, FileText, ClipboardList, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIPO_LABELS: Record<string, string> = {
  ordem_servico: "Ordem de Serviço",
  cronograma: "Cronograma",
};

const ACAO_COLORS: Record<string, string> = {
  criou: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  editou: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  excluiu: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AuditoriaPage() {
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroFrom, setFiltroFrom] = useState("");
  const [filtroTo, setFiltroTo] = useState("");
  const [expandido, setExpandido] = useState<number | null>(null);

  const params = new URLSearchParams();
  if (filtroTipo !== "todos") params.set("tipo", filtroTipo);
  if (filtroFrom) params.set("from", filtroFrom);
  if (filtroTo) params.set("to", filtroTo);

  const { data: registros = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/audit-log", filtroTipo, filtroFrom, filtroTo],
    queryFn: async () => {
      const r = await fetch(`/api/audit-log?${params}`);
      if (!r.ok) throw new Error("Erro ao buscar histórico");
      return r.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-500" />
            <div>
              <h1 className="text-lg font-semibold">Histórico de Alterações</h1>
              <p className="text-xs text-muted-foreground">Registro de todas as criações, edições e exclusões</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-6 p-4 bg-card border border-border/50 rounded-xl">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Filtros:</span>
          </div>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="ordem_servico">Ordem de Serviço</SelectItem>
              <SelectItem value="cronograma">Cronograma</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">De:</span>
            <Input type="date" value={filtroFrom} onChange={e => setFiltroFrom(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Até:</span>
            <Input type="date" value={filtroTo} onChange={e => setFiltroTo(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          {(filtroTipo !== "todos" || filtroFrom || filtroTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setFiltroTipo("todos"); setFiltroFrom(""); setFiltroTo(""); }} className="h-8 text-xs">
              Limpar
            </Button>
          )}
        </div>

        {/* Contagem */}
        <p className="text-sm text-muted-foreground mb-4">
          {isLoading ? "Carregando..." : `${registros.length} registro${registros.length !== 1 ? "s" : ""} encontrado${registros.length !== 1 ? "s" : ""}`}
        </p>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : registros.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {registros.map((r: any) => (
              <div key={r.id} className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/30 active:bg-muted/60 transition-[background-color] duration-150"
                  onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                >
                  {/* Ícone tipo */}
                  <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                    {r.tipo === "ordem_servico"
                      ? <ClipboardList className="h-4 w-4 text-slate-500" />
                      : <Calendar className="h-4 w-4 text-slate-500" />
                    }
                  </div>

                  {/* Conteúdo principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACAO_COLORS[r.acao] || ""}`}>
                        {r.acao}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">
                        {TIPO_LABELS[r.tipo] || r.tipo}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-0.5 truncate">{r.descricao || `ID ${r.referencia_id}`}</p>
                  </div>

                  {/* Usuário e data */}
                  <div className="flex-shrink-0 text-right hidden sm:block">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                      <User className="h-3 w-3" />
                      <span>{r.usuario_nome}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end mt-0.5">
                      <FileText className="h-3 w-3" />
                      <span>{formatDateTime(r.created_at)}</span>
                    </div>
                  </div>
                </button>

                {/* Detalhes expandidos */}
                {expandido === r.id && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-3">
                    <div className="sm:hidden mb-3 text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1"><User className="h-3 w-3" />{r.usuario_nome}</div>
                      <div className="flex items-center gap-1"><FileText className="h-3 w-3" />{formatDateTime(r.created_at)}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {r.dados_anteriores && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Antes</p>
                          <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-auto max-h-48 text-foreground/70">
                            {JSON.stringify(r.dados_anteriores, null, 2)}
                          </pre>
                        </div>
                      )}
                      {r.dados_novos && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Depois</p>
                          <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-auto max-h-48 text-foreground/70">
                            {JSON.stringify(r.dados_novos, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
