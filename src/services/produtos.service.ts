import { supabase } from "@/integrations/supabase/client";

/**
 * Service centralizando consultas usadas por `Produtos.tsx`.
 * RPCs `save_produto_composicao` e `save_produto_fornecedores` são atômicas
 * server-side e ficam encapsuladas aqui para evitar queries diretas na UI.
 */

export async function listGruposAtivos() {
  const { data, error } = await supabase
    .from("grupos_produto")
    .select("id, nome, sigla")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data || [];
}

/**
 * Próximo SKU disponível para o grupo informado.
 * Usa RPC atômica `proximo_sku_grupo` (mem://tech/numeracao-atomica-documentos).
 * Lança erro se o grupo não tiver `sigla` configurada.
 */
export async function proximoSkuDoGrupo(grupoId: string): Promise<string> {
  const { data, error } = await supabase.rpc("proximo_sku_grupo", { _grupo_id: grupoId });
  if (error) throw new Error(error.message);
  return String(data || "");
}

/** Atualiza a sigla de um grupo de produto (admin/editor). */
export async function updateGrupoSigla(grupoId: string, sigla: string | null): Promise<void> {
  const value = sigla?.trim().toUpperCase() || null;
  const { error } = await supabase
    .from("grupos_produto")
    .update({ sigla: value })
    .eq("id", grupoId);
  if (error) throw error;
  if (value) {
    // Reposiciona o contador a partir dos SKUs já existentes (não bloqueia em caso de erro).
    await supabase.rpc("inicializar_seq_sku_grupo", { _grupo_id: grupoId });
  }
}

export async function listFornecedoresParaProduto() {
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, nome_razao_social")
    .eq("ativo", true)
    .order("nome_razao_social");
  if (error) throw error;
  return data || [];
}

export async function listUnidadesMedidaAtivas() {
  const { data, error } = await supabase
    .from("unidades_medida")
    .select("id, codigo, descricao, sigla")
    .eq("ativo", true)
    .order("codigo");
  if (error) throw error;
  return data || [];
}

export async function createUnidadeMedida(input: {
  codigo: string;
  descricao: string;
  sigla: string | null;
}) {
  const { data, error } = await supabase
    .from("unidades_medida")
    .insert({ ...input, ativo: true })
    .select("id, codigo, descricao, sigla")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type ProdutoComposicaoRow = {
  id: string;
  produto_filho_id: string;
  quantidade: number;
  ordem: number;
  produtos: { nome: string; sku: string; preco_custo: number } | null;
};

export async function listProdutoComposicao(produtoPaiId: string): Promise<ProdutoComposicaoRow[]> {
  const { data, error } = await supabase
    .from("produto_composicoes")
    .select("id, produto_filho_id, quantidade, ordem, produtos:produto_filho_id(nome, sku, preco_custo)")
    .eq("produto_pai_id", produtoPaiId)
    .order("ordem");
  if (error) throw error;
  return (data || []) as unknown as ProdutoComposicaoRow[];
}

export type ProdutoFornecedorRow = {
  id: string;
  fornecedor_id: string;
  eh_principal: boolean | null;
  descricao_fornecedor: string | null;
  referencia_fornecedor: string | null;
  unidade_fornecedor: string | null;
  lead_time_dias: number | null;
  preco_compra: number | null;
  fator_conversao: number | null;
};

export async function listProdutoFornecedores(produtoId: string): Promise<ProdutoFornecedorRow[]> {
  const { data, error } = await supabase
    .from("produtos_fornecedores")
    .select("*")
    .eq("produto_id", produtoId);
  if (error) throw error;
  return (data || []) as ProdutoFornecedorRow[];
}

export async function saveProdutoComposicao(params: {
  produtoPaiId: string;
  itens: { produto_filho_id: string; quantidade: number }[];
  ehComposto: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("save_produto_composicao", {
    p_produto_pai_id: params.produtoPaiId,
    p_itens: params.itens,
    p_payload: { eh_composto: params.ehComposto },
  });
  if (error) throw new Error("Erro ao salvar composição: " + (error.message || "tente novamente"));
}

export async function saveProdutoFornecedores(params: {
  produtoId: string;
  itens: Array<{
    fornecedor_id: string;
    eh_principal: boolean;
    descricao_fornecedor: string;
    referencia_fornecedor: string;
    unidade_fornecedor: string;
    lead_time_dias: number | null;
    preco_compra: number | null;
    fator_conversao?: number | null;
  }>;
}): Promise<void> {
  const { error } = await supabase.rpc("save_produto_fornecedores", {
    p_produto_id: params.produtoId,
    p_itens: params.itens,
  });
  if (error) throw new Error("Erro ao salvar fornecedores: " + (error.message || "tente novamente"));
}

export async function deleteProduto(id: string): Promise<void> {
  const { error } = await supabase.from("produtos").delete().eq("id", id);
  if (error) throw error;
}

/** Lookup leve para autocompletes (id/nome/sku/codigo_interno). */
export async function listProdutosBasicAtivos() {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, sku, codigo_interno")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data || []) as { id: string; nome: string; sku: string; codigo_interno: string }[];
}

/** Vincula um produto a um fornecedor. */
export async function vincularProdutoFornecedor(input: {
  produto_id: string;
  fornecedor_id: string;
  preco_compra: number;
  lead_time_dias: number;
  eh_principal?: boolean;
}): Promise<void> {
  const { error } = await supabase.from("produtos_fornecedores").insert({
    produto_id: input.produto_id,
    fornecedor_id: input.fornecedor_id,
    preco_compra: input.preco_compra,
    lead_time_dias: input.lead_time_dias,
    eh_principal: input.eh_principal ?? false,
  });
  if (error) throw error;
}

// ── ProdutoView (drawer/detalhe) ──────────────────────────────────────────────

/**
 * Busca produto + dados auxiliares (histórico de NF, composição,
 * movimentos de estoque, vínculos com fornecedores e nome do grupo).
 * Usa Promise.allSettled internamente para não invalidar o detalhe se uma
 * sub-query falhar isoladamente.
 */
export async function fetchProdutoDetalhes(
  produtoId: string,
  signal: AbortSignal,
) {
  const { data: p, error: pError } = await supabase
    .from("produtos")
    .select("*")
    .eq("id", produtoId)
    .abortSignal(signal)
    .maybeSingle();
  if (pError) throw pError;
  if (!p) return null;

  const [comprasRes, vendasRes, compRes, movRes, fornRes, grupoRes] = await Promise.allSettled([
    supabase
      .from("notas_fiscais_itens")
      .select(
        "quantidade, valor_unitario, notas_fiscais!inner(id, numero, tipo, data_emissao, fornecedores(id, nome_razao_social))",
      )
      .eq("produto_id", p.id)
      .in("notas_fiscais.tipo", ["entrada", "compra"])
      .order("data_emissao", { foreignTable: "notas_fiscais", ascending: false })
      .abortSignal(signal)
      .limit(30),
    supabase
      .from("notas_fiscais_itens")
      .select(
        "quantidade, valor_unitario, notas_fiscais!inner(id, numero, tipo, data_emissao, clientes(id, nome_razao_social))",
      )
      .eq("produto_id", p.id)
      .in("notas_fiscais.tipo", ["saida", "venda"])
      .order("data_emissao", { foreignTable: "notas_fiscais", ascending: false })
      .abortSignal(signal)
      .limit(30),
    p.eh_composto
      ? supabase
          .from("produto_composicoes")
          .select("quantidade, ordem, produtos:produto_filho_id(id, nome, sku, preco_custo)")
          .eq("produto_pai_id", p.id)
          .abortSignal(signal)
          .order("ordem")
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("estoque_movimentos")
      .select("tipo, quantidade, motivo, created_at, saldo_anterior, saldo_atual")
      .eq("produto_id", p.id)
      .abortSignal(signal)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("produtos_fornecedores")
      .select(
        "preco_compra, lead_time_dias, referencia_fornecedor, eh_principal, unidade_fornecedor, fornecedores:fornecedor_id(id, nome_razao_social)",
      )
      .eq("produto_id", p.id)
      .abortSignal(signal),
    p.grupo_id
      ? supabase
          .from("grupos_produto")
          .select("nome")
          .eq("id", p.grupo_id)
          .abortSignal(signal)
          .maybeSingle()
      : Promise.resolve({ data: null as Record<string, unknown> | null }),
  ]);

  return { produto: p, comprasRes, vendasRes, compRes, movRes, fornRes, grupoRes };
}