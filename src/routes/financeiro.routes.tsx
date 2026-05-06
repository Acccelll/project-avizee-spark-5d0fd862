import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import { PermissionRoute } from "@/components/PermissionRoute";
import { LazyPage } from "./LazyPage";

const Financeiro = lazy(() => import("@/pages/Financeiro"));
const Budget = lazy(() => import("@/pages/Budget"));
const ContasBancarias = lazy(() => import("@/pages/ContasBancarias"));
const CartoesCredito = lazy(() => import("@/pages/CartoesCredito"));
const FluxoCaixa = lazy(() => import("@/pages/FluxoCaixa"));
const ContasContabeis = lazy(() => import("@/pages/ContasContabeis"));
const Conciliacao = lazy(() => import("@/pages/Conciliacao"));

/**
 * Rotas do módulo Financeiro (Financeiro, Budget, Contas, Fluxo de caixa,
 * Plano de contas e Conciliação bancária). Estáticas vêm antes de `/:id`
 * por clareza de leitura — o React Router já prioriza por especificidade.
 */
export const financeiroRoutes = (
  <>
    <Route path="/financeiro" element={<PermissionRoute resource="financeiro"><LazyPage><Financeiro /></LazyPage></PermissionRoute>} />
    <Route path="/financeiro/budget" element={<PermissionRoute resource="financeiro"><LazyPage><Budget /></LazyPage></PermissionRoute>} />
    <Route path="/financeiro/:id" element={<PermissionRoute resource="financeiro"><LazyPage><Financeiro /></LazyPage></PermissionRoute>} />
    <Route path="/contas-bancarias" element={<PermissionRoute resource="financeiro"><LazyPage><ContasBancarias /></LazyPage></PermissionRoute>} />
    <Route path="/cartoes-credito" element={<PermissionRoute resource="financeiro"><LazyPage><CartoesCredito /></LazyPage></PermissionRoute>} />
    <Route path="/fluxo-caixa" element={<PermissionRoute resource="financeiro"><LazyPage><FluxoCaixa /></LazyPage></PermissionRoute>} />
    <Route path="/caixa" element={<Navigate to="/financeiro" replace />} />
    <Route path="/contas-contabeis-plano" element={<PermissionRoute resource="financeiro"><LazyPage><ContasContabeis /></LazyPage></PermissionRoute>} />
    <Route path="/conciliacao" element={<PermissionRoute resource="financeiro"><LazyPage><Conciliacao /></LazyPage></PermissionRoute>} />
  </>
);