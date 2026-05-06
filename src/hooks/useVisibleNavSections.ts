import { useMemo } from 'react';
import { navSections, type NavSection, type NavSectionKey } from '@/lib/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/hooks/useCan';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getSocialPermissionFlags } from '@/types/social';
import type { ErpResource } from '@/lib/permissions';

/**
 * Maps each navSection to the ErpResources that grant access to it.
 * A section is visible when the user can `visualizar` ANY of its resources.
 * Typed against ErpResource so adding/removing a resource is a compile-time check.
 */
const sectionResourcesMap: Partial<Record<NavSectionKey, ErpResource[]>> = {
  cadastros: ['produtos', 'clientes', 'fornecedores', 'transportadoras', 'formas_pagamento', 'socios', 'usuarios'],
  comercial: ['orcamentos', 'pedidos'],
  compras: ['compras'],
  estoque: ['estoque', 'logistica'],
  financeiro: ['financeiro', 'socios'],
  fiscal: ['faturamento_fiscal'],
  relatorios: ['relatorios', 'workbook', 'apresentacao'],
  administracao: ['administracao', 'auditoria'],
  // social handled separately via socialPermissions flag
};

/**
 * Returns the navSections that should be visible to the current user.
 * Single source of truth used by AppSidebar, MobileMenu and MobileBottomNav
 * so desktop and mobile stay in lockstep on permissions.
 */
export function useVisibleNavSections(): NavSection[] {
  const { isAdmin } = useIsAdmin();
  const { roles, extraPermissions, deniedPermissions, permissionsLoaded } = useAuth();
  const { can } = useCan();
  const socialPermissions = useMemo(
    () => getSocialPermissionFlags(roles, extraPermissions, deniedPermissions),
    [roles, extraPermissions, deniedPermissions]
  );

  return useMemo(() => {
    // Admin section is visible for admins OR for users with explicit `administracao:visualizar` override.
    // Hoje só admin tem essa permissão na matriz canônica, então comportamento é equivalente para o caso comum;
    // overrides individuais via user_permissions agora também funcionam.
    const canSeeAdmin = isAdmin || can('administracao:visualizar');
    const withoutAdmin = canSeeAdmin ? navSections : navSections.filter((s) => s.key !== 'administracao');
    const hasRecognizedRoles = roles.length > 0;

    return withoutAdmin
      .filter((s) => socialPermissions.canViewModule || s.key !== 'social')
      .filter((s) => {
        const resources = sectionResourcesMap[s.key];
        if (!resources || resources.length === 0) return true;
        // Sem roles reconhecidos (estado legado/inconsistente): não expõe o menu inteiro.
        // Mantemos somente seções explicitamente permitidas por override.
        if (permissionsLoaded && !hasRecognizedRoles) {
          return resources.some((resource) => can(`${resource}:visualizar`));
        }
        return resources.some((resource) => can(`${resource}:visualizar`));
      })
      // A-01: itens admin-only dentro de seções visíveis devem ser ocultados
      // para usuários que têm `administracao:visualizar` mas não são admin —
      // a rota é guarded por `AdminRoute`, então o item iria gerar AccessDenied.
      .map((s) => {
        if (s.key !== 'administracao') return s;
        const filterAdminOnly = (path: string) => path !== '/admin/audit-duplicidades' || isAdmin;
        return {
          ...s,
          items: s.items.map((sub) => ({
            ...sub,
            items: sub.items.filter((leaf) => filterAdminOnly(leaf.path)),
          })).filter((sub) => sub.items.length > 0),
        };
      });
  }, [isAdmin, socialPermissions.canViewModule, can, roles, permissionsLoaded]);
}

/** Returns the set of visible section keys — useful for filtering bottom-nav tabs. */
export function useVisibleSectionKeys(): Set<string> {
  const sections = useVisibleNavSections();
  return useMemo(() => new Set(sections.map((s) => s.key)), [sections]);
}
