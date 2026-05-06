import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/utils/errorMessages";
import { INVALIDATION_KEYS } from "@/services/_invalidationKeys";

interface SalvarPedidoInput {
  id: string;
  patch: {
    status?: string | null;
    po_number?: string | null;
    data_po_cliente?: string | null;
    data_prometida_despacho?: string | null;
    prazo_despacho_dias?: number | null;
    observacoes?: string | null;
  };
}

/**
 * Atualiza dados operacionais do pedido e invalida queries cross-módulo.
 * Substitui o `update` direto que vivia em `PedidoForm.handleSave` para
 * garantir que grid de Pedidos/dashboard reflitam sem refresh manual.
 */
export function useSalvarPedido() {
  const qc = useQueryClient();
  return useMutation<void, Error, SalvarPedidoInput>({
    mutationFn: async ({ id, patch }) => {
      // F-02: usa RPC `salvar_pedido_operacional` (SECURITY DEFINER + search_path)
      // para garantir trilha de auditoria via trigger único e validações server-side.
      const { error } = await supabase.rpc("salvar_pedido_operacional", {
        p_id: id,
        p_patch: patch as never,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      INVALIDATION_KEYS.faturamentoPedido.forEach((key) => {
        qc.invalidateQueries({ queryKey: [key] });
      });
      toast.success("Pedido atualizado com sucesso.");
    },
    onError: (err) => notifyError(err),
  });
}