import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Camera, LogOut, MapPin, Search, ChevronLeft, CheckCircle2,
  Navigation, Loader2, ImageIcon, X, Clock, UploadCloud, Video,
} from "lucide-react";
import { rankearBusca } from "@/lib/search-utils";
import { SECAO_LABELS, distanciaMetros, formatDistancia, programadoNaData, dataLocalISO as dataLocalISOUtil, ehVideo } from "@/lib/varricao-utils";
import { enviarParaUrlAssinada } from "@/lib/supabase-upload";
import { DURACAO_MAXIMA_VIDEO_S, duracaoDoVideo, comprimirImagem } from "@/lib/media-upload";

const CONTRATO_LABELS: Record<string, string> = {
  rocagem_lote1: "Capina e Roçagem — Lote 1",
  rocagem_lote2: "Capina e Roçagem — Lote 2",
  varricao: "Varrição e Lavação",
};

type Modo = "varricao" | "rocagem";

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

interface AreaRocagem {
  id: number;
  endereco: string;
  bairro?: string;
  tipo: string;
  metragem_m2?: number;
  lat: number;
  lng: number;
  lote?: number;
  ultimaRocagem?: string | null;
  proximaPrevisao?: string | null;
  fotos: { url: string; data: string }[];
}

interface FotoEnviada {
  id: number;
  local_id: number;
  url: string;
  created_at: string;
  local_nome: string;
  local_complemento: string | null;
}

// Item normalizado usado para exibir a lista, independente do contrato
// (Varrição usa locais com agenda semanal; Roçagem usa áreas com previsão de 60 dias)
interface ItemLista {
  id: number;
  titulo: string;
  subtitulo: string | null;
  infoLinha: string;
  lat: number | null;
  lng: number | null;
  destaque: boolean;
}

interface FotoGrupo {
  titulo: string;
  subtitulo: string | null;
  fotos: { key: string; url: string }[];
}

const hojeLocal = () => dataLocalISOUtil(0);

// ---------- Fila offline (IndexedDB): fotos guardadas no aparelho até ter internet ----------
interface FilaItem {
  id?: number;
  modo?: Modo; // itens gravados antes desta coluna existir são sempre de Varrição
  localId: number;
  localNome: string;
  blob: Blob;
  dataServico: string;
  lat: number | null;
  lng: number | null;
}

function abrirFilaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("varricao-fila-fotos", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("fotos")) {
        req.result.createObjectStore("fotos", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function filaAdicionar(item: Omit<FilaItem, "id">): Promise<void> {
  const db = await abrirFilaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readwrite");
    tx.objectStore("fotos").add(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function filaListar(): Promise<FilaItem[]> {
  const db = await abrirFilaDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("fotos", "readonly").objectStore("fotos").getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as FilaItem[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function filaRemover(id: number): Promise<void> {
  const db = await abrirFilaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readwrite");
    tx.objectStore("fotos").delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function uploadFotoVarricao(item: Omit<FilaItem, "id">): Promise<void> {
  const form = new FormData();
  form.append("photo", item.blob, "foto.jpg");
  form.append("localId", String(item.localId));
  form.append("dataServico", item.dataServico);
  if (item.lat != null && item.lng != null) {
    form.append("lat", String(item.lat));
    form.append("lng", String(item.lng));
  }
  const res = await fetch("/api/varricao/fotos", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao enviar");
}

async function uploadFotoArea(item: Omit<FilaItem, "id">): Promise<void> {
  const form = new FormData();
  form.append("photo", item.blob, "foto.jpg");
  form.append("date", item.dataServico);
  const res = await fetch(`/api/areas/${item.localId}/photos`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao enviar");
}

async function registrarRocagem(areaId: number, dataServico: string): Promise<void> {
  const res = await fetch(`/api/areas/${areaId}/registrar-rocagem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: dataServico }),
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao registrar roçagem");
}

function erroDeRede(e: unknown): boolean {
  return !navigator.onLine || e instanceof TypeError || /fetch|network/i.test(String((e as Error)?.message));
}

export default function EncarregadoPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const modo: Modo | null =
    user?.contrato === "varricao" ? "varricao" :
    user?.contrato?.startsWith("rocagem") ? "rocagem" :
    null;

  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsErro, setGpsErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [localSelecionado, setLocalSelecionado] = useState<ItemLista | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [processando, setProcessando] = useState(false);
  const [statusVideo, setStatusVideo] = useState<string | null>(null);

  const contratoLabel = user?.contrato ? CONTRATO_LABELS[user.contrato] ?? user.contrato : null;

  // GPS do aparelho
  useEffect(() => {
    if (!navigator.geolocation) { setGpsErro(true); return; }
    const watchId = navigator.geolocation.watchPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsErro(false); },
      () => setGpsErro(true),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const { data: locaisVarricao = [], isLoading: carregandoVarricao } = useQuery<VarricaoLocal[]>({
    queryKey: ["/api/varricao/locais"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/locais")).json(),
    enabled: modo === "varricao",
  });

  const { data: areasRocagem = [], isLoading: carregandoRocagem } = useQuery<AreaRocagem[]>({
    queryKey: ["/api/areas/rocagem"],
    queryFn: async () => (await apiRequest("GET", "/api/areas/rocagem")).json(),
    enabled: modo === "rocagem",
    refetchInterval: modo === "rocagem" ? 60000 : false,
  });

  const { data: fotosHoje = [] } = useQuery<FotoEnviada[]>({
    queryKey: ["/api/varricao/fotos", hojeLocal()],
    queryFn: async () =>
      (await apiRequest("GET", `/api/varricao/fotos?data=${hojeLocal()}&minhas=1`)).json(),
    enabled: modo === "varricao",
    refetchInterval: 60000,
  });

  const carregandoLocais = modo === "varricao" ? carregandoVarricao : carregandoRocagem;

  // Áreas de Roçagem já marcadas como concluídas hoje (por qualquer origem) — usado
  // para não repetir o registro de conclusão a cada nova foto do mesmo local
  const confirmadasHojeRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (modo !== "rocagem") return;
    const hoje = hojeLocal();
    areasRocagem.forEach((a) => { if (a.ultimaRocagem === hoje) confirmadasHojeRef.current.add(a.id); });
  }, [modo, areasRocagem]);

  const itensBase: ItemLista[] = useMemo(() => {
    if (modo === "varricao") {
      const hoje = hojeLocal();
      return locaisVarricao.map((l) => ({
        id: l.id,
        titulo: l.nome,
        subtitulo: l.complemento,
        infoLinha: `${SECAO_LABELS[l.secao] ?? l.secao}${l.regiao ? ` · ${l.regiao}` : ""}`,
        lat: l.lat,
        lng: l.lng,
        destaque: programadoNaData(l, hoje),
      }));
    }
    if (modo === "rocagem") {
      const hoje = hojeLocal();
      return areasRocagem.map((a) => ({
        id: a.id,
        titulo: a.endereco,
        subtitulo: a.bairro ?? null,
        infoLinha: `${a.tipo}${a.metragem_m2 ? ` · ${Math.round(a.metragem_m2)} m²` : ""}`,
        lat: a.lat,
        lng: a.lng,
        destaque: !!a.proximaPrevisao && a.proximaPrevisao <= hoje,
      }));
    }
    return [];
  }, [modo, locaisVarricao, areasRocagem]);

  const labelDestaque = modo === "varricao" ? "Programados para hoje" : "Atrasadas (prazo vencido)";
  const labelResto = modo === "varricao" ? "Outros locais" : "Dentro do prazo";

  // Fotos enviadas hoje por local/área — usado para o selo "X fotos" na lista
  const fotosPorLocal = useMemo(() => {
    const m = new Map<number, number>();
    if (modo === "varricao") {
      fotosHoje.forEach((f) => m.set(f.local_id, (m.get(f.local_id) ?? 0) + 1));
    } else if (modo === "rocagem") {
      const hoje = hojeLocal();
      areasRocagem.forEach((a) => {
        const n = (a.fotos ?? []).filter((f) => f.data.slice(0, 10) === hoje).length;
        if (n > 0) m.set(a.id, n);
      });
    }
    return m;
  }, [modo, fotosHoje, areasRocagem]);

  const totalFotosHoje = modo === "varricao"
    ? fotosHoje.length
    : Array.from(fotosPorLocal.values()).reduce((a, b) => a + b, 0);

  // Fotos do dia agrupadas por local, para o painel "minhas fotos de hoje"
  const gruposFotosHoje: FotoGrupo[] = useMemo(() => {
    if (modo === "varricao") {
      const grupos = new Map<number, FotoGrupo>();
      fotosHoje.forEach((f) => {
        if (!grupos.has(f.local_id)) {
          grupos.set(f.local_id, { titulo: f.local_nome, subtitulo: f.local_complemento, fotos: [] });
        }
        grupos.get(f.local_id)!.fotos.push({ key: String(f.id), url: f.url });
      });
      return Array.from(grupos.values());
    }
    if (modo === "rocagem") {
      const hoje = hojeLocal();
      return areasRocagem
        .map((a) => ({
          titulo: a.endereco,
          subtitulo: a.bairro ?? null,
          fotos: (a.fotos ?? [])
            .filter((f) => f.data.slice(0, 10) === hoje)
            .map((f, i) => ({ key: `${a.id}-${i}`, url: f.url })),
        }))
        .filter((g) => g.fotos.length > 0);
    }
    return [];
  }, [modo, fotosHoje, areasRocagem]);

  const [mostrarMinhasFotos, setMostrarMinhasFotos] = useState(false);

  // Ordenação: buscando → relevância (nome primeiro); sem busca → atrasados/programados
  // para hoje primeiro, depois por distância do GPS
  const listaOrdenada = useMemo(() => {
    const q = busca.trim();
    const filtrados = q
      ? rankearBusca(itensBase, q, (i) => i.titulo, (i) => `${i.subtitulo ?? ""} ${i.infoLinha}`)
      : itensBase;

    const comDist = filtrados.map((item) => ({
      item,
      dist: gps && item.lat != null && item.lng != null
        ? distanciaMetros(gps.lat, gps.lng, item.lat, item.lng)
        : null,
    }));

    // Com busca ativa, mantém a ordem de relevância do rankeamento
    if (q) return comDist;

    comDist.sort((a, b) => {
      if (a.item.destaque !== b.item.destaque) return a.item.destaque ? -1 : 1;
      if (a.dist != null && b.dist != null) return a.dist - b.dist;
      if (a.dist != null) return -1;
      if (b.dist != null) return 1;
      return a.item.titulo.localeCompare(b.item.titulo);
    });
    return comDist;
  }, [itensBase, busca, gps]);

  // Fila offline
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [enviandoFila, setEnviandoFila] = useState(false);

  async function recarregarFila() {
    try { setFila(await filaListar()); } catch { /* IndexedDB indisponível */ }
  }
  useEffect(() => { recarregarFila(); }, []);

  function itemDaFoto(): Omit<FilaItem, "id"> {
    return {
      modo: modo!,
      localId: localSelecionado!.id,
      localNome: localSelecionado!.titulo,
      blob: preview!.blob,
      dataServico: hojeLocal(),
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
    };
  }

  // Envia uma foto da fila (ou recém-tirada) de acordo com o contrato do encarregado.
  // Para Roçagem, além do upload da foto, confirma a área como roçada hoje — mas só
  // uma vez por área/dia, para não empilhar entradas repetidas no histórico da área.
  async function enviarItem(item: Omit<FilaItem, "id">): Promise<void> {
    const itemModo = item.modo ?? "varricao";
    if (itemModo === "varricao") {
      await uploadFotoVarricao(item);
      return;
    }
    await uploadFotoArea(item);
    if (!confirmadasHojeRef.current.has(item.localId)) {
      try {
        await registrarRocagem(item.localId, item.dataServico);
        confirmadasHojeRef.current.add(item.localId);
      } catch {
        // A foto já foi enviada; se só a confirmação falhar, tenta de novo na próxima foto
      }
    }
  }

  function invalidarQueryDoModo(itemModo?: Modo) {
    const m = itemModo ?? "varricao";
    queryClient.invalidateQueries({ queryKey: m === "varricao" ? ["/api/varricao/fotos"] : ["/api/areas/rocagem"] });
  }

  async function enviarAgora() {
    if (!preview || !localSelecionado) return;
    setEnviando(true);
    const item = itemDaFoto();
    try {
      await enviarItem(item);
      toast({ title: "Foto enviada!", description: localSelecionado.titulo });
      invalidarQueryDoModo(item.modo);
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    } catch (e) {
      if (erroDeRede(e)) {
        // Sem internet: guarda no aparelho para enviar depois
        await filaAdicionar(item);
        await recarregarFila();
        toast({
          title: "Sem internet — foto guardada",
          description: "Ela será enviada quando você tocar em Enviar Todas.",
        });
        URL.revokeObjectURL(preview.url);
        setPreview(null);
      } else {
        toast({ variant: "destructive", title: "Erro ao enviar", description: (e as Error).message });
      }
    } finally {
      setEnviando(false);
    }
  }

  async function guardarParaDepois() {
    if (!preview || !localSelecionado) return;
    await filaAdicionar(itemDaFoto());
    await recarregarFila();
    toast({ title: "Foto guardada no aparelho", description: "Envie depois pelo botão Enviar Todas." });
    URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function enviarFilaCompleta() {
    setEnviandoFila(true);
    let ok = 0, falhas = 0;
    for (const item of fila) {
      try {
        await enviarItem(item);
        if (item.id != null) await filaRemover(item.id);
        ok++;
      } catch (e) {
        falhas++;
        if (erroDeRede(e)) break; // continua sem internet, para de tentar
      }
    }
    await recarregarFila();
    invalidarQueryDoModo(modo ?? undefined);
    if (ok > 0 && falhas === 0) {
      toast({ title: `${ok} foto${ok > 1 ? "s" : ""} enviada${ok > 1 ? "s" : ""}!` });
    } else if (ok > 0) {
      toast({ title: `${ok} enviada(s), ${falhas} pendente(s)`, description: "Tente novamente quando tiver internet." });
    } else {
      toast({ variant: "destructive", title: "Não foi possível enviar", description: "Verifique a internet e tente de novo." });
    }
    setEnviandoFila(false);
  }

  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !localSelecionado) return;

    // Libera a prévia anterior (se houver) antes de processar a nova — evita
    // acumular fotos não liberadas na memória ao tirar várias seguidas
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setProcessando(true);

    try {
      const agora = new Date();
      const linhas = [
        localSelecionado.titulo + (localSelecionado.subtitulo ? ` (${localSelecionado.subtitulo})` : ""),
        `${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` +
          (gps ? `  ·  GPS ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : "  ·  GPS indisponível"),
      ];
      const blob = await comprimirImagem(file, linhas);
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível processar a foto",
        description: "Tente tirar a foto novamente.",
      });
    } finally {
      setProcessando(false);
    }
  }

  // Vídeo é grande demais pra passar pelo servidor (limite de payload da
  // Vercel) — sobe DIRETO pro Supabase Storage com uma URL assinada que o
  // servidor gera na hora. Não compressão nem marca d'água (diferente da
  // foto) e, diferente da fila offline de fotos, exige internet no momento
  // do envio — um vídeo de até 30s já é grande demais pra guardar no
  // aparelho junto com as fotos pendentes.
  async function handleVideoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !localSelecionado || !modo) return;

    setStatusVideo("Verificando vídeo...");
    try {
      const duracao = await duracaoDoVideo(file);
      if (duracao > DURACAO_MAXIMA_VIDEO_S + 1) {
        toast({
          variant: "destructive",
          title: "Vídeo muito longo",
          description: `O vídeo tem ${Math.round(duracao)}s — o máximo permitido é ${DURACAO_MAXIMA_VIDEO_S}s.`,
        });
        return;
      }

      setStatusVideo("Enviando vídeo...");
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const dataServico = hojeLocal();

      if (modo === "varricao") {
        const res = await apiRequest("POST", `/api/varricao/locais/${localSelecionado.id}/video-url?ext=${ext}`);
        const { token, path } = await res.json();
        await enviarParaUrlAssinada(path, token, file);
        setStatusVideo("Registrando...");
        await apiRequest("POST", "/api/varricao/fotos/registrar-video", {
          localId: localSelecionado.id, path, dataServico,
          lat: gps?.lat ?? null, lng: gps?.lng ?? null,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/varricao/fotos"] });
      } else {
        const res = await apiRequest("POST", `/api/areas/${localSelecionado.id}/video-url?ext=${ext}`);
        const { token, path } = await res.json();
        await enviarParaUrlAssinada(path, token, file);
        setStatusVideo("Registrando...");
        await apiRequest("POST", `/api/areas/${localSelecionado.id}/video-registrar`, {
          path, date: dataServico,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/areas/rocagem"] });
      }

      toast({ title: "Vídeo enviado!", description: localSelecionado.titulo });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível enviar o vídeo",
        description: erroDeRede(err)
          ? "Sem internet no momento — tente novamente com sinal."
          : "Tente gravar novamente.",
      });
    } finally {
      setStatusVideo(null);
    }
  }

  // ---------- SEM CONTRATO RECONHECIDO ----------
  if (!modo) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-4 text-center">
        <p className="text-sm text-muted-foreground">
          Este usuário não está vinculado a um contrato compatível com esta tela.
        </p>
        <Button variant="outline" onClick={() => logout()}>
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </Button>
      </div>
    );
  }

  // ---------- TELA DE UM LOCAL (câmera) ----------
  if (localSelecionado) {
    const fotosDoLocal = modo === "rocagem"
      ? (areasRocagem.find((a) => a.id === localSelecionado.id)?.fotos ?? [])
          .filter((f) => f.data.slice(0, 10) === hojeLocal())
          .map((f, i) => ({ key: `${localSelecionado.id}-${i}`, url: f.url }))
      : fotosHoje.filter((f) => f.local_id === localSelecionado.id).map((f) => ({ key: String(f.id), url: f.url }));

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-3 py-3 flex items-center gap-2 text-white" style={{ background: "#1e5e38" }}>
          <Button
            variant="ghost" size="icon" className="text-white hover:bg-white/10 shrink-0"
            onClick={() => {
              if (preview) URL.revokeObjectURL(preview.url);
              setPreview(null);
              setLocalSelecionado(null);
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-semibold leading-tight truncate">{localSelecionado.titulo}</h1>
            {localSelecionado.subtitulo && (
              <p className="text-xs text-green-200 truncate">{localSelecionado.subtitulo}</p>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col p-4 gap-4">
          {statusVideo ? (
            <div className="flex-none rounded-2xl border-2 border-dashed border-blue-500/50 bg-blue-500/5 py-14 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
              <span className="font-medium text-blue-700 dark:text-blue-400">{statusVideo}</span>
            </div>
          ) : processando ? (
            <div className="flex-none rounded-2xl border-2 border-dashed border-emerald-500/50 bg-emerald-500/5 py-14 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Processando foto...</span>
            </div>
          ) : preview ? (
            <>
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={preview.url} alt="Prévia da foto" className="w-full max-h-[55vh] object-contain bg-black" />
                <button
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"
                  onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Button
                className="h-14 text-base bg-emerald-600 hover:bg-emerald-700"
                disabled={enviando}
                onClick={enviarAgora}
              >
                {enviando ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Enviando...</>
                ) : (
                  <><CheckCircle2 className="h-5 w-5 mr-2" /> Enviar Agora</>
                )}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" disabled={enviando} onClick={guardarParaDepois}>
                  <Clock className="h-4 w-4 mr-2" /> Enviar depois
                </Button>
                <Button variant="outline" className="h-11" disabled={enviando} onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" /> Tirar outra
                </Button>
              </div>
            </>
          ) : (
            <>
              <button
                className="flex-none rounded-2xl border-2 border-dashed border-emerald-500/50 bg-emerald-500/5 py-14 flex flex-col items-center justify-center gap-3 active:bg-emerald-500/15 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="h-16 w-16 rounded-full bg-emerald-600 flex items-center justify-center">
                  <Camera className="h-8 w-8 text-white" />
                </div>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">Tirar Foto</span>
                {gps ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Navigation className="h-3 w-3" /> Localização será registrada
                  </span>
                ) : (
                  <span className="text-xs text-amber-600">GPS indisponível — foto sem localização</span>
                )}
              </button>
              <Button variant="outline" className="h-11" onClick={() => videoInputRef.current?.click()}>
                <Video className="h-4 w-4 mr-2" /> Gravar Vídeo (até {DURACAO_MAXIMA_VIDEO_S}s)
              </Button>
            </>
          )}

          {fotosDoLocal.length > 0 && !preview && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Enviadas hoje ({fotosDoLocal.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {fotosDoLocal.map((f) =>
                  ehVideo(f.url) ? (
                    <video
                      key={f.key}
                      src={f.url}
                      className="aspect-square object-cover rounded-lg border border-border bg-black"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      key={f.key}
                      src={f.url}
                      alt="Foto enviada"
                      className="aspect-square object-cover rounded-lg border border-border"
                    />
                  )
                )}
              </div>
            </div>
          )}
        </main>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleArquivoSelecionado}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={handleVideoSelecionado}
        />
      </div>
    );
  }

  // ---------- TELA PRINCIPAL (lista de locais) ----------
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 py-3 flex items-center justify-between text-white" style={{ background: "#1e5e38" }}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-green-300">
            CMTU Londrina — Zeladoria
          </p>
          <h1 className="text-lg font-bold leading-tight">Registro de Serviços</h1>
          {contratoLabel && <p className="text-xs text-green-200">{contratoLabel}</p>}
        </div>
        <Button
          variant="ghost" size="icon" className="text-white hover:bg-white/10 shrink-0"
          onClick={() => logout()} title="Sair"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      {/* Resumo do dia */}
      <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950 border-b border-emerald-100 dark:border-emerald-900 flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        {totalFotosHoje > 0 ? (
          <button
            className="text-sm text-emerald-800 dark:text-emerald-300 underline decoration-dotted underline-offset-2"
            onClick={() => setMostrarMinhasFotos(true)}
          >
            <b>{totalFotosHoje}</b> foto{totalFotosHoje === 1 ? "" : "s"} enviada{totalFotosHoje === 1 ? "" : "s"} hoje
          </button>
        ) : (
          <p className="text-sm text-emerald-800 dark:text-emerald-300">Nenhuma foto enviada hoje ainda</p>
        )}
        {gpsErro && (
          <span className="ml-auto text-[11px] text-amber-600">GPS desligado</span>
        )}
      </div>

      {/* Fotos aguardando envio (guardadas no aparelho) */}
      {fila.length > 0 && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
            <b>{fila.length}</b> foto{fila.length > 1 ? "s" : ""} aguardando envio
          </p>
          <Button
            size="sm"
            className="h-8 bg-amber-600 hover:bg-amber-700 text-white"
            disabled={enviandoFila}
            onClick={enviarFilaCompleta}
          >
            {enviandoFila ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Enviando...</>
            ) : (
              <><UploadCloud className="h-3.5 w-3.5 mr-1.5" /> Enviar Todas</>
            )}
          </Button>
        </div>
      )}

      {/* Busca */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-11"
            placeholder="Buscar local..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* Lista */}
      <main className="flex-1 overflow-y-auto">
        {carregandoLocais && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!carregandoLocais && listaOrdenada.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-16">Nenhum local encontrado.</p>
        )}
        {listaOrdenada.map(({ item, dist }, idx) => {
          const anterior = listaOrdenada[idx - 1];
          const mostrarCabecalhoDestaque = item.destaque && (!anterior || !anterior.item.destaque);
          const mostrarCabecalhoResto = !item.destaque && (!anterior || anterior.item.destaque);
          const enviadas = fotosPorLocal.get(item.id) ?? 0;
          return (
            <div key={item.id}>
              {mostrarCabecalhoDestaque && (
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  {labelDestaque}
                </p>
              )}
              {mostrarCabecalhoResto && (
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {labelResto}
                </p>
              )}
              <button
                className="w-full text-left px-4 py-3 border-b border-border/60 active:bg-muted/60 transition-colors flex items-center gap-3"
                onClick={() => setLocalSelecionado(item)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-tight truncate">{item.titulo}</p>
                  {item.subtitulo && (
                    <p className="text-xs text-muted-foreground truncate">{item.subtitulo}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">{item.infoLinha}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {dist != null && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {formatDistancia(dist)}
                    </span>
                  )}
                  {enviadas > 0 && (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle2 className="h-3 w-3" /> {enviadas} foto{enviadas > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </button>
            </div>
          );
        })}
        <div className="h-6" />
      </main>

      {/* Painel: minhas fotos enviadas hoje, agrupadas por local */}
      <Dialog open={mostrarMinhasFotos} onOpenChange={setMostrarMinhasFotos}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fotos enviadas hoje</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {gruposFotosHoje.map((grupo) => (
              <div key={grupo.titulo + (grupo.subtitulo ?? "")}>
                <p className="text-sm font-medium leading-tight">{grupo.titulo}</p>
                {grupo.subtitulo && (
                  <p className="text-xs text-muted-foreground mb-1.5">{grupo.subtitulo}</p>
                )}
                <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                  {grupo.fotos.map((f) => (
                    <a key={f.key} href={f.url} target="_blank" rel="noreferrer">
                      <img
                        src={f.url}
                        alt={`Foto enviada em ${grupo.titulo}`}
                        className="aspect-square object-cover rounded-md border border-border"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
