---
name: useSupabaseCrud paginação server-side
description: Quando uma lista usa pageSize, DataTable deve receber serverPagination e KPIs vêm de useTableCount; sort apenas em colunas serverSortable
type: feature
---
**Quando aplicar:** listas com volume potencial > 1k linhas (Clientes, Fornecedores, Produtos, GruposEconomicos hoje).

**Padrão:**
1. `useSupabaseCrud({ ..., pageSize: 50, orderBy, ascending })` — devolve `data` (página corrente), `page`, `setPage`, `totalCount`, `hasMore`.
2. `useServerSort(defaultKey)` para estado controlado de ordenação.
3. `<DataTable serverPagination={{ page, setPage, totalCount, hasMore }} onServerSort={sort.onChange} serverSortKey={sort.sortKey} serverSortDir={sort.sortDir} />`.
4. Marcar colunas ordenáveis pelo banco com `serverSortable: true` (ex.: nome, sku, created_at). Demais colunas perdem o ícone de sort no modo paged.
5. SummaryCards de totais usam `useTableCount("tabela", { ... })` — `data.length` em modo paged conta só a página.

**Filtros:** filter/searchTerm/statusFilter já vão server-side via `useSupabaseCrud`. Filtros que dependem de runtime (situação de estoque) ou semântica especial (NULL+UUIDs misturados como "sem_grupo") permanecem client-side mas só atuam sobre a página corrente — labelar UI com sufixo "(página)" quando isso afeta KPI.

**Não fazer:** não usar `paginationMode: 'all'` em listas grandes; não calcular splits de KPI sobre `data` quando o hook está em modo paged.
