/**
 * Helper de paginação universal para loaders de Relatórios.
 *
 * Resolve o C-01/DP-01 da revisão de Onda 9: o Supabase aplica page size
 * default = 1000 quando não há `.range()` explícito, então qualquer loader
 * que apenas faça `await query` retorna no máximo 1000 linhas — KPIs e
 * gráficos calculados sobre esse subconjunto ficam silenciosamente errados.
 *
 * Uso:
 * ```ts
 * const data = await fetchAllPages<MinhaRow>(() =>
 *   supabase
 *     .from('financeiro_lancamentos')
 *     .select('id, valor, status')
 *     .eq('ativo', true)
 *     .order('data_vencimento', { ascending: true }),
 * );
 * ```
 *
 * O builder retornado por `buildQuery()` é mutado a cada iteração via
 * `.range(from, to)` — por isso recebemos uma factory ao invés do builder
 * pronto: cada chamada retorna uma instância nova.
 */

export const SUPABASE_PAGE_SIZE = 1000;
/** Teto absoluto para evitar travar a UI se uma view explodir. */
export const REPORT_HARD_CAP = 50_000;

export interface FetchAllPagesOptions {
  pageSize?: number;
  hardCap?: number;
  /**
   * Callback invocado quando atingimos `hardCap` — permite que o loader
   * sinalize truncamento real (ex: `meta.truncatedAt`).
   */
  onTruncated?: (truncatedAt: number) => void;
}

type SupabaseRangeable<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }> & {
  range: (from: number, to: number) => SupabaseRangeable<T>;
};

export async function fetchAllPages<T>(
  buildQuery: () => SupabaseRangeable<T>,
  options: FetchAllPagesOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? SUPABASE_PAGE_SIZE;
  const hardCap = options.hardCap ?? REPORT_HARD_CAP;

  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
    if (all.length >= hardCap) {
      options.onTruncated?.(hardCap);
      return all.slice(0, hardCap);
    }
    from += pageSize;
  }
  return all;
}