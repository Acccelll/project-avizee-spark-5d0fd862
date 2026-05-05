/**
 * Shared types and helpers used across relatorios loaders.
 *
 * These are split out of `relatorios.service.ts` so that each domain loader
 * (estoque, financeiro, comercial, compras, divergencias) can be implemented
 * independently while keeping a single source of truth for filter shape and
 * common query plumbing (date range application).
 */

import type { ReportMeta } from "@/types/relatorios";

export type TipoRelatorio =
  | "estoque"
  | "movimentos_estoque"
  | "financeiro"
  | "fluxo_caixa"
  | "vendas"
  | "compras"
  | "aging"
  | "dre"
  | "curva_abc"
  | "margem_produtos"
  | "estoque_minimo"
  | "vendas_cliente"
  | "compras_fornecedor"
  | "nfe_entrada"
  | "divergencias"
  | "faturamento"
  | "cadastro_produtos"
  | "cadastro_clientes"
  | "cadastro_fornecedores"
  | "cadastro_transportadoras";

export interface FiltroRelatorio {
  dataInicio?: string;
  dataFim?: string;
  clienteIds?: string[];
  fornecedorIds?: string[];
  grupoProdutoIds?: string[];
  tiposFinanceiros?: string[];
}

export interface RelatorioResultado<T = Record<string, unknown>> {
  title: string;
  subtitle: string;
  rows: T[];
  chartData?: Array<{ name: string; value: number }>;
  totals?: Record<string, number>;
  /** Rich KPI values keyed by the ReportKpiDef.key for the current report */
  kpis?: Record<string, number>;
  /**
   * Semantic metadata about the report. Populated by every loader; consumers
   * should prefer `meta` over the legacy boolean flags.
   */
  meta?: ReportMeta;
  /** @deprecated use `meta.valueNature === 'quantidade'` */
  _isQuantityReport?: boolean;
  /** @deprecated use `meta.kind === 'dre'` */
  _isDreReport?: boolean;
}

/**
 * Append `gte`/`lte` clauses for a date column when the filter has a range.
 * Generic over Supabase query builders so it works for any table/select.
 */
export function withDateRange<
  Q extends { gte: (col: string, val: string) => Q; lte: (col: string, val: string) => Q },
>(query: Q, column: string, filtros: FiltroRelatorio): Q {
  let next = query;
  if (filtros.dataInicio) next = next.gte(column, filtros.dataInicio);
  if (filtros.dataFim) next = next.lte(column, filtros.dataFim);
  return next;
}

// ─── Local raw DB row shapes used by loaders ────────────────────────────────

export interface RawFluxoItem {
  tipo: string;
  valor: number | null;
  data_pagamento: string | null;
  data_vencimento: string | null;
  descricao: string | null;
  status: string | null;
}

export interface RawComprasItem {
  numero: string | null;
  data_compra: string | null;
  data_entrega_prevista: string | null;
  data_entrega_real: string | null;
  valor_total: number | null;
  status: string | null;
  fornecedores: { nome_razao_social: string } | null;
}

export interface RawMargemProdutoItem {
  codigo_interno: string | null;
  nome: string;
  preco_custo: number | null;
  preco_venda: number | null;
  estoque_atual: number | null;
  grupos_produto: { nome: string } | null;
}

export interface RawEstoqueMinimoItem {
  codigo_interno: string | null;
  nome: string;
  unidade_medida: string | null;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  preco_custo: number | null;
  grupos_produto: { nome: string } | null;
}

export interface RawFinanceiroLancamento {
  nota_fiscal_id: string | null;
}