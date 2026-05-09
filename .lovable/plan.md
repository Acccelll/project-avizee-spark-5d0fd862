# Onda 30 — Melhorias no Grid de Transportadoras

Foco: transformar a listagem em uma ferramenta logística mais útil sem mexer em regra de negócio. Trabalho 100% em apresentação (`src/pages/Transportadoras.tsx`).

## Alta prioridade

### 1. Máscara CPF/CNPJ na coluna Documento
- Reaproveitar `cpfCnpjMask` de `src/utils/masks.ts`.
- Render: badge discreto `PF`/`PJ` + documento formatado `44.914.992/0001-38`.
- Mantém tipografia mono e cor atual; só corrige a leitura.

### 2. Padronizar telefone na célula Contato
- Aplicar `phoneMask` (já existe) sobre `t.telefone` antes de renderizar.
- Adicionar ícones discretos (`Phone`/`Mail` 12px, cor `muted-foreground`) antes de cada linha.
- Manter empilhado na mesma coluna (desktop não ganha coluna nova).

### 3. Prazo médio com estado claro
- Substituir o `—` por microcopy contextual:
  - `prazo_medio` preenchido → `{n}d` (igual hoje).
  - vazio → `Não definido` em itálico/`text-muted-foreground` com tooltip "Prazo médio ainda não cadastrado".
- Sem mudança de schema; só apresentação.

### 4. Modalidade como badge
- Substituir o texto simples por `<Badge variant="outline">` com label de `MODALIDADE_LABEL`.
- Cor neutra (sem semântica de status) para diferenciar de StatusBadge.

### 5. Coluna Status por linha
- Remover `hidden: true` da coluna `ativo` para que ela apareça no desktop também (já existe `StatusBadge`).
- Posicionar como última coluna antes de Ações.

## Média prioridade

### 6. Cards de topo mais acionáveis
- Trocar o card "Inativas" por "Sem prazo médio" (conta `data.filter(t => !t.prazo_medio).length`, ícone `Clock`).
- Manter "Total" e "Ativas".
- Adicionar 4º card "Sem contato" (sem telefone E sem e-mail), ícone `PhoneOff`, variante `warning` se >0.
- Card "Inativas" continua acessível via filtro de Status — não perde funcionalidade, só sai do topo.

### 7. Toolbar mais compacta
- Já usa `AdvancedFilterBar`, então o espaço grande vem de `ModulePage` distribuir flex. Ação: revisar se há `flex-1`/`justify-between` deixando gap excessivo entre filtros e ações.
- Se o espaçamento for do `AdvancedFilterBar`, validar com snapshot visual antes de mudar (componente é compartilhado — qualquer ajuste deve ser opt-in para não quebrar outras telas).

## Fora de escopo (registrar como follow-up, não implementar agora)

- Filtro por UF/cidade na toolbar (precisa decisão de UX em outras telas para manter consistência).
- Indicador de transportadora preferencial (depende de modelo de dados — coluna ainda não existe em `transportadoras`).
- Ações rápidas por linha (ligar, e-mail, WhatsApp).
- Modo compacto/confortável.

## Arquivos a alterar

- `src/pages/Transportadoras.tsx` — única mudança.
- (Nenhuma migração, nenhum service novo, nenhum schema novo.)

## Validação

- Build passa.
- Verificar visual no preview em `/transportadoras` (desktop 1515px e mobile).
- Confirmar que filtros por Status/Modalidade continuam funcionando.
- Confirmar que tooltip do "Não definido" aparece.

Pronto para implementar quando aprovado.
