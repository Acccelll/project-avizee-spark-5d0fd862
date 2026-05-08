import { Outlet } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { useAppConfigContext } from '@/contexts/AppConfigContext';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './navigation/AppHeader';
import { MobileBottomNav } from './navigation/MobileBottomNav';
import { MobileMenu } from './navigation/MobileMenu';
import { MobileQuickActions } from './navigation/MobileQuickActions';
import { RelationalDrawerStack } from './views/RelationalDrawerStack';
import { SkipLink } from './SkipLink';
import { useIsMobile } from '@/hooks/use-mobile';
import { ContrastDevTool } from './accessibility/ContrastDevTool';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';
import { GlobalSearch } from './navigation/GlobalSearch';
import { GlobalShortcutsDialog } from './navigation/GlobalShortcutsDialog';
import { GlobalPeriodProvider } from '@/contexts/DashboardPeriodContext';
import { HelpProvider, useHelp } from '@/contexts/HelpContext';
import { HelpDrawer } from './help/HelpDrawer';
import { CoachTour } from './help/CoachTour';
import { FirstVisitToast } from './help/FirstVisitToast';
import { CertificadoValidadeAlert } from './fiscal/CertificadoValidadeAlert';

/**
 * AppLayout
 *
 * Shell global da aplicação. Renderizado UMA vez no topo da árvore de rotas
 * autenticadas (`<Route element={<AppLayout />}>...</Route>`); as páginas-filho
 * aparecem via `<Outlet />`. Sidebar, Header, drawers globais e hotkeys
 * permanecem montados ao trocar de rota.
 */
export function AppLayout() {
  const isMobile = useIsMobile();
  const { sidebarCollapsed, saveSidebarCollapsed, sidebarMode } = useAppConfigContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  // Hooks fiscais (`useNfeEntradaToast`, `useAutoCienciaDistDFe`) foram movidos
  // para `<FiscalShell>` em src/components/fiscal/FiscalShell.tsx — montados
  // somente dentro de rotas /fiscal/*, evitando queries para perfis sem
  // permissão fiscal.

  // Modo dinâmico: recolhido por padrão, expande visualmente no hover (overlay).
  // No modo fixed-* a preferência boolean `sidebarCollapsed` continua valendo
  // como retrocompatibilidade — usamos o modo apenas se foi explicitamente setado.
  const isDynamic = sidebarMode === 'dynamic';
  const isFixedCollapsed = sidebarMode === 'fixed-collapsed';
  const isFixedExpanded = sidebarMode === 'fixed-expanded';

  const collapsed = useMemo(() => {
    if (isFixedExpanded) return false;
    if (isFixedCollapsed) return true;
    if (isDynamic) return !hoverExpanded;
    return sidebarCollapsed;
  }, [isFixedExpanded, isFixedCollapsed, isDynamic, hoverExpanded, sidebarCollapsed]);

  // No modo dinâmico, a margem do conteúdo principal segue sempre o estado
  // recolhido (72px) — o overlay cresce sobre o conteúdo, sem empurrá-lo.
  const contentMarginCollapsed = isDynamic ? true : collapsed;

  // Hotkeys globais — registradas uma única vez, sobrevivem a navegação.
  // O atalho `?` para abrir a ajuda da tela é injetado dentro de HelpProvider.

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  return (
    <GlobalPeriodProvider>
    <HelpProvider>
    <HelpHotkeysBridge
      onOpenSearch={() => setSearchOpen(true)}
      onOpenShortcuts={() => setShortcutsOpen(true)}
    />
    <div className="min-h-screen bg-background">
      <SkipLink />

      <div
        className="hidden md:block"
        onMouseEnter={isDynamic ? () => setHoverExpanded(true) : undefined}
        onMouseLeave={isDynamic ? () => setHoverExpanded(false) : undefined}
      >
        <AppSidebar
          collapsed={collapsed}
          onToggleCollapsed={() => saveSidebarCollapsed(!collapsed)}
          onOpenSearch={() => setSearchOpen(true)}
        />
      </div>

      <div
        className="min-h-screen transition-[margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:[margin-left:var(--sidebar-w)]"
        style={{
          ['--sidebar-w' as string]: contentMarginCollapsed
            ? 'var(--sidebar-w-collapsed)'
            : 'var(--sidebar-w-expanded)',
        }}
      >
        <AppHeader
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
        <main
          id="main-content"
          role="main"
          className="mx-auto max-w-[1600px] px-3 py-4 pb-28 md:px-6 md:py-5 md:pb-5"
        >
          <div className="mb-3 empty:mb-0">
            <CertificadoValidadeAlert dismissible />
          </div>
          <Outlet />
        </main>
      </div>

      <MobileMenu
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <MobileQuickActions />
      <MobileBottomNav onOpenMenu={() => setMobileMenuOpen(true)} />
      <RelationalDrawerStack />

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <GlobalShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <HelpDrawer />
      <CoachTour />
      <FirstVisitToast />

      {import.meta.env.DEV && <ContrastDevTool />}
    </div>
    </HelpProvider>
    </GlobalPeriodProvider>
  );
}

/**
 * Bridge que registra os hotkeys globais com acesso ao contexto de ajuda.
 * Precisa estar dentro do `HelpProvider` para poder abrir o HelpDrawer via `?`.
 */
function HelpHotkeysBridge({
  onOpenSearch,
  onOpenShortcuts,
}: {
  onOpenSearch: () => void;
  onOpenShortcuts: () => void;
}) {
  const { openDrawer } = useHelp();
  useGlobalHotkeys({
    onOpenSearch,
    onOpenShortcuts,
    onOpenHelp: openDrawer,
  });
  return null;
}
