## Diagnóstico atual (consultado)

Tabela `produtos` (253 registros):
- 232 `tipo_item='produto'`, 21 `tipo_item='insumo'`, 0 sem tipo → classificação confiável.
- 176 com `codigo_interno = sku` (caso "duplicado").
- 76 com `codigo_interno` vazio/nulo.
- 1 caso divergente: SKU=`VR040`, codigo_interno=`VR041` (MEDIDOR CO2) — provável erro; `codigo_legado` está nulo.
- 0 registros já no padrão `PRD/INS`.
- `codigo_legado` existe na tabela e está vazio para todos os produtos (campo livre para preservar histórico).
- Único índice relevante: `idx_produtos_sku` (não há unique em codigo_interno hoje).

Uso de `codigo_interno` no código: principalmente como fallback de exibição de "código" em relatórios, drawers e autocompletes. Importação (`useImportacaoEstoque/Faturamento/Cadastros`) usa `codigo_interno` como chave secundária de match — a nova numeração `PRD/INS` continuará servindo como chave única, mas o match histórico de planilhas externas usa códigos antigos (tipo `AG011`) que hoje moram no SKU. **Implicação:** importadores devem priorizar SKU como chave de match externo (já fazem `codigo_legado` primeiro, depois `codigo_interno`); vamos adicionar SKU ao fallback.

Nenhuma FK em outras tabelas referencia `codigo_interno`/`sku` — todas usam `produto_id` (uuid). Logo, renumerar não quebra vínculos fiscais/financeiros/estoque.

## Plano

### 1. Schema (migration)
- Adicionar coluna `codigo_interno_legado text` em `produtos` para preservar valores anteriores (mais simples e auditável que tabela nova; o `codigo_legado` já existe mas é usado por outros fluxos de importação).
- Criar duas SEQUENCES atômicas: `seq_codigo_interno_produto` e `seq_codigo_interno_insumo` (alinhado com mem://tech/numeracao-atomica-documentos).
- RPC `proximo_codigo_interno(_tipo text)` retornando `PRD000001` / `INS000001` com `search_path = public`.
- Trigger `BEFORE INSERT` em `produtos`: se `codigo_interno` nulo/vazio, gera via RPC conforme `tipo_item`.
- Após backfill, aplicar `UNIQUE (codigo_interno)` e `CHECK (codigo_interno ~ '^(PRD|INS)[0-9]{6}$')`.
- Índice `idx_produtos_codigo_interno`.

### 2. Dry-run (relatório)
Antes da migração de dados, gerar relatório consultando:
- 232 produtos receberão `PRD000001..PRD000232` (ordenados por `created_at, sku`).
- 21 insumos receberão `INS000001..INS000021`.
- 1 caso divergente (`VR041`): codigo_interno atual será movido para `codigo_interno_legado` antes de receber novo código.
- 176 com ci=sku: codigo_interno antigo NÃO precisa ser preservado (é cópia do SKU); apenas substituir.
- 76 vazios: receber código novo.
- SKU permanece **intacto** em 100% dos registros.

Apresentar o dry-run ao usuário (tabela resumo) antes de executar a renumeração.

### 3. Migração de dados (após aprovação do dry-run)
Em transação única:
1. Copiar `codigo_interno` atual (apenas quando ≠ sku e ≠ vazio) para `codigo_interno_legado`.
2. Numerar todos os 253 registros via sequences, ordenando por `tipo_item, created_at, sku` para estabilidade.
3. Verificar zero duplicatas, zero vazios, todos batendo regex.

### 4. UI / componentes
- `Produtos.tsx`: relabel "Cód. Interno" → "Código Interno (ERP)"; adicionar tooltip "Sequencial interno PRD/INS"; SKU permanece como "SKU" com tooltip "Código comercial canônico". Ordenação default do grid: por `sku` ASC (hoje não tem default explícito).
- `ProdutoView`, `EstoquePosicaoDrawer`, autocompletes: continuam seguindo regra mem://tech/exibicao-codigo-produto (mostrar SKU + Código Interno apenas quando diferentes — agora sempre serão).
- Demais grids do ERP (Clientes, Fornecedores, Fiscal, Financeiro, etc.): garantir `defaultSortBy: nome ASC` quando ainda não houver. Auditoria rápida nos `DataTableV2` de cada página.
- Busca: `searchColumns` em `Produtos.tsx` já inclui `nome, sku, codigo_interno, ncm` — manter.

### 5. Importadores
- `useImportacaoEstoque/Faturamento/Cadastros`: adicionar SKU como terceira chave de match (`codigo_legado` → `codigo_interno` → `sku`) para suportar planilhas antigas que enviavam o código que hoje vive no SKU.
- Cadastro manual: form NÃO permite editar `codigo_interno` (read-only "gerado automaticamente"); permite editar SKU normalmente.

### 6. Validações finais
- Query de verificação: 0 duplicatas em `codigo_interno`, 0 vazios, 100% no padrão regex, SKUs inalterados (comparar com snapshot pré-migração).
- Smoke nas telas de Produtos, Estoque, Orçamento, Pedido de Compra, NF-e (autocompletes de produto).

## Detalhes técnicos

- Migrations: 1 schema (coluna+sequences+RPC+trigger), 1 data (backfill via insert tool / UPDATE), 1 schema final (UNIQUE + CHECK + índice).
- RPC `proximo_codigo_interno(_tipo text)` — `SECURITY DEFINER`, `search_path = public`, valida `_tipo IN ('produto','insumo')`.
- Coluna `codigo_interno_legado` permite rollback/auditoria sem tabela nova.
- `tipo_item` será o critério único de classificação (já 100% preenchido).
- Ordenação no grid: setar prop `defaultSortBy="sku"` no DataTableV2 do `Produtos.tsx`; nos demais, `defaultSortBy="nome"`.

## Entregáveis
1. Migration schema + RPC + trigger.
2. Relatório dry-run apresentado em chat.
3. Migration data (após aprovação).
4. Migration de constraints (UNIQUE + CHECK).
5. Ajustes em `Produtos.tsx` (labels, tooltip, defaultSort, codigo_interno read-only).
6. Auditoria de defaultSort nos demais grids.
7. Ajuste fallback de match nos importadores.
8. Relatório antes/depois + validação final.
