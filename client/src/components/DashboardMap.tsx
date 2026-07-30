import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/utils";
import { MapLayerControl, type MapLayerType } from "./MapLayerControl";
import type { ServiceArea } from "@shared/schema";
import type { TimeRangeFilter } from "./MapLegend";
import { useTheme } from "@/components/theme-provider";
import { SECAO_LABELS } from "@/lib/varricao-utils";

export interface VarricaoLocalMapa {
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
}

function getVarricaoColor(secao: string): string {
  if (secao.startsWith("lavagem")) return "#0284c7"; // azul — lavagem
  if (secao === "sanitarios") return "#8b5cf6"; // roxo — sanitários
  return "#059669"; // verde — varrição
}

// Locais sem geolocalização aparecem numa grade espaçada no centro de Londrina,
// prontos para serem arrastados ao local correto (posição é salva no 1º arraste)
const GRADE_PENDENTES = { lat: -23.304, lng: -51.172, dLat: 0.0014, dLng: 0.0017, cols: 6 };

export function getVarricaoDisplayPos(
  locais: VarricaoLocalMapa[],
  local: VarricaoLocalMapa
): { lat: number; lng: number } {
  if (local.lat != null && local.lng != null) return { lat: local.lat, lng: local.lng };
  const pendentes = locais.filter((l) => l.lat == null || l.lng == null);
  const idx = Math.max(0, pendentes.findIndex((l) => l.id === local.id));
  const col = idx % GRADE_PENDENTES.cols;
  const row = Math.floor(idx / GRADE_PENDENTES.cols);
  return {
    lat: GRADE_PENDENTES.lat - row * GRADE_PENDENTES.dLat,
    lng: GRADE_PENDENTES.lng + col * GRADE_PENDENTES.dLng,
  };
}

interface DashboardMapProps {
  rocagemAreas: ServiceArea[];
  varricaoLocais?: VarricaoLocalMapa[];
  selectedVarricaoLocalId?: number | null;
  relocatingVarricaoLocalId?: number | null;
  onVarricaoSelect?: (id: number) => void;
  onVarricaoPositionChange?: (id: number, lat: number, lng: number) => void;
  layerFilters: {
    rocagemLote1: boolean;
    rocagemLote2: boolean;
    varricao?: boolean;
  };
  onAreaClick: (area: ServiceArea) => void;
  onMapClick?: (lat: number, lng: number) => void;
  mapRef?: React.MutableRefObject<L.Map | null>;
  filteredAreaIds?: Set<number>;
  searchQuery?: string;
  activeFilter?: TimeRangeFilter;
  onBoundsChange?: (bounds: L.LatLngBounds) => void;
  selectedAreaId?: number | null;
  savedMapZoom?: number | null;
  savedMapCenter?: { lat: number; lng: number } | null;
  onMapZoomSaved?: (zoom: number, center: { lat: number; lng: number }) => void;
  relocatingAreaId?: number | null;
  onPositionChange?: (areaId: number, lat: number, lng: number) => void;
  osMode?: boolean;
}

export function DashboardMap({
  rocagemAreas,
  varricaoLocais = [],
  selectedVarricaoLocalId = null,
  relocatingVarricaoLocalId = null,
  onVarricaoSelect,
  onVarricaoPositionChange,
  layerFilters,
  onAreaClick,
  onMapClick,
  mapRef: externalMapRef,
  filteredAreaIds,
  searchQuery = '',
  activeFilter = null,
  onBoundsChange,
  selectedAreaId = null,
  savedMapZoom = null,
  savedMapCenter = null,
  onMapZoomSaved,
  relocatingAreaId = null,
  onPositionChange,
  osMode = false,
}: DashboardMapProps) {
  const { toast } = useToast();
  const { theme } = useTheme();
  const internalMapRef = useRef<L.Map | null>(null);
  const mapRef = externalMapRef || internalMapRef;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerGroupsRef = useRef<{
    [key: string]: L.LayerGroup;
  }>({});
  const tileLayersRef = useRef<{
    standard: L.TileLayer | null;
    dark: L.TileLayer | null;
    satellite: L.TileLayer | null;
    hybrid: L.TileLayer | null;
  }>({
    standard: null,
    dark: null,
    satellite: null,
    hybrid: null,
  });
  const [currentLayer, setCurrentLayer] = useState<MapLayerType>("standard");
  
  // Refs para manter valores atualizados no listener de clique
  const relocatingAreaIdRef = useRef<number | null>(null);
  const onPositionChangeRef = useRef<((areaId: number, lat: number, lng: number) => void) | undefined>(undefined);
  const relocatingVarricaoIdRef = useRef<number | null>(null);
  const onVarricaoPositionChangeRef = useRef<((id: number, lat: number, lng: number) => void) | undefined>(undefined);
  const isDraggingMapRef = useRef(false);
  const lastMoveTimeRef = useRef(0);

  // Manter refs sincronizadas com props
  useEffect(() => {
    relocatingAreaIdRef.current = relocatingAreaId;
    onPositionChangeRef.current = onPositionChange;
    relocatingVarricaoIdRef.current = relocatingVarricaoLocalId;
    onVarricaoPositionChangeRef.current = onVarricaoPositionChange;
  }, [relocatingAreaId, onPositionChange, relocatingVarricaoLocalId, onVarricaoPositionChange]);

  const updatePositionMutation = useMutation({
    mutationFn: async ({ areaId, lat, lng }: { areaId: number; lat: number; lng: number }) => {
      return await apiRequest("PATCH", `/api/areas/${areaId}/position`, { lat, lng });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
      toast({
        title: "Posição Atualizada",
        description: "A posição do marcador foi atualizada com sucesso.",
      });
    },
  });

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView([-23.31, -51.16], 13);

    // Criar as 3 tile layers
    tileLayersRef.current.standard = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }
    );

    tileLayersRef.current.dark = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
        subdomains: "abcd",
      }
    );

    tileLayersRef.current.satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
        maxZoom: 19,
      }
    );

    // Híbrido = Satélite + Labels do OpenStreetMap
    tileLayersRef.current.hybrid = L.layerGroup([
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
          maxZoom: 19,
        }
      ),
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
        {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19,
          pane: "shadowPane",
        }
      ),
    ]) as unknown as L.TileLayer;

    // Adicionar camada padrão
    tileLayersRef.current.standard.addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    layerGroupsRef.current = {
      rocagemLote1: L.layerGroup().addTo(map),
      rocagemLote2: L.layerGroup().addTo(map),
      varricao: L.layerGroup().addTo(map),
    };

    mapRef.current = map;

    // Listener para clique direito no mapa (cadastrar nova área)
    const handleMapContextMenu = (e: L.LeafletMouseEvent) => {
      // Clique direito para abrir opção de adicionar nova área
      if (onMapClick) {
        L.DomEvent.preventDefault(e.originalEvent);
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    };

    if (onMapClick) {
      map.on('contextmenu', handleMapContextMenu);
    }

    // Detectar quando o mapa está sendo arrastado para evitar cliques acidentais
    map.on('movestart', () => {
      isDraggingMapRef.current = true;
    });
    
    map.on('moveend', () => {
      lastMoveTimeRef.current = Date.now();
      // Pequeno delay para permitir que o clique seja ignorado
      setTimeout(() => {
        isDraggingMapRef.current = false;
      }, 100);
    });

    // Listener para clique esquerdo no mapa (relocação de área)
    // Usa refs para sempre ter acesso ao valor mais recente
    // Ignora cliques que acontecem logo após arrastar o mapa
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      // Posicionar/reposicionar local de varrição em modo de ajuste
      const relocatingVarricaoId = relocatingVarricaoIdRef.current;
      const varricaoCallback = onVarricaoPositionChangeRef.current;
      if (relocatingVarricaoId && varricaoCallback) {
        const timeSincePlaceMove = Date.now() - lastMoveTimeRef.current;
        if (isDraggingMapRef.current || timeSincePlaceMove < 300) return;
        const { lat, lng } = e.latlng;
        if (typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng)) {
          varricaoCallback(relocatingVarricaoId, lat, lng);
        }
        return;
      }

      const areaId = relocatingAreaIdRef.current;
      const callback = onPositionChangeRef.current;

      if (!areaId || !callback) return;
      
      // Ignorar clique se o mapa foi arrastado nos últimos 300ms
      const timeSinceMove = Date.now() - lastMoveTimeRef.current;
      if (isDraggingMapRef.current || timeSinceMove < 300) {
        console.log('[Relocation] Clique ignorado - mapa estava sendo movido');
        return;
      }
      
      console.log('[Relocation] Clique detectado:', e.latlng, 'areaId:', areaId);
      
      const { lat, lng } = e.latlng;
      if (
        typeof lat === 'number' && 
        typeof lng === 'number' &&
        !isNaN(lat) && 
        !isNaN(lng) &&
        isFinite(lat) && 
        isFinite(lng)
      ) {
        callback(areaId, lat, lng);
      }
    };
    
    map.on('click', handleMapClick);

    // Listener para atualizar bounds quando o mapa se mover
    const handleBoundsChange = () => {
      if (onBoundsChange) {
        const bounds = map.getBounds();
        onBoundsChange(bounds);
      }
    };

    // Disparar bounds iniciais
    handleBoundsChange();

    // Escutar eventos de movimento com debounce
    let boundsTimeout: NodeJS.Timeout;
    map.on('moveend', () => {
      clearTimeout(boundsTimeout);
      boundsTimeout = setTimeout(handleBoundsChange, 300);
    });

    return () => {
      clearTimeout(boundsTimeout);
      if (onMapClick) {
        map.off('contextmenu', handleMapContextMenu);
      }
      map.off('click', handleMapClick);
      map.remove();
      mapRef.current = null;
    };
  }, [onBoundsChange, onMapClick]);

  useEffect(() => {
    if (!mapRef.current) return;

    Object.entries(layerGroupsRef.current).forEach(([key, layer]) => {
      if (layerFilters[key as keyof typeof layerFilters]) {
        layer.addTo(mapRef.current!);
      } else {
        layer.remove();
      }
    });
  }, [layerFilters]);

  // Trocar entre as camadas do mapa (reage ao tema e à layer selecionada)
  useEffect(() => {
    if (!mapRef.current) return;

    // Remover todas as camadas
    Object.values(tileLayersRef.current).forEach((layer) => {
      if (layer && mapRef.current) {
        mapRef.current.removeLayer(layer as L.Layer);
      }
    });

    // No modo escuro, o "Padrão" vira Híbrido (satélite + ruas)
    const effectiveLayer = (currentLayer === "standard" && theme === "dark") ? "hybrid" : currentLayer;
    const selectedLayer = tileLayersRef.current[effectiveLayer as keyof typeof tileLayersRef.current];
    if (selectedLayer && mapRef.current) {
      selectedLayer.addTo(mapRef.current);
    }
  }, [currentLayer, theme]);

  useEffect(() => {
    if (!mapRef.current) return;

    layerGroupsRef.current.rocagemLote1?.clearLayers();
    layerGroupsRef.current.rocagemLote2?.clearLayers();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    rocagemAreas.forEach((area) => {
      if (!area.lote) return;

      const layerGroup = area.lote === 1
        ? layerGroupsRef.current.rocagemLote1
        : layerGroupsRef.current.rocagemLote2;

      if (!layerGroup) return;

      const isFiltered = filteredAreaIds ? filteredAreaIds.has(area.id) : true;
      
      // Se há filtro ativo e área não está filtrada, não renderizar
      if (filteredAreaIds && !isFiltered) {
        return;
      }

      const isSelected = selectedAreaId === area.id;
      const color = osMode ? '#1e1c3e' : getAreaColor(area, today, isSelected, activeFilter);
      const isPulsing = area.executando === true;

      // Verificar se esta área está em modo de relocação
      const isRelocating = relocatingAreaId === area.id;
      
      // Criar um ícone div circular (arrastável apenas se em modo relocação)
      const icon = L.divIcon({
        className: "area-marker",
        html: `<div style="
          background-color: ${color};
          width: ${isRelocating ? '20px' : '16px'};
          height: ${isRelocating ? '20px' : '16px'};
          border-radius: 50%;
          border: ${isRelocating ? '3px solid #3b82f6' : '2px solid white'};
          box-shadow: ${isRelocating ? '0 0 12px rgba(59, 130, 246, 0.8)' : '0 2px 4px rgba(0,0,0,0.3)'};
          opacity: 0.9;
          cursor: ${isRelocating ? 'move' : 'pointer'};
          ${isPulsing ? 'animation: marker-blink 2s ease-in-out infinite;' : ''}
          ${isRelocating ? 'animation: pulse-relocate 1s ease-in-out infinite;' : ''}
        "></div>`,
        iconSize: [isRelocating ? 20 : 16, isRelocating ? 20 : 16],
        iconAnchor: [isRelocating ? 10 : 8, isRelocating ? 10 : 8],
      });

      const marker = L.marker([area.lat, area.lng], { 
        icon,
        draggable: isRelocating, // Só arrasta se em modo relocação
      });

      // Tooltip permanente quando:
      // 1. Há busca ativa OU
      // 2. Área está selecionada
      const hasActiveSearch = searchQuery.trim().length > 0;
      const shouldShowPermanentLabel = hasActiveSearch || isSelected;
      
      if (shouldShowPermanentLabel) {
        // Label permanente discreto: apenas endereço ou lote
        marker.bindTooltip(
          `<div class="search-label">${area.endereco || `Lote ${area.lote}`}</div>`,
          {
            permanent: true,
            direction: 'top',
            className: 'search-tooltip',
            opacity: 1,
            offset: [0, -8],
          }
        );
      } else {
        // Tooltip normal no hover
        marker.bindTooltip(
          `<div class="font-sans text-xs">
            <strong>${area.endereco}</strong><br/>
            ${area.metragem_m2 ? `Metragem: ${area.metragem_m2.toLocaleString('pt-BR')} m²<br/>` : ''}
            ${area.ultimaRocagem ? `Última Roçagem: ${formatDateBR(area.ultimaRocagem)}<br/>` : ''}
            ${area.proximaPrevisao ? `Previsão: ${formatDateBR(area.proximaPrevisao)}` : 'Sem previsão'}
          </div>`,
          {
            sticky: true,
            opacity: 0.9,
          }
        );
      }

      marker.bindPopup(
        `<div class="font-sans">
          <strong>${area.endereco}</strong><br/>
          ${area.metragem_m2 ? `Metragem: ${area.metragem_m2.toLocaleString('pt-BR')} m²<br/>` : ''}
          ${area.ultimaRocagem ? `Última Roçagem: ${formatDateBR(area.ultimaRocagem)}<br/>` : ''}
          ${area.proximaPrevisao ? `Previsão: ${formatDateBR(area.proximaPrevisao)}` : 'Sem previsão'}
        </div>`
      );

      marker.on("click", () => onAreaClick(area));

      // Evento quando o usuário termina de arrastar (apenas se em modo relocação)
      if (isRelocating && onPositionChange) {
        marker.on("dragend", (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          
          // Validar coordenadas antes de chamar callback
          if (
            newPos && 
            typeof newPos.lat === 'number' && 
            typeof newPos.lng === 'number' &&
            !isNaN(newPos.lat) && 
            !isNaN(newPos.lng) &&
            isFinite(newPos.lat) && 
            isFinite(newPos.lng)
          ) {
            onPositionChange(area.id, newPos.lat, newPos.lng);
          } else {
            console.warn('Coordenadas inválidas recebidas no dragend:', newPos);
          }
        });
      }

      marker.addTo(layerGroup);
    });
  }, [rocagemAreas, onAreaClick, filteredAreaIds, searchQuery, relocatingAreaId, onPositionChange, selectedAreaId, activeFilter]);

  // Pontos de varrição / lavagem
  useEffect(() => {
    if (!mapRef.current) return;

    const layerGroup = layerGroupsRef.current.varricao;
    if (!layerGroup) return;
    layerGroup.clearLayers();

    varricaoLocais.forEach((local) => {
      // isPendente = ainda sem geolocalização: aparece na grade do centro, âmbar com "!", arrastável direto
      // isSelected = card de informações aberto (destaque visual bonito, não arrastável)
      // isRelocating = modo de ajuste explícito via botão do card (arrastável)
      const isPendente = local.lat == null || local.lng == null;
      const isSelected = selectedVarricaoLocalId === local.id;
      const isRelocating = relocatingVarricaoLocalId === local.id;
      const pos = getVarricaoDisplayPos(varricaoLocais, local);
      const draggable = isPendente || isRelocating;
      const color = getVarricaoColor(local.secao);

      let html: string;
      let size: number;
      if (isPendente) {
        size = isSelected ? 24 : 20;
        html = `<div style="
          background-color: #f59e0b;
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          border: ${isSelected ? "3px solid #3b82f6" : "2px solid white"};
          box-shadow: ${isSelected ? "0 0 12px rgba(59, 130, 246, 0.8)" : "0 2px 6px rgba(0,0,0,0.4)"};
          cursor: move;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: ${size - 8}px;
          font-family: sans-serif;
          animation: pulse-relocate 1.6s ease-in-out infinite;
        ">!</div>`;
      } else if (isRelocating) {
        size = 20;
        html = `<div style="
          background-color: ${color};
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 3px solid #3b82f6;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.8);
          opacity: 0.9;
          cursor: move;
          animation: pulse-relocate 1s ease-in-out infinite;
        "></div>`;
      } else if (isSelected) {
        // Destaque de seleção: cor do serviço com anel azul pulsante (só visual, não arrastável)
        size = 20;
        html = `<div style="
          background-color: ${color};
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 3px solid #3b82f6;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.8);
          opacity: 0.95;
          cursor: pointer;
          animation: pulse-relocate 1.4s ease-in-out infinite;
        "></div>`;
      } else {
        size = 14;
        html = `<div style="
          background-color: ${color};
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          opacity: 0.9;
          cursor: pointer;
        "></div>`;
      }

      const icon = L.divIcon({
        className: "area-marker",
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const metragem = local.metragem_unica
        ? Number(local.metragem_unica).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : null;

      const detalhes = `<div class="font-sans text-xs">
        <strong>${local.nome}</strong><br/>
        ${local.complemento ? `<span style="opacity:.75">${local.complemento}</span><br/>` : ""}
        ${isPendente ? `<span style="color:#d97706;font-weight:600">⚠ Não geolocalizado — arraste para o local correto</span><br/>` : ""}
        ${SECAO_LABELS[local.secao] ?? local.secao}${local.tipo ? ` · ${local.tipo}` : ""}${local.regiao ? ` · ${local.regiao}` : ""}<br/>
        ${metragem ? `Metragem: ${metragem}` : ""}
      </div>`;

      const marker = L.marker([pos.lat, pos.lng], { icon, draggable });

      if (isRelocating) {
        marker.bindTooltip(
          `<div class="search-label">${local.nome} — arraste para reposicionar</div>`,
          { permanent: true, direction: "top", className: "search-tooltip", opacity: 1, offset: [0, -10] }
        );
      } else if (isSelected) {
        marker.bindTooltip(
          `<div class="search-label">${local.nome}${isPendente ? " — arraste para o local correto" : ""}</div>`,
          { permanent: true, direction: "top", className: "search-tooltip", opacity: 1, offset: [0, -10] }
        );
      } else {
        marker.bindTooltip(detalhes, { sticky: true, opacity: 0.95 });
      }

      // Clique seleciona (abre o card); arrastar move (pendentes e modo de ajuste)
      marker.on("click", () => onVarricaoSelect?.(local.id));

      if (draggable && onVarricaoPositionChange) {
        marker.on("dragend", (e) => {
          const novaPos = (e.target as L.Marker).getLatLng();
          if (novaPos && isFinite(novaPos.lat) && isFinite(novaPos.lng)) {
            onVarricaoPositionChange(local.id, novaPos.lat, novaPos.lng);
          }
        });
      }

      marker.bindPopup(detalhes);
      marker.addTo(layerGroup);
    });
  }, [varricaoLocais, selectedVarricaoLocalId, relocatingVarricaoLocalId, onVarricaoSelect, onVarricaoPositionChange]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" data-testid="map-container" />
      <MapLayerControl 
        currentLayer={currentLayer}
        onLayerChange={setCurrentLayer}
      />
    </div>
  );
}

function getAreaColor(area: ServiceArea, today: Date, isSelected = false, activeFilter: TimeRangeFilter = null): string {
  if (isSelected) {
    return "#171717"; // Preto para área selecionada (destaque de busca)
  }

  // Executando agora - verde forte com pulsação
  if (area.executando) {
    return "#10b981";
  }

  // PRIORIDADE: Verificar se nunca foi roçada (sem histórico)
  if (!area.ultimaRocagem) {
    // Área sem histórico de roçagem - cor cinza claro #c0c0c0
    // Aparece em cinza quando: filtro "Todas" (null) OU filtro "Sem Registro" ('no-history')
    // Aparece em cinza mais escuro quando: qualquer outro filtro específico
    return (activeFilter === null || activeFilter === 'no-history') ? "#c0c0c0" : "#9ca3af";
  }

  // Sistema baseado em ÚLTIMA roçagem (dias DESDE última roçagem)
  // Nova paleta de cores baseada em tempo decorrido
  const lastDate = new Date(area.ultimaRocagem);
  lastDate.setHours(0, 0, 0, 0);
  
  const daysSince = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  // Roçado há 1-5 dias - Azul
  if (daysSince >= 1 && daysSince <= 5) {
    return "#0086ff";
  } 
  // Roçado há 6-15 dias - Verde-azulado
  else if (daysSince >= 6 && daysSince <= 15) {
    return "#139b89";
  } 
  // Roçado há 16-30 dias - Laranja
  else if (daysSince >= 16 && daysSince <= 30) {
    return "#fe8963";
  } 
  // Roçado há 31-45 dias - Bege/Marrom claro
  else if (daysSince >= 31 && daysSince <= 45) {
    return "#b79689";
  } 
  // Roçado há 46-60 dias - Roxo claro
  else if (daysSince >= 46 && daysSince <= 60) {
    return "#a08ee9";
  }
  // Roçado há mais de 60 dias - Vermelho (atenção)
  else if (daysSince > 60) {
    return "#ea3c27";
  }
  // Roçado hoje (dia 0)
  else {
    return "#0086ff";
  }
}
