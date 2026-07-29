import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Rede de segurança: sem isto, qualquer erro de renderização em qualquer
// tela derruba o app inteiro para uma página em branco (comportamento padrão
// do React quando não há um limite de erro capturando a exceção).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro não tratado na interface:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-sm text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <h1 className="font-semibold">Algo deu errado nesta tela</h1>
            <p className="text-sm text-muted-foreground">
              Um erro inesperado impediu esta página de carregar. Tente recarregar —
              se persistir, avise o suporte.
            </p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              onClick={() => window.location.reload()}
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
