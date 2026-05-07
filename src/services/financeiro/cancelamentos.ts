/**
 * Cancelamento de lançamentos financeiros.
 *
 * Cancela um lançamento (não pago, sem baixas ativas) via RPC oficial
 * `financeiro_cancelar_lancamento`. O registro é preservado com
 * status='cancelado' para manter a trilha de auditoria.
 *
 * Extraído de `src/services/financeiro.service.ts` (Fase 5 — limpeza estrutural).
 */
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { logger } from "@/lib/logger";
import { financeiroCancelarLancamentoRpc } from "@/types/rpc";

export async function cancelarLancamento(
  lancamentoId: string,
  motivo: string,
): Promise<boolean> {
  try {
    if (!motivo || motivo.trim().length < 5) {
      toast.error("Informe um motivo para o cancelamento (mínimo 5 caracteres).");
      return false;
    }
    await financeiroCancelarLancamentoRpc({
      p_id: lancamentoId,
      p_motivo: motivo.trim(),
    });
    toast.success("Lançamento cancelado com sucesso.");
    return true;
  } catch (error) {
    logger.error("[financeiro] erro ao cancelar:", error);
    notifyError(error);
    return false;
  }
}