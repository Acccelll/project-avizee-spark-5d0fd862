## Diagnóstico (estado atual confirmado)

- `registrar_baixa_financeira` (individual): completa — insere baixa, ajusta saldo bancário, gera caixa.
- `financeiro_processar_baixa_lote`: insere baixa + UPDATE manual no lançamento, **não atualiza `contas_bancarias.saldo_atual` nem cria `caixa_movimentos`**. Falha prata-corrente: lote “fica pago” mas o banco não reflete.
- `baixar_fatura_cartao`: insere baixas item-a-item, **não toca em `contas_bancarias` nem `caixa_movimentos`** e usa coluna inexistente `valor` em `financeiro_baixas` (só existe `valor_pago`) — está quebrada.
- `financeiro_baixas` tem apenas `valor_pago`. Não há `desconto`, `juros`, `multa`, `abatimento`, `valor_movimento_bancario`, `grupo_baixa_id`.
- `BaixaParcialDialog` calcula desconto/juros/multa/abatimento mas envia tudo só em `observacoes`. O valor movimentado no banco fica errado quando há desconto/juros.
- `BaixaLoteModal` usa formas legadas (`boleto`, `cartao`, `cheque`).
- `FinanceiroLancamentoForm` permite escolher status “Pago” diretamente — pode marcar pago sem baixa.
- `cartao_fatura_para_data`: regra hoje é `dia >= fechamento → próxima fatura`. O usuário quer `dia > fechamento → próxima` (fechamento inclusivo).
- `cartao_faturas.valor_total`: gravado por `gerar_fatura_cartao`, mas inconsistente porque essa RPC ainda usa `tipo='despesa'` (que viola `chk_fin_lanc_tipo` permitindo só `pagar/receber`) — efeito colateral pré-existente.
- `Financeiro.tsx` já passa `cartoes` para `FinanceiroLancamentoForm` (item 4 já parcialmente OK), mas Fiscal/NotaFiscalEditModal ainda exibem `boleto` legado.

## Migrations (banco)

1. **`financeiro_baixas` — colunas financeiras reais**
   - `desconto`, `juros`, `multa`, `abatimento` numeric(15,2) DEFAULT 0
   - `valor_movimento_bancario` numeric(15,2) — quanto realmente entrou/saiu da conta
   - `grupo_baixa_id` uuid (FK → `financeiro_baixa_lotes`)
   - Backfill: `valor_movimento_bancario := valor_pago` em registros existentes.

2. **`financeiro_baixa_lotes`** (novo agrupador)
   - `id`, `tipo` text CHECK in (`individual`,`lote`,`fatura_cartao`,`conciliacao`), `data_pagamento`, `conta_bancaria_id`, `forma_pagamento`, `valor_total`, `cartao_fatura_id` (nullable), `observacoes`, `usuario_id`, `created_at`.
   - RLS: SELECT/INSERT por authenticated; ajustes apenas via RPC.

3. **RPC `registrar_baixa_financeira` v2** — passa a aceitar `p_desconto`, `p_juros`, `p_multa`, `p_abatimento`, `p_grupo_baixa_id` (opcional). Calcula:
   - `valor_baixado_titulo = p_valor_pago` (quanto liquida do título)
   - `valor_movimento = valor_baixado - desconto + juros + multa - abatimento`
   - Ajusta `contas_bancarias.saldo_atual` por `valor_movimento` (e não `valor_pago`).
   - `caixa_movimentos.valor = valor_movimento`.
   - Persiste todos os campos em `financeiro_baixas`.
   - Mantém assinatura antiga via DEFAULT 0 (compatível com chamadas atuais).

4. **RPC `registrar_baixa_lote_financeira`** (nova, oficial) — recebe `p_items jsonb`, `p_data_baixa`, `p_forma_pagamento`, `p_conta_bancaria_id`, `p_observacoes`. Faz:
   - Cria 1 `financeiro_baixa_lotes` (tipo `lote`).
   - Para cada item, chama `registrar_baixa_financeira` com `grupo_baixa_id` setado, garantindo que cada baixa atualize banco/caixa.
   - Bloqueia status `pago`/`cancelado`.
   - Retorna `{ grupo_id, processados, ignorados, erros }`.
   - `financeiro_processar_baixa_lote` antiga: mantida como wrapper que delega à nova (back-compat).

5. **RPC `baixar_fatura_cartao` v2**
   - Cria `financeiro_baixa_lotes` (tipo `fatura_cartao`, com `cartao_fatura_id`).
   - Para cada lançamento aberto/parcial vinculado, chama `registrar_baixa_financeira` com `grupo_baixa_id`.
   - Gera **um único** `caixa_movimentos` consolidado pelo total da fatura (e não 1 por item) — Opção A do prompt. Implementação: as baixas individuais não criam caixa; o lote insere o movimento consolidado.
   - Atualiza `cartao_faturas.status='paga'` quando todos quitados.
   - Aceita `p_forma_pagamento` (default `boleto_dda`).

6. **RPC `cartao_fatura_para_data`** — alterar `IF v_dia_lanc >= v_cartao.dia_fechamento` para `>` (fechamento inclusivo).

7. **VIEW `vw_cartao_fatura_total`** — fonte de verdade do total da fatura:
   `SELECT cartao_fatura_id, SUM(valor) FROM financeiro_lancamentos WHERE cartao_fatura_id IS NOT NULL AND ativo AND origem_tipo <> 'cartao_fatura' GROUP BY 1`
   - `cartao_faturas.valor_total` continua materializado, mas service/UI lê da view para conferência.

8. **RPC `estornar_baixa_financeira` v2** — usa `valor_movimento_bancario` (fallback `valor_pago`) para reverter banco/caixa. Quando há `grupo_baixa_id`, oferece também `estornar_grupo_baixa(p_grupo_id)`.

## Service layer (`src/services/financeiro/baixaRpc.ts`, `baixas.ts`)

- `RegistrarBaixaParams` ganha `desconto?`, `juros?`, `multa?`, `abatimento?`, `grupoBaixaId?`.
- Nova função `registrarBaixaLoteFinanceira({ items, dataBaixa, formaPagamento, contaBancariaId, observacoes })`.
- `processarBaixaLote` em `baixas.ts`: remove fallback estrutural (UPDATE+INSERT). Usa exclusivamente a nova RPC; em erro, propaga.
- Nova função `baixarFaturaCartao(faturaId, contaBancariaId, dataBaixa, formaPagamento)` aceitando forma.

## UI

### `BaixaParcialDialog.tsx`
- Envia `desconto/juros/multa/abatimento` como campos reais.
- Forma de pagamento usa `FORMA_PAGAMENTO_OPTIONS` canônicas (remove `boleto`/`cartao` legados).

### `BaixaLoteModal.tsx`
- Passa a chamar `registrarBaixaLoteFinanceira` (via `processarBaixaLote`).
- Forma de pagamento canônica.
- Bloquear seleção/processamento de itens com status `pago`/`cancelado` (filtro defensivo já no modal além do server-side).

### `FinanceiroLancamentoForm.tsx`
- Remover opção “Pago” do `Select` de status.
- Status efetivo `pago`/`parcial` exibido como badge somente leitura quando vier do banco.
- Manter “Aberto” e “Cancelado” como únicos editáveis.
- Ajustar `useFinanceiroActions.handleSubmit`: remover validações de “status pago” e remover `data_pagamento`/`conta_bancaria_id` da edição direta (continuam no fluxo de baixa).

### `CartoesCredito.tsx` — diálogo “Baixar fatura”
- Adicionar campo `forma_pagamento` (default `boleto_dda`) e `observacoes`.
- Mostrar lista de lançamentos da fatura antes de confirmar.
- Total recalculado a partir da view (display) e usado como `valor_total` do lote.

### `Fiscal.tsx` / `NotaFiscalEditModal.tsx`
- Substituir `boleto` por `boleto_dda`, manter `cartao_credito`/`cartao_debito`.
- Já existe seleção de cartão em `Fiscal.tsx` para `cartao_credito` e validação. Ajuste apenas das opções do select.

## Testes

Adicionar/atualizar em `src/services/financeiro/__tests__/`:
- `baixaIndividual.test.ts`: total, parcial, com desconto/juros/multa/abatimento, valor_movimento_bancario calculado.
- `baixaLote.test.ts`: cria grupo, atualiza banco/caixa por item, bloqueia pagos/cancelados.
- `baixaFatura.test.ts`: baixa todos lançamentos, fatura → paga, caixa consolidado único, status pago derivado.
- `formaPagamentoForm.test.ts`: `FinanceiroLancamentoForm` não permite status pago.

## Critérios de aceite

- `financeiro_baixas` armazena desconto/juros/multa/abatimento e `valor_movimento_bancario`.
- Baixa individual e lote atualizam `contas_bancarias.saldo_atual` e `caixa_movimentos`.
- Lote cria `financeiro_baixa_lotes` (1 grupo) e baixas vinculadas pelo `grupo_baixa_id`.
- Baixa de fatura: 1 grupo (`tipo=fatura_cartao`), N baixas, **1** movimento de caixa consolidado.
- Status “Pago” não aparece no select do form; derivado por trigger `trg_sync_financeiro_saldo`.
- `cartao_fatura_para_data` usa fechamento inclusivo (`>`).
- Forma de pagamento canônica em todas as telas (sem `boleto`/`cartao` legados).
- Compatibilidade preservada: chamadas antigas a `registrar_baixa_financeira` continuam funcionando (novos params com DEFAULT 0).

## Fora de escopo (registrar como dívida técnica)

- Reescrever `gerar_fatura_cartao` para usar `tipo='pagar'` em vez de `'despesa'` (viola `chk_fin_lanc_tipo`). Manter como melhoria separada para não acoplar à reforma de baixas.
- Reescrita completa da conciliação por grupo de baixa — adiciono apenas `grupo_baixa_id` como gancho; UI de conciliação por lote fica para iteração futura.
