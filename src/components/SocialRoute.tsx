import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getSocialPermissionFlags } from '@/types/social';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { AccessDenied } from '@/components/AccessDenied';
import { useAuthGate } from '@/hooks/useAuthGate';
import { EmBreve } from '@/components/EmBreve';

export function SocialRoute({ children }: { children: ReactNode }) {
  const gate = useAuthGate();
  const { roles, extraPermissions, deniedPermissions } = useAuth();
  const location = useLocation();

  // Feature flag desligada → módulo Social inteiro é tratado como "Em breve",
  // mesmo que o usuário tenha permissão concedida no banco. Mantém paridade com
  // o item da sidebar (que já fica disabled quando VITE_FEATURE_SOCIAL !== 'true').
  if (import.meta.env.VITE_FEATURE_SOCIAL !== 'true') {
    return <EmBreve modulo="Social" descricao="O módulo Social estará disponível em breve." />;
  }

  if (gate.status === 'loading') {
    return <AuthLoadingScreen mode="permissions" />;
  }
  if (gate.status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const permissions = getSocialPermissionFlags(roles, extraPermissions, deniedPermissions);
  if (!permissions.canViewModule) {
    return (
      <AccessDenied
        fullPage
        variant="route"
        title="Módulo Social"
        resourceLabel="Social"
        permissionKey="social:visualizar"
      />
    );
  }

  return <>{children}</>;
}
