/**
 * Canonical status mapping for Reports rows.
 *
 * Each domain entity exposes a stable canonical key (`statusKey`) and a
 * semantic kind (`statusKind`) so the UI can render badges and run filters
 * without falling back to substring heuristics on display labels.
 *
 * Used by `relatorios.service` (annotates each row) and by
 * `utils/relatorios.filtrarPorStatus` (compares against `statusKey`).
 */

export type StatusKind = 'critical' | 'warning' | 'success' | 'info' | 'neutral';

export interface StatusMeta {
  key: string;
  kind: StatusKind;
}

/** Financeiro lançamentos — canônico: aberto | parcial | pago | vencido | cancelado | estornado. */
export const financeiroStatusMap: Record<string, StatusMeta> = {
  aberto: { key: 'aberto', kind: 'warning' },
  parcial: { key: 'parcial', kind: 'info' },
  pago: { key: 'pago', kind: 'success' },
  vencido: { key: 'vencido', kind: 'critical' },
  cancelado: { key: 'cancelado', kind: 'neutral' },
  estornado: { key: 'estornado', kind: 'critical' },
};

/** Ordens de venda — status comercial. */
export const ordemVendaStatusMap: Record<string, StatusMeta> = {
  rascunho: { key: 'rascunho', kind: 'neutral' },
  pendente: { key: 'pendente', kind: 'warning' },
  aprovada: { key: 'aprovada', kind: 'success' },
  confirmado: { key: 'confirmado', kind: 'success' },
  em_separacao: { key: 'em_separacao', kind: 'info' },
  faturada_parcial: { key: 'faturada_parcial', kind: 'warning' },
  faturada: { key: 'faturada', kind: 'success' },
  cancelada: { key: 'cancelada', kind: 'critical' },
  cancelado: { key: 'cancelado', kind: 'critical' },
};

/** Faturamento (status_faturamento de OV). */
export const faturamentoStatusMap: Record<string, StatusMeta> = {
  aguardando: { key: 'aguardando', kind: 'warning' },
  parcial: { key: 'parcial', kind: 'info' },
  total: { key: 'total', kind: 'success' },
  faturado: { key: 'faturado', kind: 'success' },
};

/** Compras / pedidos de compra. */
export const compraStatusMap: Record<string, StatusMeta> = {
  pendente: { key: 'pendente', kind: 'warning' },
  aprovado: { key: 'aprovado', kind: 'info' },
  em_transito: { key: 'em_transito', kind: 'info' },
  parcial: { key: 'parcial', kind: 'warning' },
  entregue: { key: 'entregue', kind: 'success' },
  recebido: { key: 'recebido', kind: 'success' },
  cancelado: { key: 'cancelado', kind: 'critical' },
};

/** Estoque — criticidade derivada (Zerado/Abaixo do mínimo/OK). */
export function estoqueCriticidadeKind(criticidade: string): StatusKind {
  if (criticidade === 'Zerado') return 'critical';
  if (criticidade === 'Abaixo do mínimo') return 'warning';
  return 'success';
}

/** Aging — faixa de vencimento. */
export function agingFaixaKind(faixa: string): StatusKind {
  if (faixa === 'A vencer') return 'success';
  if (faixa === '1-30 dias') return 'warning';
  if (faixa === '31-60 dias' || faixa === '61-90 dias') return 'critical';
  if (faixa === '90+ dias') return 'critical';
  return 'neutral';
}

/** Curva ABC — classe. */
export function curvaAbcClasseKind(classe: 'A' | 'B' | 'C'): StatusKind {
  if (classe === 'A') return 'success';
  if (classe === 'B') return 'info';
  return 'warning';
}

/** Movimento de estoque — entrada/saída/ajuste. */
export const movimentoEstoqueStatusMap: Record<string, StatusMeta> = {
  entrada: { key: 'entrada', kind: 'success' },
  saida: { key: 'saida', kind: 'critical' },
  ajuste: { key: 'ajuste', kind: 'warning' },
};

/** Cadastros (produtos, clientes, fornecedores) — situação cadastral. */
export const cadastroSituacaoStatusMap: Record<string, StatusMeta> = {
  ativo: { key: 'ativo', kind: 'success' },
  inativo: { key: 'inativo', kind: 'neutral' },
  descontinuado: { key: 'descontinuado', kind: 'critical' },
};

/** Generic resolver: returns canonical meta or a neutral fallback. */
export function resolveStatus(
  map: Record<string, StatusMeta>,
  raw: string | null | undefined,
): StatusMeta {
  if (!raw) return { key: 'desconhecido', kind: 'neutral' };
  return map[raw] ?? { key: raw, kind: 'neutral' };
}