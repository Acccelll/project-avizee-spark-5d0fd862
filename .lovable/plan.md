## Onda 40 — Grid Grupos Econômicos (mobile)

Foco em melhorias de mobile da grid `/grupos-economicos`. Sem mudanças de schema, lógica ou backend — apenas UI/microcopy e propagação de campo já existente (`shortTitle` no `SummaryCard`, `mobileSubtitle` via coluna).

### Diagnóstico

- **KPIs truncando** (`Total de ...`, `Com Clie...`): o componente `SummaryCard` já aceita `shortTitle` (renderiza no mobile) — basta passar.
- **Card mostra `—`**: a coluna `qtd_clientes` foi corrigida na Onda 39 para "N clientes" no desktop, mas no mobile ela aparece como linha "identifier". Quando count = 0, ainda fica fraca como segunda linha. Precisamos garantir que o card mobile mostre **sempre** "N cliente(s)" com plural correto.
- **"1 registro" duplicado**: `ModulePage` recebe `count={totalRegistros}` e `AdvancedFilterBar` também → renderizam o mesmo contador duas vezes (ModulePage.tsx:107 + AdvancedFilterBar.tsx:134/212). Solução: não passar `count` para `ModulePage` quando `AdvancedFilterBar` já o exibe.
- **Paginação com 1 página**: as setas continuam visíveis (apenas `disabled`). No mobile, ocupar espaço com setas inúteis polui. O `DataTable` mobile-paginação fica em `lines 941-966`. Adicionar `singlePage` derivado e ocultar a barra inteira quando `totalPages <= 1` (e `serverPagination?.hasMore !== true`).
- **Card pobre de contexto**: além de "N clientes" como identifier, podemos colocar a observação/matriz como subtítulo via uma coluna `mobileCard` adicional renderizada no card mobile.

### Mudanças

1. **`src/pages/GruposEconomicos.tsx`**
   - Adicionar `shortTitle` aos quatro `SummaryCard`: `"Total"`, `"Ativos"`, `"Inativos"`, `"Com clientes"`.
   - Remover `count={totalRegistros}` do `ModulePage` (mantendo no `AdvancedFilterBar`) → elimina duplicação no topo.
   - Coluna `qtd_clientes`: render volta a sempre exibir "N cliente(s)" (já implementado na Onda 39); confirmar que o `mobileIdentifierKey="qtd_clientes"` continua apontando para ela — OK.
   - Nova coluna oculta no desktop, visível no card mobile, com `mobileCard: true` e `key: "contexto_mobile"`, mostrando: matriz (se houver) → primeira linha de observações → "Sem matriz definida". Reaproveita exatamente o mesmo cálculo já feito na coluna `nome` (extrair helper `getContextoSecundario(g)`).

2. **`src/components/DataTable.tsx`** (apenas a paginação mobile, lines 941-966)
   - Calcular `mobilePagerVisible = serverPagination ? (totalPages > 1 || serverPagination.hasMore) : (viewMode === 'infinite' ? sortedData.length > visibleCount : totalPages > 1)`.
   - Quando `mobilePagerVisible === false`, esconder o bloco inteiro de "X–Y de Z + setas" (a contagem global já aparece em `AdvancedFilterBar`).

3. **Microcopy**
   - Pluralização explícita: usar "1 cliente vinculado" / "N clientes vinculados" no card mobile (label do field) — adicionar `mobileLabel` opcional? Mais simples: o `render` já produz o texto certo; basta que o identifier no mobile passe a usar o mesmo render (já passa).

### Fora de escopo

- Esconder/desabilitar paginação no desktop (a queixa é mobile).
- Mensagem orientativa abaixo da lista quando há poucos registros (item 10 do feedback) — pode entrar em onda futura para evitar inflar o `DataTable`.
- Coluna "Última atualização" — campo `updated_at` não existe em `grupos_economicos` (verificado).
- Qualquer mudança em RBAC, RLS ou queries.

### Arquivos afetados

- `src/pages/GruposEconomicos.tsx` (cards `shortTitle`, remover `count` do ModulePage, coluna mobile contexto).
- `src/components/DataTable.tsx` (esconder pager mobile com 1 página).

### Verificação

- Preview mobile (390x844): quatro KPIs sem reticências; card mostra `PLUMA` + `0 clientes vinculados` + subtítulo de contexto + badge `Ativo`; só um "1 registro" no topo; sem barra de paginação no rodapé com 1 item.
