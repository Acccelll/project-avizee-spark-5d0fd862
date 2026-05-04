# Contratos cross-módulo

Mapa de **mutações que afetam mais de um módulo**, com seus callers, side-effects
e as query keys que devem ser invalidadas após o sucesso.

## Princípio

> **Operações multi-tabela são RPCs PostgreSQL (atômicas).
> Serviços TS são adapters finos que chamam a RPC e disparam invalidação.**

Quando paridade RPC ainda não existe, o TS faz best-effort com idempotência por
status; **nesse caso, invalidação manual via `useInvalidateAfterMutation` é
obrigatória** (ver `src/services/_invalidationKeys.ts`).

## Mutações

| Operação | Caminho canônico | Adapter TS | Hook recomendado | Side-effects | Keys |
|---|---|---|---|---|---|
| Cotação → Pedido | RPC `converter_orcamento_em_ov` | `convertToPedido` | **`useConverterOrcamento`** | atualiza orçamento status, cria OV + items, copia frete | `conversaoOrcamento` |
| Pedido → NF saída | RPC `gerar_nf_de_pedido` | `gerarNFParaPedido` (legado) | **`useFaturarPedido`** | cria NF + items, atualiza `quantidade_faturada` e `status_faturamento` da OV, registra evento, confirma estoque + financeiro | `faturamentoPedido` |
| Confirmar NF (estoque + financeiro) | TS `confirmarNotaFiscal` (sem RPC ainda) | mesmo | — (chame direto + invalide) | atualiza status NF, insere `estoque_movimentos`, insere `financeiro_lancamentos`, atualiza OV faturamento se saída | `fiscalLifecycle` |
| Estornar NF | TS `estornarNotaFiscal` (sem RPC ainda) | mesmo | — | reverte estoque, cancela financeiros vinculados, reverte faturamento OV, marca NF cancelada | `fiscalLifecycle` |
| Devolução NF | RPC `gerar_devolucao_nota_fiscal` | — | `useGerarDevolucaoNF` | cria NF de devolução vinculada à origem | `fiscalLifecycle` |
| Cotação compra → Pedido compra | RPC `gerar_pedido_compra` | — | **`useGerarPedidoCompra`** | cria `pedidos_compra` + items, marca cotação como `convertida` | `geracaoPedidoCompra` |
| Receber pedido compra | RPC `receber_compra` | — | direto via `usePedidosCompra.darEntrada` | cria `compras` + `compras_itens`, insere `estoque_movimentos` (entrada), atualiza `pedidos_compra.status` (parcial/recebido), grava `auditoria_logs`. **NÃO gera `financeiro_lancamentos`** — o contas a pagar nasce ao confirmar a NF de entrada vinculada. | `recebimentoCompra` |
| Salvar Pedido de Compra (header + itens) | RPC `replace_pedido_compra_itens` | TS `useSalvarPedidoCompra` | **`useSalvarPedidoCompra`** | atualiza cabeçalho + substitui itens atomicamente | `geracaoPedidoCompra` |
| Baixa financeira | RPC `financeiro_processar_baixa_lote` | TS fallback | `useFinanceiroBaixar` | insere `financeiro_baixas`, atualiza status do lançamento, opcionalmente movimenta caixa | `baixaFinanceira` |
| Estorno financeiro | RPC `financeiro_processar_estorno` | — | `useFinanceiroEstornar` | reverte baixa(s), atualiza status | `baixaFinanceira` |

## Callers (mapa de uso)

| Caller (UI) | Operação | Hook usado |
|---|---|---|
| `Pedidos.tsx` (grid) → ação "Gerar NF" | Pedido → NF | `useFaturarPedido` |
| `OrdemVendaView` (drawer) → "Gerar NF" | Pedido → NF | `useFaturarPedido` |
| `Orcamentos.tsx` (grid) → "Gerar Pedido" | Cotação → Pedido | `useConverterOrcamento` |
| `OrcamentoView` (drawer) → "Gerar Pedido" | Cotação → Pedido | `useConverterOrcamento` |
| `useCotacoesCompra.gerarPedido` | Cotação compra → Pedido compra | `useGerarPedidoCompra` |
| `usePedidosCompra.darEntrada` | Receber pedido compra | RPC direto + `INVALIDATION_KEYS.recebimentoCompra` |
| `Fiscal.tsx` → Confirmar/Estornar | NF lifecycle | TS service + `useInvalidateAfterMutation(INVALIDATION_KEYS.fiscalLifecycle)` |
| `FiscalDetail.tsx` → mesmas ações | NF lifecycle | idem |
| `NotaFiscalDrawer` → mesmas ações | NF lifecycle | idem |

## Convenções de navegação

- **Conversão de orçamento (grid)**: `navigate("/pedidos")`. **Drawer**: permanece
  na visualização e mostra link para o pedido vinculado (menos disruptivo).
- **Receber pedido compra → NF entrada**: passa `pedido_compra_id` (UUID) e
  `fornecedor_id` por query string. Fiscal pré-preenche o form e mostra
  breadcrumb "Voltar ao Pedido de Compra".
- **Faturamento (gerar NF)**: permanece no contexto do pedido; usuário clica em
  "NF X" no header se quiser navegar.

## Decisões pendentes (fora do escopo)

1. ✅ **Resolvido (2026-04-28).** RPCs `confirmar_nota_fiscal` e
   `estornar_nota_fiscal` existem no banco com `SECURITY DEFINER` +
   `search_path = public`; `useNotaFiscalLifecycle.ts` é o ponto único de
   entrada. As funções TS antigas foram removidas (ver comentário em
   `fiscal.service.ts`).
2. ✅ **Resolvido.** A RPC `gerar_nf_de_pedido` já protege concorrência via
   `pg_advisory_xact_lock(hashtext(p_pedido_id))` + `SELECT … FROM
   ordens_venda WHERE id=$1 FOR UPDATE` + guarda explícita de
   `status_faturamento='faturado'` antes de criar a NF. Faturamento duplo é
   bloqueado dentro da mesma transação.
3. Realtime cross-módulo (Supabase Realtime) para invalidação automática.
