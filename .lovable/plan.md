# Onda 34 — Editar Transportadora (mobile)

Refinos focados em UX mobile do `FormModal` em `src/pages/Transportadoras.tsx`. Sem mudanças de schema, sem mudanças de regra de negócio.

## Alta prioridade

1. **CNPJ formatado em todas as exibições mobile**
   - O header do `FormModal` já passa `cpfCnpjMask`, mas em mobile o `identifier` pode aparecer cru quando o form ainda está sendo digitado. Garantir que tanto o chip do header quanto a exibição na lista de Clientes Vinculados usem `cpfCnpjMask` (já parcialmente aplicado em `cv.clientes.cpf_cnpj`). Validar visualmente.

2. **Abas com scroll horizontal limpo (padrão "tabs-mobile-scroll")**
   - Substituir `<TabsList className="mb-4 w-full justify-start overflow-x-auto">` por composição canônica:
     - `overflow-x-auto scrollbar-hide tabs-fade-mask`
     - `Tabs` controlada (state `activeTab`) para auto-centralizar o trigger ativo via `scrollIntoView({ inline: "center" })` em `useEffect`.
   - Encurtar rótulos no mobile (via `useIsMobile`):
     - Dados Gerais → **Dados**
     - Contatos → **Contatos**
     - Operacional → **Operação**
     - Endereço → **Endereço**
     - Clientes → **Clientes**
     - Obs. → **Obs.**

3. **Botão "Consultar CNPJ" mais claro no mobile**
   - Hoje em mobile fica só ícone ao lado do campo. Mover para **abaixo** do campo CNPJ quando `isMobile`, full-width, com label "Consultar CNPJ" + ícone.
   - Microcopy auxiliar: encurtar para `"Consultar CNPJ para preencher automaticamente."`

4. **Estruturar prazo médio (campo numérico simples)**
   - Manter compatibilidade com string atual. Trocar input livre por:
     - `Input type="number"` (inteiro, min=0), placeholder `"Ex.: 5"`, sufixo "dias úteis" mantido.
     - Helper text: `"Use o prazo médio em dias úteis."`
   - Não dividir em min/max nesta onda (escopo ainda compatível com migração futura).

5. **Botão "Vincular" com estado claro**
   - Já existe hint quando desabilitado. Reforçar no mobile:
     - Quando nenhum cliente selecionado: variante `outline`, hint `"Selecione um cliente para vincular."` em destaque (cor `text-warning-foreground`).
     - Quando cliente selecionado: variante `default` ativa.

## Média prioridade

6. **Header mobile reorganizado em linhas**
   - Aproveitar `meta` do `FormModal` para garantir quebra natural por `flex-wrap` (já existe). Ajustar `meta` para ordem: `[CNPJ via identifier] / status badge / Cadastro · Atualização / Modalidade · Cidade-UF`.

7. **Status compacto na aba Dados Gerais**
   - Trocar `Card` grande do toggle `ativo` por linha simples: `<div class="flex items-center justify-between py-2 border rounded-md px-3">Status <Switch/> Ativo</div>`.

8. **Padding inferior do conteúdo**
   - Já há `max-sm:pb-24` no `FormModal`; revisar se com footer atual último campo do Endereço fica visível. Se necessário, aumentar para `pb-28`.

9. **Footer compacto no mobile**
   - Em `FormModalFooter`: reduzir `h-11` para `h-10` no mobile e `gap-2` → `gap-1.5` quando `isMobile`. Pequeno ajuste para liberar área útil.

10. **Máscara de telefone na aba Contatos**
    - Aplicar `phoneMask` no `onChange` do campo telefone (hoje texto puro). Garantir reaplicação no carregamento (`phoneMask(t.telefone)`).

## Baixa prioridade

11. **Microcopy / placeholders curtos** no mobile (helper text das abas Operacional e Obs.).
12. **Aba Obs.**: separar visualmente "Observações internas" de "Uso no Sistema" com `border-t pt-4 mt-4` e título h4.

## Fora de escopo
- Validação de e-mail / campo WhatsApp separado (Onda 35).
- Estrutura `prazo_min`/`prazo_max` em colunas (requer migração).
- Ações por linha em Clientes Vinculados além do já existente (estrela/abrir/remover).

## Arquivos
- `src/pages/Transportadoras.tsx` (principal)
- `src/components/FormModalFooter.tsx` (apenas ajuste fino de altura mobile)
- `.lovable/plan.md` (registrar Onda 34)
