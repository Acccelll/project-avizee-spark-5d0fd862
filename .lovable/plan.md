## Escopo

Refinos de UX/UI no módulo Logística (`src/pages/Logistica.tsx`) e ajustes pontuais em `useEntregas`/`useRecebimentos`/colunas. Sem mudanças em RLS, RPC, schema, nem no fluxo transacional de criação de remessa/etiqueta. Foco: trocar `—` por estados acionáveis, KPIs clicáveis, CTAs de empty state, microcopy e rastreabilidade visível.

---

## Alta prioridade

### 1. Substituir `—` por estados nomeados nas três abas
Trocar a renderização atual de hífen por chips/labels que indicam pendência, mantendo `text-muted-foreground italic`:

- **Entregas** (`entregaColumns`): `Transportadora` → "Sem transportadora"; `Prev. Entrega` → "Sem previsão"; `Expedição` → "Sem expedição"; `Rastreio` (oculta) → "Sem rastreio".
- **Recebimentos** (`recebimentosColumns`): `Prev. Entrega` → "Sem previsão"; `Recebido em` → "Aguardando".
- **Remessas** (`remessaColumns`): `Rastreio` → "Sem rastreio"; `Postagem` → "Postagem pendente"; `Etiqueta` → "Etiqueta pendente"; `Cliente`/`Transportadora` → "Não definido(a)" quando não houver vínculo.

Implementar via helper local `<MissingChip label="..." />` para padronizar o estilo (font 11px, italic, tom muted) — uso interno, sem extrair para módulo.

### 2. Status de Remessa "Pendente" mais específico
Onde a remessa estiver no status genérico `pendente`, exibir microtexto contextual abaixo do `StatusBadge`, derivado do estado real:
- sem etiqueta emitida → "Etiqueta pendente"
- etiqueta emitida + sem `data_postagem` → "Aguardando postagem"
- etiqueta emitida + `data_postagem` + sem rastreio Correios → "Aguardando coleta"

Não cria novos status no banco — apenas anota o motivo da pendência abaixo do badge usando `etiquetasMap[r.id]` + `r.data_postagem` + `r.codigo_rastreio`. Ordem da cadeia continua sendo definida em `remessaStatusMap`.

### 3. Tornar KPIs clicáveis como filtros rápidos
Adicionar `onClick` em todos `SummaryCard` das três abas, replicando o padrão usado no Estoque:

**Entregas**:
- "Total de Entregas" → limpa filtros
- "Em Transporte" → `setStatusFilters(["em_transporte"])`
- "Atrasadas" → `setPrazoFilters(["atrasado"])`
- "Entregues" → `setStatusFilters(["entregue"])`
- "Pendentes de Expedição" → `setStatusFilters(["aguardando_separacao","em_separacao","separado","aguardando_expedicao"])`

**Recebimentos**:
- Total → limpa; Em Trânsito → `["em_transito"]`; Atrasados → `setPrazoFiltersReceb(["atrasado"])`; Recebidos → `["recebido"]`.

**Remessas**: criar 4 cards no topo (hoje não há) — Total, Aguardando postagem, Em transporte, Entregues. Cada um filtra `remStatusFilters`.

### 4. Botões de etiqueta com microcopy clara
- Botão **"Etiquetas simples"** já mostra contagem `(N)`; quando desabilitado, o `title` atual é fixo. Trocar para `title` dinâmico: "Selecione remessas para gerar etiquetas A4" quando `selectedRemessaIds.length === 0`.
- Botão **"Imprimir etiquetas (4/A4)"**: mostrar contagem útil. Hoje varre `filteredRemessas`; ajustar label para `Imprimir etiquetas filtradas (N)` quando há etiquetas emitidas no filtro, ou desabilitar com `title` "Nenhuma etiqueta emitida nas remessas filtradas" quando 0.

### 5. Rastreabilidade ao alterar status em Entregas
A coluna `Atualizar status` chama `updateEntregaStatus`. Adicionar `useConfirmDialog` antes de transições críticas:

- → **entregue**: confirma e pergunta `data_entrega` (date input); persistir junto.
- → **em_transporte**: avisar se `transportadora` está vazia ("Recomendado vincular transportadora antes — continuar?").
- → **atrasada/devolvida**: pedir motivo (textarea opcional, salvo em `motivo` ou observações da remessa quando aplicável).

A persistência usa o hook `useTransicionarRemessa` existente; campos extras gravados conforme já suportado pelo RPC. Caso o RPC não aceite os campos hoje, registrar apenas como `observacoes` no payload do hook (não criar nova RPC). **Confirmar via leitura de `useTransicionarRemessa` antes de implementar** — se campos não suportados, manter apenas confirmação + toast informativo, sem persistir o motivo.

---

## Média prioridade

### 6. Renomear KPIs/labels para reduzir confusão
- "Total de Entregas" → "Pedidos em entrega"
- Aviso superior de Recebimentos: encurtar para "Esta aba acompanha a logística dos recebimentos. A conferência quantitativa oficial permanece em **Compras**."
- Tooltips dos `TabsTrigger` já existem — manter.

### 7. CTA no empty state de Recebimentos
Estender `DataTable` com prop `emptyAction?: ReactNode` (renderizada dentro de `<EmptyState>`); usar em Recebimentos:

```tsx
emptyAction={<Button variant="outline" size="sm" onClick={() => navigate("/pedidos-compra")}><ExternalLink/> Ver pedidos de compra</Button>}
```

Aplicar também no empty de Remessas: "Nova remessa" (já existe `addLabel` no header, mas o CTA dentro do empty é mais descobrível).

### 8. Última atualização nas Remessas
Adicionar coluna oculta por padrão `updated_at` (label "Atualizada em") em `remessaColumns`, formato `dd/MM/yyyy HH:mm`. Útil para auditoria operacional. Sem alterar select; o campo já vem do `useSupabaseCrud<Remessa>`.

### 9. Ações por linha em Remessas
Já há `onView`/`onEdit` + coluna "Etiqueta simples" + "Rastrear". Adicionar via `rowExtraActions`:
- "Ver pedido" (quando `r.ordem_venda_id` existir): `pushView("ordem_venda", r.ordem_venda_id)`.
- "Informar rastreio" (quando `!r.codigo_rastreio` e `canEdit`): abre `EditableField`/dialog simples para inserir código (reaproveitar drawer de edição via `navigate(/remessas/:id`)`).

### 10. Filtro extra em Recebimentos
Adicionar (se houver dado disponível) filtro por **transportadora** no MultiSelect lateral. Verificar se `Recebimento` já expõe esse campo em `useRecebimentos` antes de implementar; caso contrário, **pular**.

---

## Baixa prioridade

### 11. Tooltips em todos os KPIs
Envolver `SummaryCard` com `Tooltip` informativo (texto curto explicando origem do número).

### 12. Ocultar paginação quando uma única página
Verificar comportamento atual no `DataTable` — provavelmente já oculta. Se aparecer "1 de 1", ajustar via prop existente (sem mexer na lib).

### 13. Microcopy do aviso superior de Entregas
Trocar para: "Visão consolidada por pedido. Para múltiplas remessas, gerencie status na aba **Remessas**."

### 14. Espaçamentos
Reduzir `mb-6` → `mb-4` no grid de KPIs de Recebimentos para alinhar com Entregas.

---

## Detalhes técnicos

- **Arquivo principal**: `src/pages/Logistica.tsx`.
- **Componente alterado**: `src/components/DataTable.tsx` — adicionar prop opcional `emptyAction?: React.ReactNode` repassada ao `<EmptyState>` (verificar se `EmptyState` já aceita action; se não, ajustar o componente também).
- Helpers locais: `MissingChip` (componente interno em `Logistica.tsx`).
- **Reaproveitar**: `useConfirmDialog` (já em uso na página via `confirmDialog`), `pushView` (já em uso).
- Não editar: `useTransicionarRemessa`, `useEntregas`, `useRecebimentos`, RPCs, `remessaStatusMap`, lógica de etiquetas Correios, `EtiquetaSimplesPreviewDialog`.

## O que NÃO está incluído

- Criar novos status de remessa no banco (ex.: `etiqueta_pendente` como enum) — apenas microtexto derivado em UI.
- Implementar campo "responsável por última atualização" — depende de coluna `updated_by` no banco; só exibir `updated_at` se já existir.
- Refazer o flow de impressão de etiquetas A4 (4-up) — escopo já estável.
- Mudar o RPC de transição de entrega para aceitar `data_entrega`/motivo se hoje não aceita — apenas confirmação UI + observações no campo já suportado.
