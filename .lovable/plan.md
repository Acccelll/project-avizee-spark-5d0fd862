## Onda 39 — Grid Grupos Econômicos

Foco: eliminar a inconsistência crítica entre os cards e a coluna Status, e tornar a tela mais relacional (clientes vinculados visíveis e clicáveis). Sem mudanças de schema, somente UI/leitura.

### Diagnóstico

Em `src/pages/GruposEconomicos.tsx`:

- **Inconsistência Ativos/Inativos**: o card *Ativos* usa `useTableCount("grupos_economicos", { ativo: true })` (global), mas *Inativos* é calculado como `totalRegistros - summaryAtivos`. Quando há filtro de status ativo na URL, `totalCount` vem **filtrado** pelo server (`serverFilters`), enquanto `summaryAtivos` é **global** → contas batem em zero negativo / divergem do que a tabela mostra.
- **"Com Clientes (página)"** depende só de `data` (página corrente), exatamente o anti-padrão já corrigido em outras telas.
- **Coluna Clientes** mostra `—` quando count = 0; deveria mostrar "0 clientes" e ser clicável para abrir o drawer.
- **Linha pobre de contexto**: nome isolado, sem fallback quando não há matriz/descrição.

### Mudanças (alta prioridade)

1. **Cards 100% globais e consistentes** em `GruposEconomicos.tsx`:
   - `Total de Grupos` → `useTableCount("grupos_economicos")` (sem filtros).
   - `Ativos` → `useTableCount("grupos_economicos", { ativo: true })` (já existe).
   - `Inativos` → `useTableCount("grupos_economicos", { ativo: false })` (novo, em vez de subtração).
   - `Com Clientes` → derivado do mapa global de contagens de `clientes`. O `useEffect` atual já busca **todos** os clientes ativos com `grupo_economico_id`, então `Object.keys(clienteCountMap).length` é uma contagem global — basta renomear o card e remover o sufixo "(página)".
   - Resultado: os 4 cards passam a ser independentes do filtro/paginação corrente, eliminando a divergência com o status da linha.

2. **Coluna Clientes** (`columns[1]`):
   - Substituir o `—` por `"0 clientes"` em estado neutro (`text-muted-foreground`).
   - Para count > 0, manter ícone + número e adicionar sufixo "cliente(s)".
   - Tornar a célula clicável (`button` ou `RelationalLink`) que chama `openView(g)` e abre o drawer já na aba de empresas (envia query param `?tab=empresas` consumido por `GrupoEconomicoView` — pequeno ajuste no `Tabs defaultValue`).

3. **Linha mais informativa** em `columns[0]`:
   - Quando não há matriz nem descrição, adicionar subtítulo discreto: `"Sem matriz definida"` em `text-xs text-muted-foreground`.
   - Quando `g.observacoes` existir e não houver matriz, mostrar primeira linha truncada do observações como subtítulo alternativo.

### Mudanças (média prioridade)

4. **Coluna "Atualizado em"** visível por padrão (hoje `hidden: true` em `created_at`):
   - Renomear para "Cadastro" → manter; adicionar nova coluna `updated_at` (se existir no schema; se não, manter apenas `created_at` visível). Confirmar via `supabase--read_query` antes de implementar.
   - Mostrar `formatDate` discreto (`text-xs text-muted-foreground`).

5. **Microcopy**: `subtitle` da página → "Consolide clientes relacionados em grupos para análises e condições comerciais."

### Fora de escopo

- Coluna de faturamento por grupo (depende de agregado server-side, evolução futura).
- Filtros "com/sem clientes" (baixa prioridade, deixar para quando houver volume).
- Mudanças em `GrupoEconomicoView` além do `defaultValue` da Tabs aceitar query param.
- Qualquer alteração de schema, RLS ou lógica de negócio.

### Arquivos afetados

- `src/pages/GruposEconomicos.tsx` (cards, coluna clientes, coluna nome, microcopy).
- `src/components/views/GrupoEconomicoView.tsx` (apenas para aceitar `defaultValue` dinâmico via search param `tab`).

### Verificação

- Confirmar via `read_query` que `useTableCount` retorna 1 para `{ativo:true}` quando há 1 grupo PLUMA ativo (validar a hipótese da divergência observada).
- Inspeção visual no preview: cards batem com a tabela em qualquer combinação de filtro de status.
