import { supabase } from "@/integrations/supabase/client";
import {
  registrarBaixaFinanceiraRpc,
  registrarBaixaLoteFinanceiraRpc,
  estornarBaixaFinanceiraRpc,
} from "@/types/rpc";

/* -------- Baixa transacional (RPCs) -------- */

export interface RegistrarBaixaParams {
  lancamentoId: string;
  valorPago: number;
  dataBaixa: string;
  formaPagamento: string;
  contaBancariaId: string;
  observacoes?: string | null;
  desconto?: number;
  juros?: number;
  multa?: number;
  abatimento?: number;
  grupoBaixaId?: string | null;
}

export async function registrarBaixaFinanceira(params: RegistrarBaixaParams): Promise<string> {
  return registrarBaixaFinanceiraRpc({
    p_lancamento_id: params.lancamentoId,
    p_valor_pago: params.valorPago,
    p_data_baixa: params.dataBaixa,
    p_forma_pagamento: params.formaPagamento,
    p_conta_bancaria_id: params.contaBancariaId,
    p_observacoes: params.observacoes ?? undefined,
    p_desconto: params.desconto ?? 0,
    p_juros: params.juros ?? 0,
    p_multa: params.multa ?? 0,
    p_abatimento: params.abatimento ?? 0,
    p_grupo_baixa_id: params.grupoBaixaId ?? undefined,
  });
}

/* -------- Baixa em lote (RPC oficial) -------- */

export interface BaixaLoteItemRpc {
  lancamento_id: string;
  valor_pago: number;
  data_baixa?: string;
  forma_pagamento?: string;
  conta_bancaria_id?: string;
  observacoes?: string | null;
  desconto?: number;
  juros?: number;
  multa?: number;
  abatimento?: number;
}

export interface RegistrarBaixaLoteParams {
  items: BaixaLoteItemRpc[];
  dataBaixa: string;
  formaPagamento: string;
  contaBancariaId: string;
  observacoes?: string | null;
}

export interface RegistrarBaixaLoteResult {
  grupo_id: string;
  processados: number;
  ignorados: number;
  erros: string[];
}

export async function registrarBaixaLoteFinanceira(
  params: RegistrarBaixaLoteParams,
): Promise<RegistrarBaixaLoteResult> {
  const data = await registrarBaixaLoteFinanceiraRpc({
    p_items: params.items as unknown as import("@/integrations/supabase/types").Json,
    p_data_baixa: params.dataBaixa,
    p_forma_pagamento: params.formaPagamento,
    p_conta_bancaria_id: params.contaBancariaId,
    p_observacoes: params.observacoes ?? undefined,
  });
  return data as unknown as RegistrarBaixaLoteResult;
}

export async function estornarBaixaFinanceira(input: {
  baixaId: string;
  motivo?: string;
}): Promise<void> {
  /**
   * Estorna UMA baixa específica por ID. Para estornar TODAS as baixas
   * ativas de um lançamento, use `processarEstorno(lancamentoId)` em
   * `services/financeiro/estornos.ts`.
   */
  await estornarBaixaFinanceiraRpc({
    p_baixa_id: input.baixaId,
    p_motivo: input.motivo,
  });
}

/* -------- Geração de parcelas -------- */

export interface GerarParcelasBase {
  tipo: "receber" | "pagar";
  descricao: string;
  valor: number;
  data_vencimento: string;
  forma_pagamento?: string | null;
  banco?: string | null;
  cartao?: string | null;
  cartao_id?: string | null;
  cliente_id?: string | null;
  fornecedor_id?: string | null;
  conta_bancaria_id?: string | null;
  conta_contabil_id?: string | null;
  observacoes?: string | null;
}

export async function gerarParcelasFinanceirasRpc(input: {
  base: GerarParcelasBase;
  numParcelas: number;
  intervaloDias?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("gerar_parcelas_financeiras", {
    p_base: input.base as never,
    p_num_parcelas: input.numParcelas,
    p_intervalo_dias: input.intervaloDias ?? 30,
  });
  if (error) throw error;
  return data as string;
}

/* -------- Folha de pagamento → financeiro -------- */

export async function gerarFinanceiroFolhaRpc(input: {
  competencia: string;
  dataVencimento: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("gerar_financeiro_folha", {
    p_competencia: input.competencia,
    p_data_vencimento: input.dataVencimento,
  });
  if (error) throw error;
  return data as number;
}