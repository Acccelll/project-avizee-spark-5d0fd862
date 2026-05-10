## Onda 42g — Refino mobile do grid de Sócios

Escopo: apenas `src/pages/Socios.tsx`. Sem migração, sem alterar SummaryCard/DataTable/MobileCardList. Aproveita props já existentes (`shortTitle`, `onClick`, `active`, `mobileCard`, `mobilePrimary`).

### Alta prioridade

1. **Títulos curtos nos KPIs (sem truncar)**
   - Passar `shortTitle` aos 4 cards (`SummaryCard` já troca para ele em mobile via `useIsMobile`):
     - "Total de Sócios" → `Sócios`
     - "Ativos" → `Ativos` (sem mudança)
     - "Soma de participações" → `Participação`
     - "CPF pendente" → `CPF pend.`

2. **Linha "Participação · desde dd/mm/aaaa" no card mobile**
   - Substituir as duas colunas separadas (`percentual_participacao_atual` e `data_entrada`) por uma coluna virtual extra **só para mobile**:
     - Acrescentar coluna `{ key: "_mobile_part", label: "Participação", mobileCard: true, render: (s) => `${formatPercent(...)} · desde ${formatDate(s.data_entrada)}` ou `${formatPercent(...)} · entrada não informada` }`.
     - Marcar a coluna principal `nome` como `mobilePrimary: true`.
     - Marcar `percentual_participacao_atual` e `data_entrada` com `hidden: true` em mobile? Como `hidden` é estático, em vez disso fazer: deixar essas duas colunas **sem** `mobileCard`, garantindo que apenas `_mobile_part` apareça no card. (`renderMobileCards` só pega colunas com `mobileCard` quando há ao menos uma marcada — se houver `_mobile_part` marcada, o fallback de 3 não dispara. Validar comportamento; se necessário marcar ambas como `mobileCard: false` explicitamente — não há essa flag, então basta omitir o flag nas demais.)
   - A coluna `_mobile_part` recebe `hidden: true` para não aparecer no desktop.

3. **CPF como identifier mobile já funciona**
   - `mobileIdentifierKey="cpf"` já chama `render` da coluna CPF (que entrega badge "CPF pendente" ou CPF mascarado). Manter.

4. **KPI cards clicáveis como filtros rápidos**
   - Estado novo: `quickFilter: "all" | "ativos" | "cpf_pendente"`.
   - `Sócios` → reset (`all`).
   - `Ativos` → `ativos` (filtra `ativo === true`).
   - `CPF pend.` → `cpf_pendente` (filtra `!cpf`).
   - `Participação` → não vira filtro (não há critério natural).
   - `filteredSocios` aplica `quickFilter` antes do `search`.
   - Cada `SummaryCard` envolvido recebe `onClick` (toggle: clicar de novo volta para `all`) e `active={quickFilter === ...}` para a indicação visual já existente.

### Média prioridade

5. **Reduzir peso do badge de status no card mobile**
   - Hoje o `StatusBadge` da coluna `ativo` é entregue como `statusBadge` do `MobileCardList`. Ajustar a cor/peso do `StatusBadge` saindo do escopo (componente compartilhado). Em vez disso, no `render` da coluna `ativo` apenas para `socios`, usar `<StatusBadge status={...} size="sm" />` se a prop existir; caso contrário, manter como está (não criar variante nova).
   - Verificar via leitura rápida do `StatusBadge`. Se não houver `size="sm"`, **desistir desta sub-tarefa** para não criar variantes — registrar no plano que ficou fora.

### Fora de escopo / não fazer agora

- **Filtro/ordenação completo no header mobile** — exigiria adicionar `AdvancedFilterBar` ou novo controle ao `ModulePage`. Os atalhos via KPI (item 4) cobrem o essencial (status + CPF pendente). Ordenação fica para onda dedicada.
- **Nome em 2 linhas** — depende de mudar `MobileCardList` (componente compartilhado, regra do design system de truncamento). Não tocar agora.
- **Trocar paginação por scroll infinito / "Carregar mais"** — mudança transversal no `DataTable`, fora de escopo.
- **Reduzir padding interno do card KPI** — ajuste global de `SummaryCard`, sai do escopo da tela.

### Arquivos

- `src/pages/Socios.tsx` — `shortTitle` nos 4 cards, coluna virtual `_mobile_part`, estado `quickFilter`, `onClick`/`active` nos cards.

### Checks

- 390x844: cards KPI com títulos completos (`Sócios`, `Ativos`, `Participação`, `CPF pend.`).
- Cada card sócio mostra: Nome (primary) · CPF (identifier) · `20,00% · desde 22/04/2026`.
- Tap em "Ativos" filtra para ativos e o card fica com ring (active). Tap de novo volta ao todos.
- Tap em "CPF pend." filtra para sócios sem CPF.
- Desktop inalterado: colunas atuais permanecem visíveis; `_mobile_part` fica oculta.
- `tsc` passa.
