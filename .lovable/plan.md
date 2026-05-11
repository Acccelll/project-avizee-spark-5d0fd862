## Escopo

Tela `src/pages/Estoque.tsx` + helpers `src/components/estoque/estoqueMovimentacaoConfig.ts`. Apenas ajustes de UI/UX, microcopy, semântica de status e uma confirmação extra. Sem mudanças em RLS, RPC, schema ou regras de negócio (a RPC `ajustar_estoque_manual` continua sendo a única via de gravação).

---

## Alta prioridade

### 1. Corrigir "--3" na coluna Qtd (Movimentações)
Em `Estoque.tsx` linha 390 a render concatena sinal manual (`neg ? "-" : "+"`) com `formatNumber(m.quantidade)`. Se `quantidade` já vem negativo do banco (ex.: saídas históricas), aparece `--3`.

Usar valor absoluto: `{neg ? "−" : "+"}{formatNumber(Math.abs(m.quantidade))}` (com sinal Unicode minus para clareza visual, mantendo classe de cor já aplicada).

### 2. Reclassificar "Itens Críticos" e separar "Sem mínimo"
- Em `kpis` (linha 158-170), separar:
  - `abaixoMinimo` = produtos com `estoque_minimo > 0` e `atual ≤ minimo` e `atual > 0`
  - `zerados` = `atual ≤ 0`
  - `semMinimo` = ativos com `estoque_minimo = 0` (informativo, não crítico)
- Substituir card "Itens Críticos" por **dois cards menores** lado a lado dentro do mesmo slot, ou trocar o card por **"Abaixo do mínimo"** + adicionar `variation` "+ N zerados" no próprio card. Manter 4 cards no topo (sem quebrar grid `summaryCards`).
- Ao clicar, filtra `situacaoFilters` apenas por `["critico"]` (e variante separada para `["zerado"]`).

### 3. Mínimo "—" → "Sem mínimo"
Coluna `estoque_minimo` (linha 409): trocar `"—"` por badge `<span className="text-[11px] text-muted-foreground italic">Sem mínimo</span>` quando `estoque_minimo === 0`.

### 4. Nova situação "Sem mínimo definido"
Em `getSituacao` (linha 62), adicionar tipo `sem_minimo`:
- Se `atual > 0` e `minimo === 0` → `sem_minimo` (badge neutro/info, não verde "Normal").
- `normal` agora exige `minimo > 0` e `atual > minimo * 1.2`.

Atualizar `situacaoConfig` e `situacaoOptions` com a nova entrada (label "Sem mínimo", ícone `Info`, classe `bg-muted/40 text-muted-foreground`).

### 5. Confirmação obrigatória antes de "Registrar Ajuste"
Já existe `ConfirmDialog` para movimentações (linha 953), porém o `description` é só uma string. Enriquecer com bloco estruturado quando `tipo === "ajuste"`:

```text
Produto: <nome>
Saldo atual: <atual> <UN>
Novo saldo:  <novo>  <UN>
Diferença:   <±delta> <UN>
Categoria:   <categoria_ajuste>
Justificativa: <motivo ou "—">
```

Renderizar via JSX dentro de `description` (ConfirmDialog já aceita ReactNode) ou refatorar para componente próprio. Confirmar diferença em destaque.

### 6. Tooltips de Estoque Atual vs. Disponível
Na coluna "Disponível" e "Estoque Atual" (linhas 406, 408), adicionar `<Tooltip>` no header (via prop `headerTooltip` se DataTable suportar, caso contrário envolver o label no render):
- Estoque Atual: "Saldo físico/sistêmico do produto."
- Disponível: "Saldo livre = Estoque atual − Reservado. Reservas vêm de pedidos de venda em separação."

Verificar se `DataTable` aceita header customizado; se não, criar wrapper `<th>`-friendly com `Tooltip` no `label` JSX.

### 7. Tooltip no card "Valor em Estoque"
SummaryCard "Valor em Estoque" (linha 447): adicionar tooltip no ícone com texto:
"Calculado por Σ(estoque_atual × preço_custo) dos produtos ativos. Quando o produto não tem custo cadastrado, usa-se o preço de venda como fallback."

---

## Média prioridade

### 8. Origem "Sem origem" → "Saldo inicial"
Em `getOrigemConfig` (`estoqueMovimentacaoConfig.ts` linha 48): quando `documento_tipo` é null **e** o motivo começa com "Saldo inicial" (heurística), retornar `{ label: "Saldo inicial", className: "bg-info/10 text-info border-info/30" }`. 

Alternativa mais limpa: aceitar segundo parâmetro opcional `motivo?: string | null` em `getOrigemConfig`, usar em `Estoque.tsx` (linha 394). Manter fallback "Sem origem" quando motivo não casa.

### 9. Filtro de origem na aba Movimentações
Adicionar `MultiSelect` "Origem" (`origemFilters`) ao lado do filtro de Tipo, com opções derivadas das chaves de `origemConfig` + "saldo_inicial" + "sem_origem". Aplicar no `filteredData.filter`.

### 10. Diferença calculada e saldo atual mais visíveis no Ajuste Manual
Já existe o card "Impacto no saldo" (linhas 810-848) com saldo atual, novo saldo e delta. Acrescentar:
- Linha "Diferença" explícita em destaque (chip colorido), não apenas como sufixo da unidade.
- Quando `produtoSelecionado` mudar, popular o histórico lateral também com **última movimentação geral** (não só ajustes), saldo atual em destaque, último ajuste e responsável (`usuario_id`, fallback "—" se não disponível).

### 11. Cards de KPI clicáveis como filtros rápidos
- "Itens em Estoque" → tab Saldos, sem filtro
- "Abaixo do mínimo" → `situacaoFilters=["critico"]`
- "Sem mínimo" (novo) → `situacaoFilters=["sem_minimo"]`
- "Ajustes Manuais" → tab Movimentações, `tipoFilters=["ajuste"]`
Reaproveitar prop `onClick` do `SummaryCard` (já usada em "Itens Críticos").

### 12. Coluna "Responsável" nas Movimentações
Adicionar coluna oculta por padrão (`hidden: true`) em `movColumns`, exibindo `usuario_id` (mostrar email/nome se houver join disponível em `select`; caso contrário, mostrar UUID truncado com tooltip). Mais detalhamento real fica para futuro (requer ampliar `select`).

---

## Baixa prioridade

### 13. Rename de aba
"Ajuste Manual" → "Ajustes" no `TabsTrigger` (linha 519). Mantém rota interna `value="ajuste"` para não quebrar deep-link.

### 14. Microcopy do alerta superior
Quando há produtos abaixo do mínimo, o card já é claro. Refinar a frase para "N produto(s) precisam de reposição" e manter botão "Ajustar".

### 15. Coluna opcional "Custo total" em Saldos
Já existe `valor_estoque` (linha 411) como hidden. Renomear label para "Custo total (saldo × custo)" para deixar critério explícito.

---

## Detalhes técnicos

- **Arquivo único de edição principal**: `src/pages/Estoque.tsx`.
- **Helper alterado**: `src/components/estoque/estoqueMovimentacaoConfig.ts` (assinatura de `getOrigemConfig`).
- Imports adicionais: `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger` de `@/components/ui/tooltip` (já presente em outras telas).
- Não tocar no hook `useAjustarEstoque` nem na RPC.
- Não tocar em `EstoqueAjusteSheet` (ajuste rápido mobile) — fora de escopo.

## O que NÃO está incluído

- Implementar reservas reais (já há coluna; depende de fluxos comercial/venda).
- Trocar `useSupabaseCrud` por server-side pagination em movimentações.
- Adicionar nome do responsável via JOIN com `auth.users`/profiles (apenas exibir UUID; ampliação real fica para próxima iteração).
- Mudar categorias de ajuste (já cobrem os principais cenários: correção, perda, avaria, vencimento, furto, divergência, outro).
