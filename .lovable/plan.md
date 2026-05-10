# Onda 42h — Drawer de Sócios (refinamento UX/UI)

Escopo: apenas `src/components/socios/SocioDrawer.tsx`. Sem alterações em `ViewDrawerV2`, `DrawerSummaryCard`, `StatusBadge` ou serviços/hooks.

## Alta prioridade

### 1. Chips de contexto no topo (status + vigência + entrada)
Logo abaixo do CPF (via `subtitle` do `ViewDrawerV2`), exibir uma linha de chips:
- `StatusBadge` com `socio.ativo ? "ativo" : "inativo"`
- Se houver `participacaoVigente` sem `vigencia_fim`: chip "Participação vigente · X,XX%" (Badge `secondary`)
- Se houver `data_entrada`: chip "Desde dd/mm/aaaa" (Badge `outline`)

O subtitle continuará carregando o CPF (formatado via `cpfMask` quando válido), e abaixo dele a linha de chips.

### 2. KPIs sem truncamento
Renomear labels dos `DrawerSummaryCard`:
- "Participação atual" → "Participação"
- "Pró-labore (acum.)" → "Pró-labore"
- "Bônus + Distribuição" → "Bônus / Distrib."
- "Total retirado" → "Total retirado" (mantém)

### 3. Aba Participações — coluna "Fim" → "Situação"
Trocar o cabeçalho `Fim` por `Situação`. Render:
- Sem `vigencia_fim`: `<Badge variant="default">Vigente</Badge>`
- Com `vigencia_fim`: texto "Encerrada em dd/mm/aaaa" (muted)

### 4. Empty states melhores

**Retiradas vazias:** substituir a `<tr>` de "Nenhuma retirada registrada" por `DetailEmpty` (importado de `@/components/ui/DetailStates`) com:
- title: "Sem retiradas registradas"
- description: "Pró-labore, bônus e distribuição aparecem aqui quando forem lançados."
- action: botão `Abrir Sócios e Participações` (mantém o `RelationalLink` atual, mas migrado para dentro do empty state). O texto auxiliar e o link superior são removidos quando a lista está vazia, eliminando a competição visual.

**Observações vazias:** substituir o bloco atual por `DetailEmpty`:
- title: "Nenhuma observação registrada"
- description: "Use observações para armazenar acordos, histórico ou notas relevantes sobre o sócio."
- action: se `onEdit`, botão "Editar sócio".

**Participações vazias:** trocar a `<tr>` por `DetailEmpty` no lugar da tabela quando `participacoes.length === 0`.

## Média prioridade

### 5. Reduzir redundância no Resumo
- Remover o `ViewField` "Nome" do bloco "Identificação" (já está no header).
- Aplicar `cpfMask` no campo "CPF".
- No grid restante de Identificação, manter 2 colunas com: CPF, E-mail, Telefone, Data de entrada, Data de saída.

### 6. Estados vazios em "Recebimento"
Substituir o fallback `"—"` por textos mais claros, mantendo a semântica:
- E-mail/Telefone/Chave Pix: "Não informado"
- Banco/Agência/Conta/Tipo de conta: "Não cadastrado"

Os valores vazios passam a ser renderizados como `<span className="text-muted-foreground italic">Não informado</span>` para diferenciar visualmente de dados preenchidos.

### 7. Hierarquia do botão Editar
Manter o botão em `actions` do `ViewDrawerV2` (já alinhado ao header), porém:
- Promover de `variant="outline"` para `variant="default"` (ou `secondary`) para reforçar protagonismo, mantendo `size="sm"`.
- Sem mudança estrutural — o slot `actions` já posiciona ao lado do bloco do header.

## Baixa prioridade
- Hierarquia visual: aumentar `space-y-5` → `space-y-6` entre `ViewSection`s do Resumo (mudança mínima, sem CSS novo).

## Fora de escopo
- Mudanças em `ViewDrawerV2`, `DrawerSummaryCard`, `StatusBadge` ou no contrato de status global.
- Ícones por seção (depende de revisão do design system para `ViewSection`).
- Prévia de observação no Resumo (cross-tab, fica para onda futura).
- Histórico de retiradas com agrupamento por competência (mudança estrutural).

## Verificação
- `tsc --noEmit` limpo (build automático do harness).
- Inspeção visual em `/socios` abrindo um sócio com e sem retiradas/observações.
