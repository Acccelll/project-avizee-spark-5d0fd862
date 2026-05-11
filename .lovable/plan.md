
# Onda 42p — Grid de Pedidos (clareza operacional)

Escopo: somente UI/presentational em `src/pages/Pedidos.tsx`. Sem schema, RPC, services ou cálculos. Reusa `getPrazoStatus`, `canFaturarPedido`, `verificarEstoquePedido` já existentes.

Doutrina: pedido nasce de orçamento aprovado (memória `comercial-modelo`), então **não** cria CTA "Novo Pedido"; usa atalho secundário para `/orcamentos`.

## Alta prioridade

### 1. Renomear KPI "Em Andamento" → "Aguardando faturamento"
Linhas 288–294 e 397.
- Trocar a métrica `emAndamento` por `aguardandoFat`:
  ```ts
  const aguardandoFat = filteredData.filter(o =>
    canFaturarPedido(o) // engloba aprovado/em_separacao/separado + status_faturamento aguardando|parcial
  ).length;
  ```
- Card: `title="Aguardando faturamento"`, `variation="prontos para gerar NF"`, `icon={FileOutput}`.
- Mantém o card "Atrasados" mas adiciona um 5º conceito recolhido em "Em Andamento" só se sobrar espaço — **decisão**: 4 cards continuam (Total, Valor, Aguardando faturamento, Atrasados). "Em separação / transporte" volta como filtro rápido (chip), não como KPI.

### 2. KPI "Atrasados" passa a contemplar "sem prazo" como sinal fraco
Linhas 292, 398.
- Manter contagem de atrasados como hoje (apenas `atrasado`).
- Adicionar sub-rótulo dinâmico: quando `atrasados === 0` mas existirem pedidos abertos sem `data_prometida_despacho`, mostrar `variation="N pedido(s) sem prazo definido"` em vez de "fora do prazo de despacho".
- Calcular `semPrazoCount` em `kpis` (filtra `!TERMINAL_STATUSES_PEDIDO.includes(status) && !data_prometida_despacho`).
- Tooltip no card explicando a diferença.

### 3. `PrazoBadge` "—" → "Sem prazo definido"
Linhas 70–92.
- Para `dataPrazo === null`: trocar `<span>—</span>` por chip discreto `<span className="text-xs text-muted-foreground italic">Sem prazo</span>` com `title="Sem prazo de despacho definido"`.
- Comportamento de ordenação não muda (`sortValue` já trata vazio).

### 4. Coluna número do pedido com vínculo de origem
Linhas 332–337.
- Render virá em duas linhas:
  ```
  OV000003                (font-mono, primary)
  Origem: ORC100275  (text-xs, muted, link → orçamento)
  ```
- Quando `p.po_number` existir, exibir " · PO 123" inline.
- Origem clicável dispara `pushView("orcamento", orcamentoId)` — precisamos do `id` do orçamento. **Verificar**: o select atual traz só `orcamentos(numero)`; estender para `orcamentos(id, numero)` (mudança trivial no `select`, ainda no escopo UI/data já existente). Se `orcamentos` for `null`, omite a linha.
- Em mobile, idem: `mobileIdentifierKey` continua `numero`, mas adicionamos `mobileSecondaryLabel` via render do número (o `mobileCard` já usa o `render`).

### 5. Atalho "Ver orçamentos aprovados" no header
- No `ModulePage` (linha 390), adicionar `actions={<Button variant="outline" size="sm" onClick={() => navigate("/orcamentos?status=aprovado")}>Ver orçamentos aprovados</Button>}`.
- Não criar "Novo Pedido" — pedido só nasce de orçamento.
- Verificar prop disponível em `ModulePage` (a maioria dos módulos usa `actions`/`headerActions`); se não houver, usar `extraHeader` ou colocar acima da `AdvancedFilterBar`.

### 6. Checklist de pré-requisitos antes de "Gerar NF"
`handleRequestGenerateNF` (linhas 232–243) e `ConfirmDialog` (linhas 513–537).
- Estender `verificarEstoquePedido` **não** — em vez disso, adicionar uma nova checagem leve no client antes do dialog:
  - Cliente sem `inscricao_estadual` e sem indicador de isento.
  - Pedido sem `condicao_pagamento` / `prazo_pagamento`.
  - Itens sem `ncm` (consulta ao join já existente — se não disponível, usar `verificarEstoquePedido` como já chama o backend; criar `verificarPrerequisitosNF(pedidoId)` numa **nova** util `src/utils/comercialNFChecks.ts` que faz UM SELECT enxuto: `ordens_venda` → `clientes(inscricao_estadual, indicador_ie)`, `ordens_venda_itens(produtos(ncm))`).
- Estado: `nfChecklist: { code, label }[]`. Renderizar lista no mesmo `ConfirmDialog` acima do "Gerar NF mesmo assim". Ações:
  - Se `nfChecklist.length > 0`: bloco de pendências amarelo + `confirmVariant="destructive"` `confirmLabel="Gerar NF assim mesmo"`.
  - Se `insufficientStock.length > 0`: bloco existente (vermelho).
  - Ambos podem coexistir.

### 7. Tooltip orientativo em Status × Faturamento
Coluna Status (linhas 352–355) e Faturamento (linhas 357–366).
- Wrap das `StatusBadge` em `Tooltip` (já temos `@/components/ui/tooltip`):
  - Status `aprovado` + faturamento `aguardando` → "Pedido aprovado, aguardando emissão de NF".
  - Status `aprovado` + faturamento `parcial` → "Aguardando NF complementar".
  - Status `entregue` → "Pedido entregue ao cliente".
  - Demais combinações usam mapping em uma const local `pedidoTooltipFor(p)`.

## Média prioridade

### 8. Paginação esconde quando 1 página
- `DataTable` (verificar prop). Se já houver `hidePaginationWhenEmpty`/`hidePaginationOnSinglePage`, ativar. Caso contrário, anotar como follow-up (não inventar prop).
- **Verificar antes da implementação**: ler `src/components/DataTable.tsx` e confirmar a prop. Se não existir, criar prop opcional `hideSinglePagePagination` lá (ainda escopo UI), default `false`, ativar `true` em Pedidos.

### 9. Filtros de período mais leves no mobile
- O `PeriodFilter` (linha 439) já se compacta no `AdvancedFilterBar`. Sem mudança aqui — apenas verificar memória `contrato-de-periodos`. Se a tela em mobile mostrar todos os presets em linha, validar via QA visual; ajuste é no `PeriodFilter` (fora do escopo se necessário).

### 10. Subtítulo do card-resumo / placeholder de busca
- Manter placeholder atual (já cita PO e orçamento, agora coerente com a coluna nova).
- Atualizar `subtitle` do `ModulePage` (linha 392) para incluir a regra: `"Pedidos gerados a partir de orçamentos aprovados — acompanhe o ciclo até a emissão da NF"`.

## Baixa prioridade

### 11. Microcopy
- Card "Aguardando faturamento" `variation` muda dinamicamente: `"N pronto(s) p/ NF"`.
- Empty: `"Aprove um orçamento para gerar pedido — ou ajuste os filtros."` (já parecido).

## Fora de escopo
- Mudar regra de criação de pedido (continua nascendo de orçamento).
- Alterar fluxo de cancelamento (drawer-only, Onda 42m).
- Mudar `PeriodFilter` interno.
- Persistir preferência de colunas (já temos `useDataTablePrefs`).
- Mudar RPC `gerar_nf_de_pedido`.

## Validação
- `tsc` limpo, ESLint sem novos warnings.
- KPI "Aguardando faturamento" reflete pedidos com `canFaturarPedido(p) === true`.
- "Atrasados" mostra "N sem prazo definido" quando aplicável.
- Coluna número exibe origem `ORC100275` clicável quando o pedido veio de orçamento.
- Botão "Ver orçamentos aprovados" no topo navega para `/orcamentos?status=aprovado`.
- Dialog "Gerar NF" lista pendências de cliente/condição/NCM antes da confirmação.
- Tooltips de Status/Faturamento aparecem no hover (desktop) e long-press (mobile).
- Paginação some quando há ≤1 página.
- QA visual em 375px e 1552px.
