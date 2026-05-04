---
name: Storage dbavizee — prefixos canônicos
description: Policies do bucket dbavizee por prefixo de pasta + admin override
type: constraint
---
- Bucket `dbavizee` usa prefixos canônicos: `templates/`, `apresentacoes/`, `workbooks/`, `fiscal/`, `users/{auth.uid()}/`.
- SELECT/INSERT/UPDATE: autenticado em qualquer prefixo canônico OU pasta pessoal OU admin.
- DELETE: apenas em `apresentacoes/`, `workbooks/`, pasta pessoal OU admin (templates/fiscal restritos).
- Policies legadas `dbavizee_auth_*` foram removidas.
- Why: paths usados pelos serviços (apresentacao/workbook/fiscal) operam por tipo de documento, não por user_id.
