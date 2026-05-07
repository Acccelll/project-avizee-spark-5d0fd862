import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ModulePage } from '@/components/ModulePage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DataTable } from '@/components/DataTable';
import { PreviewModal } from '@/components/ui/PreviewModal';
import { PeriodoFilter } from '@/pages/relatorios/components/Filtros/PeriodoFilter';
import { FiltrosRelatorio, type FiltrosRelatorioState } from '@/pages/relatorios/components/Filtros/FiltrosRelatorio';
import { RelatorioChart } from '@/pages/relatorios/components/Graficos/RelatorioChart';
import { DreTable } from '@/pages/relatorios/components/Tabelas/DreTable';
import { ReportHeader } from '@/pages/relatorios/components/ReportHeader';
import { ExportMenu } from '@/pages/relatorios/components/ExportMenu';
import { ActiveFiltersBar } from '@/pages/relatorios/components/ActiveFiltersBar';
import { ReportResultFooter } from '@/pages/relatorios/components/ReportResultFooter';
import { PreviewDocument } from '@/pages/relatorios/components/PreviewDocument';
import { RelatorioCatalogo } from '@/pages/relatorios/components/RelatorioCatalogo';
import { RelatorioKpiGrid } from '@/pages/relatorios/components/RelatorioKpiGrid';
import { RelatorioFiltrosBar } from '@/pages/relatorios/components/RelatorioFiltrosBar';
import { RelatorioMobileToolbar } from '@/pages/relatorios/components/RelatorioMobileToolbar';
import { useRelatorio } from '@/pages/relatorios/hooks/useRelatorio';
import {
  useRelatoriosFiltrosData,
  useSelectedRefLabels,
} from '@/pages/relatorios/hooks/useRelatoriosFiltrosData';
import { useRelatoriosFavoritos } from '@/hooks/useRelatoriosFavoritos';
import { useRelatorioUrlState } from '@/pages/relatorios/hooks/useRelatorioUrlState';
import { useDataTablePrefs } from '@/hooks/useDataTablePrefs';
import { useRelatorioDensity } from '@/pages/relatorios/hooks/useRelatorioDensity';
import { useRelatorioExport } from '@/pages/relatorios/hooks/useRelatorioExport';
import { useActiveFilterChips } from '@/pages/relatorios/hooks/useActiveFilterChips';
import { useRelatorioDrillDown } from '@/pages/relatorios/hooks/useRelatorioDrillDown';
import { RowActionsMenu } from '@/pages/relatorios/components/RowActionsMenu';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { BookmarkPlus, BookOpen, Hash, Trash2, RefreshCcw, SearchX, ChevronDown } from 'lucide-react';
import { filtrarPorStatus, sortarRows } from '@/utils/relatorios';
import { reportConfigs, reportCategoryMeta, reportRuntimeSemantics } from '@/config/relatoriosConfig';
import { formatCurrency, formatNumber, formatDate } from '@/lib/format';
import { type TipoRelatorio } from '@/services/relatorios.service';
import { formatReportCell } from '@/services/relatorios/lib/formatCell';
import type { DreRow } from '@/types/relatorios';
import { badgeVariantFromKind } from '@/lib/relatoriosBadges';
import { toast } from 'sonner';

function buildDreDateRange(state: FiltrosRelatorioState, dataInicio: string, dataFim: string) {
  if (state.dreCompetencia === 'personalizado') return { dataInicio, dataFim };
  const now = new Date();
  if (state.dreCompetencia === 'mes') {
    const [y, m] = state.dreMes.split('-').map(Number);
    return { dataInicio: `${y}-${String(m).padStart(2, '0')}-01`, dataFim: new Date(y, m, 0).toISOString().slice(0, 10) };
  }
  if (state.dreCompetencia === 'trimestre') {
    const q = Math.floor(now.getMonth() / 3);
    return { dataInicio: new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10), dataFim: new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10) };
  }
  return { dataInicio: `${now.getFullYear()}-01-01`, dataFim: `${now.getFullYear()}-12-31` };
}

export default function Relatorios() {
  const {
    tipo,
    dataInicio,
    dataFim,
    filtrosState,
    searchParams,
    setSearchParams,
    setDataInicio,
    setDataFim,
    setFiltrosState,
    updateParams,
  } = useRelatorioUrlState();

  // 8.6.3 — `hiddenColumns` persistido por `tipo` via useDataTablePrefs (cross-device).
  const moduleKey = tipo ? `relatorios-${tipo}` : undefined;
  const { hiddenKeys, setHiddenKeys } = useDataTablePrefs(moduleKey, []);
  const hiddenColumns = hiddenKeys;
  const setHiddenColumns = (next: string[] | ((prev: string[]) => string[])) => {
    const value = typeof next === 'function' ? (next as (p: string[]) => string[])(hiddenKeys) : next;
    void setHiddenKeys(value);
  };
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveNameOpen, setSaveNameOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);

  const isMobile = useIsMobile();

  const { compactDensity, setCompactDensity } = useRelatorioDensity();

  const { favoritos, salvar: salvarFavorito, remover: removerFavorito } = useRelatoriosFavoritos();

  const { grupos, empresaConfig, limits } = useRelatoriosFiltrosData();
  // Resolve labels apenas para os ids selecionados (sem pré-carregar listas inteiras).
  const { clientes, fornecedores } = useSelectedRefLabels(
    filtrosState.clienteIds,
    filtrosState.fornecedorIds,
  );

  const { getRowActions, navigateAction, hasActions } = useRelatorioDrillDown(tipo as TipoRelatorio | undefined);

  const filtros = useMemo(() => {
    if (tipo === 'dre') {
      return { ...buildDreDateRange(filtrosState, dataInicio, dataFim), dreModo: filtrosState.dreModo };
    }
    return {
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      clienteIds: filtrosState.clienteIds.length ? filtrosState.clienteIds : undefined,
      fornecedorIds: filtrosState.fornecedorIds.length ? filtrosState.fornecedorIds : undefined,
      grupoProdutoIds: filtrosState.grupoIds.length ? filtrosState.grupoIds : undefined,
      tiposFinanceiros: filtrosState.tipos.length ? filtrosState.tipos : undefined,
    };
  }, [tipo, dataInicio, dataFim, filtrosState]);

  const { data: resultado, isLoading, isError, refetch, dataUpdatedAt } = useRelatorio(tipo, filtros);

  const reportMeta = resultado?.meta;
  const isQtyReport = reportMeta?.valueNature === 'quantidade';
  const isDreReport = reportMeta?.kind === 'dre';
  const rows = useMemo(() => (resultado?.rows ?? []) as Record<string, unknown>[], [resultado?.rows]);

  const selectedMeta = tipo ? reportConfigs[tipo as TipoRelatorio] : undefined;
  const semantics = tipo ? reportRuntimeSemantics[tipo as TipoRelatorio] : undefined;
  const filteredRows = useMemo(
    () => filtrarPorStatus(rows, filtrosState.statusFiltro, { statusField: semantics?.statusField }),
    [rows, filtrosState.statusFiltro, semantics?.statusField],
  );
  const sortedRows = useMemo(
    () => sortarRows(filteredRows, filtrosState.agrupamento, { statusField: semantics?.statusField, valueSortField: semantics?.valueSortField, dateSortField: semantics?.dateSortField }),
    [filteredRows, filtrosState.agrupamento, semantics?.statusField, semantics?.valueSortField, semantics?.dateSortField],
  );

  // 8.5.5 — Em mobile, abre a tabela automaticamente para resultados pequenos (≤15 linhas).
  // Mantém o estado controlado pelo usuário a partir do primeiro toggle manual.
  useEffect(() => {
    if (!isMobile) return;
    if (isLoading || isError) return;
    if (sortedRows.length > 0 && sortedRows.length <= 15) {
      setTableExpanded(true);
    }
  }, [isMobile, isLoading, isError, sortedRows.length, tipo]);

  const kpiCards = useMemo(() => {
    if (!resultado || !tipo) return [];
    const cfg = reportConfigs[tipo as TipoRelatorio];
    if (!cfg) return [];
    const kpis = resultado.kpis || {};
    return cfg.kpis.map((def) => {
      const val = kpis[def.key] ?? resultado.totals?.[def.key];
      const formatted = val == null ? '-' : def.format === 'currency' ? formatCurrency(val) : def.format === 'percent' ? `${val.toFixed(1)}%` : formatNumber(val);
      return { title: def.label, value: formatted, icon: Hash, variation: def.variation || '', variant: def.variant };
    });
  }, [resultado, tipo]);

  const columns = useMemo(() => {
    if (!sortedRows.length || !tipo) return [];
    const cfg = reportConfigs[tipo as TipoRelatorio];
    const rowKeys = Object.keys(sortedRows[0]);
    const colDefs = (cfg?.columns ?? rowKeys.map((k) => ({ key: k, label: k }))).filter((c) => rowKeys.includes(c.key));
    return colDefs.map((colDef) => ({
      key: colDef.key,
      label: colDef.label,
      render: (item: Record<string, unknown>): React.ReactNode => {
        const raw = item[colDef.key];
        const fmt = (colDef as { format?: string }).format;
        const isBadgeKey = fmt === 'badge' || ['criticidade', 'faixa', 'classe'].includes(colDef.key)
          || colDef.key.toLowerCase().includes('status') || colDef.key.toLowerCase().includes('situacao');
        if (isBadgeKey && typeof raw === 'string' && raw !== '-') {
          // Prefer structured *Kind field exposed by the service layer.
          const kindKey =
            colDef.key === 'criticidade' ? 'criticidadeKind' :
            colDef.key === 'faixa' ? 'faixaKind' :
            colDef.key === 'classe' ? 'classeKind' :
            colDef.key === 'tipo' ? 'tipoKind' :
            'statusKind';
          const kind = item[kindKey] as string | undefined;
          // Canonical path: every loader populates `*Kind` (statusMap.ts).
          // If a future loader forgets it, the badge falls back to neutral
          // `secondary` and we warn loudly in dev so the gap is fixed at the
          // source instead of being papered over by a text heuristic.
          if (!kind && import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn(`[Relatorios] Row missing "${kindKey}" for column "${colDef.key}" in report "${tipo}". Loader must populate the *Kind field via statusMap.`);
          }
          const variant = kind
            ? badgeVariantFromKind(kind as Parameters<typeof badgeVariantFromKind>[0])
            : 'secondary';
          return <Badge variant={variant}>{raw}</Badge>;
        }
        return formatReportCell(raw, colDef.key, {
          format: fmt,
          isQuantityReport: isQtyReport,
          mode: 'display',
        }) as React.ReactNode;
      },
    }));
  }, [sortedRows, isQtyReport, tipo]);

  const visibleColumns = useMemo(() => columns.filter((c) => !hiddenColumns.includes(c.key)), [columns, hiddenColumns]);

  // Props mobile do DataTable derivadas de `semantics`/columns:
  // - statusKey   → coluna de status/criticidade/faixa/classe (badge)
  // - identifierKey → 1ª coluna textual não-status (cliente/fornecedor/produto)
  const mobileTableProps = useMemo(() => {
    if (!visibleColumns.length) return {};
    const statusCandidates = ['status', 'criticidade', 'faixa', 'classe', 'tipo'];
    const statusKey = semantics?.statusField && visibleColumns.some((c) => c.key === semantics.statusField)
      ? semantics.statusField
      : visibleColumns.find((c) => statusCandidates.includes(c.key))?.key;
    const identifierKey = visibleColumns.find(
      (c) => c.key !== statusKey && !statusCandidates.includes(c.key) && !['valor', 'valorTotal', 'quantidade', 'pedidos', 'posicao'].includes(c.key),
    )?.key;
    return {
      mobileStatusKey: statusKey,
      mobileIdentifierKey: identifierKey,
    };
  }, [visibleColumns, semantics?.statusField]);

  // Coluna virtual de ações (drill-down). Só é anexada quando há pelo menos
  // uma ação navegável declarada para o relatório atual.
  const visibleColumnsWithActions = useMemo(() => {
    if (!hasActions) return visibleColumns;
    return [
      ...visibleColumns,
      {
        key: '__actions__',
        label: 'Ações',
        render: (item: Record<string, unknown>): React.ReactNode => (
          <RowActionsMenu actions={getRowActions(item)} onSelect={navigateAction} />
        ),
      },
    ];
  }, [visibleColumns, hasActions, getRowActions, navigateAction]);

  // onRowClick: dispara ação primária quando há exatamente uma disponível,
  // caso contrário não faz nada (usuário usa o menu para escolher).
  const handleRowClick = useMemo(() => {
    if (!hasActions) return undefined;
    return (row: Record<string, unknown>) => {
      const actions = getRowActions(row);
      if (actions.length === 1) navigateAction(actions[0]);
    };
  }, [hasActions, getRowActions, navigateAction]);

  const handleSelectTipo = (next: TipoRelatorio) => {
    // 8.6.3 — Não limpar `hiddenColumns`: cada `tipo` tem suas próprias preferências persistidas.
    setSearchParams({ tipo: next });
  };

  const {
    isExporting,
    exportColumnDefs,
    handleExportCsv,
    handleExportPdf,
    handleExportXlsx,
    PDF_ROW_LIMIT,
    isLikelyTruncated,
  } = useRelatorioExport({
    tipo,
    resultado,
    sortedRows,
    visibleColumns,
    empresaConfig,
    dataInicio,
    dataFim,
  });

  const handleSalvarFavorito = async () => {
    const name = saveName.trim();
    if (!name) return;
    const saved = await salvarFavorito(name, searchParams);
    setSaveName('');
    setSaveNameOpen(false);
    // Failure toasts (duplicate / network) are emitted inside the hook so we
    // only surface success here.
    if (saved) toast.success(`Configuração "${name}" salva com sucesso!`);
  };

  const handleCarregarFavorito = (params: string) => {
    setSearchParams(new URLSearchParams(params));
    toast.success('Favorito aplicado aos filtros atuais.');
  };

  const handleChartDrillDown = (point: { name: string; value: number }) => {
    if (!tipo) return;
    const drillMap: Partial<Record<TipoRelatorio, TipoRelatorio>> = {
      vendas: 'vendas_cliente',
      faturamento: 'vendas_cliente',
      compras: 'compras_fornecedor',
      curva_abc: 'margem_produtos',
    };
    const target = drillMap[tipo as TipoRelatorio];
    if (target) {
      const next = new URLSearchParams({ tipo: target });
      if (dataInicio) next.set('di', dataInicio);
      if (dataFim) next.set('df', dataFim);
      setSearchParams(next);
    } else {
      const formattedValue = isQtyReport ? formatNumber(point.value) : formatCurrency(point.value);
      toast.info(`Detalhes: ${point.name} — ${formattedValue}`, { duration: 3000 });
    }
  };

  const periodoLabel = dataInicio || dataFim
    ? `${dataInicio ? formatDate(dataInicio) : '—'} a ${dataFim ? formatDate(dataFim) : '—'}`
    : new Date().toLocaleDateString('pt-BR');

  const categoryMeta = selectedMeta ? reportCategoryMeta[selectedMeta.category] : undefined;
  const showEmpty = !isLoading && !isError && sortedRows.length === 0;
  const hasExportableData = sortedRows.length > 0;
  const hasLocalFiltersApplied = rows.length !== sortedRows.length;

  const activeFilterChips = useActiveFilterChips({
    filtrosState,
    dataInicio,
    dataFim,
    clientes,
    fornecedores,
    grupos,
    selectedMeta,
    semantics,
    setFiltrosState,
    updateParams,
  });

  const handleClearAllFilters = () => {
    // Mantém o tipo de relatório, limpa o restante.
    setSearchParams({ tipo });
  };

  const footerCols = (selectedMeta?.columns ?? []).filter((c) => c.footerTotal);

  const activeFiltersCount = activeFilterChips.length;

  // ── Header secondary actions (Atualizar + Salvar/Carregar favoritos) ─────
  const headerActions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => refetch()}
        className="gap-1.5"
        disabled={isLoading}
        aria-label="Atualizar dados do relatório"
      >
        <RefreshCcw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        Atualizar
      </Button>
      <Popover open={saveNameOpen} onOpenChange={setSaveNameOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" aria-label="Salvar configuração de filtros">
            <BookmarkPlus className="h-3.5 w-3.5" />
            Salvar favorito
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Salvar configuração atual</p>
          <Input
            placeholder="Nome da configuração"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSalvarFavorito(); }}
            className="h-8 text-sm"
            autoFocus
          />
          <Button size="sm" className="w-full" onClick={handleSalvarFavorito} disabled={!saveName.trim()}>Salvar</Button>
        </PopoverContent>
      </Popover>
      {favoritos.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" aria-label="Carregar configuração favorita">
              <BookOpen className="h-3.5 w-3.5" />
              Aplicar favorito
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Favoritos salvos</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {favoritos.map((fav) => (
                <div key={fav.id} className="flex items-center justify-between rounded-md hover:bg-muted/50 px-2 py-1.5 gap-2">
                  <button className="flex-1 text-left text-sm truncate" onClick={() => handleCarregarFavorito(fav.params)}>{fav.nome}</button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" aria-label={`Remover favorito "${fav.nome}"`} onClick={() => { removerFavorito(fav.id); toast.success(`"${fav.nome}" removido.`); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );

  return (
    <>
      <ModulePage title="Relatórios" subtitle="Análises gerenciais, exportações e visão consolidada por módulo.">
        <div className="space-y-6">

          {/* ── Report selector ── */}
          {!tipo && <RelatorioCatalogo onSelect={handleSelectTipo} />}

          {/* ── Active report ── */}
          {!!tipo && selectedMeta && (
            <>
              <ReportHeader
                categoryLabel={categoryMeta?.title}
                categoryIcon={categoryMeta?.icon}
                title={selectedMeta.title}
                description={selectedMeta.objective}
                periodLabel={periodoLabel}
                periodAxisLabel={semantics?.periodAxisLabel}
                recordCount={sortedRows.length}
                updatedAt={dataUpdatedAt}
                onBack={() => setSearchParams({})}
                actions={headerActions}
              />

              {/* KPIs + banners de truncamento/divergência */}
              <RelatorioKpiGrid
                cards={kpiCards}
                compactDensity={compactDensity}
                hasLocalFiltersApplied={hasLocalFiltersApplied}
                rowsCount={rows.length}
                visibleCount={sortedRows.length}
                isLikelyTruncated={isLikelyTruncated}
              />

              {/* ── Filtros + ações (desktop expandido) ── */}
              <Card className="hidden md:block">
                <CardContent className="pt-5 pb-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      {selectedMeta.filters.showDateRange && (
                        <PeriodoFilter
                          dataInicio={dataInicio}
                          dataFim={dataFim}
                          axisLabel={selectedMeta.timeAxis?.label ?? reportMeta?.timeAxis?.label}
                          onChange={({ dataInicio: di, dataFim: df }) => { setDataInicio(di); setDataFim(df); }}
                        />
                      )}
                      <FiltrosRelatorio
                        filters={selectedMeta.filters}
                        state={filtrosState}
                        clientes={clientes}
                        fornecedores={fornecedores}
                        grupos={grupos}
                        semantics={{
                          statusMeaning: semantics?.statusMeaning,
                          typeMeaning: semantics?.typeMeaning,
                          highlightFilters: semantics?.highlightFilters,
                          listLimitHints: { clientes: limits.clientes, fornecedores: limits.fornecedores },
                        }}
                        hideAgrupamento={isDreReport}
                        onChange={(partial) => setFiltrosState(partial)}
                      />
                    </div>

                    {/* Ações: View / Colunas / Densidade / Exportar */}
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewOpen(true)}
                        disabled={!hasExportableData}
                        className="gap-1.5"
                        aria-label="Visualizar pré-impressão do relatório"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Visualizar
                      </Button>
                      {columns.length > 0 && !isDreReport && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5" aria-label="Personalizar colunas">
                              <Columns className="h-3.5 w-3.5" />
                              Colunas
                              {hiddenColumns.length > 0 && (
                                <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                                  {columns.length - hiddenColumns.length}/{columns.length}
                                </Badge>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 p-3">
                            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Personalizar colunas</p>
                            <div className="space-y-1.5 max-h-60 overflow-y-auto">
                              {columns.map((col) => (
                                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <Checkbox checked={!hiddenColumns.includes(col.key)} onCheckedChange={(checked) => setHiddenColumns((prev) => checked ? prev.filter((k) => k !== col.key) : [...prev, col.key])} />
                                  {col.label}
                                </label>
                              ))}
                            </div>
                            {hiddenColumns.length > 0 && <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => setHiddenColumns([])}>Restaurar padrão</Button>}
                          </PopoverContent>
                        </Popover>
                      )}
                      <Button
                        variant={compactDensity ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCompactDensity((v) => !v)}
                        className="gap-1.5"
                        aria-label="Alternar densidade compacta"
                        aria-pressed={compactDensity}
                      >
                        <Rows3 className="h-3.5 w-3.5" />
                        Compacto
                      </Button>
                      <ExportMenu
                        recordCount={sortedRows.length}
                        columnCount={visibleColumns.length}
                        disabled={!hasExportableData}
                        loading={isExporting}
                        pdfRowLimitHint={PDF_ROW_LIMIT}
                        onExportPdf={handleExportPdf}
                        onExportExcel={handleExportXlsx}
                        onExportCsv={handleExportCsv}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Mobile: barra única "Filtros (n) + Atualizar" ── */}
              <div className="flex items-center gap-2 md:hidden">
                <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex-1 min-h-11 gap-2 justify-start"
                      aria-label="Abrir filtros do relatório"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      Filtros
                      {activeFiltersCount > 0 && (
                        <Badge variant="secondary" className="ml-auto">
                          {activeFiltersCount}
                        </Badge>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-0">
                    <SheetHeader className="sticky top-0 bg-background border-b px-4 py-3 z-10">
                      <SheetTitle className="text-base">Filtros do relatório</SheetTitle>
                    </SheetHeader>
                    <div className="px-4 py-4 space-y-4">
                      {selectedMeta.filters.showDateRange && (
                        <PeriodoFilter
                          dataInicio={dataInicio}
                          dataFim={dataFim}
                          axisLabel={selectedMeta.timeAxis?.label ?? reportMeta?.timeAxis?.label}
                          onChange={({ dataInicio: di, dataFim: df }) => { setDataInicio(di); setDataFim(df); }}
                        />
                      )}
                      <FiltrosRelatorio
                        filters={selectedMeta.filters}
                        state={filtrosState}
                        clientes={clientes}
                        fornecedores={fornecedores}
                        grupos={grupos}
                        semantics={{
                          statusMeaning: semantics?.statusMeaning,
                          typeMeaning: semantics?.typeMeaning,
                          highlightFilters: semantics?.highlightFilters,
                          listLimitHints: { clientes: limits.clientes, fornecedores: limits.fornecedores },
                        }}
                        hideAgrupamento={isDreReport}
                        onChange={(partial) => setFiltrosState(partial)}
                      />
                    </div>
                    <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex gap-2">
                      {activeFiltersCount > 0 && (
                        <Button
                          variant="outline"
                          className="flex-1 min-h-11"
                          onClick={() => { handleClearAllFilters(); }}
                        >
                          Limpar
                        </Button>
                      )}
                      <Button
                        className="flex-1 min-h-11"
                        onClick={() => setFiltersSheetOpen(false)}
                      >
                        Aplicar
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
                <ExportMenu
                  recordCount={hasExportableData ? sortedRows.length : undefined}
                  columnCount={visibleColumns.length}
                  disabled={!hasExportableData}
                  loading={isExporting}
                  pdfRowLimitHint={PDF_ROW_LIMIT}
                  onExportPdf={handleExportPdf}
                  onExportExcel={handleExportXlsx}
                  onExportCsv={handleExportCsv}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="min-h-11 min-w-11"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  aria-label="Atualizar dados"
                >
                  <RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                </Button>
              </div>

              {/* ── Mobile: Chart primeiro (insight central) ── */}
              <div className="md:hidden">
                {isLoading ? (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-56 w-full" />
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  !isDreReport && (
                    <RelatorioChart
                      chartData={resultado?.chartData ?? []}
                      chartType={selectedMeta.chartType ?? 'bar'}
                      isQuantityReport={isQtyReport}
                      contextLabel={semantics?.periodAxisLabel ? `Resumo por ${semantics.periodAxisLabel}` : undefined}
                      importance={selectedMeta.chartType === 'pie' ? 'central' : 'complementar'}
                      onDataPointClick={handleChartDrillDown}
                    />
                  )
                )}
              </div>

              {/* ── Resultado: tabela + chart (mobile e desktop) ── */}
              <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                <Card>
                  <CardHeader className="pb-3 hidden md:block">
                    <CardTitle className="text-base">{resultado?.title || 'Relatório'}</CardTitle>
                    <CardDescription>{resultado?.subtitle}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Active filters bar */}
                    {(activeFilterChips.length > 0 || hasExportableData) && (
                      <ActiveFiltersBar
                        chips={activeFilterChips}
                        recordCount={hasExportableData ? sortedRows.length : undefined}
                        onClearAll={activeFilterChips.length > 0 ? handleClearAllFilters : undefined}
                      />
                    )}

                    {isLoading && (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    )}
                    {isError && !isLoading && (
                      <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                        Não foi possível carregar os dados desse relatório. Revise filtros e tente novamente.
                      </div>
                    )}
                    {!isLoading && !isError && isDreReport && <DreTable rows={sortedRows as unknown as DreRow[]} />}
                    {!isLoading && !isError && !isDreReport && (
                      <>
                        {hasLocalFiltersApplied && (
                          <div className="border-b bg-warning/5 px-4 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Escopo divergente:</span>{' '}
                            tabela mostra {sortedRows.length} de {rows.length} registros.
                            KPIs refletem o universo total do banco; totais abaixo refletem apenas registros visíveis.
                          </div>
                        )}
                        {/* Mobile: Collapsible — tabela colapsada por padrão */}
                        {isMobile ? (
                          <Collapsible open={tableExpanded} onOpenChange={setTableExpanded}>
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                className="w-full flex items-center justify-between px-4 py-3 border-b text-sm font-medium hover:bg-muted/50 active:bg-muted min-h-12"
                                aria-label={tableExpanded ? 'Ocultar registros' : 'Ver registros'}
                              >
                                <span>
                                  {tableExpanded ? 'Ocultar' : 'Ver'} registros
                                  <span className="ml-1 text-muted-foreground">({sortedRows.length})</span>
                                </span>
                                <ChevronDown
                                  className={cn(
                                    'h-4 w-4 transition-transform text-muted-foreground',
                                    tableExpanded && 'rotate-180',
                                  )}
                                />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <DataTable
                                columns={visibleColumnsWithActions}
                                data={sortedRows}
                                loading={isLoading}
                                moduleKey={`relatorios-${tipo}`}
                                onRowClick={handleRowClick}
                                emptyTitle={`Nenhum registro em ${selectedMeta.title}`}
                                emptyDescription="Ajuste o período e os filtros para encontrar registros relevantes."
                                {...mobileTableProps}
                              />
                              <ReportResultFooter rows={sortedRows} cols={footerCols.map((c) => ({ ...c, emphasize: c.format === 'currency' }))} />
                            </CollapsibleContent>
                          </Collapsible>
                        ) : (
                          <>
                            <DataTable
                              columns={visibleColumnsWithActions}
                              data={sortedRows}
                              loading={isLoading}
                              moduleKey={`relatorios-${tipo}`}
                              onRowClick={handleRowClick}
                              emptyTitle={`Nenhum registro em ${selectedMeta.title}`}
                              emptyDescription="Ajuste o período e os filtros para encontrar registros relevantes."
                              {...mobileTableProps}
                            />
                            <ReportResultFooter rows={sortedRows} cols={footerCols.map((c) => ({ ...c, emphasize: c.format === 'currency' }))} />
                          </>
                        )}
                      </>
                    )}
                    {showEmpty && (
                      <EmptyState
                        variant="noResults"
                        icon={SearchX}
                        title="Nenhum dado para os filtros atuais"
                        description="Ajuste o período ou remova filtros para encontrar registros. As exportações refletirão o mesmo resultado vazio."
                        action={
                          activeFilterChips.length > 0 ? (
                            <Button variant="outline" onClick={handleClearAllFilters} className="gap-1.5 min-h-11 sm:min-h-9 sm:h-9 sm:text-sm">
                              Limpar filtros
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Chart desktop (mobile já renderizado acima) */}
                <div className="hidden md:block">
                  <RelatorioChart
                    chartData={resultado?.chartData ?? []}
                    chartType={selectedMeta.chartType ?? 'bar'}
                    isQuantityReport={isQtyReport}
                    contextLabel={semantics?.periodAxisLabel ? `Resumo por ${semantics.periodAxisLabel}` : undefined}
                    importance={selectedMeta.chartType === 'pie' ? 'central' : 'complementar'}
                    onDataPointClick={handleChartDrillDown}
                  />
                </div>
              </div>

              {/* ── Mobile: sticky footer com Exportar (CTA principal) ── */}
              <div className="md:hidden sticky bottom-0 -mx-4 px-4 py-3 bg-card border-t shadow-[0_-4px_8px_-4px_rgba(0,0,0,0.08)] z-20">
                <ExportMenu
                  recordCount={sortedRows.length}
                  columnCount={visibleColumns.length}
                  disabled={!hasExportableData}
                  loading={isExporting}
                  pdfRowLimitHint={PDF_ROW_LIMIT}
                  onExportPdf={handleExportPdf}
                  onExportExcel={handleExportXlsx}
                  onExportCsv={handleExportCsv}
                  fullWidth
                />
              </div>
            </>
          )}
        </div>
      </ModulePage>

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`${resultado?.title || 'Relatório'} — Pré-visualização`}
        primaryAction={
          <ExportMenu
            recordCount={sortedRows.length}
            columnCount={visibleColumns.length}
            disabled={!hasExportableData}
            loading={isExporting}
            pdfRowLimitHint={PDF_ROW_LIMIT}
            onExportPdf={handleExportPdf}
            onExportExcel={handleExportXlsx}
            onExportCsv={handleExportCsv}
          />
        }
      >
        <PreviewDocument
          empresa={empresaConfig}
          reportTitle={resultado?.title || 'Relatório'}
          reportSubtitle={resultado?.subtitle}
          periodLabel={periodoLabel}
          kpis={kpiCards.map((k) => ({ title: k.title, value: k.value }))}
          columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
          rows={sortedRows}
          isQuantityReport={isQtyReport}
          footerCols={footerCols}
          customBody={isDreReport ? <DreTable rows={sortedRows as unknown as DreRow[]} /> : undefined}
        />
      </PreviewModal>
    </>
  );
}
