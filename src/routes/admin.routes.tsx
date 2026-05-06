import { lazy } from "react";
import { Route } from "react-router-dom";
import { PermissionRoute } from "@/components/PermissionRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { LazyPage } from "./LazyPage";

const Administracao = lazy(() => import("@/pages/Administracao"));
const MigracaoDados = lazy(() => import("@/pages/MigracaoDados"));
const Auditoria = lazy(() => import("@/pages/Auditoria"));
const AuditDuplicidades = lazy(() => import("@/pages/admin/AuditDuplicidades"));

/**
 * Rotas de administração restritas. /admin/audit-duplicidades usa
 * `PermissionRoute resource="administracao"` para alinhar com o item
 * exibido na sidebar (antes usava AdminRoute estrito e divergia do nav).
 */
export const adminRoutes = (
  <>
    <Route path="/admin/audit-duplicidades" element={<PermissionRoute resource="administracao"><LazyPage><AuditDuplicidades /></LazyPage></PermissionRoute>} />
    <Route path="/administracao" element={<AdminRoute><LazyPage><Administracao /></LazyPage></AdminRoute>} />
    <Route path="/migracao-dados" element={<AdminRoute><LazyPage><MigracaoDados /></LazyPage></AdminRoute>} />
    <Route path="/auditoria" element={<PermissionRoute resource="auditoria"><LazyPage><Auditoria /></LazyPage></PermissionRoute>} />
  </>
);