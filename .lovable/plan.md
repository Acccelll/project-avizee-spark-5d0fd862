## Onda 24 — Refinos mobile do formulário de Clientes

Foco no uso mobile do `FormModal` de cliente: navegação por abas, densidade de campos, CTAs do empty state e estados do botão Salvar. Frontend apenas, sem mudanças de schema/RLS.

Arquivos:
- `src/pages/Clientes.tsx` (form do cliente)
- `src/pages/clientes/components/ClienteEnderecosTab.tsx` (CTA central no empty state)
- `src/pages/clientes/components/ClienteComunicacoesTab.tsx` (header empilhado mobile)
- `src/index.css` (utilitário `.scrollbar-hide` + máscara de fade lateral)

### 1. TabsList scrollável sem barra cinza (alta)

Hoje a `TabsList` usa `overflow-x-auto` que mostra scrollbar nativa. No mobile fica visualmente ruim e algumas labels (`Ender...`, `Comun...`) cortam.

- Adicionar utilitário global em `src/index.css`:
  ```css
  .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .tabs-fade-mask { mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent); }
  ```
- Em `Clientes.tsx`, na `TabsList` do form de cliente: trocar `overflow-x-auto` por `overflow-x-auto scrollbar-hide tabs-fade-mask` e adicionar `gap-1` + nas `TabsTrigger`s `whitespace-nowrap shrink-0 min-w-[5.5rem] justify-center` para evitar truncamento e dar área de toque maior.
- Centralizar a aba ativa ao trocar via `useEffect` que ouve `activeTab` e chama `el.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" })` no trigger ativo (precisa converter as `Tabs` para controladas — `value={activeTab}` + `onValueChange={setActiveTab}` com estado local; o `defaultValue` atual é "dados-gerais").

### 2. Dados Gerais — Tipo de Pessoa em linha própria no mobile (alta)

A grid é `grid-cols-1 md:grid-cols-3`, então no mobile cada campo já fica full-width. O problema visual reportado é em tablet (md ≥ 768). Ajuste:
- Tipo de Pessoa: `col-span-2 md:col-span-1` para reservar largura útil em telas estreitas.
- CPF/CNPJ: manter `md:col-span-1` mas garantir que o botão lupa não comprima o input (envolver em `flex-1` no `MaskedInput`).

### 3. Placeholders mais curtos no mobile (alta/média)

Detectar `isMobile` (já existe `useIsMobile()`) e trocar:
- Pessoa de Contato: `"Nome do responsável pelo contato comercial"` → mobile `"Nome do contato"`.
- Nome/Razão Social: manter — já é curto no mobile via `tipo_pessoa === "J" ? "Razão social" : "Nome completo"` se for mobile.
- Textarea Observações: mobile `"Notas internas..."`.

### 4. Endereço — campos com largura útil no mobile (alta)

Reordenar para layout vertical em mobile (já é grid-cols-1 no mobile, então o problema é tablet). Ajustar grid para tablet:
- Trocar `grid-cols-1 md:grid-cols-3` por `grid-cols-1 sm:grid-cols-6` e atribuir spans adequados:
  - CEP: `sm:col-span-2`
  - Logradouro: `sm:col-span-4`
  - Número: `sm:col-span-2`
  - Complemento: `sm:col-span-4`
  - Bairro: `sm:col-span-3`
  - Cidade: `sm:col-span-3`
  - UF: `sm:col-span-2`
  - País: `sm:col-span-4`
- Garante que CEP e Número não fiquem espremidos, e Cidade/Bairro tenham largura adequada.

### 5. Campo País — UX mais clara (baixa)

Trocar o botão "Alterar" inline por padrão dl + `Button` ghost size="sm":
- Estado padrão: input desabilitado mostrando `Brasil` + botão `variant="ghost" size="sm"` com label `Alterar país` ao lado.
- Quando clicado, troca para `Input` editável focado.

### 6. Avançado — cabeçalho mais claro (baixa)

Trocar `<summary>` para incluir chevron e prefixo:
- Texto: `▸ Campos avançados` (com `[&[open]>summary]:before:content-['▾']` ou ícone Lucide `ChevronRight` rotacionado via `group-open:rotate-90`).

### 7. Comercial — mantém 3 blocos, "Cadastrar nova forma" compacta (média)

Já existem três headers (Condições, Grupo, Logística). Ajustes:
- O botão "Cadastrar nova forma de pagamento" hoje fica em `col-span-2 flex items-end`, ocupando toda a largura. Trocar para `variant="ghost" size="sm"` alinhado à direita do select de Forma de Pagamento (mesma linha em md, abaixo em mobile com `text-xs`).
- Limite de Crédito: adicionar microcopy `Deixe 0 para "sem crédito aprovado"; em branco para "não definido".` abaixo do input.

### 8. Comunicações — header empilhado no mobile (alta)

Em `ClienteComunicacoesTab.tsx` (linha ~110), o `flex items-center justify-between` quebra mal:
- Trocar para `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3`.
- O botão `Nova Comunicação` ganha `w-full sm:w-auto` no mobile.

### 9. Entregas — CTA central no empty state (média)

Em `ClienteEnderecosTab.tsx`, dentro do bloco `enderecos.length === 0`:
- Substituir o último parágrafo (`Clique em Incluir...`) por um `Button` `variant="default"` `className="w-full sm:w-auto"` que dispara o mesmo `onClick` do botão Incluir do topo:
  ```tsx
  <Button onClick={openCreateEndereco} className="w-full sm:w-auto gap-1.5">
    <Plus className="h-4 w-4" /> Incluir endereço de entrega
  </Button>
  ```
- Extrair a função `openCreateEndereco` para compartilhar entre o botão do topo e este CTA.

### 10. Botão Salvar — desabilitar quando não há alterações (média)

Em `Clientes.tsx`, no `FormModalFooter`:
- Trocar `disabled={Object.keys(formErrors).length > 0}` por:
  ```ts
  disabled={Object.keys(formErrors).length > 0 || (mode === "edit" && !isDirty)}
  disabledReason={
    Object.keys(formErrors).length > 0
      ? "Corrija os erros do formulário antes de salvar."
      : (mode === "edit" && !isDirty ? "Nenhuma alteração para salvar." : undefined)
  }
  ```

### 11. Footer mais compacto no mobile (baixa)

No `FormModal.tsx` o footer já tem `py-3` + safe-area. Sem mudanças aqui (já está compacto). O `FormModalFooter` já usa `max-sm:w-full max-sm:h-11`. Manter como está.

### Fora de escopo

- Múltiplos contatos por cliente (mudaria schema).
- Refator de `FormModal` shell.
- Indicadores de pendência DENTRO de cada aba (texto "Pendências desta seção: ..."); os ícones nos triggers já cobrem o essencial.
- Separar "Nova Comunicação" em fluxo isolado (já é dialog próprio internamente).

### Detalhes técnicos

- Adicionar `useState` para `activeTab` no form de cliente, com `useRef<HTMLDivElement>` para a TabsList. Effect que faz `[data-state=active]` scrollIntoView dentro da lista.
- A máscara de fade usa `mask-image` (suporte Safari requer prefixo `-webkit-mask-image`; incluir os dois).
- `.scrollbar-hide` global é seguro — já usado em projetos similares; só afeta elementos onde a classe é aplicada.

### Memórias a registrar

- `mem://produto/tabs-mobile-scroll` — Padrão: TabsList horizontal mobile usa `scrollbar-hide` + `tabs-fade-mask` + min-width por trigger + auto-center do ativo.
- `mem://produto/cliente-form-mobile` — Regra: empty states críticos (Entregas) repetem CTA central; headers de tabs internos empilham no mobile (`flex-col sm:flex-row`).
