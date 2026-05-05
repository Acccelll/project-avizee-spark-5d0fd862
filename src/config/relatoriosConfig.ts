/**
 * Central configuration for the Reports module.
 *
 * Each report has:
 *   - objective       : what the report answers
 *   - columns         : ordered column definitions with labels and format hints
 *   - filters         : which filter controls are relevant
 *   - kpis            : KPI definitions (key → label/format/variant)
 *   - chartType       : preferred chart type
 *   - drillDown       : future drill-down actions per row
 *
 * This file drives column labeling, filter visibility, KPI rendering and chart
 * selection in Relatorios.tsx without requiring changes to the service contract.
 */

import type { TipoRelatorio } from '@/services/relatorios.service';
import {
  Package,
  AlertTriangle,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  ShoppingCart,
  Truck,
  Receipt,
  CalendarClock,
  BarChart3,
  PieChart,
  DollarSign,
  Building2,
  Landmark,
  Boxes,
  Users,
  ContactRound,
  IdCard,
  type LucideIcon,
} from 'lucide-react';

export type ReportCategory =
  | 'comercial'
  | 'financeiro'
  | 'estoque_suprimentos'
  | 'fiscal_faturamento'
  | 'cadastros';

export type ChartType = 'bar' | 'pie' | 'line';

export type ColumnFormat =
  | 'currency'
  | 'number'
  | 'quantity'
  | 'date'
  | 'percent'
  | 'text'
  | 'badge';

export interface ReportColumnDef {
  key: string;
  label: string;
  format?: ColumnFormat;
  align?: 'right' | 'left' | 'center';
  /** Whether to include this column in the footer totals row */
  footerTotal?: boolean;
}

export interface ReportKpiDef {
  key: string;
  label: string;
  format: 'currency' | 'number' | 'percent';
  variant?: 'default' | 'danger' | 'warning' | 'success' | 'info';
  variation?: string;
}

export interface ReportFiltersDef {
  showDateRange: boolean;
  showClientes: boolean;
  showFornecedores: boolean;
  showGrupos: boolean;
  showStatus: boolean;
  /** When provided, overrides the default status option list in FiltrosRelatorio. */
  statusOptions?: Array<{ value: string; label: string }>;
  showTipos: boolean;
  showSomenteCriticos?: boolean;
  showSomenteZerados?: boolean;
  showDreCompetencia?: boolean;
}

export interface ReportDrillDownAction {
  key: string;
  label: string;
  /** Prepared for future navigation — may not be wired yet */
  route?: string;
  /** Hidden row field carrying the ID to use when constructing the navigation. */
  targetField?: string;
  available: boolean;
}

/** Semantic temporal axis applied by a report's date filter. */
export interface ReportTimeAxisDef {
  field: 'emissao' | 'vencimento' | 'pagamento' | 'criacao' | 'competencia';
  label: string;
  required: boolean;
}

export interface ReportConfig {
  id: TipoRelatorio;
  title: string;
  description: string;
  objective: string;
  category: ReportCategory;
  priority?: boolean;
  icon: LucideIcon;
  chartType: ChartType;
  columns: ReportColumnDef[];
  filters: ReportFiltersDef;
  kpis: ReportKpiDef[];
  /**
   * Declares which date column is filtered when `filters.showDateRange` is on.
   * Mirrored into `RelatorioResultado.meta.timeAxis` by the service layer.
   */
  timeAxis?: ReportTimeAxisDef;
  drillDown?: ReportDrillDownAction[];
}

export interface ReportRuntimeSemantics {
  /** Campo canônico de status por relatório (fallback controlado no utilitário). */
  statusField?: string;
  /** Campo canônico para ordenação por valor quando usuário escolhe "Maior valor". */
  valueSortField?: string;
  /** Campo canônico para ordenação temporal. */
  dateSortField?: string;
  /** Eixo temporal que o período representa para o usuário. */
  periodAxisLabel?: string;
  /** Texto auxiliar para explicar o filtro de status nesse relatório. */
  statusMeaning?: string;
  /** Texto auxiliar para explicar o filtro de tipo nesse relatório. */
  typeMeaning?: string;
  /** Filtros mais relevantes para o relatório (mostrados com destaque). */
  highlightFilters?: Array<'periodo' | 'status' | 'tipo' | 'clientes' | 'fornecedores' | 'grupos'>;
  /** Campo que indica linha investigável/navegável (preparo para drill-down). */
  investigableField?: string;
}

// ---------------------------------------------------------------------------
// Individual report configurations
// ---------------------------------------------------------------------------

const estoqueConfig: ReportConfig = {
  id: 'estoque',
  title: 'Estoque',
  description: 'Posição atual, custo e alertas por produto',
  objective: 'Posição atual do estoque com valor, custo e criticidade',
  category: 'estoque_suprimentos',
  icon: Package,
  chartType: 'pie',
  columns: [
    { key: 'codigo', label: 'Código' },
    { key: 'produto', label: 'Produto' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'unidade', label: 'UN', align: 'center' },
    { key: 'estoqueAtual', label: 'Estoque Atual', format: 'quantity', align: 'right', footerTotal: true },
    { key: 'estoqueMinimo', label: 'Mínimo', format: 'quantity', align: 'right' },
    { key: 'criticidade', label: 'Situação', format: 'badge' },
    { key: 'custoUnit', label: 'Custo Unit.', format: 'currency', align: 'right' },
    { key: 'totalCusto', label: 'Total Custo', format: 'currency', align: 'right', footerTotal: true },
    { key: 'vendaUnit', label: 'Preço Venda', format: 'currency', align: 'right' },
    { key: 'totalVenda', label: 'Total Venda', format: 'currency', align: 'right', footerTotal: true },
  ],
  filters: {
    showDateRange: false,
    showClientes: false,
    showFornecedores: false,
    showGrupos: true,
    showStatus: false,
    showTipos: false,
    showSomenteCriticos: true,
    showSomenteZerados: true,
  },
  kpis: [
    { key: 'totalItens', label: 'Total de Itens', format: 'number', variation: 'produtos ativos' },
    { key: 'totalQtd', label: 'Qtd em Estoque', format: 'number', variation: 'unidades' },
    { key: 'totalCusto', label: 'Custo Total', format: 'currency', variation: 'valor investido' },
    { key: 'itensCriticos', label: 'Itens Críticos', format: 'number', variant: 'warning', variation: 'abaixo do mínimo' },
    { key: 'itensZerados', label: 'Zerados', format: 'number', variant: 'danger', variation: 'sem estoque' },
  ],
  drillDown: [
    { key: 'produto', label: 'Abrir produto', route: '/produtos', targetField: 'produtoId', available: true },
    { key: 'movimentos', label: 'Ver movimentações', route: '/relatorios?tipo=movimentos_estoque', targetField: 'produtoId', available: true },
  ],
};

const estoqueMinConfig: ReportConfig = {
  id: 'estoque_minimo',
  title: 'Estoque Mínimo',
  description: 'Produtos em ruptura ou risco de abastecimento',
  objective: 'Produtos em ruptura ou risco de abastecimento',
  category: 'estoque_suprimentos',
  priority: true,
  icon: AlertTriangle,
  chartType: 'bar',
  columns: [
    { key: 'codigo', label: 'Código' },
    { key: 'produto', label: 'Produto' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'unidade', label: 'UN', align: 'center' },
    { key: 'estoqueAtual', label: 'Estoque Atual', format: 'quantity', align: 'right' },
    { key: 'estoqueMinimo', label: 'Mínimo', format: 'quantity', align: 'right' },
    { key: 'deficit', label: 'Déficit', format: 'quantity', align: 'right', footerTotal: true },
    { key: 'criticidade', label: 'Criticidade', format: 'badge' },
    { key: 'custoReposicao', label: 'Custo Reposição', format: 'currency', align: 'right', footerTotal: true },
  ],
  filters: {
    showDateRange: false,
    showClientes: false,
    showFornecedores: false,
    showGrupos: true,
    showStatus: false,
    showTipos: false,
    showSomenteZerados: true,
  },
  kpis: [
    { key: 'itensCriticos', label: 'Itens Críticos', format: 'number', variant: 'warning', variation: 'abaixo do mínimo' },
    { key: 'itensZerados', label: 'Zerados', format: 'number', variant: 'danger', variation: 'sem estoque' },
    { key: 'deficitTotal', label: 'Déficit Total', format: 'number', variation: 'unidades em falta' },
    { key: 'custoTotal', label: 'Custo de Reposição', format: 'currency', variant: 'warning', variation: 'estimado' },
  ],
  drillDown: [
    { key: 'produto', label: 'Abrir produto', route: '/produtos', targetField: 'produtoId', available: true },
    { key: 'compra', label: 'Iniciar reposição', route: '/pedidos-compra', targetField: 'produtoId', available: false },
  ],
};

const movimentosConfig: ReportConfig = {
  id: 'movimentos_estoque',
  title: 'Movimentos de Estoque',
  description: 'Entradas, saídas e ajustes por período',
  objective: 'Trilha operacional das movimentações de estoque',
  category: 'estoque_suprimentos',
  icon: ArrowLeftRight,
  chartType: 'bar',
  columns: [
    { key: 'data', label: 'Data', format: 'date' },
    { key: 'codigo', label: 'Código' },
    { key: 'produto', label: 'Produto' },
    { key: 'tipo', label: 'Tipo', format: 'badge' },
    { key: 'documento', label: 'Origem / Doc.' },
    { key: 'quantidade', label: 'Quantidade', format: 'quantity', align: 'right' },
    { key: 'saldoAnterior', label: 'Saldo Anterior', format: 'quantity', align: 'right' },
    { key: 'saldoAtual', label: 'Saldo Atual', format: 'quantity', align: 'right' },
    { key: 'motivo', label: 'Motivo' },
  ],
  filters: {
    showDateRange: true,
    showClientes: false,
    showFornecedores: false,
    showGrupos: true,
    showStatus: false,
    showTipos: false,
  },
  timeAxis: { field: 'criacao', label: 'criação', required: false },
  kpis: [
    { key: 'totalMovimentos', label: 'Total de Movimentos', format: 'number', variation: 'no período' },
    { key: 'totalEntradas', label: 'Entradas', format: 'number', variant: 'success', variation: 'unidades' },
    { key: 'totalSaidas', label: 'Saídas', format: 'number', variant: 'danger', variation: 'unidades' },
    { key: 'totalAjustes', label: 'Ajustes', format: 'number', variant: 'warning', variation: 'unidades' },
  ],
  drillDown: [
    { key: 'produto', label: 'Abrir produto', route: '/produtos', targetField: 'produtoId', available: true },
  ],
};

const financeiroConfig: ReportConfig = {
  id: 'financeiro',
  title: 'Financeiro',
  description: 'Contas a pagar e receber',
  objective: 'Títulos financeiros a pagar e receber com leitura operacional',
  category: 'financeiro',
  priority: true,
  icon: Wallet,
  chartType: 'pie',
  columns: [
    { key: 'tipo', label: 'Tipo', format: 'badge' },
    { key: 'parceiro', label: 'Parceiro' },
    { key: 'descricao', label: 'Descrição' },
    { key: 'vencimento', label: 'Vencimento', format: 'date' },
    { key: 'pagamento', label: 'Pagamento', format: 'date' },
    { key: 'valor', label: 'Valor Original', format: 'currency', align: 'right', footerTotal: true },
    { key: 'valorEmAberto', label: 'Em Aberto', format: 'currency', align: 'right' },
    { key: 'atraso', label: 'Atraso (dias)', format: 'number', align: 'right' },
    { key: 'status', label: 'Status', format: 'badge' },
    { key: 'formaPagamento', label: 'Forma Pagto.' },
    { key: 'banco', label: 'Banco' },
  ],
  filters: {
    showDateRange: true,
    showClientes: false,
    showFornecedores: false,
    showGrupos: false,
    showStatus: true,
    statusOptions: [
      { value: 'todos', label: 'Todos' },
      { value: 'aberto', label: 'Em aberto' },
      { value: 'parcial', label: 'Parcial' },
      { value: 'pago', label: 'Pago' },
      { value: 'vencido', label: 'Vencido' },
      { value: 'cancelado', label: 'Cancelado' },
      { value: 'estornado', label: 'Estornado' },
    ],
    showTipos: true,
  },
  timeAxis: { field: 'vencimento', label: 'vencimento', required: false },
  kpis: [
    { key: 'totalReceber', label: 'A Receber', format: 'currency', variant: 'success', variation: 'em aberto' },
    { key: 'totalPagar', label: 'A Pagar', format: 'currency', variant: 'danger', variation: 'em aberto' },
    { key: 'totalVencido', label: 'Vencido', format: 'currency', variant: 'warning', variation: 'requer ação' },
    { key: 'totalPago', label: 'Pago no Período', format: 'currency', variation: 'liquidado' },
  ],
  drillDown: [
    { key: 'lancamento', label: 'Abrir lançamento', route: '/financeiro', targetField: 'lancamentoId', available: true },
  ],
};

const fluxoCaixaConfig: ReportConfig = {
  id: 'fluxo_caixa',
  title: 'Fluxo de Caixa',
  description: 'Entradas, saídas e saldo acumulado',
  objective: 'Entradas, saídas e saldo cronológico',
  category: 'financeiro',
  priority: true,
  icon: TrendingUp,
  chartType: 'line',
  columns: [
    { key: 'data', label: 'Data', format: 'date' },
    { key: 'descricao', label: 'Descrição' },
    { key: 'tipo', label: 'Tipo', format: 'badge' },
    { key: 'status', label: 'Status', format: 'badge' },
    { key: 'entrada', label: 'Entrada', format: 'currency', align: 'right', footerTotal: true },
    { key: 'saida', label: 'Saída', format: 'currency', align: 'right', footerTotal: true },
    { key: 'saldo', label: 'Saldo Acumulado', format: 'currency', align: 'right' },
  ],
  filters: {
    showDateRange: true,
    showClientes: false,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: true,
  },
  timeAxis: { field: 'pagamento', label: 'pagamento (ou vencimento)', required: false },
  kpis: [
    { key: 'totalEntradas', label: 'Entradas', format: 'currency', variant: 'success', variation: 'período' },
    { key: 'totalSaidas', label: 'Saídas', format: 'currency', variant: 'danger', variation: 'período' },
    { key: 'saldoFinal', label: 'Saldo do Período', format: 'currency', variation: 'posição final' },
  ],
};

const vendasConfig: ReportConfig = {
  id: 'vendas',
  title: 'Vendas',
  description: 'Ordens por período com status comercial e faturamento',
  objective: 'Pedidos e ordens de venda com leitura comercial',
  category: 'comercial',
  icon: ShoppingCart,
  chartType: 'line',
  columns: [
    { key: 'numero', label: 'Nº Pedido' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'emissao', label: 'Emissão', format: 'date' },
    { key: 'valor', label: 'Valor', format: 'currency', align: 'right', footerTotal: true },
    { key: 'status', label: 'Status Comercial', format: 'badge' },
    { key: 'faturamento', label: 'Faturamento', format: 'badge' },
  ],
  filters: {
    showDateRange: true,
    showClientes: true,
    showFornecedores: false,
    showGrupos: false,
    showStatus: true,
    statusOptions: [
      { value: 'todos', label: 'Todos' },
      { value: 'rascunho', label: 'Rascunho' },
      { value: 'confirmado', label: 'Confirmado' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
    showTipos: false,
  },
  timeAxis: { field: 'emissao', label: 'emissão', required: false },
  kpis: [
    { key: 'totalVendido', label: 'Total Vendido', format: 'currency', variation: 'no período' },
    { key: 'qtdPedidos', label: 'Pedidos', format: 'number', variation: 'quantidade' },
    { key: 'ticketMedio', label: 'Ticket Médio', format: 'currency', variation: 'por pedido' },
    { key: 'aguardandoFaturamento', label: 'Aguard. Faturamento', format: 'number', variant: 'warning', variation: 'pedidos' },
  ],
  drillDown: [
    { key: 'pedido', label: 'Abrir pedido', route: '/pedidos', targetField: 'ordemVendaId', available: true },
  ],
};

const vendasClienteConfig: ReportConfig = {
  id: 'vendas_cliente',
  title: 'Vendas / Cliente',
  description: 'Ranking de clientes por volume',
  objective: 'Ranking e concentração de vendas por cliente',
  category: 'comercial',
  icon: ShoppingCart,
  chartType: 'bar',
  columns: [
    { key: 'posicao', label: '#', align: 'right' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'pedidos', label: 'Pedidos', format: 'number', align: 'right' },
    { key: 'valorTotal', label: 'Total', format: 'currency', align: 'right', footerTotal: true },
    { key: 'ticketMedio', label: 'Ticket Médio', format: 'currency', align: 'right' },
    { key: 'participacao', label: 'Participação %', format: 'percent', align: 'right' },
  ],
  filters: {
    showDateRange: true,
    showClientes: true,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
  },
  timeAxis: { field: 'emissao', label: 'emissão', required: false },
  kpis: [
    { key: 'totalVendido', label: 'Total Vendido', format: 'currency', variation: 'no período' },
    { key: 'clientesAtendidos', label: 'Clientes Atendidos', format: 'number', variation: 'no período' },
    { key: 'ticketMedioGeral', label: 'Ticket Médio Geral', format: 'currency', variation: 'por pedido' },
    { key: 'top5Concentracao', label: 'Conc. Top 5', format: 'percent', variation: '% do total' },
  ],
  drillDown: [
    { key: 'cliente', label: 'Abrir cliente', route: '/clientes', targetField: 'clienteId', available: true },
  ],
};

const comprasConfig: ReportConfig = {
  id: 'compras',
  title: 'Compras',
  description: 'Pedidos de compra e andamento',
  objective: 'Pedidos de compra e seu andamento',
  category: 'estoque_suprimentos',
  icon: Truck,
  chartType: 'bar',
  columns: [
    { key: 'numero', label: 'Nº Pedido' },
    { key: 'fornecedor', label: 'Fornecedor' },
    { key: 'compra', label: 'Data Compra', format: 'date' },
    { key: 'prevista', label: 'Prev. Entrega', format: 'date' },
    { key: 'entrega', label: 'Entrega Real', format: 'date' },
    { key: 'valor', label: 'Valor', format: 'currency', align: 'right', footerTotal: true },
    { key: 'atraso', label: 'Atraso (dias)', format: 'number', align: 'right' },
    { key: 'status', label: 'Status', format: 'badge' },
  ],
  filters: {
    showDateRange: true,
    showClientes: false,
    showFornecedores: true,
    showGrupos: false,
    showStatus: true,
    statusOptions: [
      { value: 'todos', label: 'Todos' },
      { value: 'pendente', label: 'Pendente' },
      { value: 'aprovado', label: 'Aprovado' },
      { value: 'em_transito', label: 'Em Trânsito' },
      { value: 'entregue', label: 'Entregue' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
    showTipos: false,
  },
  timeAxis: { field: 'criacao', label: 'data de compra', required: false },
  kpis: [
    { key: 'qtdCompras', label: 'Compras', format: 'number', variation: 'no período' },
    { key: 'totalComprado', label: 'Valor Comprado', format: 'currency', variation: 'total' },
    { key: 'emAberto', label: 'Em Aberto', format: 'number', variant: 'warning', variation: 'pedidos' },
    { key: 'atrasadas', label: 'Atrasadas', format: 'number', variant: 'danger', variation: 'pendentes' },
  ],
  drillDown: [
    { key: 'compra', label: 'Abrir pedido', route: '/pedidos-compra', targetField: 'compraId', available: true },
    { key: 'fornecedor', label: 'Abrir fornecedor', route: '/fornecedores', targetField: 'fornecedorId', available: false },
  ],
};

const comprasFornecedorConfig: ReportConfig = {
  id: 'compras_fornecedor',
  title: 'Compras / Fornecedor',
  description: 'Ranking de fornecedores por volume',
  objective: 'Concentração e ranking de compras por fornecedor',
  category: 'estoque_suprimentos',
  icon: Truck,
  chartType: 'bar',
  columns: [
    { key: 'posicao', label: '#', align: 'right' },
    { key: 'fornecedor', label: 'Fornecedor' },
    { key: 'pedidos', label: 'Pedidos', format: 'number', align: 'right' },
    { key: 'valorTotal', label: 'Total', format: 'currency', align: 'right', footerTotal: true },
    { key: 'ticketMedio', label: 'Ticket Médio', format: 'currency', align: 'right' },
    { key: 'participacao', label: 'Participação %', format: 'percent', align: 'right' },
  ],
  filters: {
    showDateRange: true,
    showClientes: false,
    showFornecedores: true,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
  },
  timeAxis: { field: 'criacao', label: 'data de compra', required: false },
  kpis: [
    { key: 'totalComprado', label: 'Total Comprado', format: 'currency', variation: 'no período' },
    { key: 'fornecedoresAtivos', label: 'Fornecedores', format: 'number', variation: 'no período' },
    { key: 'ticketMedioGeral', label: 'Ticket Médio', format: 'currency', variation: 'por pedido' },
    { key: 'top5Concentracao', label: 'Conc. Top 5', format: 'percent', variation: '% do total' },
  ],
  drillDown: [
    { key: 'fornecedor', label: 'Abrir fornecedor', route: '/fornecedores', targetField: 'fornecedorId', available: false },
  ],
};

const nfeEntradaConfig: ReportConfig = {
  id: 'nfe_entrada',
  title: 'NF-e de Entrada',
  description: 'Notas fiscais recebidas via manifestação do destinatário',
  objective: 'Acompanhar NF-e de entrada por fornecedor com totais de ICMS/IPI',
  category: 'fiscal_faturamento',
  icon: Receipt,
  chartType: 'bar',
  columns: [
    { key: 'emissao', label: 'Emissão', format: 'date' },
    { key: 'numero', label: 'Nº' },
    { key: 'serie', label: 'Série' },
    { key: 'fornecedor', label: 'Fornecedor' },
    { key: 'cnpj', label: 'CNPJ' },
    { key: 'valor', label: 'Valor Total', format: 'currency', align: 'right', footerTotal: true },
    { key: 'icms', label: 'ICMS', format: 'currency', align: 'right', footerTotal: true },
    { key: 'ipi', label: 'IPI', format: 'currency', align: 'right', footerTotal: true },
    { key: 'status', label: 'Manifestação', format: 'badge' },
    { key: 'processado', label: 'Processada', format: 'badge' },
  ],
  filters: {
    showDateRange: true,
    showClientes: false,
    showFornecedores: true,
    showGrupos: false,
    showStatus: true,
    statusOptions: [
      { value: 'todos', label: 'Todos' },
      { value: 'sem_manifestacao', label: 'Sem manifestação' },
      { value: 'ciencia', label: 'Ciência' },
      { value: 'confirmada', label: 'Confirmada' },
      { value: 'desconhecida', label: 'Desconhecida' },
      { value: 'nao_realizada', label: 'Não realizada' },
    ],
    showTipos: false,
  },
  timeAxis: { field: 'emissao', label: 'data de emissão', required: false },
  kpis: [
    { key: 'qtdNfe', label: 'NF-e', format: 'number', variation: 'no período' },
    { key: 'totalEntradas', label: 'Total Entradas', format: 'currency', variation: 'valor bruto' },
    { key: 'totalIcms', label: 'ICMS', format: 'currency', variation: 'destacado' },
    { key: 'totalIpi', label: 'IPI', format: 'currency', variation: 'destacado' },
    { key: 'processadas', label: 'Processadas', format: 'number', variant: 'success', variation: 'estoque + financeiro' },
  ],
  drillDown: [
    { key: 'fornecedor', label: 'Abrir fornecedor', route: '/fornecedores', targetField: 'fornecedorId', available: true },
    { key: 'nfe', label: 'Abrir NF-e', route: '/faturamento', targetField: 'nfeId', available: true },
  ],
};

const faturamentoConfig: ReportConfig = {
  id: 'faturamento',
  title: 'Faturamento',
  description: 'NFs de saída confirmadas com impostos e receita líquida',
  objective: 'Faturamento real com visão bruta, impostos e líquida',
  category: 'fiscal_faturamento',
  priority: true,
  icon: Receipt,
  chartType: 'line',
  columns: [
    { key: 'data', label: 'Data', format: 'date' },
    { key: 'nf', label: 'NF / Série' },
    { key: 'modelo', label: 'Modelo' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'ov', label: 'Pedido' },
    { key: 'valorTotal', label: 'Valor Bruto', format: 'currency', align: 'right', footerTotal: true },
    { key: 'desconto', label: 'Desconto', format: 'currency', align: 'right', footerTotal: true },
    { key: 'frete', label: 'Frete', format: 'currency', align: 'right' },
    { key: 'impostos', label: 'Impostos', format: 'currency', align: 'right', footerTotal: true },
    { key: 'receitaLiquida', label: 'Receita Líquida', format: 'currency', align: 'right', footerTotal: true },
  ],
  filters: {
    showDateRange: true,
    showClientes: true,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
  },
  timeAxis: { field: 'emissao', label: 'emissão', required: false },
  kpis: [
    { key: 'totalNotas', label: 'Notas Fiscais', format: 'number', variation: 'confirmadas' },
    { key: 'totalBruto', label: 'Bruto', format: 'currency', variation: 'faturamento bruto' },
    { key: 'totalImpostos', label: 'Impostos', format: 'currency', variant: 'warning', variation: 'retenções' },
    { key: 'totalLiquido', label: 'Receita Líquida', format: 'currency', variant: 'success', variation: 'resultado líquido' },
  ],
  drillDown: [
    { key: 'nf', label: 'Abrir NF', route: '/fiscal', targetField: 'notaFiscalId', available: true },
    { key: 'cliente', label: 'Abrir cliente', route: '/clientes', targetField: 'clienteId', available: true },
    { key: 'pedido', label: 'Abrir pedido', route: '/pedidos', targetField: 'ordemVendaId', available: true },
  ],
};

const agingConfig: ReportConfig = {
  id: 'aging',
  title: 'Aging',
  description: 'Envelhecimento da carteira em aberto',
  objective: 'Envelhecimento da carteira em aberto por faixa de dias',
  category: 'financeiro',
  icon: CalendarClock,
  chartType: 'bar',
  columns: [
    { key: 'tipo', label: 'Tipo', format: 'badge' },
    { key: 'parceiro', label: 'Parceiro' },
    { key: 'descricao', label: 'Descrição' },
    { key: 'vencimento', label: 'Vencimento', format: 'date' },
    { key: 'diasVencido', label: 'Dias Atraso', format: 'number', align: 'right' },
    { key: 'faixa', label: 'Faixa', format: 'badge' },
    { key: 'valor', label: 'Valor em Aberto', format: 'currency', align: 'right', footerTotal: true },
  ],
  filters: {
    showDateRange: true,
    showClientes: false,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: true,
  },
  timeAxis: { field: 'vencimento', label: 'vencimento', required: false },
  kpis: [
    { key: 'totalVencido', label: 'Total em Aberto', format: 'currency', variant: 'danger', variation: 'carteira vencida' },
    { key: 'titulosVencidos', label: 'Títulos Vencidos', format: 'number', variant: 'warning', variation: 'quantidade' },
    { key: 'maisAntigosDias', label: 'Mais Antigo', format: 'number', variation: 'dias de atraso' },
  ],
  drillDown: [
    { key: 'lancamento', label: 'Abrir lançamento', route: '/financeiro', targetField: 'lancamentoId', available: true },
  ],
};

const dreConfig: ReportConfig = {
  id: 'dre',
  title: 'DRE',
  description: 'Demonstrativo gerencial de resultado',
  objective: 'Demonstrativo gerencial de resultado — simplificação baseada em lançamentos financeiros',
  category: 'financeiro',
  priority: true,
  icon: BarChart3,
  chartType: 'bar',
  columns: [
    { key: 'linha', label: 'Linha' },
    { key: 'valor', label: 'Valor', format: 'currency', align: 'right' },
  ],
  filters: {
    showDateRange: false,
    showClientes: false,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
    showDreCompetencia: true,
  },
  timeAxis: { field: 'competencia', label: 'competência', required: true },
  kpis: [
    { key: 'receitaBruta', label: 'Receita Bruta', format: 'currency', variation: 'total bruto' },
    { key: 'receitaLiquida', label: 'Receita Líquida', format: 'currency', variation: 'após deduções' },
    { key: 'resultado', label: 'Resultado', format: 'currency', variation: 'período' },
  ],
};

const curvaAbcConfig: ReportConfig = {
  id: 'curva_abc',
  title: 'Curva ABC',
  description: 'Classificação de produtos por faturamento',
  objective: 'Classificação de produtos por relevância de faturamento',
  category: 'comercial',
  icon: PieChart,
  chartType: 'pie',
  columns: [
    { key: 'posicao', label: '#', align: 'right' },
    { key: 'codigo', label: 'Código' },
    { key: 'produto', label: 'Produto' },
    { key: 'faturamento', label: 'Faturamento', format: 'currency', align: 'right', footerTotal: true },
    { key: 'percentual', label: '%', format: 'percent', align: 'right' },
    { key: 'acumulado', label: 'Acumulado %', format: 'percent', align: 'right' },
    { key: 'classe', label: 'Classe', format: 'badge' },
  ],
  filters: {
    showDateRange: true,
    showClientes: false,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
  },
  timeAxis: { field: 'emissao', label: 'emissão', required: false },
  kpis: [
    { key: 'grandTotal', label: 'Total Faturado', format: 'currency', variation: 'no período' },
    { key: 'itensClasseA', label: 'Classe A', format: 'number', variant: 'success', variation: 'produtos (≤ 80% acumulado)' },
    // NOTE: These thresholds (A ≤ 80%, B 80–95%, C > 95%) must match the service curva_abc case
    { key: 'itensClasseB', label: 'Classe B', format: 'number', variation: 'produtos (80–95% acumulado)' },
    { key: 'itensClasseC', label: 'Classe C', format: 'number', variation: 'produtos (> 95% acumulado)' },
  ],
  drillDown: [
    { key: 'produto', label: 'Abrir produto', route: '/produtos', targetField: 'produtoId', available: true },
  ],
};

const margemConfig: ReportConfig = {
  id: 'margem_produtos',
  title: 'Margem',
  description: 'Análise de margem e markup por produto',
  objective: 'Rentabilidade potencial por produto — custo vs preço de venda',
  category: 'comercial',
  icon: DollarSign,
  chartType: 'bar',
  columns: [
    { key: 'codigo', label: 'Código' },
    { key: 'produto', label: 'Produto' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'custUnit', label: 'Custo Unit.', format: 'currency', align: 'right' },
    { key: 'vendaUnit', label: 'Preço Venda', format: 'currency', align: 'right' },
    { key: 'lucroUnit', label: 'Lucro Unit.', format: 'currency', align: 'right' },
    { key: 'margem', label: 'Margem %', format: 'percent', align: 'right' },
    { key: 'markup', label: 'Markup %', format: 'percent', align: 'right' },
    { key: 'estoque', label: 'Estoque', format: 'quantity', align: 'right' },
  ],
  filters: {
    showDateRange: false,
    showClientes: false,
    showFornecedores: false,
    showGrupos: true,
    showStatus: false,
    showTipos: false,
  },
  kpis: [
    { key: 'mediaMargemPct', label: 'Margem Média', format: 'percent', variation: 'todos os produtos' },
    { key: 'itensMargNeg', label: 'Margem Negativa', format: 'number', variant: 'danger', variation: 'produtos' },
    { key: 'maiorMargem', label: 'Maior Margem', format: 'percent', variant: 'success', variation: '%' },
    { key: 'menorMargem', label: 'Menor Margem', format: 'percent', variant: 'warning', variation: '%' },
  ],
  drillDown: [
    { key: 'produto', label: 'Abrir produto', route: '/produtos', targetField: 'produtoId', available: true },
  ],
};

const divergenciasConfig: ReportConfig = {
  id: 'divergencias',
  title: 'Divergências',
  description: 'Inconsistências entre módulos',
  objective: 'Pedidos sem NF, NFs sem lançamento financeiro',
  category: 'fiscal_faturamento',
  priority: true,
  icon: AlertTriangle,
  chartType: 'bar',
  columns: [
    { key: 'tipo', label: 'Tipo de Divergência', format: 'badge' },
    { key: 'referencia', label: 'Referência' },
    { key: 'parceiro', label: 'Parceiro' },
    { key: 'valor', label: 'Valor', format: 'currency', align: 'right', footerTotal: true },
    { key: 'status', label: 'Status', format: 'badge' },
    { key: 'criticidade', label: 'Criticidade', format: 'badge' },
    { key: 'observacao', label: 'Observação' },
  ],
  filters: {
    showDateRange: false,
    showClientes: false,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
  },
  kpis: [
    { key: 'totalDivergencias', label: 'Divergências', format: 'number', variant: 'warning', variation: 'itens' },
    { key: 'valorImpactado', label: 'Valor Impactado', format: 'currency', variant: 'danger', variation: 'estimado' },
    { key: 'pedidosSemNf', label: 'Pedidos s/ NF', format: 'number', variation: 'compras' },
    { key: 'nfSemFinanceiro', label: 'NF s/ Financeiro', format: 'number', variation: 'notas' },
  ],
};

// ─── Cadastros ─────────────────────────────────────────────────────────────

const cadastroProdutosConfig: ReportConfig = {
  id: 'cadastro_produtos',
  title: 'Cadastro de Produtos',
  description: 'Visão consolidada do cadastro de produtos e insumos',
  objective: 'Auditoria do cadastro: completude de custo, preço, NCM e grupo',
  category: 'cadastros',
  icon: Package,
  chartType: 'pie',
  columns: [
    { key: 'sku', label: 'SKU' },
    { key: 'codigo', label: 'Cód. Interno' },
    { key: 'produto', label: 'Produto' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'unidade', label: 'UN', align: 'center' },
    { key: 'tipo', label: 'Tipo', format: 'badge' },
    { key: 'ncm', label: 'NCM' },
    { key: 'origem', label: 'Origem' },
    { key: 'custo', label: 'Custo', format: 'currency', align: 'right' },
    { key: 'precoVenda', label: 'Preço Venda', format: 'currency', align: 'right' },
    { key: 'margem', label: 'Margem %', format: 'percent', align: 'right' },
    { key: 'estoque', label: 'Estoque', format: 'quantity', align: 'right' },
    { key: 'estoqueMinimo', label: 'Mínimo', format: 'quantity', align: 'right' },
    { key: 'situacao', label: 'Situação', format: 'badge' },
  ],
  filters: {
    showDateRange: false,
    showClientes: false,
    showFornecedores: false,
    showGrupos: true,
    showStatus: false,
    showTipos: false,
  },
  kpis: [
    { key: 'total', label: 'Total Cadastrados', format: 'number', variation: 'itens' },
    { key: 'ativos', label: 'Ativos', format: 'number', variant: 'success', variation: 'itens' },
    { key: 'inativos', label: 'Inativos', format: 'number', variation: 'itens' },
    { key: 'semCusto', label: 'Sem Custo', format: 'number', variant: 'warning', variation: 'itens' },
    { key: 'semPreco', label: 'Sem Preço', format: 'number', variant: 'warning', variation: 'itens' },
    { key: 'semNcm', label: 'Sem NCM', format: 'number', variant: 'warning', variation: 'itens' },
    { key: 'semGrupo', label: 'Sem Grupo', format: 'number', variant: 'warning', variation: 'itens' },
  ],
  drillDown: [
    { key: 'produto', label: 'Abrir produto', route: '/produtos', targetField: 'produtoId', available: true },
  ],
};

const cadastroClientesConfig: ReportConfig = {
  id: 'cadastro_clientes',
  title: 'Cadastro de Clientes',
  description: 'Visão consolidada da base de clientes',
  objective: 'Auditoria do cadastro de clientes (completude e situação)',
  category: 'cadastros',
  icon: ContactRound,
  chartType: 'pie',
  columns: [
    { key: 'tipoPessoa', label: 'Tipo', align: 'center' },
    { key: 'cliente', label: 'Nome / Razão Social' },
    { key: 'fantasia', label: 'Fantasia' },
    { key: 'cpfCnpj', label: 'CPF / CNPJ' },
    { key: 'municipio', label: 'Município' },
    { key: 'uf', label: 'UF', align: 'center' },
    { key: 'email', label: 'E-mail' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'limiteCredito', label: 'Lim. Crédito', format: 'currency', align: 'right' },
    { key: 'prazo', label: 'Prazo', format: 'number', align: 'right' },
    { key: 'grupoEconomico', label: 'Grupo Econômico' },
    { key: 'situacao', label: 'Situação', format: 'badge' },
  ],
  filters: {
    showDateRange: false,
    showClientes: true,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
  },
  kpis: [
    { key: 'total', label: 'Total Cadastrados', format: 'number', variation: 'clientes' },
    { key: 'ativos', label: 'Ativos', format: 'number', variant: 'success', variation: 'clientes' },
    { key: 'inativos', label: 'Inativos', format: 'number', variation: 'clientes' },
    { key: 'semEmail', label: 'Sem E-mail', format: 'number', variant: 'warning', variation: 'clientes' },
    { key: 'semTelefone', label: 'Sem Telefone', format: 'number', variant: 'warning', variation: 'clientes' },
    { key: 'semCpfCnpj', label: 'Sem CPF/CNPJ', format: 'number', variant: 'warning', variation: 'clientes' },
    { key: 'comLimite', label: 'Com Lim. Crédito', format: 'number', variant: 'info', variation: 'clientes' },
  ],
  drillDown: [
    { key: 'cliente', label: 'Abrir cliente', route: '/clientes', targetField: 'clienteId', available: true },
  ],
};

const cadastroFornecedoresConfig: ReportConfig = {
  id: 'cadastro_fornecedores',
  title: 'Cadastro de Fornecedores',
  description: 'Visão consolidada da base de fornecedores',
  objective: 'Auditoria do cadastro de fornecedores (completude e situação)',
  category: 'cadastros',
  icon: Users,
  chartType: 'pie',
  columns: [
    { key: 'tipoPessoa', label: 'Tipo', align: 'center' },
    { key: 'fornecedor', label: 'Nome / Razão Social' },
    { key: 'fantasia', label: 'Fantasia' },
    { key: 'cpfCnpj', label: 'CPF / CNPJ' },
    { key: 'municipio', label: 'Município' },
    { key: 'uf', label: 'UF', align: 'center' },
    { key: 'email', label: 'E-mail' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'prazo', label: 'Prazo', format: 'number', align: 'right' },
    { key: 'origem', label: 'Origem' },
    { key: 'transportadora', label: 'Transp.', align: 'center' },
    { key: 'situacao', label: 'Situação', format: 'badge' },
  ],
  filters: {
    showDateRange: false,
    showClientes: false,
    showFornecedores: true,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
  },
  kpis: [
    { key: 'total', label: 'Total Cadastrados', format: 'number', variation: 'fornecedores' },
    { key: 'ativos', label: 'Ativos', format: 'number', variant: 'success', variation: 'fornecedores' },
    { key: 'inativos', label: 'Inativos', format: 'number', variation: 'fornecedores' },
    { key: 'semCnpj', label: 'Sem CNPJ', format: 'number', variant: 'warning', variation: 'fornecedores' },
    { key: 'semContato', label: 'Sem Contato', format: 'number', variant: 'warning', variation: 'fornecedores' },
    { key: 'transportadoras', label: 'Transportadoras', format: 'number', variant: 'info', variation: 'fornecedores' },
  ],
  drillDown: [
    { key: 'fornecedor', label: 'Abrir fornecedor', route: '/fornecedores', targetField: 'fornecedorId', available: true },
  ],
};

const cadastroTransportadorasConfig: ReportConfig = {
  id: 'cadastro_transportadoras',
  title: 'Cadastro de Transportadoras',
  description: 'Fornecedores marcados como transportadoras',
  objective: 'Lista de transportadoras cadastradas',
  category: 'cadastros',
  icon: IdCard,
  chartType: 'pie',
  columns: [
    { key: 'transportadora', label: 'Nome / Razão Social' },
    { key: 'cpfCnpj', label: 'CNPJ' },
    { key: 'municipio', label: 'Município' },
    { key: 'uf', label: 'UF', align: 'center' },
    { key: 'email', label: 'E-mail' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'situacao', label: 'Situação', format: 'badge' },
  ],
  filters: {
    showDateRange: false,
    showClientes: false,
    showFornecedores: false,
    showGrupos: false,
    showStatus: false,
    showTipos: false,
  },
  kpis: [
    { key: 'total', label: 'Total', format: 'number', variation: 'transportadoras' },
    { key: 'ativos', label: 'Ativas', format: 'number', variant: 'success', variation: 'transportadoras' },
    { key: 'inativos', label: 'Inativas', format: 'number', variation: 'transportadoras' },
    { key: 'semContato', label: 'Sem Contato', format: 'number', variant: 'warning', variation: 'transportadoras' },
  ],
  drillDown: [
    { key: 'fornecedor', label: 'Abrir fornecedor', route: '/fornecedores', targetField: 'fornecedorId', available: true },
  ],
};

// ---------------------------------------------------------------------------
// Exported maps
// ---------------------------------------------------------------------------

export const reportConfigs: Record<TipoRelatorio, ReportConfig> = {
  estoque: estoqueConfig,
  estoque_minimo: estoqueMinConfig,
  movimentos_estoque: movimentosConfig,
  financeiro: financeiroConfig,
  fluxo_caixa: fluxoCaixaConfig,
  vendas: vendasConfig,
  vendas_cliente: vendasClienteConfig,
  compras: comprasConfig,
  compras_fornecedor: comprasFornecedorConfig,
  nfe_entrada: nfeEntradaConfig,
  faturamento: faturamentoConfig,
  aging: agingConfig,
  dre: dreConfig,
  curva_abc: curvaAbcConfig,
  margem_produtos: margemConfig,
  divergencias: divergenciasConfig,
  cadastro_produtos: cadastroProdutosConfig,
  cadastro_clientes: cadastroClientesConfig,
  cadastro_fornecedores: cadastroFornecedoresConfig,
  cadastro_transportadoras: cadastroTransportadorasConfig,
};

export const reportCategoryMeta: Record<
  ReportCategory,
  { title: string; icon: LucideIcon }
> = {
  comercial: { title: 'Comercial', icon: Building2 },
  financeiro: { title: 'Financeiro', icon: Landmark },
  estoque_suprimentos: { title: 'Estoque e Suprimentos', icon: Boxes },
  fiscal_faturamento: { title: 'Fiscal / Faturamento', icon: Receipt },
  cadastros: { title: 'Cadastros', icon: ContactRound },
};

export const reportRuntimeSemantics: Partial<Record<TipoRelatorio, ReportRuntimeSemantics>> = {
  estoque: {
    statusField: 'criticidade',
    valueSortField: 'totalCusto',
    periodAxisLabel: 'posição atual de estoque',
    highlightFilters: ['grupos'],
    investigableField: 'produto',
  },
  estoque_minimo: {
    statusField: 'criticidade',
    valueSortField: 'custoReposicao',
    periodAxisLabel: 'posição atual de abastecimento',
    highlightFilters: ['grupos'],
    investigableField: 'produto',
  },
  movimentos_estoque: {
    statusField: 'tipo',
    valueSortField: 'quantidade',
    dateSortField: 'data',
    periodAxisLabel: 'data de movimentação',
    typeMeaning: 'Tipo representa entrada, saída ou ajuste no estoque.',
    highlightFilters: ['periodo', 'grupos'],
    investigableField: 'documento',
  },
  financeiro: {
    statusField: 'status',
    valueSortField: 'valor',
    dateSortField: 'vencimento',
    periodAxisLabel: 'vencimento/pagamento dos títulos',
    statusMeaning: 'Status indica situação financeira do título no contas a pagar/receber.',
    typeMeaning: 'Tipo representa se o título é a pagar ou a receber.',
    highlightFilters: ['periodo', 'status', 'tipo'],
    investigableField: 'descricao',
  },
  aging: {
    statusField: 'faixa',
    valueSortField: 'valor',
    dateSortField: 'vencimento',
    periodAxisLabel: 'vencimento dos títulos',
    statusMeaning: 'Status agrupa títulos por faixa de atraso (aging).',
    highlightFilters: ['periodo', 'status'],
    investigableField: 'parceiro',
  },
  dre: {
    valueSortField: 'valor',
    periodAxisLabel: 'competência contábil',
    highlightFilters: ['periodo'],
  },
  curva_abc: {
    statusField: 'classe',
    valueSortField: 'faturamento',
    periodAxisLabel: 'faturamento acumulado no período',
    highlightFilters: ['periodo', 'grupos'],
    investigableField: 'produto',
  },
  divergencias: {
    statusField: 'criticidade',
    valueSortField: 'valor',
    periodAxisLabel: 'janela operacional analisada',
    statusMeaning: 'Status e criticidade representam impacto da divergência entre módulos.',
    highlightFilters: ['status'],
    investigableField: 'referencia',
  },
  vendas: { statusField: 'status', valueSortField: 'valor', dateSortField: 'emissao', periodAxisLabel: 'data de emissão' },
  vendas_cliente: { valueSortField: 'valorTotal', dateSortField: 'emissao', periodAxisLabel: 'data de emissão (por cliente)', highlightFilters: ['periodo', 'clientes'], investigableField: 'cliente' },
  // `compras` filtra/lista por data de compra (campo `compra` na linha) — alinhado a `timeAxis.field = 'criacao'` (data de compra) no config.
  compras: { statusField: 'status', valueSortField: 'valor', dateSortField: 'compra', periodAxisLabel: 'data de compra', highlightFilters: ['periodo', 'fornecedores'], investigableField: 'fornecedor' },
  compras_fornecedor: { valueSortField: 'valorTotal', dateSortField: 'compra', periodAxisLabel: 'data de compra (por fornecedor)', highlightFilters: ['periodo', 'fornecedores'], investigableField: 'fornecedor' },
  nfe_entrada: { statusField: 'status', valueSortField: 'valor', dateSortField: 'emissao', periodAxisLabel: 'data de emissão (NF-e de entrada)', highlightFilters: ['periodo', 'fornecedores', 'status'], investigableField: 'fornecedor' },
  faturamento: { valueSortField: 'valorTotal', dateSortField: 'data', periodAxisLabel: 'data de emissão da NF', highlightFilters: ['periodo'] },
  // Fluxo de caixa: o período filtra por `data_pagamento` (ou `data_vencimento` quando ainda não pago).
  fluxo_caixa: { valueSortField: 'saldo', dateSortField: 'data', periodAxisLabel: 'data de pagamento (ou vencimento)', highlightFilters: ['periodo', 'tipo'] },
  margem_produtos: { valueSortField: 'margem', periodAxisLabel: 'margem calculada na carteira', highlightFilters: ['grupos'], investigableField: 'produto' },
};
