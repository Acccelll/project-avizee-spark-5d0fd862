# Onda 4 — Auditoria do módulo Compras (ERP AviZee)

Revisão end-to-end de Cotações de Compra, Pedidos de Compra, Recebimento, RPCs (`gerar_pedido_compra`, `receber_compra`, `estornar_recebimento_compra`, `cancelar_pedido_compra`, `aprovar_pedido`) e integrações com Estoque / Financeiro / Fiscal / Fornecedores.

## 1. Resumo da Onda 4

A arquitetura está madura: status canônicos (`docs/compras-modelo.md`), triggers de transição (`trg_cotacao_compra_transicao`, `trg_pedido_compra_transicao`), RPCs `SECURITY DEFINER` com `search_path=public`, índice `ux_pedidos_compra_cotacao_id` garantindo idempotência cotação→pedido, `pg_advisory_xact_lock` em recebimento e estorno, validação server-side de saldo pendente, e wrappers canônicos de UI (DataTable/StatusBadge/ViewDrawerV2/DrawerStickyFooter, mobile com cards verticais e bottom-sheets).

Ainda assim, 14 itens precisam ser endereçados — destaco **3 críticos** que podem causar perda silenciosa de itens, duplicidade de número de cotação ou bypass de limite de aprovação.

## 2. Fluxo mapeado ponta a ponta

```text
[Cotação]                       [Pedido de Compra]               [Recebimento / NF Entrada]
rascunho                        rascunho                          —
  │ enviar_aprovacao             │ solicitar_aprovacao_pedido       │ receber_compra
  ▼                              │  (auto-aprovar até limite)       │  (advisory_lock + saldo)
aberta → em_analise              ▼                                  ▼
  │ aprovar/rejeitar             aguardando_aprovacao              compras + compras_itens
  ▼                              │ aprovar_pedido (admin)           + estoque_movimentos (entrada)
aguardando_aprovacao             ▼                                  + UPDATE pedidos_compra_itens
  │ aprovar                      aprovado                            .quantidade_recebida
  ▼                              │ marcar_enviado                    │
aprovada                         ▼                                   ▼
  │ gerar_pedido_compra ────────►enviado_ao_fornecedor             pedido: parcialmente_recebido
  ▼   (idempotente)              │                                   ↔ recebido (terminal)
convertida (terminal)            aguardando_recebimento              │ estornar_recebimento_compra
                                 │                                   ▼
rejeitada / cancelada (terminais)│ cancelar_pedido_compra           compra cancelada + estoque -qtd
                                 │  (bloqueia se NF ativa OU         + UPDATE quantidade_recebida
                                 │   quantidade_recebida > 0)
                                 ▼
                                 cancelado
                                                                     [NF Entrada — Fiscal]
                                                                     /fiscal?tipo=entrada
                                                                     &pedido_compra_id=…
                                                                     gera financeiro_lancamentos
                                                                     ao confirmar a NF
```

Cross-módulo:
- **Estoque**: `receber_compra` insere `estoque_movimentos.entrada`; trigger `trg_estoque_movimentos_sync` mantém `produtos.estoque_atual`. Estorno gera `saida` simétrica.
- **Financeiro**: contas a pagar **não** são criadas no recebimento — só ao confirmar a NF de entrada vinculada (banner de aviso já presente em `RegistrarRecebimentoDialog`). Drawer expõe `viewFinanceiro` por `listFinanceiroPorPedido`.
- **Fiscal**: após recebimento OK, `darEntrada` redireciona para `/fiscal?tipo=entrada&pedido_compra_id=…&fornecedor_id=…` (UUID, não número), pré-vinculando a NF.
- **Fornecedores**: `RelationalLink type="fornecedor"` no Drawer; lista de propostas e header de fornecedor; `pedidos_compra.fornecedor_id` gravado por `gerar_pedido_compra` a partir das propostas selecionadas.
- **Logística**: `LogisticaRastreioSection pedidoCompraId` na aba Recebimento.

## 3. Problemas críticos

**CC-01 — `gerar_pedido_compra` perde itens silenciosamente em multi-fornecedor.**
A RPC pega `SELECT DISTINCT fornecedor_id … LIMIT 1` e cria UM pedido com TODAS as propostas selecionadas, não importa o fornecedor. Se a UI for burlada (ex.: chamada direta via console), o pedido sai com fornecedor X e itens de Y/Z embutidos. O front (`useCotacoesCompra.gerarPedido`) bloqueia, mas o servidor é a fonte da verdade.
**Correção:** dentro da RPC, validar `COUNT(DISTINCT fornecedor_id) = 1` nas propostas selecionadas e abortar com `RAISE EXCEPTION` se houver mais de um.

**CC-02 — `CotacaoCompraForm` permite editar `numero` livremente.**
O hook `openCreate` puxa o número via `proximo_numero_cotacao_compra` (sequence), mas o form de rota deixa o `Input` editável (`updateForm({ numero: e.target.value })`). Usuário pode reescrever para um número que colide com outra cotação ou com a próxima emissão do sequence.
**Correção:** `disabled` no input de número (igual ao `FormModal` de Cotações), ou bloquear via UNIQUE constraint em `cotacoes_compra.numero` (só o disabled já resolve o caso comum).

**CC-03 — `gerar_pedido_compra` cria pedido já em `'aprovado'`, ignorando limite de aprovação.**
A RPC define `status = 'aprovado'` no INSERT, pulando `aguardando_aprovacao`. Já existe `solicitar_aprovacao_pedido` que aplica limite (`v_limite`) — qualquer pedido criado por outro caminho passa por esse gate, mas o gerado a partir de cotação não. Quebra a doutrina de aprovação por valor.
**Correção:** ao final da RPC, chamar `PERFORM solicitar_aprovacao_pedido(v_pedido_id)` em vez de gravar `'aprovado'` direto, ou inserir como `'rascunho'` e deixar o usuário clicar em "Solicitar aprovação".

## 4. Problemas altos

**CA-01 — `gerarPedido` usa `window.confirm` para confirmação destrutiva.**
`useCotacoesCompra.gerarPedido` ainda usa `window.confirm()` em vez do `ConfirmDialog`/`useConfirmDestructive` canônicos. Quebra padrão de UX e não é estilizável/testável.

**CA-02 — Recebimento via grid é "tudo ou nada", drawer é granular.**
`PedidoCompraTable.onReceive` chama `usePedidosCompra.darEntrada`, que recebe todo o saldo pendente sem diálogo. No Drawer, o botão "Registrar Recebimento" abre `RegistrarRecebimentoDialog` (granular). Inconsistência operacional — usuário pode receber acidentalmente tudo pela grid.
**Correção:** trocar `onReceive` da grid para abrir o mesmo `RegistrarRecebimentoDialog` (ou pelo menos um `ConfirmDialog` com aviso "vai receber X itens, R$ Y").

**CA-03 — Cotação vencida não bloqueia aprovação nem geração de pedido.**
`CotacaoCompraTable` mostra badge de validade vermelho se `data_validade < hoje`, mas nem `aprovar_cotacao_compra` nem `gerar_pedido_compra` validam `data_validade`. Cotações expiradas continuam conversíveis em pedido com preços defasados.
**Correção:** adicionar checagem `IF v_cotacao.data_validade IS NOT NULL AND v_cotacao.data_validade < CURRENT_DATE THEN RAISE EXCEPTION` em `gerar_pedido_compra` (e/ou em `aprovar_cotacao_compra`), com mensagem explícita.

**CA-04 — `cotacaoCanApprove` libera `aberta`/`em_analise` (pula `aguardando_aprovacao`).**
`comprasStatus.cotacaoCanApprove` retorna true para `aberta | em_analise | aguardando_aprovacao`. O Drawer expõe "Aprovar" direto a partir de `aberta`. Isso pode estar OK por design (admin atalho), mas conflita com a doutrina "envia → aprova". Confirmar regra com produto e, se intencional, documentar; se não, restringir a `aguardando_aprovacao`.

**CA-05 — `estornar_recebimento_compra` lê `produtos.estoque_atual` sem `FOR UPDATE`.**
A RPC seleciona `saldo_anterior` direto de `produtos.estoque_atual` sem trancar a linha. Em concorrência (recebimento + estorno simultâneos do mesmo produto), o `saldo_anterior` registrado em `estoque_movimentos` pode ficar incoerente. Trigger `trg_estoque_movimentos_sync` corrige `estoque_atual`, mas o histórico fica torto.
**Correção:** `SELECT estoque_atual … FOR UPDATE` ou usar advisory lock por `produto_id`.

## 5. Melhorias médias

**CM-01 — Drawer de Pedido não expõe transição `enviado_ao_fornecedor → aguardando_recebimento`.**
Só há `marcar_enviado` (aprovado→enviado_ao_fornecedor). Para "começar a aguardar", o usuário precisa receber direto. Adicionar ação opcional ou simplesmente alinhar o badge para tratar `enviado_ao_fornecedor` como "aguardando recebimento".

**CM-02 — Coluna "Recebimento" da grid mostra `aguardando` para `aprovado`.**
Pedido `aprovado` (sem envio) já aparece como "Aguardando" recebimento. Confuso — separar em "Aprovado / aguardando envio" e "Aguardando recebimento" usando `pedidoRecebimentoLabel` que já existe.

**CM-03 — `viewEstoque` no Drawer usa `produto_id` para somar quantidade recebida, mas `pedidos_compra_itens.quantidade_recebida` é a fonte canônica.**
Pode divergir se o produto aparecer em mais de um item do mesmo pedido (caso raro mas possível). Trocar `estoquePorProduto` por `i.quantidade_recebida` direto (já vem no select de `listPedidoCompraItens`).

**CM-04 — Sem mini-timeline de auditoria no Drawer de Cotação/Pedido.**
Reutilizar o `AuditTimelineMini` criado na Onda 3 (M-04 do Comercial) em ambos os Drawers — `auditoria_logs` já recebe `gerar_pedido_compra`, `receber_compra`, `cancelar_pedido_compra` e os triggers `trg_audit_*`.

**CM-05 — `pedidoStatusLabelMap` duplica `aguardando_aprovacao` e `rejeitado`.**
Em `comprasStatus.ts`, são adicionados manualmente `aguardando_aprovacao: "Aguardando Aprovação"` e `rejeitado: "Rejeitado"` para preencher buracos do `statusSchema`. Mover para o schema central.

**CM-06 — `drawerStats.allItemsHaveSelected` permite gerar pedido sem checar `preco_unitario > 0`.**
A RPC já valida (`COALESCE(p.preco_unitario,0) > 0`), mas o front deveria espelhar para evitar viagem ao banco. Atualmente `allItemsHaveSelected` checa só `selecionado`.

## 6. Problemas mobile

**MB-01 — `RegistrarRecebimentoDialog` mantém a `<table>` de itens em mobile.**
Apesar do estilo bottom-sheet, a tabela `Produto/Pedido/Recebido/Pendente/Receber` faz scroll horizontal incômodo. Replicar o padrão de cards verticais já usado no `ItemsGrid` (`md:hidden`).

**MB-02 — `PedidoCompraDrawer` aba Itens: tabela com 7 colunas em mobile.**
Mesmo escondendo "Código" em `sm:`, sobram 6 colunas. Refatorar para cards verticais por item em `md:hidden` (mostrar Produto, Qtd, Vlr unit, Total, Recebido, Pendente em pares grid 2x3).

**MB-03 — Botões `Editar`/`Excluir` no header do Drawer de Pedido usam `size="sm"` (32px).**
Abaixo do mínimo touch (44px). Aplicar `max-sm:h-11 max-sm:w-full` ou agrupar em menu kebab no mobile.

## 7. Problemas desktop

**DT-01 — Drawer de Pedido tem 5 abas (Resumo/Itens/Recebimento/Condições/Vínculos).**
Em telas <1280px o tab-bar quebra. "Condições" duplica dados de "Resumo". Fundir Condições no Resumo (já lista valor total e fornecedor) ou colapsar Vínculos→Resumo.

**DT-02 — Filtros de Cotações não têm chip "Vencidas".**
`CotacaoCompraFilters` filtra status, fornecedor, datas, mas não há atalho "vencidas hoje" / "vence em 7d", apesar de a coluna Validade já calcular isso.

## 8. Problemas banco / RPC

**DB-01 — `cotacoes_compra.numero` sem UNIQUE constraint.**
`proximo_numero_cotacao_compra()` é atômico via sequence, mas nada impede UPDATE manual ou import legado de criar dois números iguais. Adicionar `UNIQUE(numero)` (e idem para `pedidos_compra.numero`).

**DB-02 — `recebimentos_compra` / `recebimentos_compra_itens` têm policy `FOR ALL TRUE` (`auth_full_recebimentos`).**
Permissivo demais, mesmo que o caminho real seja via RPC `SECURITY DEFINER`. Restringir SELECT por empresa/role e revogar INSERT/UPDATE/DELETE direto (forçar caminho RPC).

**DB-03 — `gerar_pedido_compra` não copia `data_entrega_prevista` da cotação para o pedido.**
Pedido nasce sem prazo. Combinar com `data_validade` da cotação ou parametrizar.

**DB-04 — Falta `UNIQUE (cotacao_compra_id, item_id, fornecedor_id)` em `cotacoes_compra_propostas`.**
Hoje a UI bloqueia duplicata, mas nada no banco. Risco de propostas redundantes em concorrência.

## 9. Problemas frontend / services / hooks

**FE-01 — `useCotacoesCompra.handleApprove` assume status local sem ler retorno da RPC.**
`setSelected({ ...selected, status: "aprovada" })` antes de `fetchData()`. Se a RPC fizer transição condicional (ex.: `solicitar_aprovacao_pedido` que pode auto-aprovar), o status local fica errado. Usar o retorno da RPC.

**FE-02 — `usePedidosCompra.darEntrada` faz `setDrawerOpen(false)` antes do `navigate("/fiscal")`.**
Se o usuário cancelar o redirecionamento o drawer está fechado e perdeu contexto. Reordenar: invalidar → toast → navegar (drawer fecha por desmontagem natural).

**FE-03 — `useCotacaoPropostas.handleSelectProposal` não desmarca propostas concorrentes do mesmo item no estado local.**
Confia no `reload()` para refletir. Em rede lenta o usuário vê duas propostas marcadas brevemente. Optimistic update local.

**FE-04 — `PedidoCompraTable` ainda usa `mobileStatusKey="status"` com label do banco.**
OK para a maioria, mas `parcialmente_recebido` aparece sem o "Recebimento Parcial" do `pedidoStatusLabelMap`. Passar `getMobileStatusLabel` ou ajustar o `statusSchema`.

**FE-05 — `CotacaoCompraDrawer` tem 463 linhas e mistura header + 4 abas + footer + 2 dialogs.**
Está no limite. Extrair os dois `ConfirmDialog` (reject/cancel) para um sub-componente `CotacaoCompraDialogs`.

## Próximos passos sugeridos

Ordem recomendada (mais valor / menor risco):
1. **CC-01, CC-02, CC-03** (RPC + form) — 1 migração + 1 patch front. Bloqueiam falhas reais de fluxo.
2. **CA-01 + CA-02 + CA-03** — UX/segurança operacional: ConfirmDialog em gerarPedido, diálogo granular no botão receber da grid, validação de validade.
3. **DB-01, DB-04** — UNIQUE constraints (idempotência defensiva).
4. **CM-04** — reaproveitar `AuditTimelineMini` (alto valor, baixo custo).
5. **MB-01 + MB-02** — mobile dos blocos de itens (alto impacto perceptual).

Após aprovação do plano implemento na ordem acima, começando pelos críticos (1 migração + 2 patches) e abrindo PR consolidado por bloco.

## Status final da Onda 4 (atualizado)

Implementados nesta sessão (continuação):
- **DB-02**: removidas policies `auth_full_recebimentos*`; SELECT só para `authenticated`, escrita exclusiva via RPCs `SECURITY DEFINER`.
- **CM-02**: coluna "Recebimento" agora distingue "Aguardando envio" (aprovado) de "Aguardando recebimento" (enviado/aguardando).
- **CM-03**: drawer de pedido usa `pedidos_compra_itens.quantidade_recebida` (fonte canônica) em vez de agregação por `produto_id` em `estoque_movimentos`.
- **CM-05**: removidas chaves duplicadas em `pedidoStatusLabelMap` (já existem em `statusPedidoCompra`).
- **FE-02**: `darEntrada` não fecha o drawer manualmente — deixa a navegação para `/fiscal` desmontá-lo.
- **FE-03**: `handleSelectProposal` aplica optimistic update e faz rollback em caso de erro.

Deferidos (baixo valor / requer decisão de produto):
- CA-04 (doutrina de cotacaoCanApprove), CM-01 (transição enviado→aguardando), CM-06 (espelhar validação de preço no front), DT-01/DT-02 (re-layout desktop), FE-01 (handleApprove via retorno da RPC), FE-04 (mobile status label override), FE-05 (decompor `CotacaoCompraDrawer`), DB-03 (data_entrega_prevista já vem da cotação na RPC).
