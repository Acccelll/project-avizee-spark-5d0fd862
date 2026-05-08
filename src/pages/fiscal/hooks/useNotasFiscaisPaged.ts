import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { NotaFiscal } from "@/types/domain";

/**
 * Filtros server-side espelhando a RPC `listar_notas_fiscais_ids`.
 * Mantém paridade com `kpis_fiscal` (chamado por `useFiscalKpis`) para que
 * os cards e a listagem caminhem juntos.
 */
export interface NotasFiscaisPagedFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  tipos?: string[] | null;
  status?: string[] | null;
  statusSefaz?: string[] | null;
  modelos?: string[] | null;
  origens?: string[] | null;
  fornecedores?: string[] | null;
  clientes?: string[] | null;
  search?: string | null;
}

const DEFAULT_PAGE_SIZE = 50;

const SELECT_RELATIONAL =
  "*, fornecedores(nome_razao_social, cpf_cnpj), clientes(nome_razao_social), ordens_venda(numero)";

interface PageResult {
  rows: NotaFiscal[];
  totalCount: number;
}

/**
 * Paginação server-side para a listagem de Notas Fiscais.
 * Estratégia em 2 passos (mesma de `useFinanceiroLancamentosPaged`):
 *  1) RPC `listar_notas_fiscais_ids` aplica filtros server-side e devolve
 *     `ids` da página + `total_count`.
 *  2) `SELECT ... IN (ids)` reidrata as linhas com joins (fornecedor,
 *     cliente, ordem de venda) preservando a ordem da RPC.
 */
export function useNotasFiscaisPaged(
  filters: NotasFiscaisPagedFilters,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const qc = useQueryClient();
  const queryKey = ["notas_fiscais", "paged", filters, page, pageSize] as const;

  const query = useQuery<PageResult>({
    queryKey,
    queryFn: async ({ signal }) => {
      const offset = page * pageSize;
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "listar_notas_fiscais_ids",
        {
          p_date_from: filters.dateFrom ?? null,
          p_date_to: filters.dateTo ?? null,
          p_tipos: filters.tipos?.length ? filters.tipos : null,
          p_status: filters.status?.length ? filters.status : null,
          p_status_sefaz: filters.statusSefaz?.length ? filters.statusSefaz : null,
          p_modelos: filters.modelos?.length ? filters.modelos : null,
          p_origens: filters.origens?.length ? filters.origens : null,
          p_fornecedores: filters.fornecedores?.length ? filters.fornecedores : null,
          p_clientes: filters.clientes?.length ? filters.clientes : null,
          p_search: filters.search?.trim() || null,
          p_order_by: "data_emissao",
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
        .from("notas_fiscais")
        .select(SELECT_RELATIONAL)
        .in("id", ids);
      if (signal) q = q.abortSignal(signal);
      const { data: rows, error } = await q;
      if (error) throw error;

      const byId = new Map<string, NotaFiscal>();
      ((rows ?? []) as unknown as NotaFiscal[]).forEach((r) => byId.set(r.id, r));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as NotaFiscal[];
      return { rows: ordered, totalCount };
    },
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });

  const refetch = async () => {
    await qc.invalidateQueries({ queryKey: ["notas_fiscais"] });
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

export function useResetPageOnFiltersChange(
  filters: NotasFiscaisPagedFilters,
  setPage: (p: number) => void,
) {
  const key = JSON.stringify(filters);
  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}