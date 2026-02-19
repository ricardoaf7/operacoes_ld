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
import NotFound from "@/pages/not-found";
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

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/relatorios" component={RelatoriosPage} />
      <Route path="/relatorios/rocagens" component={RelatorioRocagensPage} />
      {user.role === "admin" && (
        <Route path="/usuarios" component={UserManagement} />
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/publico" component={PublicDashboard} />
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
