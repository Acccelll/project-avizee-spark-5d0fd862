import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /**
   * 'page' (default): fallback ocupa min-h-screen — uso em boundaries externos
   * antes do shell.
   * 'inline': fallback compacto que preserva sidebar/header — uso dentro do
   * AppLayout / `<main>`, evitando que erros de página derrubem o shell.
   */
  variant?: "page" | "inline";
  /** Reseta o estado de erro quando alguma das chaves muda (ex.: pathname). */
  resetKeys?: ReadonlyArray<unknown>;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  componentDidUpdate(prevProps: Props) {
    if (!this.state.hasError) return;
    const prev = prevProps.resetKeys ?? [];
    const curr = this.props.resetKeys ?? [];
    if (prev.length !== curr.length || prev.some((k, i) => k !== curr[i])) {
      this.setState({ hasError: false, error: null });
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    // Hook opcional para integração futura com telemetria (Sentry/Datadog).
    // Quem quiser instrumentar define `window.__avizeeReportError` no bootstrap;
    // mantemos sem dependência de SDK por padrão para não inflar o bundle.
    try {
      const reporter = (globalThis as { __avizeeReportError?: (err: Error, info: ErrorInfo) => void }).__avizeeReportError;
      reporter?.(error, errorInfo);
    } catch {
      /* noop — telemetria nunca deve quebrar o fallback */
    }
  }

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      const errorMessage = this.state.error?.message ?? "";
      const handleCopyDetails = () => {
        if (this.state.error) {
          void navigator.clipboard
            ?.writeText(`${this.state.error.name}: ${errorMessage}\n${this.state.error.stack ?? ""}`)
            .catch(() => {});
        }
      };
      const variant = this.props.variant ?? "page";
      const containerClass =
        variant === "inline"
          ? "flex items-center justify-center bg-background p-6 py-16"
          : "min-h-screen flex items-center justify-center bg-background p-6";
      const handleReset = () => this.setState({ hasError: false, error: null });
      return (
        <div className={containerClass} role="alert">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Algo deu errado</h1>
              <p className="text-muted-foreground text-sm">
                Ocorreu um erro inesperado nesta área. Tente novamente ou volte ao Dashboard.
              </p>
            </div>
            {this.state.error && isDev && (
              <pre className="text-xs text-left bg-muted rounded-md p-3 overflow-auto max-h-32 text-muted-foreground">
                {errorMessage}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <Button
                onClick={variant === "inline" ? handleReset : () => window.location.reload()}
                variant="default"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {variant === "inline" ? "Tentar novamente" : "Recarregar"}
              </Button>
              <Button onClick={() => (window.location.href = "/")} variant="outline">
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              {this.state.error && (
                <Button onClick={handleCopyDetails} variant="ghost" size="sm">
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar detalhes
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
