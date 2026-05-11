## Objetivo

Tornar o **Drawer de Cotação de Compra** mais acionável e claro, conforme o feedback. Foco em UI/UX (frontend). Sem alterações de RPC, RLS ou regras de negócio.

## Mudanças por arquivo

### 1. `src/components/compras/CotacaoCompraDrawer.tsx`

**Header / actions (topo):**
- Adicionar **ação principal contextual** (botão primário) baseada no estado:
  - `aberta`/`em_analise` + `viewPropostas.length === 0` → **"+ Adicionar proposta"** (abre a aba Propostas e dispara o form do primeiro item via `setAddingProposal`).
  - `aberta`/`em_analise` + `propostas > 0 && !allItemsHaveSelected` → **"Selecionar fornecedor"** (muda para aba Propostas).
  - `aguardando_aprovacao` → **"Aprovar"** (já existe no footer; manter no topo para destaque).
  - `aprovada` + `allItemsHaveSelected` → **"Gerar pedido de compra"** (já cobre o caso atual).
- Manter **Editar** como ação secundária (`variant="outline"`).
- **Mover "Excluir"** para um menu **"Mais"** (DropdownMenu de `@/components/ui/dropdown-menu` com ícone `MoreVertical`), e usar **`useConfirmDestructive`** (`mem://tech/confirm-destructive-dialog`) com `verb="Excluir"`, `entity="cotação #{numero}"`, `sideEffects=["Remove itens","Remove propostas","Remove histórico vinculado"]`. O `onDeleteOpen` atual continua sendo o gatilho.

**Footer:**
- Renomear botão **"Cancelar"** para **"Cancelar cotação"** (label + aria-label). Manter ícone `Ban` e o fluxo de motivo já existente.
- Não há botão "Fechar" hoje no footer (o drawer fecha pelo X do header), então não há ambiguidade adicional a tratar.

**Aba Resumo:**
- Trocar `selected.data_validade ? formatDate(...) : "—"` por **"Sem validade definida"** quando nulo.
- Adicionar bloco **"Próxima ação"** (card com título + descrição curta + botão), reaproveitando a mesma lógica do CTA do topo. Quando convertida/cancelada/rejeitada, ocultar o bloco.

**Aba Decisão (empty state):**
- Quando `selectedPropostas.length === 0`, expandir o aviso atual com a lista de **critérios futuros**: "menor preço · prazo · fornecedor · observações · condição comercial".
- Trocar o texto `"{n} / {total}"` por **"{n} de {total} item(ns) com proposta selecionada"** (mais amigável).

### 2. `src/components/compras/CotacaoCompraHeader.tsx` (CotacaoCompraHeaderSummary)

- Renomear o card **"Fornecedores"** → **"Fornecedores"** com sublinha: `"{n} com proposta"` (esclarece a ambiguidade do `0`). Tooltip via `Tooltip` explicando "Fornecedores que enviaram ao menos uma proposta".
- Card **"Melhor Total"**: quando `bestTotal === 0`, exibir **"Aguardando propostas"** (texto pequeno em `text-muted-foreground`) no lugar do `—`.
- Stepper: encurtar labels para caber no drawer estreito → **"Cotação · Análise · Aprovação · Pedido"** (atualizar em `comprasStatus.ts` `COTACAO_FLOW_STEPS` apenas se os labels longos vierem de lá; caso contrário ajustar localmente). Adicionar abaixo do stepper uma linha textual **"Etapa atual: X · Próxima: Y"** (só em telas estreitas, `md:hidden`), reforçando a leitura.

### 3. `src/components/compras/comprasStatus.ts`

- Verificar `COTACAO_FLOW_STEPS` e encurtar `label` se necessário (ex.: `"Em cotação"` → `"Cotação"`, `"Aguardando aprovação"` → `"Aprovação"`). Apenas labels visuais; `key` permanece.

### 4. `src/components/compras/CotacaoCompraPropostasPanel.tsx`

- Reforçar empty state quando não há nenhuma proposta no item: bloco com título **"Nenhuma proposta cadastrada"**, descrição **"Adicione uma proposta para comparar fornecedores."** e botão primário **"+ Adicionar proposta"** (atual `Adicionar Proposta` virando CTA mais evidente, `variant="default"` em vez de outline, full width em mobile).

## Fora de escopo

- **Aba Itens enrich** (último custo, fornecedor habitual, estoque atual, prazo desejado, observação por item): exige novos joins/colunas (`produtos.ultimo_custo`, vínculo fornecedor habitual, leitura de `estoque_atual`) e potencial mudança de schema em `cotacao_itens` (campo observação). Fica para um plano separado.
- **Histórico/Exportar** no menu "Mais": dependem de telas/handlers ainda não existentes.
- Mudanças no contrato de status ou novas RPCs.

## Detalhes técnicos

- Usar tokens semânticos (`text-muted-foreground`, `bg-warning/5`, etc.) — sem cores hardcoded.
- Botão principal contextual reutiliza handlers já recebidos via props (`setAddingProposal`, `onApprove`, `onGerarPedido`); nenhum estado novo no `useCotacoesCompra`.
- Ação de mudar de aba: o `ViewDrawerV2` controla aba via `defaultTab`; para CTA "Adicionar proposta" no topo/Resumo, podemos passar uma prop `onJumpToPropostas` que altera estado local de `activeTab` (transformar `defaultTab` em controlado, `value`/`onValueChange`).
- Remover deps não usados após mover Excluir para o menu (`Trash2` continua sendo usado no item do menu).
- Build: `tsc` deve ficar limpo. Sem mudanças em testes existentes.

## Arquivos afetados

- `src/components/compras/CotacaoCompraDrawer.tsx`
- `src/components/compras/CotacaoCompraHeader.tsx`
- `src/components/compras/CotacaoCompraPropostasPanel.tsx`
- `src/components/compras/comprasStatus.ts` (apenas labels do stepper, se necessário)
