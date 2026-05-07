
# Onda 5 — Estoque & Logística — Revisão End-to-End

## 1. Resumo

A Onda 5 cobre Estoque (`Estoque.tsx` + 3 hooks + `vw_estoque_posicao`), Logística (`Logistica.tsx` com 3 abas — Entregas/Recebimentos/Remessas — `EntregaDrawer`, `RecebimentoDrawer`, `RemessaForm`, `LogisticaRastreioSection`), Recebimento de Compra (RPC `registrar_recebimento_compra` + dialog `RegistrarRecebimentoDialog`) e Etiquetas Correios (`prepostagem.service` + bucket `etiquetas-correios`). A arquitetura está madura — RPCs canônicas, views consolidadas, separação de domínios documentada em `docs/logistica-modelo.md`. Os problemas se concentram em: **RLS frouxa em `remessas` (qual=true)**, **transição de remessa via UPDATE direto bypassando RPCs com efeito de estoque**, **rastreio de Entrega que não persiste eventos reais**, **saldo negativo sem bloqueio explícito**, e **políticas/coluna `empresa_id` ausentes em `remessas`**.

## 2. Fluxos mapeados

```text
Pedido de Venda ──► Remessa(entrega) ──► Correios/Transportadora
                          │
                          ├─► expedir_remessa     → estoque_movimentos (saída)
                          ├─► marcar_em_transito  → vw_entregas_consolidadas
                          ├─► marcar_entregue     → trigger sync OV
                          └─► cancelar_remessa    → estorna estoque

Pedido de Compra ──► (Logística: aguardando_envio/em_transito visão derivada)
                          │
                          └─► registrar_recebimento_compra (RPC)
                                ├─► recebimentos_compra(_itens)
                                ├─► estoque_movimentos (entrada)
                                ├─► pedidos_compra_itens.quantidade_recebida
                                └─► pedidos_compra.status (parcial/recebido)

NF entrada confirmada ──► financeiro_lancamentos (contas a pagar)
Ajuste manual ──► ajustar_estoque_manual (RPC) → audit log
```

## 3. Críticos (CR)

- **CR-01 — RLS de `remessas` aberta (qual=true)**. Policies SELECT/UPDATE/DELETE com `using (true)` permitem qualquer authenticated mutar remessa de outra empresa. Tabela também **não tem coluna `empresa_id`** (vazamento multi-tenant). 
- **CR-02 — Transição de status da Entrega via UPDATE direto**. `updateEntregaStatus` (Logistica.tsx ~378) chama `updateStatusTransporte` (UPDATE puro), permitindo carimbar `entregue`/`cancelado` sem disparar `marcar_remessa_entregue`/`cancelar_remessa` → **sem baixa de estoque**. Deve usar `useTransicionarRemessa`.
- **CR-03 — Saldo negativo sem bloqueio**. `Estoque.handleSubmit` tem comentário "Will leave negative — still allow" mas **não confirma explicitamente** com o usuário; a saída segue direto para `executeMovimentacao`.
- **CR-04 — `remessa_etiquetas` sem políticas UPDATE/DELETE**. `gerarEtiqueta` faz `update` direto na tabela; sem policy explícita o caminho falhará silenciosamente para non-admins. Verificar e adicionar policies (`tenant + role logistica`).
- **CR-05 — `recebimentos_compra*.SELECT qual=true`**. Vazamento cross-tenant em produção multi-empresa.

## 4. Altos (AL)

- **AL-01 — Rastreio em `EntregaDrawer.handleRastrear` não persiste eventos**. Faz fetch direto na edge function `?action=rastrear` e tenta listar `remessa_eventos` em seguida, mas a edge function não grava. Resultado: timeline real nunca aparece. Substituir por `trackAndPersistEventos`.
- **AL-02 — Mock vs real não diferenciado visualmente**. `LogisticaRastreioSection` exibe banner mas eventos mock entram na lista com mesmo estilo. `EntregaDrawer` ignora `isMock`. Adicionar badge `Simulado` por evento e `Indisponível` quando edge function falha.
- **AL-03 — Justificativa de ajuste opcional**. Fallback `"Ajuste sem justificativa registrada"` (33 chars) burla `motivo_estruturado >= 10`. Tornar obrigatório no form para `tipo=ajuste|perda_avaria|inventario`.
- **AL-04 — Recebimento drawer força sair para `/compras`**. Footer navega para `/compras?recebimento=`, mas `RegistrarRecebimentoDialog` já existe e é montado em `Logistica.tsx`. Acionar inline (passar callback/abrir dialog do drawer).
- **AL-05 — Bulk rastrear sequencial com toast por iteração**. `handleBulkRastrear` (Logistica.tsx ~479) dispara `toast.info("Consultando rastreio…")` em loop dentro de `handleRastrear`. Trocar por toast único + progresso; usar `Promise.allSettled` paralelo limitado.
- **AL-06 — `EntregaDrawer.useEffect` carrega itens da OV mesmo quando consumidor não abre aba "Carga"**. OK por agora, mas falta cleanup quando drawer fecha em sequência rápida (race possível); o `cancelled` cobre, mas validar.

## 5. Médios / Baixos (MB)

- **MB-01** — `Movimento` interface duplicada em `Estoque.tsx` (deveria importar de `services/estoque.service`).
- **MB-02** — Mobile do grid Recebimentos exibe colunas truncadas: `quantidade_pedida/recebida/pendencia` quebram em telas estreitas. Refatorar para card mobile (`mobilePrimary` + `mobileMeta`).
- **MB-03** — Etiqueta Correios usa `confirm()` nativo do browser (`EtiquetaCorreiosCard.handleCancelar`). Trocar por `useConfirmDialog`.
- **MB-04** — `tipoOptions` no Estoque mostra opções (`transferencia`, `reserva`, `liberacao_reserva`, `estorno`) que **não são selecionáveis no form** (apenas filtro). OK, mas o form não permite registrar `perda_avaria`/`inventario`, embora a RPC os aceite.
- **MB-05** — `RecebimentoDrawer` mostra "Responsável" com `responsavel.slice(0,8) + …` truncando UUID; deveria omitir ou resolver via `profiles.display_name`.
- **MB-06** — `LogisticaRastreioSection` cria eventos mock com `id: "mock-${i}"` — colide com possíveis ids de DB; usar prefixo único.
- **MB-07** — `useEntregas` busca todas as remessas ativas (`select id, ordem_venda_id, codigo_rastreio`) sem paginação — cresce ilimitado.
- **MB-08** — Documentar a **diferença entre Recebimento Logístico (visão derivada) e Recebimento de Compra (operação real)** em help inline (já existe doc, falta tooltip nas abas).

## 6. Mobile

- Estoque (Movimentações) e Logística (Recebimentos) ainda renderizam tabelas horizontais em < 640px sem fallback de cards.
- `Logistica` aba **Remessas** tem 7 colunas — em mobile só uma é "primary"; ações `Rastrear/Etiqueta` ficam fora do viewport. Necessário collapse de ações no menu de contexto.
- `RegistrarRecebimentoDialog` já foi adaptado em Onda 4. Verificar `EntregaDrawer.tabTransporte` (timeline) — há overflow horizontal no `flex gap-3` em telas estreitas.

## 7. Desktop

- `Logistica.tsx` tem 1063 linhas (god-component). Decompor em sub-páginas/hooks por aba (`useEntregasGrid`, `useRemessasGrid`, `useRecebimentosGrid`).
- `EntregaDrawer.tsx` tem 558 linhas; extrair `EntregaTimeline`, `EntregaItens`, `EntregaOcorrencias`.

## 8. Banco / RPC / View

- **DB-01 (CR-01)** — Adicionar `empresa_id` em `remessas` + backfill + tornar policies tenant-aware (`empresa_id = current_empresa_id()` + role gate `logistica`/`admin`). Idem `remessa_eventos`.
- **DB-02 (CR-04)** — Policies UPDATE/DELETE em `remessa_etiquetas` (admin/logistica + tenant).
- **DB-03 (CR-05)** — Restringir SELECT de `recebimentos_compra*` a `(empresa_id = current_empresa_id() OR admin)`.
- **DB-04** — Confirmar que `vw_entregas_consolidadas`, `vw_recebimentos_consolidado` e `vw_estoque_posicao` foram criadas com `WITH (security_invoker=on)` (ver memória `security/security-definer-views`).
- **DB-05** — Constraint `chk_estoque_movimentos_quantidade > 0` (defesa em profundidade — RPC já valida).
- **DB-06** — Index em `remessa_eventos(remessa_id, data_hora desc)` para timeline (verificar se já existe).
- **DB-07** — Trigger ou RPC para impedir `remessas` direto-update saindo de `pendente` para `entregue` sem passar pelas RPCs (CR-02 reforçado no banco).

## 9. Frontend / Services / Hooks

- **FE-01 (CR-02)** — `Logistica.updateEntregaStatus` deve usar `useTransicionarRemessa`; remover `updateStatusTransporte` do caminho padrão.
- **FE-02 (AL-01)** — `EntregaDrawer.handleRastrear` deve consumir `trackAndPersistEventos` (mesma fonte da `LogisticaRastreioSection`/`Logistica`). Eliminar fetch manual.
- **FE-03 (AL-02)** — Adicionar prop `isMock` ao componente de timeline (event list) e badge `Simulado` por evento mock.
- **FE-04** — Centralizar shape `Entrega`/`Recebimento` (hoje duplicada entre `useEntregas.ts`, `EntregaDrawer.tsx` e `RecebimentoDrawer.tsx`). Mover para `src/types/logistica.ts`.
- **FE-05** — `useRecebimentos` e `useEntregas`: adicionar `empresa_id` filter explícito quando RLS for endurecida (defesa).
- **FE-06** — `gerarEtiqueta`: substituir hack `(supabase.functions.invoke ... as never)` por chamada `fetch` única (já existe `callAction`); descartar bloco morto `criarRes`.

## 10. Plano de Execução

### Bloco 1 — Críticos (1 sessão)
1. ✅ Migration aplicada — `empresa_id` em remessas/eventos/recebimentos + RLS tenant-aware + trigger `fn_remessa_protege_status_critico` + check qty>0.
2. ✅ `recebimentos_compra*` SELECT por empresa.
3. ✅ `remessa_etiquetas` policies já existiam (UPDATE/DELETE/INSERT por role+tenant).
4. ✅ `updateEntregaStatus` agora usa `useTransicionarRemessa`.
5. ✅ `Estoque.handleSubmit` confirma saldo negativo via `window.confirm`.

### Bloco 2 — Altos (1 sessão)
6. ✅ EntregaDrawer canônico via `trackAndPersistEventos`.
7. ✅ Badge "Dados simulados" em EntregaDrawer; mock id único em LogisticaRastreioSection.
8. ✅ `motivo >=10` obrigatório em ajustes.
9. ✅ RecebimentoDrawer aceita `onRegistrarRecebimento` — Logistica monta dialog inline.
10. ✅ Bulk rastrear paralelo (4) com toast único de progresso.

### Bloco 3 — Melhorias (curtas)
11. `EtiquetaCorreiosCard.handleCancelar` → `useConfirmDialog`. (MB-03)
12. Cards mobile para Movimentações e Recebimentos. (MB-02)
13. Tooltip explicativo "Visão consolidada" nas abas de Logística. (MB-08)
14. Index `remessa_eventos(remessa_id, data_hora desc)` se não existir. (DB-06)

### Bloco 4 — Dívida técnica (deferível)
15. Decompor `Logistica.tsx` por aba e `EntregaDrawer.tsx` em subcomponentes.
16. Centralizar tipos `Entrega/Recebimento` em `src/types/logistica.ts`.
17. Resolver `responsavel` real via `profiles`.
18. Adicionar `perda_avaria`/`inventario` no form de Estoque (com gates de role).

Após aprovação implemento na ordem acima, com PR consolidado por bloco e migrações testadas via `supabase--linter` ao final do Bloco 1.
