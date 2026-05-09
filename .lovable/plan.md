# Onda 31 — Drawer de Transportadoras

Foco: enriquecer o drawer (`src/components/views/TransportadoraView.tsx`) sem mudar regra de negócio. Trabalho de apresentação + uma query auxiliar leve.

## Alta prioridade

### 1. Máscara no CNPJ do cabeçalho
- Aplicar `cpfCnpjMask` em `transportadora.cpf_cnpj` antes de renderizar no `RecordIdentityCard`. Já é usado no grid.

### 2. KPI "Prazo médio" com microcopy claro
- `prazo_medio` preenchido → mostrar `{n} dias`.
- Vazio → `Não definido` (estado informativo, não `—`).

### 3. Aba Resumo mais rica
Reorganizar em 3 blocos com headings discretos:

**Identificação**
- CNPJ (formatado) · Modalidade (badge) · Cidade/UF · Status

**Contato principal**
- Responsável · Telefone (com `phoneMask`, ícone Phone, `tel:` link) · E-mail (ícone Mail, `mailto:` link)

**Indicadores logísticos**
- Prazo médio · Remessas ativas (em trânsito + pendentes) · Clientes vinculados

Cada campo vazio passa a mostrar copy contextual: `Não informado` / `Sem e-mail cadastrado` / `Sem responsável definido` / `Sem histórico` — em vez de `—`.

### 4. Estado vazio da aba Clientes acionável
- Manter `DetailEmpty`, mas adicionar CTA "Vincular cliente" que dispara `navigate('/transportadoras?editId=' + id)` e abre o modal de edição (já tem aba Clientes lá). Mesma rota usada pelo botão Editar.

### 5. Estado vazio da aba Obs.
- Trocar parágrafo solto por `DetailEmpty` (icon `FileText`, título "Sem observações") com CTA "Adicionar observação" → navega para edição.

## Média prioridade

### 6. Reduzir exposição do "Inativar"
- Manter `Editar` como ação primária (`variant="outline"`).
- Mover `Inativar` para um menu `Mais ações` (`DropdownMenu` com trigger `MoreVertical`), junto com `Excluir definitivamente` (quando admin + inativo).
- Confirmação destrutiva já existe (`ConfirmDialog`), mantida.

### 7. Aba Remessas mais informativa
- Em cada item, mostrar: cliente (linha 1, mais forte) → `RelationalLink` para remessa com label "Remessa · {rastreio || '—'}" → data prevista → status badge.
- Trocar `sem rastreio` itálico por `<Badge variant="outline">Sem rastreio</Badge>` discreto.

### 8. Padronizar contadores nas abas
- `Resumo` sem contador (raiz).
- `Clientes ({n})` · `Remessas ({n})` · `Obs. ({transportadora.observacoes ? 1 : 0})`.

## Baixa prioridade (incluir se trivial)

### 9. Permitir 2 linhas no nome do cabeçalho
- Verificar `RecordIdentityCard`: se hoje aplica `truncate`, ajustar o consumo aqui via prop ou wrapper para `line-clamp-2`. Se for ajuste no componente compartilhado, tratar como follow-up.

## Fora de escopo

- Reduzir destaque do botão fechar (controlado por `RelationalDrawerStack`/shell — fora do escopo deste drawer).
- "Última remessa" e "transportadora preferencial" no cabeçalho — preferencial não existe no schema; última remessa pode ser inferida mas adicionaria ruído ao header.
- Atalhos `WhatsApp` (precisa coluna ou parsing de telefone celular).

## Arquivos a alterar

- `src/components/views/TransportadoraView.tsx` — única mudança.
- (Reusa `cpfCnpjMask`/`phoneMask` de `src/utils/masks.ts`; usa `DropdownMenu` já existente em `@/components/ui/dropdown-menu`.)

## Validação

- Build passa.
- Conferir visual em `/transportadoras` abrindo um registro (desktop e mobile 390px).
- Confirmar que CTAs de estados vazios disparam o modal de edição corretamente.
- Confirmar fluxo Inativar via "Mais ações".
