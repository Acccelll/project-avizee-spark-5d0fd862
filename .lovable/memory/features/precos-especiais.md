---
name: Preços Especiais
description: Tabela precos_especiais usa data_inicio/data_fim (não vigencia_*); só preço fixo; aplicação centralizada em src/lib/precos-especiais.ts
type: feature
---

- Tabela `precos_especiais` no banco: `cliente_id, produto_id, preco_especial, data_inicio, data_fim, observacoes, ativo`. **Não existem** colunas `vigencia_inicio/vigencia_fim` nem `desconto_percentual` — qualquer query usando esses nomes falha silenciosamente.
- Cálculo e seleção de regra vigente centralizados em `src/lib/precos-especiais.ts` (`isRegraVigente`, `buscarRegraAplicavel`, `aplicarPrecoEspecial`, `aplicarPrecosEspeciaisEmLote`). Componentes consumidores (`OrcamentoForm`, `OrcamentoItemsGrid`) devem usar o helper, nunca reimplementar inline.
- Lookup server-side: `listPrecosEspeciaisAtuais(clienteId)` em `src/services/orcamentos.service.ts` filtra por `data_inicio`/`data_fim` e `ativo=true`.
- Apenas preço fixo é praticado. Se o produto pedir desconto percentual no futuro, exigirá migration adicionando coluna `desconto_percentual` + reescrita do helper e do CRUD em `PrecosEspeciaisTab`.
