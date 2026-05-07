/**
 * Serviço de persistência de transações de extrato bancário (OFX).
 *
 * Salva cada transação em `financeiro_extrato_importacoes` para que a
 * conciliação não perca trabalho ao recarregar a página e impede
 * re-importação duplicada via UNIQUE (conta, fitid).
 */
import { supabase } from "@/integrations/supabase/client";
import type { TransacaoExtrato } from "./ofxParser.service";

export type ExtratoStatus = "pendente" | "conciliado" | "ignorado";

export interface ExtratoTransacaoPersistida {
  id: string;
  conta_bancaria_id: string;
  fitid: string;
  data: string;
  valor: number;
  descricao: string | null;
  status: ExtratoStatus;
  baixa_id: string | null;
}

/** Faz upsert de transações OFX (idempotente por (conta, fitid)). */
export async function persistirExtratoOFX(input: {
  contaBancariaId: string;
  arquivoHash?: string | null;
  transacoes: TransacaoExtrato[];
}): Promise<{ inseridas: number }> {
  const { contaBancariaId, transacoes, arquivoHash } = input;
  if (!transacoes.length) return { inseridas: 0 };

  const rows = transacoes.map((t) => ({
    conta_bancaria_id: contaBancariaId,
    fitid: t.id,
    data: t.data,
    valor: t.valor,
    descricao: t.descricao,
    arquivo_hash: arquivoHash ?? null,
    status: "pendente" as ExtratoStatus,
  }));

  const { error, count } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, types ainda não regenerados
    .from("financeiro_extrato_importacoes" as any)
    .upsert(rows, {
      onConflict: "conta_bancaria_id,fitid",
      ignoreDuplicates: true,
      count: "exact",
    });
  if (error) throw new Error(error.message);
  return { inseridas: count ?? 0 };
}

/** Lista transações persistidas de uma conta no período. */
export async function listarExtratoPersistido(input: {
  contaBancariaId: string;
  dataInicio: string;
  dataFim: string;
}): Promise<ExtratoTransacaoPersistida[]> {
  const { contaBancariaId, dataInicio, dataFim } = input;
  if (!contaBancariaId) return [];
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("financeiro_extrato_importacoes" as any)
    .select("id, conta_bancaria_id, fitid, data, valor, descricao, status, baixa_id")
    .eq("conta_bancaria_id", contaBancariaId)
    .gte("data", dataInicio)
    .lte("data", dataFim)
    .order("data", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as unknown) as ExtratoTransacaoPersistida[]) ?? [];
}

/** Marca uma transação como conciliada (vinculada a uma baixa). */
export async function marcarExtratoConciliado(input: {
  extratoId: string;
  baixaId: string;
}): Promise<void> {
  const { error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("financeiro_extrato_importacoes" as any)
    .update({ status: "conciliado", baixa_id: input.baixaId })
    .eq("id", input.extratoId);
  if (error) throw new Error(error.message);
}

/** Marca uma transação como ignorada (não conciliar). */
export async function ignorarExtrato(extratoId: string): Promise<void> {
  const { error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("financeiro_extrato_importacoes" as any)
    .update({ status: "ignorado", baixa_id: null })
    .eq("id", extratoId);
  if (error) throw new Error(error.message);
}