## Drawer de Lançamentos Financeiros — Plano de melhorias

Foco: limpar dados técnicos/brutos exibidos (`[object Object]`, `cartao_credito`), corrigir truncamento ("Saldo em Aber..."), adicionar contexto temporal, melhorar segurança da exclusão e enriquecer abas Resumo, Origem e Histórico.

Escopo restrito a `src/components/financeiro/FinanceiroDrawer.tsx` + 1 helper novo. Sem mudanças em RPCs, schema, baixas, services ou banco.

### Alta prioridade

1. **Eliminar `[object Object]` em `observacoes`**
   - Criar helper `displayObservacoes(value: unknown): string` em `src/lib/displayLancamento.ts`:
     - `string` → retorna a string (filtra `"[object Object]"` → `""`).
     - `object` → tenta renderizar pares chave/valor amigáveis (ex.: `{ origem: "CP", referencia: "Manual" }` → `"Origem: Conta a Pagar\nReferência: Manual"`); fallback `JSON.stringify` formatado.
     - `null/undefined/""` → `null` (não renderiza a seção).
   - Aplicar em `Resumo > Observações` e `Histórico > Observações Internas`.
   - Mesmo tratamento aplicado a `payload.motivo` na coluna "Detalhes" da Trilha de Auditoria.

2. **Corrigir truncamento "Saldo em Aber..."**
   - Trocar label do `DrawerSummaryCard` para **"Em Aberto"** e adicionar `hint="Saldo restante"` (já suportado pelo componente).
   - Aplicar também na aba "Baixas" para manter consistência.

3. **Forma de pagamento amigável**
   - No Resumo, substituir `selected.forma_pagamento || "—"` por:
     ```ts
     FORMA_PAGAMENTO_LABELS[normalizeFormaPagamento(selected.forma_pagamento)] ?? selected.forma_pagamento ?? "—"
     ```
   - Reaproveitar `normalizeFormaPagamento` + `FORMA_PAGAMENTO_LABELS` já existentes em `src/lib/financeiro.ts`.
   - Aplicar o mesmo na coluna "Forma" da tabela de Baixas.

4. **Status temporal (chip de prazo)**
   - Reutilizar o `<PrazoChip>` recém-introduzido na grid (em `financeiroColumns.tsx`). Extrair para `src/components/financeiro/PrazoChip.tsx` para reuso.
   - No header do drawer, ao lado do `<StatusBadge>` no `badge`, renderizar também `<PrazoChip lancamento={selected} />` (Vencido, Vence hoje, Vence em N dias, Parcial). Para `pago`/`cancelado` o chip não renderiza.

5. **Proteger ação de cancelar/excluir**
   - Trocar o `runAction(() => onDelete(...))` por `useConfirmDestructive` com:
     - verb: "Cancelar"
     - entity: descrição + valor formatado
     - sideEffects: `["Lançamento sai do contas a pagar/receber", "Pode afetar relatórios e conciliações", "Caso haja baixa registrada, a ação será bloqueada — estorne antes"]`
   - Continua bloqueado por permissão `financeiro:cancelar` (já existe). Hard-delete continua via `financeiro:excluir` (regra atual mantida).

### Média prioridade

6. **Enriquecer Resumo > Identificação**
   - Adicionar abaixo de "Descrição" os campos: Documento (`numero_documento` se existir), Parcela (`X/Y` se existir), Emissão (`data_emissao` se existir), Vencimento, Competência (`competencia` se existir).
   - Usar fallback `—` quando ausente. Verificar campos disponíveis no tipo `LancamentoFinanceiro` antes de renderizar (evita TS errors — render condicional).

7. **Botão "Editar" com label em telas largas**
   - No `DrawerActionBar`, manter ícone, mas exibir texto "Editar" via `aria-label`/tooltip já presente. (Mudança mínima — `DrawerActionBar` define o layout; manter como está se exigir refactor maior). Apenas garantir tooltip explícito.

8. **Histórico — labels e responsável**
   - Mapear `e.evento` para labels amigáveis: `criacao→Criação`, `baixa→Baixa registrada`, `estorno→Estorno`, `edicao→Edição`, `cancelamento→Cancelamento`.
   - Quando `payload.user_email` ou `payload.responsavel` existir, mostrar como segunda linha em "Detalhes".
   - Padronizar timestamp com `toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })`.

9. **Origem mais explícita**
   - Adicionar campo "Módulo de origem" (derivado de `origem_tipo` via novo helper `getOrigemModulo`: fiscal_nota→"Fiscal", comercial→"Comercial", compras→"Compras", etc.).
   - Manter os `RelationalLink` já existentes.

### Baixa prioridade

10. **Tooltips/microcopy**
    - Adicionar `hint` nos `DrawerSummaryCard`: "Valor original do título" (Valor Total), "Total liquidado até hoje" (Recebido/Pago), "Saldo restante" (Em Aberto).
    - Tooltip no botão "Registrar Baixa" no header explicando que abre fluxo de baixa total/parcial.

11. **Reduzir redundância do "Registrar Baixa"**
    - Manter botão grande no topo; na aba Baixas, manter apenas no `DetailEmpty` (já está assim — confirmar).

### Detalhes técnicos

**Arquivos editados:**
- `src/lib/displayLancamento.ts` — adicionar `displayObservacoes`.
- `src/components/financeiro/PrazoChip.tsx` — extrair do `financeiroColumns.tsx` (mover, reexportar para a coluna).
- `src/pages/financeiro/config/financeiroColumns.tsx` — passar a importar `PrazoChip` do novo local.
- `src/components/financeiro/FinanceiroDrawer.tsx` — todas as mudanças de UI listadas acima.

**Arquivos não tocados:** services, RPCs, schema, hooks de baixa/estorno, tabela financeiroColumns (apenas import).

**Validação:** `tsc` clean, smoke visual no drawer (abas Resumo/Baixas/Origem/Histórico) com lançamento aberto, vencido e pago.
