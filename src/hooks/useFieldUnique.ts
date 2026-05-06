import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Verifica se o valor de um campo é único dentro de uma tabela.
 * Útil para validações inline (ex.: SKU de produto, código de unidade)
 * antes do submit, sem depender só do erro do banco.
 *
 * Política: assume `valor` já normalizado pelo chamador (trim, upper, etc.).
 * Quando `valor` é vazio, considera disponível (não consulta).
 */
export interface UseFieldUniqueReturn {
  isUnique: boolean | undefined;
  isLoading: boolean;
}

export function useFieldUnique(
  table: string,
  column: string,
  valor: string,
  excludeId?: string,
  opts?: { minLength?: number; debounceMs?: number },
): UseFieldUniqueReturn {
  const minLength = opts?.minLength ?? 1;
  const trimmed = (valor ?? "").trim();
  const isReady = trimmed.length >= minLength;

  const { data: isUnique, isLoading } = useQuery<boolean>({
    queryKey: ["field-unique", table, column, trimmed, excludeId],
    enabled: isReady,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any)
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(column, trimmed);
      if (excludeId) q = q.neq("id", excludeId);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return (count ?? 0) === 0;
    },
  });

  return { isUnique, isLoading };
}