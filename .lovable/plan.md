
# Atualização segura do Cadastro de Produtos

## Estado atual (diagnóstico já realizado)

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
