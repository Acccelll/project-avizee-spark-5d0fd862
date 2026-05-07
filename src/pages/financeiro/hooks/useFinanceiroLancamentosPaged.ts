import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Lancamento } from "@/types/domain";

/**
 * Filtros server-side espelhando `kpis_financeiro` + busca cross-table.
 * Mantém os mesmos campos consumidos por `useFinanceiroKpisRpc` para que
 * cards de KPI e a listagem paginada caminhem juntos.
 */
export interface FinanceiroPagedFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  tipos?: string[] | null;
  status?: string[] | null;
  bancos?: string[] | null;
  origens?: string[] | null;
  formas?: string[] | null;
  cartoes?: string[] | null;
  search?: string | null;
}

const DEFAULT_PAGE_SIZE = 50;

const SELECT_RELATIONAL =
  "*, clientes(nome_razao_social), fornecedores(nome_razao_social), contas_bancarias(descricao, bancos(nome)), contas_contabeis(descricao, codigo)";

interface PageResult {
  rows: Lancamento[];
  totalCount: number;
}

/**
 * Paginação server-side para a listagem de lançamentos.
 *
 * Estratégia em 2 passos para preservar o `select` relacional já consumido
 * pelas colunas/drawer:
 *  1) RPC `listar_financeiro_lancamentos_ids` aplica filtros (incluindo busca
 *     cross-table em cliente/fornecedor/banco) e devolve `ids` da página +
 *     `total_count`.
 *  2) `SELECT ... IN (ids)` reidrata as linhas com joins, preservando ordem
 *     da RPC via `Map<id, row>`.
 */
export function useFinanceiroLancamentosPaged(
  filters: FinanceiroPagedFilters,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const qc = useQueryClient();
  const queryKey = ["financeiro", "lancamentos", "paged", filters, page, pageSize] as const;

  const query = useQuery<PageResult>({
    queryKey,
    queryFn: async ({ signal }) => {
      const offset = page * pageSize;
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "listar_financeiro_lancamentos_ids",
        {
          p_date_from: filters.dateFrom ?? null,
          p_date_to: filters.dateTo ?? null,
          p_tipos: filters.tipos?.length ? filters.tipos : null,
          p_status: filters.status?.length ? filters.status : null,
          p_bancos: filters.bancos?.length ? filters.bancos : null,
          p_origens: filters.origens?.length ? filters.origens : null,
          p_formas: filters.formas?.length ? filters.formas : null,
          p_cartoes: filters.cartoes?.length ? filters.cartoes : null,
          p_search: filters.search?.trim() || null,
          p_order_by: "data_vencimento",
          p_ascending: false,
          p_offset: offset,
          p_limit: pageSize,
        },
      );
      if (rpcError) throw rpcError;
      const payload = (rpcData ?? {}) as { ids?: string[] | null; total_count?: number };
      const ids = payload.ids ?? [];
      const totalCount = Number(payload.total_count ?? 0);
      if (ids.length === 0) return { rows: [], totalCount };

      let q = supabase
        .from("financeiro_lancamentos")
        .select(SELECT_RELATIONAL)
        .in("id", ids);
      if (signal) q = q.abortSignal(signal);
      const { data: rows, error } = await q;
      if (error) throw error;

      // Reordena conforme a RPC (que aplicou ORDER BY canônico).
      const byId = new Map<string, Lancamento>();
      (rows as Lancamento[] | null)?.forEach((r) => byId.set(r.id, r));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Lancamento[];
      return { rows: ordered, totalCount };
    },
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });

  // Invalidação centralizada — qualquer mutation pode disparar
  // `["financeiro", "lancamentos"]` que esta página será refeita.
  const refetch = async () => {
    await qc.invalidateQueries({ queryKey: ["financeiro", "lancamentos"] });
  };

  return {
    data: query.data?.rows ?? [],
    totalCount: query.data?.totalCount ?? 0,
    loading: query.isLoading,
    refetching: query.isFetching && !query.isLoading,
    refetch,
    error: query.error,
  };
}

/**
 * Reseta a página para 0 quando os filtros mudam (evita pedir um offset
 * inexistente após shrink do dataset).
 */
export function useResetPageOnFiltersChange(
  filters: FinanceiroPagedFilters,
  setPage: (p: number) => void,
) {
  const key = JSON.stringify(filters);
  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
