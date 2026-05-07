## Onda 6 — Revisão End-to-End do Financeiro

### 1. Resumo

Módulo Financeiro do AviZee é estruturalmente o mais maduro do ERP: serviços bem fatorados em `src/services/financeiro/*` (`baixaRpc`, `baixas`, `estornos`, `cancelamentos`, `conciliacao.service`, `ofxParser`, `lancamentos`, `calculosFinanceiros`), hooks dedicados em `src/pages/financeiro/hooks/*`, KPIs server-side via RPC `kpis_financeiro`, e ciclo Lançamento → Baixa → Estorno → Cancelamento totalmente transacional via RPCs `SECURITY DEFINER` (`registrar_baixa_financeira`, `registrar_baixa_lote_financeira`, `estornar_baixa_financeira`, `financeiro_processar_estorno`, `financeiro_cancelar_lancamento`, `financeiro_conciliar_baixa`). RLS é tenant-aware (`empresa_id = current_empresa_id()`) com gate de role (`admin|financeiro`) nas tabelas-chave. Cartão/fatura tem fluxo próprio (`cartao_fatura_para_data`, `gerar_fatura_cartao`, `baixar_fatura_cartao`) e o Financeiro de NFe é idempotente via índice único `uniq_fin_lanc_nfe_parcela(nota_fiscal_id, parcela_numero) WHERE ativo`.

Os problemas se concentram em: **`Conciliacao.tsx` reimplementa heurística e desvia da camada de service** (não usa `useConciliacaoBancaria`/`sugerirConciliacaoBancariaRpc`), **conciliação não tem unicidade no DB** para impedir double-match, **`Budget` faz CHECK desatualizado** (UI permite `fopag/imposto/investimento` mas constraint só aceita `fopag/faturamento/cmv/despesa_operacional/...`, divergente), **RLS de `cartao_faturas` SELECT é `qual=true`** (vazamento cross-tenant), **`bm_select` (budgets) idem `qual=true`**, **`conciliacao_pares` sem `empresa_id` e SELECT/INSERT abertos**, e **`Conciliacao.tsx` é god-component (1.254 linhas)** com auto-match local divergente do score canônico.

### 2. Fluxos mapeados

```text
Manual                ──► createLancamento → trg_init_financeiro_saldo (saldo_restante=valor)
NF-e entrada (XML)    ──► gerar_financeiro_nfe_entrada(idempotente: uniq_fin_lanc_nfe_parcela)
Folha de pagamento    ──► gerar_financeiro_folha (idempotente)
Retirada societária   ──► gerar_financeiro_retirada
Cartão (parcelamento) ──► gerar_parcelas_financeiras → cartao_fatura_para_data por parcela

Lançamento ─► registrar_baixa_financeira  ─► financeiro_baixas (INSERT)
                                            └─► trg_sync_financeiro_saldo recalcula
                                                valor_pago/saldo_restante/status
              registrar_baixa_lote_financeira (multi-id, agrupa em grupo_baixa_id)
              estornar_baixa_financeira (marca estornada_em) → trigger recalcula
              financeiro_processar_estorno (estorna todas baixas ativas)
              financeiro_cancelar_lancamento (status='cancelado', motivo)

Cartão de Crédito ─► cartao_faturas (uniq cartao_id+competencia)
                     trg_sync_cartao_fatura_total recalcula valor_total
                     gerar_fatura_cartao(competencia) → cria lançamento "a pagar"
                     baixar_fatura_cartao → baixa em lote com grupo_id

Conciliação ─► parseOFX → matching score (data_baixa preferencial vs vencimento)
              conciliarTransacao:
                saldo>0 ─► registrar_baixa_financeira (forma="extrato_conciliacao")
                liquidado ─► localiza baixa não-conciliada por valor/data
                financeiro_conciliar_baixa(baixa_id, "conciliado", extrato_ref)
              confirmarConciliacao → INSERT conciliacao_bancaria + conciliacao_pares
```

### 3. Críticos (CR)

- **CR-01 — `Conciliacao.tsx` é fork divergente do service.** Implementa `handleAutoMatch` próprio (valor + data_vencimento, sem normalização/bigramas), `handleConciliacaoAutomatica` chamando `calcularScoreConciliacao` mas **ignora `sugerirConciliacaoBancariaRpc` (pg_trgm)** e o hook `useConciliacaoBancaria`. Resultado: duas heurísticas de matching coexistem — o usuário em `/conciliacao` recebe match diferente do que recebe via hook canônico.
- **CR-02 — `cartao_faturas` SELECT `qual=true`**. Política `cartao_faturas_select_auth` permite a qualquer authenticated ler faturas de qualquer empresa. Mesma condição em `bm_select` (budgets_mensais), `cp_select`/`cp_insert` (conciliacao_pares). Tabela `conciliacao_pares` sequer possui coluna `empresa_id` para enforcement.
- **CR-03 — Sem unique constraint em `conciliacao_pares(lancamento_id)` ativos**. Permite o mesmo lançamento ser conciliado em duas remessas/lotes diferentes (double-match silencioso). O service só protege via lookup por `conciliacao_status`, mas não há enforcement no banco.
- **CR-04 — `Budget.tsx` opções de UI ≠ CHECK do banco**. `chk_budgets_categoria` aceita `'receita','despesa','fopag','faturamento','cmv','despesa_operacional'`. UI envia `'imposto'` e `'investimento'`. **Insert quebra silenciosamente em runtime** (toast genérico de erro).
- **CR-05 — Hard-delete de `financeiro_lancamentos` exposto a usuários com `financeiro:excluir`**. `permanentDeleteRecord` chama RPC `hard_delete_record`. UI no `FinanceiroDrawer` permite trash quando `can("financeiro:excluir")`. Trigger `trg_financeiro_protege_delete` existe, mas RPC `hard_delete_record` faz `bypass das triggers de proteção`. Risco de exclusão de registro com baixas ativas.

### 4. Altos (AL)

- **AL-01 — Conciliacao usa `data_vencimento` no auto-match local** (linhas ~250-270 de `Conciliacao.tsx`), enquanto o service canônico (`calcularScoreConciliacao`) já prioriza `data_baixa`. Discrepância confunde a equipe financeira.
- **AL-02 — `confirmarConciliacao` (lote) usa `Promise.all` sobre `conciliarTransacao`**. Falha em um par não desfaz os outros: estado parcial. Deveria virar RPC transacional única (`financeiro_conciliar_lote`).
- **AL-03 — `BaixaParcialDialog` recarrega baixas via `loadBaixas(supabase.from())` direto**, fora da camada de service. `FinanceiroDrawer` usa `useDrawerData`. Inconsistência — extrair `fetchBaixasDoLancamento` em `services/financeiro/baixas.ts`.
- **AL-04 — `processarEstorno` faz fallback iterando baixas com `for…of` sem transação**. Se a 2ª chamada falhar, a 1ª já foi estornada. Em produção a RPC `financeiro_processar_estorno` cobre, mas o fallback é frágil.
- **AL-05 — `cartao_faturas` sem `empresa_id`**. Não há multi-tenancy na fatura, apenas no cartão pai. Audit/RLS quebra se houver múltiplas empresas com cartão de mesmo banco.
- **AL-06 — `gerar_financeiro_nfe_entrada` não aceita `juros/multa/desconto` da duplicata**. Quando NF tem campos fiscais, vão para zero — impacto pequeno mas discrepância contábil.
- **AL-07 — `FluxoCaixa.tsx` (938 linhas) usa data_vencimento como base, não data_baixa**. Para "fluxo realizado" deveria distinguir realizado (data_baixa) vs previsto (vencimento). Hoje o cards de "realizado" e "previsto" partem do mesmo eixo.
- **AL-08 — `FinanceiroLancamentoForm` não bloqueia descricao+valor+data duplicados** quando `origem_tipo='manual'`. Sem alerta de duplicidade ao usuário (já existe `vw_financeiro_duplicidades`?). Conferir auditoria.

### 5. Melhorias médias/baixas (MB)

- **MB-01** — `BaixaLoteModal` não exibe pré-visualização de impacto por conta bancária (saldo após baixa).
- **MB-02** — `BaixaParcialDialog` aceita `valorPago > saldoAtual` se também houver `abatimento` que zere — UX confusa. `isExcessivo` está certo, mas mensagem é genérica.
- **MB-03** — Estorno não exige confirmação de "afeta saldo da conta bancária" (atual `ConfirmDialog` é só sobre o status).
- **MB-04** — `Conciliacao.tsx` filtros (status/tipo/origem) duplicam código de `useFinanceiroFiltros`. Reaproveitar.
- **MB-05** — `Budget.tsx` não exibe Δ% vs realizado (a página vende esse benefício no subtitle mas não renderiza).
- **MB-06** — `CartoesCredito.tsx` `gerarFaturaCartao` não confirma sobrescrita quando idempotente devolve `valor_total` diferente do exibido.
- **MB-07** — KPI "Vencidos" no Financeiro inclui `data_vencimento <= hoje` mas o card "vence_hoje" também conta (ver `kpis_financeiro` RPC). Cards podem somar > totalCount.
- **MB-08** — Status `parcial` não tem contraparte explícita em `statusFinanceiro` schema (só aparece em runtime via `getEffectiveStatus`).

### 6. Mobile

- **MB-09** — `BaixaLoteModal` em telas estreitas: tabela de overrides de itens não tem fallback em cards; rolagem horizontal forçada.
- **MB-10** — `Conciliacao.tsx` usa Sheet bottom-sheet de "Vincular" (bom), mas o painel de extrato OFX usa `Collapsible` que esconde o controle em mobile (precisa rolar).
- **MB-11** — `FluxoCaixa` cards em md:grid-cols-3: em 360px ficam 2 colunas — KPI "Saldo projetado" some abaixo da dobra.
- **MB-12** — `FinanceiroDrawer` aba "Histórico" usa tabela `<table>` sem fallback mobile; `auditoriaList` em telas estreitas trunca eventos importantes.

### 7. Desktop

- **DK-01** — `Conciliacao.tsx` (1.254 linhas) é god-component: extrair `useConciliacao`, `ConciliacaoExtratoPanel`, `ConciliacaoMatchTable`. Parar de duplicar matching client-side — delegar 100% ao `useConciliacaoBancaria`.
- **DK-02** — `FluxoCaixa.tsx` (938 linhas) idem: extrair `useFluxoCaixaSeries`, `FluxoCaixaChart`, `FluxoCaixaForm`.
- **DK-03** — `BaixaParcialDialog` (387 linhas): extrair `BaixaValoresGrid`, `BaixasAnterioresTable`.

### 8. Banco / RPC / View

- **DB-01 (CR-02)** — Tornar `cartao_faturas_select_auth` tenant-aware: adicionar coluna `empresa_id NOT NULL` em `cartao_faturas` (backfill via `cartoes_credito.empresa_id`), trigger `set_empresa_id_default`, e policy `(empresa_id = current_empresa_id() OR has_role(...,'admin'))`.
- **DB-02 (CR-02)** — Mesma correção em `budgets_mensais` (`bm_select`) e `conciliacao_pares` (adicionar `empresa_id` + policy + trigger). Deletar `cp_insert WITH CHECK true`.
- **DB-03 (CR-03)** — Constraint `UNIQUE (lancamento_id) WHERE conciliacao_status='conciliado'` em `conciliacao_pares` ou na própria `financeiro_baixas` (`uniq_baixa_conciliada_por_lanc`). Decisão: aplicar em `financeiro_baixas` para impedir 2 baixas conciliadas no mesmo lançamento sem estorno.
- **DB-04 (CR-04)** — Atualizar `chk_budgets_categoria` para refletir UI: incluir `'imposto','investimento'` ou alinhar UI para o domínio existente. Decisão de produto: estender CHECK + adicionar opções faltantes na UI.
- **DB-05 (CR-05)** — Endurecer `hard_delete_record` para `financeiro_lancamentos`: rejeitar quando há `financeiro_baixas` ativas (incluindo estornadas) ou `origem_tipo != 'manual'`.
- **DB-06** — Criar RPC `financeiro_conciliar_lote(p_pares jsonb)` transacional (substitui o `Promise.all` de `confirmarConciliacao`).
- **DB-07** — Adicionar `created_by` em `conciliacao_bancaria` (já tem `usuario_id` mas service grava `null`).
- **DB-08** — Criar view `vw_financeiro_duplicidades` (descricao + valor + tipo + cliente_id/fornecedor_id + data_vencimento ±3d) para o card "Auditoria de duplicidades" prometido no escopo.
- **DB-09** — Reforçar `gerar_financeiro_nfe_entrada` para também receber `juros/multa/desconto` por duplicata (atualmente sempre 0).

### 9. Frontend / Services / Hooks

- **FE-01 (CR-01)** — Refatorar `Conciliacao.tsx` para consumir 100% `useConciliacaoBancaria`. Eliminar `handleAutoMatch`, `handleConciliacaoAutomatica`, `handleConfirmarConciliacao` locais.
- **FE-02 (AL-03)** — Mover `loadBaixas` de `BaixaParcialDialog` para `services/financeiro/baixas.ts` como `fetchBaixasAtivasDoLancamento(id)`. `FinanceiroDrawer` deve importar o mesmo helper.
- **FE-03 (AL-04)** — Remover fallback iterativo de `processarEstorno` quando RPC existe; logar `Sentry warning` se RPC indisponível em vez de continuar parcialmente.
- **FE-04 (CR-04)** — `Budget.tsx`: adicionar `imposto`/`investimento` como categorias válidas (após DB-04) ou remover do `CATEGORIAS`.
- **FE-05** — Centralizar opções de status financeiro em `lib/statusSchema` (incluir `parcial` explicitamente).
- **FE-06** — `FluxoCaixa` aba "Realizado" deve filtrar por `data_baixa` via `financeiro_baixas` (não `data_vencimento`).
- **FE-07** — `FinanceiroDrawer` botão "Cancelar" hoje usa permission `financeiro:cancelar OR financeiro:excluir` — separar: hard-delete só com `financeiro:excluir` + admin.

### 10. Plano de Ação

#### Bloco 1 — Críticos de segurança/integridade (1 sessão, 1 migration consolidada)
1. Migration: `cartao_faturas.empresa_id` (add+backfill+trigger+RLS tenant-aware).
2. Migration: `budgets_mensais` SELECT tenant-aware; `conciliacao_pares.empresa_id` + RLS.
3. Migration: estender `chk_budgets_categoria` para incluir `imposto, investimento`.
4. Migration: constraint anti-double-conciliação em `financeiro_baixas` (unique parcial).
5. Migration: endurecer `hard_delete_record` para `financeiro_lancamentos`.
6. `supabase--linter` ao final.

#### Bloco 2 — Conciliação canônica (1 sessão)
7. Refatorar `Conciliacao.tsx` para consumir `useConciliacaoBancaria` (FE-01). Remover heurística duplicada.
8. Migration RPC `financeiro_conciliar_lote(p_pares jsonb)` + ajustar `confirmarConciliacao` para chamar a RPC.
9. Atualizar `Budget.tsx` (FE-04) com novas categorias.

#### Bloco 3 — Frontend / hooks (curto)
10. ✅ Extrair `fetchBaixasAtivasDoLancamento` — concluído (services/financeiro/baixas.ts; consumido em `BaixaParcialDialog` e `FinanceiroDrawer`).
11. ✅ `FluxoCaixa.tsx` distinguir Realizado (data_baixa) × Previsto (vencimento) — `useFluxoCaixaData` agora retorna `baixas` agrupadas por `data_baixa`; `totals.realReceber/realPagar` somam baixas ativas no eixo real.
12. ✅ `FinanceiroDrawer` — `canPermCancelar` agora exige apenas `financeiro:cancelar` (hard-delete depende de `financeiro:excluir` + admin via gate da RPC `hard_delete_record`).

#### Bloco 4 — Dívida técnica (deferível, fora do escopo da Onda 6)
13. Decompor `Conciliacao.tsx` (DK-01) e `FluxoCaixa.tsx` (DK-02).
14. Criar `vw_financeiro_duplicidades` + tela "Auditoria de duplicidades" (atende item 16 do escopo).
15. Mobile cards para `BaixaLoteModal` overrides e `FinanceiroDrawer` aba Histórico.
16. Estender `gerar_financeiro_nfe_entrada` com juros/multa/desconto por duplicata.