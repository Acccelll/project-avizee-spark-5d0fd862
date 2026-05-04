// Centralized status definitions for all ERP modules.
//
// E8 — Cores aqui DEVEM espelhar `STATUS_VARIANT_MAP` em `src/types/ui.ts`,
// que é a fonte única de verdade para o tom do StatusBadge. Esta tabela
// alimenta apenas filtros (MultiSelect/labels). Convenção:
//   variant `muted`        → color `"secondary"` (compat com BadgeVariant antigo)
//   variant `success`      → "success"
//   variant `warning`      → "warning"
//   variant `info`         → "info"
//   variant `destructive`  → "destructive"
//   variant `primary`      → "primary"

export const statusOrcamento: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "secondary" },
  pendente: { label: "Aguardando Aprovação", color: "warning" },
  aprovado: { label: "Aprovado", color: "success" },
  convertido: { label: "Convertido em Pedido", color: "success" },
  rejeitado: { label: "Rejeitado", color: "destructive" },
  cancelado: { label: "Cancelado", color: "destructive" },
  expirado: { label: "Expirado", color: "destructive" },
  historico: { label: "Histórico", color: "secondary" },
};

export const statusCompra: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Cotação", color: "secondary" },
  confirmado: { label: "Pedido Confirmado", color: "info" },
  parcial: { label: "Recebimento Parcial", color: "warning" },
  entregue: { label: "Entregue", color: "success" },
  cancelado: { label: "Cancelado", color: "destructive" },
};

// Statuses for the Pedido entity (stored as ordens_venda in DB)
export const statusPedido: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "secondary" },
  pendente: { label: "Aguardando", color: "warning" },
  aprovada: { label: "Aprovado", color: "success" },
  em_separacao: { label: "Em Separação", color: "info" },
  separado: { label: "Separado", color: "info" },
  em_transporte: { label: "Em Transporte", color: "info" },
  entregue: { label: "Entregue", color: "success" },
  faturada_parcial: { label: "Faturado Parcial", color: "warning" },
  faturada: { label: "Faturado", color: "success" },
  cancelada: { label: "Cancelado", color: "destructive" },
};

/** @deprecated Use statusPedido instead */
export const statusOrdemVenda = statusPedido;

export const statusNotaFiscal: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "warning" },
  confirmada: { label: "Confirmada", color: "success" },
  autorizada: { label: "Autorizada", color: "success" },
  cancelada: { label: "Cancelada", color: "destructive" },
  denegada: { label: "Denegada", color: "destructive" },
  inutilizada: { label: "Inutilizada", color: "secondary" },
};

export const statusFinanceiro: Record<string, { label: string; color: string }> = {
  aberto: { label: "Em Aberto", color: "warning" },
  parcial: { label: "Parcialmente Pago", color: "warning" },
  pago: { label: "Pago", color: "success" },
  vencido: { label: "Vencido", color: "destructive" },
  cancelado: { label: "Cancelado", color: "secondary" },
  estornado: { label: "Estornado", color: "destructive" },
};

export const statusRemessa: Record<string, { label: string; color: string }> = {
  pendente:   { label: "Pendente",    color: "warning" },
  coletado:   { label: "Coletado",    color: "info" },
  postado:    { label: "Postado",     color: "info" },
  em_transito:{ label: "Em Trânsito", color: "info" },
  entregue:   { label: "Entregue",    color: "success" },
  devolvido:  { label: "Devolvido",   color: "destructive" },
  cancelado:  { label: "Cancelado",   color: "destructive" },
};

export const statusCotacaoCompra: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "secondary" },
  aberta: { label: "Aberta", color: "warning" },
  em_analise: { label: "Em Análise", color: "info" },
  aguardando_aprovacao: { label: "Aguardando Aprovação", color: "warning" },
  aprovada: { label: "Aprovada", color: "success" },
  convertida: { label: "Convertida em Pedido", color: "success" },
  rejeitada: { label: "Rejeitada", color: "destructive" },
  cancelada: { label: "Cancelada", color: "destructive" },
};

export const statusPedidoCompra: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "secondary" },
  aguardando_aprovacao: { label: "Aguardando Aprovação", color: "warning" },
  aprovado: { label: "Aprovado", color: "success" },
  enviado_ao_fornecedor: { label: "Enviado ao Fornecedor", color: "info" },
  aguardando_recebimento: { label: "Aguardando Recebimento", color: "warning" },
  parcialmente_recebido: { label: "Parcialmente Recebido", color: "warning" },
  recebido: { label: "Recebido", color: "success" },
  rejeitado: { label: "Rejeitado", color: "destructive" },
  cancelado: { label: "Cancelado", color: "destructive" },
};

// Helper to get label from any status schema
export function getStatusLabel(schema: Record<string, { label: string; color: string }>, status: string): string {
  return schema[status]?.label || status;
}

export function getStatusColor(schema: Record<string, { label: string; color: string }>, status: string): string {
  return schema[status]?.color || "secondary";
}

// Convert status schema to MultiSelect options
export function statusToOptions(schema: Record<string, { label: string; color: string }>): { value: string; label: string }[] {
  return Object.entries(schema).map(([value, { label }]) => ({ value, label }));
}
