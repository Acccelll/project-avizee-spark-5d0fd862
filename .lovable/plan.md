## Onda 28 — Refino do modal Editar/Novo Fornecedor

Arquivo único: `src/pages/Fornecedores.tsx` (bloco `<FormModal>` linhas ~561-996). Sem mudanças de banco, services ou hooks — apenas UI/microcopy.

### 1. Cabeçalho (alta prioridade)
- **Remover redundância Badge × Toggle**: dropar o `status` (StatusBadge) do `FormModal` no modo edição. Manter apenas o toggle no `headerActions`, com label mais explícito: "Fornecedor ativo" / "Fornecedor inativo" (ação, não estado duplicado).
- **Documento contextual**: passar `identifier={cpfCnpjMask(selected.cpf_cnpj)}` já formatado (importar `cpfCnpjMask` de `@/utils/masks`).
- **Meta enxuta**: manter `Cadastrado em` e `Atualizado em`. Mover `Prazo padrão` para fora do meta (ele já aparece na aba Compras) — reduz fragmentação.

### 2. Indicador "Alterações não salvas" duplicado (alta)
- O `FormModal` já mostra o estado quando recebe `isDirty`, e o `FormModalFooter` repete. Desativar no topo: passar `isDirty={false}` ao `FormModal` e manter o status apenas no rodapé (via `FormModalFooter` que já trata).

### 3. Aba Dados Gerais (alta + média)
- **Label dinâmico do documento**: `<Label>{form.tipo_pessoa === "J" ? "CNPJ" : "CPF"}</Label>` (lin 640).
- **Microcopy do Consultar CNPJ** (lin 695): trocar por *"Consulta automática na Receita Federal. Preenche razão social, endereço e contato quando disponíveis, sem sobrescrever campos já preenchidos."*
- **Selo "Dados fiscais preenchidos"** (lin 620-625): trocar para neutro: *"Dados principais preenchidos"* com ícone `CheckCircle2` em `text-muted-foreground` em vez de `text-success` (a validação atual cobre só presença de CNPJ + nome).
- **Indicador de pendências por aba** (média): adicionar pequeno dot `!` em `TabsTrigger` quando houver `formErrors` cujo campo pertença à aba. Mapeamento simples local: `dados-gerais → [cpf_cnpj, nome_razao_social]`, `contatos → [email, telefone, celular]`, `endereco → [cep, uf]`, `compras → [prazo_padrao]`. Renderizar `<span className="ml-1 h-1.5 w-1.5 rounded-full bg-destructive" />` quando aba tiver erro.

### 4. Aba Contatos (média)
- Manter estrutura. Apenas reforçar a microcopy do bloco *"Canais de comunicação"* já está ok. Adicionar nota de roadmap em comentário de código indicando a evolução futura (contato comercial/financeiro/logístico) — sem implementar agora.

### 5. Aba Endereço (média)
- **CEP com botão de busca explícito** ao lado do `MaskedInput` (mantém `onBlur` mas torna a ação visível): botão `outline` `size="sm"` com `Search` + label *"Buscar"* — chama o mesmo handler do `buscarCep`.
- **Texto auxiliar mais claro** (lin 788-790): *"Informe o CEP — os demais campos são preenchidos automaticamente. Você pode editá-los depois."*
- **País como default Brasil**: deixar visualmente menos protagonista — mover para fim do grid (já está) e reduzir width: `md:col-span-1` (em vez de 2). Sem default novo (já vem `"Brasil"` no emptyForm).

### 6. Aba Compras (alta)
- **Microcopy**: renomear *"Vincular Produto Manualmente"* (lin 942) → *"Vincular produto ao fornecedor"*. Renomear label "Lead (d)" no `AddProdutoFornecedor` → "Prazo de entrega (dias)" — editar `src/components/fornecedores/AddProdutoFornecedor.tsx` linhas 53-55 (Label) e ajustar `grid-cols` para acomodar texto maior (`grid-cols-[1fr_110px_140px_auto]`).
- **Lista de produtos vinculados já existe** (lin 946-969) — já atende o ponto 9.4. Apenas adicionar header "Itens fornecidos (N)" acima do bloco quando `modalProdutosForn.length > 0`.
- **Chip "Aplica-se a compras e financeiro"** (lin 859-861): integrar ao parágrafo introdutório como texto natural, removendo o chip avulso. Novo parágrafo: *"Condições comerciais padrão deste fornecedor — aplicadas automaticamente em cotações, pedidos de compra e títulos financeiros. Podem ser sobrescritas por operação."*

### 7. Aba Observações (média)
- Encurtar texto auxiliar (lin 977-981) → *"Observações internas sobre o fornecedor. Use este campo para registrar condições negociadas, restrições e histórico de relacionamento."*

### 8. Estado "Novo Fornecedor" vs "Editar" (alta)
- O título já alterna corretamente. Garantir que **no modo `create`** nada de `meta`, `identifier`, `status` e `headerActions` (toggle) seja renderizado — já está condicionado a `mode === "edit"`. Adicionar o `createHint` mais específico ao modo create (ok).
- Botão primário no `create`: o `FormModalFooter` com `mode="create"` já mostra "Salvar". Trocar `primaryLabel` para *"Criar Fornecedor"* no rodapé apenas quando `mode === "create"`.

### Resumo técnico de edição
- `src/pages/Fornecedores.tsx`: bloco `<FormModal>` (props `status`, `meta`, `isDirty`); aba Dados Gerais (label dinâmico, microcopy, selo neutro); pendências por aba em `TabsList`; aba Endereço (botão Buscar CEP, texto, país); aba Compras (microcopy, integração do chip, header da lista); aba Obs (texto curto); footer (`primaryLabel` condicional).
- `src/components/fornecedores/AddProdutoFornecedor.tsx`: label "Prazo de entrega (dias)" e grid widths.
- Importar `cpfCnpjMask` de `@/utils/masks` em `Fornecedores.tsx`.

### Fora de escopo
- Múltiplos contatos (comercial/financeiro/logístico) → roadmap, fica como comentário.
- Validação fiscal "real" do badge → mantém como "Dados principais preenchidos".
- Mudanças no `FormModal` base ou no `FormModalFooter`.
