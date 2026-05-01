/**
 * Funções puras de cálculo financeiro.
 *
 * Todas as funções aqui são determinísticas e livres de efeitos colaterais,
 * facilitando testes unitários e reutilização em componentes e serviços.
 */

// ── Baixa / Pagamento ─────────────────────────────────────────────────────────

/**
 * Calcula o valor líquido a pagar numa baixa, considerando descontos,
 * juros, multa e abatimentos.
 *
 * @param valorPago    Valor informado pelo usuário para pagamento.
 * @param desconto     Desconto concedido (reduz o valor líquido).
 * @param juros        Juros cobrados (aumenta o valor líquido).
 * @param multa        Multa cobrada (aumenta o valor líquido).
 * @param abatimento   Abatimento adicional (reduz o valor líquido).
 * @returns Valor líquido resultante.
 */
export function calcularValorLiquido(
  valorPago: number,
  desconto: number,
  juros: number,
  multa: number,
  abatimento: number,
): number {
  return valorPago - desconto + juros + multa - abatimento;
}

/**
 * Calcula o saldo restante de um lançamento após uma baixa parcial.
 *
 * @param saldoAtual   Saldo devedor antes do pagamento.
 * @param valorPago    Valor efetivamente pago nesta baixa.
 * @param abatimento   Abatimento adicional aplicado.
 * @returns Novo saldo devedor (nunca negativo).
 */
export function calcularNovoSaldo(
  saldoAtual: number,
  valorPago: number,
  abatimento: number,
): number {
  return Math.max(0, saldoAtual - valorPago - abatimento);
}

/**
 * Determina o status efetivo de um lançamento, considerando vencimento.
 * Lançamentos "aberto" com data de vencimento no passado tornam-se "vencido".
 *
 * @param status           Status armazenado no banco.
 * @param dataVencimento   Data de vencimento (ISO 8601, ex.: "2026-03-01").
 * @param hoje             Data de referência para comparação.
 * @returns Status efetivo: "aberto", "vencido", "pago", "parcial", etc.
 */
export function getEffectiveStatus(
  status: string,
  dataVencimento: string,
  hoje: Date,
): string {
  const s = (status || '').toLowerCase();
  if (s === 'aberto' && dataVencimento) {
    const vencimento = new Date(dataVencimento);
    vencimento.setHours(0, 0, 0, 0);
    if (vencimento < hoje) return 'vencido';
  }
  return s || 'aberto';
}

// ── Juros e Multa ─────────────────────────────────────────────────────────────

/**
 * Calcula juros simples diários sobre um valor.
 *
 * @param valor       Valor principal.
 * @param taxaDiaria  Taxa diária em percentual (ex.: 0.033 para 0,033% ao dia).
 * @param dias        Número de dias de atraso.
 * @returns Valor dos juros (arredondado para 2 casas decimais).
 */
export function calcularJurosDiarios(
  valor: number,
  taxaDiaria: number,
  dias: number,
): number {
  return Math.round(valor * (taxaDiaria / 100) * dias * 100) / 100;
}

/**
 * Calcula multa por atraso sobre um valor.
 *
 * @param valor             Valor principal.
 * @param percentualMulta   Percentual de multa (ex.: 2 para 2%).
 * @returns Valor da multa (arredondado para 2 casas decimais).
 */
export function calcularMulta(valor: number, percentualMulta: number): number {
  return Math.round(valor * (percentualMulta / 100) * 100) / 100;
}

// ── Baixa em Lote ─────────────────────────────────────────────────────────────

/**
 * Calcula o valor pago proporcional para uma baixa parcial em lote.
 * A proporção é calculada sobre o total do lote e aplicada ao saldo
 * de cada lançamento individual.
 *
 * @param saldo       Saldo devedor do lançamento individual.
 * @param ratio       Razão valorPago / totalDoBatch (0 a 1).
 * @returns Valor a ser pago para este lançamento (arredondado para 2 casas).
 */
export function calcularPagamentoParcialLote(saldo: number, ratio: number): number {
  return Math.round(saldo * ratio * 100) / 100;
}

/**
 * Determina o status pós-baixa de um lançamento com base no novo saldo.
 *
 * @param novoSaldo   Saldo após o pagamento.
 * @returns "pago" se saldo ≤ 0,01; "parcial" caso contrário.
 */
export function statusPosBaixa(novoSaldo: number): 'pago' | 'parcial' {
  return novoSaldo <= 0.01 ? 'pago' : 'parcial';
}

// ── Origem do Lançamento ──────────────────────────────────────────────────────

/**
 * Rótulo canônico da origem de um lançamento financeiro.
 * Prioriza `origem_tipo` (modelo canônico — doc 4); usa
 * `nota_fiscal_id`/`documento_pai_id` apenas como fallback retrocompatível.
 */
export function getOrigemLabel(l: {
  origem_tipo?: string | null;
  nota_fiscal_id?: string | null;
  documento_pai_id?: string | null;
}): string {
  switch (l.origem_tipo) {
    case 'fiscal_nota': return 'Nota Fiscal';
    case 'nfe_entrada': return 'NF-e de Entrada';
    case 'comercial': return 'Comercial';
    case 'compras': return 'Compras';
    case 'parcelamento': return 'Parcelamento';
    case 'sistemica': return 'Sistêmica';
    case 'societario': return 'Retirada de Sócio';
    case 'manual': return 'Manual';
  }
  if (l.nota_fiscal_id) return 'Nota Fiscal';
  if (l.documento_pai_id) return 'Parcelamento';
  return 'Manual';
}

/** Chave curta para filtros do grid (compatível com origemFilters atual). */
export function getOrigemKey(l: {
  origem_tipo?: string | null;
  nota_fiscal_id?: string | null;
  documento_pai_id?: string | null;
}): 'nf' | 'parcela' | 'manual' | 'outro' {
  if (l.origem_tipo === 'fiscal_nota' || (!l.origem_tipo && l.nota_fiscal_id)) return 'nf';
  if (l.origem_tipo === 'parcelamento' || (!l.origem_tipo && l.documento_pai_id)) return 'parcela';
  if (l.origem_tipo === 'manual' || !l.origem_tipo) return 'manual';
  return 'outro';
}

// ── Forma de pagamento canônica ───────────────────────────────────────────────

/**
 * Enum lógico de meios de pagamento usado no sistema.
 * Boleto e DDA colapsam em `boleto_dda` por decisão de produto.
 */
export type FormaPagamentoCanonica =
  | 'dinheiro'
  | 'pix'
  | 'boleto_dda'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'transferencia'
  | 'cobranca_automatica'
  | 'debito_automatico'
  | 'outros';

export const FORMA_PAGAMENTO_LABELS: Record<FormaPagamentoCanonica, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  boleto_dda: 'Boleto/DDA',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  transferencia: 'Transferência',
  cobranca_automatica: 'Cobrança Automática',
  debito_automatico: 'Débito Automático',
  outros: 'Outros',
};

export const FORMA_PAGAMENTO_OPTIONS: Array<{ value: FormaPagamentoCanonica; label: string }> =
  (Object.keys(FORMA_PAGAMENTO_LABELS) as FormaPagamentoCanonica[]).map((v) => ({
    value: v,
    label: FORMA_PAGAMENTO_LABELS[v],
  }));

/**
 * Normaliza uma string livre de forma_pagamento para o enum canônico.
 * "boleto" e "DDA" → 'boleto_dda'.
 */
export function normalizeFormaPagamento(raw: string | null | undefined): FormaPagamentoCanonica | null {
  if (!raw) return null;
  const s = raw.toString().trim().toLowerCase();
  if (!s) return null;
  if (s === 'boleto' || s === 'dda' || s === 'boleto/dda' || s === 'boleto_dda') return 'boleto_dda';
  if (
    s === 'cartao' || s === 'cartão' ||
    s === 'cartao_credito' || s === 'cartao credito' || s === 'cartao crédito' ||
    s === 'cartão credito' || s === 'cartão crédito' || s === 'credit card'
  ) return 'cartao_credito';
  if (s === 'cartao_debito' || s === 'cartao debito' || s === 'cartão débito' || s === 'cartão de débito') return 'cartao_debito';
  if (s === 'pix') return 'pix';
  if (s === 'dinheiro' || s === 'cash' || s === 'especie' || s === 'espécie') return 'dinheiro';
  if (s === 'transferencia' || s === 'transferência' || s === 'ted' || s === 'doc') return 'transferencia';
  if (s === 'cobranca_automatica' || s === 'cobranca automatica' || s === 'cobrança automática') return 'cobranca_automatica';
  if (s === 'debito_automatico' || s === 'debito automatico' || s === 'débito automático') return 'debito_automatico';
  return 'outros';
}

/**
 * Mapeia o código `tPag` da SEFAZ (XML NF-e <pag><detPag>) para o enum canônico.
 * Tabela oficial reduzida — códigos não mapeados caem em 'outros'.
 */
export function mapTPagSefaz(tPag: string | null | undefined): FormaPagamentoCanonica {
  switch ((tPag || '').padStart(2, '0')) {
    case '01': return 'dinheiro';
    case '02': return 'boleto_dda'; // Cheque tratado como boleto/DDA até virar enum próprio
    case '03': return 'cartao_credito';
    case '04': return 'cartao_debito';
    case '05': return 'cobranca_automatica'; // Crédito Loja
    case '10': return 'outros'; // Vale Alimentação
    case '11': return 'outros'; // Vale Refeição
    case '12': return 'outros'; // Vale Presente
    case '13': return 'outros'; // Vale Combustível
    case '15': return 'boleto_dda';
    case '16': return 'debito_automatico';
    case '17': return 'pix';
    case '18': return 'transferencia';
    case '19': return 'cobranca_automatica';
    case '90': return 'outros'; // Sem pagamento
    default: return 'outros';
  }
}
