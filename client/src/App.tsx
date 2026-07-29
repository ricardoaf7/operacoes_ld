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
import EncarregadoPage from "@/pages/encarregado";
import OrdemServicoPage from "@/pages/ordem-servico";
import CronogramaPage from "@/pages/cronograma";
import PublicCronogramaPage from "@/pages/public-cronograma";
import AuditoriaPage from "@/pages/auditoria";
import NotFound from "@/pages/not-found";
import { DemoBanner } from "@/components/DemoBanner";
import { Loader2 } from "lucide-react";

function AuthenticatedRoutes() {
  const { user, isLoading } = useAuth();

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

  return (
    <>
      {user.role === "demo" && <DemoBanner />}
      <div style={user.role === "demo" ? { paddingTop: "2rem" } : undefined}>
        <Switch>
          <Route path="/">{() => <Dashboard />}</Route>
          <Route path="/relatorios" component={RelatoriosPage} />
          <Route path="/relatorios/rocagens" component={RelatorioRocagensPage} />
          <Route path="/ordem-servico" component={OrdemServicoPage} />
          <Route path="/cronograma" component={CronogramaPage} />
          <Route path="/demandas" component={DemandasPage} />
          <Route path="/varricao/locais" component={VarricaoLocaisPage} />
          <Route path="/varricao/cobertura" component={VarricaoCoberturaPage} />
          <Route path="/varricao/ordens/nova" component={VarricaoOrdemNovaPage} />
          <Route path="/varricao/ordens/:id" component={VarricaoOrdemDetalhePage} />
          <Route path="/varricao/ordens" component={VarricaoOrdensPage} />
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
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
