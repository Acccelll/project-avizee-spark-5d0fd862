## Onda 42j — Editar Sócio mobile fine-tuning

Escopo: apenas `src/pages/Socios.tsx`. Sem mudanças em FormModal, design system, schema, RPC ou validações de servidor.

### 1. Cadastro: 1 coluna em mobile

Trocar todos os `grid grid-cols-2 gap-4` da aba Cadastro por `grid grid-cols-1 sm:grid-cols-2 gap-4`. Pares afetados:
- CPF / Status do sócio
- E-mail / Telefone
- Data de entrada / Data de saída
- Forma padrão / Chave Pix → também `grid-cols-1 sm:grid-cols-2`, fazendo Chave Pix ocupar largura total no mobile e resolvendo o placeholder cortado.

Bloco bancário (`grid-cols-4`) → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`.

### 2. Participações: form vertical em mobile

`grid grid-cols-4 gap-3 items-end` → `grid grid-cols-1 sm:grid-cols-4 gap-3 sm:items-end`. Botão "Adicionar" recebe `w-full sm:w-auto` para virar full-width no mobile.

### 3. Status "Incompleta" mais explicativo

No card de resumo (3 colunas), adicionar abaixo do bloco um parágrafo helper condicional quando `composicaoStatus.label === "Incompleta"`:
> "A soma vigente de todos os sócios ainda não totaliza 100,00%."

E quando `Excedida`:
> "A soma vigente ultrapassa 100,00%. Ajuste os períodos."

Mudar label do KPI "Soma vigente (este sócio)" para algo mais claro, manter mas adicionar contexto: "Total do quadro: X de 100,00%" usando `somaTotalQuadro` se disponível, ou manter o do sócio com microcopy. Concretamente: novo label "Total do quadro societário" se a variável existir; caso não exista, manter "Soma vigente" mas exibir formato `X / 100,00%`.

O grid do resumo vira `grid grid-cols-1 sm:grid-cols-3 gap-4` (empilhado em mobile).

### 4. Lista de participações: cards em mobile

Manter `<table>` em `sm:` e acima. Em mobile (`sm:hidden`) renderizar lista de cards:

```text
┌─────────────────────────────┐
│ 20,00%        [Vigente]    │
│ Início: 22/04/2026          │
│                  [Excluir]  │
└─────────────────────────────┘
```

Tabela existente envolta em `hidden sm:block`. Bloco mobile com `space-y-2 sm:hidden`, cada item `rounded-lg border p-3` com header (percentual mono + badge), linha de início e botão Excluir alinhado à direita com `variant="ghost" size="sm"` e label de texto.

### 5. Suavizar borda "laranja"

Investigação: a borda forte vem do `:focus-visible` do `<form tabIndex={-1}>` em alguns navegadores apesar das classes. Remover `tabIndex={-1}` do `<form>` (não é necessário; submit funciona via `formId`). Manter classes de outline-none. Se o anel persistir, é do FormModal — fora de escopo.

### 6. Botão Salvar Alterações: clareza do disabled

Passar `disabledHint` ao `FormModalFooter` quando `!isDirty` (usar prop já existente):
- `disabledHint="Faça uma alteração para habilitar."` (mobile-only por design do FormModalFooter).

### Fora de escopo
- Refactor de FormModal/FormModalFooter.
- Migração para react-hook-form/zod.
- Mudanças em StatusBadge, MaskedInput.
- Toast/feedback adicional ao excluir participação (já tratado pelo hook).
