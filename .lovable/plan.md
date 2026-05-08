## Onda 20 — Grid de Clientes: leitura, saneamento e ações comerciais

Escopo: apenas `src/pages/Clientes.tsx` (camada de apresentação do grid). Sem mudanças de schema, services, RLS ou no formulário de cadastro.

### Objetivo
Transformar o grid em ferramenta de **gestão comercial e saneamento cadastral**: documentos/telefones legíveis, contato escaneável, situação cadastral visível, cards acionáveis e filtros úteis.

---

### 1. Máscaras visuais (alta)
- Importar `cpfCnpjMask`, `phoneMask` de `@/utils/masks`.
- Coluna **CPF/CNPJ**: render via `cpfCnpjMask(c.cpf_cnpj)`.
- Coluna **Contato**: telefone via `phoneMask(c.celular || c.telefone)`.
- Busca continua usando dígitos puros (já normalizada server-side).

### 2. Coluna "Cliente" mais informativa (alta)
- Renomear label "Nome / Razão Social" → **"Cliente"**.
- Linha 1: `nome_razao_social` (font-medium).
- Linha 2 (se existir): `nome_fantasia` · `cidade/uf` em `text-xs text-muted-foreground` truncado.

### 3. Coluna "Tipo" como badge (baixa)
- Substituir o texto colorido por `<Badge variant="outline">PJ</Badge>` / `PF` com `Tooltip` ("Pessoa Jurídica" / "Pessoa Física"). Badge em `text-[10px] uppercase tracking-wide`.

### 4. Coluna "Contato" estruturada (alta)
- Layout em duas linhas com ícones discretos (`Phone` / `Mail` 12px), telefone formatado em `tabular-nums font-medium`, e-mail em `text-muted-foreground truncate max-w-[220px]`.
- Empty state: `<DetailEmpty>` curto "Sem contato" como link de ação (abre filtro `sem_contato`).

### 5. Coluna "Prazo Pgto." (baixa)
- Renomear "Prazo" → **"Prazo Pgto."**.
- Render: `30 dias` / `15 dias` / `Sem prazo` (manter `text-xs`, monospace só nos números).

### 6. Nova coluna "Situação cadastral" (alta)
- Nova coluna calculada (client-side, baseada nos campos já carregados):
  - `Completo`: tem documento + (telefone OU celular) + e-mail + `prazo_padrao > 0` + endereço (`cidade` + `uf`).
  - Caso contrário, `Incompleto` com tooltip listando o que falta (ex.: "Sem contato, sem prazo").
- Render usando `StatusBadge` semântico (`success` / `warning`).

### 7. Coluna "Grupo Econômico" oculta por padrão (média)
- `hidden: true` na definição da coluna (continua disponível em "Colunas"). Quando preenchido, o nome do grupo aparece na **linha 2 da coluna Cliente** (sufixo `· Grupo X`).

### 8. Cards superiores acionáveis (média)
- Trocar o card "Com Grupo Econômico" por **"Cadastros incompletos"** (contagem client-side da página atual + label "na página atual" enquanto não houver RPC; nota técnica abaixo).
- Adicionar `onClick` em todos os 4 cards aplicando filtro:
  - Total → limpa filtros.
  - Ativos → `ativoFilters=["ativo"]`.
  - Inativos → `ativoFilters=["inativo"]`.
  - Incompletos → novo filtro client-side `incompleto`.
- Card ativo recebe `ring-2 ring-primary` e exibe chip removível na `AdvancedFilterBar`.

### 9. Filtros adicionais (média)
- Adicionar `MultiSelect` "Cadastro" com opções: `Sem contato`, `Sem e-mail`, `Sem telefone`, `Sem prazo`, `Sem grupo`. Avaliados client-side sobre a página atual (consistente com hoje, que já filtra `sem_grupo` client-side).
- Limite explícito no chip: "filtro aplicado à página atual" via tooltip, para não enganar o usuário (paginação server-side permanece).

### 10. Ações rápidas por linha (média)
- Substituir uso direto de `onView/onEdit` do `DataTable` por `RowActions` (já existente em `src/components/list/RowActions.tsx`):
  - **primary**: `Ver` (Eye).
  - **secondary**: `Editar`, `Novo orçamento` (navega `/orcamentos/novo?clienteId=...`), `Nova venda` (`/pedidos/novo?clienteId=...`).
  - **destructive**: `Inativar` (mantém `deleteBehavior="soft"`, gated por `canExcluir`).
- No mobile, manter `MobileCardActions` atual; ações comerciais ganham `ContactInlineActions` já presente.

### 11. Toolbar coesa (baixa)
- `AdvancedFilterBar` já agrupa busca+filtros+contagem; mover botões "Colunas" e "Exportar" do `DataTable` para o `actions` slot do `AdvancedFilterBar` quando suportado, ou aplicar `gap-2` consistente. Sem mudança estrutural se exigir refator do `DataTable`.

---

### Notas técnicas
- **KPI "Cadastros incompletos" exato** exigiria RPC agregado (ex.: `kpi_clientes_qualidade`) — fora de escopo desta onda. Implementação atual conta sobre a **página carregada** com label honesto. TODO documentado em comentário.
- **Filtros "sem_*" server-side** também exigiriam expansão do `useSupabaseCrud` para operadores `is.null`/`or` — fora de escopo. Mantemos client-side coerente com o padrão atual de `sem_grupo`.
- Sem alterações em rotas, permissões (`useCan`), schema, hooks de dados ou no `ClienteForm`. Mudanças puramente de apresentação no arquivo `src/pages/Clientes.tsx`.
- Reutilizar componentes existentes: `RowActions`, `StatusBadge`, `Badge`, `Tooltip`, `cpfCnpjMask`, `phoneMask`. Nenhum novo arquivo necessário.

### Fora de escopo
- Refactor do `DataTable`, mobile cards, formulário de cadastro/edição, RPCs de KPI, novos índices DB, alterações de rotas e novos endpoints comerciais.
