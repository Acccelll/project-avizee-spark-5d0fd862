/**
 * Query keys centralizados para o módulo Fiscal.
 *
 * Centralizar evita strings duplicadas espalhadas pelos drawers e dá
 * autocomplete + refactor seguro. Use sempre via spread/igualdade direta
 * em react-query.
 */

export const fiscalKeys = {
  all: ["fiscal"] as const,

  // Manifestação do destinatário
  nfeDistribuicao: () => ["fiscal", "nfe-distribuicao"] as const,
  nfeDistribuicaoItens: (nfeId: string | null | undefined) =>
    ["fiscal", "nfe-distribuicao", "itens", nfeId ?? null] as const,
  nfeDistItensMapear: (nfeId: string | null | undefined) =>
    ["fiscal", "nfe-distribuicao", "itens-mapear", nfeId ?? null] as const,

  // CC-e
  cceHistorico: (notaFiscalId: string | null | undefined) =>
    ["fiscal", "cce-historico", notaFiscalId ?? null] as const,

  // Inutilização
  inutilizacoesHistorico: () => ["fiscal", "inutilizacoes-historico"] as const,

  // Lookups auxiliares
  fornecedoresAtivosMin: () =>
    ["fiscal", "lookup", "fornecedores-ativos-min"] as const,
  produtosAtivosMin: () =>
    ["fiscal", "lookup", "produtos-ativos-min"] as const,
} as const;
