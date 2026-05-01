# Pacote de ajustes Fiscal / Financeiro / Cadastros / Navegação

Esta entrega cobre 9 frentes pedidas, respeitando a arquitetura atual (Lovable Cloud, Supabase, services tipados, RLS, padrão V2 de UI). Nenhuma estrutura existente equivalente será duplicada.

## Estado real apurado (auditoria prévia)

- `financeiro_lancamentos` já tem: `forma_pagamento` (texto livre, hoje há valores `boleto`, `dda`, `pix`, `cartao`, `Cartão`, `Cartão Crédito`, `cobranca_automatica`, `Débito Automático`), `forma_pagamento_id` (uuid, ainda não usado), `nota_fiscal_id`, `pedido_compra_id`, `parcela_numero`, `parcela_total`, `documento_pai_id`, `cartao` (texto), `conta_bancaria_id`, `origem_tipo/tabela/id`. Sem coluna `cartao_id` ainda.
- `formas_pagamento` é tabela de **condições de pagamento** (`prazo_dias`, `parcelas`, `intervalos_dias`, `gera_financeiro`) — NÃO é meio de pagamento. Vamos tratar "forma de pagamento" como o campo texto `forma_pagamento` (canonizado via enum lógico) e NÃO duplicar essa tabela.
- `bancos` (id, nome, tipo, ativo) é independente de `fornecedores`. C6 e RecargaPay já foram inseridos.
- `contas_bancarias` referencia `banco_id` (FK para `bancos`), sem vínculo a fornecedor.
- `nota_fiscal_anexos` existe e armazena XMLs.
- `nfeXmlParser.ts` hoje **não lê o bloco `<cobr>/<dup>` nem `<pag>/<detPag>`** — por isso XML de entrada não gera parcelas em Contas a Pagar.
- `useImportacaoXml` (importação em lote) e `useNFeXmlImport` (import unitário no fiscal) **não criam financeiro** — só compras/notas.
- Auditoria de duplicidade: 51 grupos / 108 registros com mesmo `tipo+fornecedor+cliente+valor+vencimento+parcela`. Nenhum grupo vinculado a NF/pedido — todos parecem cadastros manuais ou importação antiga sem origem fiscal.
- Botões "Chave" e "QR/Código" estão em `src/pages/Fiscal.tsx` linhas ~987-1006. Rota `/faturamento` em `App.tsx` aponta para `pages/Faturamento.tsx`, e há item "Faturamento" no menu (`src/lib/navigation.ts` linha 196).

## 1. Inativar funções (Em breve)

- **Fiscal — botões "Buscar por chave" e "Ler QR/Código"**: manter o componente, mas desabilitar o botão (`disabled`), trocar tooltip para "Em breve" e adicionar Badge `Em breve` discreto. Não remover `BuscarPorChaveDialog` nem `FiscalChaveScannerDialog`.
- **Módulo Faturamento**:
  - Manter rotas `/faturamento*` registradas (não remover componentes).
  - Substituir o conteúdo de `pages/Faturamento.tsx` por uma página informativa "Em breve" (reutiliza `EmptyState` + `ModulePage`), preservando o arquivo original como `Faturamento.legacy.tsx` para retomar depois.
  - No menu (`navigation.ts`), adicionar flag `comingSoon: true` no item Faturamento (renderiza Badge "Em breve" e impede navegação ativa) — segue padrão da memória `[Configurações Mobile]` para itens futuros. Se a sidebar não suportar a flag hoje, marcar via prefixo no `title` "Faturamento (em breve)" e tornar item não clicável.
- "Notas de Saída" em `/fiscal?tipo=saida` permanece operacional (não confundir com Faturamento).

## 2. Importação XML de NF-e → gerar Contas a Pagar

Estender `src/lib/nfeXmlParser.ts` para extrair:
- `<cobr><fat>`: `nFat`, `vOrig`, `vDesc`, `vLiq`.
- `<cobr><dup>` (lista de duplicatas): `nDup`, `dVenc`, `vDup`.
- `<pag><detPag>`: `tPag` (mapear código SEFAZ → forma de pagamento — 01 Dinheiro, 03 Cartão Crédito, 04 Cartão Débito, 15 Boleto, 17 PIX, etc.), `vPag`.

Novo type `NFeData.cobranca = { duplicatas: NFeDuplicata[]; formaPagamento?: string; aVista: boolean }`.

No fluxo `useNFeXmlImport` (Fiscal — import unitário):
- Após persistir a `nota_fiscal` de entrada, se `cobranca.duplicatas.length > 0` chamar nova RPC `gerar_financeiro_nfe_entrada(p_nota_id uuid)` que insere N lançamentos em `financeiro_lancamentos` (tipo `pagar`, fornecedor da NF, `nota_fiscal_id`, `parcela_numero/parcela_total`, `valor`, `data_vencimento`, `origem_tipo='nfe_entrada'`, `origem_id=nota.id`, `forma_pagamento` derivada do `<pag>` ou "boleto" se houver `<dup>` sem `<pag>`).
- Idempotência: a RPC checa se já existe lançamento com `(nota_fiscal_id, parcela_numero)` e faz `ON CONFLICT DO NOTHING` (índice único parcial novo).
- Se XML não trouxer duplicatas claras: NÃO gerar nada e mostrar toast "Importação concluída — informe a condição financeira manualmente".
- Pré-visualização: o `TraducaoXmlDrawer` ganha uma seção "Parcelas que serão geradas" antes de confirmar.

Mesmo tratamento aplicado em `useImportacaoXml` (lote) — chama a mesma RPC após inserir cada compra.

## 3. Boleto = DDA

- Criar utilitário `normalizeFormaPagamento(raw)` em `src/lib/financeiro.ts`: regras de canônização (lowercase, trim, sinônimos). Retorna enum `'dinheiro'|'pix'|'boleto_dda'|'cartao_credito'|'cartao_debito'|'transferencia'|'cobranca_automatica'|'debito_automatico'|'outros'`. "boleto" e "dda" colapsam em `boleto_dda` (label "Boleto/DDA").
- Migration: `UPDATE financeiro_lancamentos SET forma_pagamento='boleto_dda' WHERE lower(forma_pagamento) IN ('boleto','dda')`. Idem para variações de cartão.
- Form de lançamento manual e geração via XML usam o enum canônico. Label exibida sempre "Boleto/DDA".

## 4. Cadastro de Cartões de Crédito

Nova tabela `cartoes_credito`:
```
id uuid pk, nome text not null, banco_id uuid fk bancos, bandeira text,
ultimos4 text check(ultimos4 ~ '^\d{4}$' or ultimos4 is null),
limite numeric(14,2), dia_fechamento int check(1..31),
dia_vencimento int check(1..31), ativo bool default true,
observacoes text, created_at, updated_at, empresa_id uuid
```
RLS igual ao padrão dos outros cadastros financeiros (admin/financeiro). Trigger `chk_cartao_dias` valida coerência.

UI:
- Nova página `src/pages/CartoesCredito.tsx` seguindo padrão `ContasBancarias.tsx` (DataTableV2 + ContaBancariaDrawer-like + FormModal).
- Service `src/services/cartoesCredito.service.ts` (list/create/update/inativar/inUseCounts).
- Item de menu sob Financeiro → "Cartões de Crédito" (após "Contas Bancárias").

## 5. Faturas de Cartão

Nova tabela `cartao_faturas`:
```
id uuid pk, cartao_id uuid fk cartoes_credito, competencia text (YYYY-MM),
data_abertura date, data_fechamento date, data_vencimento date,
valor_total numeric default 0, status text check in ('aberta','fechada','paga','vencida'),
created_at, updated_at, unique(cartao_id, competencia)
```
- Function SQL `cartao_fatura_para_data(cartao_id, data) returns uuid`: identifica/cria a fatura correta com base em `dia_fechamento`/`dia_vencimento`. Cria sob demanda.
- View `vw_cartao_fatura_totais` agrega lançamentos por fatura.

## 6. Lançamento financeiro com Cartão

- Adicionar coluna `cartao_id uuid` e `cartao_fatura_id uuid` em `financeiro_lancamentos` (nullable, FK).
- `FinanceiroLancamentoForm`: quando `forma_pagamento === 'cartao_credito'`, exibir Select obrigatório de cartões ativos. Calcular `data_vencimento` chamando `cartao_fatura_para_data(cartao_id, data_emissao)` e amarrar `cartao_fatura_id`.
- Parcelado: gerar N lançamentos, cada um amarrado à fatura do mês correspondente (mês +1, +2... a partir da data_emissao + ciclo do cartão).
- Recalcular ao trocar cartão/data; preservar override manual de vencimento (com confirm).
- Drawer e DataTable mostram cartão e fatura (chips).

## 7. Contas bancárias vinculadas a fornecedores

- Adicionar coluna `fornecedor_id uuid` em `bancos` (nullable; backfill quando nome bater por unaccent + lower com `fornecedores.nome_razao_social/nome_fantasia`).
- `ContaBancariaDrawer`/Form: campo `AutocompleteSearch` de fornecedores (filtra por nome/CNPJ) — opcional na criação, com toggle "criar fornecedor banco" usando `QuickAddSupplierModal`.
- Sem match seguro, deixar pendente (campo vazio + chip "Vincular fornecedor"). Não cria fornecedor automaticamente.
- C6 e RecargaPay já existem em `bancos`; ficarão pendentes para vínculo manual.

## 8. Filtro Forma de Pagamento no Grid

- `useFinanceiroFiltros`: adicionar `formaPagamentoFilters` (multi), opções derivadas do enum canônico, querystring `forma`.
- Filter chip + AdvancedFilterBar slot.
- Aplicado em `filteredData`. Funciona com Contas a Pagar e a Receber (mesmo grid).

## 9. Auditoria e remoção definitiva de duplicidades

Migration de auditoria executada uma vez (idempotente):
1. Cria `audit_dups_lancamentos` (snapshot técnico antes de qualquer DELETE) com critérios e IDs.
2. Detecta duplicidades CLARAS:
   - Mesmo `tipo` + (`fornecedor_id` ou `cliente_id`) + `valor` + `data_vencimento` + `parcela_numero` + (`nota_fiscal_id` ou `pedido_compra_id` ou `origem_id`) iguais E `ativo=true`.
   - Em cada grupo: se houver lançamento com `status='pago'/'parcial'` ou com `financeiro_baixas`, **mantém esse**. Demais sem baixa → DELETE definitivo.
   - Se nenhum baixado: mantém o mais antigo (`created_at`) e DELETE definitivo dos demais.
   - Se 2+ baixados: NÃO toca; vai para fila de revisão manual.
3. Casos sem origem fiscal (manuais com mesmo valor/venc/forn): NÃO remover automaticamente — apenas listar em `audit_dups_lancamentos` para conferência.
4. Snapshot dos 51 grupos atuais será analisado e exposto em `/financeiro?audit=duplicidades` (página interna admin) com botão "Confirmar remoção" (somente admin) que executa RPC `purge_dups_confirmado(grupo_id)` — evita remoção sem revisão humana.

Relatório final exposto na própria tela: total encontrado, removido, mantido, pendente revisão.

## 10. Migrations consolidadas

Uma migration única (transacional) cria:
1. Coluna `bancos.fornecedor_id`
2. Tabelas `cartoes_credito`, `cartao_faturas`
3. Colunas `financeiro_lancamentos.cartao_id`, `cartao_fatura_id`
4. Índice único parcial `uniq_lanc_nfe_parcela on financeiro_lancamentos(nota_fiscal_id, parcela_numero) where nota_fiscal_id is not null`
5. RLS + policies (admin/financeiro write, todos autenticados read — espelhando padrão atual)
6. Functions `cartao_fatura_para_data`, `gerar_financeiro_nfe_entrada` (SECURITY DEFINER, `set search_path=public`)
7. Tabela `audit_dups_lancamentos`
8. UPDATE de canonização `forma_pagamento`

## 11. Aderência a padrões

- Wrappers V2 (DataTable, ViewDrawerV2, FormModal, AdvancedFilterBar, StatusBadge, SummaryCard) em todas as telas novas.
- `useSupabaseCrud` para CRUD simples; RPCs via `supabase.rpc` com tipos em `src/types/rpc.ts`.
- Rotas/permissões: `cartoes_credito` reaproveita resource `financeiro` (action `editar` para criar). Auditoria sob `admin`.
- Sem soft delete para duplicidades claras (DELETE real). Botões "Em breve" não removem código — apenas desabilitam UX.

## 12. Testes manuais previstos

XML com `<cobr><dup>` × 3 → 3 lançamentos. XML sem cobrança → 0 lançamento + toast. Boleto → label "Boleto/DDA". Cartão criado, lançamento parcelado em 3 cria 3 faturas. Filtro forma de pagamento combina com período/status. Auditoria mostra 51 grupos pré-existentes; admin confirma remoção.

## 13. Pendências assumidas para revisão pós-aprovação

- Lista final dos 51 grupos só é purgada após revisão manual no painel — não removeremos cegamente nesta entrega.
- A página `Faturamento.tsx` atual será preservada como `.legacy.tsx`. Confirmar se pode ficar dentro do repo ou se prefere renomear pasta.
- Mapeamento `tPag` SEFAZ → enum interno seguirá tabela oficial; casos não mapeados caem em `outros`.

Após sua aprovação, executo as migrations, refatoro o parser, atualizo hooks/services/UI e entrego os relatórios pedidos no item 13 do briefing.
