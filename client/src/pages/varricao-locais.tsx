import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CATEGORIA_LABELS, categoriaDaSecao, SECAO_LABELS, type VarricaoCategoria } from "@/lib/varricao-utils";
import { VarricaoLocalFormDialog, DIAS } from "@/components/VarricaoLocalFormDialog";

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

const SECOES = SECAO_LABELS;

function labelFrequencia(l: VarricaoLocal) {
  if (l.frequencia === "diario") return "Diário (seg–sáb)";
  if (l.dias_semana?.length) return l.dias_semana.map((d) => DIAS[d]).join(" + ");
  return "Semanal";
}

export default function VarricaoLocaisPage() {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [abaCategoria, setAbaCategoria] = useState<VarricaoCategoria | "todos">("todos");
  const [filtroRegiao, setFiltroRegiao] = useState("");
  const [filtroSecao, setFiltroSecao] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocal, setEditingLocal] = useState<VarricaoLocal | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<VarricaoLocal | null>(null);

  const { data: locais = [], isLoading } = useQuery<VarricaoLocal[]>({
    queryKey: ["/api/varricao/locais"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/locais")).json(),
  });

  const regioes = Array.from(
    new Set(locais.map((l) => l.regiao).filter(Boolean))
  ).sort() as string[];

  // Contagem por categoria — "Praça X (Varrição)" e "Praça X (Lavação)" são a
  // mesma praça em dois contratos diferentes (unidades de cobrança distintas:
  // metro linear × metro quadrado), não uma duplicata. Separar em abas deixa
  // isso claro em vez de misturar tudo numa lista só.
  const contagemPorCategoria = locais.reduce(
    (acc, l) => { acc[categoriaDaSecao(l.secao)]++; return acc; },
    { varricao: 0, lavacao: 0, sanitario: 0 } as Record<VarricaoCategoria, number>
  );

  const secoesDaAba = Object.keys(SECOES).filter(
    (s) => abaCategoria === "todos" || categoriaDaSecao(s) === abaCategoria
  );

  const filtrados = locais.filter((l) => {
    if (abaCategoria !== "todos" && categoriaDaSecao(l.secao) !== abaCategoria) return false;
    if (filtroRegiao && l.regiao !== filtroRegiao) return false;
    if (filtroSecao && l.secao !== filtroSecao) return false;
    if (busca && !correspondeBusca(`${l.nome} ${l.complemento ?? ""} ${l.regiao ?? ""}`, busca)) {
      return false;
    }
    return true;
  });

  const semGeo = locais.filter((l) => l.geocode_status === "revisar").length;

  function mudarAba(aba: VarricaoCategoria | "todos") {
    setAbaCategoria(aba);
    setFiltroSecao(""); // seções disponíveis mudam por aba
  }

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
    setEditingLocal(null);
    setDialogOpen(true);
  }

  function abrirEdicao(l: VarricaoLocal) {
    setEditingLocal(l);
    setDialogOpen(true);
  }

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

        {/* Abas por categoria de contrato */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {(["todos", "varricao", "lavacao", "sanitario"] as const).map((aba) => (
            <button
              key={aba}
              onClick={() => mudarAba(aba)}
              className={`px-3.5 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                abaCategoria === aba
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {aba === "todos" ? "Todos" : CATEGORIA_LABELS[aba]}
              <span className="ml-1.5 text-xs opacity-60">
                ({aba === "todos" ? locais.length : contagemPorCategoria[aba]})
              </span>
            </button>
          ))}
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
          {secoesDaAba.length > 1 && (
            <Select value={filtroSecao || "all"} onValueChange={(v) => setFiltroSecao(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Seção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as seções</SelectItem>
                {secoesDaAba.map((k) => (
                  <SelectItem key={k} value={k}>{SECOES[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
          Mostrando {filtrados.length} de {abaCategoria === "todos" ? locais.length : contagemPorCategoria[abaCategoria]} locais
          {abaCategoria !== "todos" && ` em ${CATEGORIA_LABELS[abaCategoria]}`}
        </p>
      </div>

      <VarricaoLocalFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        local={editingLocal}
        regioesExistentes={regioes}
      />

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
