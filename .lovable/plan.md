# Plano de Execução — Onda 2: Dashboard e Cadastros

Cobre os achados C-01..C-03, A-01..A-07, M-01..M-09, BK-01..BK-05, SH-01..SH-05, B-01..B-02, D-01..D-03 e MB-01..MB-05 do laudo. Organizado em 6 ondas, das mais baratas/críticas para as estruturais.

---

## Onda 1 — Quick wins críticos e altos (≈ 2h, 1 commit)

Resolve bugs visíveis e divergências de escopo com risco baixo.

- **C-02** `FormasPagamento.tsx`: adicionar `boleto_dda: "Boleto/DDA"` ao `tipoLabel` (corrige grid e view).
- **A-07** `FiscalBlock.tsx`: trocar `ScopeBadge` para `{ kind: 'fixed-window', janela: 'mes-atual' }` para refletir `useDashboardData.INITIAL_STATE.fiscal`.
- **A-05** `Produtos.tsx`: substituir `produtoSchema.shape.preco_venda.optional().or(undefined as never)` por um `produtoInsumoSchema` derivado (`produtoSchema.extend({ preco_venda: z.number().optional() })` exportado em `src/schemas/produto.ts`).
- **M-08** `Produtos.tsx` submit: normalizar `ncm` com `.replace(/\D/g, '')` antes do payload.
- **M-09** `Clientes.tsx` + `Fornecedores.tsx`: trocar mensagem para `"Documento já cadastrado nesta tabela."`.
- **M-02** `Socios.tsx`: trocar `<Input>` de CPF por `<MaskedInput mask="cpf">`.
- **B-02** `Index.tsx`: `h-[220px]` → `min-h-[220px]` no skeleton do `LazyInViewWidget`.

Validação: `npx tsc --noEmit` + smoke manual de FormasPagamento (criar registro novo) e dashboard (badge fiscal).

---

## Onda 2 — Sócios completo (≈ 2h, 1 commit)

Fecha A-01, M-02 (já feito na Onda 1), SH-01 e prepara BK-01.

- **SH-01** `useDocumentoUnico.ts`: adicionar `"socios"` ao `DocumentoTable` e ramo de query (`.eq("cpf", digits)` em `socios`).
- **A-01** `Socios.tsx`: integrar `useDocumentoUnico("cpf", form.cpf, selected?.id, "socios")` + `isValidCpf` no submit, com erro inline análogo ao de `Funcionarios.tsx`.
- **BK-01** Migration: `ALTER TABLE socios ADD CONSTRAINT socios_cpf_unique UNIQUE (cpf);` e `funcionarios_cpf_unique` (idem). Antes de aplicar, rodar `read_query` para detectar duplicatas existentes; se houver, parar e reportar.

Validação: criar/editar sócio com CPF duplicado, verificar bloqueio em UI e em DB.

---

## Onda 3 — Filtros server-side e paginação (≈ 2-3 dias, 1 commit por módulo)

Resolve C-03, A-04 e M-05.

Para **Produtos, Clientes, Fornecedores, GruposEconomicos**:

1. Adicionar suporte a `eqFilter`/`inFilter` em `useSupabaseCrud` se ainda não houver (já existe `statusFilter`/`dateRange` — estender para genérico `inFilters: { column: string; values: string[] }[]`).
2. Trocar `paginationMode: 'all'` por `pageSize: 50` com `serverSearch` no campo principal (`nome`/`razao_social`/`sku`).
3. Mover filtros de `tipo_item`, `ativo`, `tipo_pessoa`, `grupo_economico_id` para `inFilters`/`eqFilter`.
4. Adicionar índices ausentes via migration: `produtos(ativo, tipo_item)`, `clientes(ativo, tipo_pessoa, grupo_economico_id)`, `fornecedores(ativo, tipo_pessoa)`.
5. **A-04** `GruposEconomicos.tsx`: migrar `searchTerm`/`ativoFilters` para `useUrlListState({ q, ativo })`.
6. **M-05** `Produtos.tsx`: trocar `useEffect` de `listGruposAtivos`/`listFornecedoresParaProduto`/`listUnidadesMedidaAtivas` por `useQuery` em `src/lib/queryKeys/cadastros.ts` com `staleTime: 5 * 60_000`.

Validação: testar grid com >1k registros mock, conferir requisição com `.eq`/`.in` no devtools.

---

## Onda 4 — Soft delete e proteção de FK (≈ 4h, 1 commit)

Resolve A-03 e BK-02.

- ~~`safeDelete.ts` + `clientes.service.ts` + `fornecedores.service.ts`~~ ✅
- ~~`transportadoras.service.ts` + `rh.service.ts` + páginas Transportadoras/Funcionarios~~ ✅
- Hard-delete restrito a admin via `useCanHardDelete` (parâmetro `hardDelete: true` disponível por service).

**BK-01 ✅** índices únicos parciais `socios_cpf_unique` e `funcionarios_cpf_unique` aplicados.

---

## Onda 5 — Transportadoras PF + Produtos refactor (≈ 3 dias, 2-3 commits)

### 5a. Transportadoras com tipo_pessoa (A-02) ✅

- Migration aplicada: coluna `tipo_pessoa` com `CHECK ('F','J')`, valores legados normalizados (PF/PJ → F/J), default `'J'`.
- `Transportadoras.tsx`: seletor PF/PJ no form, máscara CPF/CNPJ condicional, botão de consulta CNPJ desabilitado para PF.
- `useDocumentoUnico` agora recebe `"cpf"|"cnpj"` conforme `tipo_pessoa`.
- `transportadoraSchema` aceita CPF (11) ou CNPJ (14) com validação dígito.
- Coluna na lista mostra badge PF/PJ junto ao documento.

### 5b. Produtos em página dedicada (C-01, MB-01, D-01, ≈ 2 dias)

- Criar `src/pages/produtos/ProdutoForm.tsx` baseado em `OrcamentoForm.tsx`/`PedidoCompraForm.tsx`.
- Rotas `/produtos/novo` e `/produtos/:id/editar` em `src/routes/cadastros.routes.tsx`.
- `Produtos.tsx` lista: `openEdit`/`openNew` agora navegam para a página.
- `ViewDrawerV2` continua para visualização (cross-relacional preservado).
- Composição e Fornecedores ficam em seções da página com tabela editável full-width.
- Atualizar memória `mem://produto/quando-drawer-quando-pagina.md` com Produtos como exemplo.

### 5c. Validações Produtos (M-07, BK-05)

- **M-07 ✅** Hook genérico `useFieldUnique` criado; usado em `Produtos.tsx` para SKU. Índice único parcial `produtos_sku_unique` aplicado.
- **BK-05 ✅** `saveProdutoFornecedores` agora aceita `lead_time_dias`/`preco_compra`/`fator_conversao` como `number | null`; call site convertido (`?? null` / `?? 1`). RPC continua tolerante a tipos via `->>::`.

### 5d. Filtros server-side em listas (C-03) ✅

- **Clientes / Fornecedores / GruposEconomicos / Produtos:** dropdowns de tipo/status/grupo/tipo_item/eh_composto viajam server-side via `useSupabaseCrud.filter`.
- Casos especiais que permanecem client-side:
  - "sem_grupo" misto (NULL + UUIDs) em Clientes e Produtos.
  - Situação de estoque em Produtos (derivada em runtime de `estoque_atual` × `estoque_minimo`).
- Próximo passo opcional: paginação real (`pageSize`) com `range()` por página — adia para nova onda, exige UI de paginação no `DataTable` que hoje pagina sobre o array já carregado.

---

## Onda 6 — Estruturais médios (≈ 1-2 dias)

Limpeza final e melhorias de UX/dados. **Status:** quase tudo feito.

- ~~**BK-03** `set_principal_endereco`: confirmada via `pg_proc`, tipos já gerados, `as never` removido em `clientes.service.ts`~~ ✅ feito.
- ~~**A-06 / BK-04** `produtos.variacoes` migrado para `text[]` (migration via função auxiliar; vírgulas decimais sanitizadas para ponto). Frontend simplificado: tipo `string[] | null`, sem dual-path. `parseVariacoes` mantido como fallback para snapshots CSV antigos~~ ✅ feito.
- ~~**SH-05** `fetchClienteDetalhes` → `Promise.allSettled`~~ ✅ feito.
- ~~**SH-03** `useSocios.ts` migrar para `useQuery`~~ ✅ já estava migrado (`src/hooks/useSocios.ts`).
- ~~**SH-04 / D-02** `useDashboardData` `fetching` agregado + header "Atualizando…"~~ ✅ feito.
- ~~**D-03** `GrupoEconomicoView.tsx` `AbortSignal`~~ ✅ já existente (`abortSignal(signal)` em todas as queries).
- ~~**M-03** `GruposEconomicos.tsx` matrizNomeMap via `useQuery`~~ ✅ feito.
- ~~**M-06** Funcionários: folha já existe como aba "Folha (N)" em `FuncionarioView` dentro do drawer V2~~ ✅ feito.
- ~~**MB-04** `GrupoEconomicoView` overflow-x-auto~~ ✅ feito.
- ~~**MB-05** `MobileCollapsibleBlock` persistência via `useUserPreference`~~ ✅ feito (prop `persistKey`).
- ~~**B-01** Deletar `UnidadesMedida.tsx`~~ ✅ feito.
- ~~**M-04** Documentar em `docs/dashboard-modelo.md` escopo por bloco~~ ✅ feito.
- ~~**M-01** ADR `docs/adr/004-meio-vs-condicao-pagamento.md`~~ ✅ feito.
- ~~**MB-02** `Socios.tsx` modal: `Tabs` sticky~~ ✅ feito.
- ~~**MB-03** FormasPagamento intervalos: botões maiores~~ ✅ feito.

---

## Detalhes técnicos consolidados

```text
Migrations criadas
  - socios_cpf_unique, funcionarios_cpf_unique (Onda 2)
  - índices: produtos(ativo,tipo_item), clientes(ativo,tipo_pessoa,grupo_economico_id),
    fornecedores(ativo,tipo_pessoa) (Onda 3)
  - transportadoras.tipo_pessoa + check (Onda 5a)
  - produtos.sku unique partial (Onda 5c)
  - produtos.variacoes -> text[] + backfill (Onda 6)
  - opcional: set_principal_endereco se ausente (Onda 6)

Hooks/serviços novos
  - src/services/_shared/safeDelete.ts
  - src/hooks/useFieldUnique.ts (generaliza useDocumentoUnico)

Memórias a atualizar
  - mem://produto/quando-drawer-quando-pagina.md (Produtos como página)
  - mem://tech/usesupabasecrud-filtros-server.md (inFilters)
  - novo: mem://produto/dashboard-escopo-blocos.md
```

## Validação por onda

- `npx tsc --noEmit` ao final de cada onda.
- Smoke tests existentes (`src/test/smoke/*`) executados com `bunx vitest run`.
- Smoke manual nos fluxos afetados.
- `cloud_status` antes de cada migration.

## Sequência sugerida de aprovação

Aprovar e executar **Ondas 1 e 2** juntas (baixo risco, alto valor). Depois revisitar Ondas 3-6 individualmente, pois cada uma tem custo > 1 dia.
