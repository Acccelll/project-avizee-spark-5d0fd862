# Onda 13 — Dashboard Mobile UI/UX

Foco em quatro problemas reais detectados no `/` em viewport <768px:
1. KPIs em carrossel horizontal causam overflow/scroll lateral.
2. Blocos colapsáveis renderizam dois cabeçalhos (o do `MobileCollapsibleBlock` + o título interno do bloco).
3. `BackToTopButton` disputa espaço visual com `MobileBottomNav` e com FABs de outras telas.
4. Lista de pendências e resumos dos accordions ainda parecem desktop em telas estreitas.

Sem mudanças de queries, RPCs, KPIs, layout customizável ou rotas.

---

## P1. Eliminar overflow horizontal dos KPIs e exceções operacionais
Arquivo: `src/pages/Index.tsx` (renderers `kpis` e `operational`).

- Trocar o carrossel `-mx-4 flex snap-x ... overflow-x-auto` por **grid 2 colunas no mobile** (`grid grid-cols-2 gap-2 sm:grid-cols-3`) para os 5 KPIs principais. Em 5 cards, fica 2/2/1.
- Para `operationalCards` (4 cards), usar `grid-cols-2 sm:grid-cols-4`.
- Remover `min-w-[78%]` / `min-w-[60%]` e classes de snap.
- `SummaryCard` mantém `density="compact"`; nenhum ajuste no componente.
- Sub-tarefa: validar visualmente no preview (1150px e 375px) que não há barra de scroll horizontal e que cada card respeita o container.

## P2. Remover cabeçalho duplicado nos blocos expandidos
Arquivos: `FinanceiroBlock.tsx`, `ComercialBlock.tsx`, `EstoqueBlock.tsx`, `LogisticaBlock.tsx`, `FiscalBlock.tsx`, `MobileCollapsibleBlock.tsx`.

- O `MobileCollapsibleBlock` já mostra ícone + título + summary + chevron na barra colapsável. Quando o bloco está aberto, o body renderiza um segundo `<h3>` com mesmo ícone/título.
- Estratégia: introduzir prop `hideInternalHeader?: boolean` (default `false`) em cada um dos 5 blocos. O `MobileCollapsibleBlock` passa `hideInternalHeader` automaticamente para os filhos via `cloneElement` ou — mais simples — recebe um novo prop `hideChildHeaderOnMobile` e o body envolve `<div className="[&>div>div:first-child:has(h3)]:md:flex [&>div>div:first-child:has(h3)]:hidden">` .
  - **Caminho preferido**: cada bloco (Financeiro/Comercial/Estoque/Logística/Fiscal) recebe a prop `hideHeaderOnMobile` e, quando `true`, renderiza `<div className="hidden md:flex ...">` no `<h3>` raiz, mantendo apenas o "Abrir módulo →" como CTA reposicionado num footer compacto. Quem decide passar o prop é `Index.tsx` (já dentro de `MobileCollapsibleBlock`, então o cabeçalho duplicado some no mobile e segue normal no desktop).
- Mantém-se o `ScopeBadge` migrado para um chip pequeno no rodapé do body do bloco, junto ao CTA, para não perder o contexto de janela.

## P3. Resumos de accordion mais informativos
Arquivo: `src/pages/Index.tsx` (apenas o argumento `summary={...}` de cada `MobileCollapsibleBlock`).

- Financeiro: `Saldo R$ 12k · 3 vencidos` (incluir contas vencidas se >0 e formatar saldo via `formatCurrency` curto).
- Comercial: `R$ X faturado · 4 pedidos · 7 orç` (priorizar faturamento do mês).
- Estoque: quando crítico → `5 críticos · R$ Yk parado`; quando ok → `1.234 ativos · R$ Yk`.
- Logística: `2 atrasadas · 5 a chegar` ou `Sem atrasos · 5 a chegar`.
- Fiscal: `3 pendentes · 12 emitidas`.
- Aumentar `max-w-[140px]` do summary para `max-w-[180px]` no `MobileCollapsibleBlock` e usar `text-right` para ficar próximo do chevron.

## P4. Reordenar blocos no mobile (sem afetar desktop)
Arquivo: `src/pages/Index.tsx`.

- Quando `isMobile`, sobrescrever a ordem de renderização para a sequência sugerida pelo usuário:
  ```
  kpis → operational → alertas → financeiro → vendas_chart → pendencias → comercial → estoque → logistica → fiscal
  ```
- Implementação: aplicar um `mobileOrder` derivado de `visibleOrder` reposicionando esses 4 blocos antes da renderização. Ainda respeitando `prefs.hidden`. Nenhuma mudança em `useDashboardLayout`.
- Pares (`grid lg:grid-cols-2`) já caem para `grid-cols-1` no mobile, então a sequência é simplesmente "um em cima do outro".

## P5. BackToTop e botões flutuantes
Arquivos: `src/components/dashboard/BackToTopButton.tsx`.

- Subir o offset para `bottom: calc(4.5rem + env(safe-area-inset-bottom))` (logo acima da `MobileBottomNav`, sem deixar gap exagerado).
- Reduzir o tamanho para `h-10 w-10` e usar `variant="outline"` com `bg-background/95 backdrop-blur` — fica menos competitivo com FABs primários (Clientes/Fornecedores usam `MobileQuickAddFAB` de 14×14 à direita; o BackToTop fica à esquerda e mais discreto).
- Aumentar `threshold` de 600 para 900 para reduzir aparições em scrolls curtos.

## P6. Header mobile: reforçar contexto
Arquivo: `src/components/dashboard/MobileDashboardHeader.tsx`.

- Acrescentar segunda linha (12px) abaixo do botão de período mostrando: `Atualizado às HH:MM` em `text-[11px] text-muted-foreground`. Hoje só aparece no `aria-label`.
- Adicionar microcopy `· toque para trocar` ao lado de `periodLabels[period]` apenas na primeira sessão (sem persistência — manter simples: sempre mostrar "· trocar" como dica visual em `text-muted-foreground`).
- Greeting block (em `Index.tsx`) já está bom — apenas reduzir `mb-3` para `mb-2` no mobile.

## P7. Lista de Pendências adaptada a mobile
Arquivo: `src/components/dashboard/PendenciasList.tsx`.

- Linha atual tem 5 elementos competindo por largura: bullet, pessoa+data+plano, valor, botão eye. Em <375px o `truncate` corta tudo.
- Refatorar a linha em layout 2-andares no mobile (md+ mantém 1 linha):
  - Linha superior: pessoa (negrito) + valor à direita.
  - Linha inferior: bullet de status + "Vencido em DD/MM" ou data + chip pequeno do plano de contas.
  - Botão "Eye" vira tap-area no card inteiro (`role="button"`, navega para `/financeiro/:id`); ícone `ChevronRight` substitui o eye no canto.
- Aumentar `min-h-[44px]` para `min-h-[56px]` no mobile, para o tap target inteiro.

## P8. Espaçamentos verticais
Arquivos: `src/pages/Index.tsx`, `src/components/dashboard/DashboardCard.tsx` (se necessário).

- `<div className="space-y-4">` que envolve as rows → `space-y-3 md:space-y-4`.
- `MobileCollapsibleBlock` body: `border-t` mantido, mas remover o duplo padding (atualmente o body do bloco usa `px-4 pt-4 pb-2` — quando `hideHeaderOnMobile=true` o `pt-4` precisa virar `pt-3`).

## Fora de escopo
- `useDashboardLayout` (ordem persistida do desktop continua intacta).
- Queries, RPCs, mudanças nos KPIs financeiros/operacionais.
- `FluxoCaixaChart` (mantém comportamento atual; mobile já mostra apenas o atalho).
- Personalização do menu (botão "Personalizar" continua só no desktop).
- Bottom nav e qualquer FAB de outras rotas.

## Arquivos esperados
- `src/pages/Index.tsx`
- `src/components/dashboard/MobileCollapsibleBlock.tsx`
- `src/components/dashboard/MobileDashboardHeader.tsx`
- `src/components/dashboard/BackToTopButton.tsx`
- `src/components/dashboard/PendenciasList.tsx`
- `src/components/dashboard/FinanceiroBlock.tsx`
- `src/components/dashboard/ComercialBlock.tsx`
- `src/components/dashboard/EstoqueBlock.tsx`
- `src/components/dashboard/LogisticaBlock.tsx`
- `src/components/dashboard/FiscalBlock.tsx`

## Validação
- Preview em 375px e 414px: nenhum scroll horizontal; cabeçalhos não duplicados; resumos legíveis; pendências com 2 andares.
- Preview em 1150px (atual): zero regressão visual nos blocos (a prop `hideHeaderOnMobile` só atua quando `isMobile`).
