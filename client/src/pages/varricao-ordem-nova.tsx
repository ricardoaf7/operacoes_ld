import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, FileDown, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { VarricaoOrdemConteudo } from "@/components/VarricaoOrdemConteudo";
import { exportarOrdemExcel, exportarOrdemPdf } from "@/lib/varricao-ordens-export";
import { formatMesReferencia, type VarricaoOrdemPayload } from "@/lib/varricao-ordens-types";

function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Sugere o próximo mês como padrão — é assim que a OS costuma ser preparada,
// com antecedência para o mês seguinte
function proximoMesISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function VarricaoOrdemNovaPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [mes, setMes] = useState(proximoMesISO());
  const [numero, setNumero] = useState("");
  const [dataEmissao, setDataEmissao] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [observacao, setObservacao] = useState("");

  const { data: preview, isLoading } = useQuery<VarricaoOrdemPayload>({
    queryKey: ["/api/varricao/ordens/preview", mes],
    queryFn: async () => (await apiRequest("GET", `/api/varricao/ordens/preview?mes=${mes}`)).json(),
  });

  const emitirMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/varricao/ordens", {
        numero: numero.trim(),
        mesReferencia: mes,
        dataEmissao,
        observacao: observacao.trim() || undefined,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (ordem) => {
      toast({ title: "Ordem de serviço emitida!" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/ordens"] });
      navigate(`/varricao/ordens/${ordem.id}`);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro ao emitir", description: e.message }),
  });

  const podeEmitir = numero.trim().length > 0 && dataEmissao && (preview?.totalLocais ?? 0) > 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/varricao/ordens">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Nova Ordem de Serviço</h1>
            <p className="text-sm text-muted-foreground">
              Escolha o mês — os dias de cada local são calculados automaticamente
            </p>
          </div>
        </div>

        {/* Formulário de emissão */}
        <div className="border rounded-lg p-4 space-y-3 bg-card">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Mês de Referência *</Label>
              <Input
                type="month"
                className="mt-1"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Número da OS *</Label>
              <Input
                className="mt-1"
                placeholder="Ex.: 008/2026"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data de Emissão *</Label>
              <Input
                type="date"
                className="mt-1"
                value={dataEmissao}
                onChange={(e) => setDataEmissao(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!podeEmitir || emitirMutation.isPending}
                onClick={() => emitirMutation.mutate()}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {emitirMutation.isPending ? "Emitindo..." : "Emitir OS"}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea
              className="mt-1 h-16 resize-none"
              placeholder="Notas para esta ordem de serviço..."
              value={observacao}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        {isLoading && <p className="text-center text-sm text-muted-foreground py-10">Calculando...</p>}

        {!isLoading && preview && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Prévia para <b className="text-foreground">{formatMesReferencia(mes)}</b> — ainda não emitida
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportarOrdemExcel(preview)}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportarOrdemPdf(preview)}>
                  <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
                </Button>
              </div>
            </div>
            <VarricaoOrdemConteudo payload={preview} />
          </>
        )}
      </div>
    </div>
  );
}
