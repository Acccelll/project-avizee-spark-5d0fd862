---
name: useSupabaseCrud filtros server-side
description: dateRange e statusFilter aplicados server-side via gte/lte/in; queryKey incorpora ambos
type: feature
---

`useSupabaseCrud` aceita filtros server-side (não quebram consumidores antigos):

```ts
useSupabaseCrud<Lancamento>({
  table: "financeiro_lancamentos",
  dateRange: { column: "data_vencimento", from: "2025-01-01", to: "2025-01-31" },
  statusFilter: { column: "status", values: ["aberto", "vencido"] },
  pageSize: 50, // ativa paginação real (range)
});
```

- `dateRange`: aplica `gte(column, from)` + `lte(column, to)` (ambos opcionais).
- `statusFilter`: aplica `in(column, values)` apenas quando `values.length > 0`.
- Ambos entram no `queryKey` para cache correto por filtro.
- Use em telas paginadas para que LIMIT/OFFSET trabalhem sobre o conjunto já filtrado.

Próxima etapa pendente (E7.1+): expor RPCs `kpis_financeiro` / `kpis_fiscal` para que cards de resumo continuem corretos sob paginação.