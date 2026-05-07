import { supabase } from "@/integrations/supabase/client";

export async function listOrdensVendaParaFiscal() {
  const { data, error } = await supabase
    .from("ordens_venda")
    .select("id, numero, cliente_id, clientes(nome_razao_social)")
    .eq("ativo", true)
    .in("status", ["aprovada", "em_separacao"])
    .order("numero");
  if (error) throw error;
  return data || [];
}

export async function listContasContabeisLancaveis() {
  const { data, error } = await supabase
    .from("contas_contabeis")
    .select("id, codigo, descricao")
    .eq("ativo", true)
    .eq("aceita_lancamento", true)
    .order("codigo");
  if (error) throw error;
  return data || [];
}

export async function getPedidoCompraResumo(pedidoId: string) {
  const { data, error } = await supabase
    .from("pedidos_compra")
    .select("numero, fornecedor_id")
    .eq("id", pedidoId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listNotaFiscalItensCompletos(nfId: string) {
  const { data, error } = await supabase
    .from("notas_fiscais_itens")
    .select("*, produtos(nome, sku)")
    .eq("nota_fiscal_id", nfId);
  if (error) throw error;
  return data || [];
}

export interface PedidoCompraOpcao {
  id: string;
  numero: string | null;
  valor_total: number | null;
  status: string | null;
  data_pedido: string | null;
  fornecedor_nome: string | null;
}

export async function listPedidosCompraParaVincular(
  fornecedorId: string,
): Promise<PedidoCompraOpcao[]> {
  const { data, error } = await supabase
    .from("pedidos_compra")
    .select("id, numero, valor_total, status, data_pedido, fornecedores(nome_razao_social)")
    .eq("fornecedor_id", fornecedorId)
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      numero: string | null;
      valor_total: number | null;
      status: string | null;
      data_pedido: string | null;
      fornecedores: { nome_razao_social: string } | null;
    };
    return {
      id: r.id,
      numero: r.numero,
      valor_total: r.valor_total,
      status: r.status,
      data_pedido: r.data_pedido,
      fornecedor_nome: r.fornecedores?.nome_razao_social ?? null,
    };
  });
}

/**
 * Carrega itens, lançamentos financeiros, movimentos de estoque, eventos e
 * anexos relacionados a uma nota fiscal — usado pelo NotaFiscalDrawer.
 */
export async function fetchNotaFiscalDetalhes(notaFiscalId: string) {
  const [{ data: it }, { data: lanc }, { data: mov }, { data: ev }, { data: anx }] =
    await Promise.all([
      supabase
        .from("notas_fiscais_itens")
        .select("*, produtos(id, nome, sku)")
        .eq("nota_fiscal_id", notaFiscalId),
      supabase
        .from("financeiro_lancamentos")
        .select(
          "id, tipo, descricao, valor, data_vencimento, status, forma_pagamento, parcela_numero, parcela_total",
        )
        .eq("nota_fiscal_id", notaFiscalId)
        .order("parcela_numero", { ascending: true }),
      supabase
        .from("estoque_movimentos")
        .select("*, produtos(id, nome, sku)")
        .eq("documento_id", notaFiscalId)
        .eq("documento_tipo", "fiscal")
        .order("created_at", { ascending: true }),
      supabase
        .from("nota_fiscal_eventos")
        .select("*")
        .eq("nota_fiscal_id", notaFiscalId)
        .order("data_evento", { ascending: false }),
      supabase
        .from("nota_fiscal_anexos")
        .select("*")
        .eq("nota_fiscal_id", notaFiscalId)
        .order("created_at", { ascending: false }),
    ]);
  return {
    items: it ?? [],
    lancamentos: lanc ?? [],
    movimentos: mov ?? [],
    eventos: ev ?? [],
    anexos: anx ?? [],
  };
}

/** Gera URL assinada (5 min) para um anexo fiscal no bucket `dbavizee`. */
export async function getNotaFiscalAnexoSignedUrl(
  caminhoStorage: string,
  expiresInSeconds = 300,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("dbavizee")
    .createSignedUrl(caminhoStorage, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Hard-delete genérico de tabelas suportadas pelo PermanentDeleteDialog. */
export type PermanentDeleteTable =
  | "funcionarios"
  | "transportadoras"
  | "formas_pagamento"
  | "grupos_economicos"
  | "notas_fiscais"
  | "orcamentos"
  | "clientes"
  | "fornecedores"
  | "produtos"
  | "cartoes_credito"
  | "bancos"
  | "financeiro_lancamentos";

export async function permanentDeleteRecord(
  table: PermanentDeleteTable,
  id: string,
): Promise<void> {
  const { error } = await supabase.rpc("hard_delete_record" as never, {
    p_table: table,
    p_id: id,
  } as never);
  if (error) throw error;
}
