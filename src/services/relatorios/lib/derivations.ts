/**
 * Derivações puras (sem React) reaproveitáveis a partir de um
 * `RelatorioResultado`. Onda 9.5 — A-03.
 *
 * Mantém `Relatorios.tsx` mais magra e abre caminho para reuso em
 * Workbook/Apresentação (que hoje refazem o mesmo cálculo de KPIs).
 */

import { reportConfigs } from '@/config/relatoriosConfig';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { RelatorioResultado, TipoRelatorio } from '@/services/relatorios.service';

export interface KpiCardData {
  key: string;
  title: string;
  value: string;
  rawValue: number | null;
  variation: string;
  variant?: string;
  format: 'currency' | 'percent' | 'number';
}

/**
 * Constrói os KPIs do header a partir de `resultado.kpis` (com fallback para
 * `resultado.totals`) usando a config canônica do relatório.
 */
export function buildKpiCards(
  resultado: RelatorioResultado | undefined,
  tipo: TipoRelatorio | '' | undefined,
): KpiCardData[] {
  if (!resultado || !tipo) return [];
  const cfg = reportConfigs[tipo as TipoRelatorio];
  if (!cfg) return [];
  const kpis = resultado.kpis || {};
  return cfg.kpis.map((def) => {
    const raw = (kpis[def.key] ?? resultado.totals?.[def.key]) as number | null | undefined;
    const fmt = (def.format ?? 'number') as KpiCardData['format'];
    const value =
      raw == null
        ? '-'
        : fmt === 'currency'
        ? formatCurrency(raw)
        : fmt === 'percent'
        ? `${raw.toFixed(1)}%`
        : formatNumber(raw);
    return {
      key: def.key,
      title: def.label,
      value,
      rawValue: raw == null ? null : raw,
      variation: def.variation || '',
      variant: def.variant,
      format: fmt,
    };
  });
}

/**
 * Deriva `mobileStatusKey` / `mobileIdentifierKey` a partir das colunas
 * visíveis e dos `semantics` do relatório. Usado pelo `DataTable` mobile.
 */
export interface MobileTableProps {
  mobileStatusKey?: string;
  mobileIdentifierKey?: string;
}

const STATUS_CANDIDATES = ['status', 'criticidade', 'faixa', 'classe', 'tipo'];
const VALUE_KEYS = ['valor', 'valorTotal', 'quantidade', 'pedidos', 'posicao'];

export function deriveMobileTableProps(
  visibleColumns: { key: string }[],
  statusField?: string,
): MobileTableProps {
  if (!visibleColumns.length) return {};
  const statusKey =
    statusField && visibleColumns.some((c) => c.key === statusField)
      ? statusField
      : visibleColumns.find((c) => STATUS_CANDIDATES.includes(c.key))?.key;
  const identifierKey = visibleColumns.find(
    (c) => c.key !== statusKey && !STATUS_CANDIDATES.includes(c.key) && !VALUE_KEYS.includes(c.key),
  )?.key;
  return { mobileStatusKey: statusKey, mobileIdentifierKey: identifierKey };
}