/**
 * Standardised UI type definitions shared across the ERP modules.
 */

/**
 * Design-token variants for status badges, alerts, and visual indicators.
 * Maps semantic backend status strings to Tailwind/shadcn colour tokens.
 */
export type StatusVariant =
  | "success"      // green  – pago, concluido, ativo, entregue, conciliado, finalizada
  | "warning"      // amber  – pendente, aberto, aguardando, parcial, em_separacao, confirmado
  | "destructive"  // red    – cancelado, rejeitado, vencido, expirado, bloqueado, sem_correspondencia
  | "info"         // blue   – aprovado, enviado, processando, em_analise, importada
  | "primary"      // brand  – faturado, convertido, composto, conciliado_manual
  | "muted";       // grey   – rascunho, inativo, simples, default fallback

/**
 * Maps backend status strings (lower-cased) to a `StatusVariant`.
 * Used by StatusBadge and any component that needs a colour token.
 *
 * E8 — Doutrina canônica:
 *   • Estados terminais positivos (pago, entregue, faturada, aprovada, convertida,
 *     confirmada/autorizada NF) → success.
 *   • Estados de movimento (separação, transporte, processamento, importação) → info.
 *   • Estados de espera (aberto, pendente, aguardando, parcial, divergente) → warning.
 *   • Estados de falha/cancelamento → destructive.
 *   • Estados arquivados/inativos/rascunho → muted.
 *   • `primary` reservado para destaque de marca (composição, conciliação manual).
 */
export const STATUS_VARIANT_MAP: Record<string, StatusVariant> = {
  // success — terminais positivos
  pago:                 "success",
  concluido:            "success",
  concluída:            "success",
  ativo:                "success",
  ativa:                "success",
  entregue:             "success",
  conciliado:           "success",
  finalizada:           "success",
  finalizado:           "success",
  total:                "success",
  aprovado:             "success",
  aprovada:             "success",
  faturado:             "success",
  faturada:             "success",
  convertido:           "success",
  convertida:           "success",
  confirmada:           "success", // NF autorizada/confirmada
  autorizada:           "success",
  no_prazo:             "success",
  despachado:           "success",
  recebido:             "success",
  emitida:              "success",

  // warning — espera / parcial
  pendente:             "warning",
  aberto:               "warning",
  aberta:               "warning",
  aguardando:           "warning",
  aguardando_aprovacao: "warning",
  aguardando_recebimento: "warning",
  parcial:              "warning",
  parcialmente_recebido:"warning",
  recebido_parcial:     "warning",
  faturada_parcial:     "warning",
  divergente:           "warning",
  proximo_vencimento:   "warning",

  // info — movimento / processamento
  enviado:              "info",
  enviada:              "info",
  enviado_ao_fornecedor:"info",
  processando:          "info",
  em_analise:           "info",
  em_separacao:         "info",
  separado:             "info",
  em_transporte:        "info",
  em_transito:          "info",
  coletado:             "info",
  postado:              "info",
  importada:            "info",
  importado:            "info",
  confirmado:           "info", // Compras: pedido confirmado (movimento, não terminal)

  // destructive — falha / cancelamento
  cancelado:            "destructive",
  cancelada:            "destructive",
  rejeitado:            "destructive",
  rejeitada:            "destructive",
  vencido:              "destructive",
  vencida:              "destructive",
  expirado:             "destructive",
  bloqueado:            "destructive",
  sem_correspondencia:  "destructive",
  atrasado:             "destructive",
  estornado:            "destructive",
  devolvido:            "destructive",

  // primary — marca / destaque
  composto:             "primary",
  conciliado_manual:    "primary",

  // muted — rascunho / inativo / arquivado
  rascunho:             "muted",
  inativo:              "muted",
  inativa:              "muted",
  simples:              "muted",
  nao_faturado:         "muted",
  inutilizada:          "muted",
  historico:            "muted",

  // info (catálogos: produto/insumo)
  produto:              "info",
  insumo:               "info",
};

/**
 * Returns the `StatusVariant` for a given backend status string.
 * Falls back to `"muted"` for unknown values.
 */
export function getStatusVariant(status: string): StatusVariant {
  return STATUS_VARIANT_MAP[status?.toLowerCase()] ?? "muted";
}
