## Objetivo

1. Permitir **repetir** cada etiqueta de uma remessa N vezes para preencher melhor a folha A4 (4 slots/folha).
2. Melhorar a **pré-visualização** (visibilidade da folha inteira, zoom, ajuste à tela).

## 1. Repetição de etiquetas

### Regras
- **Modo automático (padrão):** distribuir as 4 vagas da folha igualmente entre as remessas selecionadas.
  - 1 remessa → 4 cópias
  - 2 remessas → 2 cópias cada
  - 3 remessas → 1 cópia cada (1 vaga em branco) ou 2/1/1 — usaremos 1/1/1 para não duplicar de forma desigual; usuário pode alterar manualmente.
  - 4 remessas → 1 cópia cada
  - 5+ remessas → 1 cópia cada (gera múltiplas folhas, sem repetição)
- **Modo manual:** controle numérico (0–20) por remessa no header da pré-visualização, ou um único campo "cópias por etiqueta" quando todas iguais.
- Total de etiquetas geradas = soma das cópias × remessas válidas. Pode ocupar várias páginas.

### UI
No `EtiquetaSimplesPreviewDialog`, abaixo do header, adicionar uma barra de controles:
- Campo numérico **"Cópias por remessa"** (default = sugerido pelo modo automático, mín 1, máx 20).
- Botão **"Auto preencher A4"** que reseta para o modo automático.
- Quando há mais de uma remessa, mostrar um pequeno popover **"Personalizar por remessa"** com lista (remessa → input qty). Opcional, bom-ter; entregamos no mesmo PR se couber simples.

### Implementação
- Em `EtiquetaSimplesPreviewDialog.tsx`:
  - Estado `copiasPorRemessa: Record<string, number>`.
  - Helper `expandirItens(validas, copiasPorRemessa) → EtiquetaSimplesItem[]` que repete cada item N vezes preservando ordem (todas as cópias da remessa A antes da B, para facilitar separação física).
  - `pageItems` e `gerarPdfEtiquetasSimplesA4` passam a usar a lista expandida.
  - Recalcular default (autoFill) quando `validas` muda: `Math.max(1, Math.floor(4 / validas.length))`.

Service não muda — continua recebendo a lista já expandida.

## 2. Melhorar pré-visualização

Hoje a folha A4 (210×297mm = ~794×1123px @96dpi) é maior que o dialog (~5xl × 90vh) e aparece cortada.

Mudanças em `FolhaA4Preview` / dialog:
- Calcular **escala** dinâmica via `useResizeObserver`/`useLayoutEffect` no container: `scale = min(containerW / 210mm, containerH / 297mm) * 0.95`.
- Aplicar `transform: scale(N)` + `transform-origin: top center` num wrapper que envolve a folha; usar dimensões reais (mm) no filho e dimensões escaladas no wrapper para que o scroll seja correto.
- Adicionar controles de **zoom** no rodapé do preview (junto com paginação): `−`, `nível%`, `+`, `Ajustar`. Range 25%–150%, step 10%.
- Mostrar borda/sombra mais marcada da folha + fundo cinza claro para parecer "papel sobre mesa".
- Mostrar **"Folha X de Y · N etiqueta(s) totais"** no header.

## 3. Detalhes técnicos

Arquivos:
- `src/components/logistica/EtiquetaSimplesPreviewDialog.tsx` — adiciona estado `copiasPorRemessa`, controles de cópias, controles de zoom, expansão de itens, refs de medida.
- `src/services/logistica/etiquetasSimples.service.ts` — sem mudanças (já aceita array genérico).
- `.lovable/memory/features/etiqueta-simples-logistica.md` — atualizar nota: "suporta repetição de etiqueta para preencher A4; controle no dialog".

Sem migrações, sem novas dependências.

## 4. Testes manuais

1. Selecionar 1 remessa → preview mostra 4 cópias na mesma folha; baixar PDF e conferir 4 idênticas.
2. Selecionar 2 remessas → preview mostra 2+2 numa folha (todas da A primeiro, depois B).
3. Alterar "Cópias por remessa" para 3 com 2 remessas → 6 etiquetas em 2 folhas (4+2).
4. Alterar para 1 com 1 remessa → 1 etiqueta + 3 vagas tracejadas.
5. Zoom in/out e "Ajustar" funcionam; folha sempre legível dentro do dialog.
6. Dados inválidos continuam aparecendo no banner amarelo e não entram no PDF.

## 5. Pendências futuras (fora deste PR)

- Numeração "X de Y" por volume na etiqueta.
- Ajuste por remessa via popover (se não couber agora).
- Salvar preferência de "cópias padrão" por usuário.
