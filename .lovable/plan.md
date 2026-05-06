## Status da Auditoria Onda 2 — o que já foi feito vs. o que falta

Verifiquei item a item da matriz contra o código atual (`src/`, services, schema do banco).

### Itens JÁ resolvidos (não precisam mais de ação)

| ID | Item | Evidência atual |
|---|---|---|
| **C-01** | Produto em FormModal | `Produtos.tsx:179-192` redireciona para `/produtos/novo` e `/produtos/:id/editar` (rotas em `cadastros.routes.tsx`), página dedicada `ProdutoForm.tsx` ativa. |
| **C-02** | `boleto_dda` ausente | `FormasPagamento.tsx:50` já tem `boleto_dda: "Boleto/DDA"` no `tipoLabel`. |
| **C-03** | `pageSize` server-side | Produtos, Clientes, Fornecedores, GruposEconomicos todos com `pageSize: 50`. |
| **A-01 / M-02 / SH-01** | Sócios sem dedup/máscara CPF | `Socios.tsx` já usa `useDocumentoUnico("cpf",…,"socios")` + `MaskedInput mask="cpf"`; enum `DocumentoTable` em `useDocumentoUnico.ts` já inclui `"socios"`. |
| **A-02** | Transportadoras sem `tipo_pessoa` | Type/form/UI já têm `tipo_pessoa` (default "J") e `useDocumentoUnico` é condicional `cpf`/`cnpj`. |
| **A-03 / BK-02** | Hard delete em cadastros | Os 4 services usam `safeDelete` com lista de dependências e soft-delete (`update ativo:false`). |
| **A-04** | Grupos sem URL state | `GruposEconomicos.tsx:82` usa `useUrlListState`. |
| **BK-01 (parcial)** | UNIQUE CPF | `socios_cpf_key` existe; **`funcionarios.cpf` ainda sem UNIQUE**. |
| **BK-03** | `set_principal_endereco` com `as never` | Cast removido em `clientes.service.ts:75`. |
| **SH-05** | `fetchClienteDetalhes` | já usa `Promise.allSettled` (linha 244). |
| **B-01** | UnidadesMedida.tsx código morto | Arquivo já removido. |

### Itens que AINDA faltam

🔴 **Bug remanescente**
- ✅ **A-07** resolvido (FiscalBlock consome `scopes.fiscal`).

🟠 **Alto**
- ✅ **A-05** — `produtoInsumoSchema` já existe e é usado no submit.
- ✅ **A-06 / BK-04** — coluna `produtos.variacoes` é `text[]`; front consolidado via `parseVariacoes`/`formatVariacoesSuffix`.
- ✅ **BK-01** — `funcionarios_cpf_unique` aplicado.
- ✅ **BK-05** — payload de `save_produto_fornecedores` já passa `number` direto.

🟡 **Médio**
- **M-01** — Semântica meio × condição em `formas_pagamento` (refator de domínio).
- ✅ **M-03** — `matrizNomeMap` já está em React Query (`useQuery` em `GruposEconomicos.tsx`).
- **M-04** — Documentar/sinalizar quais blocos do Dashboard ignoram período global.
- ✅ **M-05** — Lookups de grupo/fornecedor/unidade migrados para React Query.
- **M-06** — Folha de pagamento como modal aninhado em Funcionários.
- ✅ **M-07** — `useFieldUnique` no SKU + índice único parcial em `produtos.sku`.
- ✅ **M-08** — NCM normalizado.
- ✅ **M-09** — Mensagem ajustada para "Documento já cadastrado nesta tabela".
- ✅ **SH-02** — Lookups de Produtos em React Query.
- ✅ **SH-03** — `useSocios` migrado para React Query.
- **SH-04** — Loading agregado do Dashboard.

🟢 **Baixo**
- ✅ **B-02** — `min-h-[220px]` aplicado em `DashboardSkeleton` e `LazyInViewWidget`.
- **MB-02 / MB-03 / MB-04 / MB-05** — ajustes mobile (abas sócios, intervalos parcelas, scroll-x grupos, persistência de colapso).
- ✅ **D-02** — Header desktop e mobile mostram "Atualizando…" com `fetching` do React Query.
- ✅ **D-03** — `GrupoEconomicoView` já usa `abortSignal(signal)` via `useDetailFetch`.
- **MB-01 / D-01** — resolvidos junto com C-01.

---

### Recomendação de execução (3 ondas)

**Onda A — bugs e segurança (≈4-6h)**
1. A-07 — `FiscalBlock` consumir `scope.fiscal` do `useDashboardData`.
2. BK-01 — migration `funcionarios_cpf_unique`.
3. M-09 — texto da mensagem de duplicidade.
4. A-05 — `produtoInsumoSchema` separado, remover `as never`.
5. BK-05 — passar `number` direto para `save_produto_fornecedores`.

**Onda B — schema/dados (≈1 dia)**
6. A-06 / BK-04 — migration `variacoes text[]` + backfill + remoção do dual-path.
7. M-07 — UNIQUE em `produtos.sku` + check no front via `useDocumentoUnico`.

**Onda C — refinos UX/perf (≈1 dia)**
8. SH-02 / SH-03 / M-03 / M-05 — migrar lookups para React Query.
9. SH-04 — loading agregado do Dashboard.
10. B-02 / D-02 / D-03 / MB-02..MB-05 — polimento.
11. M-01 — discutir e aprovar separação meio × condição (refator próprio).
12. M-06 — folha de pagamento como aba do ViewDrawerV2.

Posso começar pela **Onda A** se aprovado.