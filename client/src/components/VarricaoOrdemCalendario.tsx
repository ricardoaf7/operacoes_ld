import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SECAO_LABELS } from "@/lib/varricao-utils";
import type { VarricaoOrdemLocal } from "@/lib/varricao-ordens-types";

interface VarricaoOrdemCalendarioProps {
  mesReferencia: string; // "YYYY-MM"
  locais: VarricaoOrdemLocal[];
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function VarricaoOrdemCalendario({ mesReferencia, locais }: VarricaoOrdemCalendarioProps) {
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null);
  const [ano, mes] = mesReferencia.split("-").map(Number);

  const locaisPorDia = useMemo(() => {
    const m = new Map<number, VarricaoOrdemLocal[]>();
    locais.forEach((l) => {
      l.dias.forEach((d) => {
        if (!m.has(d)) m.set(d, []);
        m.get(d)!.push(l);
      });
    });
    return m;
  }, [locais]);

  const ultimoDia = new Date(ano, mes, 0).getDate();
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();
  const celulas: (number | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: ultimoDia }, (_, i) => i + 1),
  ];
  const maxContagem = Math.max(1, ...Array.from(locaisPorDia.values()).map((v) => v.length));

  function corIntensidade(n: number): string {
    if (n === 0) return "";
    const intensidade = n / maxContagem;
    if (intensidade > 0.66) return "bg-emerald-600 text-white";
    if (intensidade > 0.33) return "bg-emerald-400 text-white";
    return "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300";
  }

  const locaisDoDia = diaSelecionado != null ? locaisPorDia.get(diaSelecionado) ?? [] : [];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {celulas.map((dia, idx) => {
          if (dia == null) return <div key={`vazio-${idx}`} />;
          const qtd = locaisPorDia.get(dia)?.length ?? 0;
          return (
            <button
              key={dia}
              disabled={qtd === 0}
              onClick={() => setDiaSelecionado(dia)}
              className={`aspect-square rounded-md border border-border flex flex-col items-center justify-center transition-colors ${
                qtd > 0 ? "hover:ring-2 hover:ring-emerald-500 cursor-pointer" : "opacity-40 cursor-default"
              } ${corIntensidade(qtd)}`}
            >
              <span className="text-xs font-semibold">{dia}</span>
              {qtd > 0 && <span className="text-[10px] leading-none mt-0.5">{qtd}</span>}
            </button>
          );
        })}
      </div>

      <Dialog open={diaSelecionado != null} onOpenChange={(v) => !v && setDiaSelecionado(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Dia {diaSelecionado} — {locaisDoDia.length} local{locaisDoDia.length !== 1 ? "is" : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {locaisDoDia.map((l) => (
              <div key={l.localId} className="text-sm border-b border-border/60 pb-1.5 last:border-0">
                <p className="font-medium leading-tight">{l.nome}</p>
                {l.complemento && <p className="text-xs text-muted-foreground">{l.complemento}</p>}
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {SECAO_LABELS[l.secao] ?? l.secao}{l.regiao ? ` · ${l.regiao}` : ""}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
