import { lazy } from "react";
import { Navigate, Route, useParams } from "react-router-dom";
import { PermissionRoute } from "@/components/PermissionRoute";
import { LazyPage } from "./LazyPage";

const Orcamentos = lazy(() => import("@/pages/Orcamentos"));
const OrcamentoForm = lazy(() => import("@/pages/OrcamentoForm"));
const Pedidos = lazy(() => import("@/pages/Pedidos"));
const PedidoForm = lazy(() => import("@/pages/PedidoForm"));
const CotacoesCompra = lazy(() => import("@/pages/CotacoesCompra"));
const CotacaoCompraForm = lazy(() => import("@/pages/CotacaoCompraForm"));
const PedidosCompra = lazy(() => import("@/pages/PedidosCompra"));
const PedidoCompraForm = lazy(() => import("@/pages/PedidoCompraForm"));
const Logistica = lazy(() => import("@/pages/Logistica"));
const RemessaForm = lazy(() => import("@/pages/RemessaForm"));
const Estoque = lazy(() => import("@/pages/Estoque"));

/**
 * Redirect que preserva o `:id` ao migrar `/cotacoes/:id` → `/orcamentos/:id`.
 * Mantido aqui para não vazar lógica de roteamento legado para `App.tsx`.
 */
function CotacaoIdRedirect() {
  const { id } = useParams();
  return <Navigate to={`/orcamentos/${id}`} replace />;
}

/**
 * Rotas do bloco comercial: Vendas (orçamentos/pedidos), Compras
 * (cotações/pedidos), Logística (remessas) e Estoque. Inclui aliases
 * legados (/cotacoes, /ordens-venda, /compras, /remessas) que apenas
 * redirecionam para as rotas canônicas.
 */
export const comercialRoutes = (
  <>
    {/* Compras */}
    <Route path="/compras" element={<Navigate to="/pedidos-compra" replace />} />
    <Route path="/cotacoes-compra" element={<PermissionRoute resource="compras"><LazyPage><CotacoesCompra /></LazyPage></PermissionRoute>} />
    <Route path="/cotacoes-compra/:id" element={<PermissionRoute resource="compras"><LazyPage><CotacaoCompraForm /></LazyPage></PermissionRoute>} />
    <Route path="/pedidos-compra" element={<PermissionRoute resource="compras"><LazyPage><PedidosCompra /></LazyPage></PermissionRoute>} />
    <Route path="/pedidos-compra/:id" element={<PermissionRoute resource="compras"><LazyPage><PedidoCompraForm /></LazyPage></PermissionRoute>} />

    {/* Logística */}
    <Route path="/logistica" element={<PermissionRoute resource="logistica"><LazyPage><Logistica /></LazyPage></PermissionRoute>} />
    <Route path="/remessas" element={<Navigate to="/logistica" replace />} />
    <Route path="/remessas/new" element={<PermissionRoute resource="logistica" action="editar"><LazyPage><RemessaForm /></LazyPage></PermissionRoute>} />
    <Route path="/remessas/:id" element={<PermissionRoute resource="logistica"><LazyPage><RemessaForm /></LazyPage></PermissionRoute>} />

    {/* Vendas — aliases legados de /cotacoes redirecionam para /orcamentos */}
    <Route path="/cotacoes" element={<Navigate to="/orcamentos" replace />} />
    <Route path="/cotacoes/novo" element={<Navigate to="/orcamentos/novo" replace />} />
    <Route path="/cotacoes/:id" element={<CotacaoIdRedirect />} />
    <Route path="/orcamentos" element={<PermissionRoute resource="orcamentos"><LazyPage><Orcamentos /></LazyPage></PermissionRoute>} />
    <Route path="/orcamentos/novo" element={<PermissionRoute resource="orcamentos" action="editar"><LazyPage><OrcamentoForm /></LazyPage></PermissionRoute>} />
    <Route path="/orcamentos/:id" element={<PermissionRoute resource="orcamentos"><LazyPage><OrcamentoForm /></LazyPage></PermissionRoute>} />
    <Route path="/ordens-venda" element={<Navigate to="/pedidos" replace />} />
    <Route path="/pedidos" element={<PermissionRoute resource="pedidos"><LazyPage><Pedidos /></LazyPage></PermissionRoute>} />
    <Route path="/pedidos/:id" element={<PermissionRoute resource="pedidos"><LazyPage><PedidoForm /></LazyPage></PermissionRoute>} />

    {/* Estoque */}
    <Route path="/estoque" element={<PermissionRoute resource="estoque"><LazyPage><Estoque /></LazyPage></PermissionRoute>} />
  </>
);