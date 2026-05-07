import type { ApresentacaoModoGeracao, SlideCodigo } from '@/types/apresentacao';

export type SlideSecao =
  | 'capa'
  | 'financeiro'
  | 'comercial'
  | 'operacoes'
  | 'pessoas'
  | 'risco'
  | 'marketing'
  | 'encerramento';

export const SECAO_LABELS: Record<SlideSecao, string> = {
  capa: 'Capa',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  operacoes: 'Operações & Estoque',
  pessoas: 'Pessoas (FOPAG)',
  risco: 'Risco & Crédito',
  marketing: 'Marketing & Social',
  encerramento: 'Encerramento',
};

export const SECAO_ORDEM: SlideSecao[] = [
  'capa',
  'financeiro',
  'pessoas',
  'comercial',
  'operacoes',
  'risco',
  'marketing',
  'encerramento',
];

/**
 * Schema declarado por slide consumido pelo `generatePresentation`
 * (PPTX) para evitar a heurística `numericPairs` / `findArrayRows`.
 *
 * Quando ausente, os renderers caem nos heurísticos antigos.
 */
export interface SlideDataSchema {
  /** Chave dentro de `dados` que contém o array (ex.: 'serie', 'ranking'). */
  arrayKey?: string;
  /** Campo de cada item do array que é o label do eixo X / categoria. */
  labelField?: string;
  /** Campo de cada item do array que é o valor numérico (séries simples). */
  valueField?: string;
  /** Para charts multi-série (ex.: receita_vs_despesa): vários `valueField`. */
  valueFields?: string[];
  /**
   * Para `chartType: 'cards'`, lista ordenada das chaves escalares de `dados`
   * que devem virar cards (ignora as demais).
   */
  cardKeys?: string[];
}

export interface SlideDefinition {
  codigo: SlideCodigo;
  titulo: string;
  subtitulo: string;
  chartType: 'coluna' | 'linha' | 'barra_horizontal' | 'donut' | 'tabela' | 'cards' | 'texto' | 'waterfall' | 'stacked';
  dependencies: string[];
  expectedDatasets: string[];
  required: boolean;
  optional: boolean;
  dependsOn: string[];
  order: number;
  hiddenWhenEmpty: boolean;
  modeSupport: ApresentacaoModoGeracao[];
  criticalInClosedMode?: boolean;
  secao: SlideSecao;
  /** Schema explícito do payload `dados`. */
  dataSchema?: SlideDataSchema;
}

export const APRESENTACAO_SLIDES_V2: SlideDefinition[] = [
  { codigo: 'cover', titulo: 'Fechamento Mensal', subtitulo: 'Apresentação Gerencial', chartType: 'texto', dependencies: [], expectedDatasets: [], required: true, optional: false, dependsOn: [], order: 1, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'capa' },
  { codigo: 'highlights_financeiros', titulo: 'Highlights Financeiros', subtitulo: 'Resumo executivo do período', chartType: 'cards', dependencies: ['vw_apresentacao_highlights_financeiros'], expectedDatasets: ['kpis'], required: true, optional: false, dependsOn: [], order: 2, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'faturamento', titulo: 'Faturamento', subtitulo: 'Evolução e composição', chartType: 'coluna', dependencies: ['vw_apresentacao_faturamento'], expectedDatasets: ['serie_mensal'], required: true, optional: false, dependsOn: [], order: 3, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'despesas', titulo: 'Despesas', subtitulo: 'Consolidação por competência', chartType: 'coluna', dependencies: ['vw_apresentacao_despesas'], expectedDatasets: ['serie_mensal'], required: true, optional: false, dependsOn: [], order: 4, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'rol_caixa', titulo: 'Caixa / ROL', subtitulo: 'Posição de liquidez', chartType: 'cards', dependencies: ['vw_apresentacao_rol_caixa'], expectedDatasets: ['caixa_total'], required: true, optional: false, dependsOn: [], order: 5, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], criticalInClosedMode: true, secao: 'financeiro' },
  { codigo: 'receita_vs_despesa', titulo: 'Receita vs Despesa', subtitulo: 'Comparativo mensal', chartType: 'linha', dependencies: ['vw_apresentacao_receita_vs_despesa'], expectedDatasets: ['receita', 'despesa'], required: true, optional: false, dependsOn: [], order: 6, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'fopag', titulo: 'FOPAG', subtitulo: 'Folha de pagamento', chartType: 'tabela', dependencies: ['vw_apresentacao_fopag'], expectedDatasets: ['resumo_fopag'], required: true, optional: false, dependsOn: [], order: 7, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'pessoas' },
  { codigo: 'fluxo_caixa', titulo: 'Fluxo de Caixa', subtitulo: 'Entradas e saídas', chartType: 'linha', dependencies: ['vw_apresentacao_fluxo_caixa'], expectedDatasets: ['fluxo'], required: true, optional: false, dependsOn: [], order: 8, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], criticalInClosedMode: true, secao: 'financeiro' },
  { codigo: 'lucro_produto_cliente', titulo: 'Lucro por Produto e Cliente', subtitulo: 'Top contribuições', chartType: 'barra_horizontal', dependencies: ['vw_apresentacao_lucro_produto_cliente'], expectedDatasets: ['top_produtos', 'top_clientes'], required: true, optional: false, dependsOn: [], order: 9, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'comercial' },
  { codigo: 'variacao_estoque', titulo: 'Variação de Estoque', subtitulo: 'Posição e giro', chartType: 'tabela', dependencies: ['vw_apresentacao_variacao_estoque'], expectedDatasets: ['estoque'], required: true, optional: false, dependsOn: [], order: 10, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], criticalInClosedMode: true, secao: 'operacoes' },
  { codigo: 'venda_estado', titulo: 'Venda por Estado', subtitulo: 'Distribuição geográfica', chartType: 'barra_horizontal', dependencies: ['vw_apresentacao_venda_estado'], expectedDatasets: ['uf'], required: true, optional: false, dependsOn: [], order: 11, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'comercial' },
  { codigo: 'redes_sociais', titulo: 'Redes Sociais', subtitulo: 'Indicadores de crescimento', chartType: 'cards', dependencies: ['vw_apresentacao_redes_sociais'], expectedDatasets: ['social'], required: true, optional: false, dependsOn: [], order: 12, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'marketing' },

  { codigo: 'bridge_ebitda', titulo: 'Bridge EBITDA', subtitulo: 'Pontes de variação do resultado operacional', chartType: 'waterfall', dependencies: ['vw_apresentacao_bridge_ebitda'], expectedDatasets: ['impactos'], required: false, optional: true, dependsOn: ['mapeamento_gerencial_contas'], order: 13, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'bridge_lucro_liquido', titulo: 'Bridge Lucro Líquido', subtitulo: 'Reconciliação até lucro líquido', chartType: 'waterfall', dependencies: ['vw_apresentacao_bridge_lucro_liquido'], expectedDatasets: ['impactos'], required: false, optional: true, dependsOn: ['mapeamento_gerencial_contas'], order: 14, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'dre_gerencial', titulo: 'P&L / DRE Gerencial', subtitulo: 'Consolidado por linhas gerenciais', chartType: 'stacked', dependencies: ['vw_apresentacao_dre_gerencial'], expectedDatasets: ['linhas_dre'], required: false, optional: true, dependsOn: ['mapeamento_gerencial_contas'], order: 15, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'capital_giro', titulo: 'Capital de Giro', subtitulo: 'Working capital consolidado', chartType: 'cards', dependencies: ['vw_apresentacao_capital_giro'], expectedDatasets: ['capital_giro'], required: false, optional: true, dependsOn: ['vw_workbook_aging_cr', 'vw_workbook_aging_cp'], order: 16, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'balanco_gerencial', titulo: 'Balanço Gerencial Simplificado', subtitulo: 'Ativo, passivo e patrimônio', chartType: 'tabela', dependencies: ['vw_apresentacao_balanco_gerencial'], expectedDatasets: ['ativo_passivo'], required: false, optional: true, dependsOn: ['contas_contabeis'], order: 17, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'resultado_financeiro', titulo: 'Resultado Financeiro', subtitulo: 'Receitas e despesas financeiras', chartType: 'coluna', dependencies: ['vw_apresentacao_resultado_financeiro'], expectedDatasets: ['resultado_financeiro'], required: false, optional: true, dependsOn: ['financeiro_lancamentos'], order: 18, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'tributos', titulo: 'Tributos', subtitulo: 'Carga tributária no período', chartType: 'coluna', dependencies: ['vw_apresentacao_tributos'], expectedDatasets: ['tributos'], required: false, optional: true, dependsOn: ['notas_fiscais'], order: 19, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'aging_consolidado', titulo: 'Aging Consolidado (CR + CP)', subtitulo: 'Curva de vencimentos consolidada', chartType: 'stacked', dependencies: ['vw_apresentacao_aging_consolidado'], expectedDatasets: ['aging'], required: false, optional: true, dependsOn: ['vw_workbook_aging_cr', 'vw_workbook_aging_cp'], order: 20, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], criticalInClosedMode: true, secao: 'risco' },
  { codigo: 'debt', titulo: 'Debt / Endividamento', subtitulo: 'Composição do passivo financeiro', chartType: 'donut', dependencies: ['vw_apresentacao_debt'], expectedDatasets: ['debt'], required: false, optional: true, dependsOn: ['financeiro_lancamentos'], order: 21, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'risco' },
  { codigo: 'bancos_detalhado', titulo: 'Bancos Detalhado', subtitulo: 'Saldos por conta bancária', chartType: 'tabela', dependencies: ['vw_apresentacao_bancos_detalhado'], expectedDatasets: ['bancos'], required: false, optional: true, dependsOn: ['vw_workbook_bancos_saldo'], order: 22, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'financeiro' },
  { codigo: 'backorder', titulo: 'Backorder / Carteira', subtitulo: 'Pedidos pendentes de faturamento', chartType: 'cards', dependencies: ['vw_apresentacao_backorder'], expectedDatasets: ['backorder'], required: false, optional: true, dependsOn: ['ordens_venda'], order: 23, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'operacoes' },
  { codigo: 'top_clientes', titulo: 'Clientes em Destaque', subtitulo: 'Top clientes por faturamento', chartType: 'barra_horizontal', dependencies: ['vw_apresentacao_top_clientes'], expectedDatasets: ['ranking_clientes'], required: false, optional: true, dependsOn: ['notas_fiscais'], order: 24, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'comercial' },
  { codigo: 'top_fornecedores', titulo: 'Fornecedores em Destaque', subtitulo: 'Top fornecedores por compras', chartType: 'barra_horizontal', dependencies: ['vw_apresentacao_top_fornecedores'], expectedDatasets: ['ranking_fornecedores'], required: false, optional: true, dependsOn: ['pedidos_compra'], order: 25, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'operacoes' },
  { codigo: 'inadimplencia', titulo: 'Inadimplência', subtitulo: 'Exposição de recebíveis em atraso', chartType: 'cards', dependencies: ['vw_apresentacao_inadimplencia'], expectedDatasets: ['inadimplencia'], required: false, optional: true, dependsOn: ['vw_workbook_aging_cr'], order: 26, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'risco' },
  { codigo: 'performance_comercial_canal', titulo: 'Performance Comercial por Canal', subtitulo: 'Origem/canal de vendas (quando disponível)', chartType: 'coluna', dependencies: ['vw_apresentacao_performance_comercial_canal'], expectedDatasets: ['canais'], required: false, optional: true, dependsOn: ['notas_fiscais'], order: 27, hiddenWhenEmpty: true, modeSupport: ['dinamico', 'fechado'], secao: 'comercial' },
  { codigo: 'closing', titulo: 'Encerramento', subtitulo: 'Resumo e próximos passos', chartType: 'texto', dependencies: [], expectedDatasets: ['metadata'], required: true, optional: false, dependsOn: [], order: 999, hiddenWhenEmpty: false, modeSupport: ['dinamico', 'fechado'], secao: 'encerramento' },
];

export const APRESENTACAO_SLIDES_MAP = new Map(APRESENTACAO_SLIDES_V2.map((s) => [s.codigo, s]));
export const APRESENTACAO_SLIDES_V1 = APRESENTACAO_SLIDES_V2.filter((s) => s.order <= 12 || s.codigo === 'cover');
