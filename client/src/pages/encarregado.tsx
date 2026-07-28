import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, LogOut, MapPin, Search, ChevronLeft, CheckCircle2,
  Navigation, Loader2, ImageIcon, X, Clock, UploadCloud,
} from "lucide-react";
import { rankearBusca } from "@/lib/search-utils";

const CONTRATO_LABELS: Record<string, string> = {
  rocagem_lote1: "Capina e Roçagem — Lote 1",
  rocagem_lote2: "Capina e Roçagem — Lote 2",
  varricao: "Varrição e Lavação",
};

const SECAO_LABELS: Record<string, string> = {
  varricao: "Varrição",
  varricao_2turno: "Varrição — 2º turno",
  sanitarios: "Sanitários",
  lavagem_vias_noturna: "Lavagem de vias (noturna)",
  lavagem_pracas_noturna: "Lavagem de praças (noturna)",
  lavagem_vias_diurna: "Lavagem de vias (diurna)",
  lavagem_pracas_diurna: "Lavagem de praças (diurna)",
};

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

interface FotoEnviada {
  id: number;
  local_id: number;
  url: string;
  created_at: string;
  local_nome: string;
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistancia(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function programadoHoje(l: VarricaoLocal): boolean {
  const dia = new Date().getDay(); // 0=Dom ... 6=Sáb
  if (l.frequencia === "diario") return dia >= 1 && dia <= 6;
  return (l.dias_semana ?? []).includes(dia);
}

// Descobre as dimensões do arquivo sem decodificar a imagem inteira na memória
function getDimensoesImagem(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler a imagem")); };
    img.src = url;
  });
}

// Reduz a foto para no máx. 1600px e JPEG 80% — economiza dados móveis do encarregado.
// Câmeras de celular tiram fotos de 12-48 megapixels: decodificar a imagem inteira
// antes de reduzir pode exigir 100-200MB de memória e travar o navegador em aparelhos
// mais simples. Por isso pedimos ao navegador para já decodificar em tamanho reduzido
// (createImageBitmap com resizeWidth/resizeHeight), evitando esse pico de memória.
// A marca d'água (local, GPS, data/hora) é gravada na própria imagem para valer
// como registro perante fiscalização.
async function comprimirImagem(file: File, marcaDagua: string[]): Promise<Blob> {
  const maxDim = 1600;
  const { width: origW, height: origH } = await getDimensoesImagem(file);
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "medium",
    });
  } catch {
    // Navegador sem suporte a resize no decode: cai para o modo antigo
    bitmap = await createImageBitmap(file);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close(); // libera a memória do bitmap imediatamente, sem esperar o coletor de lixo

  if (marcaDagua.length > 0) {
    const fontSize = Math.max(14, Math.round(w / 42));
    const pad = Math.round(fontSize * 0.6);
    const lineH = Math.round(fontSize * 1.35);
    const boxH = pad * 2 + lineH * marcaDagua.length;

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, h - boxH, w, boxH);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    marcaDagua.forEach((linha, i) => {
      // Corta a linha se for mais larga que a foto
      let texto = linha;
      while (ctx.measureText(texto).width > w - pad * 2 && texto.length > 4) {
        texto = texto.slice(0, -5) + "…";
      }
      ctx.fillText(texto, pad, h - boxH + pad + i * lineH);
    });
  }

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8)
  );
  canvas.width = 0;
  canvas.height = 0; // ajuda o navegador a liberar o buffer do canvas antes do GC
  return blob;
}

const hojeLocal = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD no fuso do aparelho

// ---------- Fila offline (IndexedDB): fotos guardadas no aparelho até ter internet ----------
interface FilaItem {
  id?: number;
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

function erroDeRede(e: unknown): boolean {
  return !navigator.onLine || e instanceof TypeError || /fetch|network/i.test(String((e as Error)?.message));
}

export default function EncarregadoPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsErro, setGpsErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [localSelecionado, setLocalSelecionado] = useState<VarricaoLocal | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [processando, setProcessando] = useState(false);

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

  const { data: locais = [], isLoading: carregandoLocais } = useQuery<VarricaoLocal[]>({
    queryKey: ["/api/varricao/locais"],
    queryFn: async () => (await apiRequest("GET", "/api/varricao/locais")).json(),
  });

  const { data: fotosHoje = [] } = useQuery<FotoEnviada[]>({
    queryKey: ["/api/varricao/fotos", hojeLocal()],
    queryFn: async () =>
      (await apiRequest("GET", `/api/varricao/fotos?data=${hojeLocal()}&minhas=1`)).json(),
    refetchInterval: 60000,
  });

  const fotosPorLocal = useMemo(() => {
    const m = new Map<number, number>();
    fotosHoje.forEach((f) => m.set(f.local_id, (m.get(f.local_id) ?? 0) + 1));
    return m;
  }, [fotosHoje]);

  // Ordenação: buscando → relevância (nome primeiro); sem busca → programados
  // para hoje primeiro, depois por distância do GPS
  const listaOrdenada = useMemo(() => {
    const q = busca.trim();
    const filtrados = q
      ? rankearBusca(locais, q, (l) => l.nome, (l) => `${l.complemento ?? ""} ${l.regiao ?? ""}`)
      : locais;

    const comDist = filtrados.map((l) => ({
      local: l,
      hoje: programadoHoje(l),
      dist: gps && l.lat != null && l.lng != null
        ? distanciaMetros(gps.lat, gps.lng, l.lat, l.lng)
        : null,
    }));

    // Com busca ativa, mantém a ordem de relevância do rankeamento
    if (q) return comDist;

    comDist.sort((a, b) => {
      if (a.hoje !== b.hoje) return a.hoje ? -1 : 1;
      if (a.dist != null && b.dist != null) return a.dist - b.dist;
      if (a.dist != null) return -1;
      if (b.dist != null) return 1;
      return a.local.nome.localeCompare(b.local.nome);
    });
    return comDist;
  }, [locais, busca, gps]);

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
      localId: localSelecionado!.id,
      localNome: localSelecionado!.nome,
      blob: preview!.blob,
      dataServico: hojeLocal(),
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
    };
  }

  async function enviarAgora() {
    if (!preview || !localSelecionado) return;
    setEnviando(true);
    const item = itemDaFoto();
    try {
      await uploadFotoVarricao(item);
      toast({ title: "Foto enviada!", description: localSelecionado.nome });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/fotos"] });
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
        await uploadFotoVarricao(item);
        if (item.id != null) await filaRemover(item.id);
        ok++;
      } catch (e) {
        falhas++;
        if (erroDeRede(e)) break; // continua sem internet, para de tentar
      }
    }
    await recarregarFila();
    queryClient.invalidateQueries({ queryKey: ["/api/varricao/fotos"] });
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
        localSelecionado.nome + (localSelecionado.complemento ? ` (${localSelecionado.complemento})` : ""),
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

  // ---------- TELA DE UM LOCAL (câmera) ----------
  if (localSelecionado) {
    const fotosDesteLocal = fotosHoje.filter((f) => f.local_id === localSelecionado.id);
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
            <h1 className="font-semibold leading-tight truncate">{localSelecionado.nome}</h1>
            {localSelecionado.complemento && (
              <p className="text-xs text-green-200 truncate">{localSelecionado.complemento}</p>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col p-4 gap-4">
          {processando ? (
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
          )}

          {fotosDesteLocal.length > 0 && !preview && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Enviadas hoje ({fotosDesteLocal.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {fotosDesteLocal.map((f) => (
                  <img
                    key={f.id}
                    src={f.url}
                    alt="Foto enviada"
                    className="aspect-square object-cover rounded-lg border border-border"
                  />
                ))}
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
        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          <b>{fotosHoje.length}</b> foto{fotosHoje.length === 1 ? "" : "s"} enviada{fotosHoje.length === 1 ? "" : "s"} hoje
        </p>
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
        {listaOrdenada.map(({ local, hoje, dist }, idx) => {
          const anterior = listaOrdenada[idx - 1];
          const mostrarCabecalhoHoje = hoje && (!anterior || !anterior.hoje);
          const mostrarCabecalhoOutros = !hoje && (!anterior || anterior.hoje);
          const enviadas = fotosPorLocal.get(local.id) ?? 0;
          return (
            <div key={local.id}>
              {mostrarCabecalhoHoje && (
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Programados para hoje
                </p>
              )}
              {mostrarCabecalhoOutros && (
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Outros locais
                </p>
              )}
              <button
                className="w-full text-left px-4 py-3 border-b border-border/60 active:bg-muted/60 transition-colors flex items-center gap-3"
                onClick={() => setLocalSelecionado(local)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-tight truncate">{local.nome}</p>
                  {local.complemento && (
                    <p className="text-xs text-muted-foreground truncate">{local.complemento}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                    {SECAO_LABELS[local.secao] ?? local.secao}
                    {local.regiao ? ` · ${local.regiao}` : ""}
                  </p>
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
    </div>
  );
}
