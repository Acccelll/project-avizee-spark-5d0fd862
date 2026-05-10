# Onda 42 — Grid de Funcionários: identificação, filtros e cards

Refinos no `src/pages/Funcionarios.tsx` para tornar o grid mais útil para RH sem mudar schema nem regra de negócio. Tudo é UI/apresentação.

## Escopo (alta prioridade)

### 1. Identificação do funcionário no grid
Coluna **Nome** vira célula composta (duas linhas):
- Linha 1: `nome` (atual)
- Linha 2: `CPF: ***.***.NNN-NN` em `text-xs text-muted-foreground` (mascara os 6 primeiros dígitos, mostra os 3 últimos + DV — padrão LGPD-friendly). Quando sem CPF, oculta a linha.

CPF completo continua visível no Drawer/Edit (já existe). Coluna `cpf` standalone permanece como opcional escondida.

### 2. Card "Folha Mensal" — explicar o cálculo
- Renomear para **"Salários (ativos)"**
- Subtítulo/tooltip: *"Soma de salários-base de funcionários ativos. Não inclui encargos, benefícios ou comissões."*
- Usa `SummaryCard` com prop de tooltip/hint (verificar suporte; senão envolver em `Tooltip`).

### 3. Contrato como badge
Coluna **Contrato** passa a renderizar um badge discreto (`Badge` outline + cor por tipo via `STATUS_VARIANT_MAP` ou map local):
- CLT → neutro
- PJ → info
- Estágio → warning suave
- Temporário → muted

### 4. Filtro por Departamento
- Adicionar `MultiSelect` "Departamento" no `AdvancedFilterBar`.
- Opções derivadas dinamicamente de `data` (departamentos distintos, ordenados, ignorando vazios).
- Estado em `useUrlListState` (`filterValue.departamento: stringArray`), aplicado em `filteredData` e exibido nos `activeFilters` chips.

### 5. Tempo de casa na coluna Admissão
Célula **Admissão** vira composta:
- Linha 1: `formatDate(data_admissao)` (atual)
- Linha 2: `2 anos e 4 meses` em `text-xs text-muted-foreground`, calculado por util local `tempoDeCasa(data_admissao, data_demissao?)` (anos/meses cheios; "menos de 1 mês" como fallback).

## Escopo (média)

### 6. Coluna opcional "Salário" com gate de permissão
- Coluna `salario_base` continua oculta por padrão (já está). 
- Gating: usar `useCan('funcionarios','salario_view')` ou — se a permissão fina não existir — `useIsAdmin()` como mínimo seguro. Sem permissão, a coluna não aparece em `columns` nem no toggle. **Decisão:** começar com `useIsAdmin()` para evitar adicionar permissão nova; deixar TODO para criar `salario_view` depois.

### 7. Paginação 1-página
No `DataTable`, quando `totalPages <= 1` ocultar setas prev/next (manter contador "1–N de N"). Mudança no `DataTable` se for trivial e não-invasiva; senão, escopo separado.

## Fora de escopo
- Cards futuros (férias, aniversariantes, documentos pendentes) — depende de dados não existentes hoje.
- Filtro avançado por cargo (busca já cobre).
- Mudanças no Drawer/Edit/schema/RPC.
- Permissão nova `salario_view` (anotada como TODO).

## Arquivos
- `src/pages/Funcionarios.tsx` — colunas, filtro depto, KPI rename, gate salário, util `tempoDeCasa`, máscara CPF parcial.
- `src/components/DataTable.tsx` — apenas se for ocultar setas em página única (avaliar; pode virar item separado).
- Sem migrations.

## Validação
- Build limpo.
- Visual: viewport atual (1292) e mobile.
- Confirmar que filtros chips removem corretamente `departamento`.