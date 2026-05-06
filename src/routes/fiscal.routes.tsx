import { lazy } from "react";
import { Route } from "react-router-dom";
import { PermissionRoute } from "@/components/PermissionRoute";
import { LazyPage } from "./LazyPage";

const Fiscal = lazy(() => import("@/pages/Fiscal"));
const FiscalDetail = lazy(() => import("@/pages/FiscalDetail"));
const NotaFiscalForm = lazy(() => import("@/pages/fiscal/NotaFiscalForm"));
const DistDFeHistorico = lazy(() => import("@/pages/fiscal/DistDFeHistorico"));
const FiscalDashboard = lazy(() => import("@/pages/fiscal/FiscalDashboard"));
const FiscalShell = lazy(() =>
  import("@/components/fiscal/FiscalShell").then((m) => ({ default: m.FiscalShell })),
);
const EmBreve = lazy(() =>
  import("@/components/EmBreve").then((m) => ({ default: m.EmBreve })),
);

/**
 * Bloco Fiscal — todas as rotas /fiscal/* compartilham o `FiscalShell`,
 * que monta hooks de domínio fiscal (toasts e auto-ciência DistDF-e)
 * apenas para usuários presentes neste subtree. Estáticas precedem
 * a dinâmica /:id por clareza visual.
 *
 * Bloco Faturamento (em breve) está incluído aqui por proximidade
 * funcional (NF-e, cadastros fiscais).
 */
export const fiscalRoutes = (
  <>
    <Route element={<LazyPage><FiscalShell /></LazyPage>}>
      <Route path="/fiscal" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><Fiscal /></LazyPage></PermissionRoute>} />
      <Route path="/fiscal/novo" element={<PermissionRoute resource="faturamento_fiscal" action="editar"><LazyPage><NotaFiscalForm /></LazyPage></PermissionRoute>} />
      <Route path="/fiscal/dashboard" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><FiscalDashboard /></LazyPage></PermissionRoute>} />
      <Route path="/fiscal/distdfe-historico" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><DistDFeHistorico /></LazyPage></PermissionRoute>} />
      <Route path="/fiscal/:id/editar" element={<PermissionRoute resource="faturamento_fiscal" action="editar"><LazyPage><NotaFiscalForm /></LazyPage></PermissionRoute>} />
      <Route path="/fiscal/:id" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><FiscalDetail /></LazyPage></PermissionRoute>} />
    </Route>
    <Route path="/faturamento" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><EmBreve modulo="Faturamento" /></LazyPage></PermissionRoute>} />
    <Route path="/faturamento/cadastros" element={<PermissionRoute resource="faturamento_fiscal"><LazyPage><EmBreve modulo="Faturamento" descricao="Cadastros do módulo Faturamento estarão disponíveis em breve." /></LazyPage></PermissionRoute>} />
    <Route path="/faturamento/emitir" element={<PermissionRoute resource="faturamento_fiscal" action="criar"><LazyPage><EmBreve modulo="Faturamento" descricao="Emissão de NF-e pelo wizard estará disponível em breve." /></LazyPage></PermissionRoute>} />
  </>
);