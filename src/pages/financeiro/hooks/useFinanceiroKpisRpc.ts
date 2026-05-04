import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Filtros aceitos pela RPC `kpis_financeiro`.
 * Espelha os parâmetros server-side para manter os cards coerentes com a
 * listagem paginada do Financeiro.
 */
export interface FinanceiroKpisFilters {
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

export interface FinanceiroKpisResult {
  totalCount: number;
  a_vencer: number;
  vence_hoje: number;
  vencido: number;
  pago: number;
  parcial: number;
  total_a_vencer: number;
  total_vencido: number;
  total_pago: number;
  total_parcial: number;
}

const EMPTY: FinanceiroKpisResult = {
  totalCount: 0,
  a_vencer: 0,
  vence_hoje: 0,
  vencido: 0,
  pago: 0,
  parcial: 0,
  total_a_vencer: 0,
  total_vencido: 0,
  total_pago: 0,
  total_parcial: 0,
};

/**
 * Carrega os KPIs do módulo Financeiro via RPC `kpis_financeiro`, aplicando
 * os mesmos filtros da listagem para manter os cards coerentes mesmo com
 * paginação server-side.
 */
export function useFinanceiroKpisRpc(filters: FinanceiroKpisFilters) {
  return useQuery({
    queryKey: ["kpis_financeiro", filters],
    queryFn: async (): Promise<FinanceiroKpisResult> => {
      const { data, error } = await supabase.rpc("kpis_financeiro", {
        p_date_from: filters.dateFrom ?? null,
        p_date_to: filters.dateTo ?? null,
        p_tipos: filters.tipos?.length ? filters.tipos : null,
        p_status: filters.status?.length ? filters.status : null,
        p_bancos: filters.bancos?.length ? filters.bancos : null,
        p_origens: filters.origens?.length ? filters.origens : null,
        p_formas: filters.formas?.length ? filters.formas : null,
        p_cartoes: filters.cartoes?.length ? filters.cartoes : null,
        p_search: filters.search?.trim() || null,
      });
      if (error) throw error;
      return { ...EMPTY, ...((data as Partial<FinanceiroKpisResult>) ?? {}) };
    },
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}