import { lazy } from "react";
import { Route } from "react-router-dom";
import { LazyPage } from "./LazyPage";

const OrcamentoPublico = lazy(() => import("@/pages/OrcamentoPublico"));
const Unsubscribe = lazy(() => import("@/pages/Unsubscribe"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AuthConfirm = lazy(() => import("@/pages/AuthConfirm"));

/**
 * Rotas públicas (não autenticadas) — login, signup, recuperação,
 * confirmação de e-mail, orçamento público compartilhável e unsubscribe.
 * Renderizadas fora do `AppLayout`.
 */
export const publicRoutes = (
  <>
    <Route path="/orcamento-publico" element={<LazyPage><OrcamentoPublico /></LazyPage>} />
    <Route path="/email-unsubscribe" element={<LazyPage><Unsubscribe /></LazyPage>} />
    <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
    <Route path="/signup" element={<LazyPage><Signup /></LazyPage>} />
    <Route path="/forgot-password" element={<LazyPage><ForgotPassword /></LazyPage>} />
    <Route path="/reset-password" element={<LazyPage><ResetPassword /></LazyPage>} />
    <Route path="/auth/confirm" element={<LazyPage><AuthConfirm /></LazyPage>} />
  </>
);