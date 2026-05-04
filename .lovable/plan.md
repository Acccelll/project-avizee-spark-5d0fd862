## Objetivo

Permitir exclusão definitiva (hard delete) por ADM nas entidades operacionais, executar limpeza pontual de lançamentos cancelados e do orçamento `ORC100273`, e ajustar UI/serviços conforme contrato `ConfirmDestructiveDialog` + `PermanentDeleteDialog`.

## Diagnóstico (já validado no banco)

- **8 lançamentos** com `status='cancelado'` em `financeiro_lancamentos` (sem `documento_pai_id`, `nota_fiscal_id` ou `cartao_fatura_id` vinculados — exclusão isolada). IDs:
  - 5c6fa9a1, f2e84e2a, 142e4b03, 6add3718, c52b082b, 4986b209, 737fe102, 59d1811a
- **ORC100273** = `orcamentos.id = 0d67e92c-61cb-4385-a864-099ce5bca8f6`, status `convertido`.
  - 1 linha em `orcamentos_itens` (FK direta).
  - 0 orçamentos filhos (`orcamento_pai_id`).
  - 0 NFs com `origem='0d67e92c…'`.
  - 0 lançamentos financeiros com `origem_id='0d67e92c…'`.
  - Não existe tabela `pedidos` — workflow comercial vai orçamento → NF direto, sem entidade intermediária. O status `convertido` é informativo.
- `permanentDeleteRecord` hoje cobre apenas: funcionarios, transportadoras, formas_pagamento, grupos_economicos, notas_fiscais.

## Plano

### 1. Migration — limpeza pontual + RPC + permissão

Arquivo: `supabase/migrations/<timestamp>_hard_delete_admin.sql`

1. **DELETE pontual** (em transação):
   - `DELETE FROM financeiro_lancamentos WHERE status='cancelado';` (8 linhas).
   - `DELETE FROM orcamentos_itens WHERE orcamento_id='0d67e92c-61cb-4385-a864-099ce5bca8f6';`
   - `DELETE FROM orcamentos WHERE id='0d67e92c-61cb-4385-a864-099ce5bca8f6';`

2. **RPC `hard_delete_record(p_table text, p_id uuid)`** (`SECURITY DEFINER`, `search_path=public`):
   - Exige `has_role(auth.uid(),'admin')` — `RAISE EXCEPTION` com `errcode='42501'` para não-admin.
   - Whitelist de tabelas suportadas: `financeiro_lancamentos`, `notas_fiscais`, `orcamentos`, `clientes`, `fornecedores`, `produtos`, `funcionarios`, `transportadoras`, `formas_pagamento`, `grupos_economicos`, `cartoes_credito`, `bancos`.
   - Para cada tabela, faz cleanup explícito de filhos órfãos antes do `DELETE` principal (em transação implícita do PL/pgSQL):
     - `notas_fiscais` → `nota_fiscal_itens`, `nota_fiscal_eventos`, `nota_fiscal_anexos`, `estoque_movimentos` com origem na NF, `financeiro_lancamentos` com `nota_fiscal_id=p_id`.
     - `orcamentos` → `orcamentos_itens`, anexos, e re-aponta `orcamento_pai_id` filhos para `NULL` (preserva versionamento).
     - `financeiro_lancamentos` → bloqueia se houver `documento_pai_id` apontando para ele (não é folha) com mensagem amigável; senão deleta.
     - `clientes`/`fornecedores`/`produtos` → bloqueia via captura de `foreign_key_violation` (23503) e devolve mensagem "registro referenciado em X".
   - Tudo dentro de `BEGIN…EXCEPTION WHEN OTHERS THEN RAISE` para garantir rollback atômico.
   - `INSERT INTO audit_log` (se tabela existir) com `acao='hard_delete'`, `entidade=p_table`, `entidade_id=p_id`, `usuario_id=auth.uid()`.

3. **Permissão RBAC**: nova permissão `<recurso>:excluir_definitivo` para cada tabela suportada, atribuída ao role `admin` via seed em `role_permissions`.

### 2. Service layer

`src/services/fiscal.service.ts`:
- Expandir `PermanentDeleteTable` com: `orcamentos`, `clientes`, `fornecedores`, `produtos`, `cartoes_credito`, `bancos`, `financeiro_lancamentos`.
- Trocar `permanentDeleteRecord` para chamar `supabase.rpc('hard_delete_record', { p_table, p_id })` em vez de `.delete()` direto — garante validação server-side e cleanup atômico.
- Mapear erro `42501` → "Apenas administradores podem executar exclusão definitiva."
- Mapear `23503` → mensagem com tabela referenciadora (a RPC inclui no `MESSAGE`).

### 3. UI — adicionar PermanentDeleteDialog onde falta

Padrão já existente (Funcionario/Transportadora/etc.): botão "Excluir definitivamente" só visível quando `useIsAdmin()` retorna `isAdmin=true` **e** o registro está inativo/cancelado/rascunho (mantém regra de mem://produto/excluir-vs-inativar-vs-cancelar).

Telas a instrumentar:
- `src/components/views/OrcamentoView.tsx` (criar handler de exclusão definitiva visível para admin quando `status` ∈ {rejeitado, cancelado}). Exigir digitação "EXCLUIR".
- `src/components/views/ClienteView.tsx`, `FornecedorView.tsx`, `ProdutoView.tsx` — mesmo padrão, exige `ativo=false`.
- `src/pages/Financeiro.tsx` (drawer/row actions) — botão "Excluir definitivamente" para admin quando `status='cancelado'`. Opcional: ação em massa "Limpar cancelados" no header da grid (admin only) que itera chamando a RPC.
- `src/pages/CartoesCredito.tsx` e `src/pages/ContasBancarias.tsx` — mesmo padrão.

Texto do modal (já em `PermanentDeleteDialog`): mantém a confirmação atual. Acrescentar bullet com count de registros filhos que serão removidos (consultado via RPC `hard_delete_preview` opcional — ou hardcoded por tabela na lista de side effects). **Decisão**: para escopo enxuto, listar side effects estáticos por tabela (NF → "itens, eventos, anexos, lançamentos vinculados serão removidos").

### 4. Invalidação e atualização de UI

Após sucesso, invalidar queries: `['financeiro']`, `['orcamentos']`, `['notas_fiscais']`, `['clientes']`, etc. — usar `queryClient.invalidateQueries` no `onDeleted` callback. Toast de sucesso já é emitido pelo dialog.

### 5. Testes

- `src/lib/__tests__/hardDelete.test.ts` (novo): mocka supabase.rpc e verifica mapeamento de erros 42501 / 23503.
- Smoke test admin vs. não-admin: estende `src/test/smoke/financeiro.smoke.test.tsx` para garantir botão oculto quando `isAdmin=false`.
- Manual: validar que após migration, dashboards e relatórios financeiros não exibem mais os 8 lançamentos cancelados nem ORC100273.

### 6. Rollback

A migration faz apenas DELETE/CREATE FUNCTION/INSERT INTO role_permissions. Para rollback: `DROP FUNCTION hard_delete_record` e remover linhas da `role_permissions`. Os DELETEs pontuais não têm rollback (intencional — é o objetivo).

## Resumo de arquivos

- **Novo**: `supabase/migrations/<ts>_hard_delete_admin.sql`
- **Novo**: `src/lib/__tests__/hardDelete.test.ts`
- **Editar**: `src/services/fiscal.service.ts` (whitelist + RPC)
- **Editar**: `src/components/PermanentDeleteDialog.tsx` (aceitar `sideEffects?: string[]` para listar filhos)
- **Editar**: `src/components/views/OrcamentoView.tsx`, `ClienteView.tsx`, `FornecedorView.tsx`, `ProdutoView.tsx`
- **Editar**: `src/pages/Financeiro.tsx`, `CartoesCredito.tsx`, `ContasBancarias.tsx`
- **Editar**: `.lovable/memory/produto/excluir-vs-inativar-vs-cancelar.md` (acrescentar seção "Excluir definitivamente (admin)" referenciando a RPC)

## Pontos de atenção

- A regra antiga "Excluir só se sem uso" continua válida para usuários comuns — o admin **sobrepõe** apenas no botão "Excluir definitivamente".
- NF autorizada/cancelada na SEFAZ: a trigger `trg_block_delete_notas_fiscais` continua bloqueando DELETE direto. A RPC respeita isso (capta erro do trigger e devolve mensagem amigável). Não removeremos a trigger — manter conformidade fiscal.
- Auditoria: se `audit_log` não existir, a RPC ignora silenciosamente (verificar com `to_regclass`).
