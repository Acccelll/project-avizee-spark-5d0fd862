import { supabase } from "@/integrations/supabase/client";
import type { TableRow, TableInsert } from "@/types/domain";

export type ProdutoRow = TableRow<"produtos">;
export type EstoqueMovimentoRow = TableRow<"estoque_movimentos">;
export type EstoqueMovimentoInsert = TableInsert<"estoque_movimentos">;

export interface EstoqueMovimento extends EstoqueMovimentoRow {
  produtos?: { nome: string; sku: string | null } | null;
}

/** Simplified shape returned by the vw_estoque_posicao view. */
export interface EstoquePosicaoRow {
  produto_id: string;
  produto_nome: string;
  sku: string | null;
  codigo_interno: string | null;
  unidade_medida: string | null;
  estoque_minimo: number | null;
  preco_custo: number | null;
  preco_venda: number | null;
  ativo: boolean;
  estoque_atual: number;
  estoque_reservado: number;
  variacoes?: unknown;
}

function isLegacySku(value: string | null | undefined): boolean {
  return /^0+[A-Z0-9]+$/i.test(String(value ?? "").trim()) && /[A-Z]/i.test(String(value ?? "").trim());
}

export async function fetchProdutosEstoque(): Promise<ProdutoRow[]> {
  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error(error.message);
  return (data ?? []).filter((produto) => !isLegacySku(produto.sku));
}

/**
 * Fetches the aggregated stock position from the `vw_estoque_posicao` Supabase
 * view (see migration 20260411052000_create_vw_estoque_posicao.sql).
 *
 * The view consolidates saldo_atual and estoque_reservado per product so that
 * the frontend does not need to perform client-side aggregation.
 */
/**
 * Typed accessor for Supabase DB views not present in generated types.
 * Returns a standard query builder so `.select()`, `.order()`, etc. work.
 */
function fromView(viewName: string) {
  return (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
    .from(viewName);
}

export async function fetchEstoquePosicao(): Promise<EstoquePosicaoRow[]> {
  const { data, error } = await fromView("vw_estoque_posicao")
    .select("*")
    .order("produto_nome");

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as EstoquePosicaoRow[]).filter((row) => !isLegacySku(row.sku));
}

export async function fetchMovimentacoes(): Promise<EstoqueMovimento[]> {
  const { data, error } = await supabase
    .from("estoque_movimentos")
    .select("*, produtos(nome, sku)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as EstoqueMovimento[];
}

export async function fetchMovimentacoesPorProduto(
  produtoId: string,
): Promise<EstoqueMovimento[]> {
  const { data, error } = await supabase
    .from("estoque_movimentos")
    .select("*, produtos(nome, sku)")
    .eq("produto_id", produtoId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as EstoqueMovimento[];
}

export async function registrarMovimentacao(
  payload: EstoqueMovimentoInsert,
): Promise<void> {
  const { error: movError } = await supabase
    .from("estoque_movimentos")
    .insert(payload);

  if (movError) throw new Error(movError.message);
}

/* -------- Ajuste manual via RPC transacional -------- */

export type TipoAjusteEstoque = "entrada" | "saida" | "ajuste";

export interface AjusteEstoqueInput {
  produto_id: string;
  tipo: TipoAjusteEstoque;
  quantidade: number;
  motivo?: string;
  categoria_ajuste?: string;
  motivo_estruturado?: string;
}

/**
 * RPC `ajustar_estoque_manual` — atomicamente registra movimento e atualiza
 * `produtos.estoque_atual`.
 *
 * - tipo='entrada' / 'saida': quantidade somada/subtraída do saldo atual.
 * - tipo='ajuste': quantidade representa o saldo absoluto desejado.
 */
export async function ajustarEstoqueManual(input: AjusteEstoqueInput): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("ajustar_estoque_manual", {
    p_produto_id: input.produto_id,
    p_tipo: input.tipo,
    p_quantidade: input.quantidade,
    p_motivo: input.motivo ?? null,
    p_categoria_ajuste: input.categoria_ajuste ?? null,
    p_motivo_estruturado: input.motivo_estruturado ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
