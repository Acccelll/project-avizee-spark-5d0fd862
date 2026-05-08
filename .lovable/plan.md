
# Onda 19 — Cadastro/Edição de Produtos no mobile

Foco: transformar `ProdutoForm` + `ProdutoFormModal` em uma experiência verdadeiramente mobile-first, mantendo desktop intacto. Nenhuma mudança em schema, services, validação ou ordem de abas.

## Arquivos alterados
- `src/pages/produtos/ProdutoForm.tsx`
- `src/pages/produtos/ProdutoFormModal.tsx`

Reuso do helper `TabsListScrollable` já existente em `src/components/views/ProdutoView.tsx` — vamos extraí-lo para `src/components/ui/TabsListScrollable.tsx` e importar nos dois lugares (sem alterar comportamento).

## 1. Header mobile reestruturado (alta)

Hoje o cabeçalho embedded empilha tudo (`flex-wrap`) em uma linha, com `headerTitle`, toggle, "Ver resumo", "Salvar e novo" e "Salvar" disputando espaço.

No mobile (`max-sm`) o header passa a ter 2 linhas:

```text
Linha 1: [Editar Produto / Novo Produto]                         [✕ fechar]
         AGULHA DESCARTAVEL · PRD000044
Linha 2: [toggle Ativo]                                          [Salvar]
```

- Botão "✕ fechar" novo no mobile (chama `handleBack`); ícone `X` de `lucide-react`.
- "Ver resumo" e "Salvar e novo" são movidos para um menu kebab (`MoreVertical` + `DropdownMenu`) só no mobile. No `sm+` continuam visíveis como botões inline (comportamento atual preservado).
- "Atualizado em …" (subtitle) some no mobile (`hidden sm:block`) — informação fica disponível via "Ver resumo".
- Remover o badge de status (já estava `undefined`) — confirmar que nenhum bloco lateral re-renderiza Ativo. Status fica representado **apenas** por `toggle + label` ("Ativo"/"Inativo").

## 2. Modal full-screen mais nativo (alta)

`ProdutoFormModal.DialogContent` já é full-screen em `max-sm`. Ajustes:
- Trocar `px-6 py-4` por `px-4 py-3 sm:px-6 sm:py-4` no wrapper interno (mais espaço útil).
- Adicionar `pb-[calc(env(safe-area-inset-bottom)+72px)]` no scroll do form para não esconder conteúdo atrás do **footer sticky** (item 5).

## 3. Abas mobile com `TabsListScrollable` (alta)

Substituir o atual `<TabsList className="mb-4 w-full justify-start overflow-x-auto sticky top-0 …">` por um wrapper compartilhado:

- Extrair `TabsListScrollable` de `ProdutoView.tsx` para `src/components/ui/TabsListScrollable.tsx` (mesma assinatura). Atualizar `ProdutoView.tsx` para importar do novo local.
- Em `ProdutoForm.tsx`, envolver os 5 `TabsTrigger` com `<TabsListScrollable cols={5}>` — adicionar prop `cols` opcional para `sm:grid-cols-{cols}` (default 7 para preservar `ProdutoView`).
- Cada `TabsTrigger` recebe no mobile: `px-4 h-10 text-sm` (alvo de toque ≥ 40px). Ícones permanecem.
- Wrapper `sticky top-0 z-10 bg-background` é mantido. `scrollbar-none` esconde a barra "técnica".

## 4. Aba Dados Gerais em coluna única no mobile (alta)

Trocar todos os `grid grid-cols-1 md:grid-cols-3` / `md:grid-cols-4` para fluxo vertical no mobile. Ordem final no mobile:

1. Nome
2. SKU comercial (input + botão Wand2 ao lado, mesmo `flex gap-1.5`)
3. Código Interno (ERP) — readonly
4. Grupo de Produto (input + botão Pencil)
5. Unidade de Medida (input + botão +)
6. Classificação (Produto/Insumo)
7. Bloco "Tipo de composição" (Simples/Composto) — sem mudança estrutural
8. Comercial: Preço de Custo, Preço de Venda, Lucro Bruto, Margem — em coluna única no mobile, `sm:grid-cols-2`, `lg:grid-cols-4` (lucro/margem podem ficar lado a lado em `sm:grid-cols-2` para aproveitar espaço)
9. Variações Comerciais

Mudanças concretas:
- `grid grid-cols-1 md:grid-cols-3 gap-4` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4`
- Bloco "Comercial": `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4`
- Remover `col-span-2` do Nome no mobile (vira full width naturalmente); manter `sm:col-span-2 lg:col-span-2` em telas maiores.
- Helper texts auxiliares (SKU, sigla ausente, variações): no mobile encurtar via `sm:hidden` versão curta + `hidden sm:block` versão longa **OU** simplesmente reduzir para uma frase. Preferimos reduzir o texto:
  - SKU sigla ausente → "Defina sigla no grupo para gerar SKU automático."
  - Variações → "Separe por vírgula. Ex: Azul, Vermelho, P, M, G."

## 5. Aba Fiscal em coluna única (alta)

- Atual `grid grid-cols-3 gap-4` → `grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4`.
- Bloco NCM: no mobile o botão "Verificar NCM" vira **botão de largura total abaixo do input** (`flex-col sm:flex-row`). Texto fica "Verificar NCM" sempre.
- Helpers de CST/CFOP/NCM ficam mais curtos:
  - CST: "Situação tributária do ICMS."
  - CFOP: "Código fiscal de operações."
  - NCM: "4–8 dígitos (tabela TIPI)."
- Aviso "Cadastro fiscal incompleto" (já existe) preservado.

## 6. Aba Estoque (média)

- Grid de KPIs: `grid grid-cols-2 md:grid-cols-4 gap-3` mantido (já mobile-friendly).
- "Estoque Mínimo" + "Peso Unitário" em `grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4` (coluna única no mobile).
- Aviso laranja (sem mínimo) ganha visual de bloco: envolver em `rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-2` (mesmo padrão do aviso fiscal).

## 7. Aba Compras (média)

- Empty state já reestruturado em Onda 18 — apenas mobile polish: `p-4 sm:p-6`, ícone `h-7 w-7 sm:h-6 sm:w-6`.
- Cada card de fornecedor: o cabeçalho `flex items-end gap-3` quebra mal no mobile. Trocar para `flex flex-col sm:flex-row sm:items-end gap-3`. Toggle "Principal" e botão remover ficam em uma linha separada no mobile.
- `grid grid-cols-1 md:grid-cols-3 gap-3` → `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3`.
- Bloco de composição: `grid-cols-[1fr_100px_80px_40px]` → mobile vira `grid-cols-[1fr_72px_40px]` ocultando "Custo" (`hidden sm:block`) e mostrando-o em uma linha auxiliar abaixo (`sm:hidden text-[11px] text-muted-foreground`).

## 8. Aba Observações (baixa)

- Aumentar `rows={4}` → `rows={5}` no mobile (`className="min-h-[140px]"`).
- Sem mudança de campos.

## 9. Footer sticky com Salvar/Cancelar (alta)

Novo bloco renderizado **somente** no modo `embedded` e **somente no mobile**:

```tsx
<div className="sm:hidden sticky bottom-0 z-20 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-t flex gap-2 pb-[calc(env(safe-area-inset-bottom)+12px)]">
  <Button type="button" variant="outline" className="flex-1" onClick={handleBack}>Cancelar</Button>
  <Button type="submit" form="produto-form" className="flex-1 gap-2" disabled={saving}>
    <Save className="h-4 w-4" />
    {saving ? "Salvando..." : "Salvar"}
  </Button>
</div>
```

- Posicionado dentro do scroll container do embedded layout, depois do `formBody`.
- Resolve a disputa visual no topo: "Salvar" no header pode então ficar `hidden max-sm:hidden sm:inline-flex` (continua aparecendo no `sm+`).
- O botão "✕ fechar" no header continua disponível para fechar rapidamente sem rolar.

## 10. Ajustes de hierarquia/microcopy (baixa)

- `headerTitle` no mobile: nome em `text-base font-semibold`, código em linha abaixo `text-[11px] text-muted-foreground font-mono`.
- "Tipo de composição" — label `text-[11px] uppercase tracking-wider text-muted-foreground` para diferenciar das demais.
- Padronizar `gap-3` no mobile e `gap-4` em `sm+` em todos os grids do form.

## Fora do escopo

- Persistência da aba ativa.
- Componente `MoneyInput` reutilizável.
- Mudança no campo `observacao_interna`.
- Refator da estrutura de `ProdutoView` (já tratado em Ondas anteriores).
- Qualquer alteração em desktop além das adições responsivas (`sm:`/`lg:`).

## Riscos

- Extração de `TabsListScrollable` precisa preservar exatamente o comportamento atual no `ProdutoView` (auto-scroll para aba ativa). Manter o mesmo `MutationObserver`.
- Footer sticky precisa garantir que o `submit` continue funcionando (já é `type="submit" form="produto-form"`).
- `pb-…` extra no scroll evita que o footer cubra o último campo.
