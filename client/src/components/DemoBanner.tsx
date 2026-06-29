import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-center py-1.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 shadow-md">
      <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" />
      <span>MODO DEMONSTRAÇÃO — Nenhuma alteração é salva no sistema</span>
    </div>
  );
}
