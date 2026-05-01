import { supabase } from "@/integrations/supabase/client";

/* -------- Baixa transacional (RPCs) -------- */

export interface RegistrarBaixaParams {
  lancamentoId: string;
  valorPago: number;
  dataBaixa: string;
  formaPagamento: string;
  contaBancariaId: string;
  observacoes?: string | null;
}

export async function registrarBaixaFinanceira(params: RegistrarBaixaParams): Promise<string> {
  const { data, error } = await supabase.rpc("registrar_baixa_financeira", {
    p_lancamento_id: params.lancamentoId,
    p_valor_pago: params.valorPago,
    p_data_baixa: params.dataBaixa,
    p_forma_pagamento: params.formaPagamento,
    p_conta_bancaria_id: params.contaBancariaId,
    p_observacoes: params.observacoes ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function estornarBaixaFinanceira(input: {
  baixaId: string;
  motivo?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("estornar_baixa_financeira", {
    p_baixa_id: input.baixaId,
    p_motivo: input.motivo,
  });
  if (error) throw error;
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