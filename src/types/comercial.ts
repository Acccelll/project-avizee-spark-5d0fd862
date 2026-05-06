/**
 * Tipos compartilhados do módulo Comercial — derivados de `Database`
 * para evitar `any` nos drawers e hooks.
 */
import type { Database } from "@/integrations/supabase/types";

export type OrcamentoRow = Database["public"]["Tables"]["orcamentos"]["Row"];
export type OrcamentoItemRow = Database["public"]["Tables"]["orcamentos_itens"]["Row"];
export type OrdemVendaRow = Database["public"]["Tables"]["ordens_venda"]["Row"];
export type OrdemVendaItemRow = Database["public"]["Tables"]["ordens_venda_itens"]["Row"];
export type NotaFiscalRow = Database["public"]["Tables"]["notas_fiscais"]["Row"];
export type LancamentoRow = Database["public"]["Tables"]["financeiro_lancamentos"]["Row"];

/** Snapshot mínimo de produto exibido na linha de item. */
export interface ProdutoMini {
  id: string;
  nome: string | null;
  sku: string | null;
}

/** Snapshot mínimo de cliente para subtitles do drawer. */
export interface ClienteMini {
  id: string;
  nome_razao_social: string;
}

export interface OrcamentoItemWithProduto extends OrcamentoItemRow {
  produtos?: ProdutoMini | null;
}

export interface OrdemVendaItemWithProduto extends OrdemVendaItemRow {
  produtos?: (ProdutoMini & { estoque_atual?: number | null }) | null;
}

export interface OrcamentoWithCliente extends OrcamentoRow {
  clientes?: ClienteMini | null;
}

export interface OrdemVendaWithRelations extends OrdemVendaRow {
  clientes?: ClienteMini | null;
  orcamentos?: Pick<
    OrcamentoRow,
    "id" | "numero" | "pagamento" | "prazo_pagamento" | "prazo_entrega" | "frete_tipo" | "observacoes"
  > | null;
}

/** Subset de NF usado no drawer do pedido (lista enxuta). */
export type NotaFiscalListItem = Pick<
  NotaFiscalRow,
  | "id"
  | "numero"
  | "status"
  | "valor_total"
  | "data_emissao"
  | "tipo_operacao"
  | "finalidade_nfe"
  | "nf_referenciada_id"
>;

/** Subset de lançamento usado no drawer do pedido. */
export type LancamentoListItem = Pick<
  LancamentoRow,
  | "id"
  | "descricao"
  | "valor"
  | "status"
  | "data_vencimento"
  | "data_pagamento"
  | "forma_pagamento"
  | "parcela_numero"
  | "parcela_total"
>;

export interface OrcamentoDetail {
  orcamento: OrcamentoWithCliente & { public_token?: string | null; revisao?: number | null };
  items: OrcamentoItemWithProduto[];
  linkedOV: Pick<OrdemVendaRow, "id" | "numero" | "status"> | null;
}

export interface OVDetail {
  ov: OrdemVendaWithRelations;
  items: OrdemVendaItemWithProduto[];
  notasFiscais: NotaFiscalListItem[];
  lancamentos: LancamentoListItem[];
  /** NFs de devolução referenciando alguma NF deste pedido. */
  devolucoes: NotaFiscalListItem[];
}

/** Item com falta de estoque para gate de "Gerar NF". */
export interface StockShortfall {
  produto: string;
  falta: number;
}