## Refinar modal "Editar Cotação de Compra"

Aplicar as melhorias de UX no modal de criação/edição (`src/pages/CotacoesCompra.tsx`), alinhando ao padrão dos demais modais (`FormModalFooter`, `useEditDirtyForm`, `useBeforeUnloadGuard`) e à doutrina do projeto.

### Alta prioridade

1. **Número como identificador read-only** — em modo edit, deixar de renderizar como `<Input disabled>` e exibir como bloco "Número / CC000003" em fonte mono, sem aparência de campo. Em create continua input editável (gerado por RPC, mas o usuário pode ver/ajustar).
2. **Status fora do grid** — remover o campo Status do grid de 4 colunas. O badge já aparece no header do modal (bloco "Editando CC000003"). Substituir por hint discreto: "Status controlado pelo fluxo da cotação."
3. **Microcopy em Validade** — adicionar texto auxiliar "Data limite para recebimento das propostas (opcional)".
4. **Observações com escopo claro** — renomear label para "Observações internas" + helper "Visível apenas para sua equipe. Não é enviado aos fornecedores."
5. **Indicador de alterações não salvas + guard** — integrar `useEditDirtyForm` + `useBeforeUnloadGuard` e trocar o footer atual por `<FormModalFooter>` (já mostra pill "Alterações não salvas", "Salvando...", desabilita primário sem dirty no edit). Fechar via X / Cancelar pede confirmação se dirty (via `useConfirmDialog`, padrão do sistema).

### Média prioridade

6. **Layout dos itens** — manter linha horizontal no desktop, mas reduzir densidade visual: número em chip pequeno + nome do produto em destaque, qtd/unidade como labels inline ("Qtd: 1 · UN"). Em mobile, manter cards verticais já existentes.
7. **Próximo passo após salvar** — em modo edit (cotação aberta sem propostas), exibir bloco discreto abaixo dos itens:  
   "Próximo passo — Após salvar, registre as propostas dos fornecedores na visualização da cotação."  
   Adicionar ação secundária no footer: **"Salvar e adicionar proposta"** que salva e reabre o drawer com a aba Propostas focada (apenas em edit, quando `propostas_count === 0`).

### Baixa prioridade

8. **Contador em Observações** (max 1000 chars, contador visível).
9. **Tooltip no badge de status** explicando o estado atual (reaproveita `STATUS_VARIANT_MAP`).

### Detalhes técnicos

- Arquivo único editado: `src/pages/CotacoesCompra.tsx`. Hook `useCotacoesCompra` ganha um setter auxiliar para "salvar e abrir propostas" (flag opcional no `handleSubmit`, ou wrapper `handleSubmitAndAddProposal` que chama `submit()` + abre drawer com `addingProposal=true`).
- Substituir o `useState(form)` interno pelo padrão `useEditDirtyForm` (já presente no hook em outros módulos) — pode ser localizado dentro do próprio hook `useCotacoesCompra` para preservar API pública. Alternativa mais barata: derivar `isDirty` no componente comparando `form` contra um snapshot capturado em `openEdit`.
- Footer: trocar o `<div className="flex justify-end gap-2">` por `<FormModalFooter mode={mode} saving={saving} isDirty={isDirty} onCancel={...} submitAsForm formId="cotacao-compra-form" onSaveAndNew={mode==="edit" && !hasPropostas ? handleSaveAndAddProposal : undefined} saveAndNewLabel="Salvar e adicionar proposta" />`.
- Status badge tooltip: usar `Tooltip` do shadcn já existente; reaproveitar `statusLabels` para o conteúdo.
- Sem mudanças em RLS, RPC, schema ou regras de negócio — UI/microcopy apenas.

### Não escopo

- Não alterar o fluxo de aprovação/cancelamento (já tratado no drawer).
- Não mexer no card superior do drawer (já refinado em iteração anterior).
- Não tocar em `CotacaoCompraForm.tsx` (página retirada do fluxo).