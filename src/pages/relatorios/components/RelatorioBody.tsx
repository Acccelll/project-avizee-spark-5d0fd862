import type React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable } from '@/components/DataTable';
import { ChevronDown, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RelatorioChart } from '@/pages/relatorios/components/Graficos/RelatorioChart';
import { ActiveFiltersBar } from '@/pages/relatorios/components/ActiveFiltersBar';
import { ReportResultFooter } from '@/pages/relatorios/components/ReportResultFooter';
import { ExportMenu } from '@/pages/relatorios/components/ExportMenu';
import { DreTable } from '@/pages/relatorios/components/Tabelas/DreTable';
import type { DreRow } from '@/types/relatorios';
import type { ActiveFilterChip } from '@/pages/relatorios/components/ActiveFiltersBar';

interface ColumnDef {
  key: string;
  label: string;
  format?: string;
  footerTotal?: boolean;
}

interface RelatorioBodyProps {
  isMobile: boolean;
  isLoading: boolean;
  isError: boolean;
  isDreReport: boolean;
  isQtyReport: boolean;
  resultado: { title?: string; subtitle?: string; chartData?: Array<{ name: string; value: number }> } | undefined;
  selectedMeta: { title: string; chartType?: 'bar' | 'pie' | 'line' };
  semantics: { periodAxisLabel?: string } | undefined;
  sortedRows: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  hasLocalFiltersApplied: boolean;
  hasExportableData: boolean;
  showEmpty: boolean;
  visibleColumns: Array<{ key: string; label: string }>;
  visibleColumnsWithActions: Array<{ key: string; label: string; render?: (item: Record<string, unknown>) => React.ReactNode }>;
  mobileTableProps: Record<string, unknown>;
  handleRowClick: ((row: Record<string, unknown>) => void) | undefined;
  tipo: string;
  footerCols: ColumnDef[];
  activeFilterChips: ActiveFilterChip[];
  handleClearAllFilters: () => void;
  handleChartDrillDown: (point: { name: string; value: number }) => void;
  tableExpanded: boolean;
  setTableExpanded: (v: boolean) => void;
  // sticky footer export
  isExporting: boolean;
  PDF_ROW_LIMIT: number;
  handleExportPdf: () => void;
  handleExportXlsx: () => void;
  handleExportCsv: () => void;
}

export function RelatorioBody(props: RelatorioBodyProps) {
  const {
    isMobile, isLoading, isError, isDreReport, isQtyReport,
    resultado, selectedMeta, semantics, sortedRows, rows,
    hasLocalFiltersApplied, hasExportableData, showEmpty,
    visibleColumns, visibleColumnsWithActions, mobileTableProps,
    handleRowClick, tipo, footerCols, activeFilterChips,
    handleClearAllFilters, handleChartDrillDown,
    tableExpanded, setTableExpanded,
    isExporting, PDF_ROW_LIMIT, handleExportPdf, handleExportXlsx, handleExportCsv,
  } = props;

  return (
    <>
      {/* Mobile: Chart primeiro (insight central) */}
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

      {/* Resultado: tabela + chart */}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-3 hidden md:block">
            <CardTitle className="text-base">{resultado?.title || 'Relatório'}</CardTitle>
            <CardDescription>{resultado?.subtitle}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
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
                        <ChevronDown className={cn('h-4 w-4 transition-transform text-muted-foreground', tableExpanded && 'rotate-180')} />
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

        {/* Chart desktop */}
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

      {/* Mobile sticky footer com Exportar */}
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
  );
}