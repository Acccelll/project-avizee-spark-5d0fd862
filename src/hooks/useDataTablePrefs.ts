import { useEffect, useMemo, useState, useCallback } from 'react';
import { useUserPreference } from '@/hooks/useUserPreference';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Preferências do DataTable persistidas por moduleKey.
 * Substitui a persistência dupla (localStorage + upsert manual em user_preferences)
 * pelo `useUserPreference`, que já garante:
 *  - debounce/sync local↔remoto via useSyncedStorage
 *  - retry offline e reconciliação multi-aba
 *  - hidratação remota no primeiro load (cross-device).
 *
 * Mantém compatibilidade com a chave antiga `datatable:<module>:columns` em
 * localStorage através de uma migração one-shot: se a chave legada existir e
 * a preferência remota ainda não, importamos as colunas escondidas e removemos
 * o resquício do localStorage.
 */
export interface DataTablePrefs {
  hiddenKeys: string[];
  viewMode?: 'pagination' | 'infinite';
  /** Ordem persistida das colunas (lista de keys). Colunas não listadas
   *  caem no fim, na ordem original de `columns`. */
  columnOrder?: string[];
}

const DEFAULT: DataTablePrefs = { hiddenKeys: [], viewMode: 'pagination', columnOrder: [] };

const legacyKeys = (moduleKey: string) => ({
  cols: `datatable:${moduleKey}:columns`,
  mode: `datatable:${moduleKey}:list-mode`,
});

export function useDataTablePrefs(moduleKey: string | undefined, initialHiddenKeys: string[]) {
  const { user } = useAuth();
  const prefKey = useMemo(() => (moduleKey ? `datatable:${moduleKey}` : 'datatable:_anon'), [moduleKey]);
  const { value, save, loading } = useUserPreference<DataTablePrefs>(user?.id, prefKey, {
    ...DEFAULT,
    hiddenKeys: initialHiddenKeys,
  });

  // Migração one-shot do localStorage legado.
  useEffect(() => {
    if (!moduleKey || loading) return;
    const { cols, mode } = legacyKeys(moduleKey);
    const legacyCols = localStorage.getItem(cols);
    const legacyMode = localStorage.getItem(mode);
    if (!legacyCols && !legacyMode) return;
    try {
      const merged: DataTablePrefs = { ...value };
      if (legacyCols && (!value.hiddenKeys || value.hiddenKeys.length === 0)) {
        merged.hiddenKeys = JSON.parse(legacyCols);
      }
      if (legacyMode === 'pagination' || legacyMode === 'infinite') {
        merged.viewMode = legacyMode;
      }
      void save(merged);
    } catch {
      // ignore parse failures
    } finally {
      localStorage.removeItem(cols);
      localStorage.removeItem(mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- migração one-shot; reagir a mudanças em `value`/`save` causaria loop de salvamento
  }, [moduleKey, loading]);

  const setHiddenKeys = useCallback(
    (keys: string[]) => save({ ...value, hiddenKeys: keys }),
    [save, value],
  );
  const setViewMode = useCallback(
    (mode: 'pagination' | 'infinite') => save({ ...value, viewMode: mode }),
    [save, value],
  );
  const setColumnOrder = useCallback(
    (order: string[]) => save({ ...value, columnOrder: order }),
    [save, value],
  );

  return {
    hiddenKeys: value.hiddenKeys ?? [],
    viewMode: value.viewMode ?? 'pagination',
    columnOrder: value.columnOrder ?? [],
    setHiddenKeys,
    setViewMode,
    setColumnOrder,
    loading,
  };
}
