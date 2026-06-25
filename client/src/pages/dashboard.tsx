import { useState, useRef, useEffect, useMemo, useDeferredValue, useCallback } from "react";
import { DashboardMap } from "@/components/DashboardMap";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MapInfoCard } from "@/components/MapInfoCard";
import { QuickRegisterModal } from "@/components/QuickRegisterModal";
import { ManualForecastModal } from "@/components/ManualForecastModal";
import { NewAreaModal } from "@/components/NewAreaModal";
import { EditAreaModal } from "@/components/EditAreaModal";
import { MapHeaderBar } from "@/components/MapHeaderBar";
import { MowingStatsBar } from "@/components/MowingStatsBar";
import { ExportDialog } from "@/components/ExportDialog";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { BottomSheet, type BottomSheetState } from "@/components/BottomSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ServiceArea, AppConfig } from "@shared/schema";
import type { FilterCriteria } from "@/components/FilterPanel";
import type { TimeRangeFilter } from "@/components/MapLegend";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Menu, X, Download, FileText, LogOut, Users, Lock, ClipboardList } from "lucide-react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import L from "leaflet";

interface DashboardProps {
  isPublicView?: boolean;
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  fiscal: "Fiscal",
};

export default function Dashboard({ isPublicView = false }: DashboardProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [selectedArea, setSelectedArea] = useState<ServiceArea | null>(null);
  const [showMapCard, setShowMapCard] = useState(false);
  const [showQuickRegisterModal, setShowQuickRegisterModal] = useState(false);
  const [showManualForecastModal, setShowManualForecastModal] = useState(false);
  const [showNewAreaModal, setShowNewAreaModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newAreaCoords, setNewAreaCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedService, setSelectedService] = useState<string>('');
  const [bottomSheetState, setBottomSheetState] = useState<BottomSheetState>("minimized");
  const [filters, setFilters] = useState<FilterCriteria>({
    search: "",
    bairro: "all",
    lote: "all",
    status: "all",
    tipo: "all",
  });
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeFilter>(null);
  const [customFilterDateRange, setCustomFilterDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedOsId, setSelectedOsId] = useState<number | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<{ from: string; to: string } | null>(null);
  const [savedMapZoom, setSavedMapZoom] = useState<number | null>(null);
  const [savedMapCenter, setSavedMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [relocatingAreaId, setRelocatingAreaId] = useState<number | null>(null);
  const [pendingRelocation, setPendingRelocation] = useState<{ areaId: number; lat: number; lng: number } | null>(null);
  const [showRelocationConfirm, setShowRelocationConfirm] = useState(false);
  const [pendingNewAreaCoords, setPendingNewAreaCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showNewAreaConfirm, setShowNewAreaConfirm] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const ignoreSearchClearRef = useRef(false); // Flag para ignorar limpeza após seleção
  const lastZoomedAreaIdRef = useRef<number | null>(null); // Para evitar zoom repetido

  // Limpar selectedArea quando busca é limpa MANUALMENTE (não após seleção)
  useEffect(() => {
    if (filters.search === '') {
      // Ignorar se foi uma limpeza após seleção de área
      if (ignoreSearchClearRef.current) {
        ignoreSearchClearRef.current = false;
        return;
      }
      setSelectedArea(null);
      setShowMapCard(false);
    }
  }, [filters.search]);

  const handleServiceSelect = (service: string) => {
    setSelectedService(service);
    if (service !== 'rocagem') { setReportOpen(false); setSelectedOsId(null); }
  };

  const handleOsSelect = (id: number | null) => {
    setSelectedOsId(id);
    if (id) setSelectedService('rocagem');
  };

  const handleMapZoomSaved = (zoom: number, center: { lat: number; lng: number }) => {
    setSavedMapZoom(zoom);
    setSavedMapCenter(center);
  };

  // Mutation para atualizar posição da área
  const updatePositionMutation = useMutation({
    mutationFn: async ({ areaId, lat, lng }: { areaId: number; lat: number; lng: number }) => {
      return await apiRequest("PATCH", `/api/areas/${areaId}/position`, { lat, lng });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
      toast({
        title: "Localização Atualizada",
        description: "A localização da área foi alterada com sucesso.",
      });
      setRelocatingAreaId(null);
      setPendingRelocation(null);
      setShowRelocationConfirm(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível alterar a localização.",
      });
    },
  });

  // Handler para iniciar modo de relocação
  const handleStartRelocation = () => {
    if (selectedArea) {
      setRelocatingAreaId(selectedArea.id);
      toast({
        title: "Modo de Relocação Ativo",
        description: "Navegue pelo mapa e clique no novo local desejado.",
      });
    }
  };

  // Handler quando o marcador é arrastado
  // IMPORTANTE: useCallback para evitar recriação do mapa ao re-render
  const handlePositionChange = useCallback((areaId: number, lat: number, lng: number) => {
    setPendingRelocation({ areaId, lat, lng });
    setShowRelocationConfirm(true);
  }, []);

  // Handler para confirmar relocação
  const handleConfirmRelocation = () => {
    if (pendingRelocation) {
      updatePositionMutation.mutate(pendingRelocation);
    }
  };

  // Handler para cancelar relocação
  const handleCancelRelocation = () => {
    setShowRelocationConfirm(false);
    setPendingRelocation(null);
    setRelocatingAreaId(null);
    // Invalidar para resetar posição do marcador
    queryClient.invalidateQueries({ queryKey: ["/api/areas/light", "rocagem"] });
  };

  const handleBackupDownload = async () => {
    try {
      const response = await fetch('/api/backup');
      if (!response.ok) throw new Error('Falha ao gerar backup');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zeladoria_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Backup Gerado!",
        description: "Arquivo de backup baixado com sucesso.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro no Backup",
        description: "Não foi possível gerar o backup. Tente novamente.",
      });
    }
  };

  // Usar endpoint otimizado com dados leves (todas as áreas, sem filtro de viewport)
  const { data: rocagemAreas = [] } = useQuery<ServiceArea[]>({
    queryKey: ["/api/areas/light", "rocagem"],
    queryFn: async () => {
      const res = await fetch(`/api/areas/light?servico=rocagem`);
      if (!res.ok) throw new Error("Failed to fetch areas");
      return res.json();
    },
    staleTime: 30000, // Cache por 30 segundos
  });

  const { data: config } = useQuery<AppConfig>({
    queryKey: ["/api/config"],
  });

  const { data: periodAreaIds } = useQuery<{ ids: number[]; count: number }>({
    queryKey: ['/api/areas/by-period', statsPeriod?.from, statsPeriod?.to],
    queryFn: async () => {
      const res = await fetch(`/api/areas/by-period?from=${statsPeriod!.from}&to=${statsPeriod!.to}`);
      if (!res.ok) throw new Error('Failed to fetch period areas');
      return res.json();
    },
    enabled: !!statsPeriod,
  });

  const handleStatsPeriodChange = useCallback((from: string, to: string) => {
    setStatsPeriod({ from, to });
  }, []);

  const handleStatsPeriodClear = useCallback(() => {
    setStatsPeriod(null);
  }, []);

  // OTIMIZAÇÃO CRÍTICA: Usar useDeferredValue para separar atualização urgente (input)
  // de computação pesada (filtros). Evita lag de 3-4 segundos na digitação.
  // React prioriza atualização do input e processa filtros depois
  const deferredFilters = useDeferredValue(filters);
  const deferredTimeRangeFilter = useDeferredValue(timeRangeFilter);
  const deferredCustomFilterDateRange = useDeferredValue(customFilterDateRange);

  // Função auxiliar para calcular dias DESDE última roçagem
  const getDaysSinceLastMowing = (area: ServiceArea): number => {
    if (!area.ultimaRocagem) return -1; // Sem histórico
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastDate = new Date(area.ultimaRocagem);
    lastDate.setHours(0, 0, 0, 0);
    
    return Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Filtrar áreas baseado nos critérios (incluindo filtro de tempo)
  // IMPORTANTE: Usa valores deferidos para não bloquear UI durante digitação
  const filteredRocagemAreas = useMemo(() => {
    let areas = rocagemAreas;

    // Aplicar filtro de tempo primeiro (usando valores deferidos)
    if (deferredTimeRangeFilter) {
      areas = areas.filter(area => {
        // Filtro "Executando" - apenas áreas marcadas como executando
        if (deferredTimeRangeFilter === 'executing') {
          return area.executando === true;
        }

        // Filtro "Sem Registro" - áreas sem histórico de roçagem
        if (deferredTimeRangeFilter === 'no-history') {
          return !area.ultimaRocagem;
        }

        // Para outros filtros, calcular dias desde última roçagem
        const days = getDaysSinceLastMowing(area);
        
        // Se não tem histórico, não mostra em nenhum filtro de tempo
        if (days === -1) return false;

        switch (deferredTimeRangeFilter) {
          case '1-5':
            return days >= 1 && days <= 5;
          case '6-15':
            return days >= 6 && days <= 15;
          case '16-30':
            return days >= 16 && days <= 30;
          case '31-45':
            return days >= 31 && days <= 45;
          case '46-60':
            return days >= 46 && days <= 60;
          case '61+':
            return days > 60;
          case 'custom':
            // Filtro por range de datas - baseado em ÚLTIMA roçagem
            if (!deferredCustomFilterDateRange.from || !deferredCustomFilterDateRange.to || !area.ultimaRocagem) return false;
            const fromDate = new Date(deferredCustomFilterDateRange.from);
            fromDate.setHours(0, 0, 0, 0);
            const toDate = new Date(deferredCustomFilterDateRange.to);
            toDate.setHours(0, 0, 0, 0);
            const lastMowDate = new Date(area.ultimaRocagem);
            lastMowDate.setHours(0, 0, 0, 0);
            return lastMowDate >= fromDate && lastMowDate <= toDate;
          default:
            return true;
        }
      });
    }

    // Aplicar filtros tradicionais (usando valores deferidos)
    if (!deferredFilters.search && 
        (!deferredFilters.bairro || deferredFilters.bairro === "all") && 
        (!deferredFilters.lote || deferredFilters.lote === "all") && 
        (!deferredFilters.status || deferredFilters.status === "all") && 
        (!deferredFilters.tipo || deferredFilters.tipo === "all")) {
      return areas;
    }

    return areas.filter(area => {
      if (deferredFilters.search) {
        const searchLower = deferredFilters.search.toLowerCase();
        const endereco = area.endereco?.toLowerCase() || "";
        const bairro = area.bairro?.toLowerCase() || "";
        if (!endereco.includes(searchLower) && !bairro.includes(searchLower)) {
          return false;
        }
      }

      if (deferredFilters.bairro && deferredFilters.bairro !== "all" && area.bairro !== deferredFilters.bairro) return false;
      if (deferredFilters.lote && deferredFilters.lote !== "all" && area.lote?.toString() !== deferredFilters.lote) return false;
      if (deferredFilters.status && deferredFilters.status !== "all" && area.status !== deferredFilters.status) return false;
      if (deferredFilters.tipo && deferredFilters.tipo !== "all" && area.tipo !== deferredFilters.tipo) return false;

      return true;
    });
  }, [rocagemAreas, deferredFilters, deferredTimeRangeFilter, deferredCustomFilterDateRange]);

  const periodActive = !!statsPeriod;
  
  const hasOtherFilters = !!(filters.search || 
    (filters.bairro && filters.bairro !== "all") || 
    (filters.lote && filters.lote !== "all") || 
    (filters.status && filters.status !== "all") || 
    (filters.tipo && filters.tipo !== "all") ||
    timeRangeFilter !== null);
  
  const hasActiveFilters = hasOtherFilters || periodActive;

  const computedFilteredAreaIds = useMemo(() => {
    if (!hasOtherFilters && !periodActive) return undefined;
    
    const periodSet = periodActive && periodAreaIds ? new Set(periodAreaIds.ids) : null;
    
    if (periodActive && !periodAreaIds) {
      return new Set<number>();
    }
    
    if (hasOtherFilters && periodSet) {
      const baseIds = new Set(filteredRocagemAreas.map(a => a.id));
      const intersected = new Set<number>();
      baseIds.forEach(id => { if (periodSet.has(id)) intersected.add(id); });
      return intersected;
    }
    
    if (periodSet) {
      return periodSet;
    }
    
    if (hasOtherFilters) {
      return new Set(filteredRocagemAreas.map(a => a.id));
    }
    
    return undefined;
  }, [filteredRocagemAreas, periodAreaIds, periodActive, hasOtherFilters]);

  // Ordens de serviço para o sidebar
  const { data: ordens = [] } = useQuery<any[]>({ queryKey: ["/api/ordens"] });

  const { data: selectedOs } = useQuery<any>({
    queryKey: ["/api/ordens", selectedOsId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/ordens/${selectedOsId}`); return r.json(); },
    enabled: !!selectedOsId,
  });

  const osAreaIds = useMemo(() => {
    if (!selectedOsId || !selectedOs?.areas) return null;
    return new Set<number>(selectedOs.areas.map((a: any) => a.id));
  }, [selectedOsId, selectedOs]);

  const effectiveFilteredAreaIds = osAreaIds ?? computedFilteredAreaIds;

  // Zoom automático só na primeira seleção de cada área (não em re-renders)
  // DESABILITADO quando modal de registro está aberto para preservar zoom do usuário
  useEffect(() => {
    // Não fazer zoom automático se modal de registro estiver aberto
    if (showQuickRegisterModal) {
      return;
    }
    
    if (selectedArea && mapRef.current) {
      // Só fazer zoom se é uma área diferente da última
      if (lastZoomedAreaIdRef.current !== selectedArea.id) {
        const lat = selectedArea.lat;
        const lng = selectedArea.lng;
        
        // Validar coordenadas antes de fazer zoom
        if (
          lat && 
          lng && 
          typeof lat === 'number' && 
          typeof lng === 'number' &&
          !isNaN(lat) && 
          !isNaN(lng) &&
          isFinite(lat) && 
          isFinite(lng)
        ) {
          mapRef.current.setView([lat, lng], 17, { animate: true });
          lastZoomedAreaIdRef.current = selectedArea.id;
        } else {
          console.warn('Coordenadas inválidas para área:', selectedArea.id, { lat, lng });
        }
      }
    }
  }, [selectedArea, showQuickRegisterModal]);

  // Largura responsiva: 85% em mobile, 21rem em desktop
  const style = {
    "--sidebar-width": "min(85vw, 21rem)",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  // IMPORTANTE: useCallback para evitar recriação do mapa ao re-render
  const handleAreaClick = useCallback((area: ServiceArea) => {
    setSelectedArea(area);
    setShowMapCard(true); // Mostrar card flutuante no mapa
  }, []);

  const handleCloseMapCard = () => {
    // Apenas ocultar o card, não resetar selectedArea para preservar estado do mapa
    setShowMapCard(false);
  };

  const handleOpenQuickRegister = () => {
    // Salvar zoom e centro atuais antes de abrir o modal
    if (mapRef.current) {
      setSavedMapZoom(mapRef.current.getZoom());
      const center = mapRef.current.getCenter();
      setSavedMapCenter({ lat: center.lat, lng: center.lng });
    }
    setShowMapCard(false);
    setShowQuickRegisterModal(true);
  };

  const handleOpenManualForecast = () => {
    setShowMapCard(false);
    setShowManualForecastModal(true);
  };

  const handleOpenEdit = () => {
    setShowMapCard(false);
    setShowEditModal(true);
  };

  // IMPORTANTE: useCallback para evitar recriação do mapa ao re-render
  // handleMapClick é passado como dependência do useEffect de inicialização do mapa
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isPublicView) return;
    setPendingNewAreaCoords({ lat, lng });
    setShowNewAreaConfirm(true);
  }, [isPublicView]);

  const handleConfirmNewArea = () => {
    if (pendingNewAreaCoords) {
      setNewAreaCoords(pendingNewAreaCoords);
      setShowNewAreaModal(true);
    }
    setShowNewAreaConfirm(false);
    setPendingNewAreaCoords(null);
  };

  const handleCancelNewArea = () => {
    setShowNewAreaConfirm(false);
    setPendingNewAreaCoords(null);
  };

  const handleAreaUpdate = (updatedArea: ServiceArea) => {
    setSelectedArea(updatedArea);
  };

  const handleTimeRangeFilterChange = (filter: TimeRangeFilter, customDateRange?: { from: Date | undefined; to: Date | undefined }) => {
    setTimeRangeFilter(filter);
    // Sempre atualizar customFilterDateRange (undefined para filtros não-custom)
    setCustomFilterDateRange(customDateRange || { from: undefined, to: undefined });
  };

  const handleAreaSelectFromSearch = (area: ServiceArea) => {
    if (mapRef.current && area.lat && area.lng) {
      mapRef.current.setView([area.lat, area.lng], 17, { animate: true });
    }
    
    setSelectedArea(area);
    setShowMapCard(true);
    
    ignoreSearchClearRef.current = true;
    
    if (isMobile) {
      setBottomSheetState("minimized");
    }
  };

  const handleGeocodeFlyTo = useCallback((lat: number, lng: number, _label: string) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
    }
    setSelectedArea(null);
    setShowMapCard(false);
  }, []);

  // Mobile layout com BottomSheet
  if (isMobile) {
    const toggleBottomSheet = () => {
      if (bottomSheetState === "minimized") {
        setBottomSheetState("medium");
      } else {
        setBottomSheetState("minimized");
      }
    };

    return (
      <div className="flex flex-col h-screen w-full">
        <header className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border bg-background z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleBottomSheet}
            className={bottomSheetState !== "minimized" ? "toggle-elevate toggle-elevated" : ""}
            aria-label={bottomSheetState === "minimized" ? "Abrir menu" : "Fechar menu"}
            data-testid="button-mobile-menu"
          >
            {bottomSheetState === "minimized" ? (
              <Menu className="h-5 w-5" />
            ) : (
              <X className="h-5 w-5" />
            )}
          </Button>
          <h1 className="text-lg font-semibold">Zeladoria Londrina</h1>
          <div className="flex items-center gap-2">
            {!isPublicView && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBackupDownload}
                  aria-label="Exportar backup JSON"
                  data-testid="button-backup"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowExportDialog(true)}
                  aria-label="Exportar CSV para Supabase"
                  data-testid="button-export-csv"
                >
                  <FileText className="h-4 w-4" />
                </Button>
              </>
            )}
            <ThemeToggle />
            {!isPublicView && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-user-menu-mobile">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[9999]">
                  <DropdownMenuLabel>
                    <div className="text-sm font-medium">{user.nome}</div>
                    <div className="text-xs text-muted-foreground">{roleLabels[user.role] || user.role}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.role === "admin" && (
                    <DropdownMenuItem onClick={() => navigate("/usuarios")} data-testid="menu-item-users">
                      <Users className="h-4 w-4" />
                      Gerenciar Usuários
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setShowChangePassword(true)} data-testid="menu-item-change-password-mobile">
                    <Lock className="h-4 w-4" />
                    Alterar Senha
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout-mobile">
                    <LogOut className="h-4 w-4" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {(selectedService === 'rocagem' || isPublicView) && (
          <MapHeaderBar
            searchQuery={filters.search}
            onSearchChange={(query) => setFilters({ ...filters, search: query })}
            activeFilter={timeRangeFilter}
            onFilterChange={handleTimeRangeFilterChange}
            filteredCount={computedFilteredAreaIds ? computedFilteredAreaIds.size : filteredRocagemAreas.length}
            totalCount={rocagemAreas.length}
            areas={filteredRocagemAreas}
            onAreaSelect={handleAreaSelectFromSearch}
            onGeocodeFlyTo={handleGeocodeFlyTo}
            selectedAreaId={selectedArea?.id ?? null}
            onClearSelection={() => {
              setSelectedArea(null);
              setShowMapCard(false);
            }}
          />
        )}
        {(selectedService === 'rocagem' || isPublicView) && (
          <MowingStatsBar expanded={reportOpen} onPeriodChange={handleStatsPeriodChange} onPeriodClear={handleStatsPeriodClear} />
        )}
        
        <main className="flex-1 overflow-hidden relative">
          <DashboardMap
            rocagemAreas={rocagemAreas}
            layerFilters={{
              rocagemLote1: selectedService === 'rocagem' || isPublicView || !!selectedOsId,
              rocagemLote2: selectedService === 'rocagem' || isPublicView || !!selectedOsId,
            }}
            onAreaClick={handleAreaClick}
            onMapClick={isPublicView ? undefined : handleMapClick}
            filteredAreaIds={effectiveFilteredAreaIds}
            mapRef={mapRef}
            searchQuery={filters.search}
            activeFilter={timeRangeFilter}
            selectedAreaId={selectedArea?.id || null}
            relocatingAreaId={relocatingAreaId}
            onPositionChange={isPublicView ? undefined : handlePositionChange}
            osMode={!!selectedOsId}
          />

          {showMapCard && selectedArea && (
            <div className="absolute top-4 left-4 z-[1000] pointer-events-auto">
              <MapInfoCard
                area={selectedArea}
                onClose={handleCloseMapCard}
                onRegisterMowing={isPublicView ? undefined : handleOpenQuickRegister}
                onSetManualForecast={isPublicView ? undefined : handleOpenManualForecast}
                onEdit={isPublicView ? undefined : handleOpenEdit}
                onChangeLocation={isPublicView ? undefined : handleStartRelocation}
                isRelocating={relocatingAreaId === selectedArea.id}
                isPublicView={isPublicView}
              />
            </div>
          )}
          
          {!isPublicView && (
            <BottomSheet
              state={bottomSheetState}
              onStateChange={setBottomSheetState}
            >
              <AppSidebar
                standalone
                selectedService={selectedService}
                onServiceSelect={handleServiceSelect}
                onOpenReport={() => setReportOpen(prev => !prev)}
                selectedArea={selectedArea}
                onAreaClose={() => setSelectedArea(null)}
                onAreaUpdate={handleAreaUpdate}
                showQuickRegisterModal={showQuickRegisterModal}
                showMapCard={showMapCard}
                ordens={ordens}
                selectedOsId={selectedOsId}
                onOsSelect={(id) => { handleOsSelect(id); setBottomSheetState("minimized"); }}
                onBackupDownload={handleBackupDownload}
                onShowExportDialog={() => setShowExportDialog(true)}
                onChangePassword={() => setShowChangePassword(true)}
                onLogout={handleLogout}
              />
            </BottomSheet>
          )}

          {!isPublicView && (
            <>
              <QuickRegisterModal
                area={selectedArea}
                open={showQuickRegisterModal}
                onOpenChange={setShowQuickRegisterModal}
                mapRef={mapRef}
                savedMapZoom={savedMapZoom}
                savedMapCenter={savedMapCenter}
              />
              {newAreaCoords && (
                <NewAreaModal
                  open={showNewAreaModal}
                  onOpenChange={setShowNewAreaModal}
                  lat={newAreaCoords.lat}
                  lng={newAreaCoords.lng}
                />
              )}
              <EditAreaModal
                area={selectedArea}
                open={showEditModal}
                onOpenChange={setShowEditModal}
              />
            </>
          )}
        </main>
      </div>
    );
  }

  if (isPublicView) {
    return (
      <div className="flex flex-col h-screen w-full">
        <header className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border bg-background z-30">
          <h1 className="text-lg font-semibold" data-testid="text-public-title">Zeladoria Londrina - Portal Público</h1>
          <ThemeToggle />
        </header>

        <MapHeaderBar
          searchQuery={filters.search}
          onSearchChange={(query) => setFilters({ ...filters, search: query })}
          activeFilter={timeRangeFilter}
          onFilterChange={handleTimeRangeFilterChange}
          filteredCount={computedFilteredAreaIds ? computedFilteredAreaIds.size : filteredRocagemAreas.length}
          totalCount={rocagemAreas.length}
          areas={filteredRocagemAreas}
          onAreaSelect={handleAreaSelectFromSearch}
          onGeocodeFlyTo={handleGeocodeFlyTo}
          selectedAreaId={selectedArea?.id ?? null}
          onClearSelection={() => {
            setSelectedArea(null);
            setShowMapCard(false);
          }}
        />
        {(selectedService === 'rocagem' || isPublicView) && (
          <MowingStatsBar expanded={reportOpen} onPeriodChange={handleStatsPeriodChange} onPeriodClear={handleStatsPeriodClear} />
        )}

        <main className="flex-1 overflow-hidden relative">
          <DashboardMap
            rocagemAreas={rocagemAreas}
            layerFilters={{
              rocagemLote1: true,
              rocagemLote2: true,
            }}
            onAreaClick={handleAreaClick}
            filteredAreaIds={computedFilteredAreaIds}
            mapRef={mapRef}
            searchQuery={filters.search}
            activeFilter={timeRangeFilter}
            selectedAreaId={selectedArea?.id || null}
          />

          {showMapCard && selectedArea && (
            <div className="absolute top-4 left-4 z-[1000] pointer-events-auto">
              <MapInfoCard
                area={selectedArea}
                onClose={handleCloseMapCard}
                isPublicView={true}
              />
            </div>
          )}
        </main>
      </div>
    );
  }

  // Desktop layout com Sidebar
  return (
    <SidebarProvider 
      style={style as React.CSSProperties}
      defaultOpen={typeof window !== 'undefined' && window.innerWidth > 1024}
    >
      <div className="flex h-screen w-full">
        <AppSidebar
          selectedService={selectedService}
          onServiceSelect={handleServiceSelect}
          onOpenReport={() => setReportOpen(prev => !prev)}
          selectedArea={selectedArea}
          onAreaClose={() => setSelectedArea(null)}
          onAreaUpdate={handleAreaUpdate}
          showQuickRegisterModal={showQuickRegisterModal}
          showMapCard={showMapCard}
          ordens={ordens}
          selectedOsId={selectedOsId}
          onOsSelect={handleOsSelect}
          onBackupDownload={handleBackupDownload}
          onShowExportDialog={() => setShowExportDialog(true)}
          onChangePassword={() => setShowChangePassword(true)}
          onLogout={handleLogout}
        />
        
        <SidebarInset className="flex-1 overflow-hidden flex flex-col">
          <header className="flex items-center h-16 px-4 border-b border-sidebar-border bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1 flex items-center justify-center gap-5">
              <img
                src="/logos/londrina.png"
                alt="Prefeitura de Londrina"
                className="h-11 w-auto object-contain opacity-90"
              />
              <div className="w-px h-8 bg-border/50" />
              <img
                src="/logos/cmtu_vertical.png"
                alt="CMTU Londrina"
                className="h-11 w-auto object-contain opacity-90"
              />
            </div>
            <div className="w-8 flex-shrink-0" />
          </header>

          {selectedService === 'rocagem' && (
            <MapHeaderBar
              searchQuery={filters.search}
              onSearchChange={(query) => setFilters({ ...filters, search: query })}
              activeFilter={timeRangeFilter}
              onFilterChange={handleTimeRangeFilterChange}
              filteredCount={computedFilteredAreaIds ? computedFilteredAreaIds.size : filteredRocagemAreas.length}
              totalCount={rocagemAreas.length}
              areas={filteredRocagemAreas}
              onAreaSelect={handleAreaSelectFromSearch}
              onGeocodeFlyTo={handleGeocodeFlyTo}
              selectedAreaId={selectedArea?.id ?? null}
              onClearSelection={() => {
                setSelectedArea(null);
                setShowMapCard(false);
              }}
            />
          )}
          {(selectedService === 'rocagem' || isPublicView) && (
          <MowingStatsBar expanded={reportOpen} onPeriodChange={handleStatsPeriodChange} onPeriodClear={handleStatsPeriodClear} />
        )}

          {selectedOsId && selectedOs && (
            <div className="flex items-center gap-3 px-4 py-2 bg-emerald-600 text-white text-sm flex-shrink-0">
              <ClipboardList className="h-4 w-4 flex-shrink-0" />
              <span className="font-semibold">OS Nº {selectedOs.numero}</span>
              <span className="opacity-80">·</span>
              <span className="opacity-80">Lote {selectedOs.lote}</span>
              <span className="opacity-80">·</span>
              <span className="opacity-80">{selectedOs.mes_referencia}</span>
              <span className="opacity-80">·</span>
              <span className="opacity-80">{selectedOs.areas?.length} áreas</span>
              <button
                onClick={() => setSelectedOsId(null)}
                className="ml-auto flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" /> Sair da visualização
              </button>
            </div>
          )}

          <main className="flex-1 overflow-hidden relative">
            <DashboardMap
              rocagemAreas={rocagemAreas}
              layerFilters={{
                rocagemLote1: selectedService === 'rocagem' || !!selectedOsId,
                rocagemLote2: selectedService === 'rocagem' || !!selectedOsId,
              }}
              onAreaClick={handleAreaClick}
              onMapClick={handleMapClick}
              filteredAreaIds={effectiveFilteredAreaIds}
              searchQuery={filters.search}
              activeFilter={timeRangeFilter}
              mapRef={mapRef}
              selectedAreaId={selectedArea?.id || null}
              onMapZoomSaved={handleMapZoomSaved}
              relocatingAreaId={relocatingAreaId}
              onPositionChange={handlePositionChange}
            />

            {showMapCard && selectedArea && (
              <div className="absolute top-4 left-4 z-[1000] pointer-events-auto">
                <MapInfoCard
                  area={selectedArea}
                  onClose={handleCloseMapCard}
                  onRegisterMowing={handleOpenQuickRegister}
                  onSetManualForecast={handleOpenManualForecast}
                  onEdit={handleOpenEdit}
                  onChangeLocation={handleStartRelocation}
                  isRelocating={relocatingAreaId === selectedArea.id}
                />
              </div>
            )}
          </main>
        </SidebarInset>
      </div>

      <QuickRegisterModal
        area={selectedArea}
        open={showQuickRegisterModal}
        onOpenChange={setShowQuickRegisterModal}
        mapRef={mapRef}
        savedMapZoom={savedMapZoom}
        savedMapCenter={savedMapCenter}
      />

      <ManualForecastModal
        area={selectedArea}
        open={showManualForecastModal}
        onOpenChange={setShowManualForecastModal}
      />

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
      />

      <AlertDialog open={showRelocationConfirm} onOpenChange={setShowRelocationConfirm}>
        <AlertDialogContent data-testid="dialog-relocation-confirm" className="z-[9999]">
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar Localização?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar a localização desta área para as novas coordenadas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel onClick={handleCancelRelocation} data-testid="button-cancel-relocation">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRelocation}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={updatePositionMutation.isPending}
              data-testid="button-confirm-relocation"
            >
              {updatePositionMutation.isPending ? "Salvando..." : "Confirmar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showNewAreaConfirm} onOpenChange={setShowNewAreaConfirm}>
        <AlertDialogContent data-testid="dialog-new-area-confirm" className="z-[9999]">
          <AlertDialogHeader>
            <AlertDialogTitle>Adicionar Nova Área?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja cadastrar uma nova área nesta localização?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel onClick={handleCancelNewArea} data-testid="button-cancel-new-area">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmNewArea}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-new-area"
            >
              Sim, Adicionar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {newAreaCoords && (
        <NewAreaModal
          open={showNewAreaModal}
          onOpenChange={setShowNewAreaModal}
          lat={newAreaCoords.lat}
          lng={newAreaCoords.lng}
        />
      )}

      <EditAreaModal
        area={selectedArea}
        open={showEditModal}
        onOpenChange={setShowEditModal}
      />

      <ChangePasswordDialog
        open={showChangePassword}
        onOpenChange={setShowChangePassword}
      />
    </SidebarProvider>
  );
}
