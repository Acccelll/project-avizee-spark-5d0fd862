---
name: Quando Drawer, quando Página
description: Padrão único para visualizar e editar entidades (drawer V2 vs detail page vs edit page)
type: design
---

# Quando Drawer, Quando Página

**Padrão canônico**:

| Caso | Componente | Variante |
|---|---|---|
| Visualização + edição inline simples (poucos campos) | `ViewDrawerV2` | `variant="edit"` |
| Visualização cross-relacional (empilha drawers) | `ViewDrawerV2` + `pushView` | `variant="default"` |
| Form com **itens dinâmicos** (linhas, parcelas, propostas) | Página inteira (rota `/{modulo}/:id`) | — |
| Operação rápida (Entrega, Coleta) com poucos passos | `ViewDrawerV2` | `variant="operational"` |

## Regra de ouro

> Se o usuário precisa de uma **tabela editável dentro do form** (linhas
> de itens, parcelas), use **página**. Caso contrário, use **drawer V2**.

## Outliers atuais (a corrigir gradualmente)

- **Fiscal** usa `FiscalDetail` (página) para visualização, fora do padrão.
  Migrar para drawer V2 quando houver oportunidade.
- **Edição via drawer + edição via página** convivem em Orçamento/Pedido:
  drawer abre para visualizar; "Editar" navega para `/{modulo}/:id`.
  Aceitável — drawer mantém stack relacional para visualização cruzada;
  edição séria de itens vai para página.
- **Produtos** (desde C-01/MB-01/D-01): visualização via `ViewDrawerV2`
  (`pushView("produto", id)`); criação/edição em página dedicada
  `/produtos/novo` e `/produtos/:id/editar` (`src/pages/produtos/ProdutoForm.tsx`).
  Justificativa: composição e fornecedores são tabelas editáveis dentro do form.

## Regras de implementação

- Toda página de edição com itens deve ter **breadcrumb + botão "Voltar"**
  que respeita `history.back` quando vindo de drawer.
- Drawer nunca abre outro drawer modal (sheet sobre sheet) — usar
  `pushView` da `RelationalDrawerStack`.
- Form curto que cabe em uma tela mobile → drawer V2 `edit`,
  nunca página dedicada.