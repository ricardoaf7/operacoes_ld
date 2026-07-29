import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, FileDown, FileSpreadsheet } from "lucide-react";
import { VarricaoOrdemConteudo } from "@/components/VarricaoOrdemConteudo";
import { exportarOrdemExcel, exportarOrdemPdf } from "@/lib/varricao-ordens-export";
import { formatMesReferencia, type VarricaoOrdemPayload, type VarricaoConfig } from "@/lib/varricao-ordens-types";

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function VarricaoOrdemDetalhePage() {
  const [, params] = useRoute("/varricao/ordens/:id");
  const id = params?.id;

  const { data: payload, isLoading } = useQuery<VarricaoOrdemPayload>({
    queryKey: ["/api/varricao/ordens", id],
    queryFn: async () => (await apiRequest("GET", `/api/varricao/ordens/${id}`)).json(),
    enabled: !!id,
  });

  const { data: config } = useQuery<VarricaoConfig>({
    queryKey: ["/api/varricao/config"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/config")).json(),
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/varricao/ordens">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              {payload?.ordem && (
                <>
                  <h1 className="text-xl font-bold">OS {payload.ordem.numero}</h1>
                  <p className="text-sm text-muted-foreground">
                    {formatMesReferencia(payload.ordem.mes_referencia)} · Emitida em {formatDataBR(payload.ordem.data_emissao)}
                    {payload.ordem.emitido_por && ` por ${payload.ordem.emitido_por}`}
                  </p>
                </>
              )}
            </div>
          </div>
          {payload && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportarOrdemExcel(payload)}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportarOrdemPdf(payload)}>
                <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
              </Button>
            </div>
          )}
        </div>

        {payload?.ordem?.observacao && (
          <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm text-muted-foreground">
            {payload.ordem.observacao}
          </div>
        )}

        {isLoading && <p className="text-center text-sm text-muted-foreground py-10">Carregando...</p>}
        {!isLoading && !payload && <p className="text-center text-sm text-muted-foreground py-10">Ordem de serviço não encontrada.</p>}
        {payload && <VarricaoOrdemConteudo payload={payload} config={config} />}
      </div>
    </div>
  );
}
