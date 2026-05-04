import { useAuth } from "@/contexts/AuthContext";

/**
 * Gate estrito para ações DESTRUTIVAS irreversíveis (hard delete).
 *
 * Diferente de `useIsAdmin` (que aceita `administracao:visualizar` para
 * conceder acesso às telas administrativas), este hook só libera quando o
 * usuário possui efetivamente o papel `admin`. A RPC `hard_delete_record`
 * faz a mesma validação no servidor (`has_role(uid, 'admin')`); este hook
 * apenas evita expor botões/dialogs de exclusão definitiva para perfis
 * que não conseguiriam concluir a ação.
 */
export function useCanHardDelete() {
  const { hasRole, loading, permissionsLoaded } = useAuth();
  const canHardDelete = hasRole("admin");
  return { canHardDelete, loading: loading || !permissionsLoaded };
}