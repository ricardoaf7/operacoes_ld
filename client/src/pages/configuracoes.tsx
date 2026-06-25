import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings, Save, Loader2, ChevronLeft } from "lucide-react";
import type { ContratoConfig } from "@shared/schema";

const LOTES = [
  { value: 1, label: "Lote 1 — Região Norte" },
  { value: 2, label: "Lote 2 — Região Sul" },
];

const CAMPOS: { key: keyof ContratoConfig; label: string; placeholder: string }[] = [
  { key: "regiao",              label: "Região",                    placeholder: "Ex: NORTE" },
  { key: "processo_admin",      label: "Processo Administrativo",   placeholder: "Ex: 006/2023-FUL" },
  { key: "pregao_eletronico",   label: "Pregão Eletrônico",         placeholder: "Ex: 006/2023-FUL" },
  { key: "numero_contrato",     label: "Nº do Contrato",            placeholder: "Ex: 015/2023-FUL" },
  { key: "contratada_nome",     label: "Nome da Contratada",        placeholder: "Ex: COSTA-OESTE SERVIÇOS DE LIMPEZA - EIRELI" },
  { key: "contratada_endereco", label: "Endereço da Contratada",    placeholder: "Ex: Rua Walter Pereira nº 350 - Cilo 3 - CEP 86072-400 - Londrina/PR" },
  { key: "diretor_nome",        label: "Diretor de Operações",      placeholder: "Ex: RICARDO A. FERREIRA" },
  { key: "gerente_nome",        label: "Gerente de Limpeza Urbana", placeholder: "Ex: IVAN LUIS SALOIO" },
  { key: "fiscal_nome",         label: "Fiscal de Contrato de Campo", placeholder: "Ex: DIEGO ROQUE DAS MERCES" },
];

export default function ConfiguracoesPage() {
  const { toast } = useToast();
  const [loteAtivo, setLoteAtivo] = useState(1);
  const [form, setForm] = useState<Partial<ContratoConfig>>({});

  const { data: config, isLoading } = useQuery<ContratoConfig>({
    queryKey: ["/api/contrato-config", loteAtivo],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contrato-config/${loteAtivo}`);
      return res.json();
    },
  });

  useEffect(() => {
    if (config) setForm(config);
    else setForm({ lote: loteAtivo });
  }, [config, loteAtivo]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/contrato-config/${loteAtivo}`, form);
      if (!res.ok) throw new Error("Erro ao salvar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contrato-config", loteAtivo] });
      toast({ title: "Configurações salvas!", description: `Lote ${loteAtivo} atualizado com sucesso.` });
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    },
  });

  const set = (key: keyof ContratoConfig, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-6 pb-4 border-b">
        <Button variant="ghost" size="sm" className="mr-1 text-muted-foreground hover:text-foreground"
          onClick={() => window.history.back()}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Settings className="h-6 w-6 text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold">Configurações de Contrato</h1>
          <p className="text-sm text-muted-foreground">Dados fixos usados nos PDFs de Ordem de Serviço</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 pt-4 max-w-2xl">
        {/* Seletor de lote */}
        <div className="flex gap-2 mb-6">
          {LOTES.map((l) => (
            <button
              key={l.value}
              onClick={() => setLoteAtivo(l.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                loteAtivo === l.value
                  ? "bg-emerald-600 text-white"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
              Estas informações são usadas automaticamente em todos os PDFs de Ordem de Serviço do <strong>Lote {loteAtivo}</strong>.
              Preencha uma única vez e salve.
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                  Dados do Contrato
                </h3>
                <div className="space-y-3">
                  {CAMPOS.slice(0, 4).map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-sm">{label}</Label>
                      <Input
                        value={(form[key] as string) ?? ""}
                        onChange={(e) => set(key, e.target.value)}
                        placeholder={placeholder}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                  Contratada
                </h3>
                <div className="space-y-3">
                  {CAMPOS.slice(4, 6).map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-sm">{label}</Label>
                      <Input
                        value={(form[key] as string) ?? ""}
                        onChange={(e) => set(key, e.target.value)}
                        placeholder={placeholder}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                  Responsáveis CMTU
                </h3>
                <div className="space-y-3">
                  {CAMPOS.slice(6).map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-sm">{label}</Label>
                      <Input
                        value={(form[key] as string) ?? ""}
                        onChange={(e) => set(key, e.target.value)}
                        placeholder={placeholder}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saveMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <Save className="h-4 w-4 mr-2" />}
                Salvar configurações — Lote {loteAtivo}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
