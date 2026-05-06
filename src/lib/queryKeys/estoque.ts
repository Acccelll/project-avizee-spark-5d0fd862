/**
 * Query keys do módulo Estoque.
 */
export const estoqueKeys = {
  all: ["estoque"] as const,
  produtos: () => ["estoque-produtos"] as const,
  movimentacoes: () => ["estoque-movimentacoes"] as const,
  posicao: (produtoId: string | null | undefined) =>
    ["estoque-produtos", "posicao", produtoId ?? null] as const,
} as const;