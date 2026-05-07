import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type NotaFiscalUpdate = Database["public"]["Tables"]["notas_fiscais"]["Update"];
type NotaFiscalInsert = Database["public"]["Tables"]["notas_fiscais"]["Insert"];
type NotaFiscalItemInsert =
  Database["public"]["Tables"]["notas_fiscais_itens"]["Insert"];

// ── Cancelamento / Inutilização ───────────────────────────────────────────────

/**
 * Cancelamento interno da NF (status_sefaz != autorizada).
 * Estorna efeitos automaticamente quando NF estava confirmada.
 * Para NF autorizada na SEFAZ, use `cancelarNotaFiscalSefaz`.
 */
export async function cancelarNotaFiscal(nfId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("cancelar_nota_fiscal", {
    p_nf_id: nfId,
    p_motivo: motivo,
  });
  if (error) throw error;
}

/**
 * Cancelamento via SEFAZ (somente NFs autorizadas).
 * Atualiza status_sefaz para `cancelada_sefaz` preservando integridade contábil.
 */
export async function cancelarNotaFiscalSefaz(
  nfId: string,
  protocolo: string,
  motivo: string,
): Promise<void> {
  const { error } = await supabase.rpc("cancelar_nota_fiscal_sefaz", {
    p_nf_id: nfId,
    p_protocolo: protocolo,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function inutilizarNotaFiscal(
  nfId: string,
  protocolo: string,
  motivo: string,
): Promise<void> {
  const { error } = await supabase.rpc("inutilizar_nota_fiscal", {
    p_nf_id: nfId,
    p_protocolo: protocolo,
    p_motivo: motivo,
  });
  if (error) throw error;
}

// ── Confirmar / Estornar / Devolver ───────────────────────────────────────────

export async function confirmarNotaFiscal(nfId: string): Promise<void> {
  const { error } = await supabase.rpc("confirmar_nota_fiscal", { p_nf_id: nfId });
  if (error) throw error;
}

export async function estornarNotaFiscal(input: { nfId: string; motivo?: string }): Promise<void> {
  const { error } = await supabase.rpc("estornar_nota_fiscal", {
    p_nf_id: input.nfId,
    p_motivo: input.motivo,
  });
  if (error) throw error;
}

export interface ItemDevolucao {
  produto_id: string;
  quantidade: number;
}

export async function gerarDevolucaoNotaFiscal(input: {
  nfOrigemId: string;
  /** Quando omitido, gera devolução total. */
  itens?: ItemDevolucao[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("gerar_devolucao_nota_fiscal", {
    p_nf_origem_id: input.nfOrigemId,
    p_itens: (input.itens ?? null) as never,
  });
  if (error) throw error;
  return data as string;
}

// ── Salvar (upsert atômico cabeçalho + itens) ─────────────────────────────────

/**
 * Salva uma NF (insert ou update) e substitui seus itens em UMA transação
 * server-side via RPC `salvar_nota_fiscal`. Atômico: se qualquer passo
 * (cabeçalho, delete de itens, insert de itens) falhar, nada é persistido.
 */
export async function upsertNotaFiscalComItens(params: {
  mode: "create" | "edit";
  nfId?: string;
  payload: NotaFiscalInsert & NotaFiscalUpdate;
  itemsBuilder: (nfId: string) => NotaFiscalItemInsert[];
}): Promise<string> {
  const { mode, nfId, payload, itemsBuilder } = params;
  if (mode === "edit" && !nfId) {
    throw new Error("nfId obrigatório para edit");
  }
  const placeholderId = nfId ?? "00000000-0000-0000-0000-000000000000";
  const itensRaw = itemsBuilder(placeholderId);
  const itensPayload = itensRaw.map(({ nota_fiscal_id: _ignored, ...rest }) => rest);
  const { data, error } = await supabase.rpc("salvar_nota_fiscal", {
    p_nf_id: mode === "edit" ? (nfId as string) : null,
    p_payload: payload as unknown as Json,
    p_itens: itensPayload as unknown as Json,
  });
  if (error) throw error;
  if (!data) throw new Error("RPC salvar_nota_fiscal não retornou id");
  return data as string;
}

// ── Vínculo NF ↔ Pedido de Compra ─────────────────────────────────────────────

export async function vincularNFPedidoCompra(input: {
  notaFiscalId: string;
  pedidoCompraId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("vincular_nf_pedido_compra", {
    p_nf_id: input.notaFiscalId,
    p_pedido_id: input.pedidoCompraId,
  });
  if (error) throw error;
}

export async function desvincularNFPedidoCompra(notaFiscalId: string): Promise<void> {
  const { error } = await supabase
    .from("notas_fiscais")
    .update({ pedido_compra_id: null })
    .eq("id", notaFiscalId);
  if (error) throw error;
}
