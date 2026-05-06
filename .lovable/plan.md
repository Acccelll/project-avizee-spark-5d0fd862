# Plano — Onda 3 Comercial: Correções por prioridade

Vou atacar em 3 fases, do mais crítico ao polimento. Cada fase é um lote coeso que pode ir ao ar independentemente.

## Fase 1 — Críticos + Altos rápidos (sessão atual)

Objetivo: fechar os 3 críticos (C-01, C-02, C-03) e os altos de baixo esforço (A-01, A-03, A-05, A-06, SH-03, BK-01/04).

1. **C-01 — Guard de status em `OrcamentoForm.handleSave`**
   - Bloquear save se `status !== 'rascunho'` (com toast orientando a duplicar/criar revisão).
   - Marcar campos de itens/desconto/frete como `readOnly` quando não-rascunho.
2. **M-01 (junto) — Banner de status-lock** no topo do `OrcamentoForm` quando edit + não-rascunho, com botão "Criar revisão" usando `criarRevisaoOrcamento`.
3. **A-03 — Autosave** ignora ticks quando `status !== 'rascunho'`.
4. **C-02 — `OrdemVendaView`** passa a checar `can("faturamento_fiscal:criar") || can("pedidos:editar")` antes de exibir Gerar NF.
5. **A-01 — `OrcamentoView`** alinha permissão Aprovar com a grid: `can("orcamentos:aprovar") || isAdmin`.
6. **C-03 — `OrcamentoPublico.handleAction`**
   - Adicionar estado `acting` + `disabled` nos botões.
   - Validar `data.status` antes de prosseguir.
   - Criar RPC `acao_cliente_orcamento(p_token, p_acao)` que valida token, status machine e grava auditoria. Trocar o `.update()` direto pela RPC.
   - **MB-03** junto: garantir `min-h-[44px]` nos botões Aprovar/Rejeitar.
7. **A-05 — `BACKLOG_OV_STATUSES`** inclui `'separado'` para casar com `canFaturarPedido`.
8. **A-06 — `PedidoForm`** remove `faturada`, `faturada_parcial` e `cancelada` do `<Select>` de status; aplicar `validarTransicaoPedido` antes de salvar.
9. **SH-03 — `INVALIDATION_KEYS.conversaoOrcamento`** mantém `"ordens_venda"` (já presente) — confirmar consistência; ajustar grid `Pedidos` para também escutar via `subscribeComercial` se ainda não estiver.
10. **BK-01 / BK-04** — remover `as never` dos rpc calls de `enviar_orcamento_aprovacao`, `aprovar_orcamento`, `cancelar_orcamento`, `cancelar_pedido_venda` (após regerar tipos pela migration de C-03; tipos da Supabase são auto-regenerados).

## Fase 2 — Altos estruturais e médios

11. **A-07 + SH-03 (definitivo)** — migrar `Pedidos.tsx` de `useSupabaseCrud` para `useQuery(['ordens_venda'], ...)`, eliminando `fetchData()` manual pós-mutação.
12. **A-02 — Paginação server-side** em `Orcamentos` e `Pedidos`: `pageSize: 50`, mover filtros simples (status único, cliente) para query Supabase; manter compostos client-side.
13. **SH-02 — Lookups do OrcamentoForm** migrados para `useQuery` com `staleTime: 5min` (clientes ativos, produtos ativos, formas de pagamento).
14. **SH-04 — `comercialChannel`** destrói canal quando `listeners.size === 0`.
15. **M-06 / MB-01 — Unificar footers sticky mobile** do OrcamentoForm em um único nó condicionado.
16. **MB-02 — Header do `OrcamentoView`** em mobile: ação primária + dropdown "..." com Duplicar/Cancelar.
17. **BK-02 — Lock contention** em `gerar_nf_de_pedido`: padronizar erro `LOCK_CONTENTION` na RPC e tratar no `useFaturarPedido` com toast específico.

## Fase 3 — Médios/Baixos e roadmap

18. **A-04 — Página `/faturamento` operacional** (escopo a alinhar): grid centralizada de pedidos elegíveis com filtros e ação em lote. Por ora, manter `EmptyState` mas adicionar atalho "Ir para Pedidos com filtro de faturamento aberto".
19. **M-02 — Reservas de estoque** para pedidos `aprovada/em_separacao` (tabela `estoque_reservas` ou view de reserva calculada). Decisão de produto necessária.
20. **M-03/M-04/M-05, B-01/B-02, D-01/D-02, SH-01** — limpeza fina:
    - `@deprecated` em `sendForApproval`/`convertToOV`.
    - `p_forcar` em `convertToPedido` quando aplicável.
    - Cancelar no drawer do orçamento liberado por permissão `orcamentos:cancelar`.
    - Migration normalizando `status` legado `confirmado/enviado → pendente`.
    - `useCancelarPedido`: validação opcional de motivo via flag de config.
    - Preview de cenário em `Sheet` lateral no desktop.
    - Filtro de histórico em `Orcamentos` migrado para `MultiSelect`.

## Detalhes técnicos relevantes

- **Nova RPC `acao_cliente_orcamento`** (Fase 1, item 6): `security definer`, `search_path = public`, validações: token existe, orçamento em `pendente`, ação ∈ {aprovado, rejeitado}; grava em `auditoria_logs` com `usuario_id = NULL` e `origem = 'cliente_publico'`. Retorna `{ id, status }`.
- **Banner status-lock** reaproveita `Alert` do design system, sem cor custom.
- **Migração da grid Pedidos** para React Query usa `comercialKeys.pedidos()` (já existe) e `subscribeComercial` para invalidar.
- Paginação respeita `useSupabaseCrud` server pagination — não inventar nova abstração.
- Sem mudança de stack, sem refactor além do escopo de cada item.

## Saída por fase

- Fase 1: ~10 arquivos editados + 1 migration (RPC `acao_cliente_orcamento`).
- Fase 2: ~6 arquivos editados (refactor de queries) + 1 migration (lock contention error code).
- Fase 3: depende de decisões de produto (A-04, M-02). Demais itens são edições pontuais.

Aprove para eu começar pela Fase 1.

---

## Status de execução

### Fase 1 — concluída
- ✅ C-01 + M-01 + A-03: guard de status no `handleSave`, banner com "Criar revisão" e autosave bloqueado para não-rascunho.
- ✅ C-02: `OrdemVendaView` checa `faturamento_fiscal:criar` || `pedidos:editar`.
- ✅ C-03 + MB-03: nova RPC `acao_cliente_orcamento` (security definer, valida status/expiração, grava auditoria), `OrcamentoPublico` migrado pra RPC com guard de double-tap e min-h 44px nos CTAs.
- ✅ A-01: `OrcamentoView` Aprovar usa `can("orcamentos:aprovar") || isAdmin`.
- ✅ A-05: `BACKLOG_OV_STATUSES` agora inclui `'separado'`.
- ✅ A-06: `PedidoForm` removeu status terminais do select e valida transição via `validarTransicaoPedido` antes de salvar.
- ✅ BK-01 / BK-04: removidos `as never` dos rpc calls (`enviar_orcamento_aprovacao`, `aprovar_orcamento`, `cancelar_orcamento`, `cancelar_pedido_venda`).
- ↪️  SH-03: `INVALIDATION_KEYS.conversaoOrcamento` já contém `"ordens_venda"`; resolução definitiva fica para Fase 2 junto da migração da grid.

Próximo: Fase 2 (paginação, React Query na grid de Pedidos, lookups, realtime cleanup).

### Fase 2 — em andamento
- ✅ SH-04: `comercialChannel` já remove o canal quando `listeners.size === 0` (verificado em `src/lib/realtime/comercialChannel.ts`).
- ✅ BK-02: `useFaturarPedido` trata `LOCK_CONTENTION`/deadlock com toast específico ("Outro faturamento em andamento").
- ✅ MB-02: Header do `OrcamentoView` em mobile virou ações primárias (Aprovar/Converter) + dropdown "..." com Editar/PDF/Enviar/Revisão/Cancelar/Excluir. Em desktop tudo continua inline.
- ⏳ A-07/SH-03: migração da grid `Pedidos` para `useQuery` puro — fora do escopo desta rodada (refactor maior; já existe invalidação cruzada via `subscribeComercial` + `INVALIDATION_KEYS.faturamentoPedido`, e o `fetchData()` local segue como fallback enquanto o hook segue em `useSupabaseCrud`).
- ⏳ A-02: paginação server-side em Orçamentos/Pedidos depende de `pageSize` + `useServerSort` + KPIs via RPC — adiado para evitar quebra de KPIs sob filtros client-side compostos (validade/prazo).
- ⏳ SH-02: lookups do `OrcamentoForm` (`listClientesAtivosOrcamento`, `listProdutosAtivosComFornecedores`) seguem em `useEffect`+state — migração para `useQuery` exige refator do bloco de carregamento + reset; agendado para Fase 2b.
- ⏳ M-06/MB-01: footer sticky mobile do `OrcamentoForm` já está unificado em um único nó (linha 1772). Item considerado concluído.
