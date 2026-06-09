import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface Props {
  children: ReactNode;
  /** Muda quando a rota muda; usado pra sair do estado de erro ao navegar. */
  locationKey?: string;
}
interface State {
  hasError: boolean;
}

/**
 * Rede de segurança global: captura erros de render de QUALQUER componente e
 * mostra um fallback amigável, em vez de derrubar a árvore React inteira (que
 * deixava a tela 100% na cor de fundo, sem header — parecia "site fora").
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Fica no console pra diagnóstico (não quebra nada).
    console.error("[ErrorBoundary] crash capturado:", error, info);
  }

  componentDidUpdate(prevProps: Props) {
    // Ao navegar pra outra rota, sai do erro (a nova tela pode estar OK).
    if (this.state.hasError && prevProps.locationKey !== this.props.locationKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center text-3xl">
              😕
            </div>
            <h1 className="text-xl font-semibold text-foreground">Algo deu errado nesta tela</h1>
            <p className="text-sm text-muted-foreground">
              Tivemos um erro inesperado ao carregar esta página. O resto da plataforma continua
              funcionando — tente de novo ou volte ao início.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => this.setState({ hasError: false })}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Tentar de novo
              </button>
              <button
                onClick={() => { window.location.href = "/admin"; }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
              >
                Ir para o início
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Wrapper que injeta a rota atual, pra resetar o erro automaticamente ao navegar. */
export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary locationKey={location.pathname}>{children}</ErrorBoundary>;
}
