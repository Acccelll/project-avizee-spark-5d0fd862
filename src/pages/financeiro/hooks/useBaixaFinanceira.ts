import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { logger } from "@/lib/logger";
import {
  registrarBaixaFinanceira,
  estornarBaixaFinanceira,
  gerarParcelasFinanceirasRpc,
  gerarFinanceiroFolhaRpc,
  type RegistrarBaixaParams,
  type GerarParcelasBase,
} from "@/services/financeiro/baixaRpc";

export type { RegistrarBaixaParams };

/**
 * Registra baixa transacional (total ou parcial) usando RPC.
 * Atualiza saldo do lançamento, conta bancária e gera movimento de caixa atomicamente.
 */
export function useRegistrarBaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: RegistrarBaixaParams) => registrarBaixaFinanceira(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financeiro", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro", "kpis"] });
      qc.invalidateQueries({ queryKey: ["contas_bancarias"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Baixa registrada com sucesso");
    },
    onError: (error) => {
      logger.error("[financeiro] erro ao registrar baixa:", error);
      notifyError(error);
    },
  });
}

/**
 * Estorna uma baixa específica (devolvendo saldo à conta bancária).
 */
export function useEstornarBaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { baixaId: string; motivo?: string }) => estornarBaixaFinanceira(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financeiro", "lancamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro", "kpis"] });
      qc.invalidateQueries({ queryKey: ["contas_bancarias"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Baixa estornada com sucesso");
    },
    onError: (error) => {
      logger.error("[financeiro] erro ao estornar baixa:", error);
      notifyError(error);
    },
  });
}

export interface GerarParcelasParams {
  base: GerarParcelasBase;
  numParcelas: number;
  intervaloDias?: number;
}

/**
 * Gera parcelas atomicamente (agrupador + N filhas) via RPC.
 */
export function useGerarParcelas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: GerarParcelasParams) => gerarParcelasFinanceirasRpc(params),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["financeiro"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa"] });
      toast.success(`${vars.numParcelas} parcelas geradas com sucesso`);
    },
    onError: (error) => {
      logger.error("[financeiro] erro ao gerar parcelas:", error);
      notifyError(error);
    },
  });
}

/**
 * Gera lançamentos financeiros a partir da folha de pagamento (idempotente).
 */
export function useGerarFinanceiroFolha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { competencia: string; dataVencimento: string }) =>
      gerarFinanceiroFolhaRpc(input),
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["financeiro"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa"] });
      qc.invalidateQueries({ queryKey: ["folha"] });
      toast.success(count > 0 ? `${count} lançamentos gerados` : "Nenhum lançamento novo a gerar");
    },
    onError: (error) => {
      logger.error("[financeiro] erro ao gerar financeiro da folha:", error);
      notifyError(error);
    },
  });
}
