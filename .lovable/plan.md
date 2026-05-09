# Onda 35 — Grid Formas de Pagamento

Refinos no grid `/formas-pagamento` (`src/pages/FormasPagamento.tsx`). UI/labels apenas — sem mudança de schema.

## Causa raiz observada
O `tipoLabel` e `tipoIcon` estão **incompletos**: cobrem `pix/boleto/cartao/dinheiro/transferencia/outro/boleto_dda`, mas o `<Select>` do form grava também `cartao_credito`, `cartao_debito`, `cobranca_automatica`, `debito_automatico`, `outros`. Quando o tipo é um destes, o grid cai no fallback `tipoLabel[f.tipo] || f.tipo` e mostra o valor cru (`cartao_credito`, `outros`). Isso explica os itens 3 e 6 do feedback.

## Alta prioridade

1. **Mapas `tipoLabel` e `tipoIcon` completos**
   - `tipoLabel`: incluir `cartao_credito → "Cartão de crédito"`, `cartao_debito → "Cartão de débito"`, `cobranca_automatica → "Cobrança automática"`, `debito_automatico → "Débito automático"`, `outros → "Outros"`. Padronizar `outro/outros` para "Outros".
   - `tipoIcon`: mapear `cartao_credito`/`cartao_debito` → `CreditCard`, `cobranca_automatica`/`debito_automatico` → `ArrowLeftRight` (ou `Wallet`), `boleto_dda` → `FileText`, `outros`/`outro` → `HelpCircle`.

2. **Coluna "Tipo" como badge consistente**
   - Renderizar `<Badge variant="outline" className="gap-1 text-xs">{Icon}{tipoLabel[...]}</Badge>` (substitui o `<span>` solto). Mesmo ícone usado no nome → remover o ícone duplicado da coluna "Forma de Pagamento" para evitar repetição.

3. **Coluna "Prazo / Parcelas" → "Parcelamento" mais clara**
   - Renomear cabeçalho para **"Parcelamento"**.
   - Render:
     - Sem intervalos e `prazo_dias === 0` → `"À vista"`.
     - Sem intervalos e `prazo_dias > 0` → `"1 parcela · ${prazo_dias} dias"`.
     - Com `intervalos_dias` (n itens) → linha 1: `"${n} parcelas"`, linha 2 (muted, font-mono): `"${intervalos.join("/")} dias"`.
   - Mantém compacto, mas elimina ambiguidade do "30d" para 30/60/90 e cartão 3x.

4. **Card "Geram Financeiro" → "Criam lançamentos"**
   - Trocar título do `SummaryCard` para **"Criam lançamentos"**, manter ícone `Wallet`/variant `info`. Coluna do grid passa a se chamar **"Financeiro"** (header curto), badge segue "Sim/Não" + tooltip "Cria lançamento financeiro automaticamente em pedidos e notas".

5. **Substituir card "Inativas" por "Parceladas"**
   - Card "Inativas" some (a info já está embutida em "Total - Ativas" e como filtro). Novo card **"Parceladas"**: `data.filter(f => (f.intervalos_dias?.length ?? 0) > 1 || f.parcelas > 1).length`, ícone `CalendarDays`.
   - Sequência final dos cards: **Total | Ativas | Parceladas | Criam lançamentos**.

## Média prioridade

6. **Tooltip no badge "Sim/Não" da coluna Financeiro** com a frase do item 4.
7. **Ordenação padrão** por `tipo` → `descricao` (alfabética dentro de cada tipo) — opcional via `defaultSort` se DataTable suportar; caso contrário, manter nome de coluna sortable e a ordem natural.
8. **Mobile (`mobileCard`/`mobilePrimary`)** — garantir que o novo render de "Parcelamento" em duas linhas continue compacto no card mobile (pode ficar inline `n parcelas · 30/60/90d`).

## Fora de escopo
- Coluna "Usada em" / "Último uso" / "Padrão" — exigem agregação extra ou flag em outras tabelas (Onda 36).
- Refatorar o form de cadastro (já em estado bom; só consumir os mesmos `tipoLabel`/`tipoIcon` para consistência).

## Arquivos
- `src/pages/FormasPagamento.tsx` (única alteração)
- `.lovable/plan.md` (registrar Onda 35)
