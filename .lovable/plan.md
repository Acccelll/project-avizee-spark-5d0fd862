# Plano consolidado de revisão — AviZee ERP

## 1) Diagnóstico confirmado (com leitura das RPCs no banco)

| # | Item | Status real |
|---|---|---|
| 1 | `receber_compra` gera financeiro? | **NÃO**. A RPC atual só cria `compras`, `compras_itens`, `estoque_movimentos`, atualiza `pedidos_compra` e grava `auditoria_logs`. **Nenhum INSERT em `financeiro_lancamentos`.** Toast em `usePedidosCompra.ts` mente: "Estoque atualizado e financeiro gerado." |
| 2 | `confirmar_nota_fiscal` à vista grava "pago" sem baixa? | **PARCIAL**. A versão atual já cria o lançamento à vista com `status='aberto'`, `valor_pago=0`, `saldo_restante=valor_total`, vencimento = data_emissao. **Não nasce "pago"** — porém também **não cria `financeiro_baixas` automaticamente**, então NF à vista exige baixa manual posterior. UX precisa refletir isso. |
| 3 | Convite consumido? | **NÃO no trigger**. `handle_new_user` só insere em `profiles` com status `pendente`. Não toca em `invites.used_at/used_by`, não aplica role, não há proteção contra reuso pós-signup (apenas `validate-invite` antes do signup). |
| 4 | Storage `dbavizee` policies | **CONFLITO**. Policies `dbavizee_select/update/delete` exigem `(storage.foldername(name))[1] = auth.uid()::text` OU admin. Mas existem ainda policies legadas `dbavizee_auth_*` permissivas (`bucket_id='dbavizee'` puro) — duplicidade perigosa. Caminhos usados (`templates/...`, `apresentacoes/...`, `workbooks/...`) **só funcionam** porque as policies `_auth_*` ignoram o foldername; se removidas, quebra para não-admin. |
| 5 | RLS x permissões UI | `useIsAdmin` aceita `administracao:visualizar` como ADM em alguns contextos. `useCanHardDelete` (Fase 5) já corrige hard-delete. Falta auditar `AdminRoute` e RLS por empresa. |
| 6 | Paginação | `useSupabaseCrud` busca tudo sem `pageSize`. Confirmado em Financeiro/Fiscal/Produtos/Clientes/Fornecedores/Orçamentos/Logística/Compras. |
| 7 | Status helpers | `drawerPermissions.ts` usa nomenclatura mista (`emitida/autorizada` vs `confirmada`; `enviado/pendente_aprovacao` vs `enviado_ao_fornecedor/aguardando_aprovacao`). |
| 8 | `CONTRACTS.md` | Divergente — descreve geração de financeiro no recebimento que não existe. |
| 9 | CORS edge functions admin | `validate-invite` usa `ALLOWED_ORIGIN ?? '*'`. `admin-sessions/admin-users` exigem `ALLOWED_ORIGIN` rígido (memory: infraestrutura-cors). Inconsistência. |
| 10 | `as any` e services duplicados | `workbook.service.ts` vs `workbookService.ts` confirmados. `as any` em workbook/apresentacao/orcamentos/webhooks. |

## 2) Críticos (correções com migration/RPC)

### C1 — Recebimento de compra: alinhar promessa × execução
**Decisão recomendada:** **Opção B** — recebimento NÃO gera financeiro; financeiro nasce da NF de entrada vinculada à compra.
- **Justificativa:** evita duplicidade (já existe `confirmar_nota_fiscal` com `gera_financeiro`); Brasil opera com NF como documento fiscal/financeiro de origem; recebimento físico ≠ obrigação fiscal.
- **Mudanças:**
  - Migration: nenhuma alteração na RPC `receber_compra` (já está correta).
  - Frontend: corrigir toast em `usePedidosCompra.ts` para "Recebimento registrado. Estoque atualizado. Lance a NF de entrada para gerar contas a pagar."
  - `RegistrarRecebimentoDialog.tsx`: banner informativo "Financeiro será gerado ao confirmar a NF de entrada".
  - `CONTRACTS.md`: documentar regra.

### C2 — NF à vista: comportamento de baixa
**Decisão recomendada:** **Opção A** — gera lançamento `aberto` (já é o estado atual) + redirecionar UI para fluxo de baixa, com CTA "Baixar agora" no toast pós-confirmação quando `condicao_pagamento='a_vista'`.
- **Mudanças:**
  - RPC: nenhuma (já está correta — não nasce "pago").
  - Validação adicional na RPC: `chk_lancamento_pago_requer_baixa` — trigger BEFORE UPDATE garantindo que `status='pago'` exija EXISTS em `financeiro_baixas` para esse lancamento.
  - UI: `useConfirmarNotaFiscal` retorna info `requer_baixa` para abrir baixa direto se à vista.

### C3 — Consumo transacional do convite
- Migration:
  - Atualizar `handle_new_user`: ler `NEW.raw_user_meta_data->>'invite_token'`, validar (não usado, não expirado, email match), em transação:
    - `UPDATE invites SET used_at=now(), used_by=NEW.id WHERE token=... AND used_at IS NULL` (proteção race).
    - Se `rowCount=0` (já usado/race) → RAISE EXCEPTION → cancela signup.
    - INSERT em `user_roles` com `invites.role`.
    - Se invite tem `empresa_id`, INSERT em `user_empresas` (verificar se tabela existe).
  - Manter `validate-invite` apenas como pré-check UX.

### C4 — Storage dbavizee
**Decisão recomendada:** **Opção C** — diretórios fixos com policies por prefixo, baseado em empresa do usuário.
- Convenção:
  - `templates/...` → leitura pública autenticada, escrita admin
  - `apresentacoes/{empresa_id}/...` → leitura/escrita por membros da empresa
  - `workbooks/{empresa_id}/...` → idem
  - `fiscal/{empresa_id}/...` → idem (já há `xmls_fiscais` separado)
  - `users/{user_id}/...` → leitura/escrita do próprio usuário
- Migration:
  - DROP das policies legadas `dbavizee_auth_*`.
  - CREATE policies por prefixo usando função `public.user_pertence_empresa(empresa_id)` (security definer).
- Frontend: ajustar paths em `apresentacaoService.ts`, `workbookService.ts`, `fiscal.service.ts` para incluir `empresa_id`.

## 3) Alto impacto (somente código / config)

### A1 — Permissões UI × RLS
- Auditar `AdminRoute.tsx` e `useIsAdmin` — manter `administracao:visualizar` apenas como gate de menu/rota; ações sensíveis usam `useCanHardDelete` (já feito) ou novas: `sistema:excluir_definitivo`.
- Documentar matriz `permissão UI ↔ has_role/RLS` em `CONTRACTS.md`.

### A2 — Paginação server-side
- Adicionar `pageSize`/`page` em `useSupabaseCrud` com `range()` e `count: 'exact'`.
- Migrar Financeiro e Fiscal primeiro (default 50, infinite scroll opcional).
- Substituir selects de cliente/fornecedor/produto por `AutocompleteSearch` remoto onde houver `useSupabaseCrud(...).all`.

### A3 — Status canônicos
- Criar `src/lib/status/{fiscal,compras,financeiro,comercial}.ts` exportando enums + helpers `canX(status)`.
- Refatorar `drawerPermissions.ts` para consumir esses helpers.
- Apagar nomes mortos (`emitida`, `autorizada` em fiscal local, etc.).

### A4 — CORS padronizado
- Criar `supabase/functions/_shared/cors.ts` com função `buildCorsHeaders(req)` que aceita lista de origens (env `ALLOWED_ORIGINS` separada por vírgula + lovable preview pattern).
- Aplicar em `validate-invite`, `admin-sessions`, `admin-users`, `process-email-queue`, `test-smtp`, etc.

### A5 — `CONTRACTS.md` reescrito
- Seção por RPC com: assinatura, efeitos colaterais, idempotência, eventos.

## 4) Dívida técnica

### D1 — Services duplicados
- Decidir um nome canônico (`workbook.service.ts`) e remover o duplicado após mover imports.

### D2 — `as any`
- Substituir por DTOs em `workbook/fetchWorkbookData.ts` e `apresentacaoService.ts` (alta prioridade) — já há tipagem em `src/types/domain.ts`.

## 5) Ordem recomendada de implementação

```text
Etapa 1  C1  Toast/UI recebimento + CONTRACTS                  [só código]
Etapa 2  C3  Trigger handle_new_user consome convite           [migration + trigger]
Etapa 3  C4  Storage policies + paths empresa_id               [migration + código]
Etapa 4  C2  Trigger guard + UI baixa NF à vista               [migration + código]
Etapa 5  A1  Auditoria permissões UI×RLS                       [só código]
Etapa 6  A4  CORS padronizado edge functions                   [só código + envs]
Etapa 7  A2  Paginação Financeiro + Fiscal                     [só código, hook+telas]
Etapa 8  A3  Status canônicos + drawerPermissions              [só código]
Etapa 9  A5  CONTRACTS.md completo                             [só doc]
Etapa 10 D1+D2 Saneamento services e tipagem workbook         [só código]
```

## 6) Critérios de aceite por etapa

- **E1:** toast e banner refletem que financeiro vem da NF; `CONTRACTS.md` seção compras atualizada.
- **E2:** `invites.used_at/used_by` preenchidos pós-signup; `user_roles` recebe role do convite; signup com token reusado falha; teste com 2 signups simultâneos só permite 1.
- **E3:** policies `dbavizee_auth_*` removidas; uploads de apresentação/workbook funcionam para usuário não-admin; usuário de outra empresa recebe 403; admin acessa tudo.
- **E4:** trigger bloqueia `UPDATE financeiro_lancamentos SET status='pago'` sem baixa; UI à vista oferece baixa imediata.
- **E5:** `useIsAdmin` separado de `administracao:visualizar`; matriz documentada.
- **E6:** todas funções administrativas respondem 200 em dev/preview/prod; OPTIONS uniforme.
- **E7:** Fiscal e Financeiro carregam ≤50 registros por página; filtros disparam novo `select`.
- **E8:** botões de ação refletem status reais; nenhum helper morto importado.
- **E9:** `CONTRACTS.md` cobre todas RPCs críticas com efeitos.
- **E10:** zero `as any` em workbook/apresentacao; um único `workbook.service.ts`.

## 7) Riscos de regressão

- **E2 (convite):** falha no trigger derruba signup — testar caminhos sem token (caso `INVITE_ONLY=false`).
- **E3 (storage):** quebrar download de arquivos antigos cujo path não tem `empresa_id` — exigirá migration de renomear objetos OU policy compatibilidade legada por `nome LIKE 'templates/%'`.
- **E4 (NF baixa):** trigger pode bloquear migrações antigas de saldos `parcial` — exceção via `IF NOT pg_trigger_depth()` ou flag de bypass administrativo.
- **E7 (paginação):** alterar API do `useSupabaseCrud` afeta dezenas de telas — manter retrocompatível com default page=null = comportamento atual.

## 8) Próximo prompt sugerido (executar Etapa 1)

> "Execute a Etapa 1: corrigir o toast de `usePedidosCompra.ts` para refletir que recebimento NÃO gera financeiro; adicionar banner informativo no `RegistrarRecebimentoDialog.tsx`; atualizar `CONTRACTS.md` documentando que financeiro nasce da NF de entrada. Não tocar na RPC `receber_compra`."

Aprove para eu seguir para Etapa 1.
