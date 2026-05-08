---
name: useIsAdmin estrito vs useCanViewAdmin
description: Separação entre admin real (estrito) e permissão de visualizar área admin
type: preference
---
- `useIsAdmin()` → estrito: apenas `hasRole('admin')`. Use para ações sensíveis (escrita em ContasBancarias, MigracaoDados, ações financeiras, etc.).
- `useCanViewAdmin()` → admin OU `administracao:visualizar`. Use apenas para gates de navegação/rota (AdminRoute, sidebar).
- `useCanHardDelete()` continua estrito como `useIsAdmin` para destrutivos.
- AdminRoute usa `useCanViewAdmin`; ações dentro de /admin sensíveis devem reverificar com `useIsAdmin`.

## Onda 9 — gates aplicados
- `RequireStrictAdmin` (wrapper) envolve todas as seções de `/administracao` que escrevem em `app_configuracoes`/`empresa_config`. Dashboard de Segurança fica delegável.
- `AuditDuplicidades`: visualização delegada, ações destrutivas (`Remover`/`Manter`) gated por `useIsAdmin`.

## Verificações de banco/edge (mai/2026)
- `user_permissions`: políticas RLS de INSERT/UPDATE/DELETE existem com `has_role(auth.uid(),'admin')`. Apenas SELECT havia regredido para `USING(true)` — corrigido pela migration `20260410121555_fix_user_permissions_rls.sql`.
- RPC `limpar_dados_migracao`: `SECURITY DEFINER` + `IF NOT public.has_role(auth.uid(),'admin') THEN RETURN 'acesso_negado'`.
- Edge function `admin-sessions`: chama `requireAdmin(serviceClient, req)` em todas as ações mutantes.
- Edge function `setup-admin`: removida do deploy (era stub 410).
