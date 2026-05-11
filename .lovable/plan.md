## Escopo

Refinos de UX/UI no módulo Financeiro — Lançamentos (`src/pages/Financeiro.tsx` + `src/pages/financeiro/config/financeiroColumns.tsx` + `src/pages/financeiro/hooks/useFinanceiroFiltros.ts`). Sem mudanças em RPCs (`kpis_financeiro`), schema, RLS ou serviços de baixa/estorno. Foco: vocabulário neutro nos KPIs, criticidade visual mais clara, descrição mais escaneável, filtros reordenados e ações em lote ampliadas.

---

## Alta prioridade

### 1. Renomear KPI "Pagos" → "Baixados"
Termo neutro para tela unificada (CP+CR). Apenas label visual em `SummaryCard` — `kpis_financeiro` continua expondo `pago/total_pago`. Tooltip: "Inclui pagos (CP) e recebidos (CR) no período".

### 2. Adicionar coluna **Natureza** dedicada e renomear a atual "Tipo"
Hoje a coluna `tipo` mostra badge `Pagar/Receber` — isso é **natureza**, não categoria. Renomear o `label` para "Natureza" (key continua `tipo`). A "categoria/origem financeira" pedida pelo usuário já existe como coluna oculta `origem` (Fiscal, Comercial, Compras, Manual, etc.) — passar a exibi-la por padrão (`hidden: false`) com label "Categoria".

### 3. Reestruturar coluna "Descrição" em duas linhas
Em `financeiroColumns.tsx`, render da chave `descricao` passa a exibir:
- Linha 1: descrição principal (`displayDescricao(l)`).
- Linha 2 (subtítulo `text-[11px] text-muted-foreground`): documento + parcela + complemento curto, montado dinamicamente:
  - `NF {numero}` quando houver `nota_fiscal_id` (já vinculado) ou prefixo "NF" detectado;
  - `parcela {n}/{t}` quando `parcela_total > 1` (substitui o badge atual à direita);
  - origem curta apenas se "Categoria" estiver oculta.

### 4. Reordenar colunas para foco operacional
Nova ordem default: `Ações → Selecionar → Natureza → Pessoa → Descrição → Vencimento → Valor Total → Saldo em Aberto → Status → Forma Pgto → Categoria → Banco`. A coluna **Vencimento já existe** — apenas mover para a posição correta. `Forma Pgto`, `Categoria` e `Banco` ficam visíveis por padrão (deixar `Banco` opcional via column toggle se ficar pesado em laptop).

### 5. Chip de criticidade temporal explícito
Status hoje já recebe ênfase (vencimento em vermelho/amarelo no `data_vencimento`). Acrescentar **abaixo do StatusBadge**, na coluna `status`, um chip pequeno derivado do prazo:
- `Vencido` (destructive) quando `getEffectiveStatus = vencido`;
- `Vence hoje` (warning) quando `data_vencimento === hojeStr` e aberto;
- `≤3 dias` (warning leve) quando diferença entre 1 e 3 dias;
- `Parcial` (info) quando status efetivo = `parcial`;
- nada quando dentro do prazo confortável.

Helper local `<PrazoChip lancamento={l} />` em `financeiroColumns.tsx`. Reusa `getEffectiveStatus` já injetado.

### 6. Tornar filtro **Cartão** condicional
Hoje o `MultiSelect` de cartão aparece como linha solta quando há `cartaoOpts.length > 0`. Passar a renderizá-lo **apenas quando** `formaPagamentoFilters` incluir alguma forma de cartão (cartão de crédito/débito). Se o usuário desmarcar a forma "cartão", limpar `cartaoFilters` automaticamente. Mantém o `cartaoOpts` carregado em `useFinanceiroFiltros` — mudança puramente de visibilidade no JSX da `AdvancedFilterBar`.

---

## Média prioridade

### 7. Reordenar filtros segundo prioridade operacional
Nova ordem na `AdvancedFilterBar`: **Status → Natureza (tipo) → Banco → Forma de pagamento → Origem → (Cartão condicional)**. O "período/vencimento" já está acima (PeriodFilter + MonthFilter) — manter; apenas adicionar microcopy "Filtra por vencimento" no `PeriodFilter` (via `helpText` se a prop existir; senão tooltip).

### 8. Reduzir peso visual do botão "Baixar" por linha
Manter botão direto (operação intensiva é desejada), mas deixar mais leve:
- `variant="ghost"` em vez de `outline`;
- remover borda `border-primary/30`, manter cor `text-primary`;
- mostrar apenas ícone (`CreditCard`) com label "Baixar" em `sr-only`, e exibir o texto via tooltip ou apenas em hover (`group-hover:inline`). Mantém área clicável >32px.
Mobile (`mobilePrimaryAction`) permanece full-width como hoje.

### 9. Ampliar barra de ações em lote
Hoje existe apenas "Baixar N selecionado(s)". Quando `selectedIds.length > 0`, exibir grupo:
- **Baixar em lote** (atual);
- **Exportar selecionados** (chama `handleExportar("excel", selectedForBaixa)` — verificar se `useFinanceiroActions.handleExportar` aceita lista; se não, ajustar assinatura para aceitar `subset?: Lancamento[]`);
- **Cancelar selecionados** (PermissionGate `excluir`; abre `ConfirmDialog` único pedindo motivo, itera `cancelarLancamento`).

Fica dentro do slot `extra` do `AdvancedFilterBar`. Sem mudar serviços — usa `cancelarLancamento` já importado.

### 10. Tooltip nos toggles Lista / Calendário
Envolver com `Tooltip`:
- Lista: "Gestão operacional — baixas, edição em lote";
- Calendário: "Visão por vencimentos no mês".

### 11. Tooltips nos KPIs
`SummaryCard` já aceita `tooltip` (verificar via `code--view` — se não, adicionar prop opcional). Textos curtos: "A Vencer = abertos com vencimento futuro no período"; "Vencidos = abertos com data < hoje (independente do período)"; "Parcialmente Baixados = saldo > 0 com pelo menos uma baixa"; "Baixados = quitados no período".

---

## Baixa prioridade

### 12. Refinar espaçamento dos filtros
Reduzir `gap` entre `MultiSelect`s para `gap-2` quando >4 filtros (hoje o slot `Cartão` quebrava linha por largura). Ajustar `className="w-[180px]"` mínimos consistentes.

### 13. Contador segmentado nos KPIs
Subtítulo dos cards "A Vencer" e "Vencidos" pode mostrar split CP/CR (ex.: "12 CP · 8 CR") — depende de campos novos no RPC `kpis_financeiro`. **Pular nesta entrega** (requer migração) e registrar como follow-up.

---

## Detalhes técnicos

- **Arquivos a editar**:
  - `src/pages/Financeiro.tsx` — KPIs renomeados, filtros reordenados, cartão condicional, ações em lote, tooltips, botão baixar mais leve.
  - `src/pages/financeiro/config/financeiroColumns.tsx` — reordenar colunas, expor `origem` como "Categoria", subtítulo da descrição, `<PrazoChip />`.
  - `src/pages/financeiro/hooks/useFinanceiroActions.ts` — aceitar `subset` opcional em `handleExportar` (assinatura retro-compatível).
  - `src/pages/financeiro/hooks/useFinanceiroFiltros.ts` — possível helper para detectar formas-cartão (`isFormaCartao(forma): boolean`).
- **Componentes possivelmente ajustados**:
  - `SummaryCard` — adicionar prop opcional `tooltip` se ainda não existir (ler antes de implementar).
- **Não tocar**:
  - RPC `kpis_financeiro`, hooks de baixa (`useBaixaFinanceira`, `BaixaLoteModal`, `BaixaParcialDialog`), serviços `processarBaixaLote/processarEstorno/cancelarLancamento`, `displayDescricao`, schema/RLS.
- **Riscos**:
  - Mostrar `origem` por padrão pode aumentar largura horizontal — mitigar com badge compacto (já existe `ORIGEM_BADGE_CLASSES` enxuto).
  - Cancelar em lote: garantir loop com `Promise.allSettled` e toast resumo (`X cancelados, Y falharam`); não criar nova RPC.

## Fora de escopo

- Criar novos status no banco (ex.: `vence_hoje` como enum) — apenas chip derivado em UI.
- Refatorar `BaixaLoteModal` ou `FinanceiroDrawer`.
- Alterar a RPC `kpis_financeiro` para retornar split CP/CR.
- Mudar o calendário (`FinanceiroCalendar`).
