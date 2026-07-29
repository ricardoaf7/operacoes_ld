import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { exportarOrdemExcel, exportarOrdemPdf } from "@/lib/varricao-ordens-export";
import { formatMesReferencia, type VarricaoOrdemPayload, type VarricaoOrdemRegistro } from "@/lib/varricao-ordens-types";

interface VarricaoDocumentoCombinadoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function VarricaoDocumentoCombinadoDialog({ open, onOpenChange }: VarricaoDocumentoCombinadoDialogProps) {
  const { toast } = useToast();
  const [mes, setMes] = useState(mesAtualISO());
  const [gerando, setGerando] = useState<"pdf" | "excel" | null>(null);

  const { data: ordens = [] } = useQuery<VarricaoOrdemRegistro[]>({
    queryKey: ["/api/varricao/ordens"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/ordens")).json(),
    enabled: open,
  });

  const doMes = ordens.filter((o) => o.mes_referencia === mes);
  const varricao = doMes.find((o) => o.categoria === "varricao") ?? null;
  const lavacao = doMes.find((o) => o.categoria === "lavacao") ?? null;
  const prontoVarricao = varricao?.status === "finalizada";
  const prontoLavacao = lavacao?.status === "finalizada";
  const podeGerar = prontoVarricao && prontoLavacao;

  async function gerar(formato: "pdf" | "excel") {
    setGerando(formato);
    try {
      const res = await apiRequest("GET", `/api/varricao/ordens/combinado?mes=${mes}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const payload: VarricaoOrdemPayload = await res.json();
      if (formato === "pdf") await exportarOrdemPdf(payload);
      else await exportarOrdemExcel(payload);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao gerar documento", description: (e as Error).message });
    } finally {
      setGerando(null);
    }
  }

  function StatusLinha({ label, ordem, cor }: { label: string; ordem: VarricaoOrdemRegistro | null; cor: string }) {
    const pronto = ordem?.status === "finalizada";
    return (
      <div className="flex items-center gap-2 text-sm">
        {pronto ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        )}
        <span className={`font-medium ${cor}`}>{label}</span>
        <span className="text-muted-foreground">
          {!ordem
            ? "— nenhuma OS criada para este mês"
            : ordem.status === "finalizada"
              ? `— OS ${ordem.numero} finalizada`
              : `— OS ${ordem.numero} ainda é rascunho, finalize antes`}
        </span>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Documento Combinado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Junta as OS's finalizadas de Varrição e Lavação do mês, mais os Sanitários
            (calculados automaticamente), num único documento — igual ao que já é enviado hoje.
          </p>
          <div>
            <Label className="text-xs">Mês</Label>
            <Input type="month" className="mt-1" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <StatusLinha label="Varrição" ordem={varricao} cor="text-emerald-700 dark:text-emerald-400" />
            <StatusLinha label="Lavação" ordem={lavacao} cor="text-blue-700 dark:text-blue-400" />
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-medium">Sanitário</span>
              <span className="text-muted-foreground">— automático, sem OS própria</span>
            </div>
          </div>
          {!podeGerar && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Finalize as OS's de Varrição e Lavação de {formatMesReferencia(mes)} antes de gerar o documento combinado.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={!podeGerar || gerando !== null}
              onClick={() => gerar("excel")}
            >
              {gerando === "excel" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Excel
            </Button>
            <Button
              className="flex-1"
              disabled={!podeGerar || gerando !== null}
              onClick={() => gerar("pdf")}
            >
              {gerando === "pdf" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
              PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
