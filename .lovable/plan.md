# Onda 36 — Mobile do grid Formas de Pagamento

Refinos no card mobile e nos summary cards de `/formas-pagamento` (`src/pages/FormasPagamento.tsx`). UI/labels apenas — sem mudança de schema.

## Contexto
- `SummaryCard` aceita `shortTitle` que substitui `title` no mobile (uso já consagrado no projeto).
- `MobileCardList` (via `DataTable`) renderiza:
  - **primary**: `mobilePrimary: true` → `descricao`.
  - **identifier**: coluna apontada por `mobileIdentifierKey` → hoje `tipo` (já é Badge com ícone após Onda 35).
  - **detalhes**: colunas marcadas `mobileCard: true` → hoje só `prazo` (Parcelamento).
  - **status**: badge no canto superior direito (`ativo`).
- Onda 35 já corrigiu nomes técnicos (`cartao_credito`/`outros`) e a representação de "30d" virou "n parcelas · 30/60/90 dias". Esses pontos do feedback estão resolvidos no desktop e — como o mobile reusa as mesmas colunas — também no mobile.

## Alta prioridade

1. **Eliminar truncamento dos summary cards no mobile**
   - `Total` → mantém.
   - `Ativas` → mantém.
   - `Parceladas` → mantém.
   - `Criam lançamentos` → adicionar `shortTitle="Financeiro"`.
   - Validar visualmente que nenhum card mais corta o texto a 391px.

2. **Confirmar que valores técnicos não aparecem mais**
   - `tipoLabel`/`tipoIcon` agora cobrem `cartao_credito`, `cartao_debito`, `cobranca_automatica`, `debito_automatico`, `outros`. Como `mobileIdentifierKey="tipo"` reusa o `render` do desktop, o card mobile já mostra o badge "Cartão de crédito"/"Outros" com ícone consistente.
   - Adicionar fallback defensivo no `tipoLabel`: se a chave não existir, usar capitalização legível (`f.tipo.replace("_", " ")`) para nunca exibir snake_case bruto.

3. **Hierarquia do card mobile mais clara**
   - Atual: `descricao` (primary) → badge `tipo` (identifier) → `prazo` (detail).
   - Trocar o wrapper `font-mono text-muted-foreground` herdado do slot identifier não é necessário porque o badge tem fundo próprio; mas vamos garantir a ordem desejada **título → tipo → parcelamento → status**:
     - Manter `mobilePrimary: descricao`.
     - Manter `mobileIdentifierKey: tipo` (Badge com ícone).
     - Manter `prazo` como `mobileCard` (já em duas linhas: "n parcelas / 30/60/90 dias" / "1 parcela · 30 dias" / "À vista").
     - Status segue como pill no canto via `mobileStatusKey="ativo"`.

4. **Mostrar "Gera financeiro" no card mobile**
   - Marcar a coluna `gera_financeiro` como `mobileCard: true` para que apareça nas details do card. O render já é o Badge "Sim/Não" com tooltip + ícone (`CheckCircle`/`Ban`), o que mantém compacto. Em mobile o tooltip não dispara, mas o badge "Sim/Não" sozinho carrega o sinal.

## Média prioridade

5. **Placeholder da busca mais curto**
   - `searchPlaceholder="Buscar forma..."` (substitui "Buscar por descrição..."). Vale para desktop e mobile — ganho maior no mobile.

6. **Ícone do PIX padronizado**
   - Manter `QrCode` (lucide) para `pix` em todos os pontos. Confirmar que não há renderização de unicode/emoji no nome `descricao` (a forma "PIX à vista" é apenas texto cadastrado pelo usuário); nada a fazer no código além de garantir que o Badge `tipo` use sempre o ícone do `tipoIcon`.

## Fora de escopo (registrar no plano para futura onda)

- **Paginação compacta quando há 1 página só**: `DataTable` controla `Pagination` próprio; alterar comportamento muda comportamento global de outras telas. Tratar em onda dedicada ao DataTable mobile.
- **Bottom-nav highlighting** do módulo "Formas e condições de pagamento": pertence ao módulo Cadastros e usa o item agrupador. Avaliar em onda específica de navegação mobile.

## Arquivos
- `src/pages/FormasPagamento.tsx` (única alteração)
- `.lovable/plan.md` (registrar Onda 36)
