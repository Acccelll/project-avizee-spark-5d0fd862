/**
 * Fornecedores service — operações que escapam do `useSupabaseCrud` em
 * `pages/Fornecedores.tsx`. O CRUD principal segue via hook genérico;
 * este módulo cobre vínculos com produtos.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ProdutoFornecedorRow {
  id: string;
  lead_time_dias: number | null;
  preco_compra: number | null;
  eh_principal: boolean | null;
  produtos: { nome: string } | null;
}

export interface CompraResumoRow {
  id: string;
  data_compra: string | null;
  valor_total: number | null;
}

export async function listProdutosDoFornecedor(
  fornecedorId: string,
  limit = 5,
): Promise<ProdutoFornecedorRow[]> {
  const { data, error } = await supabase
    .from("produtos_fornecedores")
    .select("id, lead_time_dias, preco_compra, eh_principal, produtos(nome)")
    .eq("fornecedor_id", fornecedorId)
    .order("eh_principal", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as ProdutoFornecedorRow[];
}

export async function listComprasDoFornecedor(
  fornecedorId: string,
  limit = 20,
): Promise<CompraResumoRow[]> {
  const { data, error } = await supabase
    .from("compras")
    .select("id, data_compra, valor_total")
    .eq("fornecedor_id", fornecedorId)
    .eq("ativo", true)
    .order("data_compra", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as CompraResumoRow[];
}

export async function deleteProdutoFornecedor(vinculoId: string): Promise<void> {
  const { error } = await supabase
    .from("produtos_fornecedores")
    .delete()
    .eq("id", vinculoId);
  if (error) throw error;
}

import { safeDelete } from "@/services/_shared/safeDelete";

/**
 * Remove (desativa) um fornecedor. Bloqueia se houver pedidos de compra,
 * NF-e de entrada ou lançamentos financeiros vinculados.
 */
export async function deleteFornecedor(
  id: string,
  opts?: { hardDelete?: boolean },
): Promise<void> {
  await safeDelete({
    table: "fornecedores",
    id,
    entityLabel: "Fornecedor",
    hardDelete: opts?.hardDelete,
    dependencies: [
      { table: "pedidos_compra", column: "fornecedor_id", label: "pedidos de compra" },
      { table: "compras", column: "fornecedor_id", label: "compras" },
      { table: "notas_fiscais", column: "fornecedor_id", label: "notas fiscais" },
      { table: "financeiro_lancamentos", column: "fornecedor_id", label: "lançamentos financeiros" },
    ],
  });
}

// ── FornecedorView (drawer/detalhe) ───────────────────────────────────────────

/**
 * Carrega fornecedor + auxiliares (pedidos de compra, financeiro,
 * produtos vinculados) usados no `FornecedorView`.
 */
export async function fetchFornecedorDetalhes(
  fornecedorId: string,
  signal: AbortSignal,
) {
  const { data: f, error: fError } = await supabase
    .from("fornecedores")
    .select("*")
    .eq("id", fornecedorId)
    .abortSignal(signal)
    .maybeSingle();
  if (fError) throw fError;
  if (!f) return null;

  const [cRes, finRes, pRes] = await Promise.all([
    supabase
      .from("pedidos_compra")
      .select("id, numero, data_pedido, valor_total, status")
      .eq("fornecedor_id", f.id)
      .order("data_pedido", { ascending: false })
      .limit(10)
      .abortSignal(signal),
    supabase
      .from("financeiro_lancamentos")
      .select("*")
      .eq("fornecedor_id", f.id)
      .order("data_vencimento", { ascending: false })
      .limit(10)
      .abortSignal(signal),
    supabase
      .from("produtos_fornecedores")
      .select("*, produtos(id, nome, sku)")
      .eq("fornecedor_id", f.id)
      .abortSignal(signal),
  ]);

  return { fornecedor: f, cRes, finRes, pRes };
}