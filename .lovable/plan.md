## Onda 42d — Refino do form Editar/Novo Funcionário

Escopo: apenas `src/pages/Funcionarios.tsx` (form e cabeçalho do `FormModal`). Sem migração de schema.

### Alta prioridade

1. **CPF com máscara e validação visual inline**
   - Trocar `<Input>` do CPF por `<MaskedInput mask="cpf">` (já existe em `@/components/ui/MaskedInput`).
   - Indicador inline ao lado/abaixo do campo:
     - vazio → sem ícone
     - dígitos < 11 → hint "Digite os 11 dígitos"
     - inválido (`!isValidCpf`) → ✕ vermelho "CPF inválido"
     - verificando unicidade (`cpfChecking`) → spinner "Verificando…"
     - duplicado (`cpfUnico === false`) → ✕ "CPF já cadastrado"
     - válido e único → ✓ verde "CPF válido"
   - Borda do input em `border-destructive` quando inválido/duplicado.

2. **Salário formatado como moeda (R$ 5.200,00)**
   - Substituir `<Input type="number">` por input texto com máscara monetária BR.
   - Exibir o valor formatado enquanto digita; armazenar `salario_base` como `number` no estado.
   - Adicionar gating de permissão: se `!isAdmin`, exibir somente leitura mascarado como `R$ ••••` com tooltip "Sem permissão para visualizar salário" — não bloqueia edição dos demais campos.

3. **Botão "Salvar Alterações" com estado claro**
   - Já existe `noChanges` no `FormModalFooter`; adicionar `disabledReason` explícito vindo do form quando aplicável:
     - sem alterações → "Sem alterações para salvar" (já default)
     - CPF inválido → "Corrija o CPF antes de salvar"
     - CPF duplicado → "CPF já cadastrado em outro funcionário"
     - validação CPF em andamento → "Aguarde a verificação do CPF"
   - Passar `disabled` + `disabledReason` ao `FormModalFooter`.

4. **Data de Desligamento condicional ao status**
   - Quando `form.ativo === true`: ocultar o input e mostrar linha discreta "Não aplicável — colaborador ativo".
   - Quando `form.ativo === false`: mostrar input obrigatório (`required`) + novo campo opcional **Motivo do desligamento** (textarea curto) gravado em `motivo_inativacao` (campo já existente na tabela conforme `FuncionarioView`).
   - Default `data_demissao = hoje` ao alternar para inativo (se vazio).

### Média prioridade

5. **Cabeçalho do FormModal mais informativo**
   - `identifier`: trocar `selected.cpf` cru por `cpfMask(selected.cpf)` com prefixo "CPF" (usar utilitário `cpfMask` de `@/utils/masks`).
   - `meta`: manter cargo · departamento · admissão; adicionar tempo de casa quando ativo.

6. **Renomear label "Status do colaborador" → "Situação do colaborador"**
   - Único ajuste de microcopy no `Select` de `ativo`.

7. **Indicador "alterações não salvas"**
   - Já existe via `isDirty` no header e footer do `FormModal`. Adicionar `confirmOnDirty` ao `<FormModal>` para reforçar a confirmação no ESC/click-outside (já há `handleCloseModal` para o X).

8. **Contador de caracteres em Observações**
   - `maxLength={1000}` + label discreto `{form.observacoes.length}/1000` à direita do label.

### Baixa prioridade

9. **Tipo de contrato compactado nas options**
   - `SelectItem` mostra apenas `CLT` / `PJ` / `Estágio` / `Temporário`; descrição completa fica no tooltip já existente.

10. **Microcopy da Remuneração**
    - Trocar "Impacta o cálculo da folha…" por "Usado no cálculo da folha e na geração de lançamentos financeiros (salário + FGTS 8%). Não inclui demais encargos."

### Fora de escopo (requer migração + UI nova — não fazer agora)

- Matrícula / código interno (campo `matricula`).
- Centro de custo, filial/unidade, gestor responsável.
- Histórico de alteração salarial (auditoria dedicada).
- Histórico de observações com autor/data.
- Permissão granular `funcionarios:salario_view` (hoje gateamos por `isAdmin`).

### Arquivos

- `src/pages/Funcionarios.tsx` — único arquivo editado.
- Reaproveitar: `MaskedInput`, `cpfMask` (`@/utils/masks`), `isValidCpf` (já no arquivo), `useDocumentoUnico` (já em uso).

### Checks após implementar

- Build + tsc passam.
- Toggle ativo→inativo mostra Data/Motivo de desligamento; voltar para ativo limpa visualmente sem perder valores no estado até salvar.
- CPF "111.111.111-11" sinaliza inválido; CPF duplicado bloqueia salvar com tooltip claro.
- Salário renderiza "R$ 5.200,00" enquanto edita.