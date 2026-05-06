# ADR 004 — Meio vs Condição de Pagamento

Data: 2026-05 · Status: Aceito (decisão de produto adiada)

## Contexto

A tabela `formas_pagamento` é usada hoje como **forma de pagamento**
(meio: dinheiro, pix, cartão, boleto/DDA, cheque) **e** como **condição**
(à vista vs parcelado, com `intervalo_dias` e `numero_parcelas`). O cadastro
atende ambos os usos no mesmo registro porque, na prática, a maioria dos
ERPs SMB do nicho do cliente trata "Boleto 30/60/90" como uma única opção
selecionável no pedido.

## Decisão

1. **Manter** o modelo atual (uma única tabela) por ora.
2. **Esclarecer a semântica** na UI: rótulo "Forma e condição de pagamento"
   no formulário de Orçamento/Pedido, e descrição "Meio + parcelamento" no
   módulo de cadastro.
3. **Não fazer migração de schema** (separação `meios_pagamento` ×
   `condicoes_pagamento`) sem demanda explícita do cliente — o custo de
   migração de dados históricos e a re-modelagem de relatórios fiscais não
   se justifica frente ao benefício marginal.

## Consequências

- A tabela continua heterogênea: registros como "Pix" e "Boleto 30/60/90"
  convivem.
- O campo `tipo` (dinheiro|pix|cartao|boleto_dda|cheque|outros) é a fonte
  de verdade do meio; `numero_parcelas`/`intervalo_dias` modelam a condição.
- Filtros de "forma" no módulo financeiro continuam normalizados via
  `normalizeFormaPagamento` (`src/lib/financeiro.ts`).

## Reabertura

Reabrir esta decisão se: (a) cliente exigir relatório que separe meio de
condição, (b) integração fiscal demandar separação no XML/SPED, ou (c) o
cadastro passar de ~50 linhas e virar inconveniente operacional.
