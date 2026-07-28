import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, X, MapPin, Navigation, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  highlightMatch,
  removeAccents,
  simplifyDisplayName,
  type GeocodedResult,
} from "./MapHeaderBar";
import type { VarricaoLocalMapa } from "./DashboardMap";

interface VarricaoSearchBarProps {
  locais: VarricaoLocalMapa[];
  onLocalSelect: (local: VarricaoLocalMapa) => void;
  onGeocodeFlyTo?: (lat: number, lng: number, label: string) => void;
  selectedLocalId?: number | null;
  onClearSelection?: () => void;
}

export function VarricaoSearchBar({
  locais,
  onLocalSelect,
  onGeocodeFlyTo,
  selectedLocalId,
  onClearSelection,
}: VarricaoSearchBarProps) {
  const [localValue, setLocalValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [geocodeQuery, setGeocodeQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const geocodeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Busca nos locais cadastrados (nome + complemento + região, sem acentos)
  const query = removeAccents(localValue.trim().toLowerCase());
  const suggestions = query.length > 0
    ? locais.filter((l) => {
        const alvo = removeAccents(
          `${l.nome} ${l.complemento ?? ""} ${l.regiao ?? ""}`.toLowerCase()
        );
        return alvo.includes(query);
      }).slice(0, 6)
    : [];

  // Busca de qualquer endereço no OpenStreetMap (com atraso para não sobrecarregar)
  const { data: geocodeResults = [] } = useQuery<GeocodedResult[]>({
    queryKey: ["/api/geocode/search", geocodeQuery],
    queryFn: async () => {
      if (!geocodeQuery.trim() || geocodeQuery.trim().length < 3) return [];
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(geocodeQuery)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: geocodeQuery.trim().length >= 3,
    staleTime: 60000,
  });
  const geocodeSuggestions = geocodeResults.slice(0, 4);
  const totalSuggestions = suggestions.length + geocodeSuggestions.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setShowSuggestions(localValue.trim().length > 0 && totalSuggestions > 0);
    setSelectedIndex(-1);
  }, [localValue, totalSuggestions]);

  useEffect(() => {
    if (showSuggestions && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setDropdownPosition(null);
    }
  }, [showSuggestions]);

  const handleInputChange = (value: string) => {
    setLocalValue(value);
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = setTimeout(() => setGeocodeQuery(value), 500);
  };

  const limpar = () => {
    setLocalValue("");
    setGeocodeQuery("");
    setShowSuggestions(false);
  };

  const handleLocalClick = (local: VarricaoLocalMapa) => {
    onLocalSelect(local);
    limpar();
    inputRef.current?.blur();
  };

  const handleGeocodeClick = (result: GeocodedResult) => {
    onGeocodeFlyTo?.(result.lat, result.lng, simplifyDisplayName(result.display_name));
    limpar();
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || totalSuggestions === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < totalSuggestions - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalSuggestions - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0) {
          if (selectedIndex < suggestions.length) {
            handleLocalClick(suggestions[selectedIndex]);
          } else {
            const gi = selectedIndex - suggestions.length;
            if (gi < geocodeSuggestions.length) handleGeocodeClick(geocodeSuggestions[gi]);
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const comCoords = locais.filter((l) => l.lat != null && l.lng != null).length;

  return (
    <div className="bg-background border-b border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Buscar local de varrição ou endereço..."
            value={localValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (localValue.trim().length > 0 && totalSuggestions > 0) setShowSuggestions(true);
            }}
            className="pl-9 pr-9 h-9 text-sm"
            data-testid="input-search-varricao"
            autoComplete="off"
          />
          {(localValue || selectedLocalId != null) && (
            <button
              onClick={() => {
                limpar();
                onClearSelection?.();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
              data-testid="button-clear-search-varricao"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {showSuggestions && dropdownPosition && typeof document !== "undefined" && createPortal(
            <div
              ref={dropdownRef}
              className="fixed bg-popover border border-border rounded-md shadow-2xl z-[1200] max-h-96 overflow-y-auto"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
              }}
            >
              {suggestions.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    Locais Cadastrados
                  </div>
                  {suggestions.map((local, index) => (
                    <button
                      key={`local-${local.id}`}
                      onClick={() => handleLocalClick(local)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-border last:border-b-0 transition-colors ${
                        index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="font-medium flex items-center gap-1.5">
                        {highlightMatch(local.nome, localValue)}
                        {(local.lat == null || local.lng == null) && (
                          <span title="Sem localização — clique para posicionar no mapa">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {local.complemento && (
                          <span>{highlightMatch(local.complemento, localValue)}</span>
                        )}
                        {local.regiao && <span className="ml-2">{local.regiao}</span>}
                        {local.tipo && <span className="ml-2">· {local.tipo}</span>}
                      </div>
                    </button>
                  ))}
                </>
              )}

              {geocodeSuggestions.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border flex items-center gap-1.5">
                    <Navigation className="h-3 w-3" />
                    Outros Endereços
                  </div>
                  {geocodeSuggestions.map((result, index) => {
                    const globalIndex = suggestions.length + index;
                    return (
                      <button
                        key={`geo-${index}`}
                        onClick={() => handleGeocodeClick(result)}
                        className={`w-full text-left px-3 py-2 text-sm border-b border-border last:border-b-0 transition-colors ${
                          globalIndex === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                        }`}
                      >
                        <div className="font-medium text-muted-foreground">
                          {highlightMatch(simplifyDisplayName(result.display_name), localValue)}
                        </div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">OpenStreetMap</div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>,
            document.body
          )}
        </div>
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {comCoords} / {locais.length} confirmados
        </Badge>
      </div>
    </div>
  );
}
