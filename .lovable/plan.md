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

**2.1 — Paginação server-side em `Fiscal.tsx` (A-01)** · 🟠 Alto · ~1d
- Migration: RPC `listar_notas_fiscais_ids(p_filtros jsonb, p_offset int, p_limit int)` retornando `(ids uuid[], total bigint)`. Filtros: `periodo_de/ate`, `tipo`, `status` (ERP), `status_sefaz`, `modelo`, `serie`, `cliente_id`, `fornecedor_id`, `busca` (numero/chave/razao). `SECURITY DEFINER`, `SET search_path = public`, RLS por `auth.uid()` via `has_role`.
- Migration: RPC `kpis_fiscal(p_periodo_de date, p_periodo_ate date)` agregando `vw_fiscal_kpis` server-side.
- Hook novo `src/pages/fiscal/hooks/useNotasFiscaisPaged.ts` (espelha `useFinanceiroLancamentosPaged`): chama RPC de IDs → reidrata via `from('notas_fiscais').select(... relacionais ...).in('id', ids)`.
- `Fiscal.tsx`: trocar `useSupabaseCrud` por hook paginado, mover filtros do client para `p_filtros`, KPIs do `useFiscalKpis` para a RPC nova.
- **Pronto quando:** lista carrega em <500 ms com 50k notas; sem `select('*')` cliente; KPIs idem.

**2.5 — Throttle DistDFe server-side (EF-02)** · 🟠 Alto · ~4h
- Migration: tabela `sefaz_consulta_log (id, cnpj text, action text, created_at timestamptz default now())` + index `(cnpj, action, created_at desc)`. RLS: `service_role` only.
- Migration: RPC `sefaz_consulta_pode_disparar(p_cnpj text, p_action text, p_janela_seg int default 3600, p_max int default 18) returns boolean`. `SECURITY DEFINER`, `SET search_path = public`. Insere log e retorna `false` se excedeu.
- `supabase/functions/sefaz-distdfe/index.ts`: antes de cada `consultar-chave`/`consultar-nsu`, chama a RPC; se `false`, devolve `429 { error: 'rate_limited', janela_seg, max }`. Bypass para SERVICE_ROLE (cron) permanece.
- **Pronto quando:** 19ª chamada na mesma hora retorna 429; cron continua funcionando.

**2.6 — `useNFeXmlImport` checa `nfe_distribuicao` antes de aplicar (A-07)** · ✅ entregue · usa `data_manifestacao`/`status_manifestacao` (schema real) e expõe `distdfeRef` no `NFeXmlImportResult`.

#### Bloco B — Segurança e robustez (Fase 3)

**EF-03 — Sanitização de logs nas edge functions** · ✅ entregue · `_shared/sanitize.ts` + integração no `createLogger`.
**M-01 — `health` oculta `hasPfxPassword` para não-admins** · ✅ entregue · gating via `hasAnyPermission`.
**M-02 — `lerConfigFiscalEmpresa` falha explicitamente** · ✅ entregue · sem mais defaults silenciosos.

**M-05 — `CertificadoValidadeAlert` global em `AppLayout`** · 🟡 Médio · ~2h
- Mover componente de `Fiscal.tsx` para `src/components/layout/AppLayout.tsx`, exibido apenas quando `pfxExpiraEm <= 30 dias` e usuário tem `faturamento_fiscal:visualizar`. Dismiss persistido em `user_preferences`.

#### Bloco C — Backlog estrutural (Fase 3 — abrir como issues separadas)

- **EF-04** — Fila `nfe_emissao_pendente` para retry de timeouts SEFAZ (tabela + worker `process-nfe-retry-cron` com backoff exponencial). 🟠 Alto · ~1d
- **BK-01/02/03** — Auditoria das RPCs `confirmar_nota_fiscal`, `gerar_devolucao_nota_fiscal`, `cancelar_nota_fiscal_sefaz`: garantir `SECURITY DEFINER`, `SET search_path = public`, validação de permissão dentro da função, transações atômicas. 🟠 Alto · ~6h
- **M-04** — `EXPLAIN ANALYZE` em `vw_fiscal_kpis` + criar índices faltantes (provável `notas_fiscais(empresa_id, periodo_emissao, status)`). 🟡 Médio · ~3h
- **D-01** — Marcar `NotaFiscalEditModal` (48 KB) como `@deprecated` e migrar callers restantes para `/fiscal/:id` (página). 🟠 Alto · ~1d
- **D-02** — `ConfiguracaoFiscal` em 4 abas (Empresa Fiscal · Certificado A1 · Numeração · DistDFe/Schedules). 🟢 Baixo · ~2h

#### Bloco D — Mobile (Fase 3 — após Bloco A/B)

- **MB-03** — Auditar touch targets em `Fiscal.tsx`/`FiscalDetail.tsx`/`SefazAcoesPanel`: ≥44px conforme `scripts/lint-touch-targets.mjs`. 🟢 Baixo · ~2h
- **MB-04** — `TraducaoXmlDrawer` em mobile: bottom-sheet full-height + sticky footer + cards por linha. 🟡 Médio · ~2h
- Salvar padrões em `mem://produto/fiscal-mobile.md` (já existe — apenas atualizar com decisões da onda).

---

### Próxima onda — Lista de tarefas (ordem sugerida)

1. [ ] **2.1** RPCs `listar_notas_fiscais_ids` + `kpis_fiscal` + hook `useNotasFiscaisPaged` + refactor `Fiscal.tsx`.
2. [ ] **2.5** Migration `sefaz_consulta_log` + RPC throttle + integração em `sefaz-distdfe`.
3. [x] **2.6** Cross-check `nfe_distribuicao` em `useNFeXmlImport` com toast informativo.
4. [x] **EF-03** `sanitizeForLog` aplicado em todas edge functions fiscais.
5. [x] **M-01 + M-02** Hardening de pequenos vazamentos. Resta **M-05** (CertificadoValidadeAlert global no AppLayout).
6. [ ] **BK-01/02/03** Auditoria das 3 RPCs fiscais críticas (`SECURITY DEFINER`, `search_path`, permissões).
7. [ ] **EF-04** Fila de retry para emissões com timeout SEFAZ.
8. [ ] **M-04 + D-01 + D-02** Performance KPIs, deprecação do modal e abas em ConfiguracaoFiscal.
9. [ ] **MB-03 + MB-04** Mobile: touch targets + tradução XML em bottom-sheet.

---

### Verificação contínua
- `tsc --noEmit` verde após cada lote.
- `supabase--linter` após cada migration (zero `warn`/`error`).
- Smoke contra `sefaz-proxy`/`sefaz-distdfe` com tokens admin × leitura-only.
- `scripts/lint-touch-targets.mjs` verde antes de fechar Bloco D.
