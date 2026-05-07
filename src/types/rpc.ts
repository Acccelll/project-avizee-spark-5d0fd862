/**
 * Tipos e helpers para chamadas RPC ao PostgreSQL via Supabase.
 *
 * Centraliza o acesso tipado a `Database["public"]["Functions"]` para evitar
 * que hooks redeclarem assinaturas com `as any`. Use `RpcName`, `RpcArgs<…>`
 * e `RpcReturn<…>` para tipar callers; use `invokeRpc` quando preferir um
 * wrapper que já lança o erro do PostgREST e devolve o payload.
 *
 * O cliente Supabase gerado já é totalmente tipado, mas este módulo facilita
 * (a) descobrir o nome canônico das funções e (b) escrever testes que
 * stubbam RPCs sem perder type-safety.
 */

import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type RpcName = keyof Database["public"]["Functions"];

export type RpcArgs<N extends RpcName> =
  Database["public"]["Functions"][N]["Args"];

export type RpcReturn<N extends RpcName> =
  Database["public"]["Functions"][N]["Returns"];

/**
 * Invoca uma RPC pública e devolve o payload já tipado, lançando em caso
 * de erro do PostgREST.
 *
 * @example
 *   const num = await invokeRpc("proximo_numero_orcamento", {});
 */
export async function invokeRpc<N extends RpcName>(
  name: N,
  args: RpcArgs<N>,
): Promise<RpcReturn<N>> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as RpcReturn<N>;
}

// ─── Atalhos tipados para as RPCs mais usadas ───────────────────────────────
//
// Estes wrappers existem para (1) servir como índice descobrível das RPCs
// críticas do domínio e (2) garantir que callers usem o nome canônico — uma
// renomeação no banco quebra **aqui**, não em N hooks espalhados.
//
// Categorias seguem o roteiro do plano: numeração atômica, baixa financeira,
// conciliação bancária e ciclo fiscal.

// ── Numeração atômica de documentos ────────────────────────────────────────

export const proximoNumeroOrcamento = () =>
  invokeRpc("proximo_numero_orcamento", {} as RpcArgs<"proximo_numero_orcamento">);

export const proximoNumeroPedidoCompra = () =>
  invokeRpc("proximo_numero_pedido_compra", {} as RpcArgs<"proximo_numero_pedido_compra">);

// ── Baixa / conciliação financeira ─────────────────────────────────────────

export const sugerirConciliacaoBancaria = (
  args: RpcArgs<"sugerir_conciliacao_bancaria">,
) => invokeRpc("sugerir_conciliacao_bancaria", args);

export const registrarBaixaFinanceiraRpc = (
  args: RpcArgs<"registrar_baixa_financeira">,
) => invokeRpc("registrar_baixa_financeira", args);

export const registrarBaixaLoteFinanceiraRpc = (
  args: RpcArgs<"registrar_baixa_lote_financeira">,
) => invokeRpc("registrar_baixa_lote_financeira", args);

export const estornarBaixaFinanceiraRpc = (
  args: RpcArgs<"estornar_baixa_financeira">,
) => invokeRpc("estornar_baixa_financeira", args);

export const financeiroProcessarEstornoRpc = (
  args: RpcArgs<"financeiro_processar_estorno">,
) => invokeRpc("financeiro_processar_estorno", args);

export const financeiroConciliarBaixaRpc = (
  args: RpcArgs<"financeiro_conciliar_baixa">,
) => invokeRpc("financeiro_conciliar_baixa", args);

export const financeiroConciliarLoteRpc = (
  args: RpcArgs<"financeiro_conciliar_lote">,
) => invokeRpc("financeiro_conciliar_lote", args);

export const financeiroCancelarLancamentoRpc = (
  args: RpcArgs<"financeiro_cancelar_lancamento">,
) => invokeRpc("financeiro_cancelar_lancamento", args);

// ── Ciclo de pedidos de compra ─────────────────────────────────────────────

export const aprovarPedido = (args: RpcArgs<"aprovar_pedido">) =>
  invokeRpc("aprovar_pedido", args);

export const rejeitarPedido = (args: RpcArgs<"rejeitar_pedido">) =>
  invokeRpc("rejeitar_pedido", args);

export const cancelarPedidoCompra = (args: RpcArgs<"cancelar_pedido_compra">) =>
  invokeRpc("cancelar_pedido_compra", args);

export const receberCompra = (args: RpcArgs<"receber_compra">) =>
  invokeRpc("receber_compra", args);