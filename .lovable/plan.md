# Onda 42k — Grid de Orçamentos: clareza semântica e organização

Escopo restrito a `src/pages/Orcamentos.tsx`. Sem mudanças em schema, RPC, design system, `StatusBadge`, `AdvancedFilterBar` ou `DataTable`. Foco em microcopy, agrupamento visual e ações contextuais — nada de regra de negócio nova.

## 1. KPIs mais inequívocos (prioridade alta)

Reescrever os 4 cards para separar conceitos hoje sobrepostos ("Aprovadas" × "Convertido em pedido"):

- **Total de Orçamentos** — mantém. Subtítulo: "no período filtrado".
- **Valor Total** — mantém. Subtítulo: "soma do filtro atual".
- **Aguardando pedido** — substitui "Aprovadas". Conta `status === "aprovado"`. Subtítulo: "aprovados, ainda não convertidos".
- **Taxa de Conversão** — mantém valor, mas subtítulo passa a ser dinâmico: `"{converted} de {total} convertidos"` (ex.: "1 de 210 convertidos"). Adicionar `title` no card com a fórmula completa: "Convertidos em pedido ÷ total de orçamentos no filtro".

Manter o `kpis` memo; apenas trocar labels/variation. Sem novas queries.

## 2. Validade: estado vazio mais claro (prioridade alta)

Em `ValidadeBadge`, quando `validade` for nula:
- Se `origem === "importacao_historica"` ou `status === "historico"`: render "Legado sem validade" (`text-muted-foreground text-xs`).
- Caso contrário: "Sem validade" (`text-muted-foreground text-xs`).

Assinatura passa a receber `orc` (ou `origem`) em vez de só `validade/status`. Substituir no `render` da coluna.

## 3. Status "Histórico" com tooltip (prioridade alta)

Na célula de status, quando `effectiveStatus === "historico"`, envolver o `StatusBadge` num `<span title="Orçamento legado importado, sem fluxo comercial ativo.">`. Não muda o label exibido (mantém contrato de status).

## 4. Filtro de legados como `MultiSelect` simples (prioridade alta)

Trocar o grupo segmentado de 3 botões "Excluir legados / Apenas legados / Todos" por um `MultiSelect` single-pick (ou `Select`) com placeholder "Legados" e opções equivalentes. Ocupa menos espaço e fica visualmente equivalente aos demais filtros de Status/Validade/Cliente.

Internamente continua gravando em `filterState.historico` (mesmos valores `excluir | apenas | todos`).

## 5. Reordenar filtros em duas linhas (prioridade alta)

Dentro do `AdvancedFilterBar`, agrupar filhos em duas linhas via wrappers `<div className="flex flex-wrap gap-2 items-center">`:

- **Linha principal**: Status, Cliente, Período (`PeriodFilter`).
- **Linha secundária**: Validade, Legados.

Sem alterar o `AdvancedFilterBar` em si — apenas o markup interno passado como `children`.

## 6. Ações contextuais por status na linha (prioridade média)

`rowExtraActions` continua, mas com a regra:

- `rascunho` → botão "Enviar" (já existe, mantém).
- `pendente` → "Aprovar" (já existe).
- `aprovado` → "Converter em pedido" (já existe).
- `convertido` → novo botão `outline` "Abrir pedido" que busca `ordens_venda` por `cotacao_id` via `pushView("ordem_venda", ovId)`. Para evitar nova query por linha aqui, **versão simples**: navegar para `/pedidos?cotacao={orc.id}` e deixar a página de pedidos resolver. Sem mudar `pedidos`. (Se a rota não suportar esse filtro, fallback: `navigate("/pedidos")` com `toast.info` "Localize o pedido gerado a partir de {numero}.")

Demais botões já são condicionais (`canSendOrcamento`, `canApproveOrcamento`, `canConvertOrcamento`), então não vão aparecer simultaneamente. Sem reescrever lógica.

## 7. Microcopy menores (prioridade baixa, no mesmo passe)

- Placeholder do `MultiSelect` de Status: "Status do orçamento".
- Placeholder do `MultiSelect` de Validade: "Validade".
- `subtitle` do `ModulePage`: manter.

## Fora de escopo

- Coluna de responsável/vendedor (depende de FK ainda não consultada na query atual).
- Coluna de margem/lucro (precisaria de cálculo via itens — fora do escopo de UI).
- Modo compacto/confortável.
- Refactor de `AdvancedFilterBar`, `DataTable`, `SummaryCard` ou `StatusBadge`.
- Mudanças em mobile (`mobilePrimaryAction`, `mobileInlineActions`) — já cobertas em ondas anteriores.
- Alterações de RPC, schema ou contrato de status.

## Arquivos afetados

- `src/pages/Orcamentos.tsx` — único arquivo.
- `.lovable/plan.md` — registrar a onda.

## Validação

- `tsc --noEmit` limpo (build automática do harness).
- Conferência visual em `/orcamentos` (1552px e mobile) após approve.
