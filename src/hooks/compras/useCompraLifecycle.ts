import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import * as pcs from "@/services/pedidosCompra.service";
import {
  aprovarPedido as rpcAprovarPedido,
  rejeitarPedido as rpcRejeitarPedido,
  cancelarPedidoCompra as rpcCancelarPedidoCompra,
} from "@/types/rpc";
import type { PedidoCompra } from "@/components/compras/pedidoCompraTypes";

/**
 * Ações de ciclo de vida de Pedido de Compra:
 *  - solicitar aprovação / aprovar / rejeitar
 *  - marcar enviado
 *  - cancelar (motivo obrigatório)
 *  - soft delete
 *
 * Extraído de `usePedidosCompra` para reduzir o tamanho do hook.
 * Não muda comportamento.
 */
export function useCompraLifecycle(opts: {
  refreshAll: () => Promise<void>;
  setDrawerOpen: (v: boolean) => void;
  selected: PedidoCompra | null;
}) {
  const { refreshAll, setDrawerOpen, selected } = opts;

  const solicitarAprovacao = async (p: PedidoCompra) => {
    try {
      const data = await pcs.solicitarAprovacaoPedido(p.id);
      const status = data?.status;
      if (status === "aguardando_aprovacao") {
        toast.success("Pedido enviado para aprovação.");
      } else {
        toast.success("Pedido aprovado automaticamente.");
      }
      await refreshAll();
    } catch (err: unknown) {
      console.error("[solicitarAprovacao]", err);
      notifyError(err);
    }
  };

  const aprovarPedido = async (p: PedidoCompra) => {
    try {
      await rpcAprovarPedido({ p_pedido_id: String(p.id) });
      toast.success("Pedido aprovado.");
      setDrawerOpen(false);
      await refreshAll();
    } catch (err: unknown) {
      console.error("[aprovarPedido]", err);
      notifyError(err);
    }
  };

  const rejeitarPedido = async (p: PedidoCompra, motivo: string) => {
    if (!motivo.trim()) {
      toast.error("Informe o motivo da rejeição.");
      return;
    }
    try {
      await rpcRejeitarPedido({ p_pedido_id: String(p.id), p_motivo: motivo });
      toast.success("Pedido rejeitado.");
      setDrawerOpen(false);
      await refreshAll();
    } catch (err: unknown) {
      console.error("[rejeitarPedido]", err);
      notifyError(err);
    }
  };

  const marcarEnviado = async (p: PedidoCompra) => {
    try {
      await pcs.marcarPedidoEnviado(p.id);
      toast.success("Pedido marcado como enviado ao fornecedor.");
      await refreshAll();
    } catch (err: unknown) {
      console.error("[marcarEnviado]", err);
      notifyError(err);
    }
  };

  const cancelarPedido = async (p: PedidoCompra, motivo?: string) => {
    const motivoTrim = (motivo ?? "").trim();
    if (!motivoTrim) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    try {
      await rpcCancelarPedidoCompra({ p_id: String(p.id), p_motivo: motivoTrim });
      toast.success("Pedido de compra cancelado.");
      setDrawerOpen(false);
      await refreshAll();
    } catch (err: unknown) {
      console.error("[cancelarPedido]", err);
      notifyError(err);
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    await pcs.softDeletePedidoCompra(selected.id);
    await refreshAll();
    toast.success("Removido!");
  };

  return {
    solicitarAprovacao,
    aprovarPedido,
    rejeitarPedido,
    marcarEnviado,
    cancelarPedido,
    deleteSelected,
  };
}
