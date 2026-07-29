import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { List, CalendarDays, AlertTriangle } from "lucide-react";
import { VarricaoOrdemCalendario } from "./VarricaoOrdemCalendario";
import { SECAO_LABELS } from "@/lib/varricao-utils";
import { formatMetragem, type VarricaoOrdemPayload } from "@/lib/varricao-ordens-types";

interface VarricaoOrdemConteudoProps {
  payload: VarricaoOrdemPayload;
}

export function VarricaoOrdemConteudo({ payload }: VarricaoOrdemConteudoProps) {
  const [visao, setVisao] = useState<"lista" | "calendario">("lista");
  const { locais, duplicatas = [], subtotaisRegiao, subtotaisSecao, totalLocais, totalMetragem } = payload;

  const secoesPresentes = Object.keys(SECAO_LABELS).filter((s) => locais.some((l) => l.secao === s));

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Locais</p>
          <p className="text-2xl font-bold mt-1">{totalLocais}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Metragem Total</p>
          <p className="text-2xl font-bold mt-1">{formatMetragem(totalMetragem)} <span className="text-sm font-normal text-muted-foreground">m²</span></p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Seções</p>
          <p className="text-2xl font-bold mt-1">{subtotaisSecao.length}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Regiões</p>
          <p className="text-2xl font-bold mt-1">{subtotaisRegiao.length}</p>
        </div>
      </div>

      {/* Aviso de possíveis duplicatas */}
      {duplicatas.length > 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {duplicatas.length} possível{duplicatas.length > 1 ? "eis" : ""} duplicidade{duplicatas.length > 1 ? "s" : ""} — confira antes de emitir
            </h3>
          </div>
          <div className="space-y-1">
            {duplicatas.map((d, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-300">
                "{d.nomeA}" e "{d.nomeB}" {d.distancia === 0 ? "estão cadastrados de forma idêntica" : "têm nomes muito parecidos"}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Toggle Lista/Calendário */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setVisao("lista")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
            visao === "lista" ? "bg-accent border-accent-foreground/20" : "hover:bg-accent/50"
          }`}
        >
          <List className="h-3.5 w-3.5" /> Lista
        </button>
        <button
          onClick={() => setVisao("calendario")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
            visao === "calendario" ? "bg-accent border-accent-foreground/20" : "hover:bg-accent/50"
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" /> Calendário
        </button>
      </div>

      {visao === "calendario" ? (
        <div className="border rounded-lg p-4">
          <VarricaoOrdemCalendario mesReferencia={payload.mesReferencia} locais={locais} />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {doSecao.map((l) => (
                        <tr key={l.localId} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-2 align-top">
                            <p className="font-medium leading-tight">{l.nome}</p>
                            {l.complemento && <p className="text-xs text-muted-foreground">{l.complemento}</p>}
                          </td>
                          <td className="px-3 py-2 align-top text-xs text-muted-foreground whitespace-nowrap">
                            {l.regiao ?? "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-xs text-muted-foreground max-w-[220px]">
                            {l.diasTexto}
                          </td>
                          <td className="px-3 py-2 align-top text-xs text-muted-foreground text-center whitespace-nowrap">
                            {l.dias.length} dia{l.dias.length !== 1 ? "s" : ""}
                          </td>
                          <td className="px-4 py-2 align-top text-right font-mono text-xs whitespace-nowrap">
                            {formatMetragem(l.metragemTotal)} m²
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Subtotais */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 border-b border-border">
            <h3 className="text-xs font-bold uppercase tracking-wide">Subtotal por Região</h3>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {subtotaisRegiao.map((s) => (
                <tr key={s.chave} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-1.5">{s.chave}</td>
                  <td className="px-3 py-1.5 text-center text-muted-foreground">
                    <Badge variant="outline" className="font-normal">{s.quantidade}</Badge>
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono text-xs">{formatMetragem(s.metragemTotal)} m²</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 border-b border-border">
            <h3 className="text-xs font-bold uppercase tracking-wide">Subtotal por Seção</h3>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {subtotaisSecao.map((s) => (
                <tr key={s.chave} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-1.5">{SECAO_LABELS[s.chave] ?? s.chave}</td>
                  <td className="px-3 py-1.5 text-center text-muted-foreground">
                    <Badge variant="outline" className="font-normal">{s.quantidade}</Badge>
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono text-xs">{formatMetragem(s.metragemTotal)} m²</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
