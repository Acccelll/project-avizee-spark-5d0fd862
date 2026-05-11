
# Grid de Cotações de Compra — melhorias operacionais

Foco em transformar a listagem em uma central de ação, deixando claro o **próximo passo** de cada cotação e dando filtros/KPIs orientados ao processo de negociação. Mudanças apenas de UI/presentation — nenhuma alteração em RPC, RLS ou serviços.

## Alta prioridade

1. **Coluna "Prontidão" → "Próxima ação"** (`CotacaoCompraTable.tsx`)
   - Renomear o header.
   - Trocar o conteúdo por verbos/comandos:
     - `convertida` → "Pedido gerado" (ícone check)
     - `aguardando_aprovacao` → "Aprovar cotação"
     - `tem_vencedor && itens > 0` → "Pronta p/ aprovação"
     - `propostas > 0 && sem vencedor` → "Selecionar fornecedor"
     - `itens > 0 && propostas === 0` → "Adicionar proposta"
     - `itens === 0` → "Adicionar itens"
     - `cancelada/rejeitada` → estado neutro
   - Cada texto continua usando `StatusBadge` com a `variant` adequada do `STATUS_VARIANT_MAP` (sem cores hardcoded).

2. **Ação contextual rápida na linha** (`CotacaoCompraTable.tsx`)
   - Adicionar um botão pequeno no fim da coluna "Próxima ação" (ou via `actions` do DataTable) que dispara `onView` na cotação — abrindo o drawer já no contexto certo (selecionar/propostas/aprovar).
   - Tooltip explicando o efeito.
   - Mantém-se `onView`/`onEdit` padrão; nenhum novo handler de negócio.

3. **Coluna "Fornecedores" mais semântica** (`CotacaoCompraTable.tsx`)
   - Renomear para "Fornecedores / Propostas".
   - Conteúdo em duas linhas: `Nf fornecedores · Np propostas` (a partir de `summaries[id].fornecedor_ids.length` e total de propostas — adicionar `propostas_count` em `CotacaoSummary`).
   - Manter "Trophy + vencedor" quando houver.
   - Estado vazio: "Sem fornecedores · sem propostas" (texto neutro, sem alerta visual).

4. **Card "Em Cotação" sem semântica negativa** (`CotacoesCompra.tsx`)
   - Trocar `variationType` para `"neutral"` (estar em cotação não é problema).
   - Reservar `negative` para cotações vencidas/sem proposta.

5. **Esclarecer filtros de data** (`CotacaoCompraFilters.tsx`)
   - Adicionar label visível "Período de abertura" antes dos dois inputs.
   - Manter apenas data de abertura nesta iteração (mais filtros de data ficam para média prioridade).

## Média prioridade

6. **Novo KPI "Sem propostas"** (`CotacoesCompra.tsx` + `useCotacoesCompra.ts`)
   - Substituir o card "Convertidas" pelo card "Sem propostas" (mais acionável no dia a dia) ou reorganizar para 4 cards: Total · Em Cotação · Sem propostas · Aguardando aprovação.
   - Cálculo: cotações ativas (não convertida/cancelada/rejeitada) cujo `summaries[id].propostas_count === 0`.
   - `variationType` `"negative"` quando > 0.

7. **Filtro rápido de Validade** (`CotacaoCompraFilters.tsx` + `useCotacaoCompraFilters.ts`)
   - Novo `MultiSelect`/`Select` "Validade" com opções: Todas · Vencidas · Vencendo (≤7d) · Sem validade.
   - Aplicar no `filteredData` usando a `data_validade` já existente.
   - Persistir no URL state (`useUrlListState`).

8. **Renomear filtro "Fornecedor (proposta)" → "Fornecedor"** (`CotacaoCompraFilters.tsx`)
   - Adicionar tooltip explicando que filtra fornecedor com proposta na cotação.

## Baixa prioridade

9. **Microcopy + tooltips no DataTable**
   - Tooltip nos `StatusBadge` da coluna Status e Próxima ação descrevendo a regra.
   - Empty state já existe; adicionar abaixo da tabela uma linha contextual quando `data.length > 0 && data.length < 3`: "Cotações abertas aguardam seleção de fornecedores e registro de propostas para comparação."

## Detalhes técnicos

- **`CotacaoSummary`** ganha `propostas_count: number` — calcular em `useCotacoesEnrichment.ts` a partir do mesmo array de propostas já enriquecido.
- **Ações contextuais** são apenas `onView` (drawer existente). Não criar novas mutations.
- **Cores**: respeitar o contrato de status (`STATUS_VARIANT_MAP`); nada de classes `text-red-*` diretas.
- **Filtro de validade**: estende `useUrlListState` schema com `validade: { type: "string" }` (compatível com link compartilhado).
- **KPI "Sem propostas"** depende de `summaries` — mover o cálculo do KPI para `useMemo` que dependa de `summaries` (já disponível no hook).
- Sem mudanças em `services/cotacoesCompra.service.ts`, RPCs, RLS ou tipagem do banco.

## Arquivos afetados

- `src/components/compras/CotacaoCompraTable.tsx`
- `src/components/compras/CotacaoCompraFilters.tsx`
- `src/components/compras/useCotacaoCompraFilters.ts`
- `src/components/compras/cotacaoCompraTypes.ts` (campo `propostas_count`)
- `src/hooks/compras/useCotacoesEnrichment.ts`
- `src/hooks/useCotacoesCompra.ts` (KPI extra)
- `src/pages/CotacoesCompra.tsx` (cards e props)

## Fora de escopo (registrar para depois)

- Novas colunas "Valor estimado / Menor proposta / Economia / Prazo" — exigem agregação adicional por item × proposta; tratar em iteração separada.
- Filtro de data por evento (abertura/aprovação/conversão) — depende de campos de timestamp por transição que hoje não existem.
- Ocultar setas de paginação quando uma só página — ajuste de `DataTable` global (afeta outros módulos).
