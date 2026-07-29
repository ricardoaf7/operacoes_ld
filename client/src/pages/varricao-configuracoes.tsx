import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Save } from "lucide-react";
import { Link } from "wouter";
import type { VarricaoConfig } from "@/lib/varricao-ordens-types";

export default function VarricaoConfiguracoesPage() {
  const { toast } = useToast();
  const [maxVarricao, setMaxVarricao] = useState("");
  const [maxLavacao, setMaxLavacao] = useState("");

  const { data: config, isLoading } = useQuery<VarricaoConfig>({
    queryKey: ["/api/varricao/config"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/config")).json(),
  });

  useEffect(() => {
    if (config) {
      setMaxVarricao(config.metragem_maxima_varricao != null ? String(config.metragem_maxima_varricao) : "");
      setMaxLavacao(config.metragem_maxima_lavacao != null ? String(config.metragem_maxima_lavacao) : "");
    }
  }, [config]);

  const salvarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/varricao/config", {
        metragemMaximaVarricao: maxVarricao ? parseFloat(maxVarricao.replace(",", ".")) : null,
        metragemMaximaLavacao: maxLavacao ? parseFloat(maxLavacao.replace(",", ".")) : null,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configuração salva!" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/config"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message }),
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/varricao/ordens">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Teto de Metragem Contratual</h1>
            <p className="text-sm text-muted-foreground">
              Limite mensal de referência para Varrição e Lavação
            </p>
          </div>
        </div>

        {!isLoading && (
          <div className="border rounded-lg p-4 space-y-4 bg-card">
            <div>
              <Label>Metragem Máxima — Varrição (m²/mês)</Label>
              <Input
                className="mt-1"
                inputMode="decimal"
                placeholder="Deixe em branco para sem limite"
                value={maxVarricao}
                onChange={(e) => setMaxVarricao(e.target.value)}
              />
            </div>
            <div>
              <Label>Metragem Máxima — Lavação (m²/mês)</Label>
              <Input
                className="mt-1"
                inputMode="decimal"
                placeholder="Deixe em branco para sem limite"
                value={maxLavacao}
                onChange={(e) => setMaxLavacao(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ao montar uma nova Ordem de Serviço, o sistema mostra o total já
              incluído contra este teto — ajuda a remanejar locais entre meses
              (ex.: concentrar recursos numa região em datas específicas) sem
              ultrapassar o contratado.
            </p>
            <Button
              onClick={() => salvarMutation.mutate()}
              disabled={salvarMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {salvarMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
