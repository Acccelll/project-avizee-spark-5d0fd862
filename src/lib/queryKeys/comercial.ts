/**
 * Query keys do módulo Comercial (orçamentos, pedidos, cotações, faturamento).
 */
export const comercialKeys = {
  all: ["comercial"] as const,

  orcamentos: () => ["orcamentos"] as const,
  orcamento: (id: string | null | undefined) => ["orcamentos", id ?? null] as const,

  pedidos: () => ["ordens_venda"] as const,
  pedido: (id: string | null | undefined) => ["ordens_venda", id ?? null] as const,

  pedidosCompra: () => ["pedidos_compra"] as const,
  pedidoCompra: (id: string | null | undefined) => ["pedidos_compra", id ?? null] as const,

  cotacoesCompra: () => ["cotacoes_compra"] as const,
  cotacaoCompra: (id: string | null | undefined) => ["cotacoes_compra", id ?? null] as const,

  faturamentoBacklog: (q?: string) => ["faturamento-backlog", q ?? ""] as const,
  faturamentoConsulta: (...args: unknown[]) => ["faturamento-consulta-docs", ...args] as const,
} as const;