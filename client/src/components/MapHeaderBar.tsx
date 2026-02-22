import { useState, useRef, useEffect, useDeferredValue, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, MapPin, Navigation } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import type { TimeRangeFilter } from './MapLegend';
import type { ServiceArea } from '@shared/schema';

interface GeocodedResult {
  display_name: string;
  lat: number;
  lng: number;
  type: string;
}

interface MapHeaderBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: TimeRangeFilter;
  onFilterChange: (filter: TimeRangeFilter) => void;
  filteredCount?: number;
  totalCount?: number;
  areas?: ServiceArea[];
  onAreaSelect?: (area: ServiceArea) => void;
  onGeocodeFlyTo?: (lat: number, lng: number, label: string) => void;
  selectedAreaId?: number | null;
  onClearSelection?: () => void;
}

const categoryFilters = [
  { value: null, label: 'Todas', color: '#94a3b8', shortLabel: 'Todas' },
  { value: 'executing' as const, label: 'Executando', color: '#10b981', shortLabel: 'Exec', isPulsing: true },
  { value: '1-5' as const, label: '1-5 dias', color: '#0086ff', shortLabel: '1-5d' },
  { value: '6-15' as const, label: '6-15 dias', color: '#139b89', shortLabel: '6-15d' },
  { value: '16-30' as const, label: '16-30 dias', color: '#fe8963', shortLabel: '16-30d' },
  { value: '31-45' as const, label: '31-45 dias', color: '#b79689', shortLabel: '31-45d' },
  { value: '46-60' as const, label: '46-60 dias', color: '#a08ee9', shortLabel: '46-60d' },
  { value: '61+' as const, label: '+60 dias', color: '#ea3c27', shortLabel: '+60d' },
  { value: 'no-history' as const, label: 'Sem Registro', color: '#c0c0c0', shortLabel: 'S/Reg' },
];

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function highlightMatch(text: string, query: string): JSX.Element {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <>{text}</>;
  
  const normChars = Array.from(text).map(ch => ({
    original: ch,
    normalized: removeAccents(ch.toLowerCase()),
  }));
  
  const normalizedQuery = removeAccents(trimmedQuery.toLowerCase());
  
  const parts: { text: string; isMatch: boolean }[] = [];
  let i = 0;
  
  while (i < normChars.length) {
    let matchLen = 0;
    let j = 0;
    while (j < normalizedQuery.length && (i + matchLen) < normChars.length) {
      if (normChars[i + matchLen].normalized === normalizedQuery[j]) {
        matchLen++;
        j++;
      } else {
        break;
      }
    }
    
    if (j === normalizedQuery.length && matchLen > 0) {
      const matchedText = normChars.slice(i, i + matchLen).map(c => c.original).join('');
      parts.push({ text: matchedText, isMatch: true });
      i += matchLen;
    } else {
      const lastPart = parts[parts.length - 1];
      if (lastPart && !lastPart.isMatch) {
        lastPart.text += normChars[i].original;
      } else {
        parts.push({ text: normChars[i].original, isMatch: false });
      }
      i++;
    }
  }
  
  if (parts.length === 0) return <>{text}</>;
  
  return (
    <>
      {parts.map((part, idx) => 
        part.isMatch ? (
          <span key={idx} className="font-semibold text-foreground bg-accent/50 rounded px-0.5">
            {part.text}
          </span>
        ) : (
          <span key={idx}>{part.text}</span>
        )
      )}
    </>
  );
}

function simplifyDisplayName(displayName: string): string {
  const parts = displayName.split(',').map(p => p.trim());
  const filtered = parts.filter(p => {
    const lower = p.toLowerCase();
    return !lower.includes('brasil') && 
           !lower.includes('paraná') && 
           !lower.includes('mesorregião') &&
           !lower.includes('microrregião') &&
           !lower.includes('região geográfica');
  });
  return filtered.slice(0, 3).join(', ');
}

export function MapHeaderBar({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  filteredCount,
  totalCount,
  areas = [],
  onAreaSelect,
  onGeocodeFlyTo,
  selectedAreaId,
  onClearSelection,
}: MapHeaderBarProps) {
  const [localValue, setLocalValue] = useState(searchQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{top: number; left: number; width: number} | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const geocodeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [geocodeQuery, setGeocodeQuery] = useState('');

  useEffect(() => {
    setLocalValue(searchQuery);
  }, [searchQuery]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const { data: searchResults = [] } = useQuery<ServiceArea[]>({
    queryKey: ['/api/areas/search', deferredSearchQuery],
    queryFn: async () => {
      if (!deferredSearchQuery.trim()) return [];
      const res = await fetch(`/api/areas/search?q=${encodeURIComponent(deferredSearchQuery)}&servico=rocagem`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: deferredSearchQuery.trim().length > 0,
    staleTime: 30000,
  });

  const { data: geocodeResults = [] } = useQuery<GeocodedResult[]>({
    queryKey: ['/api/geocode/search', geocodeQuery],
    queryFn: async () => {
      if (!geocodeQuery.trim() || geocodeQuery.trim().length < 3) return [];
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(geocodeQuery)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: geocodeQuery.trim().length >= 3,
    staleTime: 60000,
  });

  const suggestions = searchResults.slice(0, 6);
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (value: string) => {
    setLocalValue(value);
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      startTransition(() => {
        onSearchChange(value);
      });
    }, 300);

    if (geocodeTimerRef.current) {
      clearTimeout(geocodeTimerRef.current);
    }
    geocodeTimerRef.current = setTimeout(() => {
      setGeocodeQuery(value);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (geocodeTimerRef.current) {
        clearTimeout(geocodeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const hasResults = localValue.trim().length > 0 && (suggestions.length > 0 || geocodeSuggestions.length > 0);
    const isTyping = localValue.trim().length >= 3 && geocodeQuery.trim().length < 3;
    setShowSuggestions(hasResults || isTyping);
    setSelectedIndex(-1);
  }, [localValue, suggestions.length, geocodeSuggestions.length, geocodeQuery]);

  useEffect(() => {
    if (showSuggestions && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    } else {
      setDropdownPosition(null);
    }
  }, [showSuggestions]);

  const handleFilterClick = (filter: TimeRangeFilter) => {
    onFilterChange(activeFilter === filter ? null : filter);
  };

  const handleSuggestionClick = (area: ServiceArea) => {
    onAreaSelect?.(area);
    setLocalValue('');
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSearchChange('');
    setGeocodeQuery('');
    
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleGeocodeClick = (result: GeocodedResult) => {
    onGeocodeFlyTo?.(result.lat, result.lng, simplifyDisplayName(result.display_name));
    setLocalValue('');
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSearchChange('');
    setGeocodeQuery('');
    
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleClearSearch = () => {
    setLocalValue('');
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSearchChange('');
    setGeocodeQuery('');
    
    onClearSelection?.();
    
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || totalSuggestions === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < totalSuggestions - 1 ? prev + 1 : 0
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : totalSuggestions - 1
        );
        break;
      
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          if (selectedIndex < suggestions.length) {
            handleSuggestionClick(suggestions[selectedIndex]);
          } else {
            const geocodeIndex = selectedIndex - suggestions.length;
            if (geocodeIndex < geocodeSuggestions.length) {
              handleGeocodeClick(geocodeSuggestions[geocodeIndex]);
            }
          }
        }
        break;
      
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  return (
    <div className="bg-background border-b border-border px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Buscar por endereço ou bairro..."
            value={localValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (localValue.trim().length > 0 && totalSuggestions > 0) {
                setShowSuggestions(true);
              }
            }}
            className="pl-9 pr-9 h-9 text-sm"
            data-testid="input-search-areas"
            autoComplete="off"
          />
          {(localValue || selectedAreaId !== null) && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {showSuggestions && dropdownPosition && typeof document !== 'undefined' && createPortal(
            <div 
              ref={dropdownRef}
              className="fixed bg-popover border border-border rounded-md shadow-2xl z-[1200] max-h-96 overflow-y-auto"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
              }}
              data-testid="autocomplete-dropdown"
            >
              {suggestions.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    Areas Cadastradas
                  </div>
                  {suggestions.map((area, index) => (
                    <button
                      key={`area-${area.id}`}
                      onClick={() => handleSuggestionClick(area)}
                      className={`
                        w-full text-left px-3 py-2 text-sm border-b border-border last:border-b-0
                        transition-colors
                        ${index === selectedIndex 
                          ? 'bg-accent text-accent-foreground' 
                          : 'hover:bg-accent/50'
                        }
                      `}
                      data-testid={`suggestion-${area.id}`}
                    >
                      <div className="font-medium">
                        {highlightMatch(area.endereco || 'Sem endereço', localValue)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {area.bairro && (
                          <span>{highlightMatch(area.bairro, localValue)}</span>
                        )}
                        {area.lote && (
                          <span className="ml-2">
                            Lote: {highlightMatch(area.lote.toString(), localValue)}
                          </span>
                        )}
                        {area.metragem_m2 && (
                          <span className="ml-2">{area.metragem_m2}m²</span>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              )}

              {geocodeSuggestions.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border flex items-center gap-1.5">
                    <Navigation className="h-3 w-3" />
                    Outros Enderecos
                  </div>
                  {geocodeSuggestions.map((result, index) => {
                    const globalIndex = suggestions.length + index;
                    return (
                      <button
                        key={`geo-${index}`}
                        onClick={() => handleGeocodeClick(result)}
                        className={`
                          w-full text-left px-3 py-2 text-sm border-b border-border last:border-b-0
                          transition-colors
                          ${globalIndex === selectedIndex 
                            ? 'bg-accent text-accent-foreground' 
                            : 'hover:bg-accent/50'
                          }
                        `}
                        data-testid={`geocode-suggestion-${index}`}
                      >
                        <div className="font-medium text-muted-foreground">
                          {highlightMatch(simplifyDisplayName(result.display_name), localValue)}
                        </div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">
                          OpenStreetMap
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {localValue.trim().length >= 3 && suggestions.length === 0 && geocodeSuggestions.length === 0 && (
                <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                  {geocodeQuery.trim().length < 3 ? 'Buscando...' : 'Nenhum resultado encontrado'}
                </div>
              )}
            </div>,
            document.body
          )}
        </div>
        
        {filteredCount !== undefined && totalCount !== undefined && (
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {filteredCount} / {totalCount}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
          ROÇADO HÁ
        </span>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1">
          {categoryFilters.map((filter) => {
          const isActive = activeFilter === filter.value;
          
          return (
            <button
              key={filter.value || 'all'}
              onClick={() => handleFilterClick(filter.value)}
              className={`
                flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                transition-all border
                ${isActive 
                  ? 'bg-accent text-accent-foreground border-accent-foreground/20 shadow-sm' 
                  : 'bg-background hover:bg-accent/50 border-border'
                }
              `}
              data-testid={`filter-chip-${filter.value || 'all'}`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${filter.isPulsing ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: filter.color }}
              />
              <span className="hidden sm:inline">{filter.label}</span>
              <span className="sm:hidden">{filter.shortLabel}</span>
            </button>
          );
        })}
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
