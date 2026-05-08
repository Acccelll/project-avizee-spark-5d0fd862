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

**Fase 3 — Médios / Mobile / Banco**
- Registrados como dívida técnica para próximas ondas (M-01/M-02/M-04/M-05, EF-03/EF-04, BK-01/02/03, D-01/D-02, MB-03/MB-04).

---

### Itens pendentes (próxima onda)

**2.1 — Paginação server-side em `Fiscal.tsx` (A-01)**
- RPC `listar_notas_fiscais_ids` (filtros server-side: período, tipo, status ERP, status SEFAZ, modelo, série, cliente_id, fornecedor_id, busca cross-table) + `total_count`.
- Hook `useNotasFiscaisPaged` reidrata via `IN (ids)` preservando relacionais.
- KPIs por RPC dedicada `kpis_fiscal` (espelha `vw_fiscal_kpis`).

**2.5 — Throttle DistDFe server-side (EF-02)**
- Tabela `sefaz_consulta_log` (cnpj, ts, action) + RPC `sefaz_consulta_pode_disparar(cnpj, action, janela=3600s, max=18)`.
- `sefaz-distdfe` chama a RPC antes de qualquer `consultar-chave`; devolve 429 se exceder.

**2.6 — `useNFeXmlImport` checa `nfe_distribuicao` antes de aplicar (A-07)**
- Antes de `aplicarImportacaoXml`, `nfe_distribuicao.maybeSingle()` por `chave_acesso`.
- Mostrar `toast.info` com data de ciência + CTA "Abrir caminho automático".

**Fase 3 (para abrir como issues)**
- M-01: `health` esconde `hasPfxPassword` para não-admins.
- M-02: `lerConfigFiscalEmpresa` falha explicitamente sem `crt`/`ambiente`.
- M-04: EXPLAIN ANALYZE em `vw_fiscal_kpis`.
- M-05: `CertificadoValidadeAlert` global em `AppLayout`.
- EF-03: `sanitizeForLog` em `sefaz-proxy`/`sefaz-distdfe`.
- EF-04: backlog `nfe_emissao_pendente` (fila de retry).
- BK-01/02/03: auditoria das RPCs `confirmar_nota_fiscal`/`gerar_devolucao_nota_fiscal`/`cancelar_nota_fiscal_sefaz`.
- D-01: `@deprecated` em `NotaFiscalEditModal`.
- D-02: `ConfiguracaoFiscal` em 4 abas.
- MB-03/MB-04: touch targets ≥44px e mem `fiscal-mobile.md`.

---

### Verificação
- `tsc --noEmit` verde após cada lote.
- Smoke contra `sefaz-proxy`/`sefaz-distdfe` com tokens admin × leitura-only (manual).
