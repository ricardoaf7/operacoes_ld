import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, LogOut, MapPin, Search, ChevronLeft, CheckCircle2,
  Navigation, Loader2, ImageIcon, X,
} from "lucide-react";

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

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Reduz a foto para no máx. 1600px e JPEG 80% — economiza dados móveis do encarregado
async function comprimirImagem(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8)
  );
}

const hojeLocal = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD no fuso do aparelho

export default function EncarregadoPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsErro, setGpsErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [localSelecionado, setLocalSelecionado] = useState<VarricaoLocal | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);

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

  // Ordenação: programados para hoje primeiro, depois por distância do GPS
  const listaOrdenada = useMemo(() => {
    const q = removeAccents(busca.trim().toLowerCase());
    const filtrados = q
      ? locais.filter((l) =>
          removeAccents(`${l.nome} ${l.complemento ?? ""} ${l.regiao ?? ""}`.toLowerCase()).includes(q)
        )
      : locais;

    const comDist = filtrados.map((l) => ({
      local: l,
      hoje: programadoHoje(l),
      dist: gps && l.lat != null && l.lng != null
        ? distanciaMetros(gps.lat, gps.lng, l.lat, l.lng)
        : null,
    }));

    comDist.sort((a, b) => {
      if (a.hoje !== b.hoje) return a.hoje ? -1 : 1;
      if (a.dist != null && b.dist != null) return a.dist - b.dist;
      if (a.dist != null) return -1;
      if (b.dist != null) return 1;
      return a.local.nome.localeCompare(b.local.nome);
    });
    return comDist;
  }, [locais, busca, gps]);

  const enviarMutation = useMutation({
    mutationFn: async () => {
      if (!preview || !localSelecionado) throw new Error("Sem foto");
      const form = new FormData();
      form.append("photo", preview.blob, "foto.jpg");
      form.append("localId", String(localSelecionado.id));
      form.append("dataServico", hojeLocal());
      if (gps) {
        form.append("lat", String(gps.lat));
        form.append("lng", String(gps.lng));
      }
      const res = await fetch("/api/varricao/fotos", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao enviar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Foto enviada!", description: localSelecionado?.nome });
      queryClient.invalidateQueries({ queryKey: ["/api/varricao/fotos"] });
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview(null);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Erro ao enviar", description: e.message }),
  });

  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const blob = await comprimirImagem(file);
    setPreview({ url: URL.createObjectURL(blob), blob });
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
          {preview ? (
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
                disabled={enviarMutation.isPending}
                onClick={() => enviarMutation.mutate()}
              >
                {enviarMutation.isPending ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Enviando...</>
                ) : (
                  <><CheckCircle2 className="h-5 w-5 mr-2" /> Enviar Foto</>
                )}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => fileInputRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" /> Tirar outra
              </Button>
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
