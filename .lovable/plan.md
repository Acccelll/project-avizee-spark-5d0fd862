# Onda 22 — Drawer de Clientes (UI/Presentational)

Refina o `ClienteView` (drawer aberto via `?drawer=cliente:<id>`) para deixar a tela mais legível e acionável. Tudo é frontend/apresentação — sem mudanças em RPCs, RLS, services ou domínio.

Arquivo único editado: `src/components/views/ClienteView.tsx`.

## 1. Cabeçalho com rótulos claros (alta)

No `RecordIdentityCard.meta`, trocar a sequência crua `72725605920 · RS` por rótulos:

- Documento formatado com `cpfCnpjMask(selected.cpf_cnpj)` e prefixo dinâmico:
  - 11 dígitos → `CPF: 727.256.059-20`
  - 14 dígitos → `CNPJ: 12.345.678/0001-90`
  - outro tamanho → `Documento: <valor>`
- Cidade/UF rotulados: `Cidade: Caxias do Sul/RS` (ou só `UF: RS` quando sem cidade).
- Quando faltar documento: omitir a parte "CPF/CNPJ" em vez de mostrar `—`.

## 2. Badge de saúde cadastral (alta)

Helper local `getMissingFields(c)` (mesmo critério já usado em `Clientes.tsx`: documento, telefone+celular, email, prazo, endereço — logradouro/cidade/uf/cep).

No `badges` do `RecordIdentityCard`, ao lado do `StatusBadge`:

- Se `missing.length === 0`: nada extra.
- Se houver pendências: badge `warning` "Cadastro incompleto" com `Tooltip` listando os campos faltantes (ex.: "Sem e-mail · Sem telefone · Endereço incompleto").

## 3. KPIs com microcopy melhor (alta)

Reescrever os 4 `DrawerSummaryCard`:

| Atual | Novo label | Novo `hint` |
|---|---|---|
| `Saldo Devedor` | `Saldo devedor` | `Sem títulos em aberto` quando `totalAberto === 0`, senão `<n> título(s) em aberto` |
| `PMV (Médio)` | `Pedido médio` | `baseado em <n> pedido(s)` ou `baseado em <n> nota(s)` (quando `vendas.length === 0`) |
| `Lmt. Crédito` | `Limite de crédito` | quando `limite_credito` é `null/undefined`: valor = `Não definido` (com `mono={false}`, `tone="neutral"`); quando `0`: valor `R$ 0,00` + hint `Sem crédito aprovado`; quando `>0`: valor + hint `Crédito disponível` |
| `Última Compra` | `Última compra` | hint `Pedido` ou `NF importada` conforme origem |

## 4. Aba Geral — endereço e campos vazios (alta)

Substituir o bloco atual por renderização condicional:

- Helper `fmt(v)` que devolve `<span className="text-muted-foreground italic">Não informado</span>` quando vazio.
- Endereço:
  - Concatenar `logradouro + numero` somente se houver `logradouro`; senão linha "Endereço não informado".
  - Linha 2: `bairro` quando existir; "Cidade/UF" só quando algum dos dois existir (com separador correto: `Caxias do Sul/RS`, `—/RS`, `Caxias do Sul`).
  - CEP: `cepMask(selected.cep)` ou "CEP não informado".
- Aplicar `fmt` em e-mail, telefone (com `phoneMask`), celular (com `phoneMask`), grupo econômico.

Quando `missingFields.length >= 3`, mostrar callout no topo da aba Geral:

```
[ ! ] Cadastro incompleto
      Faltam: <lista>
      [Completar cadastro]  ← navigate(`/clientes?editId=${id}`)
```

## 5. Origem do cadastro separada (média)

Detectar marcação de migração nas `observacoes` (regex `/Importado via faturamento histórico|IBGE:/i`):

- Se reconhecida: separar em duas seções na aba Geral:
  - **Observações comerciais** → resto do texto sem o trecho de auditoria, ou empty `Nenhuma observação cadastrada.`
  - **Origem do cadastro** → chip cinza pequeno com o trecho extraído (ex.: `Importado via faturamento histórico · IBGE 4308607`).
- Caso contrário: manter bloco único "Observações" como hoje.

## 6. Aba Vendas — distinção pedidos vs NF (média)

- Trocar título "Últimos Pedidos" por **"Pedidos de venda"**.
- Empty state: título `Nenhum pedido de venda encontrado`, mensagem `Pedidos comerciais cadastrados aparecerão aqui.`
- Trocar "Notas Fiscais de Saída" por **"Notas fiscais (saída)"** com sublabel `Inclui notas importadas sem pedido vinculado.`
- Quando `vendas.length === 0` E `notasSaida.length > 0`, exibir um pequeno banner informativo no topo: `Este cliente possui notas fiscais importadas, mas nenhum pedido de venda registrado.`

## 7. Empty states com CTA (alta)

- **Financeiro / Condições padrão**: quando `formas_pagamento` e `forma_pagamento_padrao` forem nulos, exibir botão `Definir condição financeira` → `navigate('/clientes?editId=' + id)`.
- **Financeiro / Lançamentos**: mensagem ampliada: `Quando houver contas a receber deste cliente, elas aparecerão aqui.`
- **Contatos**: `DetailEmpty` ganha prop `action` (já suportada — verificar) com botão `+ Registrar contato` (placeholder: `toast.info("Use o botão Editar para registrar comunicação.")` — **não** abre formulário novo nesta onda; apenas presença visual do CTA, redirecionando para edição).
- **Logística**: idem `+ Vincular transportadora` redirigindo para edição.
- **Preços** (`PrecosEspeciaisTab`): fora do escopo; já tem CTA próprio.

> Observação: criar formulários inline de contato/transportadora exige hooks/services novos → fora do escopo desta onda. Os CTAs roteiam para o formulário de edição existente, mantendo o drawer apenas como leitura+navegação.

## 8. Botão "Excluir" agrupado em "Mais ações" (média)

No slot `actions` publicado via `usePublishDrawerSlots`:

- Manter `[Editar]` como ação primária visível.
- Substituir os 2 botões "Excluir" / "Excluir definitivamente" por um único `DropdownMenu` "Mais ações" (`MoreHorizontal`) contendo:
  - `Excluir` (abre `ConfirmDialog` atual).
  - `Excluir definitivamente` (apenas se `isAdmin && !ativo`).
  - Itens "Duplicar cadastro / Ver histórico / Abrir financeiro" ficam **fora desta onda** (precisam handlers/serviços novos).

Reduz a faixa visual e esconde a ação destrutiva sem removê-la.

## Fora do escopo (não nesta onda)

- Mudar o botão de fechar do `DrawerHeaderShell` (afeta todos os drawers — exige onda transversal).
- Contadores nos rótulos das tabs (`Vendas (1)` etc.) — precisa repensar o layout `grid-cols-6` que já está apertado.
- Espaçamento vertical / ícones de seção / micro-tipografia (cosmético, baixa prioridade).
- Criar tabelas `cliente_contatos` ou inline-add de transportadoras.

## Detalhes técnicos

- Imports novos: `cpfCnpjMask, phoneMask, cepMask` de `@/utils/masks`; `AlertTriangle, MoreHorizontal` de `lucide-react`; `Tooltip, TooltipTrigger, TooltipContent` de `@/components/ui/tooltip`; `DropdownMenu*` de `@/components/ui/dropdown-menu`.
- Verificar se `DetailEmpty` aceita `action?: ReactNode`; se não, adicionar a prop opcional (alteração mínima e backward-compatible) ou renderizar o botão fora do componente.
- Helper `getMissingFields` definido **localmente** no arquivo (mesma assinatura/critério do `Clientes.tsx`); não extrair para shared agora — duplicação aceitável até a próxima onda de saneamento.
- Manter contrato de `usePublishDrawerSlots` — apenas conteúdo dos slots muda.
- Sem mudanças em tipos, services, RPCs, RLS, routes, edge functions ou tabelas.
