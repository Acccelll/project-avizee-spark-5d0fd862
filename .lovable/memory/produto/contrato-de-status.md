---
name: Contrato de Status (transversal)
description: Doutrina única de status de domínio do ERP — grafia, variant e regra de adição
type: feature
---

# Contrato de Status — Fonte Única

**Regra**: todo novo status entra **primeiro** em `src/types/ui.ts`
(`STATUS_VARIANT_MAP`) e em `src/components/StatusBadge.tsx`
(`statusMeta` para ícone/label). Só depois pode ser referenciado em
`src/lib/statusSchema.ts` (que apenas alimenta `MultiSelect` de filtros).

`STATUS_VARIANT_MAP` é a **única** fonte de cor (`StatusVariant`).
Schemas em `statusSchema.ts` devem usar `color` consistente com o variant
canônico para o mesmo conceito. Convenção de espelhamento:
`muted → "secondary"` (compat BadgeVariant), demais variants usam o nome literal.

## E8 — Doutrina (revisada 2026-05)

- **success** = terminal positivo: `pago`, `entregue`, `aprovada/aprovado`,
  `convertida/convertido`, `faturada/faturado`, `confirmada/autorizada` (NF),
  `concluido`, `recebido`, `despachado`, `emitida`, `no_prazo`, `total`, `ativo`.
- **info** = movimento/processamento: `em_separacao`, `separado`, `em_transporte`,
  `em_transito`, `coletado`, `postado`, `enviado/enviada`, `enviado_ao_fornecedor`,
  `processando`, `em_analise`, `importada/importado`, `confirmado` (Compras).
- **warning** = espera/parcial/divergência: `aberto/aberta`, `pendente`,
  `aguardando`, `aguardando_aprovacao`, `aguardando_recebimento`, `parcial`,
  `parcialmente_recebido`, `recebido_parcial`, `faturada_parcial`, `divergente`,
  `proximo_vencimento`.
- **destructive** = falha/cancelamento: `cancelado/cancelada`, `rejeitado/rejeitada`,
  `vencido/vencida`, `expirado`, `bloqueado`, `sem_correspondencia`, `atrasado`,
  `estornado`, `devolvido`.
- **muted** = arquivado/inativo/rascunho: `rascunho`, `inativo/inativa`, `simples`,
  `nao_faturado`, `inutilizada`, `historico`. **Exceção**: `cancelado` em
  Financeiro (lançamento não pago) usa `secondary→muted` para não destacar.
- **primary** = marca/destaque restrito: `composto`, `conciliado_manual`.

Quando o conceito é o mesmo mas o módulo o trata como movimento (não terminal),
vai para `info` (ex.: `confirmado` de Compras = pedido aceito mas ainda não
recebido). Quando o conceito é terminal documental (ex.: NF `confirmada`/
`autorizada`), vai para `success`.

## Tabela canônica (módulo × conceito → grafia → variant)

| Conceito | Módulo | Grafia canônica | Variant |
|---|---|---|---|
| Aprovado | Orçamento | `aprovado` | `success` |
| Aprovado | Pedido | `aprovada` | `success` |
| Aprovado | Cotação Compra | `aprovada` | `success` |
| Aprovado | Pedido Compra | `aprovado` | `success` |
| Pendente | Orçamento | `pendente` | `warning` |
| Pendente | Pedido | `pendente` | `warning` |
| Pendente | NF | `pendente` | `warning` |
| Em aberto | Financeiro | `aberto` | `warning` |
| Cancelado | Orçamento/Pedido/NF/Compra/Remessa | `cancelado`/`cancelada` | `destructive` |
| Cancelado | Financeiro (lançamento não pago) | `cancelado` | `muted` (exceção documentada) |
| Faturado | Pedido / canônico | `faturada` / `faturado` | `success` |
| Em movimento | Pedido | `em_separacao` | `info` |
| Em movimento | Cotação Compra | `em_analise` | `info` |
| Em movimento | Logística | `em_transito` | `info` |
| Confirmada | NF | `confirmada` / `autorizada` | `success` |
| Confirmado | Pedido Compra | `confirmado` | `info` |
| Estornado | Financeiro | `estornado` | `destructive` |
| Devolvido | Remessa | `devolvido` | `destructive` |
| Inutilizada | NF | `inutilizada` | `muted` |

## Aliases conhecidos

`comprasStatus.ts` mantém apenas aliases de Compras
(ex: `finalizada → aprovada`, `recebido_parcial → parcialmente_recebido`).
Não criar arquivos `pedidosStatus.ts` / `fiscalStatus.ts` análogos —
helpers de transição vão em hooks (`useTransicionarRemessa` etc).

## Checklist ao adicionar status

1. Adiciona em `STATUS_VARIANT_MAP` (cor).
2. Adiciona em `statusMeta` do `StatusBadge` (ícone + label PT-BR).
3. Se for filtrável, adiciona no schema correspondente em `statusSchema.ts`
   reusando o mesmo `color` (string equivalente ao variant).
4. Se houver transição (`em_movimento → entregue`), implementar no hook
   de transição do módulo, não em util global.