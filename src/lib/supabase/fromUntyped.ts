/**
 * `fromUntyped<T>(table)` — wrapper único para acessar tabelas/views ainda
 * não refletidas em `Database['public']['Tables' | 'Views']`.
 *
 * Onda 9.2 (A-05): substitui o padrão `(supabase as any).from('x')`
 * espalhado pelos services (workbook, apresentação) por um único ponto de
 * cast tipado. Mantém runtime safety — os rows continuam sendo
 * normalizados via `Record<string, unknown>` nos mapeadores —, mas a
 * superfície de `as any` fica isolada aqui.
 *
 * Uso:
 * ```ts
 * const { data, error } = await fromUntyped<MyRow>('vw_workbook_dre').select('*');
 * ```
 */
import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any;

export function fromUntyped<_T = unknown>(table: string): AnyBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as unknown as { from: (n: string) => AnyBuilder }).from(table);
}

export const sbu = fromUntyped;