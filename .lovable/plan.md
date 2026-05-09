## Onda 37 — Refino do formulário "Editar Forma de Pagamento"

Foco: tornar a relação **prazo padrão × parcelas** mais intuitiva, melhorar a configuração/visualização de parcelas e refinar microcopy. Sem mudanças de schema, sem mudar lógica de cálculo. Tudo em `src/pages/FormasPagamento.tsx`.

### Alta prioridade

**1. Bloco "Condição de Pagamento" — hierarquia À vista × A prazo**
- Adicionar um seletor superior `RadioGroup`/segmented com duas opções: **À vista** | **A prazo**.
- Estado derivado: `aPrazo = prazo_dias > 0 || intervalos_dias.length > 0`.
- Ao selecionar **À vista** → zera `prazo_dias` e `intervalos_dias`; oculta sub-bloco de prazo/parcelas e mostra badge sutil "Pagamento à vista — sem prazo adicional".
- Ao selecionar **A prazo** → revela: campo "Prazo padrão" + sub-bloco "Parcelamento".
- Mensagem curta e direta dentro do sub-bloco: *"Se você adicionar parcelas abaixo, os intervalos definidos substituirão o prazo padrão."*

**2. Lista de parcelas explícita (substitui a fileira de chips)**
- Quando houver `intervalos_dias`, renderizar uma lista vertical:
  - `Parcela 1 — 30 dias [editar] [remover]`
  - `Parcela 2 — 60 dias …`
- Cada item editável inline (input numérico pequeno) ou ação "remover" (X).
- Manter ordem do array; reordenação fica fora de escopo.
- Resumo mantido: "3 parcelas: 30 / 60 / 90 dias" (já existe).

**3. Estado vazio e label do adder de parcelas**
- Estado vazio (quando A prazo, sem intervalos): *"Nenhuma parcela configurada. Adicione intervalos para criar um parcelamento (ex.: 30, 60, 90)."*
- Renomear label do input para **"Dias da parcela"** e botão para **"Adicionar parcela"** (mantido).
- Manter Enter para confirmar.

### Média prioridade

**4. Identificação da Regra — labels mais claras**
- "Descrição" → **"Nome da forma"** com helper inalterado ("Como aparecerá em clientes, orçamentos e pedidos").
- "Tipo" → **"Meio de pagamento"** (`Label` apenas; `value` permanece `tipo`).
- Manter Status como está (já compacto).

**5. Bloco "Comportamento Financeiro" — copy mais objetiva**
- Texto auxiliar: *"Quando ativado, gera lançamentos financeiros automaticamente ao usar esta forma em pedidos e orçamentos."* (alinhado ao tooltip do grid).

**6. Bloco "Uso / Contexto" — mais escaneável**
- Manter os 3 itens, mas com **labels em negrito + frase curta**, sem subordinadas longas. Já está próximo; apenas encurtar.
- Ex.: "**Financeiro:** gera lançamentos ao finalizar pedidos." / "**Financeiro:** não gera lançamentos automáticos."

**7. Observações — placeholder neutro**
- *"Registre instruções internas, restrições comerciais ou observações sobre o uso desta forma."*

### Baixa prioridade

**8. Chip de tipo no topo (drawer header)**
- Manter como contexto visual; nenhuma mudança de comportamento. Apenas garantir que o ícone/label vem de `tipoLabel[form.tipo]` (já é).

**9. Compactar levemente o container do toggle Status**
- Reduzir `h-10` da linha do Switch e remover espaço residual (sem mover do lugar).

### Fora de escopo
- Separação `meios_pagamento` × `condicoes_pagamento` (ADR 004 mantém modelo único).
- Mudanças no `QuickAddFormaPagamentoModal` (cadastro rápido continua como está).
- Schema/RLS/migrations.

### Arquivos
- `src/pages/FormasPagamento.tsx` (única alteração).
- `.lovable/plan.md` (registro da onda).

### Validação
- Build TS limpo.
- Cenários testados manualmente: à vista, 30 dias sem parcelas, 30/60/90, 3x cartão.
- Toggle À vista ⇄ A prazo preserva descrição e tipo, zera apenas prazo/parcelas conforme regra.
