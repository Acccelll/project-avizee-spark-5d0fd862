# Diagnóstico e Plano de Execução

## 1. Diagnóstico (problemas confirmados)

| # | Item | Estado atual | Problema |
|---|---|---|---|
| 1 | Faturamento/Chave/QR | Rotas `/faturamento`, `/faturamento/cadastros`, `/faturamento/emitir` ativas em `App.tsx`; botões "Buscar por Chave" e "Ler QR/Código" funcionais em `Fiscal.tsx` (linhas 1127, 1141) | Operacional, mas deveria estar "Em breve" |
| 2 | `/pedidos-compra/novo` | Existe apenas `/pedidos-compra/:id` (App.tsx L157) | `:id = "novo"` carrega registro inexistente |
| 3 | Status `vencido` | `PendenciasList.tsx` faz `.in('status', ['aberto','vencido'])`; `GrupoEconomicoView` idem; `FornecedorView`/`ClienteView` filtram `status === 'vencido'` | Status persistido em alguns pontos, derivado em outros — inconsistente |
| 4 | GlobalSearch | Filtra entidades por permissão, mas `filteredNavigation` e `filteredActions` ignoram `requires` e módulos disabled | Expõe ações/módulos indevidos |
| 5 | Exclusão definitiva | `useIsAdmin` aceita `administracao:visualizar` como equivalente a admin | Permissão genérica concede destrutivo |
| 6 | Formas de pagamento | Coexistem `boleto`/`cartao` (legado) e `boleto_dda`/`cartao_credito`/`cartao_debito` em `FormasPagamento.tsx`, `FluxoCaixa.tsx`, `EditarPagamentoNotaModal.tsx`, `OrcamentoCondicoesCard.tsx`, `QuickAddFormaPagamentoModal.tsx`, `admin/sections/FinanceiroSection.tsx` | Divergência entre módulos |
| 7 | Parser XML | Dois parsers (`src/lib/nfeXmlParser.ts` e `src/services/fiscal/nfeXmlParser.service.ts`) | Duplicação; extração financeira (pag/dup/cobr) precisa consolidação |
| 8 | Bancos × Fornecedores | `bancos.fornecedor_id` já existe (migration 20260501005820); UI sem busca/vínculo explícito | Coluna sem fluxo de UI |
| 9 | Componentes grandes | `Fiscal.tsx` (>1500 linhas), `OrcamentoForm.tsx`, `EmitirNFeWizard.tsx`, `NotaFiscalEditModal.tsx`, `Conciliacao.tsx`, `Logistica.tsx`, `Produtos.tsx`, `DataTable.tsx` | Manutenção difícil |

## 2. Severidade

- **Críticos** (bloqueiam UX/segurança): #1, #2, #5
- **Alto impacto** (inconsistência de dados/relatórios): #3, #4, #6, #7
- **Melhorias**: #8, #9

## 3. Tipos de alteração

- **Migrations**: nova permissão `excluir_definitivo`; normalização legada `boleto→boleto_dda` e `cartao→cartao_credito` em tabelas de dados (com rollback seguro); índice e validação em `bancos.fornecedor_id` (NOT NULL futuro).
- **Apenas código**: GlobalSearch, status vencido derivado, atalho pedidos-compra, parser XML, refatorações.
- **UI/UX**: badges "Em breve" em Faturamento/Chave/QR, dialogs informativos, busca de fornecedor para bancos.

## 4. Riscos

- Normalização de `forma_pagamento` em produção pode quebrar relatórios legados → usar UPDATE idempotente + view de compatibilidade temporária.
- `excluir_definitivo` mal aplicado → bloquear até verificar em ambiente de teste.
- Refatorar `Fiscal.tsx`/`OrcamentoForm.tsx` em PRs separados; testar smoke a cada extração.

## 5. Plano em fases

### Fase 1 — Correções críticas e de navegação

**5.1 Faturamento/Chave/QR como "Em breve"**
- `src/lib/navigation.ts`: marcar item Faturamento com `disabled: true` e `badge: 'Em breve'` (mover para padrão `directPath` desabilitado, manter na lista para não quebrar `headerIcons`).
- `src/App.tsx`: substituir os elementos das rotas `/faturamento`, `/faturamento/cadastros`, `/faturamento/emitir` por componente `<EmBreve modulo="Faturamento"/>` (criar em `src/components/EmBreve.tsx`). **Não remover** os imports lazy — apenas comentar com `// @em-breve` para preservar estrutura.
- `src/pages/Fiscal.tsx`: nos botões "Buscar por Chave" (L1127) e "Ler QR/Código" (L1141), substituir `onClick` por handler que dispara `toast.info('Em breve')`; aplicar `disabled` visual mantendo aria-label.
- `src/components/navigation/GlobalSearch.tsx`: filtrar `flatNavItems` removendo itens cuja seção tenha `disabled: true`; bloquear seleção e exibir badge "Em breve".

**5.2 Atalho `/pedidos-compra/novo`** — Opção B (menor risco)
- `src/lib/navigation.ts`: alterar quickAction `novo-pedido-compra` para `path: '/pedidos-compra'` adicionando query `?new=1`, ou para a rota de criação existente do módulo Compras (verificar `PedidosCompra.tsx` para o gatilho atual de criação).
- Confirmação alternativa (Opção A): adicionar `<Route path="/pedidos-compra/novo" element={<PedidoCompraForm/>}/>` ANTES de `:id` em `App.tsx`. Decidir após inspecionar `PedidoCompraForm` quanto ao tratamento de `id === 'novo'`.

**5.3 GlobalSearch — permissões e estado**
- Em `GlobalSearch.tsx`:
  - `filteredActions`: filtrar `quickActions` com `item.requires ? can(item.requires) : true`.
  - `filteredNavigation`: filtrar `flatNavItems` por:
    - permissão de seção (mapear `sectionKey → resource`, reutilizar `useVisibleNavSections`);
    - excluir seções `disabled` ou cujo `directPath` esteja em "Em breve".
  - Recent searches: ao selecionar entidade/ação que aponte para módulo desabilitado, abrir aviso "Em breve".

**5.4 Status vencido derivado**
- `src/lib/financeiro.ts`: garantir export `getEffectiveStatus(status, vencimento, hoje)` retornando `'vencido'` quando `(status === 'aberto' || 'parcial') && vencimento < hoje`.
- Substituir queries:
  - `src/components/dashboard/PendenciasList.tsx` L57: `.in('status', ['aberto','vencido'])` → `.in('status', ['aberto','parcial'])` e calcular vencido por data.
  - `src/components/views/GrupoEconomicoView.tsx` L106 idem.
  - `FornecedorView.tsx` / `ClienteView.tsx`: usar `getEffectiveStatus`.
- `src/lib/statusSchema.ts`: marcar `vencido` como derivado (comentário/flag), manter no enum apenas para exibição.
- Manter cron `marcar_lancamentos_vencidos` apenas como fallback (avaliar deprecar em fase 2).

**Critérios de aceite Fase 1**
- Botões Chave/QR não executam ação real.
- `/faturamento*` mostra tela "Em breve".
- Quick action "Novo Pedido de Compra" abre criação correta.
- Busca global respeita permissões e oculta módulos "Em breve".
- Nenhuma tela depende de `status='vencido'` persistido.

---

### Fase 2 — Padronização de formas de pagamento e baixas

- **Migration**: UPDATE idempotente em `financeiro_lancamentos.forma_pagamento`, `financeiro_baixas.forma_pagamento`, `nota_fiscal_pagamentos.forma_pagamento`, mapeando `boleto→boleto_dda`, `cartao→cartao_credito` (default conservador, com log).
- Atualizar UIs: `FormasPagamento.tsx`, `FluxoCaixa.tsx`, `EditarPagamentoNotaModal.tsx`, `OrcamentoCondicoesCard.tsx`, `QuickAddFormaPagamentoModal.tsx`, `OrcamentoPdfTemplate*.tsx`, `OrcamentoPublico.tsx`, `admin/sections/FinanceiroSection.tsx`, `utils/comercial.ts` para usar valores canônicos.
- Centralizar enum em `src/lib/financeiro.ts` (`FORMAS_PAGAMENTO_CANONICAS`).
- Validar fluxo de baixas (individual/lote/fatura) já alinhado às RPCs unificadas anteriores.

### Fase 3 — Bancos × Fornecedores e cartões

- UI em `ContasBancarias.tsx`/`Bancos`: campo de busca de fornecedor (CNPJ, razão social, fantasia) + botão "Vincular fornecedor existente".
- Listar bancos sem `fornecedor_id` em alerta administrativo.
- Após cobertura ≥95%, migration que torna `fornecedor_id NOT NULL`.
- Reforçar fluxo de cartões/faturas (já parcialmente implementado).

### Fase 4 — Parser XML e geração financeira

- Consolidar `src/lib/nfeXmlParser.ts` + `src/services/fiscal/nfeXmlParser.service.ts` em um único módulo (`src/services/fiscal/nfeXmlParser.service.ts` como fonte; `lib/nfeXmlParser.ts` reexporta).
- Garantir extração de `pag/detPag`, `cobr/fat`, `dup`, vencimentos, parcelas.
- Em `useNFeXmlImport`: ao gerar financeiro, usar forma canônica (`boleto_dda`/`cartao_credito`); exigir cartão cadastrado quando cartão de crédito; idempotência por chave da nota.

### Fase 5 — Exclusão definitiva ADM

- Migration: criar permissão `excluir_definitivo` (em `permissions` + RLS de `permanent_delete_*` RPCs).
- `useIsAdmin.ts`/`AdminRoute.tsx`: para destrutivo usar `hasRole('admin') && can('excluir_definitivo')`; manter `administracao:visualizar` apenas para acesso a telas admin.
- Revisar `permanentDeleteRecord` em `fiscal.service.ts` para cobrir `financeiro_lancamentos`, `notas_fiscais`, `orcamentos`, `pedidos`, `clientes`, `fornecedores`, `produtos` via RPC transacional que remove vínculos exclusivos.
- Auditoria: registrar em `audit_log` toda exclusão definitiva.

### Fase 6 — Refatoração técnica

Ordem por risco × ganho:

1. **`Fiscal.tsx`** — extrair: `useFiscalFilters`, `useFiscalActions`, `FiscalToolbar`, `FiscalChaveSection`. Risco: alto (muitos drawers); testar com smoke `fluxo-fiscal`.
2. **`OrcamentoForm.tsx`** — extrair `useOrcamentoForm`, `OrcamentoItemsTable`, `OrcamentoTotalsPanel`. Smoke `fluxo-venda`.
3. **`EmitirNFeWizard.tsx`** — separar steps em arquivos próprios (já wizard).
4. **`NotaFiscalEditModal.tsx`** + **`NotaFiscalDrawer.tsx`** — compartilhar `useNotaFiscalEditor`.
5. **`Conciliacao.tsx`** — separar parser OFX, lista, ações.
6. **`Produtos.tsx`** / **`Logistica.tsx`** / **`DataTable.tsx`** — extrações pontuais (hooks `usePrefs`, virtualização já isolada).

Após cada extração: rodar `bunx vitest run` e smoke tests do módulo.

## 6. Critérios de aceite por fase

- **F1**: itens 5.1–5.4 acima.
- **F2**: nenhuma referência a `'boleto'`/`'cartao'` legado fora de mapeamentos de exibição; relatórios reconhecem novos valores; baixas mantêm consistência banco/caixa.
- **F3**: 100% dos bancos com `fornecedor_id` ou marcados em alerta; busca funcional; relatórios bancários inalterados.
- **F4**: XML com duplicatas/boleto/cartão gera financeiro correto; sem duplicidade por reimport.
- **F5**: apenas admin com `excluir_definitivo` executa exclusão; auditoria registrada; sem órfãos.
- **F6**: arquivos alvo abaixo de 500 linhas; testes verdes.

## 7. Próximo prompt recomendado (Fase 1)

> "Executar Fase 1: criar `src/components/EmBreve.tsx`; substituir rotas `/faturamento*` em `App.tsx` por `<EmBreve modulo='Faturamento'/>`; marcar Faturamento como `disabled` + `badge: 'Em breve'` em `navigation.ts`; desabilitar botões Chave/QR em `Fiscal.tsx` exibindo toast 'Em breve'; corrigir quick action `novo-pedido-compra` (Opção B); em `GlobalSearch.tsx` filtrar `quickActions` por `requires` e `flatNavItems` por permissão+seções habilitadas; trocar queries `status='vencido'` por `['aberto','parcial']` + `getEffectiveStatus` em `PendenciasList.tsx`, `GrupoEconomicoView.tsx`, `FornecedorView.tsx`, `ClienteView.tsx`."
