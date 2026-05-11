# Onda 42n — Edição de Orçamento (`OrcamentoForm`)

Escopo: `src/pages/OrcamentoForm.tsx`, `src/components/Orcamento/OrcamentoSidebarSummary.tsx`, `OrcamentoItemsGrid.tsx`, `OrcamentoCondicoesCard.tsx`, `OrcamentoTotaisCard.tsx`, `OrcamentoInternalAnalysisPanel.tsx`, `FreteSimuladorCard.tsx`. Sem mudanças de schema, RPC ou serviços. Reusa `formatWeightKg` (criado na Onda 42m).

## Alta prioridade

### 1. Deduplicar ações (topo × lateral)
- **Topo (desktop)** continua como CTA primário do header: `Salvar`, `Visualizar`, `Gerar PDF`, `Templates`, kebab "Mais ações" (Duplicar, Reenviar e-mail).
- **Sidebar (`OrcamentoSidebarSummary`)**: remover os 3 botões inferiores (`Salvar Rascunho` / `Visualizar` / `PDF`). Sidebar passa a ser **somente resumo** (KPIs + total).
  - Remover props `onSave`, `onPreview`, `onGeneratePdf`, `saving`, `isEdit`, `status`, `numero`, `clienteNome` da interface (mantém o que é exibido).
  - Atualizar chamada em `OrcamentoForm.tsx` (linhas 1349–1356) removendo handlers.
- Mantém o **footer sticky mobile** (linhas 1837–1849) intacto — é o único CTA mobile e não é redundante.

### 2. Padronizar label de "Salvar"
- Header desktop e mobile: rótulo único `Salvar` (já é o caso). Remover o ternário morto na linha 999/1839 (`isEdit && status !== "rascunho" ? "Salvar" : "Salvar"`).
- Em modo `isEdit` mostrar microcopy abaixo do botão **apenas** em hover/title: `title="Salva alterações neste orçamento"` (ou `Salvar alterações` quando `isEdit` real). Remover variação `Salvar Alt.` na linha 1839.

### 3. Renomear "Parcial" → "Subtotal dos itens"
- `OrcamentoItemsGrid.tsx` linhas 519 e 537: `Parcial:` → `Subtotal dos itens:`. Apenas string, sem mudança de cálculo.

### 4. Padronizar formatação numérica (peso)
- `OrcamentoSidebarSummary.tsx` linha 45: `pesoTotal.toFixed(2)} kg` → `formatWeightKg(pesoTotal)`.
- `OrcamentoCondicoesCard.tsx` linha 28 (`peso_total.toFixed(2)`) → `formatWeightKg(form.peso_total)` e remover `(kg)` do label `Peso Total (kg)` → `Peso total`.
- `OrcamentoTotaisCard.tsx` linhas 70, 80, 84 (`pesoTotal/pesoEffective.toFixed(2)} kg`) → `formatWeightKg(...)`. Tooltip também.
- Importar `formatWeightKg` de `@/lib/format` nesses arquivos.

### 5. Clareza do simulador de frete (origem do `freteValor`)
Em `FreteSimuladorCard` (e/ou `OrcamentoTotaisCard`) — apenas UI/feedback:
- Quando uma simulação foi aplicada (existe `freteSimulacaoId` no form), exibir um **chip discreto** acima/abaixo do campo "Frete" em `OrcamentoTotaisCard` ou no header do simulador:
  `"Frete aplicado: {servicoFrete || freteTipo} — {formatCurrency(freteValor)}"` com botão `Limpar` que chama `setValue('freteValor', 0)` + `setFreteSimulacaoId(null)`.
- No card "Condições Comerciais", o campo `Frete` (servicoFrete) ganha tooltip "Preenchido automaticamente quando há cotação aplicada; pode ser editado".
- Sem alterar lógica de cálculo. Passa-se `freteSimulacaoId` e `servicoFrete` como props para `OrcamentoTotaisCard`.

## Média prioridade

### 6. Tornar a tela menos densa — blocos colapsáveis
Envolver as seções abaixo em `<Collapsible>` (já existe em `@/components/ui/collapsible`), com header padronizado (chevron + título). Estado padrão **aberto** em desktop, lembrar via `useUserPreference("orcamento_form_section_<key>")` — opcional, sem persistir entre sessões na primeira versão.

Seções a transformar:
- `Análise Interna · Base x Cenário` (linha 1277) — colapsada por padrão
- `Frete (Simulador)` (linha 1296) — aberta
- `Condições Comerciais` (linha 1325) — aberta
- `Observações` (linha 1330) — colapsada por padrão se vazio

`Identificação` e `Cliente` permanecem expandidos sempre (são essenciais).

### 7. Mini stepper de status na "Identificação"
Substituir o `<p>` "Fluxo: Rascunho → ..." (linha 1194) por um componente compacto inline que destaca a etapa atual:
```
[●] Rascunho ─ [○] Aprovação ─ [○] Aprovado ─ [○] Pedido
```
Implementação: pequeno helper local em `OrcamentoForm` (~20 linhas) que mapeia `status` em índice 0–3 e renderiza spans com `bg-primary` para a etapa atual e `bg-muted` para as demais. Sem novo arquivo.

### 8. Renomear "Código" do cliente
- Linha 1236: `<Label>Código</Label>` → `<Label>Código do cliente</Label>`. Tooltip opcional: "Identificador interno (cód. legado/ERP)".

### 9. Consolidar "Ações Comerciais" → "Compartilhamento da proposta"
- Linhas 1376–1424: mudar `<h4>Ações Comerciais</h4>` → `Compartilhamento da proposta`.
- Reordenar botões: `Copiar link público`, `Abrir link público`, `Reenviar por e-mail` lado a lado (não no header).
- Lista de status já existe (criado/validade); adicionar linha placeholder "Último envio: —" (sem coluna no schema, exibe `—` por enquanto — comentário inline "TODO: persistir em coluna futura").

## Baixa prioridade

### 10. Microcopy
- Botão `Visualizar` no header desktop (linha 1001): manter; mobile dropdown manter `Visualizar`.
- Banner "Total atualizado" / "Frete aplicado": já contemplado em #5 via chip.

### 11. Ergonomia da grade de itens
- `OrcamentoItemsGrid.tsx`: aumentar `py-` da linha desktop (busca interna) em ~2px e aplicar `text-foreground` no subtotal para destacá-lo. Sem refator estrutural.
- (Agrupar ações secundárias em menu fica como follow-up em outra onda.)

## Fora de escopo
- Persistir "último envio por e-mail" no schema.
- Refator do `OrcamentoItemsGrid` para linhas expansíveis.
- Mudanças no simulador de frete propriamente (cálculo, RPC).
- Mudanças no `OrcamentoView` (drawer) — já tratadas na Onda 42m.

## Arquivos alterados
- `src/pages/OrcamentoForm.tsx` — itens 1, 2, 5 (chip), 6, 7, 8, 9, 10.
- `src/components/Orcamento/OrcamentoSidebarSummary.tsx` — item 1 (remoção de CTAs) + item 4 (peso).
- `src/components/Orcamento/OrcamentoItemsGrid.tsx` — itens 3, 11.
- `src/components/Orcamento/OrcamentoCondicoesCard.tsx` — item 4.
- `src/components/Orcamento/OrcamentoTotaisCard.tsx` — itens 4, 5 (chip).
- `src/components/Orcamento/FreteSimuladorCard.tsx` — item 5 (header com origem aplicada).

## Validação
- `tsc` limpo; ESLint sem novos warnings.
- QA visual em 1552px e 375px:
  - Sidebar não tem mais botões `Salvar/Visualizar/PDF`; só resumo.
  - Header desktop mostra `Salvar` (não `Salvar Alt.`).
  - Grade de itens mostra `Subtotal dos itens: R$ ...`.
  - Pesos exibidos como `6,00 kg`.
  - Quando uma cotação é aplicada, chip "Frete aplicado: Correios PAC — R$ 156,48" aparece com botão Limpar.
  - Stepper de status na Identificação destaca a etapa atual.
  - Análise Interna inicia colapsada; demais seções colapsam ao clicar no header.
