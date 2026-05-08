## Onda 23 — Refinos no formulário de Clientes (Novo / Editar)

Foco frontend: melhorar o cabeçalho, tornar o preenchimento mais inteligente, indicar pendências por aba e separar metadados de observações. Sem mudanças de schema, RLS ou regras de negócio.

Arquivo principal: `src/pages/Clientes.tsx` (FormModal de cliente, linhas ~657-1136). Sem novos componentes, sem novos hooks.

### 1. Cabeçalho — eliminar redundância badge × toggle (alta)

Hoje aparecem ao mesmo tempo: `StatusBadge` em `status` + `Switch` "Ativo" em `headerActions`. No modo **edição**:

- Remover o `status={<StatusBadge .../>}` do `FormModal` para edição.
- Manter apenas o `Switch` em `headerActions`, com label claro: `Cliente ativo` / `Cliente inativo` (em vez de só "Ativo"/"Inativo"), e tooltip "Alterar status do cadastro".
- No modo **criação**: nada de toggle nem badge (cliente novo já nasce ativo; o `createHint` cobre).

### 2. Diferenciar Novo vs Editar (alta)

- Título já alterna; reforçar:
  - **Criação**: `meta` enxuta — apenas hints relevantes (nada de "Cadastrado em").
  - **Edição**: manter `Cadastrado em …` e enriquecer com `Última atualização` (usar `selected.updated_at` se existir; caso contrário, omitir).
- O CTA do footer já vem do `FormModalFooter` via `mode` (Criar vs Salvar Alterações) — apenas confirmar que está sendo passado (já está).

### 3. Cabeçalho mais compacto (média)

Sem reescrever o `FormModal`, apenas reorganizar o que `Clientes.tsx` envia:

- `identifier` mostra o documento mascarado (`cpfCnpjMask(selected.cpf_cnpj)`), prefixado por `CPF:` ou `CNPJ:` conforme o número de dígitos (mesma lógica de `ClienteView`).
- `meta`: `Cadastrado em DD/MM/AAAA` + grupo econômico (se houver). Remover o item de "Forma de pagamento" do `meta` — já aparece dentro da aba Comercial e polui o topo.

### 4. Aba Dados Gerais — preenchimento inteligente (alta)

- **Inferência de Tipo de Pessoa pelo CPF/CNPJ**: ao alterar `cpf_cnpj`, se `digits.length === 11` → setar `tipo_pessoa = "F"`; se `=== 14` → `"J"`. Só aplica quando o usuário ainda não tocou manualmente o campo na sessão (flag local `tipoPessoaTouched`). Disparado no `onChange` do `MaskedInput` de CPF/CNPJ.
- **Botão lupa do CNPJ**: já tem tooltip; trocar o ícone para um par mais claro — manter `Search` mas adicionar `aria-label="Consultar CNPJ na Receita"` e exibir um pequeno texto auxiliar abaixo do campo: `Consultar CNPJ preenche razão social, endereço e contato.` (visível só quando `tipo_pessoa === "J"` e o documento tem 14 dígitos).
- **Inscrição Estadual**:
  - Se `tipo_pessoa === "F"`: ocultar o campo (PF não tem IE comercial nesse fluxo).
  - Se `tipo_pessoa === "J"`: manter, e adicionar checkbox/atalho `Isento` que, quando marcado, preenche o input com `ISENTO` e desabilita-o.

### 5. Aba Endereço (média)

- Já há lookup no `onBlur` do CEP + spinner. Apenas:
  - Adicionar mensagem de sucesso/erro inline abaixo do CEP (`CEP encontrado` / `CEP não encontrado`), via estado local `cepStatus`.
  - **País**: default `Brasil`, render readonly com botão pequeno `Alterar` que torna editável (reduz protagonismo sem remover).
  - **Caixa Postal**: mover para uma seção "Avançado" colapsável (`<details>` simples) no fim da aba.

### 6. Aba Entregas — empty state (baixa)

- O componente vive em `ClienteEnderecosTab`, fora de escopo desta onda. Aqui: passar via prop opcional `emptyHint` (string) com texto reforçando que o endereço de faturamento é usado por padrão. Se o componente não suportar, **adiar** este item (sem editar o sub-componente — mantém escopo).

### 7. Aba Comercial — modularização visual (média)

Já existe a separação em "Condições Comerciais" e "Grupo Econômico". Refinar:

- Criar um terceiro bloco visual `Logística Comercial` envolvendo o `ClienteTransportadorasTab` (apenas um header com ícone + título, sem alterar o sub-componente).
- Compactar o **Limite de Crédito**: trazer para dentro do grid principal de 4 colunas (linha 2, ocupando 2 col), removendo a caixa `bg-muted/20` que dá respiro excessivo.
- Promover o link "Cadastrar nova forma" para botão `variant="outline"` `size="sm"` posicionado **ao lado** do `Select` de forma de pagamento, dentro de um `flex gap-2` (mais visível, ainda secundário).
- Empty state de transportadoras: passa por melhoria no sub-componente — fora de escopo.

### 8. Aba Observações — separar metadado (alta)

Hoje o textarea pode conter `Importado via faturamento histórico (IBGE: 4308607)`.

- Detectar prefixo `Importado via faturamento histórico` ou `IBGE:` em `form.observacoes` (regex idêntica à usada em `ClienteView`).
- Renderizar dois blocos:
  - **Origem do cadastro** (read-only, chip cinza com o trecho metadado).
  - **Observações internas** (`Textarea` editável só com o restante).
- No `handleSubmit`, ao salvar, **reanexar** o trecho de metadado ao texto editado (concatenar com `\n\n` se houver observação). Isso evita perda de informação histórica.

### 9. Indicadores de pendência por aba (média)

Calcular um conjunto `tabIssues = { dadosGerais, contatos, endereco, comercial }`:

- `dadosGerais`: falta `tipo_pessoa` ou `nome_razao_social` ou `cpf_cnpj` inválido.
- `contatos`: faltam **todos** os canais (telefone, celular, email).
- `endereco`: faltam `cep` ou `logradouro` ou `cidade`/`uf`.
- `comercial`: `forma_pagamento_id` vazio **e** `prazo_padrao` zero.

Renderizar pequeno `•` ou ícone `AlertTriangle` (h-3 w-3 text-warning) ao lado do label do `TabsTrigger` quando `true`. Tooltip explica o que falta.

### 10. Validação e estado de alteração (baixa, parcialmente já existe)

- `FormModalFooter` já desabilita Save quando `!isDirty` em modo edit. Apenas garantir que o bloqueio também ocorra quando há `formErrors` populados.
- O `confirmDiscard` já cobre fechar com alterações pendentes.

---

### Fora de escopo (deixa para próxima onda)

- Múltiplos contatos por cliente (mudaria schema).
- Ajustes profundos em `ClienteEnderecosTab`, `ClienteComunicacoesTab`, `ClienteTransportadorasTab`.
- Separar `Nova Comunicação` em fluxo independente (já é um sub-componente; refator próprio).
- Mudanças no `FormModal` shell (cabeçalho do modal).

### Detalhes técnicos

- Sem novos pacotes. Tudo dentro de `src/pages/Clientes.tsx`.
- Reaproveitar `cpfCnpjMask` de `@/utils/masks` para o `identifier`.
- Inferência de PF/PJ usa um `useRef<boolean>(false)` (`tipoPessoaTouched`) — `useState` causaria re-render desnecessário.
- Detecção de metadado: `const META_RE = /(Importado via faturamento histórico[^\n]*|IBGE:\s*\d+)/g;` (split + reconstrução).
- Indicadores de aba: `useMemo` derivado de `form` + `formErrors`.

### Memórias a registrar após implementação

- `mem://produto/cliente-form-cabecalho` — Regra: badge de status é redundante com toggle no header de edição; usar apenas o toggle.
- `mem://produto/inferencia-tipo-pessoa` — Regra: PF/PJ deve ser inferido pelo número de dígitos do documento, com possibilidade de override manual.
