import {
  MapPin,
  Layers,
  Leaf,
  Recycle,
  BarChart3,
  ClipboardList,
  CalendarDays,
  ChevronRight,
  Settings,
  Download,
  FileText,
  Users,
  Lock,
  LogOut,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

import { motion, AnimatePresence } from "framer-motion";
import operacoesLogoPositivo from "@assets/Operacoes_Logo_Positivo_1762027620245.png";
import operacoesLogoNegativo from "@assets/Operacoes_Logo_Negativo_1762032098603.png";
import { useTheme } from "@/components/theme-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { useAuth } from "@/hooks/use-auth";

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
  ordens?: any[];
  selectedOsId?: number | null;
  onOsSelect?: (id: number | null) => void;
  onBackupDownload?: () => void;
  onShowExportDialog?: () => void;
  onChangePassword?: () => void;
  onLogout?: () => void;
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
  ordens = [],
  selectedOsId,
  onOsSelect,
  onBackupDownload,
  onShowExportDialog,
  onChangePassword,
  onLogout,
}: AppSidebarProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [osListOpen, setOsListOpen] = useState(false);

  const handleServiceClick = (service: string) => {
    if (onServiceSelect) {
      onServiceSelect(selectedService === service ? '' : service);
    }
  };

  const header = standalone ? (
    <div className="flex items-center justify-between gap-3">
      <img
        src="/logos/londrina.png"
        alt="Prefeitura de Londrina"
        className="h-9 w-auto object-contain opacity-90 flex-shrink-0"
        style={{ maxWidth: 110 }}
      />
      <img
        src="/logos/cmtu_vertical.png"
        alt="CMTU Londrina"
        className="h-9 w-auto object-contain opacity-90 flex-shrink-0"
        style={{ maxWidth: 42 }}
      />
    </div>
  ) : null;

  const footer = (
    <div className="flex flex-col items-center gap-2 px-4 py-3 border-t border-border/40">
      <img
        src={theme === "dark" ? operacoesLogoNegativo : operacoesLogoPositivo}
        alt="Diretoria de Operações"
        className="h-10 w-auto object-contain"
      />
      <div className="flex items-center justify-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[9.5px] uppercase tracking-widest font-semibold text-muted-foreground/55 select-none">
          Zeladoria em Tempo Real
        </span>
      </div>
      {user && (
        <div className="w-full pt-1.5 mt-0.5 border-t border-border/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-foreground/70 truncate">{user.nome}</span>
              <span className="text-[10px] text-muted-foreground/50 capitalize">{user.role}</span>
            </div>
            <div className="flex items-center gap-0.5">
              {onChangePassword && (
                <button
                  onClick={onChangePassword}
                  title="Alterar Senha"
                  className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Lock className="h-3.5 w-3.5" />
                </button>
              )}
              <ThemeToggle />
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Sair"
                  className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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
        {/* Seção header */}
        <div className="flex items-center gap-2 px-1 mb-2.5">
          <div className="h-px flex-1 bg-border/60" />
          <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground/45 flex items-center gap-1">
            <Layers className="h-2.5 w-2.5" />
            Serviços
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>

        <Accordion type="single" collapsible className="space-y-1.5">
          {/* LIMPEZA URBANA */}
          <AccordionItem value="limpeza" className="border-0">
            <AccordionTrigger
              className="group rounded-lg px-3 py-2.5 hover:no-underline hover:bg-muted/60 transition-all duration-200 data-[state=open]:bg-muted/70 border border-transparent data-[state=open]:border-border/50"
              data-testid="accordion-limpeza-urbana"
            >
              <div className="flex items-center gap-2.5">
                <Leaf className="h-4 w-4 text-emerald-500/60 dark:text-emerald-400/60 flex-shrink-0" />
                <span className="font-semibold text-sm tracking-wide">LIMPEZA URBANA</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-1 pt-1 px-1">
              <div className="space-y-0.5">
                <ServiceButton
                  active={selectedService === "rocagem"}
                  onClick={() => handleServiceClick("rocagem")}
                  label="Capina e Roçagem"
                  testId="service-rocagem"
                />

                <AnimatePresence initial={false}>
                  {selectedService === "rocagem" && (
                    <motion.div
                      key="rocagem-tools"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <button
                        onClick={() => onOpenReport?.()}
                        className="w-full flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-md text-xs transition-colors text-foreground/60 hover:text-foreground hover:bg-muted/50"
                        data-testid="button-relatorio-rocagem"
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-foreground/40 flex-shrink-0" />
                        <span>Relatório</span>
                      </button>
                      <button
                        onClick={() => setOsListOpen((v) => !v)}
                        className="w-full flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-md text-xs transition-colors text-foreground/60 hover:text-foreground hover:bg-muted/50"
                        data-testid="button-ordem-servico"
                      >
                        <ClipboardList className="h-3.5 w-3.5 text-foreground/40 flex-shrink-0" />
                        <span className="flex-1 text-left">Ordem de Serviço</span>
                        <motion.div
                          animate={{ rotate: osListOpen ? 90 : 0 }}
                          transition={{ duration: 0.18 }}
                        >
                          <ChevronRight className="h-3 w-3 opacity-40" />
                        </motion.div>
                      </button>

                      <AnimatePresence initial={false}>
                        {osListOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="pl-12 pr-2 py-1 space-y-0.5">
                              {ordens.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">
                                  Nenhuma OS emitida
                                </p>
                              ) : (
                                ordens.map((os: any) => (
                                  <button
                                    key={os.id}
                                    onClick={() =>
                                      onOsSelect?.(selectedOsId === os.id ? null : os.id)
                                    }
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                                      selectedOsId === os.id
                                        ? "bg-emerald-600 text-white font-medium"
                                        : "text-foreground/70 hover:text-foreground hover:bg-accent/50"
                                    }`}
                                  >
                                    <MapPin className="h-3 w-3 flex-shrink-0" />
                                    <span className="flex-1 truncate">OS {os.numero}</span>
                                    <span className="opacity-60 flex-shrink-0">L{os.lote}</span>
                                  </button>
                                ))
                              )}
                              <Link href="/ordem-servico">
                                <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors mt-1 border-t border-border/40 pt-2">
                                  <Settings className="h-3 w-3 flex-shrink-0" />
                                  <span>Gerenciar / Nova OS</span>
                                </button>
                              </Link>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <Link href="/cronograma">
                        <button className="w-full flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-md text-xs transition-colors text-foreground/60 hover:text-foreground hover:bg-muted/50">
                          <CalendarDays className="h-3.5 w-3.5 text-foreground/40 flex-shrink-0" />
                          <span>Cronograma Semanal</span>
                        </button>
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>

                <ServiceButton
                  active={selectedService === "boa-praca"}
                  onClick={() => handleServiceClick("boa-praca")}
                  label="Boa Praça"
                  testId="service-boa-praca"
                />
                <ServiceButton
                  active={selectedService === "manutencao-lagos"}
                  onClick={() => handleServiceClick("manutencao-lagos")}
                  label="Manutenção Lagos"
                  testId="service-manutencao-lagos"
                />
                <ServiceButton
                  active={selectedService === "varricao"}
                  onClick={() => handleServiceClick("varricao")}
                  label="Varrição"
                  testId="service-varricao"
                />
                <ServiceButton
                  active={selectedService === "podas"}
                  onClick={() => handleServiceClick("podas")}
                  label="Podas"
                  testId="service-podas"
                />
                <ServiceButton
                  active={selectedService === "chafariz"}
                  onClick={() => handleServiceClick("chafariz")}
                  label="Chafariz"
                  testId="service-chafariz"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* RESÍDUOS */}
          <AccordionItem value="residuos" className="border-0">
            <AccordionTrigger
              className="group rounded-lg px-3 py-2.5 hover:no-underline hover:bg-muted/60 transition-all duration-200 data-[state=open]:bg-muted/70 border border-transparent data-[state=open]:border-border/50"
              data-testid="accordion-residuos"
            >
              <div className="flex items-center gap-2.5">
                <Recycle className="h-4 w-4 text-blue-500/60 dark:text-blue-400/60 flex-shrink-0" />
                <span className="font-semibold text-sm tracking-wide">RESÍDUOS</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-1 pt-1 px-1">
              <div className="space-y-0.5">
                <ServiceButton
                  active={selectedService === "coleta-organicos"}
                  onClick={() => handleServiceClick("coleta-organicos")}
                  label="Coleta Orgânicos e Rejeitos"
                  testId="service-coleta-organicos"
                />
                <ServiceButton
                  active={selectedService === "coleta-reciclaveis"}
                  onClick={() => handleServiceClick("coleta-reciclaveis")}
                  label="Coleta Recicláveis"
                  testId="service-coleta-reciclaveis"
                />
                <ServiceButton
                  active={selectedService === "coleta-especiais"}
                  onClick={() => handleServiceClick("coleta-especiais")}
                  label="Coleta e Limpeza Especiais"
                  testId="service-coleta-especiais"
                />
                <ServiceButton
                  active={selectedService === "limpeza-bocas"}
                  onClick={() => handleServiceClick("limpeza-bocas")}
                  label="Limpeza de Bocas de Lobo"
                  testId="service-limpeza-bocas"
                />
                <ServiceButton
                  active={selectedService === "pevs"}
                  onClick={() => handleServiceClick("pevs")}
                  label="PEV's"
                  testId="service-pevs"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* DEMANDAS — acesso para todos */}
      <div className="mt-1 px-1">
        <div className="h-px bg-border/40 mb-2" />
        <Link href="/demandas">
          <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide hover:bg-muted/60 transition-colors text-foreground/70 hover:text-foreground">
            <ClipboardList className="h-4 w-4 text-slate-500/60 flex-shrink-0" />
            <span>DEMANDAS</span>
          </button>
        </Link>
      </div>

      {(user?.role === "admin" || user?.role === "gestor") && (
        <div className="mt-1 px-1">
          <div className="h-px bg-border/40 mb-2" />
          <Accordion type="single" collapsible className="space-y-1.5">
            <AccordionItem value="configuracoes" className="border-0">
              <AccordionTrigger
                className="group rounded-lg px-3 py-2.5 hover:no-underline hover:bg-muted/60 transition-all duration-200 data-[state=open]:bg-muted/70 border border-transparent data-[state=open]:border-border/50"
              >
                <div className="flex items-center gap-2.5">
                  <Settings className="h-4 w-4 text-slate-500/60 dark:text-slate-400/60 flex-shrink-0" />
                  <span className="font-semibold text-sm tracking-wide">CONFIGURAÇÕES</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-1 pt-1 px-1">
                <div className="space-y-0.5">
                  {/* Ferramentas */}
                  <div className="pb-1">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40 font-bold block mb-1 pl-3">Ferramentas</span>
                    <button
                      onClick={onBackupDownload}
                      className="w-full flex items-center gap-2.5 pl-6 pr-3 py-1.5 rounded-md text-xs text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                      <span>Exportar Backup JSON</span>
                    </button>
                    <button
                      onClick={onShowExportDialog}
                      className="w-full flex items-center gap-2.5 pl-6 pr-3 py-1.5 rounded-md text-xs text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                      <span>Exportar CSV</span>
                    </button>
                  </div>

                  {/* Usuários (admin only) */}
                  {user?.role === "admin" && (
                    <div className="pb-1 border-t border-border/30 pt-1.5">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40 font-bold block mb-1 pl-3">Usuários</span>
                      <Link href="/usuarios">
                        <button className="w-full flex items-center gap-2.5 pl-6 pr-3 py-1.5 rounded-md text-xs text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">
                          <Users className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                          <span>Gerenciar Usuários</span>
                        </button>
                      </Link>
                    </div>
                  )}

                  {/* Contratos */}
                  <div className="pb-1 border-t border-border/30 pt-1.5">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40 font-bold block mb-1 pl-3">Contratos</span>
                    <Link href="/setores">
                      <button className="w-full flex items-center gap-2.5 pl-6 pr-3 py-1.5 rounded-md text-xs text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">
                        <Layers className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span>Setores</span>
                      </button>
                    </Link>
                    <Link href="/configuracoes">
                      <button className="w-full flex items-center gap-2.5 pl-6 pr-3 py-1.5 rounded-md text-xs text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">
                        <FileText className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span>Configurações de Contrato</span>
                      </button>
                    </Link>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </>
  );

  if (standalone) {
    return (
      <div className="flex flex-col h-full" data-testid="sidebar-standalone">
        <div className="p-4 pb-3">{header}</div>
        <div className="flex-1 overflow-auto px-3">{content}</div>
        {footer}
      </div>
    );
  }

  return (
    <Sidebar className="border-r-0 sm:!max-w-none" data-testid="sidebar-wrapped">
      <SidebarContent className="px-3">{content}</SidebarContent>
      <SidebarFooter className="p-0">{footer}</SidebarFooter>
    </Sidebar>
  );
}

function ServiceButton({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center px-3 py-1.5 rounded-md text-xs uppercase tracking-wide text-left transition-all duration-150 ${
        active
          ? "text-foreground font-semibold ring-1 ring-emerald-500/50"
          : "text-foreground/55 hover:text-foreground hover:ring-1 hover:ring-emerald-500/25"
      }`}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
