import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Conta linhas em uma tabela via `head: true` + `count: 'exact'` — não baixa os
 * registros, só retorna o total. Use para SummaryCards quando a lista usa
 * paginação server-side (`useSupabaseCrud` em modo paged), pois `data` ali
 * contém apenas a página corrente.
 *
 * `filters` aceita pares simples `column → value | values | { is: null }`.
 * Use `{ is: null }` para `IS NULL` e `{ not: { is: null } }` para `NOT NULL`.
 */
type FilterValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | { is: null }
  | { not: { is: null } };

export function useTableCount(
  table: string,
  filters: Record<string, FilterValue> = {},
  enabled = true,
) {
  const filterKey = JSON.stringify(filters);
  return useQuery({
    queryKey: ["table-count", table, filterKey],
    enabled,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any)
        .from(table)
        .select("id", { count: "exact", head: true });
      for (const [col, val] of Object.entries(filters)) {
        if (Array.isArray(val)) q = q.in(col, val);
        else if (val && typeof val === "object" && "not" in val) q = q.not(col, "is", null);
        else if (val && typeof val === "object" && "is" in val) q = q.is(col, null);
        else q = q.eq(col, val);
      }
      if (signal) q = q.abortSignal(signal);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}