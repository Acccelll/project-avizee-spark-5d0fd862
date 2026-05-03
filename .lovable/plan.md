## Diagnóstico do estado atual

Boa parte da estrutura já existe — não precisamos recriar:

**Banco de dados (já implementado)**
- `cartoes_credito` — nome, banco_id, bandeira, ultimos4, limite, dia_fechamento, dia_vencimento, ativo, observacoes (RLS por admin/financeiro).
- `cartao_faturas` — cartao_id, competencia (YYYY-MM), data_abertura, data_fechamento, data_vencimento, valor_total, status (`aberta/fechada/paga/vencida`).
- `financeiro_lancamentos` já tem `cartao_id`, `cartao_fatura_id`, `parcela_numero`, `parcela_total`, e o legado `cartao TEXT`.
- `bancos.fornecedor_id` já existe (FK para fornecedores).
- RPCs prontas: `cartao_fatura_para_data(p_cartao_id, p_data)` e `gerar_fatura_cartao(p_cartao_id, p_competencia)`.

**Front-end (já implementado)**
- `/cartoes-credito` (`src/pages/CartoesCredito.tsx`) — CRUD completo no padrão V2 (DataTable, FormModal, StatusBadge, drawer de faturas).
- `src/services/cartoesCredito.service.ts` — list/create/update/inativar, `cartaoFaturaParaData`, `listFaturasPorCartao`, `gerarFaturaCartao`.
- `FinanceiroLancamentoForm` já tem campo `cartao_id` quando forma_pagamento = `cartao_credito`.
- `ContasBancarias` já permite vincular fornecedor ao banco (campo `banco_fornecedor_id` + `setBancoFornecedor`).

**Lacunas reais (o que falta)**
1. RPC `gerar_financeiro_nfe_entrada` ignora cartão/fatura — gera lançamentos sempre como `boleto_dda`, sem `cartao_id`/`cartao_fatura_id` nem recálculo do vencimento pela fatura.
2. Form de Nota Fiscal (`Fiscal.tsx`) só tem `forma_pagamento` com opções genéricas (`dinheiro/boleto/cartao/pix/transferencia`); não há `cartao_credito`, não há seleção de cartão, e o `cartao_id` não é passado para a NF nem para a RPC.
3. `notas_fiscais` não possui colunas `cartao_id` / `cartao_fatura_id` para rastreabilidade.
4. `FinanceiroLancamentoForm` quando cartão+parcelado não distribui parcelas em faturas mensais consecutivas — ainda usa `intervalo_dias`.
5. `formas_pagamento.tipo` permite `cartao` mas não diferencia crédito/débito; CHECK constraint precisa aceitar `cartao_credito` (ou usar subtipo).
6. Não há ação “Baixar fatura em lote”.
7. `ContasBancarias` permite criar banco com fornecedor opcional — falta busca por CNPJ/nome fantasia e UI dedicada de “Bancos” para edição direta (hoje só edita junto com a conta).

---

## Plano de implementação

### Fase 1 — Schema (migration única)

1. `notas_fiscais`: adicionar `cartao_id UUID REFERENCES cartoes_credito(id) ON DELETE SET NULL` e `cartao_fatura_id UUID REFERENCES cartao_faturas(id) ON DELETE SET NULL`. Índices parciais.
2. `formas_pagamento`: relaxar CHECK para incluir `cartao_credito` e `cartao_debito` (mantendo `cartao` como legado). Backfill: nada (campo descritivo, valores existentes ficam).
3. Reescrever RPC `gerar_financeiro_nfe_entrada(p_nota_id, p_duplicatas, p_forma_pagamento, p_cartao_id DEFAULT NULL)`:
   - Se `p_cartao_id` informado: para cada duplicata, chamar `cartao_fatura_para_data(p_cartao_id, vencimento_original)` → obter `fatura_id`, ler `data_vencimento` da fatura e usá-la como `data_vencimento` do lançamento. Setar `cartao_id`, `cartao_fatura_id`, `forma_pagamento='cartao_credito'`.
   - Se múltiplas parcelas e `p_cartao_id`: cada parcela vai para a fatura do mês correspondente (offset +N meses sobre a data base). Manter idempotência (`uniq_fin_lanc_nfe_parcela`).
   - Manter comportamento atual para cartão nulo.
4. Nova RPC `baixar_fatura_cartao(p_fatura_id, p_conta_bancaria_id, p_data_baixa)`:
   - Itera lançamentos `cartao_fatura_id = p_fatura_id` ainda em aberto/parcial e aplica `processar_baixa` para cada um.
   - Atualiza `cartao_faturas.status = 'paga'` se todos quitados.
   - `SECURITY DEFINER`, `search_path = public`, RLS via has_role admin/financeiro.
5. Helper SQL ou view `vw_cartao_fatura_total` — recalcula `valor_total` via `SUM(financeiro_lancamentos.valor)` (alternativa: trigger em `financeiro_lancamentos` que sincroniza `cartao_faturas.valor_total`). Usaremos trigger para evitar drift.

### Fase 2 — Helper TypeScript com testes

`src/lib/cartaoFatura.ts`:
- `calcularFaturaParaData(dataCompra, diaFechamento, diaVencimento) → { competencia, dataFechamento, dataVencimento }` (espelha lógica da RPC, usado para preview no UI sem round-trip).
- Tratar fim-de-mês (29/30/31), virada de ano, vencimento ≤ fechamento.
- `src/lib/__tests__/cartaoFatura.test.ts` cobrindo todos os casos do prompt.

### Fase 3 — Nota de Entrada (Fiscal.tsx)

1. Adicionar opção `cartao_credito` (e opcional `cartao_debito`) no `Select` de `forma_pagamento`.
2. Quando `forma_pagamento === 'cartao_credito'`:
   - Renderizar `<Select>` de cartões ativos (via `listCartoesAtivos`) — obrigatório.
   - Renderizar preview “Esta nota irá para a fatura de DD/MM/AAAA, vencendo em DD/MM/AAAA” usando `calcularFaturaParaData`.
   - Se parcelado, listar prévia das N parcelas e respectivas faturas.
3. Persistir `cartao_id` em `notas_fiscais` (campo novo).
4. No bloco de geração financeira (linhas 754-789), passar `p_cartao_id: form.cartao_id` para a RPC.

### Fase 4 — Lançamento Financeiro manual

1. Em `FinanceiroLancamentoForm.tsx`:
   - Quando `forma_pagamento === 'cartao_credito'` e `cartao_id` preenchido: chamar `cartaoFaturaParaData` (ou helper local) ao mudar `data_vencimento`/`cartao_id` e atualizar campo de vencimento + setar `cartao_fatura_id`.
   - Para parcelamento: trocar `intervalo_dias` por “1 fatura/mês”, gerando N lançamentos via lógica de offset mensal.
   - Não exigir `conta_bancaria_id` quando cartão.
2. Em `useFinanceiroActions`: ao criar lançamento de cartão, chamar `cartaoFaturaParaData` para resolver `cartao_fatura_id` antes do insert (ou trigger BEFORE INSERT no banco — preferir trigger para garantir consistência).

### Fase 5 — Bancos / Contas Bancárias

1. No form de banco em `ContasBancarias`, transformar `banco_fornecedor_id` em **obrigatório** para novos bancos; manter opcional para legados.
2. Trocar o `Select` simples por um combobox com busca por nome/razão/fantasia/CNPJ (reutilizar padrão de `ClienteCombobox` se existir; senão usar `Command` do shadcn).
3. Backfill suave (script idempotente, NÃO migration destrutiva): tentar match `bancos.nome` ↔ `fornecedores.nome_fantasia/razao_social` ou CNPJ — gerar relatório de pendências (sem auto-criar fornecedor).

### Fase 6 — Faturas: drawer e baixa em lote

1. Em `CartoesCredito.tsx`, no drawer de detalhes, listar faturas com lançamentos vinculados e botão **“Baixar fatura”** (chama `baixar_fatura_cartao`, abre dialog para escolher conta bancária + data).
2. Adicionar nova rota/aba opcional `/cartoes-credito/faturas` (ou só dentro do drawer) com filtro por cartão/competência/status.

### Fase 7 — Testes

- Unit: `cartaoFatura.test.ts` (8 cenários: antes/no/depois fechamento; vencimento mês seguinte; dias 29/30/31; virada dez→jan).
- Integração SQL: testar RPC `gerar_financeiro_nfe_entrada` com cartão (1 parcela e 3 parcelas) + RPC `baixar_fatura_cartao`.
- Smoke: criar cartão → criar NF entrada com cartão parcelada 3x → validar 3 lançamentos com vencimentos das 3 faturas distintas → baixar fatura → todos lançamentos pagos.

---

## Detalhes técnicos

```text
NF de entrada (forma_pagamento=cartao_credito, cartao=X)
        │
        ▼
gerar_financeiro_nfe_entrada(nota, duplicatas, 'cartao_credito', cartao_id)
        │
        ├─ p/ cada duplicata i:
        │     fatura_id := cartao_fatura_para_data(cartao_id, vcto_orig + (i-1) mês)
        │     vcto      := cartao_faturas.data_vencimento WHERE id = fatura_id
        │     INSERT financeiro_lancamentos(cartao_id, cartao_fatura_id, vcto, …)
        ▼
trigger trg_sync_cartao_fatura_total → recalcula cartao_faturas.valor_total
```

**Campos novos em `notas_fiscais`**: `cartao_id`, `cartao_fatura_id` (para NF à vista; em parcelada cada parcela carrega seu próprio fatura_id no lançamento).

**Backward compat**: campo `cartao TEXT` preservado em `financeiro_lancamentos`; novos lançamentos gravam apenas `cartao_id`.

**Segurança**: novas RPCs com `SECURITY DEFINER` + `SET search_path = public`, e validação de `has_role(admin|financeiro)` no início.

---

## Pontos a validar com o usuário

1. **Fatura como agrupador puro**: confirmar que NÃO criaremos um lançamento separado representando a fatura no Contas a Pagar (só os lançamentos individuais). Baixa é em lote.
2. **Cartão de Débito**: criar agora ou ignorar? Sugestão: incluir o valor no CHECK mas sem comportamento especial (gera lançamento normal).
3. **Backfill de bancos↔fornecedores**: rodar matching automático por CNPJ ou só apresentar relatório de pendências?
4. **Trigger de `valor_total` da fatura**: posso adicionar trigger em `financeiro_lancamentos` (insert/update/delete) para sincronizar — ok?

Posso prosseguir com a implementação após aprovação.