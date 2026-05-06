## Estado atual (auditado)

Já concluídos em rodadas anteriores: C-01, C-02, C-03, A-02, A-04, A-05, M-01, M-02, M-03, M-04, M-08, B-01, B-03 e R-01..R-04.

**Pendentes reais:**

| ID | Estado |
|----|--------|
| A-01 | Pendente — gap menu vs rota em `/admin/audit-duplicidades` |
| A-03 | Shim existe; falta validar imports e remover o duplicado |
| A-06 | Pendente — `workbook.service.ts` vs `workbookService.ts` ambíguos |
| M-05 | Pendente — `ErrorBoundary` interno preservando shell |
| M-06 | Pendente — telemetria em `componentDidCatch` (sem SDK no projeto) |
| M-07 | 5 páginas ainda em `useState` (Funcionarios, Socios, SociosParticipacoes, Transportadoras, FormasPagamento) |
| B-02 | Reordenação visual das rotas estáticas antes das dinâmicas |
| R-05/R-06/R-07 | Recomendações de longo prazo |

---

## Plano de execução

### Onda 1 — Roteamento & guards (rápido, baixo risco)

**A-01 — Alinhar guard de Auditoria de Duplicidades**
Em `src/hooks/useVisibleNavSections.ts`, ocultar o item `/admin/audit-duplicidades` quando o usuário não for `isAdmin`, mesmo que tenha `administracao:visualizar`. Mantém a rota com `PermissionRoute resource="administracao"` (já está) e fecha o gap entre menu e rota.

**B-02 — Reordenação visual de rotas**
Em `src/routes/fiscal.routes.tsx` e `src/routes/financeiro.routes.tsx`, mover rotas estáticas (`/fiscal/dashboard`, `/fiscal/distdfe-historico`, `/financeiro/budget`) para antes das dinâmicas (`/:id`, `/:id/editar`). Adicionar comentário de bloco explicando que React Router v6 resolve por especificidade, mas a ordenação visual ajuda manutenção.

---

### Onda 2 — Consolidação de services

**A-03 — Remover duplicata `pages/estoque/services/estoque.service.ts`**
1. `rg -l "pages/estoque/services/estoque"` para encontrar imports.
2. Reescrever imports para `@/services/estoque.service`.
3. Apagar `src/pages/estoque/services/estoque.service.ts` (e a pasta se ficar vazia).

**A-06 — Renomear services do Workbook**
1. Renomear `src/services/workbook.service.ts` → `src/services/workbook/workbookData.service.ts`.
2. Renomear `src/services/workbookService.ts` → `src/services/workbook/workbookGenerator.service.ts`.
3. Criar `src/services/workbook/index.ts` re-exportando ambos.
4. Atualizar os 2 imports atuais (`src/lib/workbook/fetchWorkbookData.ts`, `src/pages/WorkbookGerencial.tsx`).

---

### Onda 3 — Resiliência da UI

**M-05 — `ErrorBoundary` no `<main>` do `AppLayout`**
Em `src/components/AppLayout.tsx`, envolver `<Outlet />` (dentro de `<main>`) com um segundo `ErrorBoundary` que renderize um fallback inline (`InlineErrorState` novo, com botão "Recarregar área"). O `ErrorBoundary` mais externo continua para falhas de provider.
Adicionar prop `resetKeys={[location.pathname]}` para limpar o erro automaticamente em navegação.

**M-06 — Hook de telemetria opcional**
Em `ErrorBoundary.componentDidCatch`, manter `console.error` e adicionar chamada a `window.__lovableTrack?.('error', { error, info })` (no-op se não existir). Não introduz Sentry agora — só prepara o ponto de extensão. Comentar o gancho com TODO/integração futura.

---

### Onda 4 — M-07 nas páginas restantes

Migrar para `useUrlListState` seguindo o padrão já aplicado em Clientes/Fornecedores/Produtos/Pedidos:

1. `src/pages/Funcionarios.tsx`
2. `src/pages/Socios.tsx`
3. `src/pages/SociosParticipacoes.tsx`
4. `src/pages/Transportadoras.tsx`
5. `src/pages/FormasPagamento.tsx`

Schema típico: `{ q: string, status: stringArray, ativo: stringArray }` (ajustar por página). Substituir `searchTerm`/`setSearchTerm` e quaisquer filtros locais; trocar `onClearAll` por `clearFilters()`.

---

### Onda 5 — Recomendações estruturais (entrega como docs)

**R-05** — Criar `docs/adr/002-drawer-vs-pagina.md` registrando o contrato: Drawer para visualização/edição simples, Página para forms com itens dinâmicos e wizards. Já existe doutrina em memória; aqui formaliza como ADR.

**R-06** — Documentar no ADR a migração concluída de filtros para `useSearchParams`/`useUrlListState`.

**R-07** — Não executar (decisão de adoção de Sentry/Datadog é do usuário). Apenas documentar o ponto de extensão criado em M-06.

---

## Validação

- `npx tsc --noEmit -p tsconfig.app.json` após cada onda.
- Smoke manual: abrir `/admin/audit-duplicidades` como não-admin (ocultado), navegar `/fiscal/distdfe-historico` (label correto), forçar erro em uma página e verificar que sidebar/header sobrevivem.

## Detalhes técnicos

- `InlineErrorState` será novo componente em `src/components/InlineErrorState.tsx` — pequeno (~30 linhas), reaproveitando o mesmo design tokens do `ErrorBoundary` atual.
- Rename de services preserva `workbook` namespace; pasta `src/services/workbook/` agrega ambos.
- `useUrlListState` já tem suporte a aliases — preservaremos qualquer chave legada existente nas páginas migradas.

## Entregáveis

1. Onda 1 (A-01, B-02) — 1 commit.
2. Onda 2 (A-03, A-06) — 1 commit.
3. Onda 3 (M-05, M-06) — 1 commit.
4. Onda 4 (M-07 ×5) — 1 commit.
5. Onda 5 (R-05/R-06 ADR) — 1 commit.