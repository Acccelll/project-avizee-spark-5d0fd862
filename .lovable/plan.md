# Onda 7 — Paginação real server-side

## Objetivo

Trocar o atual `paginationMode: 'all'` (chunks até 50k) por requisições paginadas reais (`range(from, to)` com `count: 'exact'`) em **Clientes, Fornecedores, Produtos e GruposEconomicos**, com UI de paginação que mostre `totalCount` real e permita navegar página a página sem carregar tudo.

## Problema de hoje

- `useSupabaseCrud` em modo `'all'` puxa até `CHUNK_FETCH_HARD_CAP = 50000` linhas em chunks de 1000, e o `DataTable` então pagina/ordena/filtra sobre esse array em memória.
- Sort, filter rules internos e busca por substring funcionam **apenas dentro do que já está em memória**.
- O hook já suporta modo `'paged'` quando `pageSize` é setado, mas hoje **nenhuma página alvo usa**.

## Decisões de escopo

1. **Ordenação:** será server-side somente nas colunas com chave nativa do banco (`nome`, `razao_social`, `sku`, `created_at`). Para colunas derivadas (`sortValue` custom — ex.: situação de estoque), a opção será desabilitada quando o modo for "server-paged".
2. **Filtros que permanecem client-side** seguem sendo aceitos, mas serão aplicados **apenas dentro da página corrente** com aviso explícito quando a lista estiver paginada (ex.: chip "Filtros locais aplicados nesta página"):
   - "sem_grupo" misto em Clientes e Produtos.
   - Situação de estoque em Produtos.
3. **Busca** continua server-side via `searchTerm` + `searchColumns` no hook (já implementado com `or(...ilike)`).
4. **Default `pageSize`:** 50 por página (configurável). Threshold de virtualização do `DataTable` continua 50.

## Mudanças no código

### `src/hooks/useSupabaseCrud.ts`

- Sem mudança estrutural — modo `'paged'` já existe e expõe `page`/`setPage`/`hasMore`/`totalCount`.
- Pequeno ajuste: garantir que `setPage(0)` seja disparado ao mudar `searchTerm`, `statusFilter`, `dateRange`, `filter` (hoje a key muda mas `page` não reseta — pode pedir página inexistente).

### `src/components/DataTable.tsx`

- Nova prop `serverPagination?: { page: number; setPage: (n: number) => void; totalCount: number | null; hasMore: boolean; }`.
- Quando presente:
  - **Não** aplica `sortedData.slice(currentPage * pageSize, ...)`. Renderiza `data` direto.
  - Footer: usa `totalCount` real, botões `‹ ›` chamam `serverPagination.setPage(...)`.
  - Filtros internos (`rules`) ficam **desabilitados** (popover oculto) — força usar `AdvancedFilterBar` server-side.
  - Sort: só permite em colunas marcadas `serverSortable: true` (nova flag). Demais colunas perdem o ícone de sort.
- `viewMode === 'infinite'` (carregar mais) é desabilitado quando `serverPagination` está ativo (ou implementa `setPage(page+1)` acumulando — decidir: na 1ª iteração, **desabilitar** infinite e mostrar só paged).

### Páginas alvo

`Clientes.tsx`, `Fornecedores.tsx`, `Produtos.tsx`, `GruposEconomicos.tsx`:

- Adicionar `pageSize: 50` ao `useSupabaseCrud`.
- Repassar `{ page, setPage, totalCount, hasMore }` para `DataTable serverPagination={...}`.
- Marcar colunas server-sortable (`nome`/`razao_social`/`sku`/`created_at`).
- Para os filtros que permaneceram client-side, manter como overlay, mas adicionar tooltip/aviso sob o filter chip: "Aplicado apenas nesta página".

## Validação

- Mock com >2k registros em produtos: confirmar que ao abrir `/produtos`, a network request usa `?limit=50&offset=0` (via `range`) e não puxa 2k linhas.
- Trocar de página: nova request com `range(50, 99)`.
- Filtro de status: request inclui `status=in.(...)` e reseta para página 0.
- Sort por `sku`: request inclui `order=sku.asc.nullslast` e reseta para página 0.
- `bunx tsc --noEmit` + smoke tests existentes.

## Riscos / pontos de atenção

- **Quebra perceptível:** usuários que usavam `Ctrl+F` no navegador para achar registro fora da página atual perdem isso. Mitigação: search server-side já existe e cobre o caso.
- **Total de registros:** `count: 'exact'` é mais caro no Postgres em tabelas muito grandes. Se virar problema, trocar para `'estimated'` (já considerar fallback no hook).
- **Cache do React Query:** cada página vira uma cache key diferente (já considerado pela `queryKey` que inclui `page`). `prefetchQuery` da próxima página é otimização opcional pós-MVP.
- **Memória mem://** atualizar `mem://tech/usesupabasecrud-filtros-server.md` (ou criar) descrevendo "modo paged + flag `serverSortable` no DataTable".

## Não escopo (fica para depois)

- Paginação server-side em demais módulos (Logística, Comercial, Financeiro). Aplicar mesmo padrão em onda futura.
- Cursor-based pagination (keyset) — `range/offset` é suficiente para o tamanho atual.
- Prefetch da próxima página.

## Entrega

1 PR único contendo: ajuste no hook, nova prop no `DataTable`, 4 páginas migradas, atualização do `.lovable/plan.md` (Onda 7 ✅) e memória técnica.
