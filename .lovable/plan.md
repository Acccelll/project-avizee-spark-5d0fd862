## Objetivo

1. **Notas de Entrada — filtros de Emissão e Vencimento por mês** (default: emissão = mês atual).
2. **Editar forma/condição de pagamento de notas já lançadas** propagando para o Contas a Pagar/Receber (atualiza lançamentos vinculados ou cria se ausentes).

---

## 1) Filtros de mês em Notas de Entrada

**Onde:** `src/pages/Fiscal.tsx` (rota `?tipo=entrada`) + `src/pages/fiscal/hooks/useFiscalFilters.ts`.

- Adicionar dois `MonthPicker` (mês/ano) na `AdvancedFilterBar`, exibidos somente quando `tipoParam === "entrada"`:
  - **Emissão (mês)** — default: mês atual (`new Date()`).
  - **Vencimento (mês)** — default: vazio (opcional).
- Reusar UI: `<Input type="month">` (sem dependência nova) com chip-removível na barra.
- Filtragem:
  - **Emissão**: aplicar em memória sobre `n.data_emissao` (`YYYY-MM` match).
  - **Vencimento**: requer lançamentos financeiros vinculados. Estender o `listNotasFiscais` (ou um novo helper em `fiscal.service.ts`) para trazer `min/max(data_vencimento)` agregado de `financeiro_lancamentos` via `nota_fiscal_id`. Filtrar por nota cujo conjunto de vencimentos intersecta o mês selecionado.
- Persistir os dois filtros em `useFiscalFilters` (novos estados + chips ativos + `clearAll`).
- Sincronizar com a URL via `?emissao=YYYY-MM&vencimento=YYYY-MM` (mesma convenção dos outros filtros desta tela).

> Nota: O filtro fica **somente** na visão de Entradas (conforme pedido). Saídas mantêm o comportamento atual.

---

## 2) Editar forma/condição de pagamento e refletir no Financeiro

**Backend — RPC nova (migration):**
`public.atualizar_financeiro_nota(p_nota_id uuid, p_forma_pagamento text, p_condicao text, p_parcelas jsonb)` — `SECURITY DEFINER`, `SET search_path = public`.

Comportamento idempotente:
- Lê `notas_fiscais` para obter `tipo` (entrada→`pagar`, saída→`receber`), `fornecedor_id`/`cliente_id`, `valor_total`, `numero`.
- Se já existem `financeiro_lancamentos WHERE nota_fiscal_id = p_nota_id AND ativo = true`:
  - Se a nota está **`paga/baixada`** em algum lançamento → aborta com erro orientativo (não mexe em baixados).
  - Caso contrário, **substitui** o plano: marca os antigos como `ativo=false` (auditoria) e insere o novo conjunto baseado em `p_parcelas` (ou parcela única quando `a_vista`).
- Se **não existem**, gera os lançamentos do zero (mesmo shape de `gerar_financeiro_nfe_entrada`, mas suportando `tipo='receber'` para saídas).
- Atualiza `notas_fiscais.forma_pagamento` e `condicao_pagamento`.
- Registra evento em `nota_fiscal_eventos` (tipo `edicao_financeiro`).

**Frontend — `NotaFiscalDrawer.tsx`:**
- Novo bloco "Pagamento" com botão **Editar pagamento** (só habilitado se `can('fiscal','update')` e nota não está cancelada/inativada).
- Abre um sub-modal `EditarPagamentoNotaModal` com:
  - `forma_pagamento` (Select igual ao do form atual).
  - `condicao_pagamento` (à vista / a prazo).
  - Quando "a prazo": nº parcelas + tabela editável `data_vencimento` × `valor` (reusar `parcelasPlano` de `Fiscal.tsx`).
  - Aviso de efeito colateral: "Os lançamentos atuais ainda em aberto serão substituídos." (segue mem `excluir-vs-inativar-vs-cancelar`).
- Ao confirmar, chama `supabase.rpc('atualizar_financeiro_nota', …)`, dá toast de sucesso e invalida queries de Fiscal e Financeiro.

**Service:** novo método `atualizarPagamentoNota(notaId, payload)` em `src/services/fiscal.service.ts`.

---

## Detalhes técnicos

- Adicionar coluna `chk_financeiro_lancamentos_status_para_substituicao` não é necessário; o RPC valida em runtime.
- Usar `TableRow<"financeiro_lancamentos">` / `TableInsert<"financeiro_lancamentos">` (mem `centralizacao-tipagem`).
- Manter `STATUS_VARIANT_MAP` para badges no novo modal (mem `contrato-de-status`).
- Mobile: o sub-modal vira `bottom-sheet` no breakpoint mobile (mem `comercial-mobile`).

---

## Arquivos previstos

- `supabase/migrations/<timestamp>_atualizar_financeiro_nota.sql` (nova RPC).
- `src/services/fiscal.service.ts` (helper de vencimentos agregados + `atualizarPagamentoNota`).
- `src/pages/fiscal/hooks/useFiscalFilters.ts` (filtros de mês emissão/vencimento).
- `src/pages/Fiscal.tsx` (UI dos filtros + sync URL, somente entrada).
- `src/components/fiscal/NotaFiscalDrawer.tsx` (botão Editar pagamento).
- `src/components/fiscal/EditarPagamentoNotaModal.tsx` (novo).

---

## Decisões pedidas

1. Filtro "vencimento por mês" deve cobrir **qualquer parcela** que venha a vencer no mês (intersecção) — ok?
2. Ao editar pagamento de uma NF com parcelas **parcialmente pagas**, prefere **bloquear** (proposta atual) ou **manter as pagas e substituir só as abertas**?
