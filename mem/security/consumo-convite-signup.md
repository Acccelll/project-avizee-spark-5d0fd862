---
name: Consumo de convite no signup
description: Trigger handle_new_user consome invites atomicamente, aplica role e ativa profile
type: feature
---
- `handle_new_user` lê `raw_user_meta_data->>'invite_token'`.
- UPDATE atomico em `invites` (used_at IS NULL + expires_at > now() + email match) garante consumo único.
- Falha → RAISE EXCEPTION (ERRCODE 22023) cancela o signup.
- Aplica role do convite em `user_roles`; profile nasce com status `ativo`.
- Sem token: profile nasce `pendente` (compat).
- `validate-invite` edge function continua como pré-check UX.
