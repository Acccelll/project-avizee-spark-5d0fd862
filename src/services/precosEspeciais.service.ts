/**
 * Preços especiais — encapsula CRUD da tabela `precos_especiais`,
 * usada pelo componente PrecosEspeciaisTab.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PrecoEspecialRow {
  id: string;
  cliente_id: string | null;
  produto_id: string | null;
  preco_especial: number;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  clientes: { nome_razao_social: string } | null;
  produtos: { nome: string; sku: string | null; preco_venda: number | null; variacoes: unknown } | null;
}

export interface PrecoEspecialPayload {
  cliente_id: string;
  produto_id: string;
  preco_especial: number;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
}

export async function listPrecosEspeciais(filters: {
  clienteId?: string;
  produtoId?: string;
}): Promise<PrecoEspecialRow[]> {
  let query = supabase
    .from("precos_especiais")
    .select("*, clientes(nome_razao_social), produtos(nome, sku, preco_venda, variacoes)")
    .eq("ativo", true);
  if (filters.clienteId) query = query.eq("cliente_id", filters.clienteId);
  if (filters.produtoId) query = query.eq("produto_id", filters.produtoId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as PrecoEspecialRow[];
}

export async function listClientesAtivosBasic() {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome_razao_social")
    .eq("ativo", true);
  if (error) throw error;
  return data || [];
}

export async function listProdutosAtivosBasic() {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, sku, variacoes")
    .eq("ativo", true);
  if (error) throw error;
  return data || [];
}

export async function upsertPrecoEspecial(
  payload: PrecoEspecialPayload,
  editingId: string | null,
): Promise<void> {
  if (editingId) {
    const { error } = await supabase
      .from("precos_especiais")
      .update(payload)
      .eq("id", editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("precos_especiais").insert(payload);
    if (error) throw error;
  }
}

export async function softDeletePrecoEspecial(id: string): Promise<void> {
  const { error } = await supabase
    .from("precos_especiais")
    .update({ ativo: false })
    .eq("id", id);
  if (error) throw error;
}
