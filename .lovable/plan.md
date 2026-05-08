## Onda 16 — Grid de Produtos no mobile

Foco: refinar densidade e clareza do card mobile, eliminar redundâncias percebidas e melhorar paginação. Mudanças concentradas em `src/pages/Produtos.tsx`, `src/components/SummaryCard.tsx`, `src/components/AdvancedFilterBar.tsx`, `src/components/ui/MobileCardList.tsx` e `src/components/DataTable.tsx`.

### 1. FAB "+" vs botão "Novo Produto" (alta)
O "+" no canto inferior direito é o **`MobileQuickActions`** global (atalhos rápidos cross-módulo), não um duplicado de "Novo Produto" — mas a leitura do usuário é de duplicidade. Estratégia:
- Trocar o ícone do FAB global de `Plus` para `Zap` (raio) e adicionar uma **mini-label "Atalhos"** abaixo do ícone, para diferenciar visualmente do botão de criar.
- Manter "Novo Produto" no topo (canônico para cadastros).

### 2. SummaryCard "Abaixo do mín..." truncado (alta)
- Em `SummaryCard.tsx`, aceitar uma prop opcional `shortTitle` e usá-la quando `useIsMobile()` for true (sem mexer em desktop).
- Em `Produtos.tsx`, passar `shortTitle="Estoque crítico"` para o card de criticos. O `subtitle` ganha frase clara: `"itens no cadastro"` (ou "filtrando: X" quando ativo).
- Reduzir levemente o tamanho do `value` em modo `compact` no mobile para evitar reflow.

### 3. Card mobile do produto — remover SKU duplicado e melhorar hierarquia (alta)
Hoje o `MobileCardList` renderiza:
- linha 1: nome (primary)
- linha 2: identifier (codigo_interno) — vindo de `mobileIdentifierKey="sku"` mal mapeado
- linha 3: detail-fields (Estoque, P. Venda)

Ações em `Produtos.tsx`:
- Trocar `mobileIdentifierKey="sku"` por `mobileIdentifierKey="codigo_interno"` (a célula "Produto" já mostra `SKU · Interno · Var.` na linha 2, então o identifier separado vira redundância — preferimos remover o identifier no mobile).
- Adicionar nova prop em `DataTable`: `mobileHideIdentifier?: boolean` para suprimir a linha identifier quando o `mobilePrimary` já carrega esses metadados. Usar no Produtos.
- Ajustar render da coluna `nome` para incluir variação completa (não só a primeira) com truncate: `Var. 13 x 45` ou `Var. 13 x 45 +N` (já está, manter).

### 4. Variação visível no card (alta)
- Garantir que a variação aparece sempre na 2ª linha do card. Se `parseVariacoes(p.variacoes).length === 0`, omitir o segmento (sem `Var. —`). Já está parcialmente correto, validar.
- No card "Estoque" mobile, exibir um `Badge` neutro com a primeira variação quando houver — opcional, controlado por flag local para não poluir.

### 5. "0 CX" + "Não controla" ambíguo (alta)
Em `Produtos.tsx`, no `render` da coluna `estoque_atual`:
- Quando `situacao === "nao_controla"`: renderizar **apenas** o texto "Estoque: não controlado" (sem o número 0 e sem o sufixo da unidade). Mantém o badge cinza "Não controla".
- Demais situações continuam como hoje, mas com prefixo `"Estoque:"` no mobile (via flag `useIsMobile()` dentro do render ou simplesmente prepend sempre — manter desktop limpo via CSS `hidden sm:inline`).

### 6. Rótulos "Estoque" / "Venda" no card (média)
- Adicionar suporte em `MobileCardList` para um modo `labeledDetails` (default off). Quando ligado, cada `detailField` renderiza `<dt>label</dt><dd>value</dd>` em uma grid 2-col compacta — usado pelo `DataTable` com nova prop `mobileLabeledDetails: true`.
- Ativar em Produtos para mostrar `Estoque: 0 CX  ·  Venda: R$ 33,99  ·  Margem: 41,6%`.

### 7. Margem no mobile (média)
- Adicionar `mobileCard: true` na coluna `margem` em `Produtos.tsx`. Como já existem estados explícitos ("Sem custo" / "Sem preço"), o card mostra o valor sem ambiguidade.

### 8. Status no card — reposicionar (baixa)
- O `statusBadge` já é renderizado no canto superior direito via `mobileStatusKey="ativo"`. Reduzir o tamanho via classe `text-[10px] px-1.5 h-4` no render da coluna `ativo` para diminuir competição com o nome.

### 9. Placeholder de busca trunca (média)
- Em `Produtos.tsx`, passar dois placeholders: usar texto curto no mobile. Como `AdvancedFilterBar` não conhece viewport, simplificar para `"Nome, SKU ou código"` (cabe no mobile e desktop).

### 10. Indicador de filtros ativos (média)
- Já existe badge numérico no botão "Filtros" mobile e chips ativos abaixo da busca — validar que `prodActiveFilters` aparecem visíveis e que o botão "Limpar filtros" some quando não há ativos. Sem mudança de código necessária; documentar como já-OK.

### 11. Paginação mobile (média)
- O footer atual mostra `1–25 de 243` + botões `‹ ›` mas o FAB pode estar cobrindo. Em `DataTable.tsx`, adicionar `pb-20 md:pb-0` no container do footer mobile e/ou aumentar `padding-bottom` do wrapper de paginação para que os botões ‹ › fiquem acima do FAB.
- Adicionar opção `mobilePaginationStyle: "pager" | "loadMore"` (default `pager`). Quando `loadMore`, substituir os botões por um único `Carregar mais` em modo server-paged (acumulando `pageSize`). Não vamos ativar por padrão; documentar.

### Arquivos editados
- `src/pages/Produtos.tsx` — props no SummaryCard, render da coluna estoque com regra `nao_controla`, `mobileCard` em margem, placeholder curto, `mobileIdentifierKey`, `mobileHideIdentifier`, `mobileLabeledDetails`.
- `src/components/SummaryCard.tsx` — prop `shortTitle`.
- `src/components/ui/MobileCardList.tsx` — modo `labeledDetails` e suporte a `hideIdentifier`.
- `src/components/DataTable.tsx` — props `mobileHideIdentifier`, `mobileLabeledDetails`; padding-bottom do footer mobile.
- `src/components/navigation/MobileQuickActions.tsx` — trocar ícone do FAB para `Zap` + label discreta "Atalhos".

### Fora do escopo
- "Mostrar mais" como default da paginação mobile (apenas tornar opt-in).
- Skeleton específico mobile.
- Alterações no `AdvancedFilterBar` (chips e contador já cobrem o ponto 11).
