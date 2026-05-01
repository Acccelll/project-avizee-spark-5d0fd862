/**
 * Contas Bancárias service — centraliza queries de bancos e contas bancárias
 * usadas em `pages/ContasBancarias.tsx` e diálogos relacionados.
 *
 * Segue o padrão definido em `docs/services-migration-plan.md`:
 *  - Funções tipadas retornando o domínio (não `{ data, error }`).
 *  - Erros são `throw`-ados; UX (toast/navegação) fica no caller.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Banco = Tables<"bancos"> & {
  fornecedores?: { id: string; nome_razao_social: string } | null;
};
export type ContaBancaria = Tables<"contas_bancarias"> & {
  bancos?: {
    nome: string;
    tipo: string | null;
    fornecedor_id?: string | null;
    fornecedores?: { id: string; nome_razao_social: string } | null;
  } | null;
};

export interface ContaInUseCounts {
  lancamentos: number;
  baixas: number;
  caixaMovs: number;
}

export async function listBancosAtivos(): Promise<Banco[]> {
  const { data, error } = await supabase
    .from("bancos")
    .select("*, fornecedores(id, nome_razao_social)")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data || []) as Banco[];
}

export async function listContasBancarias(): Promise<ContaBancaria[]> {
  const { data, error } = await supabase
    .from("contas_bancarias")
    .select("*, bancos(nome, tipo, fornecedor_id, fornecedores(id, nome_razao_social))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as ContaBancaria[];
}

export async function getContaInUseCounts(contaId: string): Promise<ContaInUseCounts> {
  const [{ count: lCount }, { count: bCount }, { count: cCount }] = await Promise.all([
    supabase
      .from("financeiro_lancamentos")
      .select("id", { count: "exact", head: true })
      .eq("conta_bancaria_id", contaId)
      .eq("ativo", true),
    supabase
      .from("financeiro_baixas")
      .select("id", { count: "exact", head: true })
      .eq("conta_bancaria_id", contaId),
    supabase
      .from("caixa_movimentos")
      .select("id", { count: "exact", head: true })
      .eq("conta_bancaria_id", contaId),
  ]);
  return {
    lancamentos: lCount ?? 0,
    baixas: bCount ?? 0,
    caixaMovs: cCount ?? 0,
  };
}

export async function createContaBancaria(payload: TablesInsert<"contas_bancarias">): Promise<void> {
  const { error } = await supabase.from("contas_bancarias").insert(payload);
  if (error) throw error;
}

export async function updateContaBancaria(
  id: string,
  patch: TablesUpdate<"contas_bancarias">,
): Promise<void> {
  const { error } = await supabase.from("contas_bancarias").update(patch).eq("id", id);
  if (error) throw error;
}

export async function inativarContaBancaria(id: string): Promise<void> {
  await updateContaBancaria(id, { ativo: false });
}

/**
 * Atualiza o fornecedor vinculado ao banco. Usado para DDA: lançamentos
 * gerados a partir de boletos do banco passam a herdar este fornecedor
 * como contraparte sugerida.
 */
export async function setBancoFornecedor(
  bancoId: string,
  fornecedorId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("bancos")
    .update({ fornecedor_id: fornecedorId })
    .eq("id", bancoId);
  if (error) throw error;
}