Objetivo: eliminar a repetição visual de código/SKU na listagem de Produtos mostrada no anexo, mantendo a identificação clara do item e aplicando o mesmo critério em pontos correlatos onde fizer sentido.

1. Ajustar a tabela/lista de Produtos
- Revisar a coluna “Código” em `src/pages/Produtos.tsx` para deixar explícita a hierarquia de exibição:
  - priorizar `codigo_interno` quando existir;
  - usar `sku` apenas como fallback quando não houver `codigo_interno`;
  - nunca repetir na linha secundária do nome o mesmo valor já exibido na coluna Código.
- Ajustar a coluna “Produto” para mostrar o texto secundário apenas quando ele acrescentar informação nova.
- Preservar a distinção de variações na coluna “Variações”, sem misturar esse dado no código.

2. Alinhar comportamento mobile e identificação do registro
- Revisar `mobileIdentifierKey` e os pontos de identificação do produto na mesma tela para evitar que o mobile continue privilegiando um campo vazio ou redundante.
- Ajustar o `identifier` do modal de edição para seguir a mesma prioridade visual da listagem, sem inversão entre SKU e código interno.

3. Corrigir padrões correlatos onde a duplicidade pode reaparecer
- Revisar componentes próximos ao fluxo de produto que usam fallback entre `codigo_interno` e `sku` e aplicar o mesmo critério quando houver risco de redundância visual.
- Em especial, validar os pontos já mapeados como referência de padrão:
  - `src/components/ui/ProductAutocomplete.tsx`
  - `src/components/ui/DataSelector.tsx`
  - `src/components/compras/CotacaoCompraItensTable.tsx`
  - `src/components/compras/CotacaoCompraPropostasPanel.tsx`
- Onde não houver duplicidade real, manter como está para evitar mudanças desnecessárias.

4. Validar contra o padrão existente do sistema
- Reaproveitar o critério já visto em `src/pages/Estoque.tsx`, onde o código secundário só aparece se for diferente do principal.
- Garantir consistência visual entre lista, drawer e autocompletes, para que o usuário veja sempre:
  - código principal;
  - código secundário apenas quando diferente;
  - nome e variações sem poluição.

Detalhes técnicos
- Regra de exibição proposta:
  - Código principal: `codigo_interno || sku || "—"`
  - Código secundário: mostrar `sku` somente se `sku` existir e `sku !== codigo_interno`
- Não haverá mudança de banco ou backend; é uma correção de apresentação/front-end.
- A correção será pontual, sem refatoração ampla.

Validação manual prevista
- Produto com `codigo_interno` diferente de `sku`: mostrar ambos, sem repetição.
- Produto com apenas `sku`: mostrar uma única vez.
- Produto com `codigo_interno` igual ao `sku`: mostrar uma única vez.
- Produto sem ambos: mostrar `—`.
- Conferir desktop e mobile na tela de Produtos e checar os componentes correlatos revisados.