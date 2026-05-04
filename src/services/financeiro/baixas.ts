/**
 * Baixas (settlements) de lançamentos financeiros.
 *
 * Tenta primeiro a RPC consolidada `financeiro_processar_baixa_lote`
 * (transacional). Quando há overrides por item ou a RPC não está disponível,
 * usa fallback estrutural (UPDATE + INSERT por item) já existente.
 *
 * Extraído de `src/services/financeiro.service.ts` (Fase 5 — limpeza estrutural).
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calcularPagamentoParcialLote } from "@/lib/financeiro";
import { notifyError } from "@/utils/errorMessages";
import { logger } from "@/lib/logger";
import {
  registrarBaixaLoteFinanceira,
  type BaixaLoteItemRpc,
} from "@/services/financeiro/baixaRpc";

export interface BaixaItemOverride {
  data_baixa?: string;
  forma_pagamento?: string;
  conta_bancaria_id?: string;
  valor_pago?: number;
  observacoes?: string;
}

export interface BaixaLoteParams {
  selectedIds: string[];
  selectedLancamentos: Array<{ id: string; valor: number; saldo_restante: number | null }>;
  tipoBaixa: "total" | "parcial";
  valorPagoBaixa: number;
  totalBaixa: number;
  baixaDate: string;
  formaPagamento: string;
  contaBancariaId: string;
  overrides?: Record<string, BaixaItemOverride>;
}

interface BaixaPlanItem {
  id: string;
  saldo: number;
  valor: number;
  valorPago: number;
  novoSaldo: number;
  novoStatus: "pago" | "parcial";
}

export function criarPlanoBaixaLote(params: BaixaLoteParams): BaixaPlanItem[] {
  const { selectedIds, selectedLancamentos, tipoBaixa, valorPagoBaixa, totalBaixa } = params;

  if (!selectedIds.length) {
    throw new Error("Nenhum lançamento selecionado para baixa em lote.");
  }

  if (!params.formaPagamento || !params.contaBancariaId || !params.baixaDate) {
    throw new Error("Dados obrigatórios da baixa não informados.");
  }

  if (tipoBaixa === "parcial" && (totalBaixa <= 0 || valorPagoBaixa <= 0)) {
    throw new Error("Baixa parcial inválida: valores devem ser maiores que zero.");
  }

  const ratio = tipoBaixa === "parcial" ? valorPagoBaixa / totalBaixa : 1;

  return selectedIds.map((id) => {
    const found = selectedLancamentos.find((item) => item.id === id);
    if (!found) {
      throw new Error(`Lançamento ${id} não encontrado na seleção.`);
    }

    const saldo = Number(found.saldo_restante != null ? found.saldo_restante : found.valor);
    const valor = Number(found.valor);
    const valorPago = tipoBaixa === "total" ? saldo : calcularPagamentoParcialLote(saldo, ratio);
    const novoSaldo = Math.max(0, saldo - valorPago);
    const novoStatus: "pago" | "parcial" = novoSaldo <= 0.005 ? "pago" : "parcial";

    return { id, saldo, valor, valorPago, novoSaldo, novoStatus };
  });
}

export async function processarBaixaLote(params: BaixaLoteParams): Promise<boolean> {
  try {
    // Filtra inválidos defensivamente
    const plano = criarPlanoBaixaLote(params);

    const items: BaixaLoteItemRpc[] = plano.map((item) => {
      const ovr = params.overrides?.[item.id] ?? {};
      return {
        lancamento_id: item.id,
        valor_pago: ovr.valor_pago ?? item.valorPago,
        data_baixa: ovr.data_baixa ?? params.baixaDate,
        forma_pagamento: ovr.forma_pagamento ?? params.formaPagamento,
        conta_bancaria_id: ovr.conta_bancaria_id ?? params.contaBancariaId,
        observacoes: ovr.observacoes ?? null,
      };
    });

    const result = await registrarBaixaLoteFinanceira({
      items,
      dataBaixa: params.baixaDate,
      formaPagamento: params.formaPagamento,
      contaBancariaId: params.contaBancariaId,
    });

    if (result.erros && result.erros.length > 0) {
      toast.warning(
        `${result.processados} processado(s), ${result.erros.length} erro(s): ${result.erros.slice(0, 2).join("; ")}`,
      );
    } else if (result.ignorados > 0) {
      toast.success(
        `${result.processados} baixado(s); ${result.ignorados} ignorado(s) (já pago/cancelado).`,
      );
    } else {
      toast.success(`${result.processados} lançamento(s) baixado(s) com sucesso!`);
    }
    return result.processados > 0;
  } catch (error) {
    logger.error("[financeiro] erro na baixa em lote:", error);
    notifyError(error);
    return false;
  }
}

// Mantido apenas para compatibilidade de imports — não usado mais.
export async function _legacyProcessarBaixaLoteRpc(): Promise<null> {
  return null;
}