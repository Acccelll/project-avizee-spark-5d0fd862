/**
 * Serviço de conciliação bancária.
 *
 * Fornece funções para sugerir e confirmar a conciliação entre transações
 * do extrato bancário (OFX) e lançamentos financeiros do ERP.
 */

import { supabase } from "@/integrations/supabase/client";
import type { TransacaoExtrato } from "./ofxParser.service";
import {
  registrarBaixaFinanceiraRpc,
  financeiroConciliarBaixaRpc,
  financeiroConciliarLoteRpc,
} from "@/types/rpc";

/** Representa um título/lançamento financeiro para fins de conciliação. */
export interface TituloParaConciliacao {
  id: string;
  descricao: string | null;
  valor: number;
  data_vencimento: string;
  tipo: string;
  status: string | null;
  /**
   * Data da última baixa ativa (quando existir).
   * Quando presente, o matching usa-a como eixo principal — alinhando
   * conciliação à baixa real, conforme modelo canônico.
   */
  data_baixa?: string | null;
}

/** Nível de confiança de uma sugestão automática de conciliação. */
export type NivelConfianca = "alta" | "media" | "baixa";

/** Resultado da sugestão automática de conciliação para uma transação. */
export interface SugestaoConciliacao {
  titulo: TituloParaConciliacao;
  score: number;
  confidence: NivelConfianca;
}

/** Score mínimo para considerar uma sugestão aceitável. */
const SCORE_THRESHOLD_BAIXA = 0.35;
/** Score mínimo para classificar a sugestão como confiança média. */
const SCORE_THRESHOLD_MEDIA = 0.5;
/** Score mínimo para classificar a sugestão como alta confiança. */
const SCORE_THRESHOLD_ALTA = 0.7;

/** Classifica um score numérico em nível de confiança qualitativo. */
function classificarConfianca(score: number): NivelConfianca {
  if (score >= SCORE_THRESHOLD_ALTA) return "alta";
  if (score >= SCORE_THRESHOLD_MEDIA) return "media";
  return "baixa";
}

/**
 * Normaliza uma string para comparação de descrições bancárias.
 *
 * Remove números longos (referências/IDs com 5+ dígitos), pontuação,
 * acentos e múltiplos espaços. Resultado é minúsculo, alfanumérico,
 * adequado para comparação por bigramas.
 */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
    .replace(/\d{5,}/g, "")           // remove referências numéricas longas
    .replace(/[^\w\s]/g, " ")        // pontuação → espaço
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai o conjunto de bigramas (pares de caracteres) de uma string. */
function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}

/**
 * Calcula a similaridade entre duas descrições bancárias usando o
 * coeficiente de Sørensen-Dice sobre bigramas, com normalização prévia.
 *
 * Mais robusto que bag-of-words para strings curtas e abreviadas
 * típicas de extratos bancários (ex.: "TED CRED 12345", "PIX RECEB").
 *
 * @returns Valor entre 0 (sem similaridade) e 1 (idênticas).
 */
export function calcularSimilaridade(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ba = bigrams(na);
  const bb = bigrams(nb);
  if (ba.size === 0 || bb.size === 0) return 0;

  let intersect = 0;
  ba.forEach((bg) => {
    if (bb.has(bg)) intersect++;
  });

  return (2 * intersect) / (ba.size + bb.size);
}

/**
 * Calcula o score de matching entre uma transação do extrato e um título.
 *
 * Critérios (pesos):
 * - Valor deve ser idêntico (diferença < R$ 0,01) — obrigatório.
 * - Data próxima (até 3 dias): contribui até 0,6 ao score.
 * - Similaridade de descrição: contribui até 0,4 ao score.
 *
 * @returns Score de 0 a 1. Retorna 0 se o valor não corresponder.
 */
export function calcularScoreConciliacao(
  transacao: TransacaoExtrato,
  titulo: TituloParaConciliacao,
): number {
  const valorMatch = Math.abs(Math.abs(titulo.valor) - transacao.valor) < 0.01;
  if (!valorMatch) return 0;

  // Apenas títulos com baixa real entram no matching.
  // Títulos em aberto (sem data_baixa) não devem ser sugeridos —
  // alinha com o eixo canônico do modelo (conciliação por baixa, não por previsão).
  if (!titulo.data_baixa && titulo.status === "aberto") return 0;

  // Eixo de comparação: data_baixa quando o título já foi liquidado;
  // fallback para data_vencimento em títulos ainda em aberto.
  // Reflete o modelo canônico (conciliação por baixa real, não por previsão).
  const dataReferencia = titulo.data_baixa ?? titulo.data_vencimento;
  const dataExtrato = new Date(transacao.data);
  const dataLanc = new Date(dataReferencia);
  const diffDias = Math.abs(
    (dataExtrato.getTime() - dataLanc.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDias > 3) return 0;

  const scoreData = 1 - (diffDias / 3) * 0.2; // 1.0 (mesmo dia) → 0.8 (3 dias)
  const simDesc = calcularSimilaridade(
    transacao.descricao,
    titulo.descricao ?? "",
  );

  return scoreData * 0.6 + simDesc * 0.4;
}

/**
 * Sugere o melhor lançamento para conciliar com uma transação do extrato.
 *
 * Heurística: maximiza o score combinado (valor, data, similaridade de
 * descrição). Sugestões com score abaixo de `SCORE_THRESHOLD_BAIXA` são
 * descartadas como ruído.
 *
 * @param transacao   Transação do extrato bancário.
 * @param titulos     Lista de lançamentos pendentes do ERP.
 * @returns           Sugestão com `titulo`, `score` e `confidence`,
 *                    ou `null` se nenhum candidato atingir o threshold.
 */
export function sugerirConciliacao(
  transacao: TransacaoExtrato,
  titulos: TituloParaConciliacao[],
): SugestaoConciliacao | null {
  let melhor: { titulo: TituloParaConciliacao; score: number } | null = null;

  for (const titulo of titulos) {
    const score = calcularScoreConciliacao(transacao, titulo);
    if (score < SCORE_THRESHOLD_BAIXA) continue;
    if (!melhor || score > melhor.score) {
      melhor = { titulo, score };
    }
  }

  if (!melhor) return null;
  return {
    titulo: melhor.titulo,
    score: melhor.score,
    confidence: classificarConfianca(melhor.score),
  };
}

/**
 * Registra a conciliação entre uma transação do extrato e um lançamento ERP.
 *
 * Quando `tituloId` é fornecido, marca o lançamento como conciliado.
 * Quando omitido, registra apenas a transação do extrato como "sem par".
 *
 * @param contaId           ID da conta bancária.
 * @param transacaoExtrato  Transação do extrato a ser conciliada.
 * @param tituloId          ID do lançamento ERP (opcional).
 */
export async function conciliarTransacao(
  contaId: string,
  transacaoExtrato: TransacaoExtrato,
  tituloId?: string,
): Promise<void> {
  if (!tituloId) return; // Sem par — nada a persistir por ora

  const { data: lanc, error: fetchError } = await supabase
    .from("financeiro_lancamentos")
    .select("id, valor, saldo_restante, status")
    .eq("id", tituloId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!lanc?.id) throw new Error("Lançamento não encontrado para conciliação.");

  const saldoAtual = lanc.saldo_restante != null
    ? Number(lanc.saldo_restante)
    : Number(lanc.valor);

  // Guard: rejeitar conciliação quando o título não admite operação.
  if (lanc.status === "cancelado") {
    throw new Error("Lançamento cancelado não pode ser conciliado.");
  }

  let baixaId: string | null = null;

  if (saldoAtual > 0.009) {
    baixaId = await registrarBaixaFinanceiraRpc({
      p_lancamento_id: tituloId,
      p_valor_pago: saldoAtual,
      p_data_baixa: transacaoExtrato.data,
      p_forma_pagamento: "extrato_conciliacao",
      p_conta_bancaria_id: contaId,
      p_observacoes: `Baixa gerada por conciliação automática (${transacaoExtrato.id})`,
    });
  }

  if (!baixaId) {
    // Título já liquidado: localizar a baixa ativa cuja data e valor
    // correspondam à transação do extrato. Evita conciliar baixa antiga
    // não relacionada quando há múltiplas baixas no histórico.
    const valorExtrato = Math.abs(transacaoExtrato.valor);
    const { data: baixasAtivas, error: baixaErr } = await supabase
      .from("financeiro_baixas")
      .select("id, data_baixa, valor_pago, conciliacao_status")
      .eq("lancamento_id", tituloId)
      .is("estornada_em", null)
      .order("data_baixa", { ascending: false });

    if (baixaErr) throw new Error(baixaErr.message);
    if (!baixasAtivas?.length) {
      throw new Error("Não foi possível localizar baixa ativa para conciliação.");
    }

    // Prioridade 1: baixa ainda não conciliada com valor exato
    // Prioridade 2: baixa ainda não conciliada com data próxima (≤3 dias)
    // Prioridade 3: última baixa ativa (compatibilidade)
    const naoConciliadas = baixasAtivas.filter(
      (b) => (b.conciliacao_status ?? "pendente") !== "conciliado",
    );
    const candidatas = naoConciliadas.length ? naoConciliadas : baixasAtivas;

    const matchValor = candidatas.find(
      (b) => Math.abs(Number(b.valor_pago) - valorExtrato) < 0.01,
    );
    if (matchValor) {
      baixaId = matchValor.id;
    } else {
      const dataExtratoMs = new Date(transacaoExtrato.data).getTime();
      const matchData = candidatas.find((b) => {
        const diff = Math.abs(
          (new Date(b.data_baixa).getTime() - dataExtratoMs) / (1000 * 60 * 60 * 24),
        );
        return diff <= 3;
      });
      baixaId = matchData?.id ?? candidatas[0].id;
    }
  }

  await financeiroConciliarBaixaRpc({
    p_baixa_id: baixaId!,
    p_status: "conciliado",
    p_extrato_referencia: transacaoExtrato.id,
  });
}

/**
 * Persiste um lote de conciliação bancária (header + pares) no banco de dados.
 */
export async function confirmarConciliacao(payload: {
  conta_bancaria_id: string;
  data_conciliacao: string;
  pares: Array<{
    extrato_id: string;
    lancamento_id: string;
    valor_extrato: number | null;
    valor_lancamento: number | null;
  }>;
  usuario_id?: string;
}): Promise<string> {
  // RPC transacional: cabeçalho + pares em uma única transação.
  return financeiroConciliarLoteRpc({
    p_conta_bancaria_id: payload.conta_bancaria_id,
    p_data_conciliacao: payload.data_conciliacao,
    p_pares: payload.pares as unknown as import("@/integrations/supabase/types").Json,
    p_observacoes: undefined,
  });
}
