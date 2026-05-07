# Onda 6 — Performance, Realtime e Mobile residual (Suprimentos/Estoque/Logística)

Continuação do trabalho da Onda 5. Mantém preservação arquitetural: sem troca de stack, sem refator amplo de `useSupabaseCrud`, mudanças incrementais.

## Status de execução

- ✅ **BK-01/BK-02** `vw_estoque_posicao` reescrita com `LATERAL JOIN` + filtro `tipo IN (reserva, liberacao_reserva)` no agregado de reservado.
- ✅ **A-04/BK-05** `vw_recebimentos_consolidado` agora expõe `responsavel_id` e `responsavel_nome` (último usuário do recebimento). Hooks `useEntregas`/`useRecebimentos` consomem o novo campo.
- ✅ **SH-01/SH-02** Singleton `useLogisticaRealtime` (novo hook) montado uma vez em `Logistica.tsx`, escutando `remessas`, `remessa_eventos`, `recebimentos_compra`, `estoque_movimentos`.
- ✅ **MB-03** `EstoqueAjusteSheet`: card de preview vira `sticky top-0` em mobile, com cor variant por sinal do novo saldo.
- ✅ **MB-04** `EtiquetaSimplesPreviewDialog`: download via `a[download]` no desktop e `window.open` em iOS Safari (que ignora `download` em `blob:`).
- ⏸ **MB-05** `LogisticaRastreioSection` já não tem scroll aninhado (sem `max-h`/`overflow-auto` no template atual).
- ⏸ **A-02/M-05** Paginação server-side de `remessas` e `estoque_movimentos` — deferida (depende de refator do `useSupabaseCrud`).
- ⏸ **A-07/M-01/D-02** Unificação de hooks paralelos, decomposição de `Estoque.tsx` e remoção de `@ts-nocheck` — pendentes (não há mais `@ts-nocheck` em `services/`, mas há em outros pontos do app).

## Escopo

### Bloco 1 — Paginação server-side e consultas pesadas

**A-02 · Remessas paginadas no servidor**
- `src/pages/logistica/hooks/useRemessas.ts`: trocar `fetch` único por `useSupabaseCrud` com `pagination: "server"` (padrão já aplicado em Pedidos/NF). Manter ordenação e filtros existentes.
- `src/pages/Logistica.tsx` (aba Remessas): conectar `pageIndex`/`pageSize` ao `DataTableV2`.

**M-05 · Movimentações de estoque paginadas**
- `src/pages/estoque/hooks/useEstoqueMovimentacoes.ts`: variante paginada (mantém versão por produto não-paginada para o drawer de produto).
- `EstoqueMovimentacoesTab` recebe paginação server-side.

**BK-01/BK-02 · `vw_estoque_posicao` performática**
- Migration: reescrever a view substituindo subqueries correlacionadas por `LEFT JOIN LATERAL` agregados; garantir uso de `idx_estoque_movimentos_produto_id_created_at`.
- Validar com `EXPLAIN ANALYZE` antes/depois (registrar no PR).

### Bloco 2 — Realtime e cache cross-módulo

**SH-01/SH-02 · Singleton de canal Realtime para Logística**
- `src/hooks/useLogisticaRealtime.ts` (novo): único canal Supabase escutando `remessas`, `recebimentos_logistica`, `estoque_movimentos` — emite invalidate único por evento (`["remessas"]`, `["entregas"]`, `["estoque-posicao"]`).
- Substituir hooks `useComprasRealtime`/duplicados que assinem as mesmas tabelas no contexto de Logística.

**A-04/BK-05 · Responsável em `vw_recebimentos_consolidado`**
- Migration: adicionar JOIN com `profiles` para expor `responsavel_nome` na view.
- `src/types/logistica.ts`: campo `responsavel` deixa de ser placeholder.
- Regen automática de tipos do Supabase.

### Bloco 3 — Mobile residual

**MB-03 · Preview de saldo futuro destacado em mobile**
- `EstoqueAjusteSheet`: card de preview em `sticky top-0` no breakpoint `<md`, com cor variant por sinal (`success`/`warning`/`destructive`).

**MB-04 · Preview A4 de etiquetas mobile-friendly**
- `EtiquetaSimplesPreviewDialog`: em mobile, renderizar lista vertical de etiquetas (uma por viewport) + botão "Abrir PDF" para iOS Safari (substitui `blob:` por download direto via `a[download]`).

**MB-05 · Timeline Correios sem scroll aninhado em mobile**
- `LogisticaRastreioSection`: remover `max-h` + `overflow-auto` no breakpoint `<md`; deixar a timeline expandir e o scroll ser do drawer/página.

### Bloco 4 — Limpeza de tipagem e UX residual

- **A-07** unificar `useEntregas`/`useRemessas` que duplicam fetch da mesma tabela em `Logistica.tsx`.
- **M-01** `Estoque.tsx`: extrair seções (filtros, KPIs, tabela) em subcomponentes para reduzir tamanho do arquivo.
- **D-02** Remover `@ts-nocheck` remanescentes em `correios.service.ts` e `etiquetasSimples.service.ts`.

## Fora de escopo

- Refator do `useSupabaseCrud` em si (continua na agenda).
- Mudança visual de Logística (já padronizada na Onda 4).
- Multi-tenant em recebimentos (depende da Onda 1 de tenancy).

## Detalhes técnicos

### Migrations
1. `..._vw_estoque_posicao_otimizada.sql` — `CREATE OR REPLACE VIEW` com `LATERAL` + `SECURITY INVOKER`.
2. `..._vw_recebimentos_consolidado_responsavel.sql` — adicionar `responsavel_nome`/`responsavel_id` via JOIN com `profiles`.

### Realtime
- Canal único `logistica:global` com `postgres_changes` em 3 tabelas; cleanup no `useEffect`. Sem subscrições por linha.

### Validação pós-deploy
1. Lista de remessas com 5k+ linhas: tempo de primeira pintura < 800ms (paginação 50/página).
2. `vw_estoque_posicao` em base com 50k movimentações: < 300ms.
3. Receber compra em outra aba → grid de Estoque atualiza sozinho via Realtime (sem F5).
4. iOS Safari: preview A4 abre PDF sem tela em branco.
5. `tsc --noEmit` sem `@ts-nocheck` nos serviços listados.

## Riscos
- Mudança de view com dados em uso: rodar `CREATE OR REPLACE` (sem DROP) para preservar grants.
- Realtime singleton: garantir cleanup correto para não vazar canal entre navegações.
- Paginação server-side: validar export CSV/Excel — trocar para query "fetch all" sob demanda no botão de export.
