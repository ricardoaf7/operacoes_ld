import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { VarricaoDiasPicker } from "./VarricaoDiasPicker";
import { VarricaoBarraProgresso } from "./VarricaoBarraProgresso";
import { SECAO_LABELS } from "@/lib/varricao-utils";
import { rankearBusca } from "@/lib/search-utils";
import { diasUteisDoMes, formatarDiasTexto, diasDoMesParaLocal } from "@/lib/varricao-ordens-utils";
import { formatMetragem, type VarricaoOrdemLocal, type VarricaoConfig } from "@/lib/varricao-ordens-types";

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

interface VarricaoOrdemRascunhoProps {
  mesReferencia: string;
  locais: VarricaoOrdemLocal[];
  todosLocais: VarricaoLocalCompleto[];
  config?: VarricaoConfig;
  onChange: (locais: VarricaoOrdemLocal[]) => void;
}

function categoriaDaSecao(secao: string): "varricao" | "lavacao" | "outros" {
  if (secao.startsWith("lavagem")) return "lavacao";
  if (secao.startsWith("varricao")) return "varricao";
  return "outros";
}

export function VarricaoOrdemRascunho({ mesReferencia, locais, todosLocais, config, onChange }: VarricaoOrdemRascunhoProps) {
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<number | null>(null);

  const [ano, mes] = mesReferencia.split("-").map(Number);
  const diasUteis = diasUteisDoMes(ano, mes);
  const idsNoRascunho = new Set(locais.map((l) => l.localId));

  const sugestoes = busca.trim()
    ? rankearBusca(
        todosLocais.filter((l) => !idsNoRascunho.has(l.id)),
        busca, (l) => l.nome, (l) => `${l.complemento ?? ""} ${l.regiao ?? ""}`, 8
      )
    : [];

  function alterarDias(localId: number, dias: number[]) {
    onChange(locais.map((l) => {
      if (l.localId !== localId) return l;
      const metragemTotal = l.metragemUnica != null ? l.metragemUnica * dias.length : 0;
      return { ...l, dias, diasTexto: formatarDiasTexto(dias, diasUteis), metragemTotal };
    }));
  }

  function remover(localId: number) {
    onChange(locais.filter((l) => l.localId !== localId));
  }

  function adicionar(local: VarricaoLocalCompleto) {
    const dias = diasDoMesParaLocal(local, ano, mes);
    const metragemUnica = local.metragem_unica != null ? Number(local.metragem_unica) : null;
    const novo: VarricaoOrdemLocal = {
      localId: local.id,
      nome: local.nome,
      complemento: local.complemento,
      regiao: local.regiao,
      tipo: local.tipo,
      secao: local.secao,
      metragemUnica,
      dias,
      diasTexto: formatarDiasTexto(dias, diasUteis),
      metragemTotal: metragemUnica != null ? metragemUnica * dias.length : 0,
    };
    onChange([...locais, novo]);
    setBusca("");
    setExpandido(local.id);
  }

  const totaisPorCategoria = locais.reduce(
    (acc, l) => {
      acc[categoriaDaSecao(l.secao)] += l.metragemTotal;
      return acc;
    },
    { varricao: 0, lavacao: 0, outros: 0 }
  );

  const maxVarricao = config?.metragem_maxima_varricao != null ? Number(config.metragem_maxima_varricao) : null;
  const maxLavacao = config?.metragem_maxima_lavacao != null ? Number(config.metragem_maxima_lavacao) : null;

  const secoesPresentes = Object.keys(SECAO_LABELS).filter((s) => locais.some((l) => l.secao === s));

  return (
    <div className="space-y-4">
      {/* Totais vs teto contratual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <VarricaoBarraProgresso label="Varrição" atual={totaisPorCategoria.varricao} maximo={maxVarricao} />
        <VarricaoBarraProgresso label="Lavação" atual={totaisPorCategoria.lavacao} maximo={maxLavacao} />
      </div>

      {/* Busca para incluir local */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar local para incluir nesta OS..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {sugestoes.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
            {sugestoes.map((l) => (
              <button
                key={l.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent/50 border-b border-border/40 last:border-0"
                onClick={() => adicionar(l)}
              >
                <div className="flex items-center gap-1.5">
                  <Plus className="h-3 w-3 text-emerald-600 shrink-0" />
                  <span className="font-medium">{l.nome}</span>
                </div>
                {l.complemento && <p className="text-xs text-muted-foreground pl-4.5">{l.complemento}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista editável agrupada por seção */}
      <div className="border rounded-lg overflow-hidden">
        {locais.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum local nesta OS. Busque acima para incluir.
          </p>
        )}
        {secoesPresentes.map((secao) => {
          const doSecao = locais
            .filter((l) => l.secao === secao)
            .sort((a, b) => (a.regiao ?? "").localeCompare(b.regiao ?? "") || a.nome.localeCompare(b.nome));
          return (
            <div key={secao}>
              <div className="px-4 py-2 bg-muted/50 border-b border-border">
                <h3 className="text-xs font-bold uppercase tracking-wide">
                  {SECAO_LABELS[secao] ?? secao} <span className="font-normal text-muted-foreground">({doSecao.length})</span>
                </h3>
              </div>
              {doSecao.map((l) => {
                const aberto = expandido === l.localId;
                return (
                  <div key={l.localId} className="border-b border-border/60 last:border-0">
                    <div className="flex items-center gap-2 px-4 py-2">
                      <button
                        className="flex-1 min-w-0 text-left flex items-center gap-2"
                        onClick={() => setExpandido(aberto ? null : l.localId)}
                      >
                        {aberto ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{l.nome}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {l.diasTexto} · {l.dias.length} dia{l.dias.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </button>
                      <span className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline">
                        {formatMetragem(l.metragemTotal)} m²
                      </span>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                        onClick={() => remover(l.localId)}
                        title="Remover desta OS"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {aberto && (
                      <div className="px-4 pb-3 pl-9">
                        <VarricaoDiasPicker
                          ano={ano} mes={mes}
                          diasSelecionados={l.dias}
                          onChange={(dias) => alterarDias(l.localId, dias)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
