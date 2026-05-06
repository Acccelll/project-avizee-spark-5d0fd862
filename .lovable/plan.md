# Auditoria Onda 3 — Módulo Comercial (ERP AviZee)

Revisão end-to-end de Orçamentos, Pedidos, Drawer/Forms, Orçamento Público e fluxo Orçamento → Pedido → NF, com integrações Estoque/Financeiro/Fiscal/Logística.

## 1. Resumo da Onda 3

A Onda 3 entregou um fluxo Comercial sólido em arquitetura: status canônicos (`docs/comercial-modelo.md`), RPCs transacionais (`converter_orcamento_em_ov`, `gerar_nf_de_pedido`, `cancelar_orcamento`, `cancelar_pedido_venda`, `salvar_orcamento`, `duplicar_orcamento`), gates de UI compartilhados (`comercialWorkflow.ts` + `comercialStatuses.ts`), invalidação cross-módulo via `INVALIDATION_KEYS` + Realtime (`subscribeComercial`), drawer relacional padronizado (`usePublishDrawerSlots` + `ComercialFlowTimeline`), e integração com Lifecycle financeiro/fiscal através das NFs vinculadas. As Fases 1–3 cobriram normalização de status legados, gating de cancelamento, motivo de cancelamento configurável (`app_configuracoes.comercial`), página de Faturamento como "atalho operacional" e migração de lookups do form para `useQuery`.

Sobram **8 itens críticos/altos**, **9 médios** e **6 mobile/baixos** (detalhados abaixo). Nenhum quebra o fluxo, mas vários afetam consistência visual/UX e contagens de KPI.

## 2. Fluxo Comercial mapeado

```text
[Orçamento]                 [Pedido / OV]                    [NF Saída]
rascunho                    rascunho                         pendente
  │ enviar_orcamento        │ converter_orcamento_em_ov       │ gerar_nf_de_pedido
  ▼                         ▼  (RPC, idempotente,             ▼  (RPC, advisory_lock,
pendente                   p_forcar p/ admin)                  guard 'faturado')
  │ aprovar_orcamento       ├─ pendente → aprovada            ├─ confirmada → estoque (-)
  ▼                         │  → em_separacao → separado      │   + financeiro_lancamentos
aprovado ──────────────────►│  → em_transporte/entregue       │   (parcelas)
  │                         │  → faturada_parcial → faturada  ├─ devolução: gerar_devolucao_nota_fiscal
  │                         │  → cancelada (NF ativa bloqueia)│
convertido (terminal)       │                                  │
rejeitado / cancelado /     status_faturamento: aguardando ↔  │
expirado (terminais)        parcial ↔ total (matriz CHECK)    │
```

**Cross-módulo:**
- Estoque: `verificarEstoquePedido` lê `estoque_atual` (trigger `trg_estoque_movimentos_sync`); confirmação de NF gera `estoque_movimentos` (saída).
- Financeiro: confirmação de NF cria `financeiro_lancamentos` por parcela.
- Fiscal: NF emitida fica em `pendente`; `useNotaFiscalLifecycle` confirma/estorna via RPCs `confirmar_nota_fiscal`/`estornar_nota_fiscal`.
- Logística: `LogisticaRastreioSection` lê remessas vinculadas à OV.
- Comercial público: `OrcamentoPublico` via `orcamentos_public_view` + RPC `acao_cliente_orcamento` (anon).

## 3. Problemas críticos (corrigir já)

**C-01 — `OrcamentoView.cancelarOrcamento` ignora dependências reais.**
A guarda `disabled={Boolean(linkedOV)}` bloqueia cancelamento sempre que existe pedido, mas `cancelar_orcamento` na verdade aceita esse cenário se o pedido foi cancelado. UX bloqueia cancelamento legítimo de orçamentos cujo pedido derivado já foi cancelado. Corrigir: só bloquear quando `linkedOV.status !== "cancelada"`.

**C-02 — `Orcamentos.tsx` mistura status canônico e legado em `effectiveStatus`.**
Linha 343: `vs === "vencida" && normalizedStatus === "enviado" ? "expirado"` referencia `"enviado"`, status removido da Fase 3.2. Hoje nunca cai no ramo, então orçamento `pendente` vencido não é renderizado como `expirado`. Trocar `"enviado"` por `"pendente"`.

**C-03 — `OrcamentoPublico` aprova/rejeita via RPC mas o status local não é canônico.**
Após `acao_cliente_orcamento`, `setData` atualiza para `aprovado | rejeitado`, mas o gate de entrada permite `["pendente", "rascunho"]` (linha 257). Cliente pode aprovar `rascunho` que ainda não foi enviado. Restringir a `pendente` apenas (rascunho não deveria ter token público válido — adicionar guard server-side na RPC OU filtrar `status='pendente'` na view pública).

**C-04 — Faturamento parcial sem botão para emitir NF complementar.**
`canFaturarPedido` libera `aprovada/em_separacao/separado` desde que `status_faturamento != 'total'`, mas não há UI para selecionar quantidade parcial — `gerar_nf_de_pedido` fatura todos os itens restantes. Para pedidos já em `faturada_parcial`, o botão "Gerar NF" continua aparecendo e gera NF do saldo (correto), mas a UI não comunica isso (label igual a primeira emissão). Adicionar label dinâmico "Gerar NF complementar (R$ X restantes)" em `Pedidos.tsx` e `OrdemVendaView.tsx`.

## 4. Problemas altos

**A-01 — `Pedidos.tsx` não consulta permissão de cancelamento na grid.**
Não existe ação "Cancelar pedido" na grid (só no drawer), mas o roadmap pediu consistência. Decisão: ou expor cancel também na grid (atrás de `can("pedidos:cancelar")`), ou documentar explicitamente que cancel é drawer-only.

**A-02 — `OrcamentoView` desktop mostra `Editar` sem checagem de permissão.**
Linha 231: botão Editar sem gate. Idem `PDF`. Como a edição mexe em itens/valores/cliente, deveria validar `can("orcamentos:editar") || isAdmin`.

**A-03 — `useFaturarPedido` não recebe `forcar` quando há shortfall de estoque.**
`Pedidos.tsx` exibe `ConfirmDialog` com warning de estoque insuficiente, usuário confirma, mas `gerar_nf_de_pedido` é chamado sem flag e a RPC apenas avisa via trigger. Validar se a RPC tem parâmetro `p_forcar`/`p_permitir_negativo`; se não tiver, criar (ou registrar override em `auditoria_logs.metadata`).

**A-04 — `OrdemVendaView` recarrega tudo a cada `subscribeComercial`.**
`useEffect` chama `reload()` em qualquer evento do canal comercial, mesmo quando a mudança não afeta este pedido. Em dashboard com muitos updates simultâneos, gera N requests em cascata. Filtrar pelo `payload.new.id === selected.id` (ou pelo `ordem_venda_id` da NF).

## 5. Melhorias médias

**M-01** — `OrcamentoView.handleCriarRevisao`: oferecer revisão também a `pendente` (hoje só `aprovado/rejeitado/expirado/convertido`); cliente pode pedir ajustes durante aprovação.

**M-02** — `OrcamentoView` Tab Resumo lista status duas vezes (header + dentro do bloco). Remover duplicação.

**M-03** — `Pedidos.tsx` "PrazoBadge": usa cor warning para `proximo`, mas threshold (3d) não é configurável. Mover para `app_configuracoes.comercial.alerta_prazo_despacho_dias` (mesma estratégia do `exigir_motivo_cancelamento_pedido`).

**M-04** — `OrcamentoView`/`OrdemVendaView` não exibem **histórico de auditoria** consolidado — só "Criado/Atualizado em". Adicionar mini-timeline puxando últimas 5 entradas de `auditoria_logs` filtradas por `entidade_id`.

**M-05** — `PedidoForm` não valida se a transição operacional respeita ordem (ex.: `entregue` → `pendente` é bloqueado pela CHECK, mas a UI não esconde a opção). Filtrar `statusOptions` pelo `pedido.status` atual.

**M-06** — `OrdemVendaView`: badge inline `statusFaturamentoColors` repete tons que já estão em `STATUS_VARIANT_MAP`. Trocar por `<StatusBadge status={selected.status_faturamento === "total" ? "faturado" : selected.status_faturamento} />` para alinhar à doutrina (memo *Contrato de Status*).

**M-07** — `OrcamentoPublico` usa estilos inline com paleta hard-coded (`WINE`, `ORANGE`, `CREAM`). Migrar para tokens semânticos (`hsl(var(--brand-wine))`) — também afeta light/dark.

**M-08** — Grid `Orcamentos.tsx` filtro `historicoFilter` continua como `<select>` nativo (D-02 deferido). Trocar por chips + contadores conforme padrão `AdvancedFilterBar`.

**M-09** — `Faturamento.tsx` (página antiga em `/faturamento` direto) ainda existe e conflita com nova `FaturamentoIndex` (em `src/pages/faturamento/`). Verificar rota efetiva e remover o legado.

## 6. Problemas mobile

**MB-01** — `OrcamentoView` cabeçalho mobile expõe muitos botões + dropdown; testar em 375px (`Aprovar`, `Converter` ficam quebrados). Mover Aprovar/Converter para `mobilePrimaryAction` quando o detalhe é aberto em modo full-screen.

**MB-02** — `OrdemVendaView` ações no header (`Editar Pedido`, `Gerar NF`, `Cancelar`, NFs) não têm fallback mobile — viram scroll horizontal. Aplicar o mesmo padrão `MoreHorizontal` do `OrcamentoView`.

**MB-03** — `OrcamentoPublico`: tabela de itens desktop está dentro de `hidden md:block`; precisa garantir que cards mobile (não vistos no trecho) listem `peso`, `unidade` e `variação` de forma legível.

**MB-04** — `PedidoForm` footer sticky aparece em mobile, mas `valor total` não é visível enquanto rola — adicionar mini-resumo no topo sticky.

## 7. Problemas desktop

**D-01** — `Pedidos.tsx` coluna `Faturamento` usa `StatusBadge status={statusKey}`, mas `statusKey === "total" ? "faturado"` mapeia para badge de NF, não de pedido. Confirmar se `STATUS_VARIANT_MAP` cobre `parcial/aguardando/faturado` no namespace certo.

**D-02** — `Orcamentos` exibe coluna `Status` que pode mostrar `"expirado"` derivado de validade, mas o filtro de status (MultiSelect) usa só os canônicos do schema — usuário não consegue filtrar "expirados" via badge clicando. Adicionar `expirado` como pseudo-status no MultiSelect.

**D-03** — `OrcamentoView` dialog de conversão (`CrossModuleActionDialog`) duplica a lista de impactos com `Orcamentos.tsx`. Extrair `convertOrcamentoImpacts(orc, items)` para `src/utils/comercial.ts`.

## 8. Problemas de banco/RPC

**B-01** — `converter_orcamento_em_ov` aceita `p_forcar` mas não há proteção server-side equivalente para reservas — depende de M-02 da Fase 2 (bloqueado). Mantém como conhecido.

**B-02** — Validar que **todas** as RPCs comerciais têm `SET search_path = public` (memo de segurança). Rodar `supabase--linter` no escopo comercial.

**B-03** — `cancelar_orcamento` aceita motivo opcional, mas `app_configuracoes.comercial.exigir_motivo_cancelamento_pedido` só é honrada para Pedidos. Estender flag (ou criar `exigir_motivo_cancelamento_orcamento`) e ler em `OrcamentoView`.

**B-04** — `acao_cliente_orcamento` (Orçamento Público) precisa garantir que só aceita `status='pendente'` (ver C-03).

**B-05** — Não há índice em `ordens_venda(cotacao_id)` (pesquisa do `linkedOV`) confirmada — verificar com `EXPLAIN`.

## 9. Problemas de frontend/services/hooks

**F-01** — `useFaturarPedido` aceita `PedidoBase` com 4 campos, mas o service `faturarPedido(pedidoId)` ignora os outros. Simplificar assinatura para `(pedidoId)` ou usar todos os campos no `onError` (atualmente perdidos).

**F-02** — `useSalvarPedido` ainda faz `update` direto (não RPC). Consistente com escopo "operacional", mas convém mover para RPC `salvar_pedido_operacional` para manter trilha de auditoria igual aos outros (CONTRACTS.md cita "RPC + invalidação" como princípio).

**F-03** — `OrcamentoView.handleSendForApproval` chama `sendForApproval` (deprecated por própria nota), em vez de `enviarOrcamentoAprovacao`. Trocar pelo canônico.

**F-04** — `OrcamentoView.handleApprove` chama `approveOrcamento` mas não usa `useMutation` — perde invalidação cross-módulo automática. Criar `useAprovarOrcamento` análogo a `useConverterOrcamento`.

**F-05** — `Orcamentos.tsx` `useSupabaseCrud({ table: "orcamentos", select: "*, clientes(...)" })` baixa todos os registros (limite 1000). Risco real para clientes com >1000 orçamentos. Itens A-02/SH-02 já reconhecidos como Fase 2b.

**F-06** — `subscribeComercial` invalida sempre `INVALIDATION_KEYS.faturamentoPedido` em `Pedidos.tsx` mas `INVALIDATION_KEYS.conversaoOrcamento` em `Orcamentos.tsx`. Quando uma NF é confirmada em outra aba, a grid de Orçamentos não atualiza o status `convertido`. Unificar.

---

## Plano de Execução proposto

Prioridade pelo risco operacional. Dividir em 3 fases pequenas (não exige refator de stack).

### Fase A — Correções críticas + altos (1 PR, ~10 arquivos)
1. **C-01**: relaxar gate de `Cancelar` em `OrcamentoView` (`linkedOV.status === 'cancelada'` libera).
2. **C-02**: corrigir `effectiveStatus` em `Orcamentos.tsx` (`enviado` → `pendente`).
3. **C-03 + B-04**: migration ajustando `acao_cliente_orcamento` para exigir `status='pendente'`; UI também filtra.
4. **C-04 + D-01**: label dinâmico "Gerar NF complementar (R$ saldo)" em `Pedidos.tsx` e `OrdemVendaView.tsx`; revisar mapeamento de tons.
5. **A-02**: gate de `Editar`/`PDF` no `OrcamentoView` por `can("orcamentos:editar")`.
6. **A-04 + F-06**: `subscribeComercial` filtra por `id` no `OrdemVendaView`; unificar invalidação Pedidos/Orçamentos.
7. **F-03 + F-04**: trocar `sendForApproval` → `enviarOrcamentoAprovacao` e criar `useAprovarOrcamento`.
8. Testes vitest dos gates (ConfirmDialog não abre quando linkedOV cancelado etc.).

### Fase B — UX de status, cancel e config (1 PR menor)
9. **M-06 + D-01**: `<StatusBadge>` para faturamento (alinha a doutrina).
10. **M-08**: filtro histórico em chips.
11. **B-03**: estender flag `exigir_motivo_cancelamento_orcamento` + UI.
12. **M-01 + M-05**: revisão a partir de `pendente`; filtro de `statusOptions` no `PedidoForm`.
13. **M-02**: dedup de status no Resumo.
14. **A-01**: decisão "cancelar na grid" — implementar OU documentar.

### Fase C — Polimento mobile + dívida técnica leve (1 PR)
15. **MB-01/MB-02/MB-04**: dropdown unificado nas ações dos drawers + sticky meta no `PedidoForm`.
16. **MB-03 + M-07**: revisar Orçamento Público mobile + tokens semânticos.
17. **M-03**: parametrizar `alerta_prazo_despacho_dias` via `app_configuracoes`.
18. **M-04**: mini-timeline de auditoria nos drawers.
19. **M-09**: remover/redirecionar `Faturamento.tsx` legada se sobreviveu.
20. **F-01 / F-02**: ajustar assinatura `useFaturarPedido`; mover `useSalvarPedido` para RPC.
21. **B-02**: rodar `supabase--linter` e ajustar `search_path` se faltar.
22. **B-05**: índice em `ordens_venda(cotacao_id)` se `EXPLAIN` confirmar.

### Fora deste escopo (já reconhecido)
- A-02/SH-02 originais (paginação server-side em Orçamentos/Pedidos) seguem como Fase 2b.
- M-02 da Onda 2 (reservas de estoque) bloqueado por decisão de produto.
- D-01 da Fase 3 (preview Sheet) → Onda 4.

### Saída esperada
- ~3 PRs sequenciais, ~25–30 arquivos no total.
- 2 migrations (`acao_cliente_orcamento`, opcionalmente `salvar_pedido_operacional`).
- Sem mudança de stack, sem refactor além do escopo.
- Atualizar `.lovable/plan.md` no fim de cada fase.
