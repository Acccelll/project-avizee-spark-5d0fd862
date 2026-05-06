import { Suspense } from "react";
import { useLocation } from "react-router-dom";
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
  // Variante `inline` preserva sidebar/header (que vivem fora do <Outlet />),
  // mostrando o fallback apenas dentro do `<main>`. resetKeys=[pathname]
  // limpa o estado de erro automaticamente quando o usuário navega.
  const location = useLocation();
  return (
    <ErrorBoundary variant="inline" resetKeys={[location.pathname]}>
      <Suspense fallback={<ContentSpinner label="Carregando página..." />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}