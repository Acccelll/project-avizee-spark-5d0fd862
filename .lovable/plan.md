## Onda 41 — Drawer Grupo Econômico (microcopy + hierarquia)

Foco: padronizar nomenclatura, melhorar fallback de Matriz, contextualizar o badge de risco e dar mais propósito aos empty states. Sem mudanças de schema, lógica ou estrutura de abas.

### Diagnóstico (em `src/components/views/GrupoEconomicoView.tsx`)

- **Mistura "Empresas" × "Clientes"**: a aba se chama `Empresas`, o KPI também, mas os textos auxiliares usam "clientes". O modelo do sistema é `clientes` (a tabela), e o grid lista "N clientes vinculados". Manter a semântica **Empresas do grupo** (foco de consolidação empresarial), mas alinhar o auxiliar.
- **Matriz `—`** quando não definida soa "quebrado".
- **Cabeçalho secundário** ("0 empresas · desde 09/05/2026") é raso.
- **Badge "Saudável"** aparece em grupos sem nenhuma operação, dando falsa impressão. Quando não há empresas vinculadas **e** não há lançamentos, o status correto é "Sem operação".
- **Empty states** das três abas sem orientação suficiente.

### Mudanças (alta prioridade)

1. **Padronização semântica** — manter "Empresas" como termo principal:
   - Aba: `Empresas do grupo (N)` (encurta para `Empresas (N)` em mobile via responsividade simples no label).
   - KPI: `Empresas` (já está).
   - Empty state da aba Empresas: título `Nenhuma empresa vinculada`, mensagem `Vincule clientes/empresas a este grupo no cadastro do cliente em Cadastros › Clientes.`

2. **Fallback do KPI Matriz**:
   - Substituir `"—"` por `"Não definida"` em `text-muted-foreground italic`, mantendo `mono={false}`.

3. **Cabeçalho secundário** (`meta` do `RecordIdentityCard`):
   - `N empresa(s) vinculada(s) · criado em DD/MM/AAAA`.
   - Quando `empresas.length === 0`, anexar segmento extra: `· sem matriz definida` apenas se `matriz === null`.

4. **Badge de risco contextual** (`getRiskInfo` no escopo do componente):
   - Nova classe "Sem operação" quando `empresas.length === 0` **e** `financeiro.length === 0` (zero lançamentos abertos): label `"Sem operação"`, ícone `Info`, classe neutra (`bg-muted text-muted-foreground border-muted-foreground/30`).
   - Tooltip no badge explicando a regra de cada estado (Risco/Atenção/Saudável/Sem operação).

5. **Empty states refinados**:
   - Empresas: título e mensagem do item 1 acima.
   - Financeiro: quando `financeiro.length === 0`, título `"Sem títulos em aberto"` (mantém) + mensagem `"Nenhuma empresa do grupo possui lançamentos a receber em aberto no momento."`.
   - Observações vazia: trocar copy para `"Nenhuma observação cadastrada."` + parágrafo discreto `"Edite o grupo para registrar observações internas."`.

### Mudanças (média prioridade)

6. **Aba Empresas — linha por empresa enriquecida** (já existe estrutura). Ajustes:
   - Mostrar papel claro: `Matriz`, `Filial`, `Coligada`, `Independente` (já usa `relacaoLabel`); manter o `Star` apenas para a matriz canônica (`empresa_matriz_id`).
   - Acrescentar saldo individual à direita quando >0 — agregando `financeiro` por `cliente_id` no carregamento já existente. Render: `Saldo R$ X.XXX,XX` em `text-warning`. Sem novas queries.

### Fora de escopo

- Reposicionar/agrupar os botões `Editar`/`Inativar`/`Excluir` em menu de overflow (item 8 do feedback) — mantém visual atual.
- Aba Financeiro com top-clientes, limite de crédito, última movimentação (item 6) — depende de novas queries; adiar.
- CTA "Adicionar observação" inline (item 7) — observações são editadas no modal de edição, manter copy + remissão.
- Mudanças no header `Grid Grupos Econômicos` (já tratado nas Ondas 39/40).
- Schema, RLS, RPCs.

### Arquivos afetados

- `src/components/views/GrupoEconomicoView.tsx` (microcopy, fallback Matriz, badge "Sem operação" + tooltip, agregação de saldo por empresa, empty states).

### Verificação

- Visual no preview com o grupo PLUMA atual: matriz mostra "Não definida"; cabeçalho mostra "0 empresas vinculadas · criado em 09/05/2026 · sem matriz definida"; badge mostra "Sem operação" com tooltip; aba Observações mostra a mensagem nova.
