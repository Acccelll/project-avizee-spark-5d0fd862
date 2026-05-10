## Onda 42f — Refino do grid de Sócios (`/socios`)

Escopo: apenas `src/pages/Socios.tsx` (grid + KPIs). Sem migração, sem alterar drawer/form. Foca em CPF sensível, percentual pt-BR, validação visual da composição e clareza das colunas.

### Alta prioridade

1. **CPF formatado e mascarado por permissão**
   - Coluna "CPF" passa a renderizar:
     - Sem CPF → badge `outline` discreto "CPF pendente" (`text-muted-foreground`).
     - Admin (`useIsAdmin`) → CPF completo via `cpfMask` (`446.790.278-35`).
     - Não-admin → mascarado parcialmente: `***.790.278-**` (mantém os 6 dígitos do meio).
   - Helper local `partialCpf(digits)`; a versão completa só é montada se `isAdmin`.

2. **Percentual em padrão pt-BR**
   - Coluna "Participação atual" usa `formatPercent(Number(s.percentual_participacao_atual ?? 0))` → `20,00%`.
   - SummaryCard "Soma de participações" também usa `formatPercent(kpis.soma)`.

3. **Validação visual da composição (KPI)**
   - SummaryCard "Soma de participações" ganha `description` dinâmica:
     - `Math.abs(soma - 100) < 0.01` → "Composição válida" (variant `success`).
     - `soma < 100` → `Faltam X,XX%` (variant `warning`).
     - `soma > 100` → `Excede X,XX%` (variant `danger`).
   - Reutiliza `formatPercent` para o delta.

4. **Renomear coluna "Entrada" → "Entrada societária"**
   - Apenas o `label`. `key` continua `data_entrada`.

5. **Coluna CPF: estado "—" → "CPF pendente"**
   - Coberto por (1); reforço explícito de UX.

### Média prioridade

6. **Card de pendência de CPF (condicional)**
   - Calcular `kpis.cpfPendentes = socios.filter(s => !s.cpf).length`.
   - Quando `> 0`, renderizar 4º `SummaryCard` "CPF pendente" com `variant="warning"` e ícone `AlertTriangle`. Quando `0`, não renderiza (mantém o layout enxuto).

7. **Busca por nome/CPF no DataTable**
   - `DataTable` já aceita busca padrão do `ModulePage` (verificar via `searchKey`/props existentes; se não houver, expor `searchPlaceholder="Buscar por nome ou CPF..."` — ajuste mínimo, sem refator).
   - Filtro por dígitos do CPF: na coluna `cpf`, prover `searchValue: (s) => `${s.nome} ${(s.cpf ?? "").replace(/\D/g,"")}`` se a API do `DataTable` permitir; caso contrário, deixar busca no `nome` apenas (a sondagem ao implementar definirá).

### Fora de escopo (necessitam migração ou outras telas)

- **Coluna "Papel/tipo do sócio"** — tabela `socios` não tem campo `papel`/`tipo_socio`. Requer migração + UI. Fica para onda futura.
- **Histórico/última alteração no grid** — já existe a aba "Participações" no drawer/modal; coluna extra exigiria join e sai do escopo de UI.
- **Ações específicas** ("alterar participação", "registrar saída") — drawer já oferece edição e a aba Participações; ações específicas exigem refactor de `RowActions` e novos fluxos.
- **Filtros por papel/status** — depende de (papel) acima; filtro por status pode entrar em onda dedicada se demandado.

### Arquivos

- `src/pages/Socios.tsx` — colunas (`cpf`, `percentual_participacao_atual`, `data_entrada`), `kpis` (cpfPendentes + label dinâmico da soma), card adicional, busca.
- Novo helper inline `partialCpf` (não cria arquivo).
- Imports adicionais: `cpfMask` (`@/utils/masks`), `formatPercent` (`@/lib/format`), `useIsAdmin` (`@/hooks/useIsAdmin`).

### Checks

- `tsc` passa.
- Admin vê CPF completo formatado; não-admin vê `***.xxx.xxx-**`.
- Soma 100,00% → card verde "Composição válida"; soma divergente → warning/danger com delta em pt-BR.
- Coluna renomeada para "Entrada societária".
- Card "CPF pendente" só aparece quando há sócios sem CPF.
