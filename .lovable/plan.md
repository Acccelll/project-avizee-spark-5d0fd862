## Objetivo
Padronizar a coluna `variacoes` em todas as consultas de `produtos` usadas em lookups, autocompletes, listagens e exibições de item, e renderizar o sufixo de variações na UI — eliminando ambiguidade entre produtos homônimos (ex.: dois "AGULHA INOX" idênticos no autocomplete e na linha "R$ 29,99 · AGULHA INOX").

## Escopo de alterações

### 1. Services — incluir `variacoes` no SELECT
- `src/services/produtos.service.ts` → `listProdutosBasicAtivos`: adicionar `variacoes` e tipar retorno.
- `src/services/precosEspeciais.service.ts` → `listProdutosAtivosBasic`: adicionar `variacoes`.
- `src/services/pedidosCompra.service.ts` → 2 lookups (`select id, nome, codigo_interno, ...`): adicionar `variacoes`.
- `src/services/cotacoesCompra.service.ts` → `listProdutos*`: adicionar `variacoes`.
- `src/services/fiscal/manifestacao.repository.ts` → lookup `id, sku, nome`: adicionar `variacoes`.
- `src/services/importacao.service.ts` → lookup de produtos: adicionar `variacoes`.
- `src/hooks/useNotificationDetails.ts` → estoque baixo: adicionar `variacoes`.
- `src/pages/faturamento/EmitirNFeWizard.tsx` → busca de produtos no wizard: adicionar `variacoes`.
- `src/services/dashboard.service.ts` → apenas no `estMinResult` (lista exibida); contagens e agregados ficam como estão.
- `src/services/relatorios/loaders/estoque.ts` e `cadastros.ts`: adicionar `variacoes` onde a linha entra no relatório de produto.

(Selects com `select("*")` — `produtos.service.fetchProdutoDetalhes`, `estoque.service`, `orcamentos.service.listProdutosWithFornecedoresAtivos`, `ProdutoForm` — já trazem `variacoes` automaticamente; nada a mudar.)

### 2. UI — exibir sufixo de variação
- `src/components/precos/PrecosEspeciaisTab.tsx`:
  - `ProdutoOption` recebe `variacoes`.
  - No `AutocompleteSearch` de produto: `label = nome + formatVariacoesSuffix(p.variacoes)`.
  - Na linha da regra (`item.produtos?.nome`): concatenar `formatVariacoesSuffix`.
  - Atualizar `select` do `listPrecosEspeciais` para trazer `produtos(nome, sku, preco_venda, variacoes)`.
- `src/components/QuickAddProductModal.tsx`: nada a mudar (criação).
- `AutocompleteSearch` continua agnóstico — sufixo concatenado no `label` pelo chamador.
- `ProductAutocomplete` e `ItemsGrid` já tratam variações; manter.

### 3. Tipagem
- Reaproveitar `parseVariacoes`/`formatVariacoesSuffix` de `src/utils/cadastros.ts` (já existem).
- Onde houver tipagem manual de produto (`{ id; nome; sku }`), incluir `variacoes?: string | string[] | null`.

## Fora de escopo
- Migração de `variacoes` para `text[]` (item M-medio do audit, separado).
- Selects puramente agregados (counts/sum) que não exibem nome de produto.
- Edge functions e XMLs fiscais (NCM/descrição fiscal, não nome interno).

## Validação
- Abrir aba "Preços Especiais" do cliente Antonio: dois produtos "AGULHA INOX" devem aparecer com sufixo distintivo (ex.: "AGULHA INOX · 0,30mm" vs "AGULHA INOX · 0,40mm").
- `tsc --noEmit` limpo.
- Suítes existentes (`precos-especiais`, `fluxo-venda`) seguem passando.
