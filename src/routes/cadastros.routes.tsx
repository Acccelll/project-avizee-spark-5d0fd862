import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import { PermissionRoute } from "@/components/PermissionRoute";
import { LazyPage } from "./LazyPage";

const Produtos = lazy(() => import("@/pages/Produtos"));
const Clientes = lazy(() => import("@/pages/Clientes"));
const GruposEconomicos = lazy(() => import("@/pages/GruposEconomicos"));
const Fornecedores = lazy(() => import("@/pages/Fornecedores"));
const Transportadoras = lazy(() => import("@/pages/Transportadoras"));
const FormasPagamento = lazy(() => import("@/pages/FormasPagamento"));
const Funcionarios = lazy(() => import("@/pages/Funcionarios"));
const Socios = lazy(() => import("@/pages/Socios"));

/**
 * Cadastros básicos — entidades reutilizadas pelos demais módulos
 * (produtos, clientes/grupos, fornecedores, transportadoras, formas de
 * pagamento, funcionários, sócios). Inclui redirects de rotas removidas
 * (`/unidades-medida` foi consolidada dentro de `/produtos`) e o alias
 * legado `/socios-participacoes` que abre a aba específica em /socios.
 */
export const cadastrosRoutes = (
  <>
    <Route path="/produtos" element={<PermissionRoute resource="produtos"><LazyPage><Produtos /></LazyPage></PermissionRoute>} />
    {/* Rotas legadas: agora abrem o ProdutoFormModal dentro de /produtos
        via query string (?new=1, ?editId=:id). Preserva deep-links. */}
    <Route path="/produtos/novo" element={<Navigate to="/produtos?new=1" replace />} />
    <Route path="/produtos/:id/editar" element={<RedirectToProdutoEdit />} />
    <Route path="/clientes" element={<PermissionRoute resource="clientes"><LazyPage><Clientes /></LazyPage></PermissionRoute>} />
    <Route path="/fornecedores" element={<PermissionRoute resource="fornecedores"><LazyPage><Fornecedores /></LazyPage></PermissionRoute>} />
    <Route path="/transportadoras" element={<PermissionRoute resource="transportadoras"><LazyPage><Transportadoras /></LazyPage></PermissionRoute>} />
    <Route path="/formas-pagamento" element={<PermissionRoute resource="formas_pagamento"><LazyPage><FormasPagamento /></LazyPage></PermissionRoute>} />
    <Route path="/unidades-medida" element={<Navigate to="/produtos" replace />} />
    <Route path="/grupos-economicos" element={<PermissionRoute resource="clientes"><LazyPage><GruposEconomicos /></LazyPage></PermissionRoute>} />
    <Route path="/funcionarios" element={<PermissionRoute resource="usuarios"><LazyPage><Funcionarios /></LazyPage></PermissionRoute>} />
    <Route path="/socios" element={<PermissionRoute resource="socios"><LazyPage><Socios /></LazyPage></PermissionRoute>} />
    <Route path="/socios-participacoes" element={<PermissionRoute resource="socios"><Navigate to="/socios?tab=participacoes" replace /></PermissionRoute>} />
  </>
);