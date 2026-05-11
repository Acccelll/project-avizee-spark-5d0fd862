# Onda 42l — Grid de Orçamentos (mobile)

Escopo: apenas `src/pages/Orcamentos.tsx` + 1 helper de formatação em `src/lib/format.ts`. Sem mudanças em schema, RPC, `SummaryCard`, `DataTable`, `MobileCardList`, `AdvancedFilterBar` ou `StatusBadge`. Sem mudanças no desktop além do necessário para reusar os mesmos componentes.

## Alta prioridade

### 1. KPIs sem truncar no mobile
Usar a prop já existente `shortTitle` do `SummaryCard` (renderizada quando `useIsMobile()` é `true`):

- "Total de Orçamentos" → `shortTitle="Orçamentos"`
- "Valor Total" → `shortTitle="Valor total"`
- "Aguardando pedido" → mantém (já curto)
- "Taxa de Conversão" → `shortTitle="Conversão"`

### 2. Valor Total não pode aparecer cortado
Adicionar helper `formatCurrencyCompact(value)` em `src/lib/format.ts` usando `Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'BRL' })`. Resultado típico: `R$ 731,8 mil`, `R$ 1,2 mi`.

No card "Valor Total", usar `formatCurrencyCompact` quando `useIsMobile()` for `true` e `formatCurrency` no desktop. Manter `title` com o valor completo (o `SummaryCard` já passa `title={String(value)}` no `<p>`).

### 3. Validade visível no card mobile
Adicionar coluna virtual `mobileCard: true` para validade — render reutiliza `<ValidadeBadge>`. Hoje só `numero`, `valor_total` e `status` têm `mobileCard: true`; isso traz "Vencida / Xd restantes / data" para dentro do card sem afetar o desktop (`mobileCard` só é lido pelo `renderMobileCards`).

### 4. "Histórico" mais explícito no mobile
Quando `effectiveStatus === "historico"`, renderizar `<StatusBadge status="historico" label="Legado" />` (mantém ícone e cor; só troca o rótulo). O `title` com a explicação continua. Desktop também ganha "Legado" — alinhado com o pedido do usuário.

### 5. Ação principal mobile por status (cobrir "convertido" e "histórico")
Estender `mobilePrimaryAction`:

- `rascunho` → "Enviar para aprovação" (já existe)
- `pendente` → ação atual (Aprovar) — sem mudança
- `aprovado` → "Converter em Pedido" (já existe)
- `convertido` → novo botão `variant="outline"` "Abrir pedido" → `navigate('/pedidos?cotacao=' + o.id)` (mesma rota usada no desktop)
- `historico` → novo botão `variant="ghost"` "Visualizar" → `pushView("orcamento", o.id)`
- demais → `null` (mantém)

## Média prioridade

### 6. Filtros ativos sempre visíveis
`AdvancedFilterBar` já recebe `activeFilters` e renderiza os chips. Sem mudança de código — apenas confirmar via QA visual no mobile. Se não estiverem aparecendo, é porque `orcActiveFilters` não cobre `historico`: adicionar chip `{ key: "historico", label: "Legados", value: [historicoFilter], displayValue: historicoOptions.find(o => o.value === historicoFilter)?.label }` quando `historicoFilter !== "todos"` e tratar remoção em `handleRemoveOrcFilter` setando `setHistoricoFilter("todos")`.

### 7. Ações inline mais claras (legado não edita)
No `mobileInlineActions`, ocultar o botão "Editar" (lápis) quando `normalizeOrcamentoStatus(o.status) === "historico"` (legado não tem fluxo ativo). Manter "Ver detalhes" (olho) sempre.

## Fora de escopo

- Mudar estrutura de `MobileCardList` / `SummaryCard` / `AdvancedFilterBar`.
- Coluna de responsável/vendedor (FK não é selecionada hoje).
- Substituir paginação por scroll infinito.
- Mudar layout/composição da busca + botão de filtros (vive no `AdvancedFilterBar`, compartilhado por outras grids).
- Mudanças em desktop além das implícitas em (4) e (6).

## Arquivos alterados

- `src/lib/format.ts` — adiciona `formatCurrencyCompact`.
- `src/pages/Orcamentos.tsx` — itens 1, 2, 3, 4, 5, 6, 7.

## Validação

- `tsc` limpo.
- QA visual no mobile (375px): KPIs sem truncar, valor compacto, card mostra validade, "Legado" no badge, botões "Abrir pedido" e "Visualizar" no rodapé, chip "Legados: …" abaixo da busca quando filtro != Todos.
- Desktop: nenhuma regressão visível além do badge "Legado" (intencional).
