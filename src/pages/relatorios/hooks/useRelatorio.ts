/**
 * Generic React Query hook for the Reports module.
 *
 * This hook is used directly by Relatorios.tsx for all report types, providing
 * a single integration point with a consistent query key, staleTime and
 * placeholderData strategy.
 *
 * Specialised hooks (useRelatorioVendas, useRelatorioFinanceiro,
 * useRelatorioEstoque) wrap this hook with a `select` function to add
 * pre-computed derived data (e.g. vendasPorPeriodo, agingPorFaixa). They are
 * available for consumers that need those computed values directly without
 * having to duplicate the transformation logic.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  carregarRelatorio,
  type TipoRelatorio,
  type FiltroRelatorio,
  type RelatorioResultado,
} from "@/services/relatorios.service";

export const RELATORIO_STALE_TIME = 10 * 60 * 1000; // default — 10 minutes

/**
 * Onda 9.4 (M-01) — staleTime por tipo de relatório.
 * Operacionais (estoque ao vivo, fluxo de caixa, vendas do dia) precisam de
 * dados frescos; cadastros e visões agregadas mensais podem ser cacheadas
 * por mais tempo.
 */
const STALE_TIME_BY_TIPO: Partial<Record<TipoRelatorio, number>> = {
  // Curto — dados muito voláteis
  estoque: 2 * 60 * 1000,
  movimentos_estoque: 2 * 60 * 1000,
  fluxo_caixa: 2 * 60 * 1000,
  vendas: 5 * 60 * 1000,
  faturamento: 5 * 60 * 1000,
  compras: 5 * 60 * 1000,
  aging: 5 * 60 * 1000,
  divergencias: 5 * 60 * 1000,
  // Longo — agregações mensais e cadastros
  dre: 15 * 60 * 1000,
  curva_abc: 15 * 60 * 1000,
  margem_produtos: 15 * 60 * 1000,
  cadastro_produtos: 30 * 60 * 1000,
  cadastro_clientes: 30 * 60 * 1000,
  cadastro_fornecedores: 30 * 60 * 1000,
  cadastro_transportadoras: 30 * 60 * 1000,
};

export function staleTimeFor(tipo: TipoRelatorio | ""): number {
  if (!tipo) return RELATORIO_STALE_TIME;
  return STALE_TIME_BY_TIPO[tipo] ?? RELATORIO_STALE_TIME;
}

export function useRelatorio<TSelected = RelatorioResultado>(
  tipo: TipoRelatorio | "",
  filtros: FiltroRelatorio = {},
  select?: (data: RelatorioResultado) => TSelected,
  enabled = true
) {
  return useQuery<RelatorioResultado, Error, TSelected>({
    queryKey: ["relatorio", tipo, filtros],
    queryFn: () => carregarRelatorio(tipo as TipoRelatorio, filtros),
    staleTime: staleTimeFor(tipo),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: enabled && !!tipo,
    select,
  });
}
