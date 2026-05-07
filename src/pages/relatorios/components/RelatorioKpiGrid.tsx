import { Hash } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SummaryCard } from '@/components/SummaryCard';

export interface RelatorioKpiCard {
  title: string;
  value: string;
  icon: LucideIcon;
  variation?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

interface Props {
  cards: RelatorioKpiCard[];
  compactDensity: boolean;
  hasLocalFiltersApplied: boolean;
  rowsCount: number;
  visibleCount: number;
  isLikelyTruncated: boolean;
}

/**
 * Grid 2×2 (mobile) → 4 colunas (xl) de KPIs do relatório, com banners de
 * aviso de truncamento (limite default Supabase) e divergência entre KPIs
 * (universo total) e tabela (filtros locais).
 */
export function RelatorioKpiGrid({
  cards,
  compactDensity,
  hasLocalFiltersApplied,
  rowsCount,
  visibleCount,
  isLikelyTruncated,
}: Props) {
  return (
    <>
      {hasLocalFiltersApplied && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-foreground flex items-start gap-2">
          <span className="font-medium">Atenção:</span>
          <span className="text-muted-foreground">
            Os KPIs abaixo refletem o universo total ({rowsCount} registros) retornado do banco.
            A tabela aplica filtros locais e mostra {visibleCount} de {rowsCount} registros.
          </span>
        </div>
      )}
      {isLikelyTruncated && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-foreground flex items-start gap-2">
          <span className="font-medium text-destructive">Resultado pode estar truncado:</span>
          <span className="text-muted-foreground">
            O relatório atingiu exatamente {rowsCount} registros (limite default da consulta). Refine o período ou os filtros para garantir que todos os dados sejam considerados.
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((kpi) => (
          <SummaryCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            icon={kpi.icon ?? Hash}
            variationType="neutral"
            variation={hasLocalFiltersApplied ? `${kpi.variation || ''} (universo total)`.trim() : kpi.variation}
            variant={kpi.variant}
            density={compactDensity ? 'compact' : 'default'}
          />
        ))}
      </div>
    </>
  );
}