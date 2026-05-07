# Onda 5 — Suprimentos, Estoque e Logística

Plano focado em **integridade de dados** e **segurança**. Não inclui refatorações amplas (paginação server-side, singleton realtime, regen de tipos massivo) — esses ficam para onda dedicada para preservar arquitetura.

## Escopo

### Bloco 1 — Críticos (integridade + segurança)

**C-01 · `transicionarRemessa` deixa de silenciar erros com side-effect**
- `src/services/logistica/remessas.service.ts`: remover fallback cego para `update` direto.
- Política nova:
  - Transições com side-effect (`em_transito`, `entregue`, `cancelado`): se RPC falhar, **propagar erro** (sem fallback). Garante que estoque/financeiro nunca divirjam silenciosamente.
  - Transições puramente logísticas (`coletado`, `postado`, `ocorrencia`, `pendente`, `devolvido`): `update` direto continua válido (sem RPC associada).
- Mensagem de erro do RPC é exibida ao usuário via `notifyError` no hook existente.

**C-04 · `correios-api` action `rastrear` exigir auth**
- `supabase/functions/correios-api/index.ts`: adicionar `requireUserWithRole(req)` no início do branch `rastrear` (mesma helper já usada em `prepostagem_*`).
- Sem mudança em `verify_jwt` (validação em código, padrão do projeto).

**C-03 + A-06 · Eliminar bypass `registrarMovimentacao`**
- `src/services/estoque.service.ts`: marcar `registrarMovimentacao` como `@deprecated` e reimplementar internamente delegando para `ajustar_estoque_manual` (RPC) — mapeando `tipo`/`quantidade` corretamente. Mantém assinatura para não quebrar callers.
- `src/pages/estoque/hooks/useEstoqueMutations.ts`: corrigir queryKeys invalidadas → `["estoque-posicao"]`, `["estoque-movimentacoes"]`, `["produtos"]`.
- Resultado: nenhum INSERT direto em `estoque_movimentos` a partir do frontend; `produtos.estoque_atual` sempre consistente.

**C-02 · Garantir `saldo_atual` corrido em `estoque_movimentos`**
- Migration: criar trigger `trg_estoque_movimentos_saldo_corrido` (BEFORE INSERT) que calcula `NEW.saldo_atual` somando o delta (`+quantidade` para `entrada`, `-quantidade` para `saida`/`perda_avaria`, valor absoluto para `ajuste/inventario`) sobre o último `saldo_atual` do mesmo `produto_id`. `SECURITY DEFINER`, `SET search_path = public`.
- Lock por produto (`pg_advisory_xact_lock(hashtext(produto_id::text))`) para serializar concorrentes.
- Backfill: `UPDATE estoque_movimentos` recomputando `saldo_atual` em ordem cronológica por produto (CTE com `SUM() OVER (PARTITION BY produto_id ORDER BY created_at)`).
- Idempotente: trigger só age quando `NEW.saldo_atual IS NULL` ou marcador, mantendo compatibilidade com RPCs que já calculam.

### Bloco 2 — Altos de invalidação/normalização (baixo risco)

- **A-03** `recebimentos.service.ts` `useRegistrarRecebimento.onSuccess`: invalidar `["estoque-posicao"]`, `["estoque-movimentacoes"]`, `["pedidos-compra"]`.
- **A-05** `useRecebimentos`: aplicar `normalizeRecebimentoStatus(r.status_logistico)` no map.
- **A-01** `EstoqueAjusteSheet`: bloquear submit (`disabled`) quando `tipo='saida' && novoSaldoPreview < 0`; CTA muda para "Saldo insuficiente".

### Bloco 3 — Mobile crítico operacional

- **MB-02** `RegistrarRecebimentoDialog`: substituir `hidden md:block` da tabela de itens por layout responsivo — em mobile renderiza cards verticais (um por item) com input de quantidade recebida, mantendo edição em campo. Tabela densa permanece no desktop.

## Fora de escopo (registrado para próxima onda)

- A-02 / M-05: paginação server-side de `remessas` e `estoque_movimentos` (refator significativo, exige troca de `useSupabaseCrud`).
- A-04 / BK-05: campo `responsavel` em `vw_recebimentos_consolidado` (alteração de view + JOIN + regen tipos).
- A-07 / SH-01 / SH-02: unificação de hooks paralelos e singleton realtime.
- BK-01 / BK-02 / BK-03 / BK-04 / M-02 / M-03: otimizações de view e tipagem.
- M-01, M-04, MB-01, MB-03, MB-04, MB-05, D-01, D-02: melhorias de UX/perf não bloqueantes.

## Detalhes técnicos

### Migrations
1. `..._estoque_saldo_corrido_trigger.sql`:
   - Função `fn_estoque_calcula_saldo_corrido()`.
   - Trigger BEFORE INSERT em `estoque_movimentos`.
   - Backfill via CTE.
   - `chk_estoque_saldo_atual_not_null` (NOT VALID inicialmente, validar após backfill).

### Edge function
- Deploy `correios-api` com `requireUserWithRole(req)` no `rastrear`. Confirmar que o frontend chama com `Authorization: Bearer <jwt>` (já é o padrão de `supabase.functions.invoke`).

### Validação após deploy
1. Ajustar saldo manual via `useEstoqueMutations` legado → conferir que `produtos.estoque_atual` e `vw_estoque_posicao` batem.
2. Forçar erro em `expedir_remessa` (estoque insuficiente) → confirmar que UI mostra erro e remessa **não** muda de status.
3. Chamar `correios-api?action=rastrear` sem JWT → esperar 401.
4. Registrar recebimento parcial → grid de Estoque atualiza sem refresh manual.
5. Tentar saída maior que saldo no `EstoqueAjusteSheet` → botão fica "Saldo insuficiente" desabilitado.

## Riscos
- Trigger de saldo corrido + backfill: executar em janela de baixa atividade; backfill em transação única para consistência.
- Remoção do fallback em `transicionarRemessa`: operadores agora veem erros que antes eram silenciosos. **Esse é o objetivo** — mas convém comunicar ao time.
