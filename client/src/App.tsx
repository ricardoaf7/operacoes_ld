import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import Dashboard from "@/pages/dashboard";
import RelatoriosPage from "@/pages/relatorios";
import RelatorioRocagensPage from "@/pages/relatorio-rocagens";
import LoginPage from "@/pages/login";
import PublicDashboard from "@/pages/public-dashboard";
import UserManagement from "@/pages/user-management";
import ConfiguracoesPage from "@/pages/configuracoes";
import SetoresPage from "@/pages/setores";
import DemandasPage from "@/pages/demandas";
import VarricaoLocaisPage from "@/pages/varricao-locais";
import VarricaoCoberturaPage from "@/pages/varricao-cobertura";
import VarricaoOrdensPage from "@/pages/varricao-ordens";
import VarricaoOrdemNovaPage from "@/pages/varricao-ordem-nova";
import VarricaoOrdemDetalhePage from "@/pages/varricao-ordem-detalhe";
import VarricaoConfiguracoesPage from "@/pages/varricao-configuracoes";
import EncarregadoPage from "@/pages/encarregado";
import TransparenciaPage from "@/pages/transparencia";
import OrdemServicoPage from "@/pages/ordem-servico";
import CronogramaPage from "@/pages/cronograma";
import PublicCronogramaPage from "@/pages/public-cronograma";
import AuditoriaPage from "@/pages/auditoria";
import NotFound from "@/pages/not-found";
import { DemoBanner } from "@/components/DemoBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useModoVisualizacao } from "@/hooks/use-modo-visualizacao";
import { Loader2 } from "lucide-react";

function AuthenticatedRoutes() {
  const { user, isLoading } = useAuth();
  const modoVisualizacao = useModoVisualizacao();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Encarregado (terceirizada) vê apenas a tela de registro de fotos
  if (user.role === "encarregado") {
    return <EncarregadoPage />;
  }

  // Transparência (prefeito/presidente) vê apenas a galeria de fotos por serviço/data
  if (user.role === "transparencia") {
    return <TransparenciaPage />;
  }

  // Fiscal de contrato ("coordenador") não acessa direto pela URL o serviço
  // que não é dele fora do Modo Visualização — mesma regra que já esconde
  // esses itens do menu lateral.
  const contratoFiscal = user.role === "fiscal" ? (user.contrato ?? null) : null;
  const escondeRocagem = !!contratoFiscal && contratoFiscal === "varricao" && !modoVisualizacao;
  const escondeVarricao = !!contratoFiscal && contratoFiscal.startsWith("rocagem") && !modoVisualizacao;

  return (
    <>
      {user.role === "demo" && <DemoBanner />}
      <div style={user.role === "demo" ? { paddingTop: "2rem" } : undefined}>
        <Switch>
          <Route path="/">{() => <Dashboard />}</Route>
          <Route path="/relatorios" component={RelatoriosPage} />
          {!escondeRocagem && (
            <Route path="/relatorios/rocagens" component={RelatorioRocagensPage} />
          )}
          {!escondeRocagem && (
            <Route path="/ordem-servico" component={OrdemServicoPage} />
          )}
          {!escondeRocagem && (
            <Route path="/cronograma" component={CronogramaPage} />
          )}
          <Route path="/demandas" component={DemandasPage} />
          {!escondeVarricao && (
            <Route path="/varricao/locais" component={VarricaoLocaisPage} />
          )}
          {!escondeVarricao && (
            <Route path="/varricao/cobertura" component={VarricaoCoberturaPage} />
          )}
          {!escondeVarricao && (
            <Route path="/varricao/ordens/nova" component={VarricaoOrdemNovaPage} />
          )}
          {!escondeVarricao && (
            <Route path="/varricao/configuracoes" component={VarricaoConfiguracoesPage} />
          )}
          {!escondeVarricao && (
            <Route path="/varricao/ordens/:id" component={VarricaoOrdemDetalhePage} />
          )}
          {!escondeVarricao && (
            <Route path="/varricao/ordens" component={VarricaoOrdensPage} />
          )}
          {(user.role === "admin" || user.role === "gestor") && (
            <Route path="/configuracoes" component={ConfiguracoesPage} />
          )}
          {(user.role === "admin" || user.role === "gestor") && (
            <Route path="/setores" component={SetoresPage} />
          )}
          {user.role === "admin" && (
            <Route path="/usuarios" component={UserManagement} />
          )}
          {(user.role === "admin" || user.role === "gestor") && (
            <Route path="/auditoria" component={AuditoriaPage} />
          )}
          <Route component={NotFound} />
        </Switch>
      </div>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/publico" component={PublicDashboard} />
      <Route path="/public/cronograma/:lote" component={PublicCronogramaPage} />
      <Route>
        <AuthenticatedRoutes />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <ErrorBoundary>
              <Router />
            </ErrorBoundary>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
