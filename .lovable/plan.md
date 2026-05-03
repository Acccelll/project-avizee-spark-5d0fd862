# Revisão Geral do ERP AviZee — Diagnóstico e Plano

> Baseado no estado real do projeto inspecionado (rotas em `src/App.tsx`, 184 migrations, ~120 tabelas/views públicas, ~60 páginas, ~50 services). Itens não confirmados estão marcados como **pendente de validação**.

---

## 1. Resumo executivo

O AviZee é um ERP modular (React + Vite + Tailwind + Supabase/Lovable Cloud) com cobertura ampla: cadastros, comercial, compras, logística, fiscal, financeiro, faturamento, relatórios (workbook/apresentação), social e administração. A base é **funcional e consistente**, com padrões já estabelecidos (V2 wrappers, STATUS_VARIANT_MAP, useSupabaseCrud, RLS + RBAC via `user_permissions`).

Os pontos de atenção atuais são:
- **Financeiro:** após a importação de NF-e, alguns ajustes finos de UX permanecem (filtros, coluna Pessoa, criação de contas) — já parcialmente corrigidos. A base de dados **não tem duplicidade real** por (NF, parcela), confirmado por query (`dup_nf_parc=0`, `nf_dup_chave=0`).
- **Fiscal:** importação XML está estável e idempotente, mas geração financeira a partir da NF tem regras dispersas e a UI de DDA/boleto é incompleta.
- **Cadastros:** vínculo banco↔fornecedor↔conta bancária é frouxo (sem FK obrigatória de `contas_bancarias.banco_id` para `bancos`/`fornecedores`).
- **UI/UX:** já há padronização (V2), mas sobram telas legadas (`Faturamento.legacy.tsx`) e pequenas inconsistências mobile.
- **Qualidade técnica:** 184 migrations acumuladas, alguns hooks/serviços grandes; sem riscos de build aparentes, mas com débito de organização.

Nenhum risco crítico de perda de dados foi identificado neste momento.

## 2. Mapa de módulos (estado real)

| Módulo | Rotas principais | Tabelas-chave |
|---|---|---|
| Dashboard | `/` | views agregadas |
| Cadastros | `/produtos` `/clientes` `/fornecedores` `/transportadoras` `/funcionarios` `/formas-pagamento` `/grupos-economicos` `/socios` | produtos, clientes, fornecedores, transportadoras, funcionarios, formas_pagamento, grupos_economicos, socios |
| Comercial | `/orcamentos` `/pedidos` | orcamentos, ordens_venda |
| Compras | `/cotacoes-compra` `/pedidos-compra` | cotacoes_compra, pedidos_compra, recebimentos_compra |
| Logística | `/logistica` `/remessas/*` | remessas, remessa_etiquetas, frete_simulacoes |
| Estoque | `/estoque` | estoque_movimentos, vw_estoque_posicao |
| Fiscal | `/fiscal` `/fiscal/novo` `/fiscal/:id` `/fiscal/distdfe-historico` `/fiscal/dashboard` | notas_fiscais, notas_fiscais_itens, nfe_distribuicao, eventos_fiscais |
| Faturamento | `/faturamento` `/faturamento/cadastros` `/faturamento/emitir` | matriz_fiscal, naturezas_operacao |
| Financeiro | `/financeiro` `/contas-bancarias` `/cartoes-credito` `/fluxo-caixa` `/conciliacao` `/contas-contabeis-plano` `/financeiro/budget` | financeiro_lancamentos, financeiro_baixas, contas_bancarias, cartoes_credito, cartao_faturas, conciliacao_bancaria |
| Relatórios | `/relatorios` `/relatorios/workbook-gerencial` `/relatorios/apresentacao-gerencial` | vw_workbook_*, vw_apresentacao_* |
| Administração | `/administracao` `/migracao-dados` `/auditoria` `/admin/audit-duplicidades` | user_roles, user_permissions, auditoria_logs, app_configuracoes |
| Configurações | `/configuracoes` `/perfil` (alias) | user_preferences, empresa_config |
| Social | `/social` (feature flag) | social_contas, social_posts |

## 3. Principais riscos identificados

1. **Vínculo frouxo banco/fornecedor/conta bancária** — risco de inconsistência futura na conciliação e em DDA.
2. **Geração financeira a partir da NF** — regras espalhadas; risco de divergência condição×parcelas×forma_pagamento (especialmente "à vista").
3. **Telas legadas em produção** (`Faturamento.legacy.tsx`) — risco de retrabalho e confusão de UX.
4. **Permissões "Em breve"** — algumas rotas/ações abertas sem gate visível ao usuário (pendente de validação por módulo).
5. **Cartões de crédito** — `cartoes_credito` existe mas tabela está vazia (0 linhas). Fluxo fatura×lançamento ainda incompleto.
6. **Conciliação bancária** — UI funcional, mas dependência forte de regras de matching ainda não documentadas.
7. **Migrations acumuladas (184)** — não é risco operacional, mas dificulta manutenção e onboarding.

## 4. Diagnóstico por módulo (resumido)

> Para cada item: **P** = Prioridade (C/A/M/B), **Tipo** = (DB/Code/UX/Decisão).

### Cadastros
- [A][DB] FK e UNIQUE em `contas_bancarias(banco_id → bancos.id)` e vínculo opcional `fornecedor_id` para representar "banco como fornecedor".
- [M][UX] Padronizar Quick-Add em todos os pickers (cliente/produto/fornecedor já existem; faltam transportadora e forma_pagamento — pendente de validação).
- [M][Code] Validar regras de unicidade no front (CPF/CNPJ, código produto) com Zod uniforme.

### Comercial (Orçamentos/Pedidos)
- [M][UX] Conferir consistência de status (STATUS_VARIANT_MAP) entre orçamento e pedido.
- [M][Code] Verificar conversão Orçamento→Pedido (idempotência) — pendente de validação.

### Compras
- [M][Code] Recebimento parcial e atualização de estoque por `recebimentos_compra_itens` (revisar trigger atual).
- [B][UX] Padronizar drawer de cotação propostas.

### Logística
- [B][UX] Unificar estados vazios em `/logistica` (3 abas).
- [A][Code] Etiqueta Correios — confirmar bucket `etiquetas-correios` ativo e fluxo de cancelamento.

### Estoque
- [A][DB] Reforçar `trg_estoque_movimentos_sync` (já existe) com testes; checar reconciliação `estoque_atual` vs `vw_estoque_posicao`.

### Fiscal (ver §6)
### Financeiro (ver §5)

### Faturamento
- [C][Code] Remover/ocultar `Faturamento.legacy.tsx` se não houver mais consumo.
- [A][Decisão] Confirmar quais ações do wizard de emissão NF-e devem ficar como "Em breve".

### Relatórios / Workbook / Apresentação
- [M][Code] Validar consistência de fontes (vw_apresentacao_* vs vw_workbook_*).
- [B][UX] Carregamento progressivo (skeletons) em slides pesados.

### Administração / Configurações
- [A][Code] Auditoria de revogação de sessões (admin-users edge function) — confirmar funcionamento.
- [M][UX] `/perfil` ainda é alias legado — manter ou remover? **Decisão do usuário**.

### Social
- [B][Decisão] Manter feature flag `VITE_FEATURE_SOCIAL` ou promover a 1ª classe.

## 5. Financeiro — diagnóstico aprofundado

**Confirmado por query no banco real:**
- `financeiro_lancamentos`: 481 linhas; **0 duplicatas** por (nota_fiscal_id, parcela_numero) entre ativos.
- `notas_fiscais`: 394 linhas; **0 duplicatas** por chave_acesso.
- `contas_bancarias`: 2 linhas; `cartoes_credito`: 0.

**Conclusão sobre "duplicidade":** o que o usuário observou na tela são **parcelas legítimas** (1/3, 2/3, 3/3) — não há duplicação real no banco. UX precisa diferenciar visualmente (badge de parcela já existe mas pode estar discreto).

**Pontos a tratar:**
1. [C][UX] Coluna Pessoa: já corrigida com fallback (Banco/Cartão/"—" só em casos sem nada). Validar com o usuário.
2. [C][DB] Filtro `cartao` no MultiSelect: já restaurado. Validar.
3. [C][DB] Permissão de criar conta bancária: já liberada para role `financeiro`. Validar.
4. [A][UX] **Indicador visual de parcela** nas linhas (ex: "2/3" como sufixo do título e ordenação sugerida por documento_pai_id).
5. [A][Code] Revisar lógica de "à vista" — atualmente importação cria com `status='aberto'`, `valor_pago=0`. Confirmar regra: à vista importado deve nascer aberto (para baixa manual) ou pago automaticamente quando vier de NF-e marcada como liquidada?
6. [A][Code] Baixa em lote: validar comportamento quando títulos têm contas bancárias diferentes.
7. [A][Code] Conciliação: revisar matching `vw_conciliacao_eventos_financeiros` × extrato.
8. [M][DB] Cartão de crédito × Fatura × Lançamento: definir RPC `gerar_fatura_cartao(mes, ano)` antes de habilitar UI.
9. [M][UX] Filtros: persistir últimos filtros por usuário (já temos `useDataTablePrefs`).
10. [B][Code] Limpar `financeiro_lancamentos_backup_20260428` após validação.

**Riscos de regressão:** mexer em RPCs de baixa (multi-item) sem testes pode quebrar histórico. Toda alteração precisa preservar `financeiro_baixas` como log imutável.

## 6. Fiscal — diagnóstico aprofundado

**Funcional:**
- Importação XML idempotente (chave_acesso UNIQUE).
- DistDFe sync (`nfe_distdfe_sync`), histórico em `/fiscal/distdfe-historico`.
- Eventos fiscais (`eventos_fiscais`, `nota_fiscal_eventos`).

**Incompleto / a revisar:**
1. [A][Code] Geração de financeiro a partir da NF: regra de detecção de condição (à vista/parcelado/boleto) e mapeamento para `forma_pagamento_id`.
2. [A][UX] DDA/boleto: campo presente mas sem UI de upload/leitura; manter como "Em breve" até definição.
3. [M][Code] Consulta por chave + QR: validar fallback quando SEFAZ rejeita.
4. [M][DB] Garantir trigger que impede edição de NF autorizada (somente eventos de cancelamento).
5. [B][UX] FiscalDashboard: revisar cards e fontes.

**Decisão operacional necessária:** quando a NF fiscal entrar como "à vista pago no ato", deve gerar lançamento `pago` ou `aberto`?

## 7. UI/UX e responsividade

- [A][UX] Remover/arquivar `Faturamento.legacy.tsx`.
- [M][UX] Padronizar `EmptyState` vs `DetailEmpty` (memória já existe — auditar uso real).
- [M][UX] Mobile: revisar tabs com `shortLabel` em Configurações e Comercial (já documentado).
- [M][UX] Auditar uso de wrappers V2 — toda nova tela deve usar `DataTableV2`, `ViewDrawerV2`, `FormModal`, `AdvancedFilterBar`, `SummaryCard`, `StatusBadge`.
- [B][UX] Ações primárias vs secundárias: revisar drawers do Financeiro/Fiscal.

## 8. Banco / Migrations

- [A][DB] **Migration nova:** FK `contas_bancarias.banco_id` → `bancos.id` (nullable mas constrained); coluna `fornecedor_id` opcional para representar "banco como fornecedor".
- [A][DB] **Migration nova:** índice composto `financeiro_lancamentos(documento_pai_id, parcela_numero)` para acelerar render por grupo.
- [M][DB] Auditar `chk_` constraints em status (memória já existe — validar cobertura).
- [M][DB] Revisar `search_path = public` em todas as funções (rodar `supabase--linter`).
- [B][DB] Squashing futuro de migrations (apenas plano, não imediato).

## 9. Permissões

- [A][Code] Auditar uso de `can(resource, action)` em ações sensíveis (excluir, cancelar, baixar). Mapear gaps por módulo.
- [M][Code] Padronizar exibição "Em breve" com `<DisabledByPermission reason="em_breve" />` (criar wrapper se não existir).
- [M][DB] Revisar matriz de `user_permissions` por role: admin, financeiro, estoquista, vendedor.

## 10. Integrações

| Integração | Estado | Ação |
|---|---|---|
| XML/NF-e (sefaz-proxy) | Funcional | Documentar limites de timeout |
| Correios (etiqueta) | Funcional | Validar cancelamento |
| Cartões | Não iniciado | Definir modelo fatura×lançamento |
| Bancos (extrato) | Conciliação manual | Avaliar OFX no futuro |
| AI Gateway | Funcional (apresentação) | OK |
| Email (pgmq) | Funcional | OK |

## 11. Qualidade técnica

- [A][Code] Quebrar hooks/services >500 linhas (mapear via `wc -l src/hooks/* src/services/*` na execução).
- [M][Code] Eliminar `@ts-nocheck` remanescentes.
- [M][Code] Centralizar tipagem em `src/types/domain.ts` (já é convenção — auditar drift).
- [B][Code] Remover `Faturamento.legacy.tsx`, `OrcamentoForm.test.tsx` se obsoleto, mocks não usados.

---

## Plano de execução em fases

### Fase 1 — Estabilização crítica
**Objetivo:** garantir que financeiro/fiscal/importação não geram dados incorretos.
- Validar correções recentes (Pessoa column, filtro cartão, criar conta bancária).
- Confirmar regra "à vista importado" (decisão do usuário).
- Adicionar indicador visual de parcela no grid financeiro.
- Linter Supabase + corrigir `search_path`.
**Aceite:** zero regressão; usuário valida visualmente os 3 pontos.

### Fase 2 — Financeiro & Fiscal
- Revisar geração de financeiro a partir de NF (RPC documentada).
- Conciliação: melhorar matching e UI.
- Cartão de crédito MVP: cadastro + fatura placeholder ("Em breve" claro).
- Limpar `financeiro_lancamentos_backup_20260428` após auditoria.

### Fase 3 — Cadastros & relacionamentos
- ✅ `contas_bancarias.banco_id` agora `NOT NULL`; índices em `banco_id` e `fornecedor_id`.
- ✅ Quick-Add criado para Transportadora (`QuickAddTransportadoraModal`) e Forma de Pagamento (`QuickAddFormaPagamentoModal`).
- ✅ Validações Zod uniformes já cobertas em `src/lib/validationSchemas.ts` (cliente/fornecedor/produto/transportadora) — DV de CPF/CNPJ via `validators.ts`.
- Pendente: integrar os novos modais nos pickers reais (RemessaForm, OrcamentoForm, EmitirNFeWizard) — Fase 4.

### Fase 4 — UI/UX & padronização
- ✅ Removido `src/pages/Faturamento.legacy.tsx` (sem referências no código).
- ✅ Plug `QuickAddTransportadoraModal` em `RemessaForm` (botão + ao lado do select; recarrega lista após criar).
- ✅ Plug `QuickAddFormaPagamentoModal` em `Clientes` (link "Cadastrar nova forma" abaixo do select).
- ✅ Auditoria EmptyState vs DetailEmpty: drawers/views (Cliente, Fornecedor, Produto, Funcionário, Transportadora, FormaPagamento, GrupoEconomico, EstoquePosicao, ContaBancaria, Financeiro) migrados para `DetailEmpty` (memória `empty-state-vs-detail-empty`).
- ✅ Mobile fine-tuning: Configurações já cobre tabs/shortLabel/sticky-save (perfil/segurança); Financeiro já tem cards mobile + bottom-sheets; Comercial (Orçamentos/Pedidos) ganhou `mobileIdentifierKey` (nº) + `mobileInlineActions` (Ver/Editar).

### Fase 5 — Permissões & segurança operacional
- ✅ Wrapper `<EmBreve>` criado em `src/components/EmBreve.tsx` (modo `badge` + `wrap` com Tooltip + disabled). Aplicado em `Fiscal.tsx` (Buscar por chave / QR), `BackupSection`, `NotificacoesSection`.
- ✅ Gates `can()` no Financeiro: ações **Baixar** (rowExtraActions + mobilePrimaryAction) usam `<PermissionGate resource="financeiro" action="baixar" mode="disable">`; `FinanceiroDrawer` agora respeita `financeiro:baixar` (Baixa/Estorno), `financeiro:editar` (Editar) e `financeiro:cancelar|excluir` (Cancelar). Botões somem para quem não tem permissão.
- 🔎 Mapa de gaps `can()` por módulo (próximas iterações):
  - **Cadastros (Clientes/Fornecedores/Produtos/Transportadoras/Funcionários):** `onDelete` no `DataTable` chama `remove(id)` direto — recomendar envolver botão Excluir com `<PermissionGate resource="<recurso>" action="excluir" mode="disable">` ou validar no service.
  - **Comercial (Orçamentos/Pedidos):** Aprovar/Cancelar/Converter sem `can()` visível — adicionar `pedidos:aprovar`, `pedidos:cancelar`, `orcamentos:aprovar`.
  - **Compras:** Recebimento parcial e cancelamento de pedido sem gate (`compras:confirmar`, `compras:cancelar`).
  - **Estoque:** Ajustes manuais devem exigir `estoque:editar` (atual sem verificação no UI).
  - **Fiscal:** Cancelamento NF / Carta de correção precisam `faturamento_fiscal:cancelar` e `faturamento_fiscal:admin_fiscal`.
  - **Administração:** já gated via `AdminRoute`. Revogação de sessão (admin-users) — confirmar logs.
- ⏳ Revisão admin-users (revogação de sessão): edge function `supabase/functions/admin-users/index.ts` (662 linhas) — auditoria pendente.
- ✅ Gates `can()` em **cadastros** (Excluir oculto sem permissão): Clientes (`clientes:excluir`), Fornecedores (`fornecedores:excluir`), Produtos (`produtos:excluir`), Transportadoras (`transportadoras:excluir`), FormasPagamento (`formas_pagamento:excluir`), Funcionários (`administracao:visualizar`), GruposEconomicos (`clientes:excluir|administracao:visualizar`).
- ✅ Gate `can("orcamentos:aprovar")` em **Comercial/Orcamentos** (Aprovar desktop+mobile) — substitui check `isAdmin` puro por permissão real, com fallback admin.

### Fase 6 — Integrações & evoluções
- Cartões: fatura→lançamento (RPC + UI).
- DDA/boleto: definição + MVP.
- Avaliar OFX para conciliação.

### Fase 7 — Limpeza técnica
- Quebrar hooks/services grandes.
- Centralização de tipos.
- Plano de squashing de migrations.

---

## Pontos que precisam de decisão do usuário

1. **À vista importado da NF:** nascer `aberto` (atual) ou `pago` quando a NF indicar liquidação no ato?
2. **`/perfil` legado:** manter alias ou remover?
3. **Cartão de crédito MVP:** quais cartões cadastrar primeiro? Bandeiras suportadas?
4. **DDA/boleto:** habilitar leitura de boleto agora ou manter "Em breve"?
5. **Social:** promover ou manter atrás de feature flag?
6. **Faturamento legacy:** confirmar remoção?

## Próximo prompt recomendado (para iniciar Fase 1)

> "Execute a Fase 1: (a) rodar supabase linter e corrigir search_path nas funções; (b) adicionar coluna visual de parcela (ex: '2/3') no grid `/financeiro` ordenando por documento_pai_id; (c) responder minhas decisões: à vista importado deve nascer aberto, /perfil pode ser removido, faturamento legacy pode ser removido. Aplique migrations e mostre testes manuais a serem feitos."
