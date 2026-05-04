import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCanViewAdmin } from "@/hooks/useIsAdmin";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { AccessDenied } from "@/components/AccessDenied";
import { useAuthGate } from "@/hooks/useAuthGate";

export function AdminRoute({ children }: { children: ReactNode }) {
  const gate = useAuthGate();
  const { canView } = useCanViewAdmin();
  const location = useLocation();
  // Aceita override individual via `user_permissions` — alinha o guard com
  // `useVisibleNavSections`. Ações destrutivas dentro do /admin devem usar
  // `useIsAdmin` (estrito) ou `useCanHardDelete`.
  const canAccess = canView;

  if (gate.status === "loading") {
    return <AuthLoadingScreen mode="permissions" />;
  }
  if (gate.status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!canAccess) {
    return (
      <AccessDenied
        fullPage
        variant="route"
        title="Área administrativa"
        resourceLabel="Administração"
        permissionKey="administracao:visualizar"
        message="Esta seção é restrita a administradores. Solicite acesso ao responsável."
      />
    );
  }
  return <>{children}</>;
}
