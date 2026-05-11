
# Onda 42q — Grid de Pedidos (mobile)

Escopo: somente UI/presentational em `src/pages/Pedidos.tsx` + 1 ajuste pontual no `src/utils/comercialNFChecks.ts` se necessário (nenhum). Sem schema, RPC, services. Reaproveita `formatCurrencyCompact` (já em `src/lib/format.ts`) e o atributo `shortTitle` do `SummaryCard`.

A causa-raiz da duplicação no card é semântica: a coluna `numero` tem só `mobileCard: true` (sem `mobilePrimary`), então o `renderMobileCards` em `DataTable` usa `visibleColumns[0]` (= numero) como **primary** **e** o `mobileIdentifierKey="numero"` aponta para a mesma coluna como **identifier** — render duas vezes.

## Alta prioridade

### 1. Corrigir duplicação do `numero` no card mobile
`Pedidos.tsx` colunas:
- Adicionar `mobilePrimary: true` na coluna `cliente` e fornecer `render` mobile-friendly:
  ```tsx
  render: (p) => <span className="font-semibold text-sm truncate">{p.clientes?.nome_razao_social || "Cliente não informado"}</span>
  ```
- Manter `mobileIdentifierKey="numero"` — a coluna `numero` continua com seu render existente (`OV000003` + linha "Origem: ORC… · PO …"). Por ser identifier, aparece **uma única vez** abaixo do nome do cliente.
- Tirar `mobileCard: true` da coluna `numero` (passa a ser identifier-only no mobile).
- Manter `mobileCard: true` em `valor_total` (vira detail-field).
- Adicionar `mobileCard: true` em `prazo` (para mostrar "Despacho: …" no card).
- Ativar `mobileLabeledDetails={true}` no `<DataTable />` para renderizar `Total: R$ 768,27` e `Despacho: 10/05/2026` em formato `label: valor`.

Resultado:
```
GRANJA FARIA S.A.                    [Aprovado]  ⋮
OV000003
Origem: ORC100275 · PO 1203
Total:    R$ 768,27
Despacho: 10/05/2026         (ou "Sem prazo")

[Gerar NF]
```

### 2. Substituir ícones Eye/Pencil por menu ⋮
`Pedidos.tsx` `mobileInlineActions` (linhas 469–490).
- Trocar os dois botões ghost por um `DropdownMenu` (⋮ `MoreVertical`):
  - `Visualizar pedido` → `pushView("ordem_venda", id)`.
  - `Editar pedido` → `navigate('/pedidos/:id')`.
  - `Gerar NF` (visível apenas se `canFaturarPedido(p) && canFaturar`) → `handleRequestGenerateNF`.
  - `Ver orçamento de origem` (visível se `p.orcamentos?.id`) → `pushView("orcamento", orcamentoId)`.
- O card já delega o tap para `onView` (via `onItemClick`); o menu ⋮ vira ação secundária no canto direito (junto do `statusBadge`). Mantém `mobilePrimaryAction` "Gerar NF" como CTA full-width no rodapé.

### 3. KPIs sem truncamento + valor compacto
`Pedidos.tsx` linha 394–399.
- Adicionar `shortTitle` em cada `SummaryCard`:
  - "Total de Pedidos" → `shortTitle="Pedidos"`.
  - "Valor Total" → `shortTitle="Valor"`.
  - "Aguardando faturamento" → `shortTitle="Prontos p/ NF"`.
  - "Atrasados" → mantém (curto).
- "Valor Total": importar e usar `formatCurrencyCompact` (já existente em `src/lib/format.ts`) **apenas em mobile** (via `useIsMobile()`). Mantém `formatCurrency(kpis.totalValue)` em desktop. Pseudo:
  ```tsx
  value={isMobile ? formatCurrencyCompact(kpis.totalValue) : formatCurrency(kpis.totalValue)}
  ```
- Reduzir `variation` no card "Aguardando" para texto curto (`"prontos para gerar NF"` já é curto; manter).

### 4. KPI "Atrasados" × "Sem prazo" — separar conceitos
- Quando `atrasados > 0`: card normal "Atrasados" / `variation="fora do prazo"`.
- Quando `atrasados === 0 && semPrazo > 0`: trocar **título** para "Sem prazo" (`shortTitle="Sem prazo"`) + `value={kpis.semPrazo}` + `variation="aguardando definição"` + `variantType="warning"` (ícone `AlertTriangle`).
- Quando ambos zero: "Atrasados / 0 / no prazo".
- Evita o paradoxo "Atrasados: 0 — 1 sem prazo definido".

## Média prioridade

### 5. Placeholder de busca curto no mobile
`AdvancedFilterBar` `searchPlaceholder` atual: `"Buscar por número, PO, cliente ou orçamento..."` → fica truncado.
- Verificar se `AdvancedFilterBar` aceita `searchPlaceholderMobile`. Se sim, passar `"Buscar pedido…"`. Se não, encurtar o placeholder principal: `"Buscar pedido, cliente, PO…"`.

### 6. Ordem dos cards no mobile
- Em mobile, com `grid-cols-2`, o card "Aguardando faturamento" tem texto longo. `shortTitle` (item 3) já resolve. Manter `grid-cols-2 lg:grid-cols-4`.

### 7. Card sem repetir botão "Gerar NF" se já está no menu
- Manter `mobilePrimaryAction` (CTA full-width) — ele é o "next-step" claro. O menu ⋮ duplica intencionalmente para descoberta; aceitável.

## Baixa prioridade

### 8. Microcopy
- `Total:` → manter.
- `Despacho:` → manter (já é claro).
- Empty: já tratado (Onda 42p).

### 9. Paginação mobile
- Já estamos com `hideSinglePagePagination` (Onda 42p) — paginação some quando há ≤1 página, inclusive em mobile.

## Fora de escopo
- Mudar contrato de `mobilePrimary`/`mobileIdentifierKey` no `DataTable` (a doutrina continua: cada lista define `mobilePrimary` explicitamente).
- Avisos quando o operador toca no card e isso conflita com o swipe de "Pull to refresh".
- Persistir preferência de modo (compacto/confortável).
- Mudanças no checklist NF (Onda 42p).

## Validação
- `tsc` limpo.
- 375px: card mostra **cliente em destaque**, `OV…` apenas uma vez, "Origem: ORC… · PO …", `Total:` e `Despacho:` em formato `label: valor`, status no canto, menu ⋮ com 4 ações, CTA "Gerar NF" full-width quando aplicável.
- KPI "Pedidos / Valor / Prontos p/ NF / Atrasados (ou Sem prazo)" sem truncamento; valor em formato compacto (`R$ 768` ou `R$ 731,8 mil`).
- Dropdown ⋮ não dispara `onItemClick` (usa `e.stopPropagation()`).
- Origem clicável continua navegando para o orçamento.
- Desktop inalterado.
