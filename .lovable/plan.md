## Plano — Onda 7: Hardening do Módulo Fiscal e Faturamento

### Status (parcial)
- ✅ **1.3** Limpado `fiscalInternalStatusMap` (5 valores canônicos). `canEditFiscal`/`isFiscalReadOnly`/`isFiscalStructurallyLocked` agora aceitam `(status, statusSefaz)`. `NotaFiscalEditModal` ajustado para passar ambos os eixos. tsc verde.
- ✅ **1.1** `BuscarPorChaveDialog` migrado para `consultarNFePorChave` (cache local → `sefaz-distdfe` action `consultar-chave`). `consultadanfe-proxy` agora é fallback opcional sob `VITE_FEATURE_FALLBACK_CONSULTADANFE`. Cache em `nfe_distribuicao` é gravado após sucesso na SEFAZ.
- ⏳ **1.2** sefaz-proxy `requireFiscalRole` — pendente.
- ⏳ **2.x / 3.x** — pendentes.

Aplicação faseada da auditoria. Foco inicial nos críticos (C-01/C-02/C-03), que tocam segurança (proxy SEFAZ), conformidade fiscal (via oficial DistDFe) e contrato canônico de status. Em seguida, consolidação UX/Faturamento e proteção contra abuso/duplicidade. Por fim, médios e mobile.

---

### Fase 1 — Críticos

**1.1 — `BuscarPorChaveDialog` migra para `sefaz-distdfe consultar-chave` (C-01 / SH-02)**
- Substituir `supabase.functions.invoke("consultadanfe-proxy", …)` por `invoke("sefaz-distdfe", { action: "consultar-chave", chNFe, ambiente })`.
- Estratégia 2 níveis (já documentada em `mem/features/fiscal-consulta-por-chave.md`):
  1) checar `nfe_distribuicao.xml_nfe WHERE chave_acesso = ?` (cache local + cron);
  2) fallback para `sefaz-distdfe`.
- Tratar `cStat` 137/138 com mensagem clara ("XML existe mas não é destinado ao CNPJ do A1 — solicite ao emissor").
- Manter `consultadanfe-proxy` apenas como fallback opcional sob `VITE_FEATURE_FALLBACK_CONSULTADANFE` (default `false`).
- Atualizar `mem/features/fiscal-busca-por-chave-flag.md` resolvendo o conflito com `fiscal-consulta-por-chave.md` (uma única narrativa: "DistDFe é oficial; consultadanfe é fallback opcional").

**1.2 — `sefaz-proxy` e `sefaz-distdfe` autorizam por permissão fiscal (C-02 / EF-01) ✅**
- ✅ Criado helper `supabase/functions/_shared/permissions.ts` (`requireAnyPermission`) que valida `user_permissions` via SERVICE_ROLE, respeita `expires_at` e dá bypass para `user_roles=admin`.
- ✅ `sefaz-proxy`: mapa `ACTION_PERMISSIONS` por action (`health`/`parse-certificado`/`assinar-e-enviar-vault`/`enviar-sem-assinatura-vault`) — admin_fiscal e roles operacionais (criar/cancelar/visualizar) liberam conforme criticidade. Mensagem 403 padronizada.
- ✅ `sefaz-distdfe`: ambas as actions (`consultar-nsu`/`consultar-chave`) exigem ao menos `faturamento_fiscal:visualizar` (admin global ignora). Bypass automático quando o Authorization é o SERVICE_ROLE (chamadas internas do `process-distdfe-cron`).
- ✅ `process-distdfe-cron` agora envia `Authorization: Bearer <SERVICE_ROLE>` em vez de `ANON_KEY` para se identificar como invocação privilegiada na chamada interna do `sefaz-distdfe`.

**1.3 — Limpar `fiscalInternalStatusMap` — separar ERP × SEFAZ (C-03)**
- `FiscalInternalStatus` reduzido a 5 valores canônicos: `rascunho · pendente · confirmada · importada · cancelada`.
- Remover `autorizada · rejeitada · cancelada_sefaz · inutilizada` do `fiscalInternalStatusMap`/`fiscalInternalStatusOptions` (continuam apenas em `fiscalSefazStatusMap`/`fiscalSefazStatusOptions`).
- Ajustar `canEditFiscal`/`isFiscalReadOnly`/`isFiscalStructurallyLocked` para deixar de ler status SEFAZ e passarem a receber, quando necessário, ambos os eixos (`status` e `statusSefaz`).
- Auditar consumidores (`Fiscal.tsx` filtros, `NotaFiscalDrawer`, `NotaFiscalEditModal`, `NotaFiscalView`, `NotaFiscalForm`, `useFiscalFilters`) — todos já usam `getFiscalSefazStatus` para o eixo SEFAZ; só precisam parar de propagar valores SEFAZ ao mapa interno.
- Atualizar testes de `fiscalStatus` se houver.

---

### Fase 2 — Altos

**2.1 — Paginação server-side em `Fiscal.tsx` (A-01 / SH-03)**
- Mesmo padrão da Onda 6 (Financeiro 1.4): nova RPC `listar_notas_fiscais_ids` com filtros server-side (período de emissão, `tipo`, `tipo_operacao`, `status`, `status_sefaz`, `modelo`, `serie`, `cliente_id`, `fornecedor_id`, `busca` cross-table por número/chave/razão social) + `total_count`.
- Hook novo `useNotasFiscaisPaged` reidrata via `IN (ids)` preservando `select` relacional (clientes, fornecedores, ordens_venda).
- KPIs do header passam por RPC dedicada `kpis_fiscal` (alinhada à `vw_fiscal_kpis`, M-04).
- Remover/normalizar `useFiscalFilters` para passar a operar sobre filtros canônicos enviados ao server.

**2.2 — `/faturamento` deixa de ser "Em breve" (A-02)**
- Substituir `FaturamentoIndex` por hub real listando 4 cards: **Emitir NF-e** (`/faturamento/emitir`), **Backlog** (`/faturamento/backlog`), **Cadastros fiscais** (`/faturamento/cadastros`), **Consulta de documentos** (`/faturamento/documentos`).
- Cada card com permissão (`PermissionGate resource="faturamento_fiscal" action=…`) e descrição curta.
- `lib/navigation.ts`: remover `disabled: true`/`badge: 'Em breve'` de `/faturamento`; adicionar sub-itens no menu lateral (Emitir, Backlog, Documentos, Cadastros).
- Atualizar `mem/features/faturamento-fiscal` se existir.

**2.3 — `verificarDuplicidadeChave` retorna contexto rico (A-03)**
- Trocar boolean por `Promise<{ id, numero, serie, status, status_sefaz } | null>`.
- Atualizar callers (BuscarPorChaveDialog, useNFeXmlImport, EmitirNFeWizard) para mostrar mensagem precisa: "Já existe NF #1234/1, status: Cancelada SEFAZ".
- Filtrar opcionalmente por `status NOT IN ('cancelada', 'cancelada_sefaz', 'inutilizada')` quando o caller quiser apenas duplicidade ativa.

**2.4 — Mems consolidadas (A-04)**
- Reescrever `mem/features/fiscal-busca-por-chave-flag.md` para apontar `sefaz-distdfe` como via oficial; consultadanfe como fallback condicional.
- Adicionar nota em `mem/features/fiscal-consulta-por-chave.md` referenciando o flag.
- Garantir que ambas referenciem o mesmo hook (`useNFeXmlImport`) e os mesmos cStat tratados.

**2.5 — Throttle DistDFe server-side (EF-02)**
- Nova tabela `sefaz_consulta_log` (cnpj, ts, action) + RPC `sefaz_consulta_pode_disparar(p_cnpj text, p_action text, p_janela int default 3600, p_max int default 18)` com janela deslizante.
- `sefaz-distdfe` chama a RPC antes de qualquer `consultar-chave`; se exceder, devolve 429 `{erro: 'Throttle local: aguarde para evitar bloqueio cStat 656'}`.
- Frontend mantém `localStorage` apenas como UX (feedback antecipado), mas a verdade é server-side.

**2.6 — `useNFeXmlImport` checa `nfe_distribuicao` antes de aplicar (A-07)**
- Antes de `aplicarImportacaoXml`, query `nfe_distribuicao.maybeSingle()` por `chave_acesso`.
- Se já existe e `ciencia_realizada=true`, mostrar `toast.info` com data e CTA "Abrir caminho automático" (não bloqueia, apenas avisa).
- Se já existe NF efetivamente criada (via `verificarDuplicidadeChave` rica), bloquear com mensagem específica.

**2.7 — `useSefazAcoes` ganha mutual exclusion (SH-01)**
- Trocar `pending` boolean único por `useActionLock` por ação (`transmitir`, `cancelar`, `inutilizar`, `manifestar`, `cartaCorrecao`).
- Garante que dois cliques rápidos não disparam duas RPCs concorrentes na mesma NF.

**2.8 — Auditorias dedicadas (A-05 / A-06 / MB-01 / MB-02)**
- Criar issues separadas (no plan, marcadas como tarefas posteriores) para:
  - revisão de `process-distdfe-cron` (idempotência por NSU, throttle global, isolamento por empresa);
  - revisão de `EmitirNFeWizard` (validação cross-step, persistência rascunho, CFOP automático, `<pag>`);
  - QA mobile de `NotaFiscalDrawer` e `EmitirNFeWizard`.
- Estas auditorias **não** são executadas nesta onda — apenas registradas como dívida técnica.

---

### Fase 3 — Médios / Mobile / Banco

- **M-01**: `health` esconde `hasPfxPassword` para não-admins. ✓ (implementado junto a 1.2).
- **M-02**: `lerConfigFiscalEmpresa` falha explicitamente se `crt`/`ambiente` não configurados (em vez de fallback Simples + Homologação).
- **M-03**: `InutilizacaoDrawer` valida client-side `motivo.length >= 15` antes de chamar a RPC.
- **M-04**: medir custo de `vw_fiscal_kpis` (EXPLAIN ANALYZE em volume real); se for caro, materializar via RPC `kpis_fiscal` consumida em 2.1.
- **M-05**: mover `CertificadoValidadeAlert` para `AppLayout` global, gated por `useCan('faturamento_fiscal:editar') || isAdmin`. Banner some quando o admin já viu (cooldown via `useUserPreference`).
- **EF-03**: auditar `log.info` em `sefaz-proxy`/`sefaz-distdfe` para garantir que XMLs assinados, senhas e `certificado_base64` nunca são serializados; introduzir helper `sanitizeForLog`.
- **EF-04**: documentar em `docs/fiscal-modelo-estrutural.md` a ausência de fila de retry e abrir backlog para implementar `nfe_emissao_pendente` com backoff (não nesta onda).
- **BK-01/02/03**: auditoria das RPCs `confirmar_nota_fiscal`, `gerar_devolucao_nota_fiscal`, `cancelar_nota_fiscal_sefaz` (advisory lock real, soma de devoluções acumuladas, fluxo estorno→edição). Pequenos ajustes via migration se necessário.
- **D-01**: marcar `NotaFiscalEditModal` como `@deprecated` e direcionar todas as edições para `NotaFiscalForm` (`/fiscal/:id/editar`) — remoção do modal em onda futura.
- **D-02**: refatorar `ConfiguracaoFiscal` em 4 abas (Empresa · Certificado · DistDFe · SEFAZ) usando o padrão canônico de tabs.
- **MB-03**: ajustar touch targets do `FiscalChaveScannerDialog` (botões ≥ 44 px sobrepostos à câmera) e `BuscarPorChaveDialog` (ações principais com `min-h-11`).
- **MB-04**: registrar fluxo mobile do `TraducaoXmlDrawer` em `mem/produto/fiscal-mobile.md`.

---

### Detalhes Técnicos

**Migrations** (independentes; podem entrar em ondas separadas):
1. `*_fiscal_listar_ids_kpis.sql` — RPCs `listar_notas_fiscais_ids` + `kpis_fiscal`.
2. `*_sefaz_consulta_log.sql` — tabela `sefaz_consulta_log` + RPC `sefaz_consulta_pode_disparar`.
3. `*_fiscal_status_constraints.sql` — opcionalmente endurecer `chk_` para evitar gravação de status SEFAZ no campo ERP (defesa em profundidade do C-03).

**Edge Functions** alteradas:
- `sefaz-proxy`: novo `requireFiscalRole`, `health` filtrado.
- `sefaz-distdfe`: `requireFiscalRole`, chamada à RPC de throttle.
- `consultadanfe-proxy`: inalterada (segue funcionando como fallback opcional).

**Frontend** alterado: `BuscarPorChaveDialog`, `FaturamentoIndex` (reescrito), `lib/navigation.ts`, `lib/fiscalStatus.ts`, `services/fiscal/sefaz.service.ts`, `useNFeXmlImport`, `useSefazAcoes`, `Fiscal.tsx`, `useFiscalFilters`, `CertificadoValidadeAlert`, `InutilizacaoDrawer`, `ConfiguracaoFiscal`, `NotaFiscalEditModal` (deprecation comment), `FiscalChaveScannerDialog`/`BuscarPorChaveDialog` (touch).

**Verificação por fase**: `vitest run fiscal && tsc --noEmit`. Para 1.2/2.5, smoke test contra `sefaz-proxy`/`sefaz-distdfe` com tokens de papéis distintos (admin × leitura-only).

**Ordem sugerida**: 1.1 → 1.2 → 1.3 → 2.3/2.4/2.6/2.7 (em paralelo lógico, baixo risco) → 2.2 (UX) → 2.5 (migration + edge) → 2.1 (maior, isolado) → Fase 3.

Posso começar pela Fase 1 ou priorizar outro bloco se preferir.
