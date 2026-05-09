## Onda 38 — Editar Forma de Pagamento (mobile)

Foco: ajustes de UI/UX no modal de edição em viewport ≤ `sm` (390px). Sem mudanças de schema, RLS, services ou regras de negócio. Arquivos afetados: `src/pages/FormasPagamento.tsx`, `src/components/FormModal.tsx` (1 linha), `src/components/FormModalFooter.tsx` (estado do botão primário).

### Alta prioridade

1. **Chip do tipo (“PIX”) ocupando faixa inteira no topo**
   - Causa: em `FormModal.tsx` (linha 105), o `identifier` recebe `max-sm:basis-full max-sm:w-full`, forçando quebra em linha cheia.
   - Ação: remover `max-sm:basis-full max-sm:w-full` do span do `identifier`. O `flex-wrap` do header mantém comportamento desktop e permite que em mobile o chip apareça inline ao lado do título (`Editar Forma de Pagamento  [PIX]`). Afeta todos os modals que usam `identifier`, mas é melhoria consistente.

2. **Botão "Salvar Alterações" sempre ativo**
   - Causa: `FormModalFooter` só desabilita por `saving || disabled`; ignora `isDirty`.
   - Ação: quando `mode === "edit"` e `isDirty === false` e `disabled` não foi explicitamente passado, desabilitar o botão primário com `disabledReason="Sem alterações para salvar"`. Em `mode === "create"` mantém comportamento atual (sempre habilitado, validação por `required`).

3. **Padding inferior do conteúdo em mobile (rodapé fixo)**
   - Hoje `FormModal` aplica `max-sm:pb-24` no scroll-container. Com footer mobile (`py-2 + safe-area`) sobrando ~76–88px, fica justo para `Textarea` de Observações.
   - Ação: aumentar para `max-sm:pb-32` (ou `max-sm:pb-[8.5rem]`) garantindo `altura do rodapé + safe-area + ~24px` de folga.

4. **Estado “A prazo” validado no mobile**
   - O fluxo já existe (RadioGroup → Prazo padrão + lista de parcelas + adder). Ajustes mobile para evitar apertamento na lista de parcelas (linhas 539–570):
     - Item da parcela em `flex-col sm:flex-row` quando `max-sm`, ou simplificar: manter linha única mas reduzir label "Parcela N" para ícone numérico `1ª`/`2ª` e remover `w-20` fixo (passar para `min-w-[3.5rem]`).
     - Input de dias `h-9` (touch-target ≥ 36px) em mobile, manter `h-8` em ≥ sm.
     - Botão "Adicionar parcela" full-width mobile já está OK (`w-full sm:w-auto`).
   - Resumo `"3 parcelas: 30 / 60 / 90 dias"` mantido.
   - Sem alteração de business logic — apenas layout responsivo.

### Média prioridade

5. **Empilhar "Meio de pagamento" e "Status" em mobile**
   - Linha 428: `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`.

6. **Microcopy mais direto em "Gera Financeiro"**
   - Linha 624: trocar para  
     `"Ao usar esta forma em pedidos ou orçamentos, o sistema cria os lançamentos financeiros automaticamente."`

7. **"Observações" — texto auxiliar mais curto**
   - Linha 664: trocar para `"Notas internas, restrições ou acordos comerciais."` (placeholder permanece como complemento).

8. **Compactar espaçamento entre seções em mobile**
   - `<form className="space-y-6">` → `space-y-5 sm:space-y-6`. Reduz quebra visual após "Condição de Pagamento" e ajuda o início do card "Gera Financeiro" aparecer acima da dobra.

### Baixa prioridade (incluso na mesma onda, custo zero)

9. **Padronizar `inputMode="numeric"`** no input de "Prazo padrão" (linha 510-518) — já presente nos demais.

### Fora de escopo

- Separação `meios_pagamento` × `condicoes_pagamento` (ADR 004).
- Mudanças no `FormaPagamentoView` (drawer de visualização).
- Persistência de feedback "Salvo com sucesso" além do toast atual (já coberto por `useSupabaseCrud`).
- Contador de caracteres em Observações (campo `text` sem limite).

### QA manual

Em viewport 390×844:
- [ ] Chip do tipo aparece inline ao lado do título, sem ocupar linha inteira.
- [ ] Em "Editar" sem alterações, botão "Salvar Alterações" está desabilitado com tooltip; após qualquer mudança fica habilitado.
- [ ] Em "Criar", botão sempre habilitado.
- [ ] Textarea de Observações totalmente visível sem ser coberto pelo footer (scroll até o fim).
- [ ] Cenários de "Condição de Pagamento": à vista, 30 dias, 30/60/90, e edição inline dos valores de parcelas existentes.
- [ ] "Meio de pagamento" e "Status" empilhados em mobile, lado a lado em ≥640px.

### Arquivos a editar

- `src/pages/FormasPagamento.tsx` (microcopy, grid responsivo, layout das parcelas, space-y).
- `src/components/FormModal.tsx` (1 ajuste: remover `max-sm:basis-full max-sm:w-full` do identifier).
- `src/components/FormModalFooter.tsx` (auto-desabilitar primário em `edit` quando `!isDirty`).
