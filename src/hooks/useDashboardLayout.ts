import { useCallback, useEffect, useMemo } from 'react';
import { useUserPreference } from '@/hooks/useUserPreference';

export type WidgetId =
  | 'kpis'
  | 'operational'
  | 'alertas'
  | 'financeiro'
  | 'acoes_rapidas'
  | 'comercial'
  | 'estoque'
  | 'logistica'
  | 'fiscal'
  | 'vendas_chart'
  | 'pendencias';

/**
 * Persisted layout preferences for the dashboard. v1 is intentionally
 * lightweight — there is no drag-and-drop nor widget resizing:
 *  - `order`: ordered list of widget ids (controls render order)
 *  - `hidden`: widgets the user explicitly toggled off
 * The actual visual position/sizing is governed by the responsive CSS grid.
 */
export interface DashboardLayoutPrefs {
  order: WidgetId[];
  hidden: WidgetId[];
}

export const DEFAULT_ORDER: WidgetId[] = [
  'kpis',
  'operational',
  'alertas',
  'financeiro',
  'acoes_rapidas',
  'pendencias',
  'fiscal',
  'comercial',
  'estoque',
  'logistica',
  'vendas_chart',
];

const DEFAULT_PREFS: DashboardLayoutPrefs = { order: DEFAULT_ORDER, hidden: [] };

const LEGACY_STORAGE_KEY_PREFIX = 'avizee:dashboard-layout:v3:';

function readLegacyLayout(userId: string | null | undefined): DashboardLayoutPrefs | null {
  try {
    const raw = localStorage.getItem(`${LEGACY_STORAGE_KEY_PREFIX}${userId ?? 'anon'}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy format is the absolute layout array; we only salvage order.
      const order = parsed
        .map((item: { i?: string }) => item?.i)
        .filter((id): id is WidgetId => typeof id === 'string' && (DEFAULT_ORDER as string[]).includes(id));
      if (order.length > 0) {
        // Append any new widgets missing from legacy snapshot at the end.
        const merged = [...order, ...DEFAULT_ORDER.filter((w) => !order.includes(w))];
        return { order: merged, hidden: [] };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function useDashboardLayout(userId: string | null | undefined) {
  const { value, save } = useUserPreference<DashboardLayoutPrefs>(
    userId ?? null,
    'dashboard_layout_v1',
    DEFAULT_PREFS,
  );

  // One-shot legacy migration: if no remote prefs exist yet but the v3
  // localStorage entry is around, salvage the order before deletion.
  useEffect(() => {
    if (!userId) return;
    const legacy = readLegacyLayout(userId);
    if (legacy && (!value || (value.order === DEFAULT_ORDER && value.hidden.length === 0))) {
      void save(legacy);
    }
    try {
      localStorage.removeItem(`${LEGACY_STORAGE_KEY_PREFIX}${userId ?? 'anon'}`);
    } catch {
      // ignore
    }
    // run once per user id
    // eslint-disable-next-line react-hooks/exhaustive-deps -- migração legacy one-shot por userId; reagir a `value`/`save` causaria loop
  }, [userId]);

  // Always reconcile against the latest DEFAULT_ORDER so newly added widgets
  // appear at the bottom for users with stored prefs.
  const prefs = useMemo<DashboardLayoutPrefs>(() => {
    const order = (value?.order ?? DEFAULT_ORDER).filter((id) =>
      (DEFAULT_ORDER as string[]).includes(id),
    ) as WidgetId[];
    const merged = [...order, ...DEFAULT_ORDER.filter((w) => !order.includes(w))];
    const hidden = (value?.hidden ?? []).filter((id) =>
      (DEFAULT_ORDER as string[]).includes(id),
    ) as WidgetId[];
    return { order: merged, hidden };
  }, [value]);

  const toggleVisibility = useCallback(
    async (id: WidgetId) => {
      const isHidden = prefs.hidden.includes(id);
      const nextHidden = isHidden ? prefs.hidden.filter((w) => w !== id) : [...prefs.hidden, id];
      await save({ ...prefs, hidden: nextHidden });
    },
    [prefs, save],
  );

  const moveWidget = useCallback(
    async (id: WidgetId, direction: 'up' | 'down') => {
      const idx = prefs.order.indexOf(id);
      if (idx < 0) return;
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prefs.order.length) return;
      const next = [...prefs.order];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      await save({ ...prefs, order: next });
    },
    [prefs, save],
  );

  const resetLayout = useCallback(async () => {
    await save(DEFAULT_PREFS);
  }, [save]);

  return { prefs, toggleVisibility, moveWidget, resetLayout };
}
