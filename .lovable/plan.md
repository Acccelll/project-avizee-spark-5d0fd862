
# Onda 18 — Tela de edição/cadastro de Produtos

Foco em UI/UX do `ProdutoForm` dentro do `ProdutoFormModal`. Sem mudanças de regra de negócio, schema ou serviços.

Arquivos: `src/pages/produtos/ProdutoForm.tsx`, `src/pages/produtos/ProdutoFormModal.tsx`.

## 1. Cabeçalho — nome do produto + status sem duplicidade (alta)

`ProdutoForm.tsx` linhas 425–473.

- `headerTitle` em modo `edit`: passa a mostrar o **nome do produto** + código.
  - Linha 1: `Editar Produto`
  - Linha 2 (subtítulo): `<NOME> · <codigo_interno>` (mono no código). O `headerSubtitle` mantém "Atualizado em …" como terceira linha menor.
- `headerBadge` em modo `edit`: **remover** o `StatusBadge` (já há toggle nas ações). Em `create`, badge segue inexistente.
- Manter o toggle Ativo/Inativo nas `headerActions` como controle único de status.

## 2. Modal com altura mínima estável (alta)

`ProdutoFormModal.tsx` linha 43.

- `sm:max-h-[92dvh]` → adicionar `sm:min-h-[80dvh]` para evitar "pulo" ao trocar de aba com pouco conteúdo. Em mobile permanece full-screen.
- `ProdutoForm.tsx`: dentro de `Tabs`, envolver os `TabsContent` em `<div className="min-h-[420px]">` para garantir piso vertical visual.

## 3. Tabs/footer fixos (média, dentro do modal)

- Mover a `TabsList` para `sticky top-0 z-10 bg-background` dentro do modal.
- Footer Salvar permanece como `headerActions` (já visível no topo). Em mobile, considerar duplicar o `Salvar` num footer sticky inferior — **fora de escopo** por já existir no header.

## 4. Identificação — clarificar SKU vs Código interno (alta)

Linhas 497, 528.

- Trocar label "SKU (referência externa)" → **"SKU comercial"** com hint inline `Código de venda do produto`.
- Manter "Código Interno (ERP)" mas hint mais curto: `Sequencial — gerado automaticamente`.
- Tooltip do botão Wand2: trocar `title` para `Gerar SKU automaticamente pela sigla do grupo`. Quando desabilitado por falta de sigla, manter já-existente texto "Defina uma sigla no grupo…" (linha 524).

## 5. Reorganizar bloco "Simples/Composto" + Classificação (média)

Linhas 587–619.

- Mover **Classificação (Produto/Insumo)** para o grid de Identificação (junto a Grupo/Unidade), como `Select` em coluna própria. Ajustar `md:grid-cols-3` para acomodar (ex.: nova linha ou `md:grid-cols-4` no segundo bloco).
- Manter o bloco "Simples / Composto" mas reescrever o título e a explicação:

```text
Tipo de composição
[Simples] [toggle] [Composto]

Custo informado manualmente.        ← quando Simples
Custo calculado pelos componentes.  ← quando Composto
```

  - Mostrar somente a frase referente ao modo ativo (não as duas).
  - Título "Tipo de composição" com `Label` + `text-xs text-muted-foreground` para contexto.

## 6. Padronizar moeda nos inputs e displays (alta)

Inputs `Preço de Custo` (628), `Preço de Venda` (640), `Preço de Compra` (804) hoje são `<input type="number">` cru.

- Manter `type="number"` (preserva semântica/teclado), mas adicionar **prefixo "R$"** visual via wrapper `relative`:
  - `<div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span><Input className="pl-9 ..." ... /></div>`.
- Displays `Lucro Bruto` (645) e `Margem` (651): já usam `formatCurrency` e `%.toFixed(1)`. Trocar `toFixed(1)` por substituição manual `.replace(".", ",")` para virar `41,6%` (vírgula). Garantir consistência com `formatCurrency` (que já usa pt-BR).
- Display do `custoComposto` (634): já usa `formatCurrency` — ok.

## 7. Aba Estoque — mais contexto (média)

Linhas 678–697.

- Adicionar campos read-only quando em modo `edit` (dados vindos de `editingProduct`):
  - `Estoque atual` (read-only, mono)
  - `Estoque reservado` (se `editingProduct.estoque_reservado != null`)
  - `Estoque disponível` (calculado: atual − reservado)
  - `Controla estoque?` derivado (`Não` se atual=0 e mínimo=0, senão `Sim`) — apenas exibição.
- Reescrever microcopy do alerta (linha 686–688):

```text
Sem estoque mínimo definido.
Defina um estoque mínimo para que o sistema alerte quando o produto precisar de reposição.
```

- Em `create`, exibir apenas `Estoque mínimo` + `Peso unitário` (sem dados read-only).

## 8. Aba Fiscal — alerta de pendência + microcopy (média)

Linhas 700–741.

- No topo da aba Fiscal, quando `!fiscalCompleto`, renderizar bloco de alerta:

```text
[!] Cadastro fiscal incompleto
Preencha NCM, CST e CFOP padrão para evitar bloqueios em notas fiscais.
Faltam: NCM, CST, CFOP.
```

  - `border-warning/30 bg-warning/5`, ícone `AlertTriangle`.
  - Lista dinâmica dos faltantes (reusar lógica `[!ncm && "NCM", ...].filter(Boolean)`).
- Botão "Verificar" do NCM: trocar texto para **"Verificar NCM"** e tooltip `Consultar descrição na tabela TIPI`.

## 9. Aba Compras — empty state acionável (média)

Linhas 753–755.

- Substituir `<p>` simples por bloco com:
  - Ícone `ShoppingCart` discreto.
  - Título: "Nenhum fornecedor vinculado".
  - Texto: "Vincule fornecedores para registrar código do fornecedor, custo de compra, prazo e histórico de aquisição."
  - CTA primário: o próprio botão "+ Fornecedor" (já existe no header da aba) reforçado com botão secundário no centro do empty state que dispara `addFornecedor()`.

## 10. Aba Observações — separar comercial vs interna (baixa)

Linhas 873–879.

- Manter o campo `descricao` como **"Descrição comercial"** com hint: `Texto exibido em orçamentos, pedidos e catálogos.`
- **Não criar campo novo** (sem schema change). Adicionar bloco informativo discreto:

```text
Observação interna
Para anotações internas que não devem aparecer em documentos comerciais, use o campo Observação dentro de pedidos/orçamentos.
```

  Para evitar confusão futura, marcar como nota explicativa (sem novo input agora).

## Detalhes técnicos

- Sem alteração no schema do produto. Todos os novos campos da aba Estoque são read-only e usam `editingProduct.*`.
- Manter o comportamento atual de `useEditDirtyForm` e `submit`.
- Não alterar a ordem de tab (`dados-gerais`, `estoque`, `fiscal`, `compras`, `observacoes`).

## Fora de escopo

- Criar componente `MoneyInput` reutilizável (item 6 fica inline com prefixo "R$").
- Criar coluna `observacao_interna` no schema.
- Editar a aba Estoque para permitir movimentações (continua via aba Estoque do drawer + módulo dedicado).
- Persistência de aba ativa entre aberturas.
