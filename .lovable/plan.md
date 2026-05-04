## Objetivo

Sincronizar `produtos.estoque_atual` com a coluna **ESTOQUE** das abas **Produtos** e **Insumos** da planilha enviada, usando **COD./SKU** como chave de cruzamento e gerando movimentação rastreável.

## Diagnóstico do cruzamento

- Planilha: **192 SKUs** únicos (167 produtos + 25 insumos), nenhum duplicado.
- Banco: **100% dos SKUs encontrados** (0 sem match).
- Diferenças de saldo a aplicar: **43 produtos** (os 149 restantes já batem).
- Casos especiais detectados na checagem geral:
  - **26 SKUs com duplicidade no banco** (ex.: `AG011` × `00000000AG011`) — herança da migração legada (mem://tech/exibicao-codigo-produto). Vamos atualizar o registro **canônico** (sem prefixo `00000000`) e **zerar** o legado para não duplicar saldo na visão de estoque.
  - **MA004**: dois produtos diferentes compartilham o SKU (`QUEIMADOR DE PARAFORMOL` × `FIO RESISTIVO`). Planilha indica MA004 = `QUEIMADOR DE PARAFORMOL` com estoque 0 → atualizo só esse; o outro fica como está (também 0). Sem efeito prático, mas registro o conflito.
  - **VR039**: três registros (`VR039` × 2 + `00000000VR039`). Planilha = `SPRAY ANTISSEPTICO` com estoque 0 → atualizo o `VR039` cujo `nome` casa (SPRAY ANTISSÉPTICO) e zero o legado. O terceiro (`FITA TESTE PARA ÁCIDO PARACETICO`) fica intocado.

## O que vou executar

1. **Aplicar ajuste via RPC `ajustar_estoque_manual`** (tipo `'ajuste'`, valor absoluto) para cada produto canônico cujo `estoque_atual` difere do valor da planilha.
   - Motivo: `"Ajuste de inventário conforme planilha SISTEMA_AVIZEE (04/05/2026)"`
   - Categoria: `inventario`
   - Isso gera linha em `estoque_movimentos` (auditável) e atualiza `produtos.estoque_atual` na mesma transação.
2. **Zerar duplicatas legadas** com prefixo `00000000` que casariam pela normalização (apenas para os 25 SKUs duplicados listados), também via RPC, com motivo `"Saldo unificado no SKU canônico (planilha SISTEMA_AVIZEE)"`.
3. **Não tocar** em registros sem match na planilha (mantém saldos atuais).
4. Emitir um **CSV de auditoria** em `/mnt/documents/ajuste-estoque-2026-05-04.csv` com colunas: `sku, nome, tipo_item, estoque_anterior, estoque_planilha, delta, status` para conferência.

## Resumo dos saldos não-zero da planilha (67 SKUs)

Exemplos: AG005=200, AG007=300, AG012=18, AG021=214, AZ007=10, CX002=40, EB001=188, ET003=517, SR010=239, SR024=2000, VR008=190, VR023=80…

## Detalhes técnicos

- **Chave de match**: `regexp_replace(upper(sku), '^0+(?=[A-Z0-9]*[A-Z])', '')` — segue exatamente a normalização já em uso no sistema (mem://tech/exibicao-codigo-produto).
- **RPC**: `public.ajustar_estoque_manual(p_produto_id, p_tipo, p_quantidade, p_motivo, p_categoria_ajuste)` — atomico, respeita RLS/empresa atual, recalcula `saldo_anterior`/`saldo_atual` e dispara `trg_estoque_movimentos_sync` (mem://tech/integridade-dados-estoque).
- **Modo de execução**: script Python (sandbox) chamando a RPC via PostgREST, lote sequencial; commit por linha (a RPC já é transacional). Sem necessidade de migration — é apenas data update.
- **Sem alteração de schema, sem alteração de código-fonte**.

## Pós-execução (não estarei alterando agora, só sinalizando)

A duplicidade `00000000XXX` × `XXX` é um débito técnico de migração. Recomendo abrir, em seguida, uma rodada para **deduplicar fisicamente** esses 25 registros legados (já existe `produto_identificadores_legacy` para preservar histórico). Não faz parte deste plano para não misturar correção de saldo com merge de produtos.
