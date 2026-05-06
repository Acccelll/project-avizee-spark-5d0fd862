---
name: Código Interno (ERP) sequencial PRD/INS
description: Doutrina de identificação de produtos — SKU comercial (canônico) vs Código Interno sequencial PRD/INS gerado pelo backend
type: feature
---

## Conceitos

- **SKU** (`produtos.sku`): código **comercial/canônico**. Editável. Usado para busca, planilhas, equivalência com `produtos_Atualizado` e match em importações. Nunca sobrescrito por automações.
- **Código Interno** (`produtos.codigo_interno`): identificador **sequencial interno do ERP** no formato `PRD000001` (produto) ou `INS000001` (insumo). NOT NULL, UNIQUE, com CHECK regex `^(PRD|INS)[0-9]{6}$`. Read-only no formulário.
- **`codigo_interno_legado`**: preserva o valor anterior do CI quando ele era diferente do SKU (1 caso na migração: VR041 do MEDIDOR CO2).

## Geração

- Sequences: `seq_codigo_interno_produto` e `seq_codigo_interno_insumo`.
- RPC: `proximo_codigo_interno(_tipo text)` (`SECURITY DEFINER`, `search_path = public`).
- Trigger `BEFORE INSERT` `trg_produtos_codigo_interno_auto` em `public.produtos`: se `codigo_interno` vier nulo/vazio/`-`, gera via RPC conforme `tipo_item` (default `produto`).
- **Inserts no front devem enviar `codigo_interno: ""`** — o trigger preenche. Updates **nunca** devem mandar `codigo_interno` no payload.

## UI

- `Produtos.tsx`: colunas separadas "SKU" e "Cód. Interno". Default sort = `sku` ASC (prop `defaultSortKey="sku"` do `DataTable`). Campo CI no form é `readOnly disabled`.
- `DataTable`: prop `defaultSortKey?` + fallback automático `nome` ASC quando a coluna existir.
- Demais grids: ordenam por `nome` automaticamente (fallback do DataTable).

## Importadores

`useImportacaoEstoque/Faturamento`: ordem de match agora é `codigo_legado` → `codigo_interno` → `sku` (SKU como terceira chave para suportar planilhas legadas que enviavam o código que hoje vive no SKU). `listProdutosLookup` retorna `sku` no select.

## Restrições

- Não criar lógica que sobrescreva SKU automaticamente.
- Não relaxar UNIQUE/CHECK do `codigo_interno`.
- Não permitir edição manual do `codigo_interno` no UI.
