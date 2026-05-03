/**
 * Cartões de Crédito service — CRUD de cartões e helpers de fatura.
 *
 * Segue o padrão dos outros services do módulo Financeiro:
 *  - Funções tipadas, throw em erro, sem UX.
 *  - Faturas são consultadas direto em `cartao_faturas`; criação on-demand
 *    é responsabilidade da RPC `cartao_fatura_para_data` (DB).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type CartaoCredito = Tables<"cartoes_credito"> & {
  bancos?: { nome: string } | null;
};
export type CartaoFatura = Tables<"cartao_faturas">;

export interface CartaoInUseCounts {
  lancamentos: number;
  faturas: number;
}

export async function listCartoes(): Promise<CartaoCredito[]> {
  const { data, error } = await supabase
    .from("cartoes_credito")
    .select("*, bancos(nome)")
    .order("nome");
  if (error) throw error;
  return (data || []) as CartaoCredito[];
}

export async function listCartoesAtivos(): Promise<CartaoCredito[]> {
  const { data, error } = await supabase
    .from("cartoes_credito")
    .select("*, bancos(nome)")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data || []) as CartaoCredito[];
}

export async function createCartao(payload: TablesInsert<"cartoes_credito">): Promise<void> {
  const { error } = await supabase.from("cartoes_credito").insert(payload);
  if (error) throw error;
}

export async function updateCartao(
  id: string,
  patch: TablesUpdate<"cartoes_credito">,
): Promise<void> {
  const { error } = await supabase.from("cartoes_credito").update(patch).eq("id", id);
  if (error) throw error;
}

export async function inativarCartao(id: string): Promise<void> {
  await updateCartao(id, { ativo: false });
}

export async function getCartaoInUseCounts(cartaoId: string): Promise<CartaoInUseCounts> {
  const [{ count: lCount }, { count: fCount }] = await Promise.all([
    supabase
      .from("financeiro_lancamentos")
      .select("id", { count: "exact", head: true })
      .eq("cartao_id", cartaoId)
      .eq("ativo", true),
    supabase
      .from("cartao_faturas")
      .select("id", { count: "exact", head: true })
      .eq("cartao_id", cartaoId),
  ]);
  return {
    lancamentos: lCount ?? 0,
    faturas: fCount ?? 0,
  };
}

/** Resolve (ou cria) a fatura correspondente a `data` para `cartaoId`. */
export async function cartaoFaturaParaData(
  cartaoId: string,
  data: string,
): Promise<string | null> {
  const { data: result, error } = await supabase.rpc("cartao_fatura_para_data", {
    p_cartao_id: cartaoId,
    p_data: data,
  });
  if (error) throw error;
  return (result as string | null) ?? null;
}

export async function listFaturasPorCartao(cartaoId: string): Promise<CartaoFatura[]> {
  const { data, error } = await supabase
    .from("cartao_faturas")
    .select("*")
    .eq("cartao_id", cartaoId)
    .order("competencia", { ascending: false });
  if (error) throw error;
  return (data || []) as CartaoFatura[];
}

/**
 * Agrega lançamentos do cartão na competência YYYY-MM, materializando uma
 * fatura consolidada como lançamento "a pagar" no Financeiro.
 * RPC idempotente — pode ser chamada várias vezes no mesmo período.
 */
export async function gerarFaturaCartao(
  cartaoId: string,
  competencia: string,
): Promise<{ ok: boolean; valor_total?: number; fatura_id?: string; erro?: string }> {
  const { data, error } = await supabase.rpc("gerar_fatura_cartao", {
    p_cartao_id: cartaoId,
    p_competencia: competencia,
  });
  if (error) throw error;
  return (data as { ok: boolean; valor_total?: number; fatura_id?: string; erro?: string }) ?? {
    ok: false,
    erro: "Sem retorno",
  };
}