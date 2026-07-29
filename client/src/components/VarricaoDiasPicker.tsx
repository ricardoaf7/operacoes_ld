interface VarricaoDiasPickerProps {
  ano: number;
  mes: number; // 1-12
  diasSelecionados: number[];
  onChange: (dias: number[]) => void;
}

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

export function VarricaoDiasPicker({ ano, mes, diasSelecionados, onChange }: VarricaoDiasPickerProps) {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();
  const celulas: (number | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: ultimoDia }, (_, i) => i + 1),
  ];
  const selecionados = new Set(diasSelecionados);

  function toggle(dia: number) {
    const next = selecionados.has(dia)
      ? diasSelecionados.filter((d) => d !== dia)
      : [...diasSelecionados, dia].sort((a, b) => a - b);
    onChange(next);
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((dia, idx) =>
          dia == null ? (
            <div key={`v-${idx}`} />
          ) : (
            <button
              key={dia}
              type="button"
              onClick={() => toggle(dia)}
              className={`h-6 w-6 rounded text-[10px] font-medium transition-colors ${
                selecionados.has(dia)
                  ? "bg-emerald-600 text-white"
                  : "bg-muted hover:bg-muted-foreground/20 text-muted-foreground"
              }`}
            >
              {dia}
            </button>
          )
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline"
          onClick={() => onChange(Array.from({ length: ultimoDia }, (_, i) => i + 1))}
        >
          Marcar todos
        </button>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:underline"
          onClick={() => onChange([])}
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
