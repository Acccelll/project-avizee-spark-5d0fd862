import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ModulePage } from '@/components/ModulePage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { PreviewModal } from '@/components/ui/PreviewModal';
import type { FiltrosRelatorioState } from '@/pages/relatorios/components/Filtros/FiltrosRelatorio';
import { DreTable } from '@/pages/relatorios/components/Tabelas/DreTable';
import { ReportHeader } from '@/pages/relatorios/components/ReportHeader';
import { ExportMenu } from '@/pages/relatorios/components/ExportMenu';
import { PreviewDocument } from '@/pages/relatorios/components/PreviewDocument';
import { RelatorioCatalogo } from '@/pages/relatorios/components/RelatorioCatalogo';
import { RelatorioKpiGrid } from '@/pages/relatorios/components/RelatorioKpiGrid';
import { RelatorioFiltrosBar } from '@/pages/relatorios/components/RelatorioFiltrosBar';
import { RelatorioMobileToolbar } from '@/pages/relatorios/components/RelatorioMobileToolbar';
import { RelatorioBody } from '@/pages/relatorios/components/RelatorioBody';
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
import { BookmarkPlus, BookOpen, Hash, Trash2, RefreshCcw } from 'lucide-react';
import { filtrarPorStatus, sortarRows } from '@/utils/relatorios';
import { reportConfigs, reportCategoryMeta, reportRuntimeSemantics } from '@/config/relatoriosConfig';
import { formatCurrency, formatNumber, formatDate } from '@/lib/format';
import { buildKpiCards, deriveMobileTableProps } from '@/services/relatorios/lib/derivations';
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

  const { data: resultado, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useRelatorio(tipo, filtros);

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

  // 9.5 — A-03: derivações puras movidas para `services/relatorios/lib/derivations`.
  const kpiData = useMemo(() => buildKpiCards(resultado, tipo as TipoRelatorio | ''), [resultado, tipo]);
  const kpiCards = useMemo(
    () => kpiData.map((k) => ({ title: k.title, value: k.value, icon: Hash, variation: k.variation, variant: k.variant })),
    [kpiData],
  );

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

  // 9.5 — A-03: deriva mobile props a partir de helper compartilhado.
  const mobileTableProps = useMemo(
    () => deriveMobileTableProps(visibleColumns, semantics?.statusField),
    [visibleColumns, semantics?.statusField],
  );

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
                isRefreshing={isFetching && !isLoading}
                dreRegime={isDreReport ? filtrosState.dreModo : undefined}
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
              <RelatorioFiltrosBar
                selectedMeta={selectedMeta}
                reportMeta={reportMeta}
                semantics={semantics}
                isDreReport={isDreReport}
                dataInicio={dataInicio}
                dataFim={dataFim}
                setDataInicio={setDataInicio}
                setDataFim={setDataFim}
                filtrosState={filtrosState}
                setFiltrosState={setFiltrosState}
                clientes={clientes}
                fornecedores={fornecedores}
                grupos={grupos}
                limits={limits}
                columns={columns}
                visibleColumnsCount={columns.length - hiddenColumns.length}
                hiddenColumns={hiddenColumns}
                setHiddenColumns={setHiddenColumns}
                compactDensity={compactDensity}
                setCompactDensity={setCompactDensity}
                onPreview={() => setPreviewOpen(true)}
                hasExportableData={hasExportableData}
                exportMenu={
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
              />

              <RelatorioMobileToolbar
                filtersSheetOpen={filtersSheetOpen}
                setFiltersSheetOpen={setFiltersSheetOpen}
                activeFiltersCount={activeFiltersCount}
                selectedMeta={selectedMeta}
                reportMeta={reportMeta}
                semantics={semantics}
                isDreReport={isDreReport}
                dataInicio={dataInicio}
                dataFim={dataFim}
                setDataInicio={setDataInicio}
                setDataFim={setDataFim}
                filtrosState={filtrosState}
                setFiltrosState={setFiltrosState}
                clientes={clientes}
                fornecedores={fornecedores}
                grupos={grupos}
                limits={limits}
                onClearAllFilters={handleClearAllFilters}
                onRefetch={() => refetch()}
                isLoading={isLoading}
                exportMenu={
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
                }
              />

              <RelatorioBody
                isMobile={isMobile}
                isLoading={isLoading}
                isError={isError}
                isDreReport={!!isDreReport}
                isQtyReport={!!isQtyReport}
                resultado={resultado}
                selectedMeta={selectedMeta}
                semantics={semantics}
                sortedRows={sortedRows}
                rows={rows}
                hasLocalFiltersApplied={hasLocalFiltersApplied}
                hasExportableData={hasExportableData}
                showEmpty={showEmpty}
                visibleColumns={visibleColumns}
                visibleColumnsWithActions={visibleColumnsWithActions}
                mobileTableProps={mobileTableProps}
                handleRowClick={handleRowClick}
                tipo={tipo as string}
                footerCols={footerCols}
                activeFilterChips={activeFilterChips}
                handleClearAllFilters={handleClearAllFilters}
                handleChartDrillDown={handleChartDrillDown}
                tableExpanded={tableExpanded}
                setTableExpanded={setTableExpanded}
                isExporting={isExporting}
                PDF_ROW_LIMIT={PDF_ROW_LIMIT}
                handleExportPdf={handleExportPdf}
                handleExportXlsx={handleExportXlsx}
                handleExportCsv={handleExportCsv}
              />
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
