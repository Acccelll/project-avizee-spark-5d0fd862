# ADR 002 — Drawer vs. Página dedicada

**Status:** Aceito · **Data:** 2026-05-06

## Contexto

O ERP combina dois padrões de edição: **drawers laterais** (`ViewDrawerV2`,
`RelationalDrawerStack`) e **páginas de formulário dedicadas** (Orçamento,
Pedido de Compra, Cotação). Sem um critério explícito o time tende a oscilar,
o que prejudica consistência visual e contexto de navegação.

## Decisão

- **Drawer (`ViewDrawerV2`)** — visualização e edição simples de uma única
  entidade, sem listas dinâmicas. Mantém o contexto da listagem visível.
- **Página dedicada** — formulários com itens de linha dinâmicos, wizards
  multi-step ou campos extensos. Exemplos: `OrcamentoForm`, `PedidoCompraForm`,
  `CotacaoCompraForm`, `NotaFiscalForm`.
- Drawers cross-módulo em mobile usam variante bottom-sheet (`Sheet` com
  `side="bottom"`).

## Consequências

- A regra é validada na revisão de PR; novos forms com itens dinâmicos não
  devem ser adicionados como drawer.
- O contrato está espelhado em memória (`mem://produto/quando-drawer-quando-pagina`).

---

# ADR 003 — Filtros de lista em URL (`useUrlListState`)

**Status:** Aceito · **Data:** 2026-05-06

## Contexto

Filtros locais em `useState` perdem estado em refresh, em "voltar" e
impossibilitam compartilhar links operacionais. A maioria dos módulos já usava
`useSearchParams` ad-hoc, com inconsistência de chaves e ausência de aliases
para links legados.

## Decisão

- Toda página de listagem persiste filtros via
  `useUrlListState({ schema: { ... } })` (`src/hooks/useUrlListState.ts`).
- Aliases legados (ex.: `data_inicio`, `cartao`) ficam declarados em `aliases`
  para preservar compatibilidade de URL durante migrações.
- Limpeza de filtros usa `clear()` ou `clear(["chave"])`, nunca múltiplos
  setters concatenados.

## Consequências

- Páginas migradas: Clientes, Fornecedores, Produtos, Pedidos, Cotações,
  Backlog/Consulta Faturamento, Financeiro, Funcionários, Transportadoras,
  Formas de Pagamento.
- Telemetria de erros em `ErrorBoundary` é opcional via
  `window.__avizeeReportError(err, info)` — sem SDK no bundle por padrão.

