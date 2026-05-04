---
name: Gate de Exclusão Definitiva
description: useCanHardDelete (admin role estrito) é o gate de UI para hard delete; useIsAdmin permanece para acesso a telas admin
type: feature
---
- `useCanHardDelete` (em `src/hooks/useCanHardDelete.ts`) só retorna true quando `hasRole('admin')`. Use-o para gatekeep botões/dialogs de **exclusão definitiva** e demais ações irreversíveis (PermanentDeleteDialog, "Excluir definitivamente" em views).
- `useIsAdmin` continua aceitando override por `administracao:visualizar` apenas para acesso a telas/abas administrativas e badges de visualização — NÃO use para destrutivo.
- Server-side: a RPC `public.hard_delete_record(p_table, p_id)` valida `has_role(auth.uid(), 'admin')` e ergue ERRCODE 42501 caso contrário (search_path = public, SECURITY DEFINER). Esta é a fronteira de segurança real; o hook é apenas UX.
