## Onda 10 — Auditoria Verificada e Plano de Ação

### Verificação dos achados críticos (executada antes do plano)

| ID | Achado | Verificação | Veredicto |
|----|--------|-------------|-----------|
| C-01 | `social-sync` sem autenticação | Confirmado: `Deno.serve` não chama `getClaims`/`requireAuth` em momento algum, aceita qualquer body com `account_id` + `access_token` | **Real** |
| C-02 | `social-sync` retorna mock como `success: true` quando token ausente | Confirmado nas linhas 72-83 (Instagram) e 130-141 (LinkedIn) | **Real** |
| C-03 | `instagram-oauth` não existe | `ls supabase/functions/instagram-oauth` → diretório existe, função publicada e descrita em `mem/features/modulo-social-infraestrutura.md` | **Falso positivo** |
| A-03 | `syncLinkedIn` mesmo padrão de mock | Idêntico ao C-02 — fechado pela mesma correção | **Real** |
| B-02 | `listarAlertas` ignora `_resolvido` | Confirmado em `src/services/social.service.ts` linhas 149-159 — assinatura aceita o parâmetro mas a RPC `social_alertas_periodo` é chamada sem ele | **Real** |
| M-05 | Tour de `/orcamentos` referencia anchors do antigo `FormModal` | `grep` no `entries/orcamentos.ts` mostra apenas `orcamentos.filtros`, `orcamentos.tabela`, `orcamentos.novoBtn` (válidos na página atual) e 3 steps fantasma | **Falso positivo** |
| A-01 / CNT-02..04 | Registry sem `/social`, `/faturamento`, `/migracao-dados`, `/fiscal/distdfe-historico` | Confirmado: 26 entries, nenhuma cobre essas rotas; páginas existem em `src/pages/` | **Real** |

### Escopo desta onda

Foco em segurança real do `social-sync`, completar a cobertura do HelpRegistry para módulos visíveis e corrigir bugs pequenos confirmados. Itens arquiteturais (build-time flag, tour mobile) ficam para backlog.

### Bloco 1 — Hardening do `social-sync` (C-01 + C-02 + A-03 + INT-10)

1. **Autenticação obrigatória.** No início do `Deno.serve` em `supabase/functions/social-sync/index.ts`, validar JWT com `getClaims` (padrão `disable-jwt-edge-functions`) e exigir que o usuário tenha o papel `admin` ou permissão `social:sincronizar` (consulta a `user_permissions` via `service_role`). Retornar 401/403 com `corsHeaders` antes de tocar em Meta/LinkedIn.
2. **Validação de propriedade do `account_id`.** Carregar `social_contas` pelo `account_id` recebido e confirmar que `plataforma` bate com a query string. Se a conta não existir → 404. Isso impede que um caller autenticado em um tenant force sync de conta de outro.
3. **Fim do mock silencioso.** Em `syncInstagram` e `syncLinkedIn`, quando `token` estiver ausente, retornar:
   ```ts
   { success: false, error: "TOKEN_NOT_CONFIGURED", message: "..." }
   ```
   com `status: 422`. Manter `generateMockInstagramData` / `generateMockLinkedInData` apenas atrás de uma flag explícita `?mock=1` (uso interno em dev) — nunca como fallback de produção.
4. **UI:** ajustar `sincronizarSocial` em `src/services/social.service.ts` para inspecionar `success === false` e propagar a mensagem; em `SocialContasTab` exibir toast claro "Conta não conectada — configure o token em Administração > Social" quando vier `TOKEN_NOT_CONFIGURED`.

### Bloco 2 — Cobertura do HelpRegistry (A-01 / CNT-02..05 / M-06)

1. Criar 4 novas entries em `src/help/entries/`:
   - `social.ts` — manual completo + tour de 5 passos: Dashboard, Conectar Conta (com nota sobre OAuth Instagram), Posts/Métricas, Alertas, Relatórios. Usar anchors `social.tabs`, `social.contas.connectBtn`, `social.dashboard.kpis`, `social.alertas.lista`, `social.relatorios.export`.
   - `faturamento.ts` — manual cobrindo `/faturamento`, `/faturamento/emitir`, `/faturamento/backlog`, `/faturamento/cadastros`. Tour curto (3 passos) na rota raiz.
   - `migracaoDados.ts` — manual + tour de 4 passos: Upload, Mapeamento, Validação, Confirmação.
   - `fiscalDistdfe.ts` — manual específico para `/fiscal/distdfe-historico` (NSU, manifestação, ciência) — sem tour.
2. Registrar todas em `HELP_REGISTRY` (`src/help/registry.ts`) e adicionar `data-help-id` mínimos nas páginas correspondentes (`Social.tsx`, abas; `Faturamento.tsx`; `MigracaoDados.tsx`; `DistDfeHistorico.tsx`).
3. Nas entries de `/administracao` e `/auditoria` (lote 3), adicionar tour mínimo de 3 passos cada — apenas anchors já existentes (`administracao.tabs`, `auditoria.filtros`, `auditoria.tabela`).
4. Bump da `version` em todas as entries tocadas para reativar `FirstVisitToast`.

### Bloco 3 — Bugs pequenos confirmados (B-02 / B-03 / B-01 / M-01)

1. **`listarAlertas`** em `social.service.ts`: aceitar `resolvido?: boolean` e, quando definido, filtrar o array retornado pela RPC (`data.filter(a => a.resolvido === resolvido)`) — evita migração de RPC. Reconectar `SocialAlertasTab` ao filtro.
2. **`calculateTrend`** em `socialAnalytics.ts`: trocar lógica binária por thresholds:
   - `alta`: `seguidores_novos >= 10` **e** `taxa_engajamento_media >= 2%`.
   - `queda`: `seguidores_novos < 0` **ou** `taxa_engajamento_media < 1%`.
   - resto → `estavel`.
3. **`SocialDashboardTab`**: quando `dashboard.comparativo` vier vazio, renderizar `EmptyState` com CTA para `/social?tab=contas` em vez de KPIs zerados.
4. **`relatoriosHelp.summary`** em `help/entries/lote2.ts`: remover "comissões" da lista (recurso inexistente).

### Bloco 4 — Hygiene do tour (A-05)

1. Em `src/components/help/CoachTour.tsx`, dentro de `resolveTarget`, adicionar `console.warn('[CoachTour] anchor não encontrado:', target)` quando `target` for não-vazio e nada for resolvido, **somente** em `import.meta.env.DEV`. Sem mudança visível em produção.

### Itens deslocados para backlog (com justificativa)

- **C-03**: falso positivo — `instagram-oauth` está implantado e documentado.
- **A-02 / A-04 / INT-05 / INT-06**: refator do fluxo OAuth do LinkedIn e mudança de `VITE_FEATURE_SOCIAL` para flag em runtime — onda própria de OAuth multi-provider.
- **M-02**: indexação full-text do `HelpDrawer` — depende de mapear `sections[].body`; medir necessidade após Bloco 2 ampliar a base.
- **M-04**: lint para forçar bump de `version` — script de CI separado, sem impacto em runtime.
- **MB-01..MB-04 / D-01 / D-02**: revisão mobile/desktop dedicada (atalhos, scroll de tabs, posicionamento de tooltip do CoachTour, deduplicação `Ajuda.tsx` × `HelpDrawer`) — Onda 11 UX.
- **D-02**: `Ajuda.tsx` vs `HelpDrawer` — exige decisão de produto antes de remover/migrar.
- **CNT-09**: validar se a busca do `HelpDrawer` cobre `sections[].body` — fica junto com M-02.

### Detalhes técnicos

- O JWT check no edge function segue o padrão de `admin-sessions`: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization } } })` + `getClaims(token)` para o usuário, e um `serviceClient` com `SERVICE_ROLE_KEY` para validar `user_permissions` / `social_contas` sem RLS.
- A flag `?mock=1` no Bloco 1.3 fica restrita a `Deno.env.get('SOCIAL_SYNC_ALLOW_MOCK') === 'true'`, evitando uso acidental em produção.
- Nenhuma migração SQL nesta onda. Todas as mudanças são em edge function + frontend.

### Saída esperada

- Edge: 1 função reescrita (`social-sync`) com auth + ownership + sem mock silencioso.
- Frontend: ~4 ajustes pontuais (`social.service`, `socialAnalytics`, `SocialDashboardTab`, `SocialAlertasTab`, `CoachTour`).
- Help: 4 novas entries + 2 tours adicionados (lote 3) + bumps de `version` + `data-help-id` nas páginas Social/Faturamento/Migração/DistDFe.
- Docs: atualização breve de `mem://features/modulo-social-infraestrutura.md` com a regra "social-sync exige JWT + ownership; mock só com flag explícita".