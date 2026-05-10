# Onda 42b — Grid Funcionários: refinos mobile

Ajustes só de UI/apresentação no mobile do `/funcionarios`. Aproveita as APIs já existentes (`shortTitle`, `subtitle` em `SummaryCard`; `mobilePrimary`, `mobileCard`, `mobileIdentifierKey`, `mobileStatusKey`, `mobileLabeledDetails` em `DataTable`; campo `identifier` em `MobileCardList`).

## Alta prioridade

### 1. Cards-resumo (KPIs) — corrigir truncamento e densidade
Adicionar `shortTitle` em todos para encurtar no mobile (já há suporte nativo no `SummaryCard`):

| Card | Desktop | Mobile (`shortTitle`) |
|---|---|---|
| Total de Funcionários | (mantém) | "Total" |
| Ativos | (mantém) | "Ativos" |
| Inativos | (mantém) | "Inativos" |
| Salários (ativos) | (mantém) | "Folha" |

**Folha em formato compacto no mobile**: criar util local `formatCurrencyCompact(n)` que retorna `R$ 17,5 mil` / `R$ 1,2 mi` (Intl `notation: "compact", compactDisplay: "short", currency: "BRL"`). Usar `useIsMobile()` para escolher entre `formatCurrency` e `formatCurrencyCompact` no card "Salários (ativos)". Subtítulo "Soma de salários-base de ativos" continua (já implementado).

### 2. Placeholder de busca mais curto no mobile
Trocar `searchPlaceholder` por algo responsivo. Como `AdvancedFilterBar` aceita string, usar `useIsMobile()` para alternar:
- desktop: `"Buscar por nome, cargo, CPF, departamento..."`
- mobile: `"Buscar funcionário..."`

### 3. Card de funcionário — hierarquia Nome → Cargo → metadados
Reorganizar as `columns` e flags mobile para que o card mobile mostre:

```
Ana Paula Ferreira          [Ativo]   ⋮
Analista Financeiro
Financeiro · CLT · 15/01/2024
CPF ***.***.789-01
```

Mudanças no array `columns`:
- Coluna `nome` → `mobilePrimary: true` (já é primary por default; reforçar). Renderiza só o nome no mobile (sem o CPF embaixo, pois CPF vai como `identifier`).
- Coluna `cargo` → `mobilePrimary: false`, **subtítulo do nome**: para isso, expandir o `render` da coluna `nome` para detectar mobile e incluir o cargo como segunda linha em `text-sm font-normal text-muted-foreground`. Alternativa mais limpa: criar `mobileSubtitleKey="cargo"` no `DataTable` (escopo extra — preferir aproveitar o render duplo do `nome`).
  - **Decisão:** dentro do `render` de `nome`, mostrar `<span className="font-semibold">{nome}</span>` + (mobile-only via `sm:hidden`) `<span className="block text-sm text-muted-foreground">{cargo}</span>`. Cargo continua como coluna no desktop.
- Cargo → adicionar `mobileCard: false` para evitar repetir como detail-field.
- `cpf` (oculta) ganha `mobileIdentifier: true` via `mobileIdentifierKey="cpf"` no `<DataTable>`, com `render` mascarado: `CPF ***.***.789-01`.
- `departamento`, `tipo_contrato`, `data_admissao` ganham `mobileCard: true` para virarem a linha de metadados (separados por `·` automaticamente quando `mobileLabeledDetails` é `false` — comportamento atual).
- Status já está em `mobileStatusKey="ativo"` → vai para o canto superior direito (já está). Manter.

### 4. CPF mascarado no card mobile
Configurar `mobileIdentifierKey="cpf"` no `<DataTable>`. Como a coluna `cpf` já existe (oculta no desktop), o `MobileCardList` vai renderizar o `render` dela como `identifier`. Trocar o `render` da coluna `cpf` para `f.cpf ? \`CPF ${maskCpfPartial(f.cpf)}\` : ""` (string vazia esconde a linha).

## Média prioridade

### 5. Card mais compacto
Reduzir paddings do `MobileCardList` ou aplicar densidade via prop. **Conservador:** não tocar no `MobileCardList` (componente compartilhado por vários módulos). Ganho de altura virá naturalmente ao remover repetições (cargo deixa de ser detail-field).

### 6. Card inteiro tappable (já existe)
`MobileCardList` já chama `onItemClick={onRowClick ?? onView ?? onEdit}`. `Funcionarios` já passa `onView`. Sem mudanças.

## Fora de escopo
- Aniversariantes / férias / documentos pendentes (KPIs futuros — depende de dados não modelados).
- Mudanças no `MobileCardList` (densidade global, separadores customizados).
- Mudança no `DataTable` para suportar `mobileSubtitleKey` (over-engineering pra um caso).
- Filtros adicionais (já entregue: status, contrato, depto).

## Arquivos
- `src/pages/Funcionarios.tsx` — `shortTitle` nos 4 KPIs, `formatCurrencyCompact` mobile, placeholder responsivo, render duplo da coluna `nome` (cargo no mobile), `mobileCard`/`mobileIdentifierKey="cpf"` configurados, render de `cpf` ajustado.
- Sem mudanças em componentes compartilhados, sem migrations.

## Validação
- Build limpo (tsc).
- Visual em 391×844 (viewport atual): KPIs sem truncar, "Folha R$ 17,5 mil", placeholder "Buscar funcionário...", card com Nome (bold) + Cargo (muted) + linha "Depto · Contrato · Admissão" + "CPF ***.***.NNN-NN" + badge Ativo + menu.
- Visual desktop (≥1024px): inalterado em relação à Onda 42.