import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppConfigProvider } from "@/contexts/AppConfigContext";
import { RelationalNavigationProvider } from "@/contexts/RelationalNavigationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { PermissionRoute } from "@/components/PermissionRoute";
import { SocialRoute } from "@/components/SocialRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { RemoteUiPreferencesHydrator } from "@/components/theme/RemoteUiPreferencesHydrator";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { InstallPwaButton } from "@/components/InstallPwaButton";
import { AppLayout } from "@/components/AppLayout";
import { ContentSpinner } from "@/components/ui/spinner";
import { SessionExpiryWarning } from "@/components/auth/SessionExpiryWarning";

// Lazy-loaded pages
const Index = lazy(() => import("./pages/Index"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Clientes = lazy(() => import("./pages/Clientes"));
const GruposEconomicos = lazy(() => import("./pages/GruposEconomicos"));
const Fornecedores = lazy(() => import("./pages/Fornecedores"));
const Orcamentos = lazy(() => import("./pages/Orcamentos"));
const OrcamentoForm = lazy(() => import("./pages/OrcamentoForm"));

const Estoque = lazy(() => import("./pages/Estoque"));
const Fiscal = lazy(() => import("./pages/Fiscal"));
// @em-breve — módulo Faturamento desativado (estados visuais "Em breve").
// Imports preservados (comentados) para retomada futura sem reescrever rotas.
// const Faturamento = lazy(() => import("./pages/Faturamento"));
// const FaturamentoCadastros = lazy(() => import("./pages/faturamento/FaturamentoCadastros"));
// const EmitirNFeWizard = lazy(() => import("./pages/faturamento/EmitirNFeWizard"));
import { EmBreve } from "./components/EmBreve";
const FiscalDetail = lazy(() => import("./pages/FiscalDetail"));
const NotaFiscalForm = lazy(() => import("./pages/fiscal/NotaFiscalForm"));
const DistDFeHistorico = lazy(() => import("./pages/fiscal/DistDFeHistorico"));
const FiscalDashboard = lazy(() => import("./pages/fiscal/FiscalDashboard"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const ContasBancarias = lazy(() => import("./pages/ContasBancarias"));
const CartoesCredito = lazy(() => import("./pages/CartoesCredito"));
const AuditDuplicidades = lazy(() => import("./pages/admin/AuditDuplicidades"));
const FluxoCaixa = lazy(() => import("./pages/FluxoCaixa"));
const ContasContabeis = lazy(() => import("./pages/ContasContabeis"));
const Login = lazy(() => import("./pages/Login"));
const Pedidos = lazy(() => import("./pages/Pedidos"));
const PedidoForm = lazy(() => import("./pages/PedidoForm"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Administracao = lazy(() => import("./pages/Administracao"));
const MigracaoDados = lazy(() => import("./pages/MigracaoDados"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthConfirm = lazy(() => import("./pages/AuthConfirm"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Transportadoras = lazy(() => import("./pages/Transportadoras"));
const FormasPagamento = lazy(() => import("./pages/FormasPagamento"));
const CotacoesCompra = lazy(() => import("./pages/CotacoesCompra"));
const CotacaoCompraForm = lazy(() => import("./pages/CotacaoCompraForm"));
const PedidosCompra = lazy(() => import("./pages/PedidosCompra"));
const PedidoCompraForm = lazy(() => import("./pages/PedidoCompraForm"));
const Logistica = lazy(() => import("./pages/Logistica"));
const RemessaForm = lazy(() => import("./pages/RemessaForm"));
const Funcionarios = lazy(() => import("./pages/Funcionarios"));
const OrcamentoPublico = lazy(() => import("./pages/OrcamentoPublico"));
const Conciliacao = lazy(() => import("./pages/Conciliacao"));
const WorkbookGerencial = lazy(() => import("./pages/WorkbookGerencial"));
const Budget = lazy(() => import("./pages/Budget"));
const ApresentacaoGerencial = lazy(() => import("./pages/ApresentacaoGerencial"));
const Social = lazy(() => import("./pages/Social"));
const Socios = lazy(() => import("./pages/Socios"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const Ajuda = lazy(() => import("./pages/Ajuda"));

// Redirect component that properly maps :id param
function CotacaoIdRedirect() {
  const { id } = useParams();
  return <Navigate to={`/orcamentos/${id}`} replace />;
}

/**
 * Alias legado `/perfil` → `/configuracoes`.
 * Preserva `?tab=` e demais query params para que deep-links externos
 * (ex: `/perfil?tab=seguranca`) continuem funcionais sem chunk dedicado.
 */
function PerfilRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/configuracoes${search}`} replace />;
}

// Per-route Suspense wrapper — shows loading spinner only in the content area
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<ContentSpinner label="Carregando página..." />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

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
                  <Routes>
                    {/* Public / unauthenticated */}
                    <Route path="/orcamento-publico" element={<LazyPage><OrcamentoPublico /></LazyPage>} />
                    <Route path="/email-unsubscribe" element={<LazyPage><Unsubscribe /></LazyPage>} />
                    <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
                    <Route path="/signup" element={<LazyPage><Signup /></LazyPage>} />
                    <Route path="/forgot-password" element={<LazyPage><ForgotPassword /></LazyPage>} />
                    <Route path="/reset-password" element={<LazyPage><ResetPassword /></LazyPage>} />
                    <Route path="/auth/confirm" element={<LazyPage><AuthConfirm /></LazyPage>} />

                    {/* Authenticated app — shell renderizado uma única vez via Outlet */}
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<ProtectedRoute><LazyPage><Index /></LazyPage></ProtectedRoute>} />
                      <Route path="/produtos" element={<PermissionRoute resource="produtos"><LazyPage><Produtos /></LazyPage></PermissionRoute>} />
                      <Route path="/clientes" element={<PermissionRoute resource="clientes"><LazyPage><Clientes /></LazyPage></PermissionRoute>} />
                      <Route path="/fornecedores" element={<PermissionRoute resource="fornecedores"><LazyPage><Fornecedores /></LazyPage></PermissionRoute>} />
                      <Route path="/transportadoras" element={<PermissionRoute resource="transportadoras"><LazyPage><Transportadoras /></LazyPage></PermissionRoute>} />
                      <Route path="/formas-pagamento" element={<PermissionRoute resource="formas_pagamento"><LazyPage><FormasPagamento /></LazyPage></PermissionRoute>} />
                      <Route path="/unidades-medida" element={<Navigate to="/produtos" replace />} />
                      <Route path="/grupos-economicos" element={<PermissionRoute resource="clientes"><LazyPage><GruposEconomicos /></LazyPage></PermissionRoute>} />
                      <Route path="/funcionarios" element={<PermissionRoute resource="usuarios"><LazyPage><Funcionarios /></LazyPage></PermissionRoute>} />
                      <Route path="/compras" element={<Navigate to="/pedidos-compra" replace />} />
                      <Route path="/cotacoes-compra" element={<PermissionRoute resource="compras"><LazyPage><CotacoesCompra /></LazyPage></PermissionRoute>} />
                      <Route path="/cotacoes-compra/:id" element={<PermissionRoute resource="compras"><LazyPage><CotacaoCompraForm /></LazyPage></PermissionRoute>} />
                      <Route path="/pedidos-compra" element={<PermissionRoute resource="compras"><LazyPage><PedidosCompra /></LazyPage></PermissionRoute>} />
                      <Route path="/pedidos-compra/:id" element={<PermissionRoute resource="compras"><LazyPage><PedidoCompraForm /></LazyPage></PermissionRoute>} />
                      <Route path="/logistica" element={<PermissionRoute resource="logistica"><LazyPage><Logistica /></LazyPage></PermissionRoute>} />
                      <Route path="/remessas" element={<Navigate to="/logistica" replace />} />
                      <Route path="/remessas/new" element={<PermissionRoute resource="logistica" action="editar"><LazyPage><RemessaForm /></LazyPage></PermissionRoute>} />
                      <Route path="/remessas/:id" element={<PermissionRoute resource="logistica"><LazyPage><RemessaForm /></LazyPage></PermissionRoute>} />
                      <Route path="/cotacoes" element={<Navigate to="/orcamentos" replace />} />
                      <Route path="/cotacoes/novo" element={<Navigate to="/orcamentos/novo" replace />} />
                      <Route path="/cotacoes/:id" element={<CotacaoIdRedirect />} />
                      <Route path="/orcamentos" element={<PermissionRoute resource="orcamentos"><LazyPage><Orcamentos /></LazyPage></PermissionRoute>} />
                      <Route path="/orcamentos/novo" element={<PermissionRoute resource="orcamentos" action="editar"><LazyPage><OrcamentoForm /></LazyPage></PermissionRoute>} />
                      <Route path="/orcamentos/:id" element={<PermissionRoute resource="orcamentos"><LazyPage><OrcamentoForm /></LazyPage></PermissionRoute>} />
                      <Route path="/ordens-venda" element={<Navigate to="/pedidos" replace />} />
                      <Route path="/pedidos" element={<PermissionRoute resource="pedidos"><LazyPage><Pedidos /></LazyPage></PermissionRoute>} />
                      <Route path="/pedidos/:id" element={<PermissionRoute resource="pedidos"><LazyPage><PedidoForm /></LazyPage></PermissionRoute>} />
                      <Route path="/estoque" element={<PermissionRoute resource="estoque"><LazyPage><Estoque /></LazyPage></PermissionRoute>} />
                      <Route path="/fiscal" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><Fiscal /></LazyPage></PermissionRoute>} />
                      <Route path="/faturamento" element={<PermissionRoute resource="faturamento_fiscal"><EmBreve modulo="Faturamento" /></PermissionRoute>} />
                      <Route path="/faturamento/cadastros" element={<PermissionRoute resource="faturamento_fiscal"><EmBreve modulo="Faturamento" descricao="Cadastros do módulo Faturamento estarão disponíveis em breve." /></PermissionRoute>} />
                      <Route path="/faturamento/emitir" element={<PermissionRoute resource="faturamento_fiscal" action="criar"><EmBreve modulo="Faturamento" descricao="Emissão de NF-e pelo wizard estará disponível em breve." /></PermissionRoute>} />
                      <Route path="/fiscal/novo" element={<PermissionRoute resource="faturamento_fiscal" action="editar"><LazyPage><NotaFiscalForm /></LazyPage></PermissionRoute>} />
                      <Route path="/fiscal/:id/editar" element={<PermissionRoute resource="faturamento_fiscal" action="editar"><LazyPage><NotaFiscalForm /></LazyPage></PermissionRoute>} />
                      <Route path="/fiscal/:id" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><FiscalDetail /></LazyPage></PermissionRoute>} />
                      <Route path="/fiscal/distdfe-historico" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><DistDFeHistorico /></LazyPage></PermissionRoute>} />
                      <Route path="/fiscal/dashboard" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><FiscalDashboard /></LazyPage></PermissionRoute>} />
                      <Route path="/financeiro" element={<PermissionRoute resource="financeiro"><LazyPage><Financeiro /></LazyPage></PermissionRoute>} />
                      <Route path="/financeiro/:id" element={<PermissionRoute resource="financeiro"><LazyPage><Financeiro /></LazyPage></PermissionRoute>} />
                      <Route path="/contas-bancarias" element={<PermissionRoute resource="financeiro"><LazyPage><ContasBancarias /></LazyPage></PermissionRoute>} />
                      <Route path="/cartoes-credito" element={<PermissionRoute resource="financeiro"><LazyPage><CartoesCredito /></LazyPage></PermissionRoute>} />
                      <Route path="/admin/audit-duplicidades" element={<AdminRoute><LazyPage><AuditDuplicidades /></LazyPage></AdminRoute>} />
                      <Route path="/fluxo-caixa" element={<PermissionRoute resource="financeiro"><LazyPage><FluxoCaixa /></LazyPage></PermissionRoute>} />
                      <Route path="/caixa" element={<Navigate to="/financeiro" replace />} />
                      <Route path="/relatorios" element={<PermissionRoute resource="relatorios"><LazyPage><Relatorios /></LazyPage></PermissionRoute>} />
                      <Route path="/configuracoes" element={<ProtectedRoute><LazyPage><Configuracoes /></LazyPage></ProtectedRoute>} />
                      <Route path="/administracao" element={<AdminRoute><LazyPage><Administracao /></LazyPage></AdminRoute>} />
                      <Route path="/migracao-dados" element={<AdminRoute><LazyPage><MigracaoDados /></LazyPage></AdminRoute>} />
                      <Route path="/auditoria" element={<PermissionRoute resource="auditoria"><LazyPage><Auditoria /></LazyPage></PermissionRoute>} />
                      {/* /perfil é alias legado: redireciona preservando ?tab= para a tela canônica /configuracoes */}
                      <Route path="/perfil" element={<PerfilRedirect />} />
                      <Route path="/contas-contabeis-plano" element={<PermissionRoute resource="financeiro"><LazyPage><ContasContabeis /></LazyPage></PermissionRoute>} />
                      <Route path="/conciliacao" element={<PermissionRoute resource="financeiro"><LazyPage><Conciliacao /></LazyPage></PermissionRoute>} />
                      <Route path="/relatorios/workbook-gerencial" element={<PermissionRoute resource="workbook"><LazyPage><WorkbookGerencial /></LazyPage></PermissionRoute>} />
                      <Route path="/financeiro/budget" element={<PermissionRoute resource="financeiro"><LazyPage><Budget /></LazyPage></PermissionRoute>} />
                      <Route path="/relatorios/apresentacao-gerencial" element={<PermissionRoute resource="apresentacao"><LazyPage><ApresentacaoGerencial /></LazyPage></PermissionRoute>} />
                      <Route path="/social" element={<SocialRoute><LazyPage><Social /></LazyPage></SocialRoute>} />
                      <Route path="/socios" element={<PermissionRoute resource="socios"><LazyPage><Socios /></LazyPage></PermissionRoute>} />
                      {/* Alias legado: redireciona preservando deep-links externos para a aba de Participações dentro de /socios */}
                      <Route path="/socios-participacoes" element={<PermissionRoute resource="socios"><Navigate to="/socios?tab=participacoes" replace /></PermissionRoute>} />
                      {/* Central de ajuda — disponível para qualquer usuário autenticado */}
                      <Route path="/ajuda" element={<ProtectedRoute><LazyPage><Ajuda /></LazyPage></ProtectedRoute>} />
                      {/* Catch-all dentro do shell — preserva sidebar/header em rotas inválidas */}
                      <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
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
