import { useState, useMemo } from "react";
import { Search, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { ServiceArea } from "@shared/schema";

export interface FilterCriteria {
  search: string;
  bairro: string;
  lote: string;
  status: string;
  tipo: string;
}

interface FilterPanelProps {
  areas: ServiceArea[];
  filters: FilterCriteria;
  onFilterChange: (filters: FilterCriteria) => void;
  filteredCount: number;
}

export function FilterPanel({ areas, filters, onFilterChange, filteredCount }: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const bairros = useMemo(() => {
    const unique = new Set(areas.map(a => a.bairro).filter(Boolean) as string[]);
    return Array.from(unique).sort();
  }, [areas]);

  const tipos = useMemo(() => {
    const unique = new Set(areas.map(a => a.tipo).filter(Boolean) as string[]);
    return Array.from(unique).sort();
  }, [areas]);

  const suggestions = useMemo(() => {
    if (!filters.search || filters.search.length < 2) return [];
    
    const removeAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const searchNorm = removeAccents(filters.search.toLowerCase());
    const matches = new Set<string>();
    
    areas.forEach(area => {
      if (removeAccents((area.endereco || "").toLowerCase()).includes(searchNorm)) {
        matches.add(area.endereco!);
      }
      if (removeAccents((area.bairro || "").toLowerCase()).includes(searchNorm)) {
        matches.add(area.bairro!);
      }
    });
    
    return Array.from(matches).slice(0, 8);
  }, [areas, filters.search]);

  const hasActiveFilters = filters.search || 
    (filters.bairro && filters.bairro !== "all") || 
    (filters.lote && filters.lote !== "all") || 
    (filters.status && filters.status !== "all") || 
    (filters.tipo && filters.tipo !== "all");

  const handleClear = () => {
    onFilterChange({
      search: "",
      bairro: "all",
      lote: "all",
      status: "all",
      tipo: "all",
    });
  };

  const activeFilterCount = [
    filters.search,
    filters.bairro !== "all" && filters.bairro,
    filters.lote !== "all" && filters.lote,
    filters.status !== "all" && filters.status,
    filters.tipo !== "all" && filters.tipo
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full justify-between"
          data-testid="button-toggle-filters"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span>Filtros</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredCount} de {areas.length}
          </span>
        </Button>
      </div>

      {isExpanded && (
        <div className="space-y-3 rounded-lg border bg-card p-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Endereço ou bairro..."
                value={filters.search}
                onChange={(e) => {
                  onFilterChange({ ...filters, search: e.target.value });
                  if (e.target.value.length >= 2) {
                    setShowSuggestions(true);
                  }
                }}
                onFocus={() => {
                  if (filters.search.length >= 2) {
                    setShowSuggestions(true);
                  }
                }}
                onBlur={() => setShowSuggestions(false)}
                className="pl-9 text-foreground"
                data-testid="input-filter-search"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-popover-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover-elevate active-elevate-2 text-foreground border-b border-border last:border-0"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onFilterChange({ ...filters, search: suggestion });
                        setShowSuggestions(false);
                      }}
                      data-testid={`suggestion-${index}`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Status Rápido</label>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={filters.status === "Pendente" ? "default" : "outline"}
                className="cursor-pointer hover-elevate active-elevate-2"
                onClick={() => {
                  const newStatus = filters.status === "Pendente" ? "all" : "Pendente";
                  onFilterChange({ ...filters, status: newStatus });
                }}
                data-testid="chip-status-pendente"
              >
                <div className="w-2 h-2 rounded-full bg-gray-400 mr-1.5" />
                Pendente
              </Badge>
              <Badge
                variant={filters.status === "Em Execução" ? "default" : "outline"}
                className="cursor-pointer hover-elevate active-elevate-2"
                onClick={() => {
                  const newStatus = filters.status === "Em Execução" ? "all" : "Em Execução";
                  onFilterChange({ ...filters, status: newStatus });
                }}
                data-testid="chip-status-em-execucao"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                Em Execução
              </Badge>
              <Badge
                variant={filters.status === "Concluído" ? "default" : "outline"}
                className="cursor-pointer hover-elevate active-elevate-2"
                onClick={() => {
                  const newStatus = filters.status === "Concluído" ? "all" : "Concluído";
                  onFilterChange({ ...filters, status: newStatus });
                }}
                data-testid="chip-status-concluido"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-700 mr-1.5" />
                Concluído
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Lote</label>
              <Select
                value={filters.lote}
                onValueChange={(value) => onFilterChange({ ...filters, lote: value })}
              >
                <SelectTrigger data-testid="select-filter-lote">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="1">Lote 1</SelectItem>
                  <SelectItem value="2">Lote 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Status (Detalhado)</label>
            <Select
              value={filters.status}
              onValueChange={(value) => onFilterChange({ ...filters, status: value })}
            >
              <SelectTrigger data-testid="select-filter-status">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Em Execução">Em Execução</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Bairro</label>
            <Select
              value={filters.bairro}
              onValueChange={(value) => onFilterChange({ ...filters, bairro: value })}
            >
              <SelectTrigger data-testid="select-filter-bairro">
                <SelectValue placeholder="Todos os bairros" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">Todos os bairros</SelectItem>
                {bairros.map((bairro) => (
                  <SelectItem key={bairro} value={bairro}>
                    {bairro}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <Select
              value={filters.tipo}
              onValueChange={(value) => onFilterChange({ ...filters, tipo: value })}
            >
              <SelectTrigger data-testid="select-filter-tipo">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">Todos os tipos</SelectItem>
                {tipos.slice(0, 30).map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>
                    {tipo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="w-full"
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4 mr-2" />
              Limpar Filtros
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
