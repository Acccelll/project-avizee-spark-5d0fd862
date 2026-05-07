import { statusCotacaoCompra, statusPedidoCompra } from "@/lib/statusSchema";

export const COTACAO_STATUS_ALIAS: Record<string, string> = {
  finalizada: "aprovada",
};

export const PEDIDO_STATUS_ALIAS: Record<string, string> = {
  recebido_parcial: "parcialmente_recebido",
};

export function canonicalCotacaoStatus(status: string | null | undefined): string {
  if (!status) return "aberta";
  return COTACAO_STATUS_ALIAS[status] ?? status;
}

export function canonicalPedidoStatus(status: string | null | undefined): string {
  if (!status) return "rascunho";
  return PEDIDO_STATUS_ALIAS[status] ?? status;
}

export const cotacaoStatusLabelMap: Record<string, string> = {
  ...Object.fromEntries(Object.entries(statusCotacaoCompra).map(([k, v]) => [k, v.label])),
  finalizada: statusCotacaoCompra.aprovada.label,
};

export const pedidoStatusLabelMap: Record<string, string> = {
  ...Object.fromEntries(Object.entries(statusPedidoCompra).map(([k, v]) => [k, v.label])),
  recebido_parcial: statusPedidoCompra.parcialmente_recebido.label,
};

export const COTACAO_FLOW_STEPS = [
  { key: "aberta", label: "Em Cotação" },
  { key: "em_analise", label: "Em Análise" },
  { key: "aguardando_aprovacao", label: "Aprovação" },
  { key: "aprovada", label: "Aprovada" },
  { key: "convertida", label: "Convertida" },
] as const;

const COTACAO_FLOW_STEP_ORDER = COTACAO_FLOW_STEPS.map((s) => s.key);

export function getCotacaoFlowStepIndex(status: string | null | undefined): number {
  return COTACAO_FLOW_STEP_ORDER.indexOf(canonicalCotacaoStatus(status) as (typeof COTACAO_FLOW_STEP_ORDER)[number]);
}

export function cotacaoCanEdit(status: string | null | undefined): boolean {
  return !["convertida", "cancelada"].includes(canonicalCotacaoStatus(status));
}

export function cotacaoCanApprove(status: string | null | undefined): boolean {
  const normalized = canonicalCotacaoStatus(status);
  return ["aberta", "em_analise", "aguardando_aprovacao"].includes(normalized);
}

export function cotacaoCanGeneratePedido(status: string | null | undefined): boolean {
  return canonicalCotacaoStatus(status) === "aprovada";
}

export function pedidoCanReceive(status: string | null | undefined): boolean {
  return ["aprovado", "enviado_ao_fornecedor", "aguardando_recebimento", "parcialmente_recebido"].includes(canonicalPedidoStatus(status));
}

export function pedidoRecebimentoLabel(status: string | null | undefined): string {
  const normalized = canonicalPedidoStatus(status);
  if (normalized === "recebido") return "Recebido";
  if (normalized === "parcialmente_recebido") return "Recebimento Parcial";
  if (["aprovado", "enviado_ao_fornecedor", "aguardando_recebimento"].includes(normalized)) return "Aguardando Recebimento";
  if (normalized === "cancelado") return "Cancelado";
  return "Pendente";
}
