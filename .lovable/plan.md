## Plano — Onda 6: Hardening do Módulo Financeiro

Implementação faseada da auditoria. Foco inicial nos críticos (C-01/C-02/C-03 + BK-04) que travam uso real em produção. Médios/baixos agrupados em fase final.

---

### Fase 1 — Críticos (impacto imediato em produção)

**1.1 — `useRegistrarBaixa` invalida saldos de conta e fluxo de caixa (C-03)**
- Adicionar `["contas_bancarias"]` e `["fluxo-caixa"]` em todos os `onSuccess` de `useBaixaFinanceira.ts` (registrar, estornar, gerar parcelas, gerar folha).
- Replicar nos `processarBaixaLote` e `processarEstorno` quando chamados fora do hook.

**1.2 — Constraint UNIQUE em conciliação (BK-04)**
- Migration: `CREATE UNIQUE INDEX uq_baixa_conta_extrato_ref ON financeiro_baixas (conta_bancaria_id, conciliacao_extrato_referencia) WHERE conciliacao_extrato_referencia IS NOT NULL;`
- RPC `financeiro_conciliar_baixa`: validar antes do UPDATE que a referência ainda não foi usada noutra baixa ativa; mensagem clara.

**1.3 — Persistência do extrato OFX (C-02)**
- Nova tabela `financeiro_extrato_importacoes` (`conta_bancaria_id`, `fitid`, `data`, `valor`, `descricao`, `competencia`, `status` ∈ {pendente, conciliado, ignorado}, `baixa_id` opcional, `arquivo_hash`, `importado_por`).
- `UNIQUE (conta_bancaria_id, fitid)` para idempotência de re-import.
- RLS por `empresa_id` (trigger `set_empresa_id_default`).
- `useConciliacaoBancaria.importarExtrato`:
  - calcular `fitid` final (FITID original ou hash sha256 de `data+valor+descricao` quando ausente — corrige M-05);
  - `upsert` com `onConflict: "conta_bancaria_id,fitid"` e `ignoreDuplicates: true`;
  - re-buscar transações do banco em vez de manter em estado local.
- Pares confirmados também persistem (status `pendente` → `conciliado` ao salvar).
- Reload da página: `useQuery(["conciliacao-extrato", contaId, periodo])` recupera tudo.

**1.4 — Paginação server-side em `Financeiro.tsx` (C-01) [maior esforço — pode ficar para sub-fase 1.4 separada]**
- Substituir `useSupabaseCrud` por `useQuery(["financeiro_lancamentos", filtros, page])` com `range()` server-side.
- Mover filtros (`tipo`, `status` exceto `vencido`, `contaBancariaId`, `formasPagamento`, `monthRange`) para `.eq/.in/.gte/.lte` no Supabase.
- Filtro `vencido` mapeado para `status='aberto' AND data_vencimento < hoje`.
- KPIs passam a usar exclusivamente `useFinanceiroKpisRpc` (resolve SH-02; remover `useFinanceiroKpis` legado ou marcar `@deprecated`).
- Filtros restantes (A-02) ficam server-side por consequência.
- Lookups de cliente/fornecedor (M-01): `select id,nome_razao_social` com cache longo.

---

### Fase 2 — Altos

**2.1 — Remover fallback de UPDATE direto em `processarBaixaLote` (A-03)**
- Quando RPC retorna `erros`, apenas reportar (`toast.warning` já existe). Sem UPDATE manual.
- Não tentar reprocessar item-a-item silenciosamente — opcionalmente disparar `registrarBaixaFinanceira` por item se desejado, mas com confirmação.

**2.2 — Guard admin-only para exclusão física (A-01)**
- `FinanceiroDrawer`: separar `canCancelar` (status → `cancelado`) de `canExcluirFisico` (`isAdmin && origem_tipo='manual' && sem baixas ativas`).
- Renderizar dois botões distintos com ícones e textos diferentes; confirm dialog específico.

**2.3 — Documentar caminhos de estorno (A-04 / SH-01)** ✅
- JSDoc claro em `estornarBaixaFinanceira` (unitário) e `processarEstorno` (lote).
- `FinanceiroDrawer`: histórico de baixas com botão "Estornar esta baixa" (unitário) + botão principal "Estornar todas" (lote).

**2.4 — `sugerirConciliacao` excluir títulos sem `data_baixa` (A-05)**
- `calcularScoreConciliacao`: se `titulo.status === 'aberto'`, retornar score 0.
- Apenas `pago/parcial` entram no matching.

**2.5 — Advisory lock em RPCs de baixa (BK-01)**
- `registrar_baixa_financeira`: `PERFORM pg_advisory_xact_lock(hashtext(p_lancamento_id::text));` no início.
- Idem em `estornar_baixa_financeira` e (por item) em `registrar_baixa_lote_financeira`.

**2.6 — CHECK de motivo no banco (BK-02)**
- `financeiro_cancelar_lancamento`: `IF length(trim(p_motivo)) < 5 THEN RAISE EXCEPTION ... USING ERRCODE='22023'`.

**2.7 — Tipagem RPC (SH-04)** ✅
- Adicionar entradas em `src/types/rpc.ts` para `registrar_baixa_financeira`, `registrar_baixa_lote_financeira`, `financeiro_processar_estorno`, `financeiro_conciliar_baixa`, `financeiro_cancelar_lancamento`.
- Substituir `as never`/`as any` por casts tipados via wrapper `rpc<T>()` já usado no projeto.

**2.8 — Invalidação granular (A-06)** ✅
- Trocar `["financeiro"]` por `["financeiro", "lancamentos"]` + `["financeiro", "kpis"]` em baixas individuais; manter prefixo amplo apenas em lote.

---

### Fase 3 — Médios / Mobile / Banco

- **M-02**: alinhar algoritmo de score client-side com pg_trgm (usar tokens iguais) ou desabilitar fallback quando RPC disponível.
- **M-03**: optimistic update em `budget.service` (`onMutate` no React Query).
- **M-04**: `FinanceiroCalendar` recebe `contaBancariaId` filtrada como prop.
- **M-06** ✅: warning não bloqueante em `calcularJurosDiarios` quando taxa > 0,034%/dia.
- **MB-01**: `BaixaLoteModal` com `mobileCard` para itens.
- **MB-02** ✅: `BaixaParcialDialog` `SelectTrigger` com `h-11` (Inputs já estavam 44px).
- **MB-03**: `FinanceiroCalendar` mobile = lista por dia (drawer expandível) em vez de grid.
- **B-01** ✅: `COMMENT … DEPRECATED` em `marcar_lancamentos_vencidos()`.
- **B-02 / D-01**: padronizar touch target restantes; RPC de auditoria de duplicidades.
- **D-02** ✅: lazy import de `WorkbookGeracaoDialog` em `WorkbookGerencial.tsx`.
- Atualizar `docs/financeiro-modelo-estrutural.md` com extrato persistido e advisory locks.

---

### Detalhes Técnicos

**Migrations** (uma por fase, evita lock prolongado):
1. `20260508_financeiro_unique_extrato_ref.sql` — UNIQUE conciliação + extrato_importacoes + advisory locks + CHECK motivo.
2. `20260508_financeiro_extrato_persistencia.sql` — tabela e RLS.

**Código**:
- ~12 arquivos editados, ~3 novos hooks/services para extrato.
- Verificar: `vitest run financeiro` + `tsc --noEmit` após cada fase.
- Atualizar `mem://features/conciliacao-bancaria` com nova arquitetura.

**Ordem de execução sugerida**: 1.1 → 1.2 → 1.3 → 2.1/2.2/2.4/2.5/2.6/2.7/2.8 (em paralelo lógico) → 1.4 (maior, isolado) → Fase 3.

Posso iniciar pela Fase 1 (críticos) ou seguir outra ordem se preferir.