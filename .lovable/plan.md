# Onda 14 — Refino do grid de Produtos

Foco em revisar a tela `/produtos` segundo o feedback de UI/UX. Sem migração de stack, sem refator de queries, mantendo o pattern canônico (`ModulePage` + `AdvancedFilterBar` + `DataTable`).

Os ajustes foram organizados por prioridade. Itens de baixa prioridade (modo de densidade, hover ações rápidas, ordenação visual) ficam fora desta onda.

---

## Backend (uma migration nova)

### M1. RPC `produtos_estoque_summary`
Função SECURITY DEFINER (search_path = public) que retorna contagem global de produtos com problema de estoque, respeitando `ativo = true`:

```sql
returns table(criticos int, zerados int, abaixo_minimo int)
-- criticos: estoque_minimo > 0 AND estoque_atual <= estoque_minimo AND estoque_atual > 0
-- zerados:  estoque_atual <= 0
-- abaixo_minimo: criticos + zerados (campo derivado para o KPI)
```

Permissão: `grant execute to authenticated`. RLS dos `produtos` continua valendo via SECURITY INVOKER seria ideal — porém para count agregado SECURITY DEFINER é aceitável aqui (não vaza linhas). Comentar no SQL.

Sub-tarefa: atualizar `src/integrations/supabase/types.ts` é automático via gen.

---

## Alta prioridade

### P1. Substituir KPI "Abaixo do Mínimo (página)" por valor global
Arquivo: `src/pages/Produtos.tsx`.

- Trocar `criticos = criticosNaPagina` por chamada à RPC nova: `useQuery(['produtos','estoque-summary'], () => supabase.rpc('produtos_estoque_summary'))`.
- KPI passa a se chamar **"Abaixo do mínimo"** (sem sufixo "(página)"), valor = `abaixo_minimo` global.
- Quando o usuário clicar, aplicar `setEstoqueFilters(["critico","zerado"])` (já existe).
- Manter `criticosNaPagina` como microtexto no rodapé do `AdvancedFilterBar` ("Nesta página: 28 abaixo do mínimo") quando o KPI estiver ativo, para reforçar o que está visível.

### P2. Compactar a faixa de KPIs (mais grid, menos hero)
Arquivo: `src/pages/Produtos.tsx` (passar `density="compact"` aos `SummaryCard`).

- Os 4 cards continuam, mas usam `density="compact"` (já existe no `SummaryCard` — usado no Dashboard).
- Manter ícones, valores, ações de filtro.

### P3. Card ativo quando ele filtra a tabela
Arquivos: `src/pages/Produtos.tsx`, `src/components/SummaryCard.tsx` (nova prop `active?: boolean`).

- Adicionar `active?: boolean` no `SummaryCard` que aplica `ring-2 ring-primary/40 bg-primary/5` quando `true`.
- No Produtos, calcular `active` para "Produtos" (`tipoItemFilters[0]==='produto'`), "Insumos" (`tipoItemFilters[0]==='insumo'`), "Abaixo do mínimo" (`estoqueFilters` contém critico/zerado).
- Quando `active`, o `subtitle` muda para "Filtro ativo · clique para limpar" e o `onClick` limpa em vez de aplicar.

### P4. Coluna Produto: integrar variação/SKU/código interno
Arquivo: `src/pages/Produtos.tsx` (renderer da coluna `nome`).

- Render principal da linha:
  ```
  AGULHA DESCARTÁVEL - 100 UN
  SKU AG001 · Interno PRD000044 · Var. 13×45
  ```
- `nome` ganha mais peso (`text-sm font-medium`); abaixo, em uma linha de metadados (`text-[11px] text-muted-foreground`), aparecem SKU, código interno e a primeira variação (com `+N` se houver mais).
- Coluna "Variações" continua existindo, porém marcada `hidden: true` por padrão — o usuário pode reabrir via "Colunas" se quiser ver todas as tags. (Opcional: remover, mas hidden preserva escolha do usuário no `useDataTablePrefs`.)
- Coluna "Cód. Interno" também passa a `hidden: true` (já fica visível dentro da célula Produto).

### P5. Variações com cor neutra (não vermelha/rosa)
Arquivo: `src/pages/Produtos.tsx` (renderer atual usa `bg-primary/10 text-primary border-primary/20` — em alguns temas o `--primary` puxa para vinho, aparentando rosa/erro).

- Trocar pelo token neutro: `bg-muted text-muted-foreground border-border` (chip cinza). Variações não têm semântica positiva/negativa.
- Reservar tons quentes apenas para alertas reais (sem estoque, abaixo do mínimo, margem negativa).

### P6. Margem com estados explícitos
Arquivo: `src/pages/Produtos.tsx` (renderer de `margem`).

- Lógica atual mostra `—` quando custo=0 e `+R$ 0,00` que parece dado válido. Substituir por:
  - Custo ausente (custo=0): `<StatusBadge status="pendente" label="Sem custo" />` + microtexto cinza.
  - Venda ausente (venda=0): `<StatusBadge status="pendente" label="Sem preço" />`.
  - Custo > 0 e venda > 0:
    - margem positiva → `text-success` + valor R$ acrescido.
    - margem negativa → `text-destructive` + label "Margem negativa".
  - Suprimir o `+R$ 0,00` quando custo ou venda for 0.

### P7. Estados de estoque diferenciados na coluna
Arquivo: `src/pages/Produtos.tsx` + `situacaoEstoqueConfig`.

- Hoje "critico" e "zerado" usam o mesmo `cancelado` (vermelho). Separar:
  - `zerado` → `cancelado` (vermelho) — "Sem estoque"
  - `critico` → `pendente` (laranja) — "Abaixo do mínimo" (já existia "atencao", mas aqui o fluxo muda: critico vira laranja, atencao some como badge dedicado)
  - `atencao` → texto warning sem badge (mantém legibilidade, reduz ruído)
  - `normal` → sem badge

### P8. Ler estoque "não controla" como cinza neutro
Mesma config: quando `estoque_minimo === 0 AND estoque_atual === 0`, retornar nova situação `nao_controla` com badge cinza "Não controla" e cor neutra. Atualizar `getSituacaoEstoque` e options do filtro Estoque (`Sem estoque / Abaixo do mínimo / Em atenção / Normal / Não controla`).

---

## Média prioridade

### P9. Toolbar coesa: registros e botões na mesma linha
Arquivo: `src/components/AdvancedFilterBar.tsx` (verificar layout) + `src/pages/Produtos.tsx`.

- Hoje o `AdvancedFilterBar` mostra `count` e os botões de coluna/exportar ficam na `DataTable`, criando 2 áreas separadas. Revisar para que, em desktop, o slot de count + ações fique alinhado à direita dos filtros (mesma row).
- Investigar se o `AdvancedFilterBar` aceita `actionsSlot`. Se não, adicionar prop `rightSlot?: ReactNode` e mover Colunas/Exportar para lá em desktop. **Subordinado**: se o componente é usado em vários módulos, fazer prop opcional para não regredir.
- Adicionar botão "Limpar filtros" visível quando `prodActiveFilters.length > 0` (já existe via `onClearAll` mas precisa estar evidente — incluir na barra de chips ativos).

### P10. SKU vs Código Interno: tooltips esclarecedores
Arquivo: `src/pages/Produtos.tsx` (cabeçalhos das colunas).

- A coluna `sku` recebe `headerTooltip="SKU — código comercial (catálogo, vendas)"`.
- A coluna `codigo_interno` recebe `headerTooltip="Código Interno — sequencial do ERP (PRD/INS)"`.
- Verificar se `DataTable` suporta `headerTooltip`; se não, adicionar prop opcional na definição de coluna.

### P11. Largura priorizada
Arquivo: `src/pages/Produtos.tsx`.

- Adicionar `width: "minmax(260px, 2fr)"` (ou equivalente) na coluna `nome` para garantir mais espaço.
- Reduzir colunas numéricas (UN, Estoque, Venda, Custo, Margem, Status) com `width` menor. Verificar se `DataTable` suporta `width` nas columns; senão, propor via `className` no `<th>`.

---

## Baixa prioridade (fora desta onda)

- Modo de densidade (compacto/confortável/detalhado) — exigiria refator no `DataTable`.
- Hover quick-actions na linha — exigiria reorganizar a ColumnActions.
- Sticky header customizado (já existe parcial).
- Click duplo / clique-na-linha para abrir — atualmente já há `onView`, mantemos.

---

## Arquivos esperados
- `supabase/migrations/<ts>_produtos_estoque_summary.sql` (nova RPC).
- `src/pages/Produtos.tsx` (KPIs, coluna Produto, margem, estoque, variação, ativo card).
- `src/components/SummaryCard.tsx` (nova prop `active`).
- `src/components/AdvancedFilterBar.tsx` (prop `rightSlot` + chip "Limpar filtros" mais visível, se possível).
- `src/components/DataTable.tsx` apenas se necessário (`headerTooltip`, `width` por coluna). Se já existirem, não tocar.

## Validação
- `/produtos` em 1366×768: KPIs compactos, "Abaixo do mínimo" mostrando o total real (sem "(página)"), card ativo com ring quando filtro aplicado, coluna Produto com SKU/Interno/Variação na própria célula, badges de variação cinza, margem com estado "Sem custo/Sem preço", toolbar com Colunas/Exportar à direita.
- `/produtos` em 390×844 mobile: cards continuam compactos (já cardificados pelo Module/SummaryCard), tabela renderiza no modo mobile (já tem `mobilePrimary`/`mobileCard`).
- Sem regressão em outros módulos que usam `AdvancedFilterBar` ou `SummaryCard`.
