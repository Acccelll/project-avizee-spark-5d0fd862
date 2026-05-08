## Onda 21 — Refino mobile do grid de Clientes

Foco exclusivo na experiência mobile da listagem `/clientes`. Sem mudanças em backend, RLS, services ou no formulário de cliente.

### Escopo

**Arquivos previstos**
- `src/pages/Clientes.tsx` (principal)
- `src/components/MobileQuickAddFAB.tsx` (ajuste de offset para conviver com FAB global "Atalhos")

**Fora de escopo**
- `AppHeader` (problema 1 do brief): a barra superior é global, compartilhada por todos os módulos. Mexer aqui afeta o app inteiro e fica para uma onda dedicada de "header mobile".
- Refator do `DataTable` / paginação (problema 9): mantemos a paginação atual; só damos respiro visual no rodapé.
- `MobileQuickActions` (FAB global "Atalhos"): mantido — apenas reposicionamos o FAB de criação para não colidir.

---

### 1. Cards de resumo (alta) — corrigir truncamento

Hoje no mobile só 2 cards aparecem (Total e Ativos), e o título "Total de Clientes" trunca em telas estreitas.

- Mostrar **os 4 cards no mobile** em grid `2x2` (remover o `hidden md:contents` que oculta Inativos e Incompletos).
- Usar `shortTitle` do `SummaryCard` para rótulos curtos no mobile:
  - "Total de Clientes" → short: **"Total"**
  - "Ativos" → mantém
  - "Inativos" → mantém
  - "Incompletos (página)" → short: **"Incompletos"**

### 2. Placeholder da busca (alta) — encurtar no mobile

Atual: `"Buscar por nome, CNPJ, e-mail ou cidade..."` — trunca.

- Trocar por `useIsMobile()` e usar:
  - mobile: `"Buscar cliente..."`
  - desktop: texto atual completo.

### 3. Card de cliente (alta) — mais contexto comercial

Hoje o card mobile mostra: nome (+ subline), CNPJ formatado, contato, status pill. Falta tipo (PF/PJ) e prazo.

- Marcar a coluna `tipo_pessoa` como `mobileCard: true` para que o badge PF/PJ apareça no card.
- Marcar a coluna `prazo_padrao` como `mobileCard: true` (renderiza "30 dias" / "Sem prazo").
- Ativar `mobileLabeledDetails` no `DataTable` para que os detalhes apareçam como pares `label: valor` legíveis (Tipo, Prazo Pgto., Contato), em vez de inline cinza.
- Status (`ativo`) já é renderizado como `statusBadge` no canto — mantém.

Resultado por card:
```
GRANJA FARIA S.A.                 [Ativo] ⋮
RECRIA · UBERABA/MG · GRUPO X

CNPJ  35.236.156/0001-50

Tipo:    PJ
Prazo:   28 dias
Contato: 📞 (35) 3363-9301
         ✉ nfe@granjafaria.com.br

[ 📞  💬  ✉  ]                       [ Ver ]
```

Para cadastro incompleto, o "Sem contato" clicável já existe e vira filtro.

### 4. FAB "Novo cliente" x FAB global "Atalhos" (alta) — empilhar sem colidir

Hoje ambos ficam fixos à direita: `MobileQuickAddFAB` em `bottom: 5.25rem` e `MobileQuickActions` ("Atalhos") em `bottom: ~5.8rem` — visualmente sobrepostos.

- Aumentar o `bottomOffset` default do `MobileQuickAddFAB` para ficar **acima** do FAB de Atalhos (ex.: `9.25rem` com `safe-area-inset-bottom`), mantendo a prop sobreponível.
- Reduzir levemente o tamanho/sombra do FAB para dar respiro (manter touch target ≥ 44px). 

Não removemos o FAB de Atalhos (global); só evitamos a colisão nesta tela e em todas as outras que usam `MobileQuickAddFAB`.

### 5. Respiro no rodapé (média)

- Adicionar padding-bottom extra ao container da lista no mobile (ex.: `pb-32 md:pb-0`) para que o último card não fique embaixo do FAB + paginação + bottom nav.

### 6. Microcopy (baixa)

- Chip do filtro "Cadastro" com texto curto já está bom; manter.
- Subline do card já concatena `fantasia · cidade/uf · grupo` — mantém.

---

### Detalhes técnicos

- `SummaryCard` já suporta `shortTitle` via `useIsMobile()` internamente; basta passar a prop.
- `DataTable` já expõe `mobileIdentifierKey`, `mobileStatusKey`, `mobileInlineActions`, `mobileLabeledDetails`. Adicionar `mobileLabeledDetails` em `Clientes.tsx`.
- Não introduzir novos componentes; reaproveitar `Badge`, `Tooltip`, `StatusBadge`, `MobileCardList`.
- Sem alterações em `useSupabaseCrud`, RPCs, RLS ou tipos de domínio.

### Critérios de aceite

- Em viewport ≤ 414px: 4 cards de resumo visíveis em 2x2 sem truncar título.
- Placeholder de busca não trunca.
- Cada card de cliente exibe: nome, subline, documento mascarado, tipo (PF/PJ), prazo, contato (ou "Sem contato"), status pill.
- FAB "Novo cliente" e FAB "Atalhos" não se sobrepõem; ambos clicáveis.
- Último card da lista tem respiro visível antes da paginação + bottom nav.
- Nenhuma regressão no desktop (cards permanecem em 4 colunas, placeholder completo, layout de tabela inalterado).
