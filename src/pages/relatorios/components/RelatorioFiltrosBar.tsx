import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PeriodoFilter } from '@/pages/relatorios/components/Filtros/PeriodoFilter';
import { FiltrosRelatorio, type FiltrosRelatorioState } from '@/pages/relatorios/components/Filtros/FiltrosRelatorio';
import { ExportMenu } from '@/pages/relatorios/components/ExportMenu';
import { Columns, Eye, Rows3 } from 'lucide-react';
import type { ReportConfig, ReportRuntimeSemantics } from '@/config/relatoriosConfig';
import type { ReportMeta } from '@/types/relatorios';
import type { ClienteRef, FornecedorRef, GrupoProdutoRef } from '@/pages/relatorios/hooks/useRelatoriosFiltrosData';

export interface RelatorioColumnDef {
  key: string;
  label: string;
}

interface Props {
  selectedMeta: ReportConfig;
  reportMeta: ReportMeta | undefined;
  semantics: ReportRuntimeSemantics | undefined;
  isDreReport: boolean;
  dataInicio: string;
  dataFim: string;
  setDataInicio: (v: string) => void;
  setDataFim: (v: string) => void;
  filtrosState: FiltrosRelatorioState;
  setFiltrosState: (partial: Partial<FiltrosRelatorioState>) => void;
  clientes: ClienteRef[];
  fornecedores: FornecedorRef[];
  grupos: GrupoProdutoRef[];
  limits: { clientes: number; fornecedores: number };

  columns: RelatorioColumnDef[];
  visibleColumnsCount: number;
  hiddenColumns: string[];
  setHiddenColumns: (next: string[] | ((prev: string[]) => string[])) => void;

  compactDensity: boolean;
  setCompactDensity: (next: boolean | ((prev: boolean) => boolean)) => void;

  onPreview: () => void;
  hasExportableData: boolean;

  exportMenu: ReactNode;
}

/**
 * Barra de filtros desktop (≥md): período + filtros canônicos do relatório à
 * esquerda; ações (Visualizar / Colunas / Densidade / Exportar) à direita.
 * Mantém todo o comportamento original de Relatorios.tsx mas isolado em uma
 * unidade testável e enxuta.
 */
export function RelatorioFiltrosBar({
  selectedMeta,
  reportMeta,
  semantics,
  isDreReport,
  dataInicio,
  dataFim,
  setDataInicio,
  setDataFim,
  filtrosState,
  setFiltrosState,
  clientes,
  fornecedores,
  grupos,
  limits,
  columns,
  visibleColumnsCount,
  hiddenColumns,
  setHiddenColumns,
  compactDensity,
  setCompactDensity,
  onPreview,
  hasExportableData,
  exportMenu,
}: Props) {
  return (
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

          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onPreview}
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
                        {visibleColumnsCount}/{columns.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Personalizar colunas</p>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {columns.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={!hiddenColumns.includes(col.key)}
                          onCheckedChange={(checked) =>
                            setHiddenColumns((prev) =>
                              checked ? prev.filter((k) => k !== col.key) : [...prev, col.key],
                            )
                          }
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                  {hiddenColumns.length > 0 && (
                    <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => setHiddenColumns([])}>
                      Restaurar padrão
                    </Button>
                  )}
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
            {exportMenu}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Re-export ExportMenu for convenience callers.
export { ExportMenu };