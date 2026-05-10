# Onda 42i — Editar Sócio (Cadastro + Participações)

Escopo restrito ao componente `src/pages/Socios.tsx` (modal de criar/editar). Sem alterações em `FormModal`, `MaskedInput`, hooks ou serviços. Sem mudança no schema.

## Alta prioridade

1. **CPF com máscara no formulário**
   - O `MaskedInput` já aplica máscara visual; garantir que valores carregados via `openEdit` exibam formatado (passar `cpfMask(s.cpf)` em vez de dígitos crus em `setForm`). Mantém `cpfDigits` no submit como hoje.

2. **Suavizar “borda laranja” do formulário**
   - O contorno percebido vem do `:focus`/`focus-visible` do `<form>` ou do container do `Tabs`. Adicionar `tabIndex={-1}` + `outline-none focus:outline-none focus-visible:ring-0` no `<form id="socio-form">` para remover o anel laranja global em torno do bloco inteiro.
   - Não há mudança no design system; só anula o ring que enquadra o form.

3. **Renomear labels ambíguos**
   - “Status” → **“Status do sócio”**.
   - “Forma padrão” → **“Forma padrão de recebimento”**.
   - “Tipo” (na linha bancária) → **“Tipo de conta”**.

4. **Percentual em padrão pt-BR**
   - Trocar `Number(p.percentual).toFixed(2) + "%"` por `formatPercent(Number(p.percentual))` (já importado em outras telas) na tabela e no resumo da aba Participações. Isso produz `20,00%`.

5. **Validação forte de percentual + soma**
   - Em `adicionarParticipacao`:
     - bloquear `<= 0` (já existe) e `> 100`;
     - calcular `somaProjetada = somaAtualVigentes + novaPart.percentual` e exibir `toast.error` se `> 100` antes do submit;
     - se `>= 95 && <= 100`, exibir `toast.warning` com a soma resultante.
   - Renderizar abaixo do formulário um aviso inline destacado quando soma projetada `> 100`: “A soma das participações ficará em X,XX%. Ajuste antes de salvar.”

## Média prioridade

6. **Campos bancários condicionais**
   - Se `forma_recebimento_padrao === "pix"`: destacar **Chave Pix** em linha própria (col-span-2) e ocultar Banco/Agência/Conta/Tipo (mantendo valores no estado para não perder dados ao alternar).
   - Se `"ted"`: mostrar Banco/Agência/Conta/Tipo de conta; Chave Pix opcional discreta.
   - Se `"dinheiro"` ou `"outro"`: ocultar bancários e Chave Pix; mostrar campo `Observação de recebimento` (alias visual de `observacoes` já existente — opcional, ou simplesmente esconder ambos).

7. **Resumo na aba Participações**
   - Acima do bloco “Adicionar período”, mostrar card discreto:
     - **Participação atual**: vigente sem `vigencia_fim` (`formatPercent`).
     - **Soma geral (vigentes)**: `formatPercent(soma)`.
     - **Status**: badge `Composição válida` (=100), `Incompleta` (<100), `Excedida` (>100).

8. **Coluna “Fim” → “Situação”**
   - Renomear cabeçalho e renderizar:
     - sem `vigencia_fim` → `<Badge>Vigente</Badge>`;
     - com `vigencia_fim` → texto muted `Encerrada em dd/mm/aaaa`.

9. **Estado do botão Salvar**
   - O `FormModalFooter` já reflete `saving`. Acrescentar `dirty` local (`JSON.stringify(form) !== JSON.stringify(initialForm)`) e passar `disabled={!dirty}` se a prop existir; caso não exista, deixar como está e apenas garantir que `saving` mostra loading. (Verificar prop antes de codificar; se não houver, manter comportamento atual e documentar.)

## Baixa prioridade

10. **Contador em Observações**: `value.length / 500` abaixo do `Textarea` (sem alterar limite no DB).
11. **Tooltip em “Vigência fim (opcional)”**: “Deixe em branco para manter o período em aberto. Períodos não podem se sobrepor.”
12. **Espaçamento**: garantir `space-y-6` entre seções e `space-y-3` interno (já está ok; só revisar o bloco Observações).

## Fora de escopo

- `FormModal`, `MaskedInput`, `StatusBadge`, design system global.
- Mudanças no schema, RPC ou validação server-side.
- Permissão por perfil para mascarar CPF parcialmente no formulário (o grid já trata via `isAdmin`).
- Migração para `react-hook-form` + `zod` (refator maior, exigiria onda dedicada).

## Detalhes técnicos

- Imports adicionais em `Socios.tsx`: `formatPercent` de `@/lib/format`, `Badge` de `@/components/ui/badge`.
- Estado `initialForm` capturado em `openCreate`/`openEdit` para cálculo de `dirty`.
- Cálculo da soma vigente: `participacoes.filter(p => !p.vigencia_fim).reduce((a,p)=>a+Number(p.percentual),0)`.
- Build atual passa; após edição rodar `tsc` (auto pelo harness).
