## Onda 9 — Auditoria Verificada e Plano de Ação

### Verificação dos achados críticos (executada antes do plano)

| ID | Achado | Verificação | Veredicto |
|----|--------|-------------|-----------|
| C-02 | RLS de `user_permissions` sem políticas I/U/D | `pg_policies` mostra `user_permissions_admin_insert/update/delete` com `has_role(auth.uid(),'admin')` | **Falso positivo** — já protegido |
| C-03 | RPC `limpar_dados_migracao` sem SECURITY DEFINER + admin check | `pg_proc.prosecdef = true` e o corpo começa com `IF NOT public.has_role(auth.uid(),'admin') THEN RETURN 'acesso_negado'` | **Falso positivo** — já protegido |
| A-07 | `admin-sessions` sem `requireAdmin` | Função tem `requireAdmin(serviceClient, req)` chamado em todas as ações | **Falso positivo** |
| C-01 | Seções admin sem `useIsAdmin` interno | Confirmado: `BackupSection`, `EmpresaSection`, `NotificacoesSection`, `EmpresasSection`, `WebhooksSection`, `IntegracoesSection`, `EmailSection`, `FinanceiroSection`, `FiscalSection`, `PerfisCatalogoSection`, `SaudeSistemaSection` não revalidam `isAdmin`; `AdminRoute` aceita `administracao:visualizar` | **Real** — risco de delegado escrever config global |

### Escopo desta onda

Foco no que é **comprovadamente** problema, sem retrabalhar o que já está protegido.

### Bloco 1 — Hardening de gates admin (C-01 / A-04 / A-05)

1. **Gate centralizado por seção sensível.** Em `src/pages/Administracao.tsx`, envolver o `SectionContent` (ou cada `case` mutante) com um wrapper `<RequireStrictAdmin>` novo (`src/components/admin/RequireStrictAdmin.tsx`) que usa `useIsAdmin` e renderiza `<AccessDenied variant="route" resourceLabel="…">` para não-admins. Aplicar em: `empresa`, `empresas`, `email`, `integracoes`, `notificacoes`, `webhooks`, `backup`, `fiscal`, `financeiro`, `perfis`, `saude`, `usuarios`. Manter `dashboard` (somente leitura) sem o gate.
2. **`AuditDuplicidades`:** adicionar `useIsAdmin` guard em torno do botão "Mesclar duplicidades" (manter visualização delegável, alinhado ao item de sidebar).
3. **Doc.** Atualizar `docs/administracao-modelo.md` §6 com a regra: "toda seção sob `/administracao` que escreve em `app_configuracoes` ou `empresa_config` reverifica `useIsAdmin`."

### Bloco 2 — Política de senha consistente (A-02 + M-03)

1. Em `useChangePassword`/`SegurancaSection` e `Signup`/`ResetPassword`, bloquear submit quando `getPasswordStrength(pwd).level < 2`, exibindo a primeira mensagem de `validatePassword`.
2. Adicionar critério "Caractere especial (recomendado)" em `getPasswordCriteria` (não-obrigatório, apenas visual) para alinhar com a fórmula de `getPasswordStrength`.
3. Remover `ROLE_LABELS` de `passwordPolicy.ts` (4 roles desatualizados) — importar de `src/lib/permissions.ts` (6 roles canônicos).

### Bloco 3 — Auditoria server-side (M-05)

Mover o filtro de `criticidade` em `Auditoria.tsx` para o hook `useAdminAuditUnificada` (parâmetro de query sobre `v_admin_audit_unified`), eliminando o "filtro sobre página atual" que esconde eventos críticos das páginas seguintes.

### Bloco 4 — Limpezas de menor risco

1. **A-03** Remover deploy de `setup-admin` (`supabase functions delete setup-admin`) — código já é stub 410.
2. **M-02** Adicionar card placeholder "Autenticação em dois fatores — `<EmBreve />`" em `SegurancaSection`.
3. **M-06** Em `BackupSection`, exibir aviso fixo "valores serão aplicados quando o cron for ativado" (mantém persistência, deixa expectativa explícita).
4. **B-01** Confirmar e, se necessário, migrar `AparenciaSection` para `user_preferences` (escopo por usuário, não global).

### Itens deslocados para backlog (com justificativa)

- **C-02 / C-03 / A-07**: já protegidos no banco/edge — apenas registrar verificação na memória `mem://security/`.
- **A-01** (janela `USING(true)`): exige acesso a logs Postgres não disponível no sandbox; abrir tarefa de auditoria operacional fora do código.
- **A-06 / SH-03**: divergência `useEmpresaConfig` vs `useAppConfig` — refatoração ampla, agendar para Onda 10.
- **MB-01 / MB-02 / MB-03**: revisão mobile dedicada (PermissionMatrix, MigracaoDados, Auditoria) — Onda 10 mobile.
- **D-02 / D-03**: auditoria de segurança de Webhooks/Integrações — onda própria com checklist SSRF/HMAC.
- **SH-02**: regenerar `types.ts` para `v_admin_audit_unified` quando o schema for re-snapshot.
- **SH-05**: decompor `UserFormModal` (25 KB) — refator não-funcional, baixa prioridade.

### Detalhes técnicos

- `RequireStrictAdmin` reutiliza `AuthLoadingScreen` enquanto `loading`, e `AccessDenied` com `variant="route"` para o estado negado — mesmo padrão do `AdminRoute`.
- O wrapper é puramente cliente; o RLS já é a defesa real (todos os updates vão para `app_configuracoes`/`empresa_config`, cujos triggers de auditoria continuam capturando o ator).
- Migrações de banco: **nenhuma** nesta onda. Tudo é frontend + edge function delete + doc.

### Saída esperada

- Frontend: 1 novo componente, ~12 seções envolvidas no wrapper, 3 ajustes de senha, 1 mudança no hook de auditoria, 3 ajustes pequenos de UX.
- Edge: remoção de `setup-admin` do deploy.
- Docs/mem: atualização de `docs/administracao-modelo.md` e nova nota em `mem://security/admin-vs-view-admin.md` registrando os falsos positivos verificados.