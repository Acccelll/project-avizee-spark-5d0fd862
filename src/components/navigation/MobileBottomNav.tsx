import {
  Menu,
  LayoutDashboard,
  FileText,
  ClipboardList,
  ShoppingCart,
  Warehouse,
  Truck,
  Wallet,
  DollarSign,
  Receipt,
  Users,
  Package,
  Store,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { mobileBottomTabs, getNavSectionKey, DASHBOARD_KEY, navSections, type NavSectionKey } from '@/lib/navigation';
import { useVisibleSectionKeys } from '@/hooks/useVisibleNavSections';
import { useCan } from '@/hooks/useCan';
import type { Permission } from '@/utils/permissions';
import { cn } from '@/lib/utils';

/**
 * Mapeia o path padrão de cada bottom tab para a permissão necessária.
 * Quando o usuário não tem acesso ao destino padrão, caímos para o primeiro
 * item da seção que ele pode acessar — evita o tap → AccessDenied.
 */
const TAB_PATH_PERMISSIONS: Record<string, Permission> = {
  '/orcamentos': 'orcamentos:visualizar',
  '/clientes': 'clientes:visualizar',
  '/financeiro': 'financeiro:visualizar',
};

const PATH_PERMISSION_MAP: Record<string, Permission> = {
  '/produtos': 'produtos:visualizar',
  '/clientes': 'clientes:visualizar',
  '/fornecedores': 'fornecedores:visualizar',
  '/transportadoras': 'transportadoras:visualizar',
  '/formas-pagamento': 'formas_pagamento:visualizar',
  '/grupos-economicos': 'clientes:visualizar',
  '/funcionarios': 'usuarios:visualizar',
  '/socios': 'socios:visualizar',
  '/orcamentos': 'orcamentos:visualizar',
  '/pedidos': 'pedidos:visualizar',
  '/financeiro': 'financeiro:visualizar',
  '/fluxo-caixa': 'financeiro:visualizar',
  '/contas-bancarias': 'financeiro:visualizar',
  '/contas-contabeis-plano': 'financeiro:visualizar',
  '/conciliacao': 'financeiro:visualizar',
  '/socios-participacoes': 'socios:visualizar',
};

function basePath(p: string) {
  return p.split('?')[0];
}

/**
 * Tabs contextuais por seção ativa. Quando o usuário está dentro de uma das
 * seções abaixo, o bottom nav troca para atalhos internos da seção (mantendo
 * Início + Menu fixos pelo componente). Sem entrada aqui = comportamento global.
 */
type ContextualTab = {
  key: string;
  title: string;
  icon: LucideIcon;
  path: string;
  permission?: Permission;
};

const CONTEXTUAL_TABS_BY_SECTION: Partial<Record<NavSectionKey, ContextualTab[]>> = {
  comercial: [
    { key: 'orcamentos', title: 'Orçamentos', icon: FileText, path: '/orcamentos', permission: 'orcamentos:visualizar' },
    { key: 'pedidos', title: 'Pedidos', icon: ClipboardList, path: '/pedidos', permission: 'pedidos:visualizar' },
  ],
  compras: [
    { key: 'cotacoes-compra', title: 'Cotações', icon: ShoppingCart, path: '/cotacoes-compra' },
    { key: 'pedidos-compra', title: 'Pedidos', icon: ClipboardList, path: '/pedidos-compra' },
  ],
  estoque: [
    { key: 'estoque', title: 'Estoque', icon: Warehouse, path: '/estoque' },
    { key: 'logistica', title: 'Logística', icon: Truck, path: '/logistica' },
  ],
  financeiro: [
    { key: 'lancamentos', title: 'Lançamentos', icon: Wallet, path: '/financeiro', permission: 'financeiro:visualizar' },
    { key: 'fluxo-caixa', title: 'Fluxo', icon: DollarSign, path: '/fluxo-caixa', permission: 'financeiro:visualizar' },
  ],
  fiscal: [
    { key: 'dashboard-fiscal', title: 'Dashboard', icon: BarChart3, path: '/fiscal/dashboard', permission: 'faturamento_fiscal:visualizar' },
    { key: 'nf-entrada', title: 'Entrada', icon: Receipt, path: '/fiscal?tipo=entrada' },
    { key: 'nf-saida', title: 'Saída', icon: Receipt, path: '/fiscal?tipo=saida' },
  ],
  cadastros: [
    { key: 'clientes', title: 'Clientes', icon: Users, path: '/clientes', permission: 'clientes:visualizar' },
    { key: 'produtos', title: 'Produtos', icon: Package, path: '/produtos', permission: 'produtos:visualizar' },
    { key: 'fornecedores', title: 'Fornecedores', icon: Store, path: '/fornecedores', permission: 'fornecedores:visualizar' },
  ],
};

interface MobileBottomNavProps {
  onOpenMenu: () => void;
}

export function MobileBottomNav({ onOpenMenu }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useCan();
  const currentRoute = `${location.pathname}${location.search}`;
  const activeKey = getNavSectionKey(currentRoute);
  const visibleKeys = useVisibleSectionKeys();

  // Sempre inclui "Início" no começo. Quando o usuário está dentro de uma seção
  // com tabs contextuais definidas, troca os atalhos para itens da própria seção
  // (filtrados por permissão). Caso contrário, usa o conjunto global padrão.
  const tabs = useMemo(() => {
    const dashboardTab = mobileBottomTabs.find((t) => t.key === DASHBOARD_KEY)!;

    const contextual =
      activeKey !== DASHBOARD_KEY && activeKey !== 'menu'
        ? CONTEXTUAL_TABS_BY_SECTION[activeKey as NavSectionKey]
        : undefined;

    if (contextual && visibleKeys.has(activeKey as NavSectionKey)) {
      const allowed = contextual.filter((tab) => !tab.permission || can(tab.permission));
      if (allowed.length) {
        return [dashboardTab, ...allowed.map((tab) => ({ key: tab.key, title: tab.title, icon: tab.icon, path: tab.path }))];
      }
    }

    return mobileBottomTabs
      .filter((tab) => tab.key === DASHBOARD_KEY || visibleKeys.has(tab.key as NavSectionKey))
      .map((tab) => {
        if (tab.key === DASHBOARD_KEY) return tab;
        const defaultPerm = TAB_PATH_PERMISSIONS[basePath(tab.path)];
        if (!defaultPerm || can(defaultPerm)) return tab;
        const section = navSections.find((s) => s.key === tab.key);
        if (!section) return tab;
        const items = section.items.flatMap((g) => g.items);
        const allowedLeaf = items.find((item) => {
          const perm = PATH_PERMISSION_MAP[basePath(item.path)];
          return !perm || can(perm);
        });
        return allowedLeaf ? { ...tab, path: allowedLeaf.path } : tab;
      });
  }, [activeKey, visibleKeys, can]);

  return (
    <nav
      aria-label="Navegação mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur md:hidden"
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const tabBase = basePath(tab.path);
          const currentBase = basePath(currentRoute);
          // Tab "Início" só fica ativa em /. Tabs contextuais ficam ativas no path exato.
          // Tabs globais (cadastros/comercial/...) ficam ativas pela seção (activeKey).
          const isContextualTab = tab.key !== DASHBOARD_KEY && !mobileBottomTabs.some((t) => t.key === tab.key);
          const active = isContextualTab
            ? currentBase === tabBase || currentBase.startsWith(`${tabBase}/`)
            : activeKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.path)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-primary"
                />
              )}
              <span
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                  active && 'bg-primary/10',
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span>{tab.title}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          className={cn(
            'relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors',
            activeKey === 'menu' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {activeKey === 'menu' && (
            <span
              aria-hidden
              className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-primary"
            />
          )}
          <span
            className={cn(
              'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
              activeKey === 'menu' && 'bg-primary/10',
            )}
          >
            <Menu className="h-5 w-5" />
          </span>
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
