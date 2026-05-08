
# Onda 17 — Drawer de Produtos: refino mobile

Foco exclusivo em UI/UX no mobile (≤ md). Sem mudanças de regra de negócio. Desktop mantém o comportamento atual.

## 1. Drawer full-screen no mobile (alta)

`src/components/views/RelationalDrawerStack.tsx`

- `SheetContent`:
  - `w-full sm:max-w-xl` → `w-screen h-[100dvh] sm:h-auto sm:max-w-xl rounded-none sm:rounded-l-lg`
  - Empilhamento (`translateX -8px`) só a partir de `sm`: aplicar inline style apenas quando `window.innerWidth >= 640` (ou via CSS responsivo). No mobile, todos os drawers ocupam tela cheia.
  - Sombra/borda lateral apenas `sm`+ (no mobile não há "espaço escuro ao redor").
- Padding do conteúdo: `px-4 sm:px-6 py-4` → `px-3 sm:px-6 pt-3 pb-24 sm:pb-4` (folga p/ o FAB Atalhos).

## 2. Header mais leve no mobile (média)

`src/components/ui/DrawerHeaderShell.tsx`

- Esconder breadcrumb e contador `1 de N` no mobile quando `total === 1`: classes `hidden sm:flex` na linha de breadcrumb. Quando `total > 1`, mantém apenas o counter compacto.
- Reduzir paddings no mobile: `pt-3 pb-2 px-4` → `pt-2 pb-1.5 px-3 sm:pt-3 sm:pb-2 sm:px-6`.
- Zona "ações do registro": `justify-end` → `justify-between sm:justify-end` para que `Editar` (esquerda) e `Excluir` (direita) usem toda a largura no mobile e não pareçam "soltos".

`src/components/views/ProdutoView.tsx` (slot `actions`)

- No mobile, exibir somente **Editar** como botão primário sólido (`flex-1`) + **menu kebab** (`MoreVertical`) com Excluir / Excluir definitivamente. No `sm`+ manter o layout atual (botões inline).
- Implementar via `hidden sm:inline-flex` / `sm:hidden` — sem novo componente.

## 3. KPIs reorganizados no mobile (média)

`ProdutoView.tsx` — grid de KPIs (linhas 266–288)

- `grid-cols-2 sm:grid-cols-5` mantém-se, mas:
  - Card "Estoque" recebe `col-span-2 sm:col-span-1` para ocupar largura total na 3ª linha do mobile.
  - Ordem: Venda, Custo, Lucro, Margem, Estoque (full-width).

## 4. Tabs horizontais scrolláveis (alta)

`ProdutoView.tsx` (linhas 290–309)

- Trocar `TabsList className="w-full grid grid-cols-7"` por:
  - Wrapper: `<div className="-mx-3 sm:mx-0 overflow-x-auto scrollbar-none">`
  - `TabsList`: `inline-flex w-max gap-1 px-3 sm:px-0 sm:w-full sm:grid sm:grid-cols-7`
  - Cada `TabsTrigger`: `text-xs px-3 py-1.5 sm:px-0.5 shrink-0 sm:shrink` (target ≥ 40px no mobile).
- Garantir que a aba ativa fica visível: ao mudar `activeTab`, scroll horizontal para o gatilho ativo (`scrollIntoView({ inline: "center", block: "nearest" })`). Implementar via `useEffect` lendo `[data-state=active]` dentro do wrapper.

## 5. Aba Compras / Espec. — empty states acionáveis (alta)

Já há CTA em "Vincular fornecedor" (compras) e em `PrecosEspeciaisTab` (Espec.). Refinar copy:

- Compras: subtítulo já é bom; apenas trocar título do `h4` superior para esconder no estado vazio (evitar duplicar contexto).
- Espec.: garantir que o estado vazio do `PrecosEspeciaisTab` traga texto explicativo: "Crie regras por cliente, grupo comercial ou período promocional." + exemplos curtos (3 bullets) + CTA "Adicionar regra". Verificar `PrecosEspeciaisTab.tsx` (já tocado em ondas anteriores) e ajustar somente o empty state se ainda estiver minimalista.

## 6. Aba Estoque — mais conteúdo (alta)

`ProdutoView.tsx` (linhas 566–650)

- Adicionar card compacto "Controla estoque?" (Sim/Não) baseado em `naoControlaEstoque`.
- Quando não houver `ultimaEntrada` nem `ultimaSaida`, exibir linha discreta "Sem movimentações registradas".
- Se `selected.estoque_minimo > 0` e `estoque_atual > 0`, mostrar barra de progresso simples (`atual / (mínimo * 2)`) abaixo dos cards principais para visualizar margem de segurança.

## 7. Aba Geral — campos vazios (baixa)

`FieldItem` (linha 827) — substituir default `emptyText = "—"` por `"Não informado"`. Verificar nenhum local ainda dependa do hífen literal.

## 8. Aba Vendas — leitura em 3 linhas (média)

`ProdutoView.tsx` (linhas 730–763)

- Refatorar item para 3 linhas em mobile:
  - Linha 1: Cliente (esquerda, truncate) · Total (direita, font-mono semibold).
  - Linha 2: NF nº · Data.
  - Linha 3: `qtd × valor unitário` (texto menor, muted).
- Em `sm:`+ pode permanecer no layout atual (2 linhas).
- Destacar "Margem Méd." em `text-destructive` quando negativa (já é, manter) e adicionar `font-bold`.

## 9. Badge "Contraste OK" (baixa)

`src/components/accessibility/ContrastDevTool.tsx`

- Já é gated por `import.meta.env.DEV`. Para evitar competir com o conteúdo no mobile:
  - Adicionar `hidden sm:block` no wrapper fixo, ou
  - Reduzir para um ponto pequeno (`w-2 h-2 rounded-full bg-success`) e expandir só ao hover/click.
- Escolher: `hidden sm:block` (mais simples; mantém ferramenta para auditoria desktop em dev).

## Arquivos afetados

```text
src/components/views/RelationalDrawerStack.tsx
src/components/ui/DrawerHeaderShell.tsx
src/components/views/ProdutoView.tsx
src/components/precos/PrecosEspeciaisTab.tsx        (apenas refino do empty state se necessário)
src/components/accessibility/ContrastDevTool.tsx
```

## Fora de escopo

- Mudar a estrutura de `RelationalDrawerStack` para `Drawer` (vaul) no mobile — manteremos `Sheet` apenas com `h-[100dvh]` para reduzir risco.
- Reordenação semântica das abas.
- Persistência de `activeTab` por produto.
