import { ReactNode } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { AccessDenied } from "@/components/AccessDenied";

interface Props {
  children: ReactNode;
  /** Rótulo da seção exibido na mensagem de acesso negado. */
  resourceLabel?: string;
}

/**
 * `RequireStrictAdmin` — gate interno para seções sob `/administracao`
 * que executam escrita global em `app_configuracoes`/`empresa_config` ou
 * outras ações sensíveis.
 *
 * Por que existe: `AdminRoute` aceita o override `administracao:visualizar`
 * (delegação de visualização). Sem este wrapper, qualquer usuário com esse
 * override poderia salvar política de backup, dados da empresa, etc. — RLS
 * é a defesa real, mas a UI deve refletir o privilégio efetivo.
 */
export function RequireStrictAdmin({ children, resourceLabel }: Props) {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) return <AuthLoadingScreen mode="permissions" />;
  if (!isAdmin) {
    return (
      <AccessDenied
        variant="action"
        title="Requer administrador"
        resourceLabel={resourceLabel}
        permissionKey="role:admin"
        message={
          resourceLabel
            ? `Apenas administradores podem alterar ${resourceLabel}.`
            : "Apenas administradores podem acessar esta seção."
        }
      />
    );
  }
  return <>{children}</>;
}