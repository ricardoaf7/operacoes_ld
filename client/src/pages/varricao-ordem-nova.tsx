import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, FileDown, FileSpreadsheet, CheckCircle2, AlertTriangle, Settings, FileText, History } from "lucide-react";
import { VarricaoStatusBadge } from "@/components/VarricaoStatusBadge";
import { VarricaoOrdemRascunho } from "@/components/VarricaoOrdemRascunho";
import { exportarOrdemExcel, exportarOrdemPdf } from "@/lib/varricao-ordens-export";
import {
  formatMesReferencia,
  type VarricaoOrdemPayload, type VarricaoOrdemLocal, type VarricaoConfig, type VarricaoOrdemRegistro,
} from "@/lib/varricao-ordens-types";
import { calcularSubtotais } from "@/lib/varricao-ordens-utils";

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

function proximoMesISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function VarricaoOrdemNovaPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [mes, setMes] = useState(proximoMesISO());
  const [referenciaId, setReferenciaId] = useState<string>(""); // "" = automática (última finalizada)
  const [numero, setNumero] = useState("");
  const [dataEmissao, setDataEmissao] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [observacao, setObservacao] = useState("");
  const [rascunho, setRascunho] = useState<VarricaoOrdemLocal[] | null>(null);
  const [chaveCarregada, setChaveCarregada] = useState<string | null>(null);

  const { data: ordens = [] } = useQuery<VarricaoOrdemRegistro[]>({
    queryKey: ["/api/varricao/ordens"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/ordens")).json(),
  });
  const finalizadas = ordens
    .filter((o) => o.status === "finalizada")
    .sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia));

  const chaveAtual = `${mes}|${referenciaId}`;
  const { data: preview, isLoading } = useQuery<VarricaoOrdemPayload>({
    queryKey: ["/api/varricao/ordens/preview", mes, referenciaId],
    queryFn: async () => {
      const qs = referenciaId ? `&referenciaId=${referenciaId}` : "";
      return (await apiRequest("GET", `/api/varricao/ordens/preview?mes=${mes}${qs}`)).json();
    },
  });

  const { data: todosLocais = [] } = useQuery<VarricaoLocalCompleto[]>({
    queryKey: ["/api/varricao/locais"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/locais")).json(),
  });

  const { data: config } = useQuery<VarricaoConfig>({
    queryKey: ["/api/varricao/config"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/config")).json(),
  });

  // Inicializa (ou reinicializa, se o mês ou a referência mudarem) o rascunho a partir da prévia calculada
  useEffect(() => {
    if (preview && chaveCarregada !== chaveAtual) {
      setRascunho(preview.locais);
      setChaveCarregada(chaveAtual);
    }
  }, [preview, chaveAtual, chaveCarregada]);

  const emitirMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/varricao/ordens", {
        numero: numero.trim(),
        mesReferencia: mes,
        dataEmissao,
        observacao: observacao.trim() || undefined,
        locais: (rascunho ?? []).map((l) => ({ localId: l.localId, dias: l.dias })),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409 && err.ordemExistenteId) {
          navigate(`/varricao/ordens/${err.ordemExistenteId}`);
          throw new Error(err.error);
        }
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: (ordem) => {
      toast({ title: "Ordem de serviço criada como rascunho!" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/ordens"] });
      navigate(`/varricao/ordens/${ordem.id}`);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro ao emitir", description: e.message }),
  });

  const totalLocais = rascunho?.length ?? 0;
  const totalMetragem = (rascunho ?? []).reduce((s, l) => s + l.metragemTotal, 0);
  const podeEmitir = numero.trim().length > 0 && dataEmissao && totalLocais > 0 && !preview?.ordemExistente;

  const payloadParaExportar: VarricaoOrdemPayload | null = rascunho
    ? {
        mesReferencia: mes,
        locais: rascunho,
        subtotaisRegiao: calcularSubtotais(rascunho, "regiao"),
        subtotaisSecao: calcularSubtotais(rascunho, "secao"),
        totalLocais,
        totalMetragem,
      }
    : null;

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
              <h1 className="text-xl font-bold">Nova Ordem de Serviço</h1>
              <p className="text-sm text-muted-foreground">
                Ponto de partida calculado com base na última OS finalizada — ajuste antes de finalizar
              </p>
            </div>
          </div>
          <Link href="/varricao/configuracoes">
            <Button variant="ghost" size="sm">
              <Settings className="h-3.5 w-3.5 mr-1.5" /> Teto de metragem
            </Button>
          </Link>
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
            <Label className="text-xs flex items-center gap-1.5">
              <History className="h-3 w-3" /> Usar como referência
            </Label>
            <Select value={referenciaId || "auto"} onValueChange={(v) => setReferenciaId(v === "auto" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="auto">Automática — última OS finalizada</SelectItem>
                {finalizadas.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    OS {o.numero} — {formatMesReferencia(o.mes_referencia)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Nem sempre o mês anterior é o melhor ponto de partida (feriados, dias úteis diferentes).
              Ex.: para dezembro, pode valer mais usar dezembro do ano passado.
            </p>
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

        {preview?.ordemExistente && (
          <div className="rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 flex items-center gap-3 flex-wrap">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300 flex-1">
              Já existe a <b>OS {preview.ordemExistente.numero}</b> para {formatMesReferencia(mes)}{" "}
              <VarricaoStatusBadge status={preview.ordemExistente.status} />
              {preview.ordemExistente.status === "rascunho"
                ? " — edite-a em vez de criar outra."
                : " — já finalizada. Ajustes precisam de outro processo."}
            </p>
            <Link href={`/varricao/ordens/${preview.ordemExistente.id}`}>
              <Button size="sm" variant="outline">Abrir OS {preview.ordemExistente.numero}</Button>
            </Link>
          </div>
        )}

        {preview && preview.duplicatas && preview.duplicatas.length > 0 && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {preview.duplicatas.length} possível{preview.duplicatas.length > 1 ? "eis" : ""} duplicidade{preview.duplicatas.length > 1 ? "s" : ""} no cadastro
              </h3>
            </div>
            {preview.duplicatas.map((d, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-300">
                "{d.nomeA}" e "{d.nomeB}"
              </p>
            ))}
          </div>
        )}

        {isLoading && <p className="text-center text-sm text-muted-foreground py-10">Calculando ponto de partida...</p>}

        {!isLoading && rascunho && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Rascunho para <b className="text-foreground">{formatMesReferencia(mes)}</b> — {totalLocais} locais, ainda não emitida
                {preview?.referenciaUsada && (
                  <span className="block text-xs mt-0.5">
                    Baseado na OS {preview.referenciaUsada.numero} — {formatMesReferencia(preview.referenciaUsada.mesReferencia)}
                  </span>
                )}
              </p>
              {payloadParaExportar && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportarOrdemExcel(payloadParaExportar)}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportarOrdemPdf(payloadParaExportar)}>
                    <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
                  </Button>
                </div>
              )}
            </div>
            <VarricaoOrdemRascunho
              mesReferencia={mes}
              locais={rascunho}
              todosLocais={todosLocais}
              config={config}
              onChange={setRascunho}
            />
          </>
        )}
      </div>
    </div>
  );
}
