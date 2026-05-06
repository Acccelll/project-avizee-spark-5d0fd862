import { supabase } from "@/integrations/supabase/client";

export interface CancelarPedidoVendaResult {
  id: string;
  numero: string;
  status: string;
}

export interface FaturarPedidoVendaResult {
  nfId: string;
  nfNumero: string;
}

/**
 * RPC transacional `gerar_nf_de_pedido`.
 * Numera NF, copia itens com dados fiscais, atualiza status e registra evento fiscal.
 */
export async function faturarPedido(pedidoId: string): Promise<FaturarPedidoVendaResult> {
  const { data, error } = await supabase.rpc("gerar_nf_de_pedido", { p_pedido_id: pedidoId });
  if (error) throw new Error(error.message);
  const r = data as { nf_id: string; nf_numero: string };
  return { nfId: r.nf_id, nfNumero: r.nf_numero };
}

/**
 * RPC `cancelar_pedido_venda`. Bloqueia se houver NF ativa vinculada.
 */
export async function cancelarPedidoVenda(input: {
  id: string;
  motivo?: string | null;
}): Promise<CancelarPedidoVendaResult> {
  const { data, error } = await supabase.rpc("cancelar_pedido_venda", {
    p_id: input.id,
    p_motivo: input.motivo ?? undefined,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CancelarPedidoVendaResult;
}