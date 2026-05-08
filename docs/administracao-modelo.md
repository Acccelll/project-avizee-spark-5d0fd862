# Módulo Administração — Modelo Estrutural

Referência canônica do módulo Administração após a revisão estrutural.

## 1. Fronteira branding institucional vs config sistêmico

| Tabela | Conteúdo | Exemplos |
|---|---|---|
| `empresa_config` (1 linha) | **Identidade institucional** — fiscal, jurídica, visual, contato | `cnpj`, `razao_social`, `nome_fantasia`, `logo_url`, `cor_primaria`, `cor_secundaria`, `site`, `whatsapp`, `responsavel`, `inscricao_municipal` |
| `app_configuracoes` (kv) | **Parâmetros sistêmicos** operacionais | `email`, `fiscal`, `financeiro`, `usuarios`, `cep_empresa`, `compras.limite_aprovacao`, `frete:caixas_embalagem` |

`app_configuracoes['geral']` foi migrado para `empresa_config`. Backup preservado em `empresa_config.geral_legacy` (jsonb) por uma sprint para conferência.

## 2. Governança de overrides individuais (`user_permissions`)

Colunas adicionadas: `granted_by`, `granted_at`, `motivo`, `expires_at`, `updated_by`, `updated_at`.

Trigger `trg_user_permissions_audit` grava cada INSERT/UPDATE/DELETE em `permission_audit` com diff antes/depois e ator (`auth.uid()`).

`expires_at` permite overrides temporários — ignorados em leitura quando expirados.

## 3. Auditoria administrativa

`permission_audit` ganhou `tipo_acao`, `entidade`, `entidade_id`, `motivo`, `ip_address`, `user_agent`.

`tipo_acao` canônico: `user_create`, `user_update`, `user_status_change`, `role_grant`, `role_revoke`, `role_update`, `permission_grant`, `permission_revoke`, `permission_update`, `permission_delete`, `config_update`, `branding_update`, `logo_upload`.

Triggers automáticos:
- `app_configuracoes`, `empresa_config` → `auditoria_logs` (CONFIG_INSERT/UPDATE/DELETE).
- `user_roles` → `permission_audit` (`role_grant`/`role_revoke`/`role_update`).
- `user_permissions` → `permission_audit` (`permission_*`).

View `v_admin_audit_unified` (security_invoker=true) une as duas trilhas para a UI.

## 4. Dashboard de Segurança

Métricas estruturalmente confiáveis:

| Card | Fonte | Semântica |
|---|---|---|
| Sessões ativas | `admin-sessions?action=metrics` (30 min window) | sessão recente real |
| Inativos +30 d | `auth.users.last_sign_in_at < hoje-30d` | última atividade |
| Administradores | `user_roles WHERE role='admin'` | papel privilegiado |
| Eventos admin 24 h | `permission_audit` desde `now()-24h` | governança real |

Removidos: "Logins Falhos 24h" e "Logins Antigos" (eventos `auth:login`/`LOGIN_FAILED` não eram capturados — semântica enganosa).

## 5. Matriz de Permissões

- **Núcleo** (sempre visível): `visualizar`, `criar`, `editar`, `excluir`, `exportar`, `aprovar`, `cancelar`.
- **Avançado** (toggle): `confirmar`, `importar_xml`, `admin_fiscal`, `gerar`, `download`, `editar_comentarios`, `gerenciar_templates`, `configurar`, `sincronizar`, `gerenciar_alertas`, `baixar`, `reenviar_email`, `visualizar_rentabilidade`.
- Colunas vazias (nenhum role usa) são suprimidas para reduzir ruído.
- Contador no header: "Exibindo N de M ações disponíveis".

## 6. Coerência guards

- `AdminRoute` → role `admin` (porta principal da área administrativa).
- `useVisibleNavSections` → mostra `administracao` se `isAdmin || can('administracao:visualizar')`.
- `PermissionRoute resource="administracao"` disponível para sub-recursos delegáveis (ainda não usado).
- **`RequireStrictAdmin`** (`src/components/admin/RequireStrictAdmin.tsx`) — wrapper interno aplicado em `Administracao.tsx` a toda seção que escreve em `app_configuracoes` ou `empresa_config` (Empresa, Empresas, Usuários, Perfis, E-mail, Integrações, Notificações, Webhooks, Backup, Fiscal, Financeiro, Saúde). Usa `useIsAdmin` estrito; o Dashboard de Segurança permanece somente leitura e delegável.
- **`AuditDuplicidades`** — visualização delegável via `administracao:visualizar`, mas as ações `Remover` e `Manter` ficam desabilitadas para não-admins (`useIsAdmin`).

## 7. Modelo de usuário

`profiles.ativo` (boolean) replica `auth.users.banned_until` para queries client-side simples. Sincronizado pela edge function `admin-users` em `toggle-status` e `update`.

## 8. Storage de logo

Bucket `dbavizee`, path canônico `empresa/logo.{ext}` (upsert). Trigger de auditoria em `empresa_config` cobre mudanças em `logo_url`.

## 9. Edge function `admin-users` — não-destrutiva

`replaceUserPermissions` calcula diff e:
- INSERT permissões novas
- UPDATE `allowed=false` para revogar (preserva `granted_by`/`granted_at` originais)
- UPDATE `allowed=true` para re-habilitar
- Nunca DELETE (histórico preservado)

Aceita `motivo` em `payload` e propaga para `user_permissions.motivo` e `permission_audit.motivo`.

## 10. Pontos para evolução futura

- Captura de `LOGIN_FAILED`/`auth:login` via Supabase Auth Hooks.
- Cron de expiração de overrides com `expires_at`.
- Regenerar `types.ts` para que a view `v_admin_audit_unified` seja tipada (remover cast `any` em `useAdminAuditUnificada`).
- Cleanup de `app_configuracoes['geral']` após validação.
- 2FA real (Supabase MFA).