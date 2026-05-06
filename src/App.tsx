import { lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppConfigProvider } from "@/contexts/AppConfigContext";
import { RelationalNavigationProvider } from "@/contexts/RelationalNavigationContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { RemoteUiPreferencesHydrator } from "@/components/theme/RemoteUiPreferencesHydrator";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { InstallPwaButton } from "@/components/InstallPwaButton";
import { AppLayout } from "@/components/AppLayout";
import { SessionExpiryWarning } from "@/components/auth/SessionExpiryWarning";
import { LazyPage } from "@/routes/LazyPage";
import { publicRoutes } from "@/routes/public.routes";
import { fiscalRoutes } from "@/routes/fiscal.routes";
import { financeiroRoutes } from "@/routes/financeiro.routes";
import { comercialRoutes } from "@/routes/comercial.routes";
import { cadastrosRoutes } from "@/routes/cadastros.routes";
import { adminRoutes } from "@/routes/admin.routes";
import { diversosRoutes } from "@/routes/diversos.routes";

// Catch-all global precisa de import direto pois é referenciado fora do shell.
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <AppConfigProvider>
              <RelationalNavigationProvider>
                <TooltipProvider>
                  <Sonner />
                  <OfflineBanner />
                  <PwaUpdatePrompt />
                  <InstallPwaButton />
                  <SessionExpiryWarning />
                  <RemoteUiPreferencesHydrator />
                  {/*
                    Composição de rotas modular — cada módulo declara suas
                    rotas em `src/routes/*.routes.tsx`, mantendo App.tsx
                    legível e isolando lazy imports + guards por domínio.
                  */}
                  <Routes>
                    {publicRoutes}
                    <Route element={<AppLayout />}>
                      {cadastrosRoutes}
                      {comercialRoutes}
                      {fiscalRoutes}
                      {financeiroRoutes}
                      {adminRoutes}
                      {diversosRoutes}
                    </Route>
                    <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
                  </Routes>
                </TooltipProvider>
              </RelationalNavigationProvider>
            </AppConfigProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
