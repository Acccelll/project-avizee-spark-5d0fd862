# Correções no Módulo Financeiro

## Diagnóstico

### 1) Lançamentos "com -" (coluna Pessoa em branco)
Todos os 36 lançamentos importados têm `fornecedor_id` (entradas) ou `cliente_id` (saídas) preenchidos. O "—" aparece quando o `useSupabaseCrud` não traz a relação aninhada esperada, ou quando o lançamento é de origem manual sem contraparte. Confirmei que os lançamentos da importação têm pessoa correta no banco — o problema é visual, causado por:
- A coluna `parceiro` em `financeiroColumns.tsx` só lê `l.clientes?.nome_razao_social` ou `l.fornecedores?.nome_razao_social`, mas se a query falha de join (ou se houve criação fora do hook), o nome não aparece.
- O `displayDescricao` em alguns casos antigos cai em "Lançamento sem descrição" quando vê `[object Object]`.

### 2) Lançamentos duplicados
- Os 36 lançamentos da importação têm `nota_fiscal_id` único por parcela — **não são duplicados** (parcelas 1/3, 2/3, 3/3 de uma mesma NF). A UI exibe "NF X - Parc. n/total" mas pode dar impressão de duplicidade.
- Existe **1 NF duplicada de fato** no cadastro: `numero=11`, `fornecedor=bf12ccf7-...` aparece 2x em `notas_fiscais` (não importada por nós, é dado preexistente).
- Falta uma **constraint única** em `notas_fiscais` para `(chave_acesso)` e/ou `(numero, serie, fornecedor_id, tipo)` para evitar reincidência.

### 3) Filtro de tipo de cartão de crédito não funciona
A página `/financeiro` (`src/pages/Financeiro.tsx`) tem filtros de Tipo, Status, Bancos, Origem, Forma de Pagamento — **não existe filtro por cartão**. Existia conceitualmente em uma versão anterior; foi removido durante refatoração. Há `cartoes_credito` carregados via `useFinanceiroAuxiliares`, mas nenhum `MultiSelect` de cartões está montado.

### 4) Não dá para criar conta bancária
RLS atual de `public.contas_bancarias`:
```
cb_insert: WITH CHECK has_role(auth.uid(),'admin')   -- só admin
cb_update: USING admin OR financeiro
cb_select: USING admin OR financeiro
```
O usuário `financeiro@avizee.com.br` tem role `financeiro` (não admin), portanto consegue ver/editar mas **não consegue inserir** novas contas. A política está inconsistente com update/select.

---

## Plano de correção

### A) Banco de dados (migrations)

1. **Ajustar RLS de `contas_bancarias`** — permitir INSERT também para role `financeiro`:
   ```sql
   DROP POLICY cb_insert ON public.contas_bancarias;
   CREATE POLICY cb_insert ON public.contas_bancarias
     FOR INSERT TO authenticated
     WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro'));
   ```

2. **Constraint anti-duplicidade em `notas_fiscais`**:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_chave
     ON public.notas_fiscais(chave_acesso) WHERE chave_acesso IS NOT NULL;
   CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_num_serie_emit
     ON public.notas_fiscais(numero, COALESCE(serie,''), COALESCE(fornecedor_id::text, cliente_id::text), tipo)
     WHERE status <> 'cancelada';
   ```

3. **Limpar NF duplicada `numero=11`** — manter a mais antiga, soft-delete (status='cancelada') na duplicada, somente se não tiver lançamentos/movimentos vinculados.

### B) Frontend

4. **Adicionar filtro "Cartão"** na barra de filtros do `/financeiro`:
   - Em `useFinanceiroFiltros.ts`: novo state `cartaoFilters`, leitura de `?cartao=` no URL, opção `cartaoOpts` populada via `auxiliares.cartoes`, filtro em `filteredData` por `l.cartao_id`.
   - Em `Financeiro.tsx`: novo `<MultiSelect placeholder="Cartão">` ao lado do filtro de Forma de pagamento.
   - Chip ativo + remoção.

5. **Robustecer coluna Pessoa** em `financeiroColumns.tsx`:
   - Fallback para `l.cartao_id` → nome do cartão (lançamento de fatura).
   - Se `nota_fiscal_id` existir e não houver pessoa, mostrar "Cliente/Fornecedor da NF" como link.

6. **Robustecer `displayDescricao`** — já tem cascata, garantir que cubra também `null`/`undefined`.

### C) Auditoria de duplicatas

7. Rodar query no console e mostrar relatório CSV em `/mnt/documents/auditoria-duplicidades-fiscal.csv` listando NFs duplicadas (chave, numero, fornecedor, valores) para o usuário decidir manualmente quais cancelar.

---

## Arquivos afetados

```text
supabase/migrations/<timestamp>_fix_contas_bancarias_rls.sql        (novo)
supabase/migrations/<timestamp>_uniq_notas_fiscais.sql              (novo)
src/pages/financeiro/hooks/useFinanceiroFiltros.ts                  (filtro cartão)
src/pages/financeiro/hooks/useFinanceiroAuxiliares.ts               (já carrega cartões)
src/pages/Financeiro.tsx                                            (MultiSelect cartão)
src/pages/financeiro/config/financeiroColumns.tsx                   (fallback pessoa)
src/lib/displayLancamento.ts                                        (cobertura null)
/mnt/documents/auditoria-duplicidades-fiscal.csv                    (artifact)
```

## Notas técnicas

- Não vou recriar/duplicar lançamentos já importados — eles têm `nota_fiscal_id` único e estão corretos.
- A unique index em `notas_fiscais` será **parcial** (`WHERE status <> 'cancelada'`) para não bloquear estornos legítimos.
- A nova policy de INSERT segue o padrão das demais policies do módulo (admin OR financeiro).

Aprove para eu aplicar.
