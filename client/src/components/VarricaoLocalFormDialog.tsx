import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SECAO_LABELS } from "@/lib/varricao-utils";

// Formulário de cadastro/edição de local de Varrição — compartilhado entre a
// tela de Cadastro de Locais e o botão "Editar" no card do ponto no mapa, pra
// não ter duas versões divergentes do mesmo formulário.

export interface VarricaoLocalEditavel {
  id: number;
  nome: string;
  complemento: string | null;
  regiao: string | null;
  tipo: string | null;
  secao: string;
  metragem_unica: string | null;
  frequencia: string;
  dias_semana: number[] | null;
}

interface VarricaoLocalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  local: VarricaoLocalEditavel | null; // null = cadastrando um local novo
  regioesExistentes?: string[];
}

const TIPOS = ["Praça", "Rua", "Travessa", "Alameda", "Canteiro", "Avenida", "Feira", "Sanitários"];
export const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface FormState {
  nome: string;
  complemento: string;
  regiao: string;
  tipo: string;
  secao: string;
  metragem: string;
  frequencia: string;
  diasSemana: number[];
}

const emptyForm: FormState = {
  nome: "", complemento: "", regiao: "", tipo: "", secao: "varricao",
  metragem: "", frequencia: "diario", diasSemana: [],
};

function formDoLocal(local: VarricaoLocalEditavel): FormState {
  return {
    nome: local.nome,
    complemento: local.complemento ?? "",
    regiao: local.regiao ?? "",
    tipo: local.tipo ?? "",
    secao: local.secao,
    metragem: local.metragem_unica ? String(local.metragem_unica) : "",
    frequencia: local.frequencia,
    diasSemana: local.dias_semana ?? [],
  };
}

export function VarricaoLocalFormDialog({ open, onOpenChange, local, regioesExistentes = [] }: VarricaoLocalFormDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);

  // Recarrega o formulário sempre que o diálogo abre — evita mostrar dado
  // velho de uma edição anterior ao abrir pra outro local
  useEffect(() => {
    if (open) setForm(local ? formDoLocal(local) : emptyForm);
  }, [open, local]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        nome: form.nome.trim(),
        complemento: form.complemento.trim() || null,
        regiao: form.regiao.trim() || null,
        tipo: form.tipo || null,
        secao: form.secao,
        metragemUnica: form.metragem ? parseFloat(form.metragem.replace(",", ".")) : null,
        frequencia: form.frequencia,
        diasSemana: form.frequencia === "semanal" ? form.diasSemana : null,
      };
      const res = local
        ? await apiRequest("PATCH", `/api/varricao/locais/${local.id}`, body)
        : await apiRequest("POST", "/api/varricao/locais", body);
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: local ? "Local atualizado!" : "Local cadastrado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/locais"] });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Erro", description: e.message }),
  });

  function toggleDia(d: number) {
    setForm((f) => ({
      ...f,
      diasSemana: f.diasSemana.includes(d)
        ? f.diasSemana.filter((x) => x !== d)
        : [...f.diasSemana, d].sort(),
    }));
  }

  const canSave =
    form.nome.trim() &&
    (form.frequencia !== "semanal" || form.diasSemana.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto z-[9999]">
        <DialogHeader>
          <DialogTitle>{local ? "Editar Local" : "Novo Local"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label>Nome do local *</Label>
            <Input
              className="mt-1"
              placeholder='Ex.: "Rua Goiás"'
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <Label>Complemento (trecho / referência)</Label>
            <Input
              className="mt-1"
              placeholder='Ex.: "Av. Higienópolis até Av. Duque de Caxias"'
              value={form.complemento}
              onChange={(e) => setForm({ ...form, complemento: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Região</Label>
              <Input
                className="mt-1"
                placeholder="Ex.: Centro"
                value={form.regiao}
                onChange={(e) => setForm({ ...form, regiao: e.target.value })}
                list="regioes-existentes-varricao"
              />
              <datalist id="regioes-existentes-varricao">
                {regioesExistentes.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo || "none"} onValueChange={(v) => setForm({ ...form, tipo: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="none">Sem tipo</SelectItem>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Seção</Label>
              <Select value={form.secao} onValueChange={(v) => setForm({ ...form, secao: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {Object.entries(SECAO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metragem (m/l ou m²)</Label>
              <Input
                className="mt-1"
                placeholder="Ex.: 1100"
                value={form.metragem}
                onChange={(e) => setForm({ ...form, metragem: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Frequência</Label>
            <Select value={form.frequencia} onValueChange={(v) => setForm({ ...form, frequencia: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="diario">Diário (segunda a sábado)</SelectItem>
                <SelectItem value="semanal">Dias fixos da semana</SelectItem>
              </SelectContent>
            </Select>
            {form.frequencia === "semanal" && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {DIAS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDia(i)}
                    className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
                      form.diasSemana.includes(i)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={!canSave || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
