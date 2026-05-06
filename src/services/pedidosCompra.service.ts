import { supabase } from "@/integrations/supabase/client";
import type { TableRow } from "@/types/domain";

export type PedidoCompraRow = TableRow<"pedidos_compra"> & {
  fornecedores?: { nome_razao_social: string | null; cpf_cnpj: string | null } | null;
};

export type PedidoCompraItemRow = TableRow<"pedidos_compra_itens"> & {
  produtos?: { nome: string | null; codigo_interno: string | null } | null;
};

export interface FornecedorAtivo {
  id: string;
  nome_razao_social: string | null;
  cpf_cnpj: string | null;
}

export interface ProdutoAtivoRow {
  id: string;
  nome: string | null;
  codigo_interno: string | null;
  preco_venda: number | null;
  preco_custo: number | null;
  unidade_medida: string | null;
  variacoes?: unknown;
}

export interface FormaPagamentoRow {
  id: string;
  descricao: string;
}

export interface CotacaoCompraResumo {
  numero: string;
  status: string;
}

/** Detalhe de um pedido de compra para a página de edição. */
export async function getPedidoCompra(id: string): Promise<PedidoCompraRow | null> {
  const { data, error } = await supabase
    .from("pedidos_compra")
    .select("*, fornecedores(nome_razao_social, cpf_cnpj)")
    .eq("id", String(id))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PedidoCompraRow | null;
}

export async function listPedidoCompraItens(pedidoId: string): Promise<PedidoCompraItemRow[]> {
  const { data, error } = await supabase
    .from("pedidos_compra_itens")
    .select("*, produtos(nome, codigo_interno)")
    .eq("pedido_compra_id", String(pedidoId));
  if (error) throw new Error(error.message);
  return (data ?? []) as PedidoCompraItemRow[];
}

export async function listFornecedoresAtivos(): Promise<FornecedorAtivo[]> {
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, nome_razao_social, cpf_cnpj")
    .eq("ativo", true)
    .order("nome_razao_social");
  if (error) throw new Error(error.message);
  return (data ?? []) as FornecedorAtivo[];
}

export async function listProdutosAtivos(): Promise<ProdutoAtivoRow[]> {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, codigo_interno, preco_venda, preco_custo, unidade_medida, variacoes")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as ProdutoAtivoRow[];
}

export async function listFormasPagamentoAtivas(): Promise<FormaPagamentoRow[]> {
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("id, descricao")
    .eq("ativo", true)
    .order("descricao");
  if (error) throw new Error(error.message);
  return (data ?? []) as FormaPagamentoRow[];
}

export async function getCotacaoResumoById(cotacaoId: string): Promise<CotacaoCompraResumo | null> {
  const { data, error } = await supabase
    .from("cotacoes_compra")
    .select("numero, status")
    .eq("id", cotacaoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as CotacaoCompraResumo | null;
}

/* ─────────── List helpers (usePedidosCompra) ─────────── */

export async function listPedidosCompra(): Promise<PedidoCompraRow[]> {
  const { data, error } = await supabase
    .from("pedidos_compra")
    .select("*, fornecedores(nome_razao_social, cpf_cnpj)")
    .eq("ativo", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return (data || []) as PedidoCompraRow[];
}

export async function listFornecedoresParaPedido() {
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, nome_razao_social, cpf_cnpj, ativo")
    .order("id", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listProdutosParaPedido() {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, codigo_interno, preco_venda, preco_custo, unidade_medida, ativo, variacoes")
    .eq("ativo", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listFormasPagamentoParaPedido() {
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("id, descricao")
    .eq("ativo", true)
    .order("descricao", { ascending: true });
  if (error) throw error;
  return (data || []) as { id: string; descricao: string }[];
}

/* ─────────── View drawer (usePedidosCompra.openView) ─────────── */

export async function listEstoqueMovimentosPorPedido(pedidoId: string | number) {
  const { data, error } = await supabase
    .from("estoque_movimentos")
    .select("*, produtos(nome, codigo_interno)")
    .eq("documento_id", String(pedidoId))
    .eq("documento_tipo", "pedido_compra");
  if (error) throw error;
  return data || [];
}

export async function getCotacaoResumoSimples(cotacaoId: string) {
  const { data, error } = await supabase
    .from("cotacoes_compra")
    .select("id, numero, status, data_cotacao")
    .eq("id", cotacaoId)
    .single();
  if (error) throw error;
  return data;
}

export async function listFinanceiroPorPedido(pedidoId: string | number) {
  const { data, error } = await supabase
    .from("financeiro_lancamentos")
    .select("id, descricao, valor, status, data_vencimento, tipo")
    .eq("pedido_compra_id", String(pedidoId))
    .eq("ativo", true);
  if (error) throw error;
  return data || [];
}

/* ─────────── Mutations ─────────── */

export async function insertPedidoCompra(payload: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("pedidos_compra")
    .insert(payload as never)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePedidoCompra(id: string | number, payload: Record<string, unknown>) {
  const { error } = await supabase
    .from("pedidos_compra")
    .update(payload as never)
    .eq("id", String(id));
  if (error) throw error;
}

export async function deletePedidoCompraItens(pedidoId: string | number) {
  const { error } = await supabase
    .from("pedidos_compra_itens")
    .delete()
    .eq("pedido_compra_id", String(pedidoId));
  if (error) throw error;
}

export async function insertPedidoCompraItens(rows: Array<Record<string, unknown>>) {
  const { error } = await supabase.from("pedidos_compra_itens").insert(rows as never);
  if (error) throw error;
}

export async function deletePedidoCompraHard(id: string | number) {
  const { error } = await supabase.from("pedidos_compra").delete().eq("id", String(id));
  if (error) throw error;
}

export async function softDeletePedidoCompra(id: string | number) {
  const { error } = await supabase.from("pedidos_compra").update({ ativo: false }).eq("id", String(id));
  if (error) throw error;
}

export async function listPedidoItensParaRecebimento(pedidoId: string | number) {
  const { data, error } = await supabase
    .from("pedidos_compra_itens")
    .select("id, produto_id, quantidade, quantidade_recebida, preco_unitario")
    .eq("pedido_compra_id", String(pedidoId));
  if (error) throw error;
  return data || [];
}

export async function marcarPedidoEnviado(id: string | number) {
  const { error } = await supabase
    .from("pedidos_compra")
    .update({ status: "enviado_ao_fornecedor" })
    .eq("id", String(id));
  if (error) throw error;
}

export async function solicitarAprovacaoPedido(pedidoId: string | number) {
  const { data, error } = await supabase.rpc("solicitar_aprovacao_pedido", { p_pedido_id: String(pedidoId) });
  if (error) throw error;
  return data as { status?: string } | null;
}
