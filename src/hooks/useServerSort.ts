import { useState } from "react";

/**
 * Estado controlado de ordenação server-side para uso com `DataTable serverPagination`.
 *
 * Devolve `{ sortKey, sortDir, orderBy, ascending, onChange }` — onde `orderBy`
 * e `ascending` já vêm prontos para passar ao `useSupabaseCrud`.
 */
export function useServerSort(defaultKey: string, defaultDir: "asc" | "desc" = "asc") {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(defaultDir);

  const onChange = (key: string | null, dir: "asc" | "desc" | null) => {
    setSortKey(key);
    setSortDir(dir);
  };

  return {
    sortKey,
    sortDir,
    orderBy: sortKey ?? defaultKey,
    ascending: (sortDir ?? defaultDir) === "asc",
    onChange,
  };
}