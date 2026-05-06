# Correção de Preços Especiais + retomada das pendências da Onda 2

## Parte A — Por que Preços Especiais não funcionam (raiz do bug)

A tabela `precos_especiais` no banco tem as colunas:
`id, cliente_id, produto_id, preco_especial, data_inicio, data_fim, observacoes, ativo, created_at` (confirmado por introspecção).

Mas o código está dividido em duas convenções inconsistentes:

| Arquivo | Espera | Realidade no banco |
|---|---|---|
| `src/components/precos/PrecosEspeciaisTab.tsx` (CRUD) | `data_inicio`/`data_fim` | ✅ correto |
| `src/services/precosEspeciais.service.ts` | `data_inicio`/`data_fim` | ✅ correto |
| `src/services/orcamentos.service.ts` (`listPrecosEspeciaisAtuais`) | `vigencia_inicio`/`vigencia_fim` | ❌ colunas não existem |
| `src/lib/precos-especiais.ts` (regras puras) | `vigencia_inicio`/`vigencia_fim` + `desconto_percentual` | ❌ colunas não existem |
| `src/lib/precos-especiais.test.ts`, `src/tests/integration/fluxo-venda.test.ts` | idem | ❌ |

**Sintoma:** ao selecionar cliente no Orçamento, `listPrecosEspeciaisAtuais` falha a request (filtros `or(vigencia_fim.is.null,...)`) e retorna lista vazia → nenhum produto adicionado recebe preço especial → o usuário não vê efeito algum. Como o erro é engolido pelo `.then(...)` sem `catch`, nem aparece toast de erro.

Há também duplicação de lógica: `OrcamentoItemsGrid.tsx` e `OrcamentoForm.tsx` reimplementam a aplicação inline em vez de usar `aplicarPrecosEspeciaisEmLote`/`buscarRegraAplicavel` do `src/lib/precos-especiais.ts`. Por consequência, `desconto_percentual` (que não existe no banco) também não é praticado em lugar nenhum — só nos testes — e o `PrecosEspeciaisTab` só permite cadastrar **preço fixo**.

## Parte B — Correção do bug

Decisão: alinhar tudo ao schema real do banco (`data_inicio`/`data_fim`, sem `desconto_percentual`). É a opção minimalista, sem migração e sem mexer no CRUD da UI que já está correto.

### Mudanças

1. **`src/services/orcamentos.service.ts` → `listPrecosEspeciaisAtuais`**
   - Trocar `vigencia_fim` → `data_fim` e `vigencia_inicio` → `data_inicio` nos dois `.or(...)`.
   - Adicionar tratamento de erro (log + propagar para a chamada).

2. **`src/lib/precos-especiais.ts`**
   - Renomear campos da interface `RegraPrecoEspecial`: `vigencia_inicio` → `data_inicio`, `vigencia_fim` → `data_fim`.
   - Remover `desconto_percentual` da interface e de `aplicarPrecoEspecial` (não há coluna no banco). Manter apenas o caminho de preço fixo. Documentar no JSDoc que percentual ficou fora desta versão.
   - `isRegraVigente`, `buscarRegraAplicavel` e `aplicarPrecosEspeciaisEmLote` continuam, ajustando assinaturas.

3. **`src/lib/precos-especiais.test.ts`** — atualizar fixtures/expectativas para os novos nomes; remover testes de `desconto_percentual` (ou marcar `it.skip` documentando "fora de escopo até coluna existir").

4. **`src/tests/integration/fluxo-venda.test.ts`** — mesma renomeação de campos no fixture.

5. **`src/pages/OrcamentoForm.tsx` (efeito de seleção de cliente, ~L474–L500)**
   - Substituir o map manual por `aplicarPrecosEspeciaisEmLote(items, regras, new Date())` e usar `result.alterados.length > 0` para o `toast.info`.
   - Adicionar `.catch(notifyError)` à promise.

6. **`src/components/Orcamento/OrcamentoItemsGrid.tsx`**
   - No `onChange` do `produto_id` (~L161), substituir a busca manual por `buscarRegraAplicavel(precosEspeciais, value, new Date())` + `aplicarPrecoEspecial(precoBase, regra)`.
   - Idem nos pontos L306 e L396 (cálculo de exibição), centralizando via helper.

7. **`PrecosEspeciaisTab`** — sem mudanças funcionais; opcionalmente filtrar por vigência atual no listing quando `clienteId`/`produtoId` estiverem fixos (melhoria de UX, não bug). Fica fora do escopo.

### Validação

- Smoke manual: criar regra de preço em `ClienteView → Preços Especiais` para um produto X com `data_inicio=hoje`, `data_fim` em branco. Abrir um Orçamento, selecionar o cliente, adicionar produto X — `valor_unitario` precisa vir do `preco_especial`, com toast "Preço especial...".
- Trocar de cliente para um sem regra → preço deve voltar ao `preco_venda` do cadastro (atual lógica já trata via `precoBase`).
- `bunx vitest run src/lib/precos-especiais.test.ts src/tests/integration/fluxo-venda.test.ts`.
- `bunx tsc --noEmit`.

### Memória

Atualizar `mem://features/cadastros-condicoes-comerciais` (ou criar `mem://features/precos-especiais`) registrando: tabela `precos_especiais` usa `data_inicio/data_fim`, apenas preço fixo, aplicação centralizada em `src/lib/precos-especiais.ts`, nunca usar `vigencia_*`/`desconto_percentual` nessa tabela.

## Parte C — Quick wins pendentes da Onda 2 (continuar depois da Parte B)

Itens curtos identificados na revisão anterior, agrupados em uma rodada só:

1. **C-02 (resíduo)** — `src/pages/FormasPagamento.tsx:70`: trocar `tipo: "boleto_dda"` por `tipo: "boleto"` em `emptyForm` (default mais previsível; a chave `boleto_dda` continua selecionável).
2. **A-03 / BK-02 (Fornecedores)** — `src/services/fornecedores.service.ts:54`: migrar `deleteFornecedor` para soft delete (`update({ ativo: false })`) e checar dependências (pedidos de compra, lançamentos) antes de excluir, espelhando o que já foi feito em Clientes.
3. **M-09 (Fornecedores)** — `src/pages/Fornecedores.tsx:240`: trocar mensagem de duplicidade `"em outra entidade"` por `"nesta tabela"` (Clientes já foi corrigido).

Após Parte B + Parte C, atualizo `.lovable/plan.md` marcando esta rodada como concluída e listo o que ainda restou (variações `text[]`, semântica forma-vs-condição, folha de pagamento fora do modal de Funcionário, mobile patches MB-02..MB-05, D-02, D-03).

## Não escopo desta rodada

- Adicionar coluna `desconto_percentual` ou renomear para `vigencia_*` (exigiria migration + reescrita do CRUD; fica para uma onda dedicada se o produto realmente quiser desconto percentual).
- Refator semântico de `formas_pagamento` (M-01).
- Mover Folha de Pagamento para fora do modal (M-06).
- Patches mobile (MB-02..05) e dashboard (D-02, D-03).
