---
name: Exibição de código de produto
description: Regra para exibir codigo_interno e sku sem repetir o mesmo valor em duas linhas/campos
type: preference
---

Em listas, drawers, modais e autocompletes de produto **nunca** mostrar `codigo_interno` e `sku` simultaneamente quando forem iguais.

Padrão canônico:

- **Código principal**: `codigo_interno || sku || "—"`.
- **Código secundário**: mostrar `sku` apenas quando `sku && sku !== codigo_interno`.

Aplicado em:
- `src/pages/Produtos.tsx` — coluna "Produto" só mostra SKU na 2ª linha quando difere do código exibido.
- `src/components/views/ProdutoView.tsx` — meta do header mostra Cód primeiro e SKU só se diferente.
- `src/components/estoque/EstoquePosicaoDrawer.tsx` — subtitle do drawer segue mesma regra.

Referência de "ok": `src/pages/Estoque.tsx` (linha ~715) já tinha `p.codigo_interno !== p.sku` antes de exibir CI secundário.
