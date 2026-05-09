# Onda 32 — Grid de Transportadoras (mobile)

Foco: refinar o grid no mobile sem mexer em regra de negócio. Mudanças em apresentação (`src/pages/Transportadoras.tsx`) e, se necessário, microajustes em wrappers compartilhados.

## Alta prioridade

### 1. Cards de resumo sem truncamento
- `SummaryCard` já aceita `shortTitle` (renderizado no mobile). Aplicar:
  - "Sem prazo médio" → `shortTitle="Sem prazo"`
  - "Sem contato" → `shortTitle="Sem contato"`
  - Total/Ativas já cabem.

### 2. Placeholder da busca mais curto no mobile
- Hoje: `"Buscar por nome, CNPJ ou cidade..."`.
- Usar `useIsMobile`: mobile → `"Buscar transportadora..."`; desktop → mantém atual.

### 3. Status visível no card mobile
- A coluna `ativo` já tem `mobileCard: true` (acabou de virar visível também no desktop na Onda 30). Garantir que o `StatusBadge` aparece no card mobile.
- Confirmar ordem dos campos em `mobileCard` para o status ficar próximo da modalidade.

### 4. Nome em até 2 linhas no card mobile
- A coluna `nome_razao_social` (mobilePrimary) hoje renderiza nome com `leading-tight`. Trocar `truncate` (se houver) por `line-clamp-2` no nome principal e manter `truncate` no nome fantasia.
- Ajuste isolado nessa coluna; não toca `MobileCardList`.

### 5. Hierarquia / leitura do card
- Manter ordem: Nome (2 linhas) → fantasia (1 linha truncada) → identificador `PJ · 44.914.992/0001-38` (CNPJ já com máscara da Onda 30) → Cidade/UF → Modalidade (badge) → Status (badge).
- Nada de novos campos; só ordem e formatação.

## Média prioridade

### 6. Telefone no card mobile (quando houver)
- A coluna `contato_principal` hoje não está marcada como `mobileCard`. Adicionar `mobileCard: true` para mostrar telefone+e-mail no card.
- Mantém ícones discretos `Phone`/`Mail` que já existem.

## Fora de escopo

- **Topbar / nome do módulo truncado** — vem do app shell (`Sidebar`/`Topbar`), não da página de Transportadoras. Tratar em onda específica do shell mobile.
- **Bottom nav / contexto "Fornecedores ativo"** — também é do shell de navegação.
- **Esconder setas da paginação quando há 1 página** — comportamento do `DataTable` compartilhado; impacta todos os módulos. Tratar em onda própria.
- **Botão "Nova Transportadora" muito dominante** — já segue padrão do `ModulePage`; mexer aqui causa inconsistência.

## Arquivos a alterar

- `src/pages/Transportadoras.tsx` — única mudança.

## Validação

- Build passa.
- `/transportadoras` no preview a 390px: ver cards-resumo sem truncar, placeholder curto, card com nome em 2 linhas, status visível, telefone presente quando houver.
- 1162px (atual): nada quebra; placeholder volta ao texto longo; cards-resumo continuam com label completo.
