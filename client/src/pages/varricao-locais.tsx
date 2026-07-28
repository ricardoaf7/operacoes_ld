import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft, Plus, Pencil, Trash2, Search, MapPin, AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { correspondeBusca } from "@/lib/search-utils";

interface VarricaoLocal {
  id: number;
  nome: string;
  complemento: string | null;
  regiao: string | null;
  tipo: string | null;
  secao: string;
  metragem_unica: string | null;
  frequencia: string;
  dias_semana: number[] | null;
  lat: number | null;
  lng: number | null;
  geocode_status: string;
  ativo: boolean;
}

const SECOES: Record<string, string> = {
  varricao: "Varrição",
  varricao_2turno: "Varrição — 2º turno",
  sanitarios: "Sanitários",
  lavagem_vias_noturna: "Lavagem de vias (noturna)",
  lavagem_pracas_noturna: "Lavagem de praças (noturna)",
  lavagem_vias_diurna: "Lavagem de vias (diurna)",
  lavagem_pracas_diurna: "Lavagem de praças (diurna)",
};

const TIPOS = ["Praça", "Rua", "Travessa", "Alameda", "Canteiro", "Avenida", "Feira", "Sanitários"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function labelFrequencia(l: VarricaoLocal) {
  if (l.frequencia === "diario") return "Diário (seg–sáb)";
  if (l.dias_semana?.length) return l.dias_semana.map((d) => DIAS[d]).join(" + ");
  return "Semanal";
}

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

export default function VarricaoLocaisPage() {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [filtroRegiao, setFiltroRegiao] = useState("");
  const [filtroSecao, setFiltroSecao] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<VarricaoLocal | null>(null);

  const { data: locais = [], isLoading } = useQuery<VarricaoLocal[]>({
    queryKey: ["/api/varricao/locais"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/locais")).json(),
  });

  const regioes = Array.from(
    new Set(locais.map((l) => l.regiao).filter(Boolean))
  ).sort() as string[];

  const filtrados = locais.filter((l) => {
    if (filtroRegiao && l.regiao !== filtroRegiao) return false;
    if (filtroSecao && l.secao !== filtroSecao) return false;
    if (busca && !correspondeBusca(`${l.nome} ${l.complemento ?? ""} ${l.regiao ?? ""}`, busca)) {
      return false;
    }
    return true;
  });

  const semGeo = locais.filter((l) => l.geocode_status === "revisar").length;

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
      const res = editingId
        ? await apiRequest("PATCH", `/api/varricao/locais/${editingId}`, body)
        : await apiRequest("POST", "/api/varricao/locais", body);
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingId ? "Local atualizado!" : "Local cadastrado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/locais"] });
      setDialogOpen(false);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Erro", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/varricao/locais/${id}`);
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      toast({ title: "Local excluído!" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/locais"] });
      setDeleteConfirm(null);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Erro", description: e.message }),
  });

  function abrirNovo() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function abrirEdicao(l: VarricaoLocal) {
    setEditingId(l.id);
    setForm({
      nome: l.nome,
      complemento: l.complemento ?? "",
      regiao: l.regiao ?? "",
      tipo: l.tipo ?? "",
      secao: l.secao,
      metragem: l.metragem_unica ? String(l.metragem_unica) : "",
      frequencia: l.frequencia,
      diasSemana: l.dias_semana ?? [],
    });
    setDialogOpen(true);
  }

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
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Varrição — Locais</h1>
              <p className="text-sm text-muted-foreground">
                {locais.length} locais cadastrados
                {semGeo > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 ml-2">
                    · {semGeo} sem localização confirmada
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Local
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou complemento..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select value={filtroRegiao || "all"} onValueChange={(v) => setFiltroRegiao(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Região" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regiões</SelectItem>
              {regioes.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroSecao || "all"} onValueChange={(v) => setFiltroSecao(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[210px]">
              <SelectValue placeholder="Seção" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as seções</SelectItem>
              {Object.entries(SECOES).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2.5 text-left font-medium">Local</th>
                  <th className="px-3 py-2.5 text-left font-medium">Região</th>
                  <th className="px-3 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2.5 text-left font-medium">Seção</th>
                  <th className="px-3 py-2.5 text-right font-medium">Metragem</th>
                  <th className="px-3 py-2.5 text-left font-medium">Frequência</th>
                  <th className="px-3 py-2.5 text-center font-medium">Local.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!isLoading && filtrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhum local encontrado.
                    </td>
                  </tr>
                )}
                {filtrados.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{l.nome}</p>
                      {l.complemento && (
                        <p className="text-xs text-muted-foreground" title={l.complemento}>
                          {l.complemento}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{l.regiao ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{l.tipo ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="font-normal">
                        {SECOES[l.secao] ?? l.secao}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {l.metragem_unica
                        ? Number(l.metragem_unica).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2, maximumFractionDigits: 2,
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{labelFrequencia(l)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {l.geocode_status === "revisar" ? (
                        <span title="Localização precisa ser confirmada">
                          <AlertTriangle className="h-4 w-4 text-amber-500 inline" />
                        </span>
                      ) : l.lat != null ? (
                        <span title={l.geocode_status === "manual" ? "Ajustada manualmente" : "Localizada automaticamente"}>
                          <MapPin className="h-4 w-4 text-emerald-600 inline" />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteConfirm(l)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Mostrando {filtrados.length} de {locais.length} locais
        </p>
      </div>

      {/* Modal criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Local" : "Novo Local"}</DialogTitle>
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
                  list="regioes-existentes"
                />
                <datalist id="regioes-existentes">
                  {regioes.map((r) => <option key={r} value={r} />)}
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
                    {Object.entries(SECOES).map(([k, v]) => (
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
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
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

      {/* Confirmação de exclusão */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir local</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <b>{deleteConfirm?.nome}</b>
            {deleteConfirm?.complemento ? ` (${deleteConfirm.complemento})` : ""}?
            Essa ação não pode ser desfeita.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
