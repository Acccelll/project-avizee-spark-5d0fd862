---
name: Lançamento pago exige baixa
description: Trigger BEFORE UPDATE bloqueia financeiro_lancamentos.status pago/parcial sem financeiro_baixas
type: feature
---
- Trigger `trg_lancamento_status_requer_baixa` em `financeiro_lancamentos`.
- Bloqueia transição para `status='pago'` ou `'parcial'` se não houver baixa ativa em `financeiro_baixas` (estornada_em IS NULL).
- ERRCODE 23514 — único caminho para "pago" é via `financeiro_processar_baixa_lote`.
- NF à vista nasce `aberto` em `confirmar_nota_fiscal`; baixa precisa ser executada manualmente.
