import { Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ContentSpinner } from "@/components/ui/spinner";

/**
 * Wrapper padrão para páginas lazy-loaded.
 *
 * Reutilizado em todos os arquivos `*.routes.tsx` para garantir que cada rota
 * tenha seu próprio limite de Suspense + ErrorBoundary, evitando que uma
 * falha de carregamento derrube o shell inteiro (AppLayout).
 */
export function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<ContentSpinner label="Carregando página..." />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}