export interface CotacaoCompra {
  id: string;
  numero: string;
  data_cotacao: string;
  data_validade: string | null;
  status: string;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
}

export interface CotacaoItem {
  id: string;
  cotacao_compra_id: string;
  produto_id: string;
  quantidade: number;
  unidade: string;
  produtos?: { nome: string; codigo_interno: string; sku: string };
}

export interface CotacaoSummary {
  itens_count: number;
  fornecedores_count: number;
  /** Total de propostas registradas (não único por fornecedor). */
  propostas_count: number;
  vencedor_nome: string | null;
  tem_vencedor: boolean;
  /** IDs de fornecedores presentes em alguma proposta (para filtro). */
  fornecedor_ids: string[];
  /** Lista normalizada (lowercase) de nomes/códigos de produtos para busca textual. */
  produtos_text: string;
  /** Nome do primeiro produto da cotação (para exibição em cards mobile). */
  produto_principal: string | null;
}

export interface Proposta {
  id?: string;
  cotacao_compra_id: string;
  item_id: string;
  fornecedor_id: string;
  preco_unitario: number;
  prazo_entrega_dias: number | null;
  observacoes: string | null;
  selecionado: boolean;
  fornecedores?: { nome_razao_social: string };
}

export interface LocalItem {
  _localId: string;
  id?: string;
  produto_id: string;
  quantidade: number;
  unidade: string;
}

export {
  COTACAO_FLOW_STEPS as FLOW_STEPS,
  cotacaoCanEdit,
  cotacaoCanGeneratePedido,
  cotacaoStatusLabelMap as statusLabels,
  getCotacaoFlowStepIndex as getFlowStepIndex,
} from "./comprasStatus";

/**
 * Returns a fresh empty form so `data_cotacao` reflects the current
 * day. Avoid using a module-level constant for date defaults.
 */
export function buildEmptyForm() {
  return {
    numero: "",
    data_cotacao: new Date().toISOString().slice(0, 10),
    data_validade: "",
    observacoes: "",
    status: "aberta",
  };
}

/** @deprecated Prefer `buildEmptyForm()` to avoid stale dates. */
export const emptyForm = buildEmptyForm();
