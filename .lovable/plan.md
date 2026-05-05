## Relatórios de Cadastros

Adicionar uma nova categoria **Cadastros** ao módulo `/relatorios`, no mesmo padrão dos demais (catálogo → filtros → KPIs → tabela → exportações CSV/PDF/XLSX → drill-down). Reaproveita toda a infra existente (`useRelatorio`, `RelatorioCatalogo`, `FiltrosRelatorio`, `useRelatorioExport`, `ExportMenu`, `ReportHeader`, semântica de status via `*Kind`).

### Novos relatórios

1. **Cadastro de Produtos** (`cadastro_produtos`)
   - Colunas: SKU, Código Interno, Nome, Grupo, UN, Tipo (produto/insumo), NCM, Origem, Custo, Preço Venda, Margem %, Estoque, Mínimo, Situação (ativo/inativo/descontinuado).
   - KPIs: total cadastrados, ativos, inativos, sem custo, sem preço, sem NCM, sem grupo.
   - Filtros: Grupo, Status (ativo/inativo/descontinuado), Tipo (produto/insumo), "somente sem custo/preço".
   - Drill-down: abrir produto em `/produtos`.

2. **Cadastro de Clientes** (`cadastro_clientes`)
   - Colunas: Tipo Pessoa, Nome/Razão, Fantasia, CPF/CNPJ, Município/UF, E-mail, Telefone, Limite de Crédito, Prazo Padrão, Forma Pagamento, Grupo Econômico, Situação.
   - KPIs: total, ativos, inativos, sem e-mail, sem telefone, sem CPF/CNPJ, com limite de crédito definido.
   - Filtros: Status (ativo/inativo), Clientes (multi), UF (via filtro de status custom).
   - Drill-down: abrir cliente em `/clientes`.

3. **Cadastro de Fornecedores** (`cadastro_fornecedores`)
   - Colunas: Tipo Pessoa, Nome/Razão, Fantasia, CPF/CNPJ, Município/UF, E-mail, Telefone, Prazo Padrão, Origem, Transportadora (sim/não), Situação.
   - KPIs: total, ativos, inativos, sem CNPJ, sem contato.
   - Filtros: Status, Fornecedores (multi).
   - Drill-down: abrir fornecedor em `/fornecedores`.

4. **Cadastro de Transportadoras** (`cadastro_transportadoras`)
   - Subset de `fornecedores` onde `transportadora = true`.
   - Colunas: Nome/Razão, CNPJ, Município/UF, Telefone, E-mail, Situação.
   - KPIs: total, ativas, sem contato.

### Implementação técnica

**1. Tipo e dispatcher**
- `src/services/relatorios/lib/shared.ts`: estender union `TipoRelatorio` com `cadastro_produtos | cadastro_clientes | cadastro_fornecedores | cadastro_transportadoras`.
- `src/services/relatorios.service.ts`: adicionar cases delegando ao novo loader.

**2. Novo loader**
- Criar `src/services/relatorios/loaders/cadastros.ts` exportando `loadCadastroProdutos`, `loadCadastroClientes`, `loadCadastroFornecedores`, `loadCadastroTransportadoras`. Cada um:
  - Faz `select` em `produtos` / `clientes` / `fornecedores` (sem `.eq('ativo', true)` — relatório precisa ver inativos), com join opcional em `grupos_produto` ou `formas_pagamento`.
  - Aplica `dedupe` legado para produtos (filtra `00000000…` SKUs como nas demais views).
  - Mapeia linha + `*Kind` derivado de `ativo`/`deleted_at`/`descontinuado_em` via novo entry em `statusMap.ts` (`cadastroStatusMap`).
  - Retorna `RelatorioResultado` com `kpis`, `chartData` (pizza por situação ou por grupo/UF), `meta.kind = 'list'`, `meta.valueNature = 'quantidade'` (cadastros são contagem, não valor).

**3. Status map**
- `src/services/relatorios/lib/statusMap.ts`: adicionar `cadastroStatusMap` (`ativo→success`, `inativo→neutral`, `descontinuado→danger`) usando o contrato `STATUS_VARIANT_MAP` da memory `produto/contrato-de-status`.

**4. Configuração visual**
- `src/config/relatoriosConfig.ts`:
  - Adicionar `ReportCategory = 'cadastros'`.
  - Adicionar `reportCategoryMeta.cadastros` (título "Cadastros", ícone `Users` ou `ContactRound`).
  - Adicionar 4 `ReportConfig` com `columns`, `filters`, `kpis`, `chartType: 'pie'`, `drillDown` apontando para as páginas de cadastro.
  - Registrar em `reportConfigs` e `reportRuntimeSemantics` (statusField: `situacao`).

**5. Catálogo e exportação**
- Já é dirigido por `reportConfigs` — o catálogo (`RelatorioCatalogo`) e o `ExportMenu` passam a listar automaticamente.
- Verificar que `useRelatoriosFiltrosData` cobre o necessário; senão, passar arrays vazios (filtros opcionais).

### Não inclui
- Relatórios de cadastros auxiliares (grupos de produto, formas de pagamento, contas bancárias) — pode ser adicionado depois se houver demanda.
- Edição em massa a partir do relatório.
- Persistência de novos favoritos diferentes do que já existe.

### Arquivos afetados
- `src/services/relatorios/lib/shared.ts` (editado)
- `src/services/relatorios/lib/statusMap.ts` (editado)
- `src/services/relatorios/loaders/cadastros.ts` (novo)
- `src/services/relatorios.service.ts` (editado)
- `src/config/relatoriosConfig.ts` (editado)
