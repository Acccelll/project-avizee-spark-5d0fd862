---
name: KPIs Financeiro/Fiscal via RPC
description: kpis_financeiro e kpis_fiscal alimentam cards de resumo sob paginação server-side
type: feature
---

Para preservar a precisão dos cards de KPI quando Financeiro/Fiscal usam paginação 50/pág, os agregados vêm de RPCs:

- `kpis_financeiro(p_date_from, p_date_to, p_tipos[], p_status[], p_bancos[], p_origens[], p_formas[], p_cartoes[], p_search)` → `jsonb`
  - Status efetivo: `aberto + data_vencimento < hoje` => `vencido`.
  - Retorna: `totalCount`, `a_vencer`, `vence_hoje`, `vencido`, `pago`, `parcial`, `total_*`.
- `kpis_fiscal(p_date_from, p_date_to, p_tipos[], p_status[], p_fornecedores[], p_clientes[], p_modelos[], p_search)` → `jsonb`
  - Retorna: `totalCount`, contagem por status, `total_valor`, `total_entrada`, `total_saida`, `total_valor_confirmada`.

Ambas: `SECURITY INVOKER`, `STABLE`, `SET search_path = public`. Chamáveis por `authenticated` — RLS continua valendo.

Padrão de consumo:
```ts
const { data: kpis } = useQuery({
  queryKey: ["kpis_financeiro", filters],
  queryFn: () => supabase.rpc("kpis_financeiro", { p_date_from, p_date_to, ... }).then(r => r.data),
});
```

Os filtros enviados ao RPC devem espelhar exatamente o que o `useSupabaseCrud` aplica na listagem para que cards e tabela permaneçam coerentes.