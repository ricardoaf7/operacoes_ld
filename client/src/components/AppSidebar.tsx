import { 
  MapPin, 
  Layers, 
  Leaf, 
  TreeDeciduous, 
  Waves, 
  Paintbrush, 
  Scissors, 
  Droplets,
  Trash2,
  Recycle,
  Sparkles,
  Wind,
  Package,
  BarChart3
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";
import operacoesLogoPositivo from "@assets/Operacoes_Logo_Positivo_1762027620245.png";
import operacoesLogoNegativo from "@assets/Operacoes_Logo_Negativo_1762032098603.png";
import { useTheme } from "@/components/theme-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AreaInfoCard } from "./AreaInfoCard";
import { Separator } from "@/components/ui/separator";
import type { ServiceArea } from "@shared/schema";

interface AppSidebarProps {
  selectedService?: string;
  onServiceSelect?: (service: string) => void;
  onOpenReport?: () => void;
  selectedArea?: ServiceArea | null;
  onAreaClose?: () => void;
  onAreaUpdate?: (area: ServiceArea) => void;
  standalone?: boolean;
  showQuickRegisterModal?: boolean;
  showMapCard?: boolean;
}

export function AppSidebar({
  selectedService,
  onServiceSelect,
  onOpenReport,
  selectedArea,
  onAreaClose,
  onAreaUpdate,
  standalone = false,
  showQuickRegisterModal = false,
  showMapCard = false,
}: AppSidebarProps) {
  const { theme } = useTheme();

  const handleServiceClick = (service: string) => {
    if (onServiceSelect) {
      onServiceSelect(selectedService === service ? '' : service);
    }
  };

  const header = (
    <div className="flex flex-col gap-1.5">
      <img 
        src={theme === 'dark' ? operacoesLogoNegativo : operacoesLogoPositivo} 
        alt="Diretoria de Operações"
        className="h-14 w-auto object-contain"
      />
      <p className="text-xs text-muted-foreground text-center leading-tight">Zeladoria em Tempo Real</p>
    </div>
  );

  const content = (
    <>
        {selectedArea && onAreaClose && !showQuickRegisterModal && !showMapCard ? (
          <div className="mb-4">
            <AreaInfoCard 
              area={selectedArea} 
              onClose={onAreaClose}
              onUpdate={onAreaUpdate}
            />
            <Separator className="my-4" />
          </div>
        ) : null}
        
        <div className="mb-4">
          <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground">
            <Layers className="h-4 w-4" />
            <span>Serviços</span>
          </div>

          <Accordion type="single" collapsible className="space-y-2">
            <AccordionItem value="limpeza" className="border-0">
              <AccordionTrigger 
                className="rounded-lg bg-emerald-600/20 dark:bg-emerald-400/20 hover:bg-emerald-600/30 dark:hover:bg-emerald-400/30 px-4 py-3 hover:no-underline data-[state=open]:bg-emerald-600/30 dark:data-[state=open]:bg-emerald-400/30 border border-emerald-600/40 dark:border-emerald-400/40"
                data-testid="accordion-limpeza-urbana"
              >
                <div className="flex items-center gap-3">
                  <Leaf className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-sm text-emerald-700 dark:text-emerald-300">LIMPEZA URBANA</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-2 pt-2 px-2">
                <div className="space-y-1">
                  <button
                    onClick={() => handleServiceClick('rocagem')}
                    className={`w-full flex items-center justify-start gap-3 px-4 py-2.5 rounded-md text-sm text-left transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'rocagem' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-rocagem"
                  >
                    <Scissors className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-left">Capina e Roçagem</span>
                  </button>
                  
                  <AnimatePresence>
                    {selectedService === 'rocagem' && (
                      <motion.div
                        key="rocagem-tools"
                        initial={{ opacity: 0, height: 0, y: -10 }}
                        animate={{ opacity: 1, height: "auto", y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <button
                          onClick={() => onOpenReport?.()}
                          className="w-full flex items-center gap-3 pl-8 pr-4 py-2 rounded-md text-sm transition-colors text-foreground/70 hover:text-foreground hover:bg-accent/50"
                          data-testid="button-relatorio-rocagem"
                        >
                          <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                          <span>Relatório</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    onClick={() => handleServiceClick('boa-praca')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'boa-praca' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-boa-praca"
                  >
                    <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Boa Praça</span>
                  </button>

                  <button
                    onClick={() => handleServiceClick('manutencao-lagos')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'manutencao-lagos' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-manutencao-lagos"
                  >
                    <Waves className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Manutenção Lagos</span>
                  </button>

                  <button
                    onClick={() => handleServiceClick('varricao')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'varricao' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-varricao"
                  >
                    <Paintbrush className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Varrição</span>
                  </button>

                  <button
                    onClick={() => handleServiceClick('podas')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'podas' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-podas"
                  >
                    <TreeDeciduous className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Podas</span>
                  </button>

                  <button
                    onClick={() => handleServiceClick('chafariz')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'chafariz' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-chafariz"
                  >
                    <Droplets className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Chafariz</span>
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="residuos" className="border-0">
              <AccordionTrigger 
                className="rounded-lg bg-blue-600/20 dark:bg-blue-400/20 hover:bg-blue-600/30 dark:hover:bg-blue-400/30 px-4 py-3 hover:no-underline data-[state=open]:bg-blue-600/30 dark:data-[state=open]:bg-blue-400/30 border border-blue-600/40 dark:border-blue-400/40"
                data-testid="accordion-residuos"
              >
                <div className="flex items-center gap-3">
                  <Recycle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold text-sm text-blue-700 dark:text-blue-300">RESÍDUOS</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-2 pt-2 px-2">
                <div className="space-y-1">
                  <button
                    onClick={() => handleServiceClick('coleta-organicos')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'coleta-organicos' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-coleta-organicos"
                  >
                    <Trash2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>Coleta Orgânicos e Rejeitos</span>
                  </button>

                  <button
                    onClick={() => handleServiceClick('coleta-reciclaveis')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'coleta-reciclaveis' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-coleta-reciclaveis"
                  >
                    <Recycle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>Coleta Recicláveis</span>
                  </button>

                  <button
                    onClick={() => handleServiceClick('coleta-especiais')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'coleta-especiais' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-coleta-especiais"
                  >
                    <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>Coleta e Limpeza Especiais</span>
                  </button>

                  <button
                    onClick={() => handleServiceClick('limpeza-bocas')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'limpeza-bocas' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-limpeza-bocas"
                  >
                    <Wind className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>Limpeza de Bocas de Lobo</span>
                  </button>

                  <button
                    onClick={() => handleServiceClick('pevs')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors hover-elevate active-elevate-2 ${
                      selectedService === 'pevs' 
                        ? 'bg-accent text-accent-foreground font-medium' 
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    data-testid="service-pevs"
                  >
                    <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>PEV's</span>
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

        </div>
    </>
  );

  if (standalone) {
    return (
      <div className="flex flex-col h-full" data-testid="sidebar-standalone">
        <div className="p-4 pb-3">
          {header}
        </div>
        <div className="flex-1 overflow-auto px-3">
          {content}
        </div>
      </div>
    );
  }

  return (
    <Sidebar className="border-r-0 sm:!max-w-none" data-testid="sidebar-wrapped">
      <SidebarHeader className="p-4 pb-3">
        {header}
      </SidebarHeader>
      <SidebarContent className="px-3">
        {content}
      </SidebarContent>
    </Sidebar>
  );
}
