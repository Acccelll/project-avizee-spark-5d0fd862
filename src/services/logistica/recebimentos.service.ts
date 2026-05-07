import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";

export interface RegistrarRecebimentoInput {
  pedido_compra_id: string;
  data_recebimento: string;
  itens: Array<{ pedido_item_id: string; qtd_recebida: number }>;
  observacoes?: string;
  nota_fiscal_id?: string;
  compra_id?: string;
}

export async function registrarRecebimento(input: RegistrarRecebimentoInput): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("registrar_recebimento_compra", {
    p_pedido_compra_id: input.pedido_compra_id,
    p_data_recebimento: input.data_recebimento,
    p_itens: input.itens,
    p_observacoes: input.observacoes ?? null,
    p_nota_fiscal_id: input.nota_fiscal_id ?? null,
    p_compra_id: input.compra_id ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function marcarDivergencia(recebimentoId: string, motivo: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("recebimentos_compra")
    .update({ tem_divergencia: true, motivo_divergencia: motivo })
    .eq("id", recebimentoId);
  if (error) throw new Error(error.message);
}

export function useRecebimentosPorPedido(pedidoCompraId: string | null) {
  return useQuery({
    queryKey: ["recebimentos-compra", pedidoCompraId],
    enabled: Boolean(pedidoCompraId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("recebimentos_compra")
        .select("*, recebimentos_compra_itens(*)")
        .eq("pedido_compra_id", pedidoCompraId)
        .order("data_recebimento", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useRegistrarRecebimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: registrarRecebimento,
    onSuccess: () => {
      toast.success("Recebimento registrado");
      qc.invalidateQueries({ queryKey: ["recebimentos"] });
      qc.invalidateQueries({ queryKey: ["recebimentos-compra"] });
      qc.invalidateQueries({ queryKey: ["estoque-posicao"] });
      qc.invalidateQueries({ queryKey: ["estoque-movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["pedidos-compra"] });
    },
    onError: (err: Error) => notifyError(err),
  });
}