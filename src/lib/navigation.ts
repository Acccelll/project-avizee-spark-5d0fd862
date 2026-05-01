import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  LucideIcon,
  Package,
  Receipt,
  Settings,
  Shield,
  Database,
  ShoppingCart,
  Truck,
  User,
  Users,
  Wallet,
  Warehouse,
  FileSearch,
  UserCog,
  Share2,
  FileSpreadsheet,
  Presentation,
  Store,
  Briefcase,
} from 'lucide-react';

/** Canonical list of navSection keys. Add here first when introducing a new section. */
export const NAV_SECTION_KEYS = [
  'cadastros',
  'comercial',
  'compras',
  'estoque',
  'financeiro',
  'fiscal',
  'social',
  'relatorios',
  'administracao',
] as const;
export type NavSectionKey = (typeof NAV_SECTION_KEYS)[number];

/** Synthetic key used by mobile bottom nav and breadcrumbs for the dashboard. */
export const DASHBOARD_KEY = 'inicio' as const;

export interface NavLeafItem {
  title: string;
  path: string;
  /** Optional per-leaf icon. Falls back to the parent section icon when omitted. */
  icon?: LucideIcon;
  keywords?: string[];
}

export interface NavSubgroup {
  title: string;
  items: NavLeafItem[];
}

export interface NavSection {
  key: NavSectionKey;
  title: string;
  icon: LucideIcon;
  /** When set, the section behaves as a direct link (no expand/collapse). */
  directPath?: string;
  /** Sub-groups with leaf items. Leave empty (or omit) for direct-path sections. */
  items: NavSubgroup[];
  /** Optional pill shown next to the section title (e.g. "Em breve"). */
  badge?: string;
  /** When true, the section is rendered but not clickable. */
  disabled?: boolean;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  path: string;
  shortcut?: string;
  /** Permission key required to surface this action. When omitted, ação é pública. */
  requires?: string;
}

export interface MobileBottomTab {
  key: NavSectionKey | typeof DASHBOARD_KEY;
  title: string;
  icon: LucideIcon;
  path: string;
}

export const dashboardItem: NavLeafItem = {
  title: 'Dashboard',
  path: '/',
  icon: LayoutDashboard,
  keywords: ['inicio', 'painel', 'visao geral'],
};

export const quickActions: QuickAction[] = [
  { id: 'nova-cotacao', title: 'Novo Orçamento', description: 'Criar proposta comercial', path: '/orcamentos/novo', shortcut: '⌘N', requires: 'orcamentos:editar' },
  { id: 'novo-cliente', title: 'Novo Cliente', description: 'Abrir formulário de cliente', path: '/clientes?new=1', requires: 'clientes:editar' },
  { id: 'novo-produto', title: 'Novo Produto', description: 'Abrir formulário de produto', path: '/produtos?new=1', requires: 'produtos:editar' },
  { id: 'novo-pedido-compra', title: 'Novo Pedido', description: 'Abrir pedido de compra', path: '/pedidos-compra/novo', requires: 'compras:editar' },
  { id: 'nova-nota-saida', title: 'Nova Nota', description: 'Emitir nota fiscal de saída', path: '/fiscal?tipo=saida&new=1', requires: 'faturamento_fiscal:editar' },
  { id: 'baixa-financeira', title: 'Baixa Financeira', description: 'Abrir baixa em lote no Financeiro', path: '/financeiro?baixa=lote', requires: 'financeiro:baixar' },
];

export const navSections: NavSection[] = [
  {
    key: 'cadastros',
    title: 'Cadastros',
    icon: Users,
    items: [
      {
        title: 'Base cadastral',
        items: [
          { title: 'Produtos', path: '/produtos', icon: Package, keywords: ['sku', 'catalogo'] },
          { title: 'Clientes', path: '/clientes', icon: Users },
          { title: 'Fornecedores', path: '/fornecedores', icon: Store },
          { title: 'Transportadoras', path: '/transportadoras', icon: Truck, keywords: ['frete', 'logistica'] },
          { title: 'Formas de Pagamento', path: '/formas-pagamento', icon: CreditCard, keywords: ['prazo', 'parcelamento'] },
          { title: 'Grupos Econômicos', path: '/grupos-economicos', icon: Building2, keywords: ['matriz', 'filiais'] },
          { title: 'Funcionários', path: '/funcionarios', icon: UserCog, keywords: ['fopag', 'folha', 'salario', 'rh'] },
          { title: 'Sócios', path: '/socios', icon: Briefcase, keywords: ['socio', 'societario', 'participacao'] },
        ],
      },
    ],
  },
  {
    key: 'comercial',
    title: 'Comercial',
    icon: FileText,
    items: [
      {
        title: 'Pipeline de vendas',
        items: [
          { title: 'Orçamentos', path: '/orcamentos', icon: FileText, keywords: ['orcamentos', 'propostas', 'cotacoes', 'cotações'] },
          { title: 'Pedidos', path: '/pedidos', icon: ClipboardList, keywords: ['pedidos', 'backlog', 'operacional', 'ordens', 'ov'] },
        ],
      },
    ],
  },
  {
    key: 'compras',
    title: 'Compras',
    icon: ShoppingCart,
    items: [
      {
        title: 'Gestão de compras',
        items: [
          { title: 'Cotações de Compra', path: '/cotacoes-compra', icon: ShoppingCart, keywords: ['comparacao', 'fornecedores', 'cotacao'] },
          { title: 'Pedidos de Compra', path: '/pedidos-compra', icon: ShoppingCart, keywords: ['pre-nota', 'pedido fornecedor', 'recebimento'] },
        ],
      },
    ],
  },
  {
    key: 'estoque',
    title: 'Suprimentos e Logística',
    icon: Warehouse,
    items: [
      {
        title: 'Controle',
        items: [
          { title: 'Posição Atual', path: '/estoque', icon: Warehouse, keywords: ['saldo', 'inventario'] },
          { title: 'Logística', path: '/logistica', icon: Truck, keywords: ['rastreio', 'entrega', 'logistica', 'correios', 'remessas'] },
        ],
      },
    ],
  },
  {
    key: 'financeiro',
    title: 'Financeiro',
    icon: DollarSign,
    items: [
      {
        title: 'Execução financeira',
        items: [
          { title: 'Lançamentos', path: '/financeiro', icon: Wallet, keywords: ['cp', 'cr', 'despesas', 'recebimentos', 'contas a pagar', 'contas a receber'] },
          { title: 'Fluxo de Caixa', path: '/fluxo-caixa', icon: DollarSign },
          { title: 'Contas Bancárias', path: '/contas-bancarias', icon: DollarSign, keywords: ['bancos'] },
          { title: 'Cartões de Crédito', path: '/cartoes-credito', icon: CreditCard, keywords: ['cartao', 'fatura', 'credito'] },
          { title: 'Plano de Contas', path: '/contas-contabeis-plano', icon: FileSearch, keywords: ['contabil'] },
          { title: 'Conciliação', path: '/conciliacao', icon: DollarSign, keywords: ['ofx', 'extrato', 'banco', 'conciliar'] },
          { title: 'Budget Mensal', path: '/financeiro/budget', icon: BarChart3, keywords: ['orcamento', 'meta', 'planejamento', 'workbook'] },
        ],
      },
    ],
  },
  {
    key: 'fiscal',
    title: 'Fiscal',
    icon: Receipt,
    items: [
      {
        title: 'Documentos fiscais',
        items: [
          { title: 'Faturamento (em breve)', path: '/faturamento', icon: Receipt, keywords: ['emissor', 'sebrae', 'painel', 'sefaz', 'wizard', 'kpi', 'em breve'] },
          { title: 'Dashboard Fiscal', path: '/fiscal/dashboard', icon: BarChart3, keywords: ['indicadores', 'kpi', 'icms', 'apuracao', 'distdfe', 'painel'] },
          { title: 'Notas de Entrada', path: '/fiscal?tipo=entrada', icon: Receipt, keywords: ['recebimento', 'fornecedor', 'compra', 'xml', 'chave', 'nfe'] },
          { title: 'Notas de Saída', path: '/fiscal?tipo=saida', icon: Receipt, keywords: ['faturamento', 'cliente', 'pedido', 'emissao', 'sefaz', 'nfe'] },
        ],
      },
    ],
  },

  {
    key: 'social' as NavSectionKey,
    title: 'Social',
    icon: Share2,
    directPath: '/social',
    items: [] as NavSubgroup[],
    badge: import.meta.env.VITE_FEATURE_SOCIAL !== 'true' ? 'Em breve' : undefined,
    disabled: import.meta.env.VITE_FEATURE_SOCIAL !== 'true',
  },

  {
    key: 'relatorios',
    title: 'Relatórios',
    icon: BarChart3,
    items: [
      {
        title: 'Análises e exportações',
        items: [
          { title: 'Relatórios Operacionais', path: '/relatorios', icon: BarChart3, keywords: ['estoque', 'vendas', 'compras', 'financeiro'] },
          { title: 'Workbook Gerencial', path: '/relatorios/workbook-gerencial', icon: FileSpreadsheet, keywords: ['excel', 'relatorio', 'gerencial', 'workbook'] },
          { title: 'Apresentação Gerencial', path: '/relatorios/apresentacao-gerencial', icon: Presentation, keywords: ['pptx', 'powerpoint', 'fechamento', 'gerencial'] },
        ],
      },
    ],
  },
  {
    key: 'administracao',
    title: 'Administração',
    icon: Shield,
    items: [
      {
        title: 'Gestão do sistema',
        items: [
          { title: 'Configurações', path: '/administracao', icon: Settings, keywords: ['empresa', 'usuarios', 'email', 'fiscal', 'financeiro', 'parametros'] },
          { title: 'Migração de Dados', path: '/migracao-dados', icon: Database, keywords: ['importacao', 'excel', 'csv', 'carga'] },
          { title: 'Auditoria', path: '/auditoria', icon: Shield, keywords: ['logs', 'historico', 'rastreabilidade'] },
        ],
      },
    ],
  },
];

export const mobileBottomTabs: MobileBottomTab[] = [
  { key: DASHBOARD_KEY, title: 'Início', icon: LayoutDashboard, path: '/' },
  { key: 'comercial', title: 'Comercial', icon: FileText, path: '/orcamentos' },
  { key: 'cadastros', title: 'Cadastros', icon: Users, path: '/clientes' },
  { key: 'financeiro', title: 'Financeiro', icon: DollarSign, path: '/financeiro?tipo=receber' },
];

/** Sections shown in the mobile drawer menu (excludes those already in bottom tabs). */
const BOTTOM_TAB_SECTION_KEYS = new Set<NavSectionKey>(['comercial', 'cadastros', 'financeiro']);
export const mobileMenuSections = navSections.filter((section) => !BOTTOM_TAB_SECTION_KEYS.has(section.key));

export type FlatNavItem = NavLeafItem & { section: string; subgroup: string; sectionKey?: NavSectionKey };

export const flatNavItems: FlatNavItem[] = [
  { ...dashboardItem, section: '', subgroup: '' },
  ...navSections.flatMap((section): FlatNavItem[] => {
    // Direct-path sections contribute a single synthetic leaf item
    if (section.directPath) {
      return [{
        title: section.title,
        path: section.directPath,
        icon: section.icon,
        section: section.title,
        subgroup: '',
        sectionKey: section.key,
      }];
    }
    return section.items.flatMap((group) =>
      group.items.map((item) => ({
        ...item,
        icon: item.icon ?? section.icon,
        section: section.title,
        subgroup: group.title,
        sectionKey: section.key,
      })),
    );
  }),
];

/** O(1) lookup: pathname (without query) → flat nav item. */
const flatItemByPath = new Map<string, FlatNavItem>(
  flatNavItems.map((item) => [item.path.split('?')[0], item]),
);

/**
 * Icons indexed by route. Derived from the nav tree — the single source of truth.
 * Includes a fallback for `/configuracoes` which is not in the menu.
 * Note: `/perfil` is a legacy alias that redirects to `/configuracoes` — não registrar aqui.
 */
export const headerIcons: Record<string, LucideIcon> = {
  ...Object.fromEntries(
    flatNavItems
      .filter((item) => item.icon)
      .map((item) => [item.path.split('?')[0], item.icon as LucideIcon]),
  ),
  '/configuracoes': Settings,
  '/fiscal': Receipt,
};

const extraRouteLabels: Record<string, string> = {
  '/configuracoes': 'Minha conta',
  '/fiscal': 'Fiscal',
};

export function isPathActive(currentPath: string, targetPath: string) {
  const cleanTarget = targetPath.split('?')[0];
  if (cleanTarget === '/') return currentPath === '/';
  return currentPath === cleanTarget || currentPath.startsWith(`${cleanTarget}/`);
}

export function getRouteLabel(pathname: string) {
  if (extraRouteLabels[pathname]) return extraRouteLabels[pathname];
  const exact = flatItemByPath.get(pathname);
  if (exact) return exact.title;
  // Suffix `/editar` em qualquer rota → "Editar"
  if (pathname.endsWith('/editar')) return 'Editar';
  if (pathname.endsWith('/novo') || pathname.endsWith('/new')) return 'Novo';
  // Detalhes por entidade
  if (pathname.startsWith('/orcamentos/')) return 'Orçamento';
  if (pathname.startsWith('/cotacoes/')) return 'Orçamento';
  if (pathname.startsWith('/cotacoes-compra/')) return 'Cotação de Compra';
  if (pathname.startsWith('/pedidos-compra/')) return 'Pedido de Compra';
  if (pathname.startsWith('/pedidos/')) return 'Pedido';
  if (pathname.startsWith('/clientes/')) return 'Cliente';
  if (pathname.startsWith('/produtos/')) return 'Produto';
  if (pathname.startsWith('/fornecedores/')) return 'Fornecedor';
  if (pathname.startsWith('/remessas/')) return 'Remessa';
  if (pathname.startsWith('/financeiro/')) return 'Lançamento';
  if (pathname.startsWith('/fiscal/')) return 'Nota Fiscal';
  if (pathname.startsWith('/fiscal')) return 'Fiscal';
  return 'Detalhe';
}

/**
 * Returns the nav-section key for a given route.
 * Priority: leaf-item match (most specific) > directPath match > 'menu' fallback.
 * This ordering corrects /relatorios/workbook-gerencial returning 'relatorios'
 * even though it lives under the (formerly) Financeiro section.
 */
export function getNavSectionKey(currentRoute: string): NavSectionKey | typeof DASHBOARD_KEY | 'menu' {
  if (currentRoute === '/' || currentRoute.startsWith('/?')) return DASHBOARD_KEY;
  const pathname = currentRoute.split('?')[0];

  // 1. Match a specific leaf item first (handles nested routes like /orcamentos/123)
  const leafSection = navSections.find((entry) =>
    entry.items.some((group) =>
      group.items.some((item) => {
        const base = item.path.split('?')[0];
        return pathname === base || pathname.startsWith(`${base}/`);
      }),
    ),
  );
  if (leafSection) return leafSection.key;

  // 2. Fall back to direct-path sections
  const directSection = navSections.find(
    (entry) => entry.directPath && (pathname === entry.directPath || pathname.startsWith(`${entry.directPath}/`)),
  );
  if (directSection) return directSection.key;

  return 'menu';
}
