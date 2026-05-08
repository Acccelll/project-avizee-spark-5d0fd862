## Refatoração de Produtos para Modal/Drawer (item pendente da Onda 11)

### Contexto e tradeoff

O `ProdutoForm` atual tem **927 linhas**, com 5 abas (Dados Gerais, Estoque, Fiscal, Compras, Observações), tabelas dinâmicas (composição e fornecedores), 2 dialogs auxiliares (Nova UM, Editar Sigla) e validações. Existe ADR e memória explícita (`mem://produto/quando-drawer-quando-pagina`, `docs/adr/002-drawer-vs-pagina.md`) afirmando que **forms com itens dinâmicos devem ser página dedicada** — Produtos é citado como "outlier justificado" exatamente por composição e fornecedores.

Você aprovou opção (c) — todos como modal. Para honrar a decisão **e** preservar usabilidade, proponho a seguinte abordagem cirúrgica:

### Abordagem: Modal "XL" reutilizando ProdutoForm como conteúdo

Em vez de reescrever o form do zero, vou:

1. **Extrair o corpo do `ProdutoForm`** para um componente reutilizável `ProdutoFormBody` (mesmas abas, mesma lógica, mesmos dialogs internos), exportando `header/footer` separadamente.
2. **Criar `ProdutoFormModal`** baseado no padrão `FormModal` (Dialog em desktop, bottom-sheet full-screen em mobile) com tamanho `xl` + altura ampliada (`max-h-[92dvh]`), usando o `ProdutoFormBody`.
3. **Atualizar `Produtos.tsx`** para abrir o modal em vez de navegar (`openCreate`/`openEdit` setam estado local).
4. **Manter as rotas** `/produtos/novo` e `/produtos/:id/editar` como **shims** que redirecionam para `/produtos?new=1` ou `/produtos?editId=:id` — preserva deep-links existentes (e-mails, favoritos, navegação cross-módulo via `pushView`/`useEditDeepLink`).
5. **Atualizar memória e ADR** removendo Produtos da lista de outliers e documentando a nova exceção (modal XL para forms com itens dinâmicos quando o usuário priorizou consistência sobre profundidade de edição).

### Mudanças por arquivo

```text
src/pages/produtos/ProdutoForm.tsx
  → continua existindo como página (usado pela rota legada via redirect),
    mas a maior parte da lógica é extraída para ProdutoFormBody.
src/pages/produtos/ProdutoFormBody.tsx     [novo]
  → todo o JSX/estado/handlers atuais; recebe props { mode, id, onSaved, onCancel, onDirtyChange }.
src/pages/produtos/ProdutoFormModal.tsx    [novo]
  → wrapper FormModal-like (max-w-5xl, max-h-[92dvh]) que monta ProdutoFormBody.
src/pages/Produtos.tsx
  → estado local { open, editingId }; openCreate/openEdit alteram estado em vez de navigate;
    handler do useEditDeepLink redireciona ?editId=/?new=1 para abrir modal direto.
src/routes/cadastros.routes.tsx
  → /produtos/novo e /produtos/:id/editar passam a ser <Navigate to="/produtos?..." replace />.
.lovable/memory/produto/quando-drawer-quando-pagina.md
docs/adr/002-drawer-vs-pagina.md
  → atualizar nota sobre Produtos.
```

### Riscos e mitigações

- **Tamanho do form em mobile** → `FormModal` já vai full-screen em `max-sm`. Mantemos `aria-busy`, validação por aba, toast de erro nas abas com pendência.
- **Composição/Fornecedores em diálogo** → permanecem; o modal mantém scroll interno. Se ficar apertado, abas continuam separando concerns.
- **Deep-links existentes** → preservados via redirect 1:1 (rota antiga → query string).
- **Cache invalidation** → `onSaved` no body chama `queryClient.invalidateQueries(["produtos"])` exatamente como hoje.

### Fora do escopo

- Não toco em validações, schemas, lógica de SKU/codigo_interno, composição, fornecedores nem dialogs internos.
- Não removo `ProdutoForm.tsx` (mantido como entrypoint legado para o redirect funcionar via lazy route).

Posso seguir com essa execução?
