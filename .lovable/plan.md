## Objetivo
Reduzir ruído visual e tornar o primeiro scroll do Dashboard objetivo (“o que exige minha atenção agora?”), mantendo o stack atual (React + Tailwind + Recharts + provider único de período).

Escopo: somente camada de apresentação (`src/pages/Index.tsx`, `src/components/dashboard/*`, `src/contexts/DashboardPeriodContext.tsx`). Nada de regra de negócio, RPC ou schema.

---

## Prioridade Alta

### P1. Período: provider único e rótulo explícito
- Remover o `<DashboardPeriodProvider>` duplicado em `src/pages/Index.tsx` (o `AppLayout` já monta `GlobalPeriodProvider`, que é alias).
- `Index.tsx` passa a exportar diretamente `DashboardContent` (ou renomear para `Dashboard`).
- No mobile, manter **apenas** o `MobileDashboardHeader` (com seletor de período + refresh) e **esconder** o `GlobalPeriodChip` quando a rota for `/` (raiz Dashboard). O chip continua sendo a fonte global nas demais rotas.
- Ajustar `DashboardHeader.tsx`: o texto do topo deixa de dizer “Últimos 30 dias: 08 abr – 08 mai” e passa a “**Período base** · 08 abr – 08 mai” com tooltip “Aplicado aos blocos sensíveis ao período. Estoque e Fiscal seguem janelas próprias.”
- `ScopeBadge` ganha variante `subtle` (texto cinza, sem fundo), usada nos blocos cuja janela = período base; janelas divergentes (`snapshot`, `fixed-window`) mantêm o badge atual.

### P2. Linhas pareadas sem esticar
- Em `Index.tsx`, na renderização das `rows.pair`:
  ```
  className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start"
  ```
- Remover `h-full`/`flex-1` do `QuickActions`, `EstoqueBlock` e `LogisticaBlock` quando renderizados em par (cada bloco define sua própria altura intrínseca).

### P3. `QuickActions` compacto
- Reduzir para grid 3×2 com botões ~64px de altura, padding menor e título dentro do header.
- Manter visível no desktop, mas com `lg:max-w-sm` quando pareado com o Financeiro — Financeiro ocupa a coluna larga do par via `lg:grid-cols-[2fr_1fr]` na linha `finRow`.

### P4. Estado vazio inteligente do Estoque
Quando `itensBaixoMinimo.length === 0`, renderizar versão compacta:
- KPIs já existentes (Produtos ativos, Valor em estoque).
- Lista substituída por linha única em verde: “Estoque dentro dos níveis mínimos.”
- Footer com até 3 mini-stats opcionais (já calculáveis a partir de `stats`): produtos ativos, sem custo, sem mínimo configurado. Se algum dado não estiver disponível ainda, omitir o stat (sem placeholder).
- Card encolhe naturalmente (sem `flex-1` na seção da lista).

### P5. Reordenar pesos visuais
Nova ordem default em `useDashboardLayout` (apenas `defaultOrder`, sem migração — usuários que customizaram seguem com seu layout):

```text
kpis
operational
alertas
financeiro + acoes_rapidas       (linha 2fr/1fr)
pendencias + fiscal              (linha pareada — operacional acionável)
comercial + estoque              (linha pareada)
logistica + vendas_chart         (linha pareada)
```

Pendências sobe acima do gráfico de vendas; Fiscal ganha companhia de Pendências (operacional acionável). Manter os pares no `PAIR_GROUPS`.

---

## Prioridade Média

### P6. Gráfico financeiro mais legível
`FluxoCaixaChart` (embedded) ganha:
- Toggle “Realizado / Previsto” (default: Realizado = Recebido vs Pago).
- Cabeçalho com mini-resumo: “Realizado no período · +R$ X recebidos · −R$ Y pagos · Saldo R$ Z”.
- Eixo X com `tickFormatter` curto (`dd/MM`) e `interval="preserveStartEnd"`.
- Aumentar altura para `h-[240px]` e `margin={{ top: 16, right: 8, left: 0, bottom: 0 }}`.

### P7. `VendasChart` — sempre 6 meses + cabeçalho com total
- Pré-preencher os 6 meses (atual + 5 anteriores) com 0 quando ausentes em `monthMap`.
- Cabeçalho: “Faturamento — últimos 6 meses · Total: R$ X · Melhor mês: abr/26”.
- `<LabelList>` no topo das barras (formatado em `R$ Xk`) quando largura ≥ md.
- Destacar mês atual (fill `hsl(var(--primary))`, demais `hsl(var(--primary)/0.5)`) via `Cell`.

### P8. Alertas por severidade
`AlertStrip` evolui para:
- Agrupar em três níveis: **Crítico** (vencidos, saldo negativo, certificado a vencer), **Atenção** (notas pendentes, compras atrasadas, remessas atrasadas), **Informativo** (sem alerta).
- Receber novos props vindos de `useDashboardData` que já existem (`comprasAtrasadasCount`, `remessasAtrasadas`, `saldoProjetado`). Incluir certificado **somente** se já houver fonte exposta no `stats`; caso contrário, omitir (não inventar dado).
- Quando há ao menos 1 alerta crítico, faixa muda para fundo `bg-destructive/5` + borda `border-destructive/30`; senão segue neutra.

---

## Prioridade Baixa

### P9. Refinos
- Skeleton específico para Financeiro (KPIs + barra cinza no lugar do gráfico) e para Estoque/Logística (header + 3 linhas).
- Microcopy do greeting: omitir frase “Sem vencimentos para hoje.” quando também não há backlog (evita linha redundante).
- Tooltip do `ScopeBadge` revisado para distinguir “Período base” × “Janela fixa” × “Snapshot” em uma frase.

---

## Detalhes técnicos por arquivo

- `src/contexts/DashboardPeriodContext.tsx` — sem mudanças funcionais; apenas garantir que continua sendo o único provider montado (via `AppLayout`).
- `src/pages/Index.tsx`
  - Remover wrapper `Dashboard = () => <Provider>...`. Exportar `Dashboard` direto.
  - Ajustar grid das linhas pareadas (`items-start`) e adicionar exceção `lg:grid-cols-[2fr_1fr]` quando `row.key === 'pair-financeiro-acoes_rapidas'`.
  - Ajustar `defaultOrder` em `useDashboardLayout` (mantendo `WidgetId` existente).
- `src/components/AppLayout.tsx` — sem mudança (provider já está aqui).
- `src/components/navigation/GlobalPeriodChip.tsx` — aceitar prop `hideOnRoutes?: string[]` ou usar `useLocation` para esconder em `/`.
- `src/components/dashboard/DashboardHeader.tsx` — texto “Período base”, badge sutil.
- `src/components/dashboard/ScopeBadge.tsx` — adicionar `variant: 'default' | 'subtle'`.
- `src/components/dashboard/QuickActions.tsx` — densidade reduzida, sem `h-full`.
- `src/components/dashboard/EstoqueBlock.tsx` — branch compacto quando vazio; remover `flex-1` da seção da lista.
- `src/components/dashboard/LogisticaBlock.tsx` — idem (compacto sem alertas).
- `src/components/dashboard/AlertStrip.tsx` — receber novos props, agrupar por severidade, mudar visual quando crítico.
- `src/components/dashboard/FluxoCaixaChart.tsx` — toggle, cabeçalho, eixo, altura.
- `src/components/dashboard/VendasChart.tsx` — preencher 6 meses, total, label nas barras, destaque mês atual.
- `docs/dashboard-modelo.md` — atualizar tabela e regra do badge sutil.

---

## Fora de escopo

- Não alterar queries/`useDashboardData`, RPCs nem cálculo de KPIs.
- Não migrar layout salvo dos usuários (apenas `defaultOrder`).
- Não criar novos widgets nem novas fontes de dados.
- Sem mexer em rotas, autenticação ou mobile fora do Dashboard.

---

## Validação
- Smoke test existente (`src/test/smoke/dashboard.smoke.test.tsx`) deve continuar passando.
- Conferir manualmente: desktop largo, mobile (390×844), modo customizado de layout reorganizado pelo usuário (par quebrado vira full-width, comportamento já implementado).
