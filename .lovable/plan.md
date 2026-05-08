## Plano — Onda 7: Hardening do Módulo Fiscal e Faturamento

### Status

**Fase 1 — Críticos (concluída)**
- ✅ **1.1** `BuscarPorChaveDialog` migrado para `consultarNFePorChave` (cache `nfe_distribuicao` → `sefaz-distdfe consultar-chave`). `consultadanfe-proxy` permanece como fallback opcional sob `VITE_FEATURE_FALLBACK_CONSULTADANFE`.
- ✅ **1.2** `sefaz-proxy` e `sefaz-distdfe` autorizam por permissão fiscal via helper `_shared/permissions.ts` (`requireAnyPermission`). `process-distdfe-cron` usa SERVICE_ROLE para bypass.
- ✅ **1.3** `fiscalInternalStatusMap` reduzido a 5 valores canônicos (rascunho/pendente/confirmada/importada/cancelada). `canEditFiscal`/`isFiscalReadOnly`/`isFiscalStructurallyLocked` agora aceitam `(status, statusSefaz)`.

**Fase 2 — Altos (parcial)**
- ✅ **2.2** `/faturamento` deixou de ser "Em breve". Hub real com 4 cards (Emitir, Backlog, Cadastros, Documentos), permissão por ação. `lib/navigation.ts` ganhou sub-itens canônicos.
- ✅ **2.3** `verificarDuplicidadeChave` agora retorna `DuplicidadeChaveInfo` rica (`id, numero, serie, status, status_sefaz`) com flag `ignorarCanceladas`. `useNFeXmlImport` usa o contexto na mensagem de erro.
- ✅ **2.7** `useSefazAcoes` ganhou mutual exclusion por ação (`pendingByAction.transmitir/consultar/cancelar`) — dois cliques rápidos não disparam duas RPCs concorrentes.
- ✅ **M-03** `InutilizacaoDrawer` já valida `motivo.length >= 15` client-side antes de habilitar o botão (verificado).
- ⏳ **2.1 / 2.5 / 2.6** — pendentes (paginação server-side, throttle DistDFe, checagem `nfe_distribuicao` no `useNFeXmlImport`).

**Fase 3 — Médios (parcial — esta sessão)**
- ✅ **EF-03** `sanitizeForLog` em `_shared/sanitize.ts` aplicado via `createLogger` (extra é sempre serializado sanitizado). `consultadanfe-proxy` (único console.log direto) também migrado.
- ✅ **M-01** Action `health` do `sefaz-proxy` agora oculta `hasPfxPassword` para usuários sem `faturamento_fiscal:admin_fiscal` (helper novo `hasAnyPermission`).
- ✅ **M-02** `lerConfigFiscalEmpresa` falha explicitamente com mensagem orientando `/fiscal/configuracao` quando CRT/ambiente ausentes (sem mais defaults silenciosos `crt='1'`/`ambiente='2'`).
- ✅ **2.6** `useNFeXmlImport` faz cross-check com `nfe_distribuicao` (status_manifestacao/data_manifestacao); toast informativo + campo `distdfeRef` no resultado.
- Demais itens de Fase 3 detalhados na seção "Dívida técnica" abaixo.

---

### Dívida técnica — Próxima onda (Onda 8: Fiscal Hardening II)

Ordenado por prioridade de execução. Cada item já tem escopo, arquivos-alvo e critério de pronto.

#### Bloco A — Performance e idempotência (Fase 2 residual)

**2.1 — Paginação server-side em `Fiscal.tsx` (A-01)** · ✅ entregue · RPC `listar_notas_fiscais_ids(p_date_from, p_date_to, p_tipos, p_status, p_status_sefaz, p_modelos, p_origens, p_fornecedores, p_clientes, p_search, p_order_by, p_ascending, p_offset, p_limit)` (STABLE, `search_path=public`) + índices (`ativo+data_emissao desc`, `status`, `status_sefaz`, `fornecedor_id`, `cliente_id`). Hook `useNotasFiscaisPaged` (mesmo padrão de `useFinanceiroLancamentosPaged` — RPC de IDs → reidrata `notas_fiscais` com joins via `IN`). `Fiscal.tsx` substitui `useSupabaseCrud` por hook paginado + `serverPagination` no `DataTable`; KPIs continuam via `kpis_fiscal`.

**2.5 — Throttle DistDFe server-side (EF-02)** · 🟠 Alto · ~4h
- ✅ entregue · Tabela `sefaz_consulta_log` (RLS on, sem policies — só service_role acessa) + RPC `sefaz_consulta_pode_disparar(cnpj, action, janela_seg=3600, max=18)` `SECURITY DEFINER` com `search_path=public`. `sefaz-distdfe` chama a RPC antes de montar o SOAP; resposta `429 { codigoTransporte: 'RATE_LIMITED', janelaSeg, max }` quando estourado. SERVICE_ROLE (cron `process-distdfe-cron`) continua bypass via `user.isService`.

**2.6 — `useNFeXmlImport` checa `nfe_distribuicao` antes de aplicar (A-07)** · ✅ entregue · usa `data_manifestacao`/`status_manifestacao` (schema real) e expõe `distdfeRef` no `NFeXmlImportResult`.

#### Bloco B — Segurança e robustez (Fase 3)

**EF-03 — Sanitização de logs nas edge functions** · ✅ entregue · `_shared/sanitize.ts` + integração no `createLogger`.
**M-01 — `health` oculta `hasPfxPassword` para não-admins** · ✅ entregue · gating via `hasAnyPermission`.
**M-02 — `lerConfigFiscalEmpresa` falha explicitamente** · ✅ entregue · sem mais defaults silenciosos.

**M-05 — `CertificadoValidadeAlert` global em `AppLayout`** · 🟡 Médio · ~2h
- ✅ entregue · montado uma única vez em `src/components/AppLayout.tsx` acima do `<Outlet />`, com query gated por `useCan('faturamento_fiscal:visualizar')`. Removido das páginas `Fiscal.tsx`, `FiscalDashboard.tsx` e `Cte.tsx`. Variante `dismissible` apenas para janela 8–30 dias, persistida em `user_preferences` (chave por `validadeFim` — ao renovar, o alerta volta). Vermelho/expirado nunca pode ser dispensado.

#### Bloco C — Backlog estrutural (Fase 3 — abrir como issues separadas)

- ✅ **EF-04** entregue · Tabela `nfe_emissao_pendente` (RLS on, sem policies — só SR), RPCs `nfe_emissao_pendente_listar_proximo_lote(p_limit)` (FOR UPDATE SKIP LOCKED, marca `processando` atomicamente) e `nfe_emissao_pendente_concluir(p_id, p_sucesso, p_erro, p_protocolo)` (backoff exponencial 1→32 min, máx 6 tentativas). Edge function `process-nfe-retry-cron` (gate CRON_SECRET + SR) processa lote de 5/run, invoca `sefaz-proxy` (`enviar-sem-assinatura-vault`), atualiza `notas_fiscais.status/status_sefaz/protocolo_sefaz` em sucesso. Cron `*/5 * * * *` agendado.
- ✅ **BK-01/02/03** entregue · helper `has_fiscal_permission(action)` (SECURITY DEFINER, search_path=public) usado como gate no topo das 3 RPCs. SR/cron continua bypass via `auth.uid() IS NULL`. Permissões: confirmar = `criar` ou `editar`; cancelar SEFAZ = `cancelar_sefaz` ou `admin_fiscal`; devolução = `criar` ou `editar`. Lógica original (estoque/financeiro/eventos/advisory locks) preservada integralmente.
- ✅ **M-04** entregue · Índices compostos em `notas_fiscais` (`ativo+data_emissao+status` parcial WHERE ativo, `tipo` parcial, `modelo_documento` parcial) cobrindo o WHERE da `kpis_fiscal`. Soma-se aos índices simples já existentes.
- ✅ **D-01** entregue (parcial) · `NotaFiscalEditModal` marcado com JSDoc `@deprecated` orientando novos callers a usar `/fiscal/:id/editar`. Caminho mobile já navega para a página dedicada; desktop continuará usando o modal até a migração completa (próxima onda).
- ✅ **D-02** entregue · `ConfiguracaoFiscal` agora usa `<Tabs>` com 4 abas (Empresa Fiscal · Certificado A1 · Numeração · DistDFe). Aba DistDFe é informativa, com link para `/fiscal/distdfe` e nota do throttle ativo (18/h).

#### Bloco D — Mobile (Fase 3 — após Bloco A/B)

- **MB-03** — Auditar touch targets em `Fiscal.tsx`/`FiscalDetail.tsx`/`SefazAcoesPanel`: ≥44px conforme `scripts/lint-touch-targets.mjs`. 🟢 Baixo · ~2h
- ✅ **MB-04** entregue · `TraducaoXmlDrawer` agora detecta mobile via `useIsMobile`, usa `Sheet side="bottom"` com altura 95vh, header/conteúdo/footer em colunas flex (footer fixo com botões `min-h-11 flex-1`). Layout dos cards já era responsivo (`grid-cols-1 md:grid-cols-[1fr_auto_1fr]`).
- Salvar padrões em `mem://produto/fiscal-mobile.md` (já existe — apenas atualizar com decisões da onda).

---

### Próxima onda — Lista de tarefas (ordem sugerida)

1. [ ] **2.1** RPCs `listar_notas_fiscais_ids` + `kpis_fiscal` + hook `useNotasFiscaisPaged` + refactor `Fiscal.tsx`.
2. [x] **2.5** Migration `sefaz_consulta_log` + RPC throttle + integração em `sefaz-distdfe`.
3. [x] **2.6** Cross-check `nfe_distribuicao` em `useNFeXmlImport` com toast informativo.
4. [x] **EF-03** `sanitizeForLog` aplicado em todas edge functions fiscais.
5. [x] **M-01 + M-02 + M-05** Hardening de pequenos vazamentos e alerta global de certificado em `AppLayout`.
6. [x] **BK-01/02/03** Gate de permissão nas 3 RPCs fiscais críticas via `has_fiscal_permission`.
7. [ ] **EF-04** Fila de retry para emissões com timeout SEFAZ.
8. [ ] **M-04 + D-01 + D-02** Performance KPIs, deprecação do modal e abas em ConfiguracaoFiscal.
9. [ ] **MB-03 + MB-04** Mobile: touch targets + tradução XML em bottom-sheet.

**Onda 8 — concluída.** Pendente apenas:
- MB-03 (auditoria de touch targets em Fiscal/SefazAcoesPanel) — backlog Onda 9.
- D-01 finalização: migrar callers desktop do `NotaFiscalEditModal` para `/fiscal/:id/editar` e excluir o componente — backlog Onda 9.

---

### Verificação contínua
- `tsc --noEmit` verde após cada lote.
- `supabase--linter` após cada migration (zero `warn`/`error`).
- Smoke contra `sefaz-proxy`/`sefaz-distdfe` com tokens admin × leitura-only.
- `scripts/lint-touch-targets.mjs` verde antes de fechar Bloco D.

---

## Onda 9 — Hardening Relatórios / Workbook / Apresentação (em curso)

### 9.1 Críticos — CONCLUÍDO
- [x] **C-01/DP-01/DP-04** Helper `fetchAllPages` + paginação universal nos 6 loaders (`financeiro, comercial, compras, estoque, cadastros, divergencias`). Hard cap 50k.
- [x] **C-02** `vencido` removido como status persistido em `loaders/financeiro` (queries `.in()` e `isOpen`); status efetivo derivado de `atraso > 0`.
- [x] **C-03** Migration backfill `apresentacao_comentarios.tags_json.tags`; fallback substring `'indispon'` removido de `ApresentacaoGerencial`.
- [x] **C-04** `formatRegistry` canônico + `formatValue` por registry (sem heurística `key.includes`).

### 9.2 Performance/Resiliência — pendente
### 9.2 Performance/Resiliência — CONCLUÍDO
- [x] **A-01** Caps explícitos no Workbook (`WorkbookCaps` parametrizáveis + `WORKBOOK_CAPS_DEFAULT`). `fetchWorkbookData` retorna `capsApplied` por listagem; `00_Capa` mostra nota visual com cap atingido.
- [x] **A-04** `AbortController` real:
  - `generateWorkbook` aceita `signal`; threading para `fetchWorkbookData` (que já honrava); cada etapa custosa (template, fetch, write) faz `signal.throwIfAborted()`.
  - `gerarWorkbook` service propaga signal e marca status `cancelado` quando aborta.
  - `WorkbookGerencial.tsx` mantém `abortRef` por mutation; `WorkbookGeracaoDialog` ganha botão "Cancelar geração" quando `isGenerating`.
  - Mesma estrutura espelhada em `gerarApresentacao` + `ApresentacaoGeracaoDialog` + `ApresentacaoGerencial.tsx`.
- [x] **A-05** Helper `src/lib/supabase/fromUntyped.ts` (também exportado como `sbu`) consolida o cast `(supabase as any).from(...)`. Migrado em `workbookGenerator.service.ts`, `fetchWorkbookData.ts`, `apresentacaoService.ts` e `fetchPresentationData.ts`. `supabase` segue importado para chamadas de `storage`.
- [x] **A-06** `useRelatoriosFavoritos` agora emite toast explícito (`success` ou `warning`) quando a migração local→DB ocorre, evitando a sensação de "favoritos sumiram".

### 9.3 UX/Mobile — pendente
### 9.3 UX/Mobile — parcial
- [x] **A-07** `RelatorioChart` agrega cauda em "Outros" para pie/bar quando série > 12 pontos; linha mantém eixo temporal completo. Aviso visual quando trunca.
- [x] **M-04** Catálogo de Relatórios: busca casa também o título da categoria (ex.: "comercial" lista todos os relatórios da seção).
- [x] **MB-04** `DreTable` em mobile renderiza cards verticais (header/subtotal/resultado/deducao com tons distintos) em vez da tabela de duas colunas.
- [x] **MB-03** Auditado — `RelatorioChart` já usa `h-56 min-h-[224px] w-full` com `ResponsiveContainer minHeight=200`. Sem regressão.
- [ ] **A-03** Derivações reaproveitáveis no loader (mover do component para o service). — backlog 9.4
- [ ] **M-01/02/03/05/06** staleTime por tipo, badge "atualizando", chip regime DRE, validação modo fechado, bloqueio aprovação sem comentários. — backlog 9.4
- [ ] **MB-05** Progresso de export (streaming). — backlog 9.4

### 9.4 Refatorações — pendente
- [ ] D-01 decompor `Relatorios.tsx`. M-07 auditar `apresentacao-cadencia-runner`. DP-03/05 EXPLAIN views + N+1.
