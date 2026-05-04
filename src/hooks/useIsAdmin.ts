import { useAuth } from "@/contexts/AuthContext";
import { useCan } from "@/hooks/useCan";

/**
 * `useIsAdmin` — papel ADMIN real (estrito).
 *
 * Use para gates de funcionalidade sensível (ex.: ações em ContasBancarias,
 * MigracaoDados, etc.). Não aceita `administracao:visualizar` como atalho.
 *
 * Para gates de navegação/rota (Sidebar e AdminRoute), use
 * `useCanViewAdmin`, que aceita o override individual.
 */
export function useIsAdmin() {
  const { hasRole, loading, permissionsLoaded } = useAuth();
  const isAdmin = hasRole("admin");
  return { isAdmin, loading: loading || !permissionsLoaded };
}

/**
 * `useCanViewAdmin` — admin real OU permissão `administracao:visualizar`.
 *
 * Use apenas para liberar visualização de áreas administrativas
 * (rota /admin, item de menu). Nunca para ações destrutivas.
 */
export function useCanViewAdmin() {
  const { hasRole, loading, permissionsLoaded } = useAuth();
  const { can } = useCan();
  const canView = hasRole("admin") || can("administracao:visualizar");
  return { canView, loading: loading || !permissionsLoaded };
}
