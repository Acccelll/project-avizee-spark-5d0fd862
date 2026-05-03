# Plano de Squashing de Migrations

> Status: **plano** (não executar sem janela de manutenção e backup completo).
> Inventário: 188 migrations em `supabase/migrations/` (de `20260409` até `20260503`).

## Por que squash?

- Onboarding mais rápido (clones/restauração de Test).
- Menos ruído ao revisar histórico relevante.
- Reduz risco de aplicar migrations parciais em ambiente novo.

## Riscos

- Lovable usa o histórico real para sincronização. **Não apagar arquivos** sem
  consolidar em um snapshot equivalente e validar contra `pg_dump --schema-only`.
- Triggers/RPCs com `search_path = public` precisam ser recriados na ordem
  correta (functions antes de triggers que as referenciam).
- Constraints `chk_*` e RLS policies foram adicionadas/recriadas em momentos
  diferentes — o snapshot deve refletir o **estado final**.

## Estratégia (3 fases)

### Fase A — Baseline (não destrutiva)
1. Gerar `pg_dump --schema-only --no-owner --no-privileges` do ambiente Live
   e versionar como `supabase/migrations/_baseline_20260503.sql.reference`.
2. Comparar contra `scripts/check-schema-drift.mjs` para garantir paridade
   entre Test e Live.
3. Criar checklist de objetos críticos:
   - Tabelas + colunas + defaults + check constraints
   - Índices (especialmente compostos: `financeiro_lancamentos(documento_pai_id, parcela_numero)`)
   - RLS policies por tabela
   - Funções `SECURITY DEFINER` (lista via `pg_proc` filtrando `prosecdef = true`)
   - Triggers (`pg_trigger`)
   - Sequences (numeração atômica de documentos)
   - Storage buckets + policies (`etiquetas-correios`, etc.)
   - Cron jobs (`process-email-queue`, `process-distdfe-cron`)

### Fase B — Snapshot consolidado (separado, não substitui)
1. Criar branch `chore/migrations-squash`.
2. Adicionar **um único** arquivo `00000000000000_baseline.sql` que reproduza
   o estado final, **sem remover** as 188 migrations existentes.
3. Em ambiente novo, validar:
   - `supabase db reset` aplica baseline + migrations seguintes sem erro.
   - Linter (`supabase--linter`) sem alertas.
   - Smoke tests (`vitest run src/test/smoke/*`) passam.

### Fase C — Cutover (opcional, alto risco)
Só executar quando A e B estiverem 100% verdes em Test por ≥7 dias.
1. Definir janela de manutenção.
2. Renomear migrations antigas para `supabase/migrations/_archive/` (mantém
   git history; Lovable não enxerga mais).
3. Manter apenas `00000000000000_baseline.sql` + migrations posteriores ao
   cutover.
4. Resincronizar metadados Lovable (`schema_migrations`).

## Critérios de aceite

- Schema final idêntico ao atual (validação via diff de `pg_dump`).
- Zero perda de dados (baseline é DDL puro, não toca tabelas).
- RLS policies preservadas com `EXISTS` test em todas as tabelas sensíveis.
- Numeração de documentos (sequences) com `last_value` preservado via
  `setval(...)` no fim do baseline.

## Decisões pendentes

- Se vale o esforço agora ou após a próxima onda de features.
- Quem detém o ambiente Test "limpo" para validar reset completo.

## Recomendação atual

**Adiar Fase C.** Executar Fase A imediatamente (gera `_baseline.reference` e
valida drift). Fase B só quando precisarmos onboardar novo ambiente.