## Onda 42e — Refino mobile do form Editar/Novo Funcionário

Escopo: apenas `src/pages/Funcionarios.tsx` (form). Sem migração, sem mudanças desktop relevantes.

Vários itens da revisão já foram entregues na Onda 42d (máscara CPF + validação inline, salário em moeda, desligamento condicional, "Situação do colaborador", `confirmOnDirty`, `disabledReason` no Salvar, `CPF ###.###.###-##` no header, contador em Observações). Esta onda foca no que sobrou — quase tudo é layout mobile.

### Alta prioridade

1. **Empilhar grids 2-col no mobile**
   - Trocar `grid grid-cols-2 gap-4` por `grid grid-cols-1 sm:grid-cols-2 gap-4` nos blocos:
     - Identificação (CPF + Situação)
     - Vínculo (Admissão + Desligamento)
     - Estrutura Interna (Cargo + Departamento)
   - Mantém densidade no desktop, dá respiro no mobile.

2. **Estado do botão Salvar mais visível no mobile**
   - O botão já tem `max-sm:h-11` no `FormModalFooter`. Garantir que o motivo do disabled apareça como hint visível (não só `title=`) em mobile, já que tooltip nativo não funciona bem em touch:
     - Renderizar uma linha de hint pequena `text-[11px] text-muted-foreground` acima do footer interno **somente quando `noChanges` ou `disabledReason` ativo e o usuário está em mobile**.
   - Implementar via prop opcional `disabledHint?: ReactNode` no `FormModalFooter` (ou render inline no `Funcionarios.tsx` passando como `secondaryActions` mobile-only). Preferência: adicionar `disabledHint` no `FormModalFooter` para reuso.

### Média prioridade

3. **Hierarquia do cabeçalho do FormModal**
   - Já temos badge + identifier `CPF ...` + meta cargo/depto/admissão/tempo de casa.
   - No mobile (`max-sm`), garantir que `meta` quebre linha e que o `identifier` apareça em linha própria abaixo do título (atualmente vai inline). Pequeno ajuste de classe no `FormModal`: o header já é `flex-wrap`, então só precisamos validar visualmente; se ficar amontoado, adicionar `max-sm:basis-full` no `identifier` chip.

4. **Texto de apoio da Remuneração com mais peso**
   - Hoje: `text-[11px] text-muted-foreground`.
   - Mobile: trocar por bloco discreto com fundo `bg-muted/40 border rounded-md px-2.5 py-2` e texto `text-xs text-foreground/80`. Mantém ícone $.

5. **Observações mobile**
   - `rows={3}` → `rows={4}` (apenas via classe `min-h-[120px]` para manter desktop estável).
   - Placeholder mais curto no mobile via `useIsMobile`: "Notas internas, acordos, histórico..."

### Baixa prioridade

6. **Hint do CPF inline mais legível no mobile**
   - Validação já existe (`text-[11px]`); aumentar para `text-xs` no mobile para tap-targets/leitura.

### Fora de escopo (já entregue ou demanda backend)

- Máscara/validação CPF, salário em moeda, desligamento condicional, motivo do desligamento, contador em Obs., header com `CPF ...`, `confirmOnDirty`, motivo de bloqueio do Salvar — entregues na Onda 42d.
- Matrícula, centro de custo, filial, gestor — exigem migração + UI nova; permanecem fora.

### Arquivos

- `src/pages/Funcionarios.tsx` — grids, hint da remuneração, placeholder/altura de Obs.
- `src/components/FormModalFooter.tsx` — adicionar prop opcional `disabledHint?: ReactNode` renderizada acima dos botões quando o primário estiver desabilitado (mobile-friendly, substitui o `title=` invisível em touch).

### Checks

- Build + `tsc` passam.
- Em 390x844: cada par de campos passa a ocupar uma coluna; toques confortáveis.
- Em ≥640px (`sm`): layout permanece 2 colunas (sem regressão desktop).
- Botão Salvar com hint visível "Sem alterações para salvar" / "Corrija o CPF antes de salvar" no mobile.