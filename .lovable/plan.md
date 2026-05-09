## Onda 25 — Grid de Fornecedores (densidade, leitura e ações)

Foco: refinar `src/pages/Fornecedores.tsx` (grid + cards do topo + toolbar) sem mexer no schema do banco nem no formulário. Aplica padrões já consolidados em Clientes/Produtos.

### 1) Cards do topo mais acionáveis

Hoje: `Total`, `Ativos`, `Inativos`. Como quase todos são ativos, o terceiro card é inútil.

Substituir por 4 cards (3 visíveis em md, 4 em lg):

- **Total de Fornecedores** (mantém)
- **Ativos** (mantém, success)
- **Sem contato** — `count(ativo=true AND coalesce(email,'')='' AND coalesce(telefone,'')='' AND coalesce(celular,'')='')` (variant warning, ícone `PhoneOff`)
- **Cadastro incompleto** — `count(ativo=true AND (cpf_cnpj IS NULL OR cidade IS NULL OR uf IS NULL))` (variant warning, ícone `AlertCircle`)

Implementação: 2 novos `useTableCount` com filtros `or(...)` server-side (já suportado pelo hook). Clique no card aplica o filtro correspondente (ver §6). `Inativos` migra para o filtro `Status` existente.

### 2) Máscara em CPF/CNPJ e telefone

Trocar a renderização das células — não persistir formatado.

- Coluna `cpf_cnpj`: usar `cpfCnpjMask(f.cpf_cnpj)` (`@/utils/masks`).
- Coluna `Contato`: aplicar `phoneMask(phone)` antes de exibir.

### 3) Coluna "Fornecedor" combinada (nome + cidade/UF)

Hoje a busca promete cidade mas a coluna não mostra. Reformatar `nome_razao_social` para incluir cidade/UF como subtítulo quando `nome_fantasia` for igual ou ausente:

```text
WALMUR COMÉRCIO LTDA
Caxias do Sul/RS
```

Quando houver `nome_fantasia` distinto: linha 2 vira `nome_fantasia · cidade/UF`. Remover a coluna `Cidade` separada (deixar só dentro da principal). Continua existindo no toggle de colunas para quem quiser destaque.

### 4) Coluna "Contato" — telefone e e-mail empilhados, com máscara

Manter a coluna combinada (Opção B do feedback), mas:

- Linha 1: ícone `Phone` + `phoneMask(celular || telefone)` (tabular-nums).
- Linha 2: ícone `Mail` + e-mail truncado.
- Quando ambos vazios: chip discreto `Sem contato` (badge `warning` outline) — substitui o `—`.

### 5) Coluna Status visível por padrão

Hoje `ativo` está com `hidden: true`. Tirar `hidden` para exibir `StatusBadge` Ativo/Inativo no fim da linha (alinha com Produtos).

### 6) Filtros novos: "Sem contato" e "Cadastro incompleto"

Adicionar um terceiro `MultiSelect` "Pendências" (multi) com:

- `sem_contato`
- `incompleto`

Esses filtros viram condições server-side via `or()` (estender `serverFilters` com um campo `customOr` aceito pelo `useSupabaseCrud`, ou aplicar via `filter` com operador novo `isnull`/`or`). Se o hook não suportar `or` hoje, encapsular numa pequena extensão local (sem alterar contrato global) — detalhar em §Técnico.

Cards do topo (§1) usam `setFilter({ pendencia: ["sem_contato"] })` ao clicar.

### 7) Coluna "Tipo" — clarificar

Manter exibição PF/PJ, mas:

- Renomear o label do header de "Tipo" para "Pessoa".
- Renomear o filtro `MultiSelect` de "Tipos" para "Pessoa (PF/PJ)" para evitar a leitura de "tipo de fornecedor".

A categorização "Produto/Serviço/Transportadora" exige campo novo no schema — fora do escopo desta onda; registrar como Onda futura no `plan.md`.

### 8) Toolbar mais compacta

A `AdvancedFilterBar` já é o padrão — apenas:

- Encurtar placeholder: `"Razão social, CNPJ, e-mail ou cidade"`.
- Padronizar larguras dos `MultiSelect` com `FILTER_W_SM` / `FILTER_W_MD` (`@/components/list/filterTokens`).
- Garantir que `count` use a unidade `"fornecedores"` no rótulo.

### 9) Ordenação default

Já está `nome_razao_social asc` em `useServerSort`. Validar com `data` real (o feedback viu Z→A — provavelmente devido a `serverSortable` ter sido alterado por clique do usuário; preferências persistidas em `useDataTablePrefs`). Adicionar reset opcional no `clearFilters` para reverter `sort` ao default.

### 10) Indicador inline de pendências por linha

Na coluna principal "Fornecedor", se faltar contato OU documento, exibir um pequeno chip `outline warning` ao lado do nome:

- `Sem contato`
- `Sem CNPJ`

Ícone `AlertCircle` 12px. Tooltip explicando qual campo falta.

---

### Arquivos a editar

- `src/pages/Fornecedores.tsx` — grid columns, cards, filtros, toolbar.
- (opcional) `src/hooks/useSupabaseCrud.ts` — adicionar suporte a `or` filters se necessário; preferir manter local primeiro com `supabase.from().or(...)` paralelo.

### Fora de escopo (registrar como Onda futura)

- Campo `tipo_fornecedor` (Produto/Serviço/Transportadora) — exige migração + UI no formulário.
- Coluna "Cadastro incompleto" baseada em score (depois que `tipo_fornecedor` existir).

### Testes / verificação

- Snapshots manuais: cards mostram contagens > 0 quando há fornecedores sem contato.
- Conferir máscaras com fornecedores reais (CPF 11 dígitos vs CNPJ 14).
- Filtro "Pendências" combinado com `Status` retorna a interseção esperada.
- Mobile: coluna principal continua legível (subtítulo cidade/UF não estoura).
