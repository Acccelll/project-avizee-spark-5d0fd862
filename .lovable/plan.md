
# Onda 42o — Edição de Orçamento (mobile)

Escopo: somente UI/presentational. Sem mudanças em schema, RPC, services ou cálculos. Arquivos:
- `src/pages/OrcamentoForm.tsx`
- `src/components/Orcamento/OrcamentoItemsGrid.tsx`
- `src/components/Orcamento/OrcamentoTotaisCard.tsx`
- `src/components/Orcamento/OrcamentoCondicoesCard.tsx`
- `src/components/Orcamento/OrcamentoInternalAnalysisPanel.tsx`
- `src/components/Orcamento/FreteSimuladorCard.tsx`

A doutrina mobile (cards com `status-pill`, `primaryAction`, footer sticky, accordions em ≥4 grupos) já está formalizada em `mem://produto/comercial-mobile` e `mem://produto/configuracoes-mobile` — esta onda aplica essas regras à tela de edição.

## Alta prioridade

### 1. Cabeçalho mobile compacto (sem truncamento)
`OrcamentoForm.tsx` linha 985: o `title` envia `Editando Orçamento — ORC100277`, que estoura no `PageShell` mobile.
- Em mobile (`isMobile`), passar `title="Editar Orçamento"` (ou `"Novo Orçamento"`) e `subtitle={numero ? \`${numero} · ${labelStatus(status)}\` : "Revisão e ajuste da proposta comercial"}`.
- Em desktop manter o título atual.
- Helper local `labelStatus` (já temos `StatusBadge` para o card-resumo logo abaixo, então o subtítulo só precisa do label textual).

### 2. Card-resumo mobile mais escaneável
`OrcamentoForm.tsx` linhas 1128–1153 (bloco `isMobile`).
- Reorganizar para layout "headline + meta-line", removendo a grade 2×2:
  ```
  ORC100277                           [StatusBadge]
  NUTRIZA AGROINDUSTRIAL... (truncado 1 linha)
  R$ 3.755,28 · 3 itens · 6,00 kg
  Válido até 12/05/2026
  ```
- `numero` em `font-mono` no topo-esquerda, `StatusBadge` à direita.
- Linha cliente com `truncate` e `title={nome}`.
- Linha meta única: total + itens + peso (`formatWeightKg`).
- Rodapé só com `validade` quando existir.

### 3. Identificação: stepper já melhorado, garantir respiração
O `StatusStepper` (linhas 133–169) já é compacto. Em mobile a grade `grid-cols-2` (linha 1190) deixa o stepper colado nos selects.
- No `<div>` que contém `<StatusStepper />` (linha 1233), envolver em `mt-1 flex flex-wrap gap-x-1 gap-y-1` para permitir quebra de linha em telas estreitas.
- Em mobile, esconder o separador `›` entre etapas via `sm:inline hidden` no `<span>` da linha 163 — só pontos e labels.

### 4. Seção Cliente: simplificar busca em mobile
`OrcamentoForm.tsx` linhas 1244–1306. Hoje há 4 controles lado a lado (`AutocompleteSearch`, ícone check, `ClientSelector`, botão `+`).
- O `AutocompleteSearch` já tem `onCreateNew` (linha 1257), então o botão `+` extra é redundante.
- Em mobile (`md:hidden` para os controles auxiliares; manter ambos em desktop):
  - Ocultar o botão `<Plus>` da linha 1270–1272 (mantém a opção via `onCreateNew` do autocomplete).
  - Ocultar o `ClientSelector` de "Ver lista completa" (linhas 1261–1269); em mobile o autocomplete cobre o caso.
  - O check de sucesso (linha 1260) vira ícone dentro do próprio campo (manter como está, é discreto).
- Mover o `Código do cliente` (linha 1275) para **dentro** do bloco de detalhes do cliente (linhas 1278–1286) como mais um card, em vez de campo no topo. Em mobile fica abaixo de "Cidade/UF".
- No bloco de endereço (1287–1305), agrupar em layout vertical no mobile (`grid-cols-1 md:grid-cols-4`).

### 5. Itens do orçamento: ações secundárias em menu (mobile)
`OrcamentoItemsGrid.tsx` — atualmente linhas com 3 ícones expostos (`Info`, `Copy`, `Trash2`). Sem refator estrutural:
- Em mobile (`md:hidden` para os botões `Info` e `Copy`; mantém `Trash2` visível).
- Adicionar (mobile only, `md:hidden`) um `DropdownMenu` com itens "Ver detalhes" e "Duplicar item" no lugar dos dois ícones ocultos. Trigger: botão ghost com `MoreHorizontal`.
- Em desktop nada muda.
- Subtotal já é "Subtotal dos itens" (Onda 42n). Em mobile, aumentar destaque com `text-base font-semibold text-foreground` na linha do subtotal.

### 6. Botão "Importar texto" com label clara
`OrcamentoItemsGrid.tsx` (toolbar superior — onde estão `Plus`/`Upload`/`Maximize2`).
- No mobile, o botão `Upload` aparece só com ícone. Adicionar label "Importar" via `<span className="hidden xs:inline">` ou simplesmente sempre exibir `Importar` em mobile (esconder `Maximize2` em mobile, que não faz sentido).
- Verificar: tooltips/`aria-label` já presentes; padronizar texto para "Importar texto".

### 7. Frete aplicado: chip visível e CTA explícito
- O chip "Aplicado: ..." em `OrcamentoTotaisCard` (linhas 61–70) já existe mas está dentro do campo Frete e fica pouco visível em mobile.
- Promover o chip para **acima** da grade de totais quando `freteSimulacaoId` existe:
  ```
  ┌──────────────────────────────────────┐
  │ Frete aplicado ao orçamento           │
  │ SEDEX · R$ 156,48 · 13 dias úteis     │
  │                          [Limpar]     │
  └──────────────────────────────────────┘
  ```
- Manter chip discreto inline também (compatibilidade), mas no mobile destacar acima.
- No `FreteSimuladorCard`, no header (`CardHeader`), adicionar uma linha `Frete atual aplicado: {servico} — {formatCurrency(valor)}` quando `simulacaoId` está definido, para reforçar a ligação simulação ↔ orçamento. Sem alterar lógica.

### 8. Footer sticky mobile mais leve
`OrcamentoForm.tsx` linhas 1864–1900. Atualmente 2 linhas (resumo + 3 botões), `pb-2.5 pt-2.5`, posicionado acima do `MobileBottomNav` (~64px).
- Compactar para 1 linha:
  ```
  R$ 3.755,28 · 3 itens   [Salvar][Eye][PDF]
  ```
- Reduzir `pt-2.5 pb-2.5` para `py-2`, e botões de `h-11` para `h-10`.
- Esconder o peso (`pesoTotal`) — já visível no card-resumo no topo e no Totais.
- Manter `Salvar` como CTA largo (`flex-1`), `Eye` e `PDF` como `size="icon"` `h-10 w-10`.
- Garantir `pb-40 lg:pb-0` no container (já existe linha 1185); reduzir para `pb-32` após compactação.

## Média prioridade

### 9. Análise Interna recolhida por padrão
`OrcamentoInternalAnalysisPanel.tsx`. Sem refator pesado:
- Envolver o conteúdo principal em `<Collapsible>` (`@/components/ui/collapsible` já usado em outros pontos), com header mostrando "Análise interna · {N} alerta(s)" e estado padrão `defaultOpen={false}` em mobile, `true` em desktop.
- Persistir via `useUserPreference("orcamento_form_analise_interna_aberta")` — opcional; primeira versão sem persistência.

### 10. Totais e Ajustes: hierarquia em mobile
`OrcamentoTotaisCard.tsx`.
- Em mobile manter `grid-cols-2` para campos pequenos (Desconto, Imposto ST, IPI, Outras Despesas).
- Promover `Total Produtos`, `Frete` e `Peso total` para linhas full-width (`col-span-2`) com layout `label esquerda · valor direita` mais "extrato financeiro".
- `Total Final` (linhas 111–113) em mobile vira faixa full-width destacada (`bg-primary/5 rounded-lg p-3 mt-3`).

### 11. Condições Comerciais: separar calculado × editável
`OrcamentoCondicoesCard.tsx`.
- Adicionar pequenos sub-headers:
  - `Resumo calculado` (gray, uppercase tracking) → `Quantidade Total`, `Peso total` (já readOnly visualmente).
  - `Condições editáveis` (gray, uppercase tracking) → demais campos.
- Implementação: dois sub-blocos `<div>` dentro do mesmo card. Sem mudar a interface `Props`.

## Baixa prioridade

### 12. Microcopy & polimentos
- Botão `Visualizar` no menu mobile (linha 1004): mudar para `Visualizar proposta`.
- `Gerar PDF` no menu mobile (linha 1007): manter.
- Menu mobile "Mais": agrupar por seções com `DropdownMenuLabel`:
  - Seção "Visualização": Visualizar proposta, Gerar PDF.
  - Seção "Templates": (já existe).
  - Seção "Edição": Salvar como meu template, Duplicar, Reenviar e-mail.
- Espaçamento entre cards mobile: `gap-5` → `gap-3` quando `isMobile` (densidade levemente maior).

## Fora de escopo
- Mover ações destrutivas (Cancelar/Excluir) para o menu — essas ações **não estão** atualmente no header do form (já vivem no `OrcamentoView`/drawer, tratadas na Onda 42m). Só listadas no relatório por confusão visual; nada a fazer aqui.
- Persistir preferência de seções colapsadas em servidor.
- Refator estrutural de `OrcamentoItemsGrid` para linhas expansíveis com sheet.
- Mudanças em cálculo de totais, peso ou frete.
- `MobileBottomNav` (fora do escopo do form).

## Validação
- `tsc` limpo, ESLint sem novos warnings.
- QA visual em 375px e 1552px:
  - Título mobile: `Editar Orçamento` + subtítulo `ORC100277 · Rascunho`, sem truncar.
  - Card-resumo mobile em 4 linhas escaneáveis.
  - Stepper de status quebra linha sem sobrepor selects.
  - Seção Cliente mobile com 1 input + autocomplete, sem botões `+` e "Ver lista".
  - Lista de itens mobile mostra apenas `Trash2` + menu `MoreHorizontal`.
  - Chip "Frete aplicado ao orçamento" aparece destacado em mobile quando há cotação.
  - Footer sticky mobile com 1 linha; nenhum campo escondido atrás dele (testar último Textarea de Observações Internas).
  - Análise Interna inicia colapsada em mobile.
  - Totais e Ajustes mobile: pequenos campos em 2 colunas; Total Produtos/Frete/Peso/Total Final full-width.
  - Condições Comerciais com headers "Resumo calculado" e "Condições editáveis".
