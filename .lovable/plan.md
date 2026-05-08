## Onda 15 — Refinos do Drawer "Detalhes do Produto"

Foco: reduzir fragmentação no topo, dar profundidade real às abas, melhorar estados vazios, adicionar contadores/indicadores nas abas e uma faixa de "saúde cadastral". Sem mexer no schema do banco.

Escopo de arquivos
- `src/components/views/ProdutoView.tsx` (principal — ~95% das mudanças)
- `src/components/ui/DrawerHeaderShell.tsx` (ajuste fino do close — opcional)
- `src/components/views/RelationalDrawerStack.tsx` (ajuste do `X` se necessário)
- `src/components/precos/PrecosEspeciaisTab.tsx` (apenas estado vazio)

### P1 — Faixa de saúde cadastral/operacional (alta)
Logo acima dos KPIs, adicionar um `HealthStrip` compacto, só renderizado quando houver alertas:

- estoque baixo / sem estoque / não controla
- sem fornecedor vinculado
- fiscal incompleto (NCM/CST/CFOP) com contagem do que falta
- preço de venda zerado
- custo ausente (afeta margem)

Cada item: chip clicável com cor semântica (warning/destructive) e action label ("Completar dados fiscais", "Vincular fornecedor", etc.) que troca para a aba alvo via `setActiveTab`.
Estado tudo OK → não renderiza nada (não polui).

### P2 — Cabeçalho mais "calmo" (alta)
O `DrawerHeaderShell` já tem 3 zonas; refinos:

1. **Close button mais discreto**: trocar `variant="ghost" size="icon" h-7 w-7` por `h-6 w-6 text-muted-foreground hover:text-foreground` em `RelationalDrawerStack.tsx`. Remover qualquer ring forte de focus (manter `focus-visible:ring-1`).
2. **Identidade integrada ao header**: passar `breadcrumb` apenas como `Cadastros › Produtos` (sem repetir SKU). O SKU/código vão para o `meta` do `RecordIdentityCard` (já está). Remover duplicação `Cód:` quando `codigo_interno === sku`.
3. **Ações alinhadas**: agrupar Editar / Excluir e adicionar menu **Mais** (`DropdownMenu`) com ações secundárias: **Duplicar produto**, **Ajustar estoque** (abre `EstoqueMovimentacaoDrawer`), **Inativar/Reativar**. "Excluir definitivamente" só para admin, dentro do menu Mais.

### P3 — Contadores e indicadores nas abas (alta)
Em `TabsList`, cada `TabsTrigger` recebe sufixo discreto:

- `Compras` → `(N)` quando há fornecedores (verde se principal definido)
- `Vendas` → `(N)` quando há histórico
- `Fiscal` → `!` (warning) se incompleto
- `Espec.` → `(N)` quando há regras
- `Estoque` → `!` (destructive) se abaixo do mínimo

Padrão visual: `<span className="ml-1 text-[10px] text-muted-foreground">{n}</span>` ou variante warning/destructive.

### P4 — Aba Geral em grupos visuais (média)
Trocar o grid plano por dois cards/sections:

- **Identificação**: SKU, Código interno, Classificação, Tipo (composto/simples), Status (ativo)
- **Operacional**: Unidade, Grupo, Peso, Variações

Cada grupo com `SectionTitle` e mini-card (`rounded-lg border bg-card p-3`). Campos vazios viram "Peso não informado" (em `text-muted-foreground italic`) em vez de `—` cru.

Composição (quando `eh_composto`) permanece em bloco próprio, mas com title via `SectionTitle`.

### P5 — Aba Compras: estado vazio acionável (alta)
Substituir o `DetailEmpty` atual por estado com CTA:

```
ShoppingCart icon
"Nenhum fornecedor vinculado"
"Vincule fornecedores para registrar custo de compra, código do fornecedor e lead time."
[Vincular fornecedor] → navega para /produtos?editId=ID&tab=fornecedores
```

`DetailEmpty` já aceita action via prop? Se não, adicionar `action?: ReactNode` ao `DetailEmpty`. Verificar antes; se ainda não existir, estender `src/components/ui/DetailStates.tsx`.

### P6 — Aba Preço com profundidade real (alta)
Hoje é só "resumo estendido". Adicionar:

- Linha **Markup** (lado da Margem): `markup = (venda/custo - 1)*100` apresentado como ratio também (ex: 1.85x).
- **Origem do preço**: ler `selected.origem_preco` se existir, senão "Preço manual" (consultar `Tables<"produtos">` para ver campos disponíveis — pode ser apenas "Definido em cadastro").
- **Última atualização**: `formatDate(selected.updated_at)` com tooltip "Última edição do cadastro do produto".
- **Custo médio (compras)** vs **Custo cadastrado**: se diferirem, mostrar diff e CTA "Atualizar custo".
- **Lucro bruto unitário** + **Lucro bruto total estimado em estoque** (`lucroBruto * estoque_atual`).

Layout: card principal com Custo/Margem/Markup/Venda + sub-card "Análise" com lucro/origem/atualização.

### P7 — Aba Fiscal com criticidade real (alta)
- Quando incompleto: faixa `bg-warning/5 border-warning/20` no topo da aba com ícone, **lista do que falta** (`Faltam: NCM, CST`) e CTA `[Completar dados fiscais]` → `navigate('/produtos?editId=ID&tab=fiscal')`.
- Cards individuais (NCM/CST/CFOP) ganham borda warning quando vazios; mantém verde sutil quando preenchido (border-success/20).
- Quando completo: badge verde "Cadastro Completo" mantém-se, sem faixa adicional.

### P8 — Aba Espec. (Preços Especiais): estado vazio rico (média)
Em `PrecosEspeciaisTab`, melhorar empty state:

```
"Nenhuma regra de preço especial definida"
"Crie regras por cliente, grupo, condição comercial ou período."
[Adicionar regra] (CTA já existente, mas integrar ao empty)
```

Mover botão "Adicionar" para ficar alinhado com o título da seção quando há regras; quando vazio, o CTA aparece dentro do empty state.

### P9 — Aba Vendas: lista escaneável (média)
Reorganizar cada item em 2 linhas com hierarquia clara:

```
Linha 1: Cliente (link) ............ Total (R$ X,XX, font-mono semibold)
Linha 2: NF nº · data · Qtd × valor unitário
```

Cliente vira a "âncora" visual. NF (`RelationalLink`) e data ficam menores na segunda linha. Adicionar mini-resumo "Total no período" no rodapé da lista (sum de todos os totais).

### P10 — Aba Estoque (refino menor)
Adicionar abaixo dos cards Estoque Atual / Mínimo:
- **Reservado** (se houver campo `estoque_reservado`)
- **Disponível** = atual − reservado

Se campos não existirem no schema, pular silenciosamente.

### Detalhes técnicos

- **State de aba ativa**: hoje `defaultValue="geral"`. Migrar para `useState` controlado para que P1 (HealthStrip) consiga `setActiveTab`.
- **HealthStrip**: novo componente local em `ProdutoView.tsx` (não promover a `src/components/ui` ainda — esperar segundo uso).
- **`DetailEmpty` com action**: verificar `src/components/ui/DetailStates.tsx`. Se não suportar, adicionar prop `action?: ReactNode` opcional.
- **Indicadores nas tabs**: simples spans com `aria-label` para leitores de tela ("Fiscal incompleto").
- **Markup formula**: `markup = custo > 0 ? (venda/custo - 1) * 100 : null`. Já equivale à margem aqui (estamos calculando margem sobre custo). Renomear corretamente: o cálculo atual (`(venda/custo - 1) * 100`) é **markup**, não margem. Margem seria `(venda - custo)/venda`. Adicionar **ambos** para clareza, com tooltips explicativos.
- **Preservar comportamento existente**: nenhum hook removido, nenhum service alterado, nenhum schema mudado.

### Ordem de execução
1. P2 (header) + P3 (contadores nas tabs) — wins visuais imediatos.
2. P1 (HealthStrip) + tab controlada.
3. P5, P7, P8 (estados vazios + fiscal incompleto).
4. P4 (Geral em grupos).
5. P6 (Preço com profundidade) + P9 (Vendas).
6. P10 (Estoque refino).

Sem migrações de banco. Sem mudanças em `produtos.service.ts` (a menos que P10 precise de `estoque_reservado` — verificado em runtime).