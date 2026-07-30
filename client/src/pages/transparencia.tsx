import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, ImageIcon, Loader2 } from "lucide-react";
import { ehVideo } from "@/lib/varricao-utils";

type Servico = "rocagem" | "varricao";

interface FotoRocagem {
  url: string;
  endereco: string;
  bairro: string | null;
}

interface FotoVarricao {
  id: number;
  url: string;
  local_nome: string;
  local_complemento: string | null;
  local_regiao: string | null;
}

interface FotoGrupo {
  titulo: string;
  subtitulo: string | null;
  fotos: { key: string; url: string }[];
}

function hojeLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function TransparenciaPage() {
  const { logout } = useAuth();
  const [servico, setServico] = useState<Servico>("rocagem");
  const [data, setData] = useState(hojeLocal());

  const { data: fotosRocagem = [], isLoading: carregandoRocagem } = useQuery<FotoRocagem[]>({
    queryKey: ["/api/areas/fotos", data],
    queryFn: async () => (await apiRequest("GET", `/api/areas/fotos?data=${data}`)).json(),
    enabled: servico === "rocagem",
  });

  const { data: fotosVarricao = [], isLoading: carregandoVarricao } = useQuery<FotoVarricao[]>({
    queryKey: ["/api/varricao/fotos", data],
    queryFn: async () => (await apiRequest("GET", `/api/varricao/fotos?data=${data}`)).json(),
    enabled: servico === "varricao",
  });

  const carregando = servico === "rocagem" ? carregandoRocagem : carregandoVarricao;

  const grupos: FotoGrupo[] = useMemo(() => {
    if (servico === "rocagem") {
      const m = new Map<string, FotoGrupo>();
      fotosRocagem.forEach((f, i) => {
        const chave = f.endereco + (f.bairro ?? "");
        if (!m.has(chave)) m.set(chave, { titulo: f.endereco, subtitulo: f.bairro, fotos: [] });
        m.get(chave)!.fotos.push({ key: `${chave}-${i}`, url: f.url });
      });
      return Array.from(m.values()).sort((a, b) => a.titulo.localeCompare(b.titulo));
    }
    const m = new Map<string, FotoGrupo>();
    fotosVarricao.forEach((f) => {
      const chave = f.local_nome + (f.local_complemento ?? "");
      if (!m.has(chave)) {
        m.set(chave, { titulo: f.local_nome, subtitulo: f.local_complemento, fotos: [] });
      }
      m.get(chave)!.fotos.push({ key: String(f.id), url: f.url });
    });
    return Array.from(m.values()).sort((a, b) => a.titulo.localeCompare(b.titulo));
  }, [servico, fotosRocagem, fotosVarricao]);

  const totalFotos = grupos.reduce((soma, g) => soma + g.fotos.length, 0);

  return (
    <div className="min-h-screen" style={{ background: "#f5f7f5" }}>
      <div style={{ background: "#1e5e38" }} className="text-white px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-green-300">
              CMTU — Companhia Municipal de Trânsito e Urbanização de Londrina
            </p>
            <h1 className="text-2xl font-bold mt-1">Galeria de Serviços</h1>
            <p className="text-green-200 mt-0.5 text-sm">
              Fotos registradas em campo, por serviço e data
            </p>
          </div>
          <Button
            variant="ghost" size="icon" className="text-white hover:bg-white/10 shrink-0"
            onClick={() => logout()} title="Sair"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                servico === "rocagem" ? "bg-emerald-600 text-white" : "bg-background hover:bg-muted"
              }`}
              onClick={() => setServico("rocagem")}
            >
              Capina e Roçagem
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors border-l border-border ${
                servico === "varricao" ? "bg-emerald-600 text-white" : "bg-background hover:bg-muted"
              }`}
              onClick={() => setServico("varricao")}
            >
              Varrição e Lavação
            </button>
          </div>
          <Input
            type="date"
            className="w-[170px] bg-background"
            value={data}
            max={hojeLocal()}
            onChange={(e) => setData(e.target.value)}
          />
          {!carregando && (
            <span className="text-sm text-muted-foreground">
              {totalFotos} foto{totalFotos === 1 ? "" : "s"} · {grupos.length} local{grupos.length === 1 ? "" : "is"}
            </span>
          )}
        </div>

        {carregando && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!carregando && grupos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-2">
            <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhuma foto registrada nesta data.</p>
          </div>
        )}

        {!carregando && grupos.length > 0 && (
          <div className="space-y-6">
            {grupos.map((grupo) => (
              <div key={grupo.titulo + (grupo.subtitulo ?? "")} className="bg-card border border-border rounded-lg p-4">
                <p className="font-semibold leading-tight">{grupo.titulo}</p>
                {grupo.subtitulo && (
                  <p className="text-sm text-muted-foreground mb-2">{grupo.subtitulo}</p>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mt-2">
                  {grupo.fotos.map((f) => (
                    <a key={f.key} href={f.url} target="_blank" rel="noreferrer">
                      {ehVideo(f.url) ? (
                        <video
                          src={f.url}
                          className="aspect-square object-cover rounded-md border border-border bg-black"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={f.url}
                          alt={`Foto em ${grupo.titulo}`}
                          className="aspect-square object-cover rounded-md border border-border"
                          loading="lazy"
                        />
                      )}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
