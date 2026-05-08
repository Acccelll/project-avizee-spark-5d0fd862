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

- **EF-04** — Fila `nfe_emissao_pendente` para retry de timeouts SEFAZ (tabela + worker `process-nfe-retry-cron` com backoff exponencial). 🟠 Alto · ~1d
- ✅ **BK-01/02/03** entregue · helper `has_fiscal_permission(action)` (SECURITY DEFINER, search_path=public) usado como gate no topo das 3 RPCs. SR/cron continua bypass via `auth.uid() IS NULL`. Permissões: confirmar = `criar` ou `editar`; cancelar SEFAZ = `cancelar_sefaz` ou `admin_fiscal`; devolução = `criar` ou `editar`. Lógica original (estoque/financeiro/eventos/advisory locks) preservada integralmente.
- **M-04** — `EXPLAIN ANALYZE` em `vw_fiscal_kpis` + criar índices faltantes (provável `notas_fiscais(empresa_id, periodo_emissao, status)`). 🟡 Médio · ~3h
- **D-01** — Marcar `NotaFiscalEditModal` (48 KB) como `@deprecated` e migrar callers restantes para `/fiscal/:id` (página). 🟠 Alto · ~1d
- ✅ **D-02** entregue · `ConfiguracaoFiscal` agora usa `<Tabs>` com 4 abas (Empresa Fiscal · Certificado A1 · Numeração · DistDFe). Aba DistDFe é informativa, com link para `/fiscal/distdfe` e nota do throttle ativo (18/h).

#### Bloco D — Mobile (Fase 3 — após Bloco A/B)

- **MB-03** — Auditar touch targets em `Fiscal.tsx`/`FiscalDetail.tsx`/`SefazAcoesPanel`: ≥44px conforme `scripts/lint-touch-targets.mjs`. 🟢 Baixo · ~2h
- **MB-04** — `TraducaoXmlDrawer` em mobile: bottom-sheet full-height + sticky footer + cards por linha. 🟡 Médio · ~2h
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

---

### Verificação contínua
- `tsc --noEmit` verde após cada lote.
- `supabase--linter` após cada migration (zero `warn`/`error`).
- Smoke contra `sefaz-proxy`/`sefaz-distdfe` com tokens admin × leitura-only.
- `scripts/lint-touch-targets.mjs` verde antes de fechar Bloco D.
