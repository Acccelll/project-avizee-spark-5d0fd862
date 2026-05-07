
# Onda 7 — Revisão End-to-End: Fiscal & Faturamento

## 1. Resumo da Onda 7

A Onda 7 cobre todo o domínio fiscal do AviZee: emissão e recebimento de NF-e, ciclo de vida (rascunho → confirmada → autorizada/cancelada), eventos SEFAZ (CC-e, cancelamento, inutilização, manifestação), DistDFe, importação/tradução de XML, certificado A1 (Storage privado + Vault), edge functions (`sefaz-proxy`, `sefaz-distdfe`, `process-distdfe-cron`, `consultadanfe-proxy`) e o esqueleto do módulo Faturamento (em breve, atalho para Pedidos).

Estado atual:
- `Fiscal.tsx` ainda é god component (~1.500 linhas após extração de `NfeCreateFormModal`).
- `FiscalDetail` foi descontinuada (D-2) → redirect para `/fiscal?nf=:id`.
- Lifecycle confirmar/estornar/devolver migrado para RPCs atômicas (idempotentes via guards `NOT EXISTS`).
- DistDFe roda via Cron + edge `sefaz-distdfe` (mTLS direto Deno ou Worker opt-in via `SEFAZ_USE_MTLS_PROXY`).
- Busca por chave hoje usa `consultadanfe-proxy` (oficial), `BuscarPorChaveDialog` está ATIVO.
- Faturamento existe como atalho/EmptyState; sub-rotas `/faturamento/cadastros` e `/faturamento/emitir` são `EmBreve`.

## 2. Fluxos fiscais mapeados

```text
EMISSÃO (saída)
  /fiscal → "Nova NF" → NfeCreateFormModal → upsertNotaFiscalComItens (RPC salvar_nota_fiscal)
    → Confirmar NF (RPC confirmar_nota_fiscal) → estoque_movimentos + financeiro_lancamentos (idempotente)
    → SefazAcoesPanel → autorizar (sefaz-proxy assinar-e-enviar-vault)
    → registrar_retorno_sefaz (status_sefaz=autorizada, protocolo, xml)
    → eventos: CC-e / Cancelar SEFAZ / Inutilizar

RECEBIMENTO (entrada)
  Cron process-distdfe-cron → sefaz-distdfe consultar-nsu (mTLS A1)
    → docZip (procNFe/resNFe) → nfe_distribuicao (XML preservado)
    → Manifestação Destinatário (drawer)
    → Importação XML (manual upload OU "puxar do DistDFe") → useNFeXmlImport
       → parser → match fornecedor (CNPJ) + produtos (SKU) → TraducaoXmlDrawer
       → upsertNotaFiscalComItens (origem=importacao_xml) → Confirmar (entrada → contas a pagar + entrada de estoque)

DEVOLUÇÃO
  NotaFiscalDrawer → Devolução → DevolucaoDialog → RPC gerar_devolucao_nota_fiscal
    → cria NF tipo oposto vinculada → confirmar gera movimento contrário

CONSULTA POR CHAVE / SCANNER
  BuscarPorChaveDialog → consultadanfe-proxy (API pública)
  FiscalChaveScannerDialog → câmera/QR → mesmo fluxo
```

## 3. Problemas críticos (P0)

1. **Busca por chave não está desativada** apesar do enunciado da revisão sugerir o contrário. `BuscarPorChaveDialog` segue chamando `consultadanfe-proxy` (terceiro). Decisão necessária: manter como oficial (memória já diz isso) ou colocar feature flag até validar custo/SLA.
2. **`confirmar_nota_fiscal` não valida `status_sefaz`** — uma NF de saída pode ser "confirmada" (gerando estoque/financeiro) antes da autorização SEFAZ; se rejeitada depois, estoque/financeiro já foram tocados. Há guarda em estorno mas não no fluxo direto.
3. **`confirmar_nota_fiscal` insere `financeiro_lancamentos` sem `cliente_id`/`fornecedor_id` checados pelo `tipo`** — entrada com `cliente_id` preenchido pode gerar conta a receber espúria. Falta `CASE` por `v_tipo_fin`.
4. **`process-distdfe-cron` roda com `verify_jwt = false`** sem evidência de header secret/HMAC. Risco de invocação anônima.
5. **`upsertNotaFiscalComItens` permite editar NF já confirmada/autorizada** se RPC `salvar_nota_fiscal` não bloquear (precisa confirmar trigger `trg_nf_protege_edicao`).

## 4. Problemas altos (P1)

6. **`Fiscal.tsx` continua god component (1.500 linhas)** — falta extrair `FiscalDanfeViewer` e `FiscalDevolucaoFlow` (decisão D-3 já aprovada).
7. **`useFiscalKpis` + grid usam queries separadas** — sem paginação server-side, duplica round-trip e ignora limite de 1.000 linhas Supabase.
8. **`status` ERP e `status_sefaz` confundidos em filtros** — `useFiscalFilters` mantém ambos mas o badge mobile só mostra um eixo no card primário; risco de operação errada.
9. **Estorno não notifica módulos downstream** — `useEstornarNotaFiscal` invalida `notas_fiscais/estoque/financeiro` mas não `comercial` (devolução/OV) nem `compras` (vínculo pedido).
10. **`registrar_retorno_sefaz` aceita `xml_retorno` direto do client** — risco de payload inflar tabela; falta validação de tamanho/whitelist de tags.
11. **`sefaz-distdfe` lê `empresa_config` sem `empresa_id`** — single-tenant ainda hard-coded; quebra se Onda multi-tenant avançar.

## 5. Melhorias médias/baixas (P2/P3)

- Centralizar `STATUS_VARIANT_MAP` para `status_sefaz` (alguns chips usam cores hard-coded).
- DistDFeHistorico não tem PeriodFilter canônico (`/contrato-de-periodos`).
- `FiscalChaveScannerDialog` (611 linhas) merece extrair lógica de câmera para hook `useQrScanner`.
- `NotaFiscalForm.tsx` (página `/fiscal/novo`) e `NfeCreateFormModal` divergem em validações Zod vs handlers manuais — unificar via `NFeForm` + `nfeSchema`.
- Faturamento: rota `/faturamento/emitir` está EmBreve mas Comercial já gera NF a partir de Pedido — alinhar discoverability (link explícito).
- `consultadanfe-proxy` sem rate-limit por usuário.
- `CartaCorrecaoDrawer`/`InutilizacaoDrawer` não compartilham componente base de evento SEFAZ.

## 6. Problemas mobile

- Banner "Pendentes" mobile não respeita memória `produto/contrato-de-status` (cor `warning/10` pode colidir com tema dark).
- `NotaFiscalDrawer` mobile tem 3 tabs mas `Mais` não usa accordion — viola padrão `produto/configuracoes-mobile` (≥4 grupos).
- `NfeCreateFormModal` em mobile renderiza grid de itens sem o "card-list" — ItemsGrid horizontal estoura viewport <768px.
- Scanner QR não trata permissão negada com fallback de upload de imagem.

## 7. Problemas desktop

- Drawer de NF tem header com badge ERP+SEFAZ mas não exibe `protocolo` truncado clicável (copiar).
- Grid sem `useDataTablePrefs` → colunas não persistem.
- `FiscalDashboard` recharts sem `aria-busy` durante refetch.

## 8. Edge Functions / SEFAZ

- `sefaz-proxy` aceita `assinar-e-enviar` com cert vindo do client (modo legado). Manter apenas `*-vault` (D-?).
- `sefaz-distdfe`: log `proxySecretFp` expõe primeiros/últimos 4 chars do secret — ok p/ debug, mas remover em prod.
- Falta circuit breaker quando AN devolve cStat=656 (consumo indevido / bloqueio 1h) — atualmente loga mas o cron pode reentrar.
- `process-distdfe-cron` não verifica `cloud_status` antes de invocar.
- `consultadanfe-proxy` não logga `request_id` correlacionável.
- Nenhuma das funções fiscais publica métricas (sucesso/falha) em `app_configuracoes` ou tabela de telemetria.

## 9. Banco / RPC

- `confirmar_nota_fiscal`: faltam guards já citados (status_sefaz, tipo×parceiro).
- `gerar_devolucao_nota_fiscal`: não retorna lista de itens devolvidos parciais (só id).
- `cancelar_nota_fiscal_sefaz` não dispara estorno automático (memória diz que cancelar interno estorna; SEFAZ deveria também).
- Trigger `trg_nf_status_transicao` precisa whitelist explícita; não verificada agora.
- Faltam constraints `chk_` em `notas_fiscais.status_sefaz` e `tipo` (memória diz que é doutrina).
- Falta índice composto `(empresa_id, status, data_emissao desc)` — KPI/dashboard varrem tabela.

## 10. Frontend / services / hooks

- `useNotaFiscalLifecycle` invalida queries por string literal — usar `INVALIDATION_KEYS.fiscal.*`.
- `useNFeXmlImport` faz match O(n×m) de produtos — substituir por Map.
- `fiscal.service.ts` (442 linhas) mistura RPCs, lookups e empresa_config — quebrar em `nf-lifecycle.service`, `nf-eventos.service`, `nf-lookups.service`, `empresa-config.service`.
- `useSefazAcoes` (312 linhas) faz dupla chamada RPC para numeração — extrair para `nfeNumbering.service` (sequence atômica).
- `NotaFiscalForm.tsx` página vs `NfeCreateFormModal` modal: duas fontes de verdade do schema. Unificar.

## 11. Plano de Execução

### Sprint 7.1 — Segurança e idempotência (P0)

1. Migração: adicionar guards em `confirmar_nota_fiscal` (`status_sefaz NOT IN ('rejeitada','denegada','cancelada_sefaz')` para saída antes de tocar estoque/financeiro; `CASE` por `tipo` no INSERT financeiro com `cliente_id`/`fornecedor_id` corretos).
2. Migração: `cancelar_nota_fiscal_sefaz` chama estorno automático (mesma lógica de `estornar_nota_fiscal`).
3. Edge `process-distdfe-cron`: exigir header `X-Cron-Secret` (Vault `CRON_SECRET`); rejeitar 401 caso ausente.
4. Decidir busca-por-chave: confirmar `consultadanfe` como oficial (já registrado) e adicionar feature flag `VITE_FEATURE_BUSCA_CHAVE` para kill-switch.
5. Validar `salvar_nota_fiscal` bloqueia edição quando `status='confirmada'`.

### Sprint 7.2 — Decomposição Fiscal (P1) ✅ executado (parcial)

6. ✅ `FiscalDanfeViewer` extraído (`pages/fiscal/components/FiscalDanfeViewer.tsx`).
7. ✅ `FiscalDevolucaoFlow` extraído (`pages/fiscal/components/FiscalDevolucaoFlow.tsx`).
8. ✅ `fiscal.service.ts` virou facade re-exportando 5 submódulos em `services/fiscal/`:
    `eventos`, `lifecycle`, `sefaz`, `lookups`, `empresaConfig`.
9. ⏭️ Unificação `NFeForm` (página + modal) — adiada para Sprint 7.2.b.
10. ✅ `useQrScanner` extraído (`pages/fiscal/hooks/useQrScanner.ts`).

Resultado: `Fiscal.tsx` 1500→1461 linhas; `fiscal.service.ts` 442→48 (facade);
`FiscalChaveScannerDialog.tsx` 612→365.

### Sprint 7.3 — Performance e UX (P2)

11. Server-side pagination em `Fiscal` (refactor `useSupabaseCrud` ou `useTableCount`).
12. Persistir prefs do grid via `useDataTablePrefs`.
13. Índice `(empresa_id, status, data_emissao desc)` em `notas_fiscais`.
14. Map<sku, produto> em `useNFeXmlImport`.
15. Mobile: card-list de itens no `NfeCreateFormModal`, accordion em `Mais` do drawer, fallback de upload no scanner QR.

### Sprint 7.4 — Edge / SEFAZ hardening (P2)

16. Remover modo `assinar-e-enviar` (cert do client) do `sefaz-proxy`.
17. Circuit breaker cStat=656 no cron (parar 1h, registrar em `app_configuracoes`).
18. Remover `proxySecretFp` dos logs em produção.
19. Telemetria: tabela `fiscal_telemetria` (action, sucesso, latência, cStat) gravada por todas edges.
20. `cloud_status` check no início do cron.

### Sprint 7.5 — Faturamento (futuro)

21. Wizard `/faturamento/emitir`: select OV → preview NF → confirmar (já consome `salvar_nota_fiscal`).
22. Cadastros fiscais: CFOP/CST/Naturezas em `/faturamento/cadastros`.
23. Documentar diferença Faturamento vs Notas de Saída na UI (banner de origem).

### Critérios de aceite globais

- Nenhuma RPC fiscal sem `SET search_path = public` e `SECURITY DEFINER` declarados.
- Todos os triggers `trg_nf_*` continuam ativos após migrações.
- Testes de integração `fluxo-fiscal.test.ts` passam + 3 novos cenários (confirmar com SEFAZ rejeitada, cancelar SEFAZ aciona estorno, cron 401 sem secret).
- `Fiscal.tsx` < 800 linhas; `fiscal.service.ts` < 200 linhas por arquivo.
