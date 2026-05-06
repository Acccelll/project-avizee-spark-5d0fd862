import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { INVALIDATION_KEYS } from "@/services/_invalidationKeys";
import {
  faturarPedido,
  type FaturarPedidoVendaResult,
} from "@/services/comercial/pedidosVenda.service";

type FaturarPedidoResult = FaturarPedidoVendaResult;

/**
 * F-01: assinatura simplificada — só `pedidoId`. Os demais campos eram
 * passados pelos callers mas o service só usava `id`. Mantém a UI limpa
 * e evita falsa expectativa de que outros campos influenciam a RPC.
 */
export type FaturarPedidoInput = string;

/**
 * Wrapper RQ para `faturarPedido` (service comercial).
 */
export function useFaturarPedido() {
  const queryClient = useQueryClient();

  return useMutation<FaturarPedidoResult, Error, FaturarPedidoInput>({
    mutationFn: (pedidoId) => faturarPedido(pedidoId),
    onSuccess: (result) => {
      INVALIDATION_KEYS.faturamentoPedido.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
      toast.success(`NF ${result.nfNumero} gerada com sucesso!`);
    },
    onError: (err: Error) => {
      // BK-02: tratar contenda de lock de numeração da NF com mensagem específica.
      const msg = (err?.message || "").toLowerCase();
      if (
        msg.includes("lock_contention") ||
        msg.includes("could not obtain lock") ||
        msg.includes("lock timeout") ||
        msg.includes("deadlock")
      ) {
        toast.error("Outro faturamento em andamento", {
          description: "Aguarde alguns segundos e tente novamente. Outro usuário está gerando uma NF agora.",
        });
        return;
      }
      notifyError(err);
    },
  });
}
