## Onda 29 — Fornecedor mobile: cortes, overflow e densidade

Foco: deixar o modal de criar/editar fornecedor confortável em viewport ≤390px, sem cortes de título/CNPJ, sem overflow horizontal, com abas e formulários adaptados a coluna única. Sem mudança de regra de negócio.

### 1. Cabeçalho do modal (alta prioridade)
Em `src/pages/Fornecedores.tsx` (props do `<FormModal>`):
- Em mobile, encurtar o título: usar `isMobile ? "Editar" : "Editar Fornecedor"` (e `"Novo"` vs `"Novo Fornecedor"`). Mantém significado e libera espaço para o documento.
- Quebra do CNPJ no chip: o `identifier` do `FormModal` aplica truncate. Adicionar `whitespace-nowrap` ao chip de identifier ajustando o `FormModal` (ou — mais seguro — passar `identifier={undefined}` no mobile e renderizar uma linha extra abaixo do título dentro do conteúdo do modal: `CNPJ: 06.143.681/0001-23`).
  - Implementação proposta: ajustar `FormModal` (linha ~104) para que o `<span>` do identifier receba `whitespace-nowrap` e em mobile (≤sm) fique em linha própria via `basis-full` quando dentro do flex-wrap do header.
- Toggle "Fornecedor ativo" no `headerActions`: em mobile, renderizar apenas o `Switch` com `aria-label`, sem o `<span>` de texto (o estado fica visível pelo Switch). Texto continua em desktop.

### 2. Abas scrolláveis (alta)
Substituir o `TabsList` atual (linha ~607) pelo padrão canônico já usado em `Clientes.tsx`:
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
  <TabsList
    ref={tabsListRef}
    className="mb-4 w-full justify-start overflow-x-auto scrollbar-hide tabs-fade-mask gap-1 [&_button]:whitespace-nowrap [&_button]:shrink-0 [&_button]:min-w-[5.5rem] [&_button]:justify-center"
  >
```
- Adicionar estado `activeTab` controlado e `tabsListRef` com `useEffect` que faz `scrollIntoView({ inline: "center", behavior: "smooth" })` no trigger ativo (mesmo padrão de Clientes — copiar utilitário se existir, senão hook local).
- Encurtar label "Dados Gerais" → `Dados` em mobile (manter completo em desktop via `isMobile ? "Dados" : "Dados Gerais"`).
- Memória `tabs-mobile-scroll` já documenta o padrão.

### 3. Aba "Dados Gerais" — coluna única (alta)
Atualmente `grid-cols-1 md:grid-cols-3`. Está correto no mobile, mas o problema é o input do CNPJ + botão "Consultar CNPJ" no mesmo `flex gap-1`, que esmaga ambos.
- Reestruturar o bloco do CNPJ:
  - Linha 1: `MaskedInput` ocupando 100%.
  - Linha 2 (apenas PJ): botão `Consultar CNPJ` com `w-full sm:w-auto`, ícone + texto.
  - Microcopy abaixo, encurtada em mobile: `"Preenche dados pela Receita Federal."` (versão completa só em desktop).
- Inscrição Estadual: já é `space-y-1.5` mas vai para grid de 3 colunas no md+. Em mobile já é coluna única. Garantir `w-full` no Input e adicionar checkbox `Isento` opcional ao lado do label (apenas para PJ). [Inferência: mantemos isento como string "ISENTO" no campo existente — checkbox só preenche/limpa.]
- "Dados principais preenchidos": em mobile, deslocar para abaixo do título da seção (não `ml-auto`) para evitar wrap apertado.

### 4. Aba "Contatos" (média)
- Encurtar placeholders no mobile via `isMobile ? "Nome do contato" : "Nome do responsável pelo atendimento comercial"`.
- Telefone/Celular: já estão em grid responsivo, mas verificar e forçar `grid-cols-1 md:grid-cols-2` (em vez de col-span-3) para não dividir em colunas estreitas.

### 5. Aba "Endereço" (alta padding, média resto)
- Adicionar `pb-24 sm:pb-0` no `TabsContent value="endereco"` (e idealmente em todas as abas) para o último campo não ficar escondido pelo footer sticky. O `FormModal` já tem `max-sm:pb-24` no scroll container — confirmar que está funcionando; se sim, este item vira "no-op". Caso ainda corte, aumentar para `max-sm:pb-28`.
- Manter botão "Buscar" CEP já adicionado na onda anterior.

### 6. Aba "Compras" — overflow horizontal (alta)
O componente `AddProdutoFornecedor` usa `grid-cols-[1fr_110px_140px_auto]` que estoura em 390px.
- Editar `src/components/fornecedores/AddProdutoFornecedor.tsx`:
  ```
  <div className="grid grid-cols-1 md:grid-cols-[1fr_110px_140px_auto] gap-2 md:items-end">
  ```
- Em mobile, renderizar em coluna única:
  - Produto (autocomplete largura total)
  - Preço (largura total)
  - Prazo de entrega (dias) (largura total)
  - Botão `+ Vincular produto` com `w-full md:w-auto`, label completo `"Vincular produto"` (não só ícone) e `h-11` em mobile.
- A lista de produtos vinculados (`modalProdutosForn.map`) — verificar se truncate horizontal causa scroll. Se sim, envolver `min-w-0` nos itens flex.

### 7. Rodapé fixo (média)
Em `FormModalFooter`:
- Reduzir `py-3` do container (no `FormModal.tsx` linha ~144) para `max-sm:py-2`.
- Botão "Cancelar" em mobile: trocar `variant="outline"` por `variant="ghost"` quando isMobile, ou manter outline mas reduzir altura para `h-10`. Decisão proposta: manter outline + `h-11` (touch target), mas reduzir padding vertical do container do footer.
- Indicador "Alterações não salvas": atualmente `flex items-center` com `min-w-0`, quebra em mobile porque divide espaço com botões empilhados. Solução: em mobile, mover o indicador para uma linha própria acima dos botões. Ajustar `FormModalFooter` para `flex-col items-stretch sm:flex-row sm:items-center sm:justify-between` e remover o wrap flex-col-reverse da seção de botões (ou manter, mas remover o ramo `justify-between` em mobile).

### 8. Microcopy & textos auxiliares (baixa)
- Aba Obs.: já encurtada na onda anterior; reavaliar no mobile.
- Tooltips com `Info` continuam, mas em mobile podem virar `popover`/clique (fora de escopo desta onda — tooltip por hover funciona com tap em mobile shadcn).

### Arquivos afetados
- `src/pages/Fornecedores.tsx` — título dinâmico mobile, abas controladas + scroll-into-view, CNPJ em duas linhas, microcopy condicional, coluna única em Contatos, padding extra na aba Endereço, label do toggle.
- `src/components/fornecedores/AddProdutoFornecedor.tsx` — grid responsivo coluna única + botão full-width com label.
- `src/components/FormModal.tsx` — `whitespace-nowrap` no chip de identifier; padding vertical reduzido no footer mobile.
- `src/components/FormModalFooter.tsx` — layout `flex-col` em mobile com indicador "alterações não salvas" em linha separada.

### Fora de escopo
- Validação avançada de Inscrição Estadual.
- Tooltip → popover em mobile (mudança transversal).
- Refatorar abas em accordion (manter scroll horizontal canônico).
- Mudanças no `useCnpjLookup` ou no schema.

### Critérios de aceite (mobile 390px)
1. Título "Editar" / "Novo" não trunca.
2. CNPJ aparece completo em uma única linha (sem quebra no meio do número).
3. Abas roláveis com fade lateral, sem barra cinza, aba ativa centralizada automaticamente.
4. Aba Dados: campo CNPJ ocupa 100% e botão Consultar fica abaixo, full-width.
5. Aba Compras: zero overflow horizontal, botão "+ Vincular produto" visível por completo.
6. Indicador "Alterações não salvas" aparece em linha própria, não compete com os botões.
7. Último campo da aba Endereço fica visível ao rolar até o fim, sem ser coberto pelo rodapé.
