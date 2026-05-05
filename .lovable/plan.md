
# Migração de Produtos — Plano Revisado v3

Fonte de verdade: `produtos_Atualizado-3.xlsx` (aba `produtos`, 291 linhas).
Snapshot atual do banco: `public.produtos` = 299 (248 ativos, 26 `LEG-*`, 25 `00000…`).

## 1. Doutrina (regra autoritativa de `IGUAL SKU` × `Status`)

| Caso | `IGUAL SKU` | `Status` | Ação |
|---|---|---|---|
| A | `OK` | `true` | Manter no ERP, garantir `ativo=true`. **Nunca excluir.** Vale inclusive para SKU `LEG-*`. |
| B | `OK` | `false` | Manter no ERP, marcar `ativo=false` (descontinuado). Nunca excluir. Vale para `LEG-*`. |
| C | SKU válido (≠ `OK`/`-`) | `true`/`false` | `Código SKU` é origem duplicada; `IGUAL SKU` é destino canônico. Remap das FKs origem→destino e **DELETE físico** da origem. |
| D | `-`, vazio, ou genérico | `EXCLUIR` | Resolver por nome/variação no ERP; se match seguro com FKs, remap+delete; se sem FKs, delete direto; sem match seguro → pendência. |
| E | `-`, vazio, genérico | `true`/`false` | Tratar como alias documental. Só remapear se houver match seguro por nome. Senão, pendência. **Não criar produto novo a partir desses.** |
| F | qualquer | `EXCLUIR` (com SKU válido) | Mesma árvore D: sem FK→delete; com FK e destino→remap+delete; com FK sem destino→pendência. |

Regras invioláveis:
- **Nunca apagar** linha `IGUAL SKU=OK`, mesmo que `Status=false`, mesmo que SKU seja `LEG-*`.
- **Nunca interpretar** `Status=false` como exclusão. É inativação.
- Exclusão física só ocorre em (C), (D), (F).
- `Código SKU` genérico (`-`, vazio, valores como `11`, repetidos) **não** é chave de remap direto.
- Campos fiscais (NCM, CEST, CFOP, origem, CST/CSOSN, IPI/PIS/COFINS) jamais alterados.
- `produtos.estoque_atual` só muda via `ajustar_estoque_manual` (`categoria_ajuste='migracao_baseline'`), nunca UPDATE direto.

## 2. Diagnóstico da planilha v3

- 291 linhas, colunas: `Código SKU, Produto, IGUAL SKU, UN, Variações, Estoque, P. Venda, P. Custo, Margem, Status`.
- `IGUAL SKU=OK`: **193** → 167 ativos + 26 inativos (todos preservados).
- `IGUAL SKU` apontando outro SKU: **97** → candidatos a consolidação+delete.
- `Status=EXCLUIR`: 1 (`Torneira Cobb`, `IGUAL SKU=-`).
- `Código SKU` vazio: 54 linhas (sempre com `IGUAL SKU` preenchido) — alias documental.

FKs reais para `public.produtos(id)` (descobertas via `pg_constraint`, 16 referências em 15 tabelas):
`compras_itens, cotacoes_compra_itens, estoque_movimentos, fechamento_estoque_saldos, nfe_distribuicao_itens, notas_fiscais_itens, orcamentos_itens, ordens_venda_itens, pedidos_compra_itens, precos_especiais, produto_composicoes (pai+filho), produto_identificadores_legacy, produtos_fornecedores, recebimentos_compra_itens, remessa_itens`. Lista bate com a hardcoded em `remap_produto_fk`. Validação dinâmica em cada execução: divergência → aborta o item.

## 3. Fases (3 runs isolados)

### Run 0 — Dry-run (read-only, zero escrita em `produtos`)

1. Trunca `stg_produtos_atualizado`, `produto_migracao_mapa`, `produto_migracao_log`.
2. Carrega 291 linhas em staging, classifica cada linha em uma das 6 categorias da tabela acima.
3. Resolve `produto_id` por `LOWER(TRIM(sku))` em `produtos`.
4. Monta `produto_migracao_mapa` com `acao` ∈ `{manter_ativo, manter_inativo, criar, atualizar, consolidar_e_excluir, excluir_direto, alias_pendente, pendente_manual}`.
5. Identifica produtos órfãos (`produtos.sku` que **não** aparece em nenhuma das 291 linhas, nem como `Código SKU`, nem como `IGUAL SKU`) → registra como `orfao_revisao` (não exclui automaticamente; espera decisão).
6. Pre-check: `pg_constraint` vs lista hardcoded de FKs.
7. Gera `/mnt/documents/migracao_produtos_dryrun_v3.xlsx` com **uma aba por categoria**, conforme exigido:
   - `OK_ativos` — `IGUAL SKU=OK` & `Status=true` (167)
   - `OK_inativos` — `IGUAL SKU=OK` & `Status=false` (26)
   - `apontamento_canonico` — `IGUAL SKU` aponta outro SKU (97)
   - `codigo_invalido_generico` — `Código SKU` vazio/`-`/`11`/repetido
   - `status_excluir` — todas as linhas `Status=EXCLUIR`
   - `criar` — canônicos ausentes no banco
   - `atualizar` — campos não-fiscais divergentes
   - `inativar_descontinuar` — produtos a marcar `ativo=false`
   - `remapear_relacoes` — pares origem→destino com FKs
   - `excluir_fisicamente` — origens duplicadas + `EXCLUIR` sem FK
   - `pendencias_manuais` — sem destino seguro
   - `orfaos_no_banco` — produtos no banco sem qualquer referência na planilha
   - `fk_check` — diff `pg_constraint` × hardcoded
8. **Nenhum INSERT/UPDATE/DELETE em `public.produtos`.**

### Run 1 — Aplicação não destrutiva

- `criar`: INSERT em `produtos` (campos não-fiscais + `grupo_id` por nome + `ativo`).
- `atualizar`: UPDATE de `nome, un, variacoes, preco_venda, preco_custo` quando divergir.
- `manter_ativo`: garante `ativo=true` se estiver false.
- `manter_inativo` / `inativar_descontinuar`: `ativo=false` (sem deletar). **Inclui LEG-* com `OK`+`false`**.
- `Estoque` da planilha ≠ `estoque_atual` → `ajustar_estoque_manual(... 'migracao_baseline')`.
- Sem DELETE, sem remap.

### Run 2 — Consolidação e exclusão física

Apenas itens marcados `consolidar_e_excluir` ou `excluir_direto`:
1. Revalida `pg_constraint`; divergiu → aborta o item, marca `abortado`.
2. Snapshot completo em `produto_migracao_backup`.
3. Insere em `produto_identificadores_legacy(produto_id=destino, codigo_legado=sku_origem)`.
4. `remap_produto_fk(origem, destino)` com dedup prévio em `produtos_fornecedores`/`produto_composicoes`.
5. `DELETE FROM produtos WHERE id=origem` em `BEGIN/EXCEPTION` — falha de FK residual → `abortado`.

`excluir_direto` (sem FK): `DELETE` direto e log `excluido_sem_relacoes`.

Cada item em transação isolada. Falha de um não bloqueia os demais.

## 4. Validações SQL pós-Run 2 (todas → 0)

```sql
-- duplicidade
SELECT sku, count(*) FROM produtos GROUP BY 1 HAVING count(*)>1;

-- toda linha OK da planilha presente
SELECT s.sku_canonico FROM stg_produtos_atualizado s
 WHERE s.classe IN ('OK_ativo','OK_inativo')
   AND NOT EXISTS (SELECT 1 FROM produtos p
                   WHERE upper(p.sku)=upper(s.sku_canonico));

-- LEG-* com OK ainda existem
SELECT count(*) FROM stg_produtos_atualizado s
 WHERE s.sku_canonico LIKE 'LEG-%' AND s.classe LIKE 'OK%'
   AND NOT EXISTS (SELECT 1 FROM produtos p WHERE p.sku=s.sku_canonico);

-- nenhuma OV/NF órfã (repetido por FK descoberta)
SELECT count(*) FROM <tabela_fk> t
 WHERE t.<col> NOT IN (SELECT id FROM produtos);

-- ativo bate com Status da planilha para itens OK
SELECT count(*) FROM produtos p
 JOIN stg_produtos_atualizado s ON upper(s.sku_canonico)=upper(p.sku)
 WHERE s.classe LIKE 'OK%' AND p.ativo <> (s.status_planilha='true');
```

## 5. Rollback

- `produto_migracao_backup` snapshota cada produto antes de qualquer mudança (id original preservado).
- `restaurar_migracao_produtos(p_execucao timestamptz)`:
  1. Reinsere produtos deletados (id original).
  2. Para cada `acao='remap'` em `produto_migracao_log`, executa UPDATE inverso `destino → origem`.
  3. Remove os aliases de `produto_identificadores_legacy` criados na execução.
- Run 1 e Run 2 reversíveis independentemente por timestamp.

## 6. Relatório final entregável

`/mnt/documents/relatorio_migracao_produtos_v3.xlsx`, abas:
`resumo, OK_ativos, OK_inativos, apontamento_canonico, codigo_invalido_generico, status_excluir, criados, atualizados, inativados, remapeados (origem→destino + qtd FKs por tabela), excluidos_com_remap, excluidos_direto, aliases_pendentes, pendencias_manuais, orfaos_no_banco, fk_check, antes_depois`.

## 7. Entregáveis técnicos após aprovação

1. Migration substituindo `executar_migracao_produtos` por versão 3-fases (`dry_run | aplicar_nao_destrutivo | consolidar_e_excluir`) com pre-check `pg_constraint` e função `restaurar_migracao_produtos`.
2. Ajuste em `consolidar_produto` para `RAISE EXCEPTION` se FKs divergirem.
3. Script Python que lê os logs e gera o XLSX em `/mnt/documents/`.
4. Sequência: Run 0 → revisão sua → Run 1 → revisão → Run 2 → relatório final.

Sem UI nova; tudo via RPC + script. Tabelas `produto_migracao_*` reaproveitadas.

---

## Histórico — versões anteriores deste plano

(seção mantida só como referência; doutrina vigente está acima)

### Estado anterior (diagnóstico inicial)

- 275 produtos antes da Run 1 da v1; após primeira execução (24 criados) foi para 299.

### Notas operacionais herdadas

- `produtos_fornecedores` / `produto_composicoes`: deduplicar por `(produto_id, fornecedor_id)` / `(produto_pai_id, produto_filho_id)` antes do UPDATE para não violar `UNIQUE`.
- `produto_migracao_mapa.UNIQUE(produto_id_origem)` garante idempotência.
- Pendências esperadas: `Torneira Cobb`, linhas com SKU genérico sem match.

## (legado, não autoritativo) Estado atual

- **ERP (`produtos`)**: 275 registros. 51 com SKU legado (`00000000…` ou `LEG-…`), todos `ativo=false`. Duplicidades reais por SKU: apenas `MA004` e `VR039` (2 cada).
- **`produtos_Atualizado.xlsx` / aba `produtos`**: 291 linhas. Colunas: `Código SKU, Produto, IGUAL SKU, UN, Variações, Estoque, P. Venda, P. Custo, Margem, Status`.
  - Status: `true` = 264, `false` = 26, `EXCLUIR` = 1.
  - `IGUAL SKU = "OK"` em 193 linhas → SKU canônico já é o próprio `Código SKU`.
  - `IGUAL SKU = "-"` → 1 linha (`Torneira Cobb`, status `EXCLUIR`) → pendência.
  - Demais 97 linhas têm `IGUAL SKU` apontando para um SKU de destino (ex.: `VR036`, `MA004`, `SR030`…).
- **`SISTEMA_AVIZEE.xlsx` / aba `Produtos`**: complementa `GRUPO`, `PESO`, `Fornecedor`, `REF. FORNECEDOR`, `SITE PRODUTO FORNECEDOR`.
- **Tabelas com FK para `produtos.id`** (a remapear antes da exclusão):
  `compras_itens, cotacoes_compra_itens, estoque_movimentos, fechamento_estoque_saldos, nfe_distribuicao_itens, notas_fiscais_itens, orcamentos_itens, ordens_venda_itens, pedidos_compra_itens, precos_especiais, produto_composicoes (pai e filho), produto_identificadores_legacy, produtos_fornecedores, recebimentos_compra_itens, remessa_itens`.

## Estratégia em 6 etapas (uma migração + um runner)

### 1. Backup e tabelas de auditoria (migration única, idempotente)

Cria, no schema `public`:
- `produto_migracao_backup` — snapshot completo de cada `produtos` afetado (todas as colunas + `criado_em`).
- `produto_migracao_mapa` — `sku_origem, produto_id_origem, sku_destino, produto_id_destino, motivo, status (auto|manual|pendente|aplicado|abortado)`.
- `produto_migracao_log` — `data_execucao, sku_origem, sku_destino, produto_id_origem, produto_id_destino, acao, tabela_afetada, qtd_registros, status, erro`.
- Função `public.remap_produto_fk(p_origem uuid, p_destino uuid)` `SECURITY DEFINER, search_path=public` que atualiza, dentro de transação:
  - todas as 15 tabelas FK acima (lista hardcoded para auditoria explícita), gravando `qtd_registros` por tabela em `produto_migracao_log`.
- Função `public.consolidar_produto(p_origem uuid, p_destino uuid)`:
  1. Insere snapshot do origem em `produto_migracao_backup`.
  2. Chama `remap_produto_fk`.
  3. Garante registro em `produto_identificadores_legacy` (origem → destino).
  4. `DELETE FROM produtos WHERE id = p_origem` dentro de `BEGIN/EXCEPTION` — em caso de FK residual aborta apenas esse item, marca `status='abortado'` no mapa e `erro` no log.
- Função `public.excluir_produto_seguro(p_id uuid)` para o caso `Status=EXCLUIR` sem destino: só executa se nenhuma das 15 tabelas tiver registros; caso contrário marca pendência.

Nada destrutivo é executado pela migration; ela só cria estrutura.

### 2. Carga da planilha em staging

Edge function (ou script único disparado via supabase functions) `migrar-produtos-atualizado`:
- Lê os 3 XLSX a partir de Storage (bucket `dbavizee/migracoes/`) — usuário será orientado a fazer upload manual via UI.
- Popula tabela `stg_produtos_atualizado` (criada na migration) com as 291 linhas + chave do SKU canônico calculada:
  - `sku_canonico = IGUAL SKU` se for SKU válido (regex `^[A-Z]{2,3}\d{3,}$` ou `LEG-…`); 
  - senão `sku_canonico = Código SKU` quando `IGUAL SKU IN ('OK', NULL)`;
  - senão marca `pendencia=true` (caso `-`, vazio inválido).
- Enriquecer com `SISTEMA_AVIZEE.Produtos` por SKU (GRUPO, PESO, Fornecedor, REF., SITE).

### 3. Construção do mapa (sem alterar `produtos`)

Ainda no runner, em transação read-only de inspeção:
- Para cada linha do staging, encontrar `produto_id_destino` na tabela `produtos` por `sku = sku_canonico` (case-insensitive, trim).
- Para cada `Código SKU` legado existente no ERP cujo `IGUAL SKU` aponta para outro, gravar par em `produto_migracao_mapa` com `status='auto'`.
- Casos sem destino (sku canônico não existe ainda) → criar registro novo nesta etapa via `INSERT INTO produtos` (somente os campos da fonte; preservar NCM/CFOP/CST quando já existirem).
- Casos `Status=EXCLUIR` ou `IGUAL SKU='-'` → `status='pendente'`, motivo descritivo.

Saída: relatório imprime totais (criar/atualizar/consolidar/excluir/pendentes).

### 4. Aplicação (em duas execuções, com confirmação)

- **Run 1 — “dry-run aplicado”**: executa atualizações de campos não-fiscais nos canônicos (`nome, un, variacoes, estoque_atual, preco_venda, preco_custo, ativo, grupo_id (via lookup por nome em `grupos_produto`, criando 'OUTROS' se faltar), peso, fornecedor principal via `produtos_fornecedores``). NCM/Origem fiscal nunca são tocados. Cria os produtos novos. Não consolida nem deleta nada.
- **Run 2 — consolidação**: para cada par `auto` no mapa chama `consolidar_produto(origem, destino)`. Itens `pendente` ficam intocados.

### 5. Validações finais (script de verificação)

- `SELECT sku, count(*) FROM produtos GROUP BY 1 HAVING count(*)>1` → deve voltar vazio.
- `SELECT count(*) FROM produtos WHERE ativo AND (sku IS NULL OR sku ~ '^0+[A-Z0-9]+$')` → 0.
- Para cada uma das 15 tabelas: `WHERE produto_id NOT IN (SELECT id FROM produtos)` → 0.
- Conferir totais: produtos canônicos esperados ≈ 264 ativos + LEG-* inativos preservados.

### 6. Relatório entregável

Script Python lê `produto_migracao_log` + `produto_migracao_mapa` e gera `/mnt/documents/relatorio_migracao_produtos.xlsx` com abas: `criados, atualizados, consolidados, excluidos_fisicamente, pendencias_manuais, remapeamentos_por_tabela, antes_depois`.

## Detalhes técnicos relevantes

- **SKU canônico**: tudo upper-case e trim; rejeitar valores `OK`, `-`, vazios como destino.
- **Idempotência**: `produto_migracao_mapa` tem `UNIQUE(produto_id_origem)`. `consolidar_produto` checa `produto_id_origem` ainda existe antes de agir; logo, reexecução é segura.
- **Preservação fiscal**: campos `ncm, cest, cfop, origem, cst_*, csosn, ipi_*, pis_*, cofins_*` jamais são UPDATE-ados pelo runner.
- **Histórico**: nada em `estoque_movimentos`, `notas_fiscais_itens`, `orcamentos_itens`, `pedidos_compra_itens` etc. é deletado — apenas `produto_id` é repontado para o canônico.
- **`produtos_fornecedores` / `produto_composicoes`**: ao remapear, deduplicar por `(produto_id, fornecedor_id)` / `(produto_pai_id, produto_filho_id)` antes do UPDATE, mantendo o registro mais antigo e descartando o duplicado para evitar violar `UNIQUE`.
- **Permissão**: runner roda como service role via edge function; UI exposta apenas em /administracao para admin.
- **Transação**: cada `consolidar_produto` é uma transação isolada; falha em um item não bloqueia os demais.

## Pendências previstas para revisão manual

- `Torneira Cobb` (Status `EXCLUIR`, IGUAL SKU `-`) — sem destino; apenas marcar `ativo=false` e logar pendência.
- Linhas `Código SKU` vazio + `IGUAL SKU` vazio/inválido — mesma tratativa.
- Qualquer FK que impeça delete físico do duplicado — registrada em `produto_migracao_log` com `status='abortado'`.

## Entregáveis após aprovação

1. Migration com tabelas, funções e seed do staging vazio.
2. Edge function `migrar-produtos-atualizado` (upload das planilhas + dry-run + aplicação em duas fases controladas por parâmetro).
3. Tela simples em `/administracao/migracao-produtos` (admin only) para disparar cada fase e baixar o relatório.
4. `relatorio_migracao_produtos.xlsx` em `/mnt/documents/`.
