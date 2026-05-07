/**
 * Estorno de baixas financeiras.
 *
 * GRANULARIDADE — leia antes de escolher o caminho:
 *
 *  - `processarEstorno(lancamentoId)` (este arquivo)
 *      → estorna **todas as baixas ativas** de um lançamento (lote).
 *      → entrada: tela de drawer, botão principal "Estornar".
 *
 *  - `estornarBaixaFinanceira({ baixaId })` (`baixaRpc.ts`)
 *      → estorna **uma baixa específica** por ID (unitário).
 *      → entrada: histórico de baixas com botão por linha.
 *
 * Estratégia em duas camadas:
 *  1) Tenta RPC consolidada `financeiro_processar_estorno` (transacional, lote).
 *  2) Fallback: itera baixas ativas e chama `estornar_baixa_financeira` por baixa.
 *     O trigger `trg_sync_financeiro_saldo` recalcula valor_pago/saldo/status.
 *
 * Extraído de `src/services/financeiro.service.ts` (Fase 5 — limpeza estrutural).
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { logger } from "@/lib/logger";
import {
  financeiroProcessarEstornoRpc,
  estornarBaixaFinanceiraRpc,
} from "@/types/rpc";

async function processarEstornoRpc(
  lancamentoId: string,
  motivoEstorno?: string,
): Promise<boolean | null> {
  try {
    await financeiroProcessarEstornoRpc({
      p_lancamento_id: lancamentoId,
      p_motivo: motivoEstorno ?? undefined,
    });
    return true;
  } catch (err) {
    const e = err as { message?: string; code?: string };
    if (
      String(e.message || "").toLowerCase().includes("function financeiro_processar_estorno") ||
      e.code === "PGRST202"
    ) {
      return null;
    }
    throw err;
  }
}

export async function processarEstorno(
  lancamentoId: string,
  motivoEstorno?: string,
): Promise<boolean> {
  try {
    const rpcResult = await processarEstornoRpc(lancamentoId, motivoEstorno);
    if (rpcResult === true) {
      toast.success("Estorno realizado com sucesso!");
      return true;
    }

    const { data: baixas, error: baixasError } = await supabase
      .from("financeiro_baixas")
      .select("id")
      .eq("lancamento_id", lancamentoId)
      .is("estornada_em", null);

    if (baixasError) throw baixasError;
    if (!baixas || baixas.length === 0) {
      throw new Error("Nenhuma baixa ativa encontrada para estornar.");
    }

    for (const b of baixas) {
      await estornarBaixaFinanceiraRpc({
        p_baixa_id: b.id,
        p_motivo: motivoEstorno || "Estorno via interface",
      });
    }

    toast.success("Estorno realizado com sucesso!");
    return true;
  } catch (error) {
    logger.error("[financeiro] erro ao estornar:", error);
    notifyError(error);
    return false;
  }
}