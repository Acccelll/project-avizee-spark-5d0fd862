/**
 * Query keys do módulo Financeiro (lançamentos, baixas, fluxo de caixa, sócios).
 */
export const financeiroKeys = {
  all: ["financeiro"] as const,

  lancamentos: () => ["financeiro_lancamentos"] as const,
  lancamento: (id: string | null | undefined) => ["financeiro_lancamentos", id ?? null] as const,

  baixas: () => ["financeiro_baixas"] as const,
  contasBancarias: () => ["contas_bancarias"] as const,
  fluxoCaixa: () => ["fluxo-caixa"] as const,

  socios: () => ["socios"] as const,
  apuracoes: () => ["apuracoes_societarias"] as const,
} as const;