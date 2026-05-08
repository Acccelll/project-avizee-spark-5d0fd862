/**
 * Onda 9 C-04 — Registro canônico de formatação para campos de slides.
 *
 * O `formatValue` antigo deduzia o formato pelo nome da chave via substring
 * (`key.includes('valor')` → moeda). Isso gerava falso positivo
 * (`valor_quantidade_dias` formatado como R$) e falso negativo
 * (`lucro_liquido` ficava como número simples porque "lucro" não estava
 * na lista). A solução é declarar explicitamente o formato esperado de
 * cada chave conhecida.
 *
 * O registro funciona como whitelist de chaves de domínio. Para chaves
 * desconhecidas, o renderer cai num fallback NUMÉRICO (nunca moeda),
 * eliminando o risco de inventar unidade.
 */

export type FormatKind = 'moeda' | 'percentual' | 'numero' | 'inteiro' | 'texto';

/**
 * Mapa canônico campo → formato. Manter alfabético por seção para facilitar
 * revisão. Adicionar entradas conforme novos slides forem introduzidos.
 */
export const SLIDE_FIELD_FORMATS: Record<string, FormatKind> = {
  // ─── Financeiro / monetário ────────────────────────────────────────────
  faturamento: 'moeda',
  faturamento_bruto: 'moeda',
  faturamento_liquido: 'moeda',
  receita: 'moeda',
  receita_bruta: 'moeda',
  receita_liquida: 'moeda',
  despesa: 'moeda',
  despesas: 'moeda',
  despesas_operacionais: 'moeda',
  custo: 'moeda',
  cmv: 'moeda',
  resultado: 'moeda',
  resultado_exercicio: 'moeda',
  lucro: 'moeda',
  lucro_bruto: 'moeda',
  lucro_liquido: 'moeda',
  ebitda: 'moeda',
  caixa: 'moeda',
  saldo: 'moeda',
  saldo_caixa: 'moeda',
  saldo_inicial: 'moeda',
  saldo_final: 'moeda',
  entradas: 'moeda',
  saidas: 'moeda',
  valor: 'moeda',
  valor_total: 'moeda',
  valor_pago: 'moeda',
  valor_aberto: 'moeda',
  valor_vencido: 'moeda',
  ticket_medio: 'moeda',
  contas_receber: 'moeda',
  contas_pagar: 'moeda',
  inadimplencia_valor: 'moeda',

  // ─── Percentuais ───────────────────────────────────────────────────────
  margem: 'percentual',
  margem_bruta: 'percentual',
  margem_liquida: 'percentual',
  margem_pct: 'percentual',
  pct_inadimplencia: 'percentual',
  pct_crescimento: 'percentual',
  variacao_pct: 'percentual',
  participacao: 'percentual',
  participacao_pct: 'percentual',

  // ─── Quantidades / inteiros ────────────────────────────────────────────
  quantidade: 'inteiro',
  qtd_pedidos: 'inteiro',
  qtd_clientes: 'inteiro',
  qtd_titulos: 'inteiro',
  qtd_produtos: 'inteiro',
  funcionarios: 'inteiro',
  pedidos: 'inteiro',
  notas: 'inteiro',
  dias: 'inteiro',
  prazo_medio_dias: 'inteiro',

  // ─── Texto ──────────────────────────────────────────────────────────────
  competencia: 'texto',
  motivo: 'texto',
};

/**
 * Resolve o formato canônico de uma chave. Retorna `undefined` quando a
 * chave não está no registro — o renderer deve usar fallback NUMÉRICO
 * (nunca moeda) para preservar a doutrina anti-substring.
 */
export function resolveFieldFormat(key: string): FormatKind | undefined {
  if (key in SLIDE_FIELD_FORMATS) return SLIDE_FIELD_FORMATS[key];
  // Sufixos canônicos seguros (whole-suffix, não substring no meio).
  if (key.endsWith('_pct') || key.endsWith('_percent')) return 'percentual';
  if (key.endsWith('_qtd') || key.endsWith('_count')) return 'inteiro';
  return undefined;
}