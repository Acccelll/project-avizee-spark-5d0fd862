## Status Fase 2

Itens completos: SH-04, BK-02, MB-02, A-07/SH-03, M-06/MB-01.

Pendentes da Fase 2 (deferidos com justificativa no plano):
- **A-02** (paginação server-side em Orçamentos/Pedidos): adiado por dependência de KPIs em filtros compostos client-side (validade, prazo, histórico). Manter em Fase 2b.
- **SH-02** (lookups de OrcamentoForm → `useQuery`): adiado por exigir refator do bloco de carregamento + reset. Manter em Fase 2b.

Decisão: **não reabrir Fase 2** agora. Esses dois itens viram um lote 2b separado depois da Fase 3 — qualquer migração para `useQuery`/paginação server-side em forms grandes pede um PR isolado para evitar regressão de UX.

---

## Fase 3 — Polimento e fechamento

Escopo: itens de média e baixa prioridade do relatório de auditoria que não dependem de decisão de produto pesada.

### 3.1 — Fechamento operacional do Faturamento (A-04)
- `/faturamento` hoje é `<EmBreve />`. Substituir por uma página enxuta que:
  - Mostra um `EmptyState` orientativo + botão "Ir para Pedidos com filtro de faturamento aberto".
  - O botão navega para `/pedidos?status=aprovada,em_separacao,separado` (já suportado pelo `useUrlListState`).
- Sem nova grid própria — apenas atalho operacional.

### 3.2 — Higiene de status legados (B-01)
- Migration normalizando linhas legadas em `orcamentos.status`:
  - `'confirmado'` → `'pendente'`
  - `'enviado'`    → `'pendente'`
- Após a migration, remover esses dois aliases de `OPEN_ORCAMENTO_STATUSES` em `comercialStatuses.ts`.
- Manter `chk_orcamentos_status` cobrindo apenas o conjunto canônico.

### 3.3 — Limpezas no service comercial (M-03, M-04)
- `sendForApproval` e `convertToOV` em `src/services/orcamentos.service.ts`: marcar `@deprecated` apontando para `enviarOrcamentoAprovacao` / `convertToPedido` (alias `convertToOV` já existe — adicionar JSDoc nos demais).
- `convertToPedido`: aceitar opcionalmente `forcar?: boolean` repassando para a RPC `converter_orcamento_em_ov` como `p_forcar` (depende de a RPC já aceitar — verificar; se não aceitar, deixar o opcional pronto na assinatura mas não enviar até futura migration).

### 3.4 — Permissão de cancelamento no drawer (M-05)
- `OrcamentoView`: gate o botão "Cancelar" por `can("orcamentos:cancelar") || isAdmin` (hoje aparece sem checagem específica). Mesmo gate dentro do dropdown mobile.

### 3.5 — `useCancelarPedido` com motivo opcionalmente obrigatório (B-02)
- Ler flag `app_configuracoes.exigir_motivo_cancelamento_pedido` (booleano, default `false`).
- No `OrdemVendaView` quando o usuário aciona Cancelar: se a flag estiver ligada, abrir prompt obrigatório (já há `useConfirmDestructive` com input). Se desligada, mantém comportamento atual.
- Não alterar a RPC.

### 3.6 — Filtro de histórico em Orçamentos (D-02)
- Hoje `historicoFilter` é um `<Select>` simples ("todos / excluir / apenas"). Trocar por toggle visual mais claro (3 chips) ou manter Select e adicionar contadores no label. Decisão: chips inline ao lado da `AdvancedFilterBar`, padrão do design system.
- Não vira MultiSelect — semanticamente é mutuamente exclusivo.

### 3.7 — Atualização do plano e memória
- Atualizar `.lovable/plan.md` marcando tudo da Fase 3 e listando explicitamente o que ficou para 2b.
- Sem nova memória — itens são polimento, não doutrina.

---

## Fora de escopo desta fase
- **M-02** (reservas de estoque): exige decisão de produto sobre modelo de reserva (tabela própria vs. view calculada). Continua bloqueado.
- **A-02 / SH-02**: Fase 2b, em PR separado.
- **D-01** (preview de cenário em `Sheet`): exige design novo, fica para Onda 4.

## Detalhes técnicos
- Migration nova (3.2) precisa rodar antes do ajuste em `comercialStatuses.ts`, senão a UI passa a esconder linhas legadas.
- Flag `exigir_motivo_cancelamento_pedido` (3.5) entra em `app_configuracoes` via `useAppConfig`; sem migration estrutural, apenas chave JSON.
- A página `/faturamento` (3.1) continua sob `PermissionRoute resource="faturamento_fiscal"`.

## Saída esperada
- ~6 arquivos editados + 1 migration (status legados) + possivelmente 1 chave em `app_configuracoes`.
- Sem mudança de stack, sem refactor além do escopo.