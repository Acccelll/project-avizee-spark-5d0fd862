/**
 * Single source of truth for "open" / non-terminal statuses across the
 * comercial module. Both the dashboard hook (which counts the KPI) and the
 * destination listing pages should reference these constants so drill-downs
 * never produce a number mismatch.
 */

/** Orçamentos ainda em jogo (não convertidos / não cancelados / não rejeitados). */
export const OPEN_ORCAMENTO_STATUSES = ['rascunho', 'pendente', 'aprovado'] as const;
export type OpenOrcamentoStatus = (typeof OPEN_ORCAMENTO_STATUSES)[number];

/** Ordens de venda elegíveis para faturamento (status da OV).
 *  Casa com `canFaturarPedido` em `comercialWorkflow.ts`: pedidos
 *  `separado` ainda podem ser faturados, então contam no backlog. */
export const BACKLOG_OV_STATUSES = ['aprovada', 'em_separacao', 'separado'] as const;
export type BacklogOvStatus = (typeof BACKLOG_OV_STATUSES)[number];

/** Status_faturamento que mantêm a OV como "aguardando NF". */
export const BACKLOG_FATURAMENTO_STATUSES = ['aguardando', 'parcial'] as const;
export type BacklogFaturamentoStatus = (typeof BACKLOG_FATURAMENTO_STATUSES)[number];
