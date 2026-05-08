import { Fragment, lazy, Suspense, useState, type ReactNode } from "react";
import { SummaryCard } from "@/components/SummaryCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MobileDashboardHeader } from "@/components/dashboard/MobileDashboardHeader";
import { MobileCollapsibleBlock } from "@/components/dashboard/MobileCollapsibleBlock";
import { BackToTopButton } from "@/components/dashboard/BackToTopButton";
import { AlertStrip } from "@/components/dashboard/AlertStrip";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { FinanceiroBlock } from "@/components/dashboard/FinanceiroBlock";
import { ComercialBlock } from "@/components/dashboard/ComercialBlock";
import { EstoqueBlock } from "@/components/dashboard/EstoqueBlock";
import { LogisticaBlock } from "@/components/dashboard/LogisticaBlock";
import { FiscalBlock } from "@/components/dashboard/FiscalBlock";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { PendenciasList } from "@/components/dashboard/PendenciasList";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { BlockErrorBoundary } from "@/components/dashboard/BlockErrorBoundary";
import { KpiDetailDrawer, type KpiMetricKey } from "@/components/dashboard/KpiDetailDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMetas } from "@/hooks/useMetas";
import { useInView } from "@/hooks/useInView";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/pages/dashboard/hooks/useDashboardData";
import { useDashboardKpis } from "@/pages/dashboard/hooks/useDashboardKpis";
import { useDashboardDrawerData } from "@/pages/dashboard/hooks/useDashboardDrawerData";
import { useDashboardLayout, type WidgetId } from "@/hooks/useDashboardLayout";
import { DashboardCustomizeMenu } from "@/components/dashboard/DashboardCustomizeMenu";
import { buildDrilldownUrl } from "@/lib/dashboard/drilldown";
import { ScopeBadge } from "@/components/dashboard/ScopeBadge";
import {
  ShoppingBag,
  Package,
  Truck,
  FileText as FileTextIcon,
  DollarSign,
} from "lucide-react";

const VendasChart = lazy(() =>
  import("@/components/dashboard/VendasChart").then((m) => ({ default: m.VendasChart })),
);

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatVencimentosHoje(receber: number, pagar: number): string {
  if (receber === 0 && pagar === 0) return "Sem vencimentos para hoje.";
  const partes: string[] = [];
  if (receber > 0) partes.push(`${receber} recebimento${receber > 1 ? "s" : ""}`);
  if (pagar > 0) partes.push(`${pagar} pagamento${pagar > 1 ? "s" : ""}`);
  return `Você tem ${partes.join(" e ")} vencendo hoje.`;
}

function LazyInViewWidget({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.05 });
  return (
    <div ref={ref}>
      {inView ? children : (fallback ?? <Skeleton className="min-h-[220px] w-full rounded-xl" />)}
    </div>
  );
}

const DashboardContent = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { metas } = useMetas();
  const { prefs, toggleVisibility, moveWidget, resetLayout } = useDashboardLayout(user?.id);
  const isVisible = (id: WidgetId) => !prefs.hidden.includes(id);
  const isMobile = useIsMobile();

  const [metricDrawer, setMetricDrawer] = useState<KpiMetricKey | null>(null);

  const {
    stats,
    loading,
    fetching,
    loadedAt,
    loadData,
    backlogOVs,
    backlogOVsCount,
    comprasAguardando,
    comprasAtrasadasCount,
    dailyPagar,
    dailyReceber,
    estoqueBaixo,
    faturamento,
    fiscalStats,
    recentOrcamentos,
    remessasAtrasadas,
    ticketMedio,
    topClientes,
    valorEstoque,
    vencimentosHoje,
    scopes,
  } = useDashboardData();

  // React Query handles fetching/caching automatically — no useEffect needed.
  const greeting = getGreeting();

  const { kpiCards, operationalCards, saldoProjetado } = useDashboardKpis({
    metas,
    stats,
    estoqueBaixoCount: estoqueBaixo.length,
    backlogOVsCount,
    comprasAtrasadasCount,
    remessasAtrasadasCount: remessasAtrasadas,
    dailyReceber,
    dailyPagar,
    onOpenReceber: () => navigate(buildDrilldownUrl({ kind: "financeiro:receber-aberto" })),
    onOpenPagar: () => navigate(buildDrilldownUrl({ kind: "financeiro:pagar-aberto" })),
    onOpenSaldo: () => navigate(buildDrilldownUrl({ kind: "financeiro:saldo" })),
    onOpenEstoque: () => navigate(buildDrilldownUrl({ kind: "estoque:critico" })),
    onOpenBacklog: () => navigate(buildDrilldownUrl({ kind: "pedidos:aguardando-faturamento" })),
    onOpenCompras: () => navigate(buildDrilldownUrl({ kind: "compras:atrasadas" })),
    onOpenRemessas: () => navigate(buildDrilldownUrl({ kind: "logistica:remessas-atrasadas" })),
    onReceberDetail: () => setMetricDrawer("receber"),
    onPagarDetail: () => setMetricDrawer("pagar"),
    onSaldoDetail: () => setMetricDrawer("saldo"),
    onEstoqueDetail: () => setMetricDrawer("estoque"),
  });

  const detailData = useDashboardDrawerData({
    dailyReceber,
    dailyPagar,
    topClientes,
    estoqueBaixo,
  });

  if (loading) {
    return <DashboardSkeleton />;
  }

  const openMetric = metricDrawer ? detailData[metricDrawer] : null;

  // ---------------------------------------------------------------------------
  // Renderers map — a função de cada widget é renderizada de acordo com a
  // ordem persistida em `prefs.order`. Isso faz com que reorder no menu
  // "Personalizar" reflita na tela de fato.
  //
  // Widgets que historicamente convivem em uma mesma linha lado-a-lado
  // (financeiro+ações, vendas+pendências, comercial+estoque, logística+fiscal)
  // são "agrupados" via metadado `pair` no registry — quando dois widgets
  // adjacentes pertencem ao mesmo grupo, são renderizados na mesma grid de 2
  // colunas. Caso o usuário reorganize a ordem e quebre o par, cada um vira
  // full-width (comportamento gracioso). Para v1 isso é suficiente.
  // ---------------------------------------------------------------------------

  const RENDERERS: Record<WidgetId, () => ReactNode> = {
    kpis: () => (
      <div
        aria-live="polite"
        aria-atomic="false"
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {kpiCards.map((c) => (
          <div key={c.id} className="min-w-[78%] snap-start sm:min-w-0">
            <SummaryCard {...c} density="compact" />
          </div>
        ))}
      </div>
    ),
    operational: () => (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Exceções operacionais
          </p>
          <ScopeBadge scope={{ kind: "snapshot" }} />
        </div>
        <div
          aria-live="polite"
          aria-atomic="false"
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {operationalCards.map((c) => (
            <div key={c.id} className="min-w-[60%] snap-start sm:min-w-0">
              <SummaryCard {...c} density="compact" />
            </div>
          ))}
        </div>
      </div>
    ),
    alertas: () => (
      <AlertStrip
        titulosVencidos={stats.contasVencidas}
        notasPendentes={fiscalStats.pendentes}
        saldoProjetado={saldoProjetado}
        comprasAtrasadas={comprasAtrasadasCount}
        remessasAtrasadas={remessasAtrasadas}
      />
    ),
    financeiro: () => (
      <BlockErrorBoundary label="Financeiro">
        <div data-help-id="dashboard.financeiro">
        <MobileCollapsibleBlock
          title="Financeiro"
          icon={DollarSign}
          iconColor="text-primary"
          summary={`Saldo: ${saldoProjetado >= 0 ? '+' : ''}${(saldoProjetado / 1000).toFixed(0)}k`}
          defaultOpen
          persistKey="financeiro"
        >
          <FinanceiroBlock
            totalReceber={stats.totalReceber}
            totalPagar={stats.totalPagar}
            contasVencidas={stats.contasVencidas}
            saldoProjetado={saldoProjetado}
            recebimentosHoje={vencimentosHoje.receber}
            pagamentosHoje={vencimentosHoje.pagar}
          />
        </MobileCollapsibleBlock>
        </div>
      </BlockErrorBoundary>
    ),
    acoes_rapidas: () => (
      <div className="hidden md:block">
        <BlockErrorBoundary label="Ações Rápidas">
          <QuickActions />
        </BlockErrorBoundary>
      </div>
    ),
    vendas_chart: () => (
      <LazyInViewWidget fallback={<Skeleton className="min-h-[240px] w-full rounded-xl" />}>
        <DashboardCard>
          <BlockErrorBoundary label="Gráfico de Vendas">
            <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
              <div className="h-[200px]">
                <VendasChart
                  onBarClick={(start, end) =>
                    navigate(`/relatorios?tipo=vendas&di=${start}&df=${end}`)
                  }
                />
              </div>
            </Suspense>
          </BlockErrorBoundary>
        </DashboardCard>
      </LazyInViewWidget>
    ),
    pendencias: () => (
      <DashboardCard>
        <BlockErrorBoundary label="Pendências">
          <PendenciasList />
        </BlockErrorBoundary>
      </DashboardCard>
    ),
    comercial: () => (
      <BlockErrorBoundary label="Comercial">
        <div data-help-id="dashboard.comercial">
        <MobileCollapsibleBlock
          title="Comercial"
          icon={ShoppingBag}
          iconColor="text-secondary"
          summary={`${stats.orcamentos} orç · ${backlogOVsCount} ped`}
          persistKey="comercial"
        >
          <ComercialBlock
            cotacoesAbertas={stats.orcamentos}
            pedidosPendentes={backlogOVsCount}
            ticketMedio={ticketMedio}
            recentOrcamentos={recentOrcamentos}
            loading={loading}
            faturamentoMesAtual={faturamento.mesAtual}
            faturamentoMesAnterior={faturamento.mesAnterior}
          />
        </MobileCollapsibleBlock>
        </div>
      </BlockErrorBoundary>
    ),
    estoque: () => (
      <BlockErrorBoundary label="Estoque">
        <MobileCollapsibleBlock
          title="Estoque"
          icon={Package}
          iconColor="text-info"
          summary={
            estoqueBaixo.length > 0
              ? `${estoqueBaixo.length} crítico${estoqueBaixo.length > 1 ? 's' : ''}`
              : `${stats.produtos} ativos`
          }
          defaultOpen={estoqueBaixo.length > 0}
          persistKey="estoque"
        >
          <EstoqueBlock
            itensBaixoMinimo={estoqueBaixo}
            valorTotalEstoque={valorEstoque}
            totalProdutosAtivos={stats.produtos}
          />
        </MobileCollapsibleBlock>
      </BlockErrorBoundary>
    ),
    logistica: () => (
      <LazyInViewWidget fallback={<Skeleton className="min-h-[220px] w-full rounded-xl" />}>
        <BlockErrorBoundary label="Logística">
          <div data-help-id="dashboard.logistica">
          <MobileCollapsibleBlock
            title="Logística"
            icon={Truck}
            iconColor="text-info"
            summary={
              remessasAtrasadas > 0
                ? `${remessasAtrasadas} atrasada${remessasAtrasadas > 1 ? 's' : ''}`
                : `${comprasAguardando.length} aguardando`
            }
            persistKey="logistica"
          >
            <LogisticaBlock
              comprasAguardando={comprasAguardando}
              totalRemessasAtrasadas={remessasAtrasadas}
            />
          </MobileCollapsibleBlock>
          </div>
        </BlockErrorBoundary>
      </LazyInViewWidget>
    ),
    fiscal: () => (
      <LazyInViewWidget fallback={<Skeleton className="min-h-[220px] w-full rounded-xl" />}>
        <BlockErrorBoundary label="Fiscal">
          <div data-help-id="dashboard.fiscal">
          <MobileCollapsibleBlock
            title="Fiscal"
            icon={FileTextIcon}
            iconColor="text-secondary"
            summary={
              fiscalStats.pendentes > 0
                ? `${fiscalStats.pendentes} pendente${fiscalStats.pendentes > 1 ? 's' : ''}`
                : `${fiscalStats.emitidas} emitidas`
            }
            persistKey="fiscal"
          >
            <FiscalBlock stats={fiscalStats} scope={scopes?.fiscal} />
          </MobileCollapsibleBlock>
          </div>
        </BlockErrorBoundary>
      </LazyInViewWidget>
    ),
  };

  // Pares "naturais" para layout 2 colunas. Ordem dentro do par é livre.
  const PAIR_GROUPS: Record<string, WidgetId[]> = {
    finRow: ["financeiro", "acoes_rapidas"],
    midRow: ["pendencias", "fiscal"],
    comRow: ["comercial", "estoque"],
    logRow: ["logistica", "vendas_chart"],
  };
  const widgetToGroup = new Map<WidgetId, string>();
  for (const [gid, members] of Object.entries(PAIR_GROUPS)) {
    members.forEach((m) => widgetToGroup.set(m, gid));
  }

  // Specials que sempre ocupam linha inteira independente de vizinhos.
  const FULL_WIDTH = new Set<WidgetId>(["kpis", "operational", "alertas"]);

  // Constrói as linhas conforme prefs.order respeitando os pares.
  const visibleOrder = prefs.order.filter((id) => isVisible(id));
  const rows: Array<{ key: string; items: WidgetId[]; pair: boolean }> = [];
  let i = 0;
  while (i < visibleOrder.length) {
    const id = visibleOrder[i];
    if (FULL_WIDTH.has(id)) {
      rows.push({ key: `full-${id}`, items: [id], pair: false });
      i += 1;
      continue;
    }
    const group = widgetToGroup.get(id);
    const next = visibleOrder[i + 1];
    if (group && next && widgetToGroup.get(next) === group) {
      rows.push({ key: `pair-${id}-${next}`, items: [id, next], pair: true });
      i += 2;
    } else {
      rows.push({ key: `solo-${id}`, items: [id], pair: false });
      i += 1;
    }
  }

  return (
    <>
      {isMobile ? (
        <MobileDashboardHeader lastUpdated={loadedAt} onRefresh={loadData} fetching={fetching} />
      ) : (
        <DashboardHeader
          lastUpdated={loadedAt}
          onRefresh={loadData}
          fetching={fetching}
          rightSlot={
            <DashboardCustomizeMenu
              prefs={prefs}
              onToggle={toggleVisibility}
              onMove={moveWidget}
              onReset={resetLayout}
            />
          }
        />
      )}

      {(() => {
        const temVencimentos = vencimentosHoje.receber > 0 || vencimentosHoje.pagar > 0;
        const temBacklog = backlogOVsCount > 0;
        const temAlgo = temVencimentos || temBacklog;
        return (
          <div className="mb-3 rounded-lg border border-border/60 bg-muted/10 px-4 py-2.5 md:mb-4 md:py-3">
            <p className="text-sm font-medium text-foreground">
              {greeting}, {profile?.nome?.split(" ")[0] || "time"}.
            </p>
            {temAlgo && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {temVencimentos && (
                  <button
                    type="button"
                    onClick={() => navigate(`/financeiro?venc=hoje`)}
                    className="hover:text-primary hover:underline active:text-primary transition-colors text-left"
                  >
                    {formatVencimentosHoje(vencimentosHoje.receber, vencimentosHoje.pagar)}
                  </button>
                )}
                {temBacklog && (
                  <>
                    {temVencimentos && " · "}
                    <button
                      type="button"
                      onClick={() => navigate(buildDrilldownUrl({ kind: "pedidos:aguardando-faturamento" }))}
                      className="hover:text-primary hover:underline active:text-primary transition-colors text-left"
                    >
                      {backlogOVsCount} pedido{backlogOVsCount > 1 ? "s" : ""} aguardando faturamento.
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        );
      })()}

      <div className="space-y-4">
        {rows.map((row) => {
          if (row.pair) {
            const isFinRow = row.items[0] === 'financeiro' || row.items[1] === 'financeiro';
            return (
              <div
                key={row.key}
                className={
                  'grid grid-cols-1 gap-4 lg:items-start ' +
                  (isFinRow ? 'lg:grid-cols-[2fr_1fr]' : 'lg:grid-cols-2')
                }
              >
                {row.items.map((id) => (
                  <Fragment key={id}>{RENDERERS[id]()}</Fragment>
                ))}
              </div>
            );
          }
          return <Fragment key={row.key}>{RENDERERS[row.items[0]]()}</Fragment>;
        })}
      </div>

      <KpiDetailDrawer
        metric={metricDrawer}
        payload={openMetric}
        onClose={() => setMetricDrawer(null)}
      />

      <BackToTopButton />
    </>
  );
};

// O `GlobalPeriodProvider` já é montado em `AppLayout` — não duplicar aqui.
const Dashboard = DashboardContent;

export default Dashboard;
