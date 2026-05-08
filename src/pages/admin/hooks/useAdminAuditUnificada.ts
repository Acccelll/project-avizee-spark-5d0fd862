/**
 * useAdminAuditUnificada — consulta a view `v_admin_audit_unified` (UNION de
 * `permission_audit` + `auditoria_logs` filtrada para tabelas administrativas).
 *
 * Esta hook é o ponto único de leitura para a aba Auditoria do módulo Admin.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Criticality } from "@/lib/audit/metadata";

// Espelha as listas de `getCriticality` em `@/lib/audit/metadata` para
// permitir o filtro server-side por criticidade. Mantenha sincronizado
// — há um teste rápido em `src/lib/audit/__tests__` (criar se necessário).
const HIGH_ACOES = [
  "DELETE",
  "role_grant",
  "role_revoke",
  "role_update",
  "permission_grant",
  "permission_revoke",
  "permission_update",
];
const MEDIUM_ACOES = ["UPDATE", "config_update", "branding_update", "logo_upload"];
const SENSITIVE_ENTIDADES = [
  "user_roles",
  "user_permissions",
  "profiles",
  "empresa_config",
  "app_configuracoes",
  "notas_fiscais",
  "financeiro_lancamentos",
  "financeiro_baixas",
];

const csv = (xs: string[]) => `(${xs.map((x) => `"${x}"`).join(",")})`;

export type AdminAuditRow =
  Database["public"]["Views"]["v_admin_audit_unified"]["Row"];

export interface AdminAuditFilters {
  /** ISO-8601 — filtro server-side `gte created_at` */
  dateFrom?: string | null;
  origem?: "permission_audit" | "auditoria_logs" | null;
  tipoAcao?: string | null;
  entidade?: string | null;
  atorId?: string | null;
  targetUserId?: string | null;
  ipAddress?: string | null;
  registroId?: string | null;
  /** "todas" | "alta" | "media" | "baixa" — filtro server-side derivado. */
  criticidade?: Criticality | "todas" | null;
  /** Página 1-based */
  page?: number;
  pageSize?: number;
}

export const ADMIN_AUDIT_PAGE_SIZE = 50;

/**
 * Hook React Query que lê `v_admin_audit_unified` com filtros server-side,
 * paginação por range e contagem exata.
 */
export function useAdminAuditUnificada(filtros: AdminAuditFilters = {}) {
  const page = filtros.page ?? 1;
  const pageSize = filtros.pageSize ?? ADMIN_AUDIT_PAGE_SIZE;

  const query = useQuery({
    queryKey: ["admin", "audit-unificada", filtros] as const,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("v_admin_audit_unified")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filtros.dateFrom) q = q.gte("created_at", filtros.dateFrom);
      if (filtros.origem) q = q.eq("origem", filtros.origem);
      if (filtros.tipoAcao) q = q.eq("tipo_acao", filtros.tipoAcao);
      if (filtros.entidade) q = q.eq("entidade", filtros.entidade);
      if (filtros.atorId) q = q.eq("ator_id", filtros.atorId);
      if (filtros.targetUserId) q = q.eq("target_user_id", filtros.targetUserId);
      if (filtros.ipAddress) q = q.eq("ip_address", filtros.ipAddress);
      if (filtros.registroId) q = q.eq("entidade_id", filtros.registroId);

      // Criticidade derivada — replica a lógica de `getCriticality` no servidor.
      const crit = filtros.criticidade && filtros.criticidade !== "todas" ? filtros.criticidade : null;
      if (crit === "alta") {
        q = q.or(`tipo_acao.in.${csv(HIGH_ACOES)},entidade.in.${csv(SENSITIVE_ENTIDADES)}`);
      } else if (crit === "media") {
        // Tipo médio E não cai em alta (ações médias não intersectam altas;
        // basta garantir que a entidade não seja sensível).
        q = q
          .in("tipo_acao", MEDIUM_ACOES)
          .not("entidade", "in", csv(SENSITIVE_ENTIDADES));
      } else if (crit === "baixa") {
        q = q
          .not("tipo_acao", "in", csv([...HIGH_ACOES, ...MEDIUM_ACOES]))
          .not("entidade", "in", csv(SENSITIVE_ENTIDADES));
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as AdminAuditRow[], count: count ?? 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.count ?? 0) / pageSize));

  return {
    rows: query.data?.rows ?? [],
    totalCount: query.data?.count ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    page,
    pageSize,
    totalPages,
  };
}