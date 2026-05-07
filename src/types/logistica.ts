/**
 * Tipos canônicos do módulo Logística.
 *
 * Centralizados aqui para evitar duplicação entre hooks (`useEntregas`,
 * `useRecebimentos`) e drawers (`EntregaDrawer`, `RecebimentoDrawer`).
 */

export interface Entrega {
  id: string;
  numero_pedido: string;
  cliente: string;
  cidade_uf: string;
  transportadora: string;
  volumes: number;
  peso_total: number;
  previsao_envio: string | null;
  previsao_entrega: string | null;
  data_expedicao: string | null;
  data_entrega: string | null;
  status_logistico: string;
  responsavel: string;
  codigo_rastreio: string | null;
  remessas_count: number;
  remessa_ids: string[];
  exibicao_remessas: "nenhuma" | "unica" | "multipla";
  status_fonte: "sem_remessa" | "remessa_unica" | "ultima_remessa";
}

export interface EntregaFilters {
  search?: string;
  status?: string[];
  transportadora?: string[];
}

export interface Recebimento {
  id: string;
  numero_compra: string;
  fornecedor: string;
  previsao_entrega: string | null;
  data_recebimento: string | null;
  quantidade_pedida: number;
  quantidade_recebida: number;
  pendencia: number;
  status_logistico: string;
  nf_vinculada: string | null;
  responsavel: string;
  recebimento_real: boolean;
  observacao_recebimento: string | null;
  total_recebimentos: number;
  tem_divergencia: boolean;
}