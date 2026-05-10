## Onda 42c — Drawer de Funcionário

Escopo: apenas `src/components/views/FuncionarioView.tsx`. Sem alterações de schema. A tabela `funcionarios` tem hoje apenas `nome, cpf, cargo, departamento, data_admissao, data_demissao, salario_base, tipo_contrato, observacoes, ativo, motivo_inativacao` — então "enriquecer com matrícula, gestor, centro de custo, filial, e-mail, telefone, jornada" fica fora deste plano (exigiria migração e novos campos no formulário de edição). Foco em **compactar, reorganizar e derivar** o que já existe, e em tornar os empty states acionáveis.

### 1. Compactar e reorganizar a aba Resumo (alta prioridade)

Substituir o grid plano de 6 campos por **3 seções nomeadas** com `ViewSection`/`ViewField` (já usadas em outros drawers), em layout 2 colunas mais denso:

- **Identificação** — CPF, tipo de contrato, situação (Ativo / Desligado em / Motivo)
- **Lotação** — cargo, departamento
- **Vínculo** — admissão, desligamento, **tempo de casa** (derivado via `tempoDeCasa()` já existente em `Funcionarios.tsx` — mover utilitário para `src/lib/format.ts` ou inlinar local)

Reduzir `space-y-5` → `space-y-4` no container raiz e `gap-y-3` → `gap-y-2` no grid para diminuir altura útil.

Manter CPF na ficha (é o dado documental canônico) mas **remover do `RecordIdentityCard`** (cabeçalho) — fica menos duplicado e libera espaço no topo. Em compensação, manter no cabeçalho cargo + departamento.

### 2. Revisar os 4 KPIs (alta prioridade)

Substituir os cards atuais por um conjunto mais útil mesmo sem dados de folha:

| Antes | Depois |
|---|---|
| Salário Base | **Salário Base** (mantém) |
| Admissão | **Tempo de casa** (derivado; "—" se desligado e queremos mostrar período) |
| Última Comp. | **Última competência** (mantém, tone neutro quando vazio) |
| Líquido Recente | **Último líquido** (mantém) |

Quando `ultimaFolha` é `null`, exibir `subtitle="Sem folha registrada"` no card "Última competência" para empty state explicativo (DrawerSummaryCard suporta `tone` e usar `value="—"` com hint visual mais discreto).

Admissão sai dos KPIs e migra para a seção Vínculo do Resumo.

### 3. Empty states acionáveis (alta prioridade)

`DetailEmpty` aceita `action` (botão). Adicionar CTAs:

- **Folha (0)** → Botão "Registrar competência" que navega para `/funcionarios?openFolha=${id}` (ou abre o modal já existente; verificar `Funcionarios.tsx` — se não houver deep-link, navegar para a página com `editId` e tab folha; iteração futura).
- **Financeiro (0)** → Botão "Abrir financeiro" que navega para `/financeiro?funcionarioId=${id}` (filtro já existe via `useUrlListState`).
- **Obs.** → Substituir parágrafo "Nenhuma observação registrada." por `DetailEmpty` com CTA "Adicionar observação" que abre `/funcionarios?editId=${id}` focando aba de observações.

Os CTAs apenas navegam — não há nova lógica de negócio.

### 4. Suavizar badge "Sem folha" (média prioridade)

No bloco `situacao`, "Sem folha" hoje vira `Badge` com mesmo peso visual. Tornar mais discreto:

- usar `variant="outline"` sem fundo colorido,
- texto `text-[10px] text-muted-foreground border-dashed`,
- sem ícone.

Manter "Folha pendente" / "Financeiro pendente" / "Desligado" no peso atual (são acionáveis).

### 5. Truncamento elegante (média prioridade)

`RecordIdentityCard` já trunca via `truncate` em `title`. Adicionar `Tooltip` em volta do título quando o nome ultrapassa ~30 chars (conditional wrapper). Breadcrumb usa `usePublishDrawerSlots` — a string vai para `DrawerStackBreadcrumb`, que já trunca via CSS; não mexer aqui.

### 6. Reforçar separação identidade × ações × KPIs (média prioridade)

`DrawerSummaryGrid` recebe um wrapper com `border-t pt-4` para criar linha sutil entre o bloco de cabeçalho/ações (renderizado pelo shell) e os KPIs. Aumentar `space-y` entre KPIs e Tabs de 5 → 6.

### 7. Confirmação de inativação (média prioridade)

Já usa `ConfirmDialog`. Ação é reversível e a descrição já explica a preservação do histórico — manter como está. **Sem mudança.**

---

### Fora de escopo (precisaria backend / produto)

- Adicionar matrícula, gestor, centro de custo, filial, e-mail/telefone corporativo, jornada → exige migração + nova UI no form de edição.
- Timeline de observações com autor/data → exige nova tabela `funcionario_observacoes`.
- Categoria de observação (RH/financeiro/desempenho) → idem.
- Permissão de leitura de salário (`funcionarios:salario_view`) já está na lista de TODOs anterior.

### Arquivos a editar

- `src/components/views/FuncionarioView.tsx` (todas as mudanças)

Sem mudanças em schema, services ou hooks.
