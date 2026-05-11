# Onda 42m — Drawer de Orçamentos

Escopo: apenas `src/components/views/OrcamentoView.tsx` + `src/components/views/ComercialFlowTimeline.tsx` + `src/lib/format.ts` (helper). Sem mudanças em RPC, schema, ou em outros drawers/grids. Reusa `ConfirmDestructiveDialog`/`useConfirmDestructive` (já existentes) para padronizar Cancelar.

## Alta prioridade

### 1. Esconder ações destrutivas no menu secundário (desktop e mobile)
Hoje **Cancelar** e **Excluir definitivamente** aparecem como botões inline no header (desktop) ao lado de Editar/PDF.

- Remover os botões inline `Cancelar` e `Excluir definitivamente` do header desktop (linhas 252-281).
- Manter inline no desktop apenas: `Enviar p/ Aprovação`, `Aprovar`, `Converter em Pedido`, `Criar revisão`, `Ver Pedido`, `PDF`, `Editar`.
- Mover `Cancelar orçamento` e `Excluir definitivamente` exclusivamente para o `DropdownMenu` (já existe — hoje só aparece em mobile via `md:hidden`). Tirar o `md:hidden` do trigger para que o "kebab" `MoreHorizontal` apareça também no desktop, agrupando ações secundárias destrutivas.
- Renomear no dropdown:
  - `Cancelar` → **`Cancelar orçamento`** (item 2 da crítica).
  - Manter `Excluir definitivamente` mas só renderizar quando `useCanHardDelete().canHardDelete` for `true` (gate mais estrito que `isAdmin` — alinhado a `mem://security/gate-hard-delete`).
- Hard delete deve ficar **bloqueado quando há pedido vinculado** (qualquer status). Substituir o `disabled` atual por uma checagem similar à de cancelamento: se `linkedOV` existir (mesmo cancelado, pois o histórico precisa ser preservado), exibir como `disabled` com tooltip "Existe pedido vinculado — não é possível excluir definitivamente".

### 2. Padronizar Cancelar com `ConfirmDestructiveDialog`
Substituir o `ConfirmDialog` atual de cancelamento (linhas 656-699) por `useConfirmDestructive`:

- `verb="Cancelar"`, `entity="orçamento <numero>"`, `terminal=true`.
- `requireReason` = `exigirMotivoCancel` (mantém o flag `comercial.exigir_motivo_cancelamento_orcamento`).
- `sideEffects`: lista contextual:
  - "Status muda para Cancelado e não pode mais avançar no fluxo"
  - quando `selected.public_token`: "O link público continuará válido — revogue manualmente se necessário"
  - quando `selected.status === "aprovado"`: "Aprovação é descartada"
- A RPC `cancelarOrcamento(id, motivo)` continua a mesma; o componente apenas centraliza UI/UX e descarta o estado local `cancelMotivo` + `setDeleteConfirmOpen`.

`PermanentDeleteDialog` já tem confirmação forte (digitar "EXCLUIR") — não muda.

### 3. Mascarar token na aba Vínculos
Trocar a exibição plena do `publicLink` (linha 598) por:

```
{maskedLink}
```

Onde `maskedLink = `${origin}/orcamento-publico?token=••••••••${token.slice(-8)}``.
Adicionar metadados quando disponíveis a partir do `selected`:
- "Link ativo" / "Link revogado" (se houver `public_token_revoked_at` ou flag — caso não exista no schema, omitir; **não** criar coluna).
- "Gerado em <created_at do orçamento>" se não houver coluna dedicada (placeholder simples).
Botões existentes `Copiar link` e `Abrir` ficam (operam sobre o `publicLink` real, não o mascarado). Adicionar um terceiro botão `Regenerar` que chama `ensurePublicToken(selected.id, { force: true })` — **só** se o serviço já aceitar esse parâmetro; caso contrário, deixar como follow-up textual e manter apenas Copiar/Abrir. (Verificar no `orcamentos.service` ao implementar; se não existir, **não** alterar serviço — fora de escopo.)

### 4. Fluxo comercial não pode truncar "Nota Fiscal"
Em `ComercialFlowTimeline`:
- Suportar `shortLabel?: string` na `FlowStep` e renderizar `<span class="hidden xs:inline">{label}</span><span class="xs:hidden">{shortLabel ?? label}</span>` (usar breakpoint `sm:` se `xs:` não existir no tailwind config; verificar e usar `sm:`).
- No `OrcamentoView`, passar `shortLabel`: `Orçamento`, `Pedido`, `NF`.
- No container do timeline, garantir `overflow-x-auto` + `scrollbar-hide` (já existe `overflow-x-auto`); adicionar `min-w-0` no botão para permitir shrink quando precisar.

### 5. Esclarecer Pagamento na aba Condições
Linha 543-549: hoje renderiza `—` quando `pagamento` é null mesmo havendo `prazo_pagamento`. Trocar para:

- Se `pagamento` vazio mas `prazo_pagamento` preenchido → label única **"Condição de pagamento"** com valor `prazo_pagamento`.
- Se `pagamento` preenchido → manter dois campos (Pagamento + Prazo).
- Se ambos vazios → uma linha "Não definida".

## Média prioridade

### 6. Enriquecer aba Resumo
Adicionar (quando disponível no `selected`) na lista chave/valor entre linha 428-452:
- Cliente (com `RelationalLink` para `pushView("cliente", ...)`).
- Status (texto, já que header tem badge — usar `<StatusBadge>` inline pequeno).
- Validade + tempo restante (já existe parcialmente).
- Vendedor/Responsável: `selected.vendedor?.nome` ou `selected.responsavel` se existir no tipo `OrcamentoDetail`. Se não existir, **omitir** (não estender schema).
- Condição/forma de pagamento (resumo do que está em Condições).
- Frete/Modalidade (resumo).
- "Última atualização": `formatDate(selected.updated_at)`.

A lista vira um `dl` semântico com pares — manter visual de duas colunas no desktop e empilhado no mobile (`grid grid-cols-1 sm:grid-cols-2`).

### 7. Itens em cards quando estreito
Renderizar a tabela atual envolvida em `<div className="hidden sm:block">` e adicionar fallback `<div className="sm:hidden space-y-2">` que mapeia `items` em cards:

```
[código mono]  [status pill se houver]
Descrição (line-clamp-2)
Qtd: 80 DZ · Unit.: R$ 29,99
Total: R$ 2.399,20
```

Sem novas dependências; usar `Card`/`div` simples com classes do design system.

### 8. CTA contextual na aba Vínculos
Quando `linkedOV` é `null`:
- Se `canConvertOrcamento(selected.status)` → botão `outline` "Gerar pedido a partir deste orçamento" → abre o mesmo `setConvertConfirmOpen(true)` já existente.
- Se status é `rascunho`/`pendente` → texto auxiliar: "Pedido será liberado após aprovação."
- Se `historico`/`cancelado` → manter texto atual "Nenhum pedido vinculado".

### 9. Formatação de peso
Em `src/lib/format.ts` adicionar `formatWeightKg(value)` → `${(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`.
Trocar `kpiPeso.toFixed(2)` (linha 388) por `formatWeightKg(kpiPeso)` e remover `(kg)` do label do card (`Peso (kg)` → `Peso`).

### 10. Microcopy: "Enviar p/ Aprovação"
Trocar label do botão (linhas 219, 307) para `Enviar para aprovação` no desktop. No mobile (dropdown) já cabe completo.

## Fora de escopo

- Mudanças em RPC `cancelar_orcamento` ou `hard_delete_record`.
- Adicionar colunas (revogação de token, vendedor) ao schema.
- Mudanças em `Orcamentos.tsx` (grid).
- Refator de `PermanentDeleteDialog` ou `ConfirmDestructiveDialog`.

## Arquivos alterados

- `src/components/views/OrcamentoView.tsx` — itens 1, 2, 3, 5, 6, 7, 8, 9, 10.
- `src/components/views/ComercialFlowTimeline.tsx` — item 4 (`shortLabel`).
- `src/lib/format.ts` — item 9 (`formatWeightKg`).

## Validação

- `tsc` limpo; ESLint sem novos warnings.
- QA visual no drawer (1552px e 375px):
  - Desktop: `Cancelar` e `Excluir definitivamente` somem do header e aparecem só no kebab.
  - Mobile: kebab continua único ponto de entrada, `Cancelar orçamento` no lugar de `Cancelar`.
  - Cancelar abre `ConfirmDestructiveDialog` com badge "Ação terminal" e lista de efeitos.
  - Aba Vínculos mostra token mascarado; Copiar/Abrir continuam funcionando.
  - Timeline mostra "NF" em mobile sem cortar; "Nota Fiscal" no desktop.
  - Aba Condições: orçamento sem `pagamento` mas com `prazo_pagamento` mostra "Condição de pagamento: 28 DDL".
  - Card de KPI mostra "6,00 kg".
  - Aba Itens em <640px usa cards.
