import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle,
  ImageIcon, CalendarDays, FileText, FolderDown,
} from "lucide-react";
import { Link } from "wouter";
import { VarricaoFotoThumb, type VarricaoFoto } from "@/components/VarricaoFotoThumb";
import { SECAO_LABELS, dataLocalISO, programadoNaData } from "@/lib/varricao-utils";
import { formatMesReferencia, type VarricaoOrdemRegistro } from "@/lib/varricao-ordens-types";

interface VarricaoLocal {
  id: number;
  nome: string;
  complemento: string | null;
  regiao: string | null;
  tipo: string | null;
  secao: string;
  frequencia: string;
  dias_semana: number[] | null;
  lat: number | null;
  lng: number | null;
}

interface FotoComLocal extends VarricaoFoto {
  local_id: number;
}

function formatDataExtenso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export default function VarricaoCoberturaPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const podeExcluir = user?.role === "admin" || user?.role === "gestor" || user?.role === "fiscal";

  const [data, setData] = useState(() => dataLocalISO(0));
  const [filtroSecao, setFiltroSecao] = useState("");
  const [filtroRegiao, setFiltroRegiao] = useState("");
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [fotoParaExcluir, setFotoParaExcluir] = useState<VarricaoFoto | null>(null);

  const { data: locais = [], isLoading: carregandoLocais } = useQuery<VarricaoLocal[]>({
    queryKey: ["/api/varricao/locais"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/locais")).json(),
  });

  const { data: fotosDoDia = [], isLoading: carregandoFotos } = useQuery<FotoComLocal[]>({
    queryKey: ["/api/varricao/fotos", "cobertura", data],
    queryFn: async () => (await apiRequest("GET", `/api/varricao/fotos?data=${data}`)).json(),
  });

  // OS vigente para o mês da data selecionada (rastreabilidade: o que deveria
  // acontecer segundo a OS emitida × o que aconteceu de fato nesta cobertura)
  const { data: ordens = [] } = useQuery<VarricaoOrdemRegistro[]>({
    queryKey: ["/api/varricao/ordens"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/ordens")).json(),
  });
  const mesDaData = data.slice(0, 7);
  const osVigente = ordens.find((o) => o.mes_referencia === mesDaData);

  const excluirMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/varricao/fotos/${id}`);
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      toast({ title: "Foto excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/fotos"] });
      setFotoParaExcluir(null);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Erro ao excluir", description: e.message }),
  });

  const regioes = Array.from(new Set(locais.map((l) => l.regiao).filter(Boolean))).sort() as string[];

  const locaisFiltrados = locais.filter((l) => {
    if (filtroSecao && l.secao !== filtroSecao) return false;
    if (filtroRegiao && l.regiao !== filtroRegiao) return false;
    return true;
  });

  const fotosPorLocal = useMemo(() => {
    const m = new Map<number, FotoComLocal[]>();
    fotosDoDia.forEach((f) => {
      if (!m.has(f.local_id)) m.set(f.local_id, []);
      m.get(f.local_id)!.push(f);
    });
    return m;
  }, [fotosDoDia]);

  const { programados, comFoto, faltantes, foraDaProgramacao } = useMemo(() => {
    const idsFiltrados = new Set(locaisFiltrados.map((l) => l.id));
    const prog = locaisFiltrados.filter((l) => programadoNaData(l, data));
    const cf = prog.filter((l) => (fotosPorLocal.get(l.id)?.length ?? 0) > 0);
    const falt = prog.filter((l) => !(fotosPorLocal.get(l.id)?.length ?? 0));
    // Locais que enviaram foto no dia mas não estavam programados (revisita, extra, etc.)
    const idsProg = new Set(prog.map((l) => l.id));
    const fora = locaisFiltrados.filter(
      (l) => idsFiltrados.has(l.id) && !idsProg.has(l.id) && (fotosPorLocal.get(l.id)?.length ?? 0) > 0
    );
    return { programados: prog, comFoto: cf, faltantes: falt, foraDaProgramacao: fora };
  }, [locaisFiltrados, data, fotosPorLocal]);

  const cobertura = programados.length > 0 ? Math.round((comFoto.length / programados.length) * 100) : null;

  function toggleExpandido(id: number) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function mudarDia(delta: number) {
    const [y, m, d] = data.split("-").map(Number);
    const dt = new Date(y, m - 1, d + delta);
    setData(dt.toLocaleDateString("en-CA"));
  }

  const carregando = carregandoLocais || carregandoFotos;

  function LinhaLocal({ local, status }: { local: VarricaoLocal; status: "ok" | "faltando" | "extra" }) {
    const fotos = fotosPorLocal.get(local.id) ?? [];
    const expandido = expandidos.has(local.id);
    return (
      <div className="border-b border-border/60 last:border-0">
        <button
          className="w-full text-left px-4 py-2.5 hover:bg-muted/40 transition-colors flex items-center gap-3"
          onClick={() => fotos.length > 0 && toggleExpandido(local.id)}
        >
          {status === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
          {status === "faltando" && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
          {status === "extra" && <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{local.nome}</p>
            {local.complemento && (
              <p className="text-xs text-muted-foreground truncate">{local.complemento}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="font-normal text-[10px]">
              {SECAO_LABELS[local.secao] ?? local.secao}
            </Badge>
            {local.regiao && (
              <span className="text-xs text-muted-foreground hidden sm:inline">{local.regiao}</span>
            )}
            {fotos.length > 0 && (
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                {fotos.length} foto{fotos.length > 1 ? "s" : ""}
                {expandido ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </span>
            )}
          </div>
        </button>
        {expandido && fotos.length > 0 && (
          <div className="px-4 pb-3 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {fotos.map((f) => (
              <VarricaoFotoThumb
                key={f.id}
                foto={f}
                localLat={local.lat}
                localLng={local.lng}
                podeExcluir={podeExcluir}
                onExcluir={setFotoParaExcluir}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Cobertura de Varrição</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhamento diário de fotos por local programado
            </p>
          </div>
        </div>

        {/* Navegação de data + filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border rounded-md">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => mudarDia(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              className="h-9 border-0 w-[150px]"
              value={data}
              max={dataLocalISO(0)}
              onChange={(e) => setData(e.target.value)}
            />
            <Button
              variant="ghost" size="icon" className="h-9 w-9"
              disabled={data >= dataLocalISO(0)}
              onClick={() => mudarDia(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline" size="sm" className="h-9"
            onClick={() => setData(dataLocalISO(0))}
          >
            <CalendarDays className="h-3.5 w-3.5 mr-1.5" /> Hoje
          </Button>

          <Select value={filtroSecao || "all"} onValueChange={(v) => setFiltroSecao(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[190px] h-9">
              <SelectValue placeholder="Seção" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as seções</SelectItem>
              {Object.entries(SECAO_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroRegiao || "all"} onValueChange={(v) => setFiltroRegiao(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Região" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regiões</SelectItem>
              {regioes.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fotosDoDia.length > 0 && (
            <Button variant="outline" size="sm" className="h-9" asChild>
              <a href={`/api/varricao/fotos/zip?data=${data}`}>
                <FolderDown className="h-3.5 w-3.5 mr-1.5" /> Baixar fotos (.zip)
              </a>
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground capitalize">{formatDataExtenso(data)}</p>
          {osVigente ? (
            <Link href={`/varricao/ordens/${osVigente.id}`}>
              <span className="text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 hover:underline">
                <FileText className="h-3.5 w-3.5" />
                OS {osVigente.numero} vigente para {formatMesReferencia(mesDaData)}
              </span>
            </Link>
          ) : (
            <Link href="/varricao/ordens/nova">
              <span className="text-xs flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline">
                <AlertTriangle className="h-3.5 w-3.5" />
                Nenhuma OS emitida para {formatMesReferencia(mesDaData)} — emitir agora
              </span>
            </Link>
          )}
        </div>

        {/* Cards resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Programados</p>
            <p className="text-3xl font-bold mt-1">{programados.length}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Com Foto</p>
            <p className="text-3xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{comFoto.length}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Faltantes</p>
            <p className="text-3xl font-bold mt-1 text-red-600 dark:text-red-400">{faltantes.length}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Cobertura</p>
            <p className="text-3xl font-bold mt-1">{cobertura != null ? `${cobertura}%` : "—"}</p>
          </div>
        </div>

        {carregando && (
          <p className="text-center text-sm text-muted-foreground py-10">Carregando...</p>
        )}

        {!carregando && programados.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            Nenhum local programado para esta data com os filtros atuais.
          </p>
        )}

        {!carregando && faltantes.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-red-50 dark:bg-red-950 border-b border-red-100 dark:border-red-900">
              <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
                Faltando ({faltantes.length})
              </h2>
            </div>
            {faltantes.map((l) => <LinhaLocal key={l.id} local={l} status="faltando" />)}
          </div>
        )}

        {!carregando && comFoto.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950 border-b border-emerald-100 dark:border-emerald-900">
              <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Concluídos ({comFoto.length})
              </h2>
            </div>
            {comFoto.map((l) => <LinhaLocal key={l.id} local={l} status="ok" />)}
          </div>
        )}

        {!carregando && foraDaProgramacao.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950 border-b border-blue-100 dark:border-blue-900">
              <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                Fora da programação — enviaram foto mesmo assim ({foraDaProgramacao.length})
              </h2>
            </div>
            {foraDaProgramacao.map((l) => <LinhaLocal key={l.id} local={l} status="extra" />)}
          </div>
        )}
      </div>

      <AlertDialog open={!!fotoParaExcluir} onOpenChange={(v) => !v && setFotoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir foto?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa foto será removida permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={excluirMutation.isPending}
              onClick={() => fotoParaExcluir && excluirMutation.mutate(fotoParaExcluir.id)}
            >
              {excluirMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
