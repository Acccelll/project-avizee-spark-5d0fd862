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

**Fase 3 — Médios / Mobile / Banco (dívida técnica registrada)**
- Itens detalhados na seção "Dívida técnica" abaixo. Não há nada pendente nas Fases 1 e 2 além dos três itens 2.x explicitados.

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

**2.6 — `useNFeXmlImport` checa `nfe_distribuicao` antes de aplicar (A-07)** · 🟡 Médio · ~2h
- `src/pages/fiscal/hooks/useNFeXmlImport.ts`: após `verificarDuplicidadeChave` e antes de retornar `NFeXmlImportResult`, fazer `supabase.from('nfe_distribuicao').select('id, ciencia_em, status').eq('chave_acesso', nfe.chaveAcesso).maybeSingle()`.
- Se existir registro com ciência: `toast.info("XML já recebido por DistDFe em <data>. Use o caminho automático para evitar duplicidade.")` + adicionar campo opcional `distdfeRef` no `NFeXmlImportResult` para o caller exibir CTA.
- **Pronto quando:** XML manual cuja chave já está em `nfe_distribuicao` aciona toast informativo; importação prossegue (não bloqueia).

#### Bloco B — Segurança e robustez (Fase 3)

**EF-03 — Sanitização de logs nas edge functions** · 🟡 Médio · ~3h
- Criar `supabase/functions/_shared/sanitize.ts` com `sanitizeForLog(payload)` removendo: `pfxBase64`, `pfxPassword`, `password`, `Authorization`, `apikey`, `x-pfx-*`, conteúdo de XML assinado (`<Signature>...</Signature>`).
- Aplicar em todos `console.log/error` de `sefaz-proxy`, `sefaz-distdfe`, `process-distdfe-cron`, `consultadanfe-proxy`.
- **Pronto quando:** `supabase functions logs sefaz-proxy` não exibe segredo nenhum em runs com PFX.

**M-01 — `health` oculta `hasPfxPassword` para não-admins** · 🟢 Baixo · ~30min
- `sefaz-proxy/index.ts` action `health`: usar `requireAnyPermission(userId, [{resource:'faturamento_fiscal', action:'admin_fiscal'}])` para decidir se inclui `hasPfxPassword` e `pfxExpiraEm` no response.
- **Pronto quando:** usuário com apenas `visualizar` recebe `health` sem campos sensíveis.

**M-02 — `lerConfigFiscalEmpresa` falha explicitamente sem `crt`/`ambiente`** · 🟢 Baixo · ~30min
- `src/services/fiscal/sefaz.service.ts`: se `crt` ou `ambiente` ausentes, `throw new Error("Configuração fiscal incompleta: defina CRT e ambiente em /fiscal/configuracao antes de transmitir.")` em vez de aplicar defaults silenciosos.

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
3. [ ] **2.6** Cross-check `nfe_distribuicao` em `useNFeXmlImport` com toast informativo.
4. [ ] **EF-03** `sanitizeForLog` aplicado em todas edge functions fiscais.
5. [ ] **M-01 + M-02 + M-05** Hardening de pequenos vazamentos e UX do certificado.
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
