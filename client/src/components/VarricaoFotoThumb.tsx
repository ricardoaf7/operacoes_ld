import { Navigation, Trash2 } from "lucide-react";
import { distanciaMetros, formatDataBR, ehVideo } from "@/lib/varricao-utils";

export interface VarricaoFoto {
  id: number;
  url: string;
  data_servico: string;
  enviado_por_nome: string | null;
  lat: number | null;
  lng: number | null;
}

interface VarricaoFotoThumbProps {
  foto: VarricaoFoto;
  localLat?: number | null;
  localLng?: number | null;
  podeExcluir?: boolean;
  onExcluir?: (foto: VarricaoFoto) => void;
}

export function VarricaoFotoThumb({ foto, localLat, localLng, podeExcluir, onExcluir }: VarricaoFotoThumbProps) {
  const hasLocalCoords = localLat != null && localLng != null;
  const dist = hasLocalCoords && foto.lat != null && foto.lng != null
    ? distanciaMetros(localLat!, localLng!, foto.lat, foto.lng)
    : null;
  const distLonge = dist != null && dist > 100;
  const isVideo = ehVideo(foto.url);

  return (
    <div className="relative group">
      <a
        href={foto.url}
        target="_blank"
        rel="noreferrer"
        className="block"
        title={`${formatDataBR(foto.data_servico)}${foto.enviado_por_nome ? ` — ${foto.enviado_por_nome}` : ""}`}
      >
        {isVideo ? (
          <video
            src={foto.url}
            className="aspect-square object-cover rounded-md border border-border group-hover:opacity-85 transition-opacity bg-black"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={foto.url}
            alt={`Foto de ${formatDataBR(foto.data_servico)}`}
            className="aspect-square object-cover rounded-md border border-border group-hover:opacity-85 transition-opacity"
            loading="lazy"
          />
        )}
        <span className="absolute bottom-0.5 right-0.5 bg-black/65 text-white text-[9px] px-1 rounded">
          {formatDataBR(foto.data_servico).slice(0, 5)}
        </span>
      </a>
      {podeExcluir && onExcluir && (
        <button
          className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-red-600 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Excluir foto"
          onClick={() => onExcluir(foto)}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      {foto.lat != null && foto.lng != null ? (
        <a
          href={`https://www.google.com/maps?q=${foto.lat},${foto.lng}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={
            dist != null
              ? `Foto tirada a ${Math.round(dist)}m do local cadastrado — ver no mapa`
              : "Ver onde a foto foi tirada"
          }
          className={`absolute top-0.5 left-0.5 flex items-center gap-0.5 text-white text-[9px] px-1 py-0.5 rounded ${
            distLonge ? "bg-amber-600" : "bg-black/60"
          }`}
        >
          <Navigation className="h-2.5 w-2.5" />
          {dist != null && `${dist < 1000 ? Math.round(dist) + "m" : (dist / 1000).toFixed(1) + "km"}`}
        </a>
      ) : (
        <span
          className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded"
          title="Foto enviada sem GPS"
        >
          s/ GPS
        </span>
      )}
    </div>
  );
}
