import { lazy } from "react";
import { Navigate, Route, useLocation } from "react-router-dom";
import { PermissionRoute } from "@/components/PermissionRoute";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SocialRoute } from "@/components/SocialRoute";
import { LazyPage } from "./LazyPage";

const Index = lazy(() => import("@/pages/Index"));
const Relatorios = lazy(() => import("@/pages/Relatorios"));
const WorkbookGerencial = lazy(() => import("@/pages/WorkbookGerencial"));
const ApresentacaoGerencial = lazy(() => import("@/pages/ApresentacaoGerencial"));
const Configuracoes = lazy(() => import("@/pages/Configuracoes"));
const Social = lazy(() => import("@/pages/Social"));
const Ajuda = lazy(() => import("@/pages/Ajuda"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/**
 * Alias legado `/perfil` → `/configuracoes`.
 * Preserva `?tab=` e demais query params para que deep-links externos
 * (ex.: `/perfil?tab=seguranca`) continuem funcionais sem chunk dedicado.
 */
function PerfilRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/configuracoes${search}`} replace />;
}

/**
 * Rotas transversais que não pertencem a um único módulo: home, relatórios
 * gerenciais (workbook, apresentação), configurações pessoais, social,
 * central de ajuda e o catch-all dentro do shell.
 */
export const diversosRoutes = (
  <>
    <Route path="/" element={<ProtectedRoute><LazyPage><Index /></LazyPage></ProtectedRoute>} />
    <Route path="/relatorios" element={<PermissionRoute resource="relatorios"><LazyPage><Relatorios /></LazyPage></PermissionRoute>} />
    <Route path="/relatorios/workbook-gerencial" element={<PermissionRoute resource="workbook"><LazyPage><WorkbookGerencial /></LazyPage></PermissionRoute>} />
    <Route path="/relatorios/apresentacao-gerencial" element={<PermissionRoute resource="apresentacao"><LazyPage><ApresentacaoGerencial /></LazyPage></PermissionRoute>} />
    <Route path="/configuracoes" element={<ProtectedRoute><LazyPage><Configuracoes /></LazyPage></ProtectedRoute>} />
    {/* /perfil é alias legado: redireciona preservando ?tab= para a tela canônica /configuracoes */}
    <Route path="/perfil" element={<PerfilRedirect />} />
    <Route path="/social" element={<SocialRoute><LazyPage><Social /></LazyPage></SocialRoute>} />
    {/* Central de ajuda — disponível para qualquer usuário autenticado */}
    <Route path="/ajuda" element={<ProtectedRoute><LazyPage><Ajuda /></LazyPage></ProtectedRoute>} />
    {/* Catch-all dentro do shell — preserva sidebar/header em rotas inválidas */}
    <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
  </>
);