import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { PeriodoFilter } from '@/pages/relatorios/components/Filtros/PeriodoFilter';
import { FiltrosRelatorio, type FiltrosRelatorioState } from '@/pages/relatorios/components/Filtros/FiltrosRelatorio';
import { RefreshCcw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReportConfig, ReportRuntimeSemantics } from '@/config/relatoriosConfig';
import type { ReportMeta } from '@/types/relatorios';
import type { ClienteRef, FornecedorRef, GrupoProdutoRef } from '@/pages/relatorios/hooks/useRelatoriosFiltrosData';

interface Props {
  filtersSheetOpen: boolean;
  setFiltersSheetOpen: (open: boolean) => void;
  activeFiltersCount: number;

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

  onClearAllFilters: () => void;
  onRefetch: () => void;
  isLoading: boolean;

  exportMenu: ReactNode;
}

/**
 * Toolbar mobile (<md) com Filtros (sheet bottom) + Exportar + Atualizar.
 */
export function RelatorioMobileToolbar({
  filtersSheetOpen,
  setFiltersSheetOpen,
  activeFiltersCount,
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
  onClearAllFilters,
  onRefetch,
  isLoading,
  exportMenu,
}: Props) {
  return (
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
              <Button variant="outline" className="flex-1 min-h-11" onClick={onClearAllFilters}>
                Limpar
              </Button>
            )}
            <Button className="flex-1 min-h-11" onClick={() => setFiltersSheetOpen(false)}>
              Aplicar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      {exportMenu}
      <Button
        variant="outline"
        size="icon"
        className="min-h-11 min-w-11"
        onClick={onRefetch}
        disabled={isLoading}
        aria-label="Atualizar dados"
      >
        <RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
      </Button>
    </div>
  );
}