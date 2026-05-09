## Onda 26 — Mobile do grid de Fornecedores

Foco: tirar redundâncias, padronizar o card mobile e melhorar a paginação. Tudo em `src/pages/Fornecedores.tsx` (mais um pequeno ajuste em `MobileQuickAddFAB` se necessário). Sem mudanças de regra de negócio nem de schema.

### 1. CTA único no mobile (alta prioridade)
- Manter o botão **Novo Fornecedor** do header (já adaptado para `w-full` em mobile pelo `ModulePage`).
- Remover o `<MobileQuickAddFAB />` desta tela. O FAB hoje duplica a mesma ação do header e compete com a paginação no rodapé.
- `quickAddOpen`/`QuickAddSupplierModal` continuam disponíveis caso outros pontos disparem (manter o estado, só não renderizar o FAB).

### 2. Cards-resumo: 3 visíveis no mobile, sem truncar (alta)
Hoje só `Total` e `Ativos` aparecem no mobile; `Sem contato` está em `hidden md:contents`. O ideal operacional é mostrar 3 cards com rótulo curto.
- Layout: `grid-cols-3` no mobile (já existe `md:grid-cols-4` no `ModulePage`). Os 3 cards visíveis em mobile passam a ser:
  1. **Total** (shortTitle) / "Total de Fornecedores" no desktop
  2. **Ativos**
  3. **Sem contato** (warning quando > 0) — promover para visível no mobile
- "Cadastro incompleto" continua em `hidden lg:contents` (4º card no desktop largo).
- Usar a prop existente `shortTitle` do `SummaryCard` para evitar truncamento ("Total de F…").

### 3. Busca com placeholder curto no mobile (alta)
- `AdvancedFilterBar.searchPlaceholder` passa a ser dependente do `useIsMobile`:
  - mobile: `"Buscar fornecedor..."`
  - desktop: mantém `"Razão social, CNPJ, e-mail ou cidade"`.

### 4. Card mobile padronizado (alta)
Reorganizar a coluna `mobilePrimary` (`nome_razao_social`) para ficar previsível e remover a duplicação do badge "Sem contato" que hoje aparece tanto na linha do nome quanto na coluna `contato_principal`.

Estrutura final do card (ordem de leitura):

```text
Linha 1  Nome / Razão social                    ⋮ (menu)
Linha 2  Nome fantasia · Cidade/UF
Linha 3  CNPJ formatado (mono)
Linha 4  [PJ] [Ativo] [Sem contato?] [Sem CNPJ?]
Rodapé   ações rápidas contextuais
```

Mudanças concretas:
- Na coluna `nome_razao_social`: remover os dois `Badge`s inline ("Sem contato" e "Sem CNPJ") da linha do nome — eles passam para a Linha 4 (badge row).
- Adicionar uma nova coluna `mobileCard` "Indicadores" que consolida em uma única linha de chips: `Pessoa (PF/PJ)`, `Status (Ativo/Inativo)`, `Sem contato` (se aplicável), `Sem CNPJ` (se aplicável). Isso elimina a duplicação descrita no item 6 do feedback e atende ao item 8 (status visível por linha).
- Coluna `tipo_pessoa` continua existindo para a tabela desktop, mas ganha `hidden: true` no contexto mobile (não duplicar com o chip da Linha 4). Como `DataTable` filtra por `mobileCard`/`mobilePrimary`, basta não marcar `tipo_pessoa` como `mobileCard` (já é o caso) e remover seu `Badge` redundante da Linha 1.
- Coluna `contato_principal`: remover o estado "Sem contato" daqui (passou para a badge row). Quando há contato, mantém telefone + e-mail com ícones.

### 5. Rodapé contextual do card (média)
Hoje todo card mostra o `ContactInlineActions` (Ligar, WhatsApp, E-mail, Ver). Quando o fornecedor está sem contato, sobra só o "olho" e o card fica vazio.
- Manter `mobileInlineActions={ContactInlineActions}` quando há `phone || email`.
- Quando **não há contato**, trocar por um CTA contextual: botão `outline` "Adicionar contato" que abre `openEdit(f)` direto na aba/posição do telefone (no momento basta abrir `openEdit(f)`; a aba "Contato" pode ser refinada depois).
- Implementação: criar uma função inline em `mobileInlineActions` que decide qual variante renderizar.

### 6. Paginação compacta + safe area (média)
- Sem FAB (item 1), o rodapé deixa de competir, mas a paginação ainda fica "solta".
- Trocar o `paginationMode` default do `DataTable` para `"infinite"` apenas no mobile (a prop já existe). Em desktop, manter paginação. Como `paginationMode` é controlado pelo `DataTable` via toggle, basta passar `mobilePaginationMode="infinite"` se existir; se não existir essa prop, adicionar uma checagem mínima ou manter paginação compacta.
- Verificar suporte real em `src/components/DataTable.tsx` (linhas 841/868 já alternam entre `pagination` e `infinite`). Se não houver prop específica para forçar por viewport, manter paginação tradicional e apenas adicionar `pb-safe` ao container do `DataTable` mobile para respirar.

### 7. Microcopy e badges
- `addLabel` no header continua "Novo Fornecedor".
- `unidade` da `AdvancedFilterBar` mantém "fornecedores".

### Itens fora desta onda (registrados para waves futuras)
- Reduzir densidade da topbar (item 14): é AppLayout global, escopo separado.
- Sinais adicionais (Transportadora / Serviço / Produto): depende do campo `tipo_fornecedor`, registrado na onda 25 como futuro.
- Aba "Contato" em deep-link no `openEdit`: requer parametrização do `FormModal`.

### Arquivos a editar
- `src/pages/Fornecedores.tsx` — colunas (`nome_razao_social`, `tipo_pessoa`, `contato_principal`, nova "Indicadores"), `summaryCards`, `searchPlaceholder` responsivo, remoção do `MobileQuickAddFAB`, `mobileInlineActions` condicional.
- (opcional) `src/components/SummaryCard.tsx` — apenas se faltar suporte a `shortTitle` no breakpoint usado (já existe).

### Critérios de verificação
- Mobile (390px): 3 cards-resumo visíveis sem truncar; busca curta; nenhum FAB; cards exibem nome → fantasia·cidade/UF → CNPJ → chips → rodapé contextual; "Sem contato" aparece uma única vez.
- Desktop: comportamento inalterado (4 colunas no `lg`, paginação tradicional, ações inline preservadas).
- Sem regressão de testes (`useSupabaseCrud`, masks).
