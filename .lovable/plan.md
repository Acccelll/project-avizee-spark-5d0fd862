## Diagnóstico

**1. Pré-visualização bloqueada pelo Chrome**

`EtiquetaSimplesPreviewDialog.tsx` usa `<iframe src={blob:...}>` para renderizar o PDF. Chrome (a partir de versões recentes, e principalmente em ambientes embed/Lovable preview) bloqueia o plugin interno de PDF dentro de iframes com URL `blob:`, exibindo o ícone de "documento quebrado" da captura. O resto do sistema (ex.: `OrcamentoForm` linhas 1330-1430) **não** previewa PDF em iframe — renderiza um **mock A4 em HTML** dentro de um stage com `transform: scale()`, e só gera o PDF de fato no clique de "Baixar PDF". Esse é o padrão canônico do projeto.

**2. Busca de cliente fora do padrão**

Padrão canônico (em `OrcamentoForm.tsx` linhas 1110-1135): `AutocompleteSearch` (busca por nome/CNPJ com teclado) + botão lateral `ClientSelector` (lista completa em modal) + ação "Cadastrar novo".

Pontos onde o padrão NÃO é seguido (usam `<Select>` nativo, que vira a lista enorme da captura 2):
- `src/pages/RemessaForm.tsx` — campo Cliente (linha 272).
- `src/pages/financeiro/components/FinanceiroLancamentoForm.tsx` — campo Cliente (linha 164) e Fornecedor (linha 175).

Não há outros casos de `<Select>` listando `clientes`/`fornecedores` em massa fora destes.

---

## Plano

### A. Corrigir preview de etiquetas (substituir iframe por mock HTML)

Refatorar `EtiquetaSimplesPreviewDialog.tsx` para seguir o padrão do orçamento:

- Remover `iframe` + `URL.createObjectURL` da etapa de preview.
- Criar componente interno `EtiquetaSimplesA4Preview` que desenha **as 4 etiquetas em HTML/Tailwind** dentro de uma folha `210mm × 297mm` (grade 2×2, mesmas medidas/paddings do PDF), reutilizando `montarItensEtiqueta` + `validarEtiquetas` do service (sem gerar PDF).
- Stage com `overflow-auto`, `transform: scale(autoScale)`, paginação (botões ‹ ›) quando houver mais de 4 etiquetas (mais de 1 página).
- Botões da toolbar:
  - **Baixar PDF** → chama `gerarPdfEtiquetasSimplesA4(validas)` e dispara download (mantém `jsPDF` atual).
  - **Imprimir** → mesma geração + `window.open` em nova aba (não-bloqueada, é gesto direto do usuário) ou `window.print()` numa janela dedicada com o HTML do mock (preferir `window.open` do blob no clique, pois Chrome permite quando é click direto — diferente do auto-load atual).
- Banner amarelo de inválidas continua igual.
- Manter assinatura do service (não muda).

### B. Padronizar busca de cliente/fornecedor

**B1. `RemessaForm.tsx`** — substituir `<Select>` de Cliente por:
```
<AutocompleteSearch options={clienteOptions} value={cliente_id} onChange={...}
  placeholder="Buscar por nome ou CNPJ..."
  onCreateNew={() => setQuickAddOpen(true)} createNewLabel="Cadastrar novo cliente" />
<ClientSelector clientes={clientes} onSelect={(c) => setF({cliente_id: c.id})}
  trigger={<Button variant="outline" size="icon"><Search/></Button>} />
```
(Já existe `setQuickAddOpen` para transportadora; criar análogo para cliente reaproveitando `ClienteQuickAddModal` se existir, ou apenas omitir `onCreateNew` se não houver — verificar antes na execução.)

**B2. `FinanceiroLancamentoForm.tsx`** — mesmo tratamento para os campos **Cliente** e **Fornecedor**, usando `AutocompleteSearch` (com `FornecedorSelector` se existir; senão só `AutocompleteSearch`).

`clienteOptions`/`fornecedorOptions` no formato `{value: id, label: nome_razao_social, sublabel: cpf_cnpj}` já consumido pelo `AutocompleteSearch`.

### C. Memória

Atualizar `.lovable/memory/features/etiqueta-simples-logistica.md`:
- Preview agora é mock HTML A4 (não iframe de PDF) — evita bloqueio do Chrome.
- PDF gerado apenas no clique Baixar/Imprimir.

Adicionar memória `mem://tech/busca-de-cliente-padrao.md` (preference) declarando: campos de seleção de cliente/fornecedor devem usar `AutocompleteSearch` + `ClientSelector` (botão lupa), nunca `<Select>` puro com a lista completa.

### D. Validação manual

1. `/logistica` aba Remessas → "Etiqueta simples" individual e em lote → preview aparece **sem** ícone quebrado, mostrando as etiquetas renderizadas.
2. Clicar **Baixar PDF** → arquivo `.pdf` gerado e baixado com layout idêntico.
3. Clicar **Imprimir** → abre nova aba do PDF.
4. `/remessas/novo` → campo Cliente é busca tipo orçamento.
5. `/financeiro` → novo lançamento receber/pagar → Cliente/Fornecedor com busca.

### E. Pontos pendentes (futuro)

- Substituir progressivamente os outros `<Select>` de catálogos longos (transportadoras, produtos em filtros) pelo mesmo padrão.
- Numeração de volumes na etiqueta.
- Endereço de entrega alternativo por OV/NF.

---

## Detalhes técnicos

- Chrome bloqueia PDF embed em iframes `blob:` quando o conteúdo é renderizado pelo plugin interno do navegador em contextos com sandbox/CSP restritiva (caso do preview do Lovable). Solução robusta: não embedar PDF no preview — render HTML idêntico ao PDF e gerar o `.pdf` só no download.
- Mock HTML usará `mm` (`width:210mm; height:297mm`), grade `display:grid; grid-template: repeat(2,1fr)/repeat(2,1fr); gap:4mm; padding:8mm` espelhando as constantes `PAGE_W/MARGIN/GAP/ETI_W/ETI_H` do service.
- `AutocompleteSearch` já existe em `src/components/ui/AutocompleteSearch.tsx` e `ClientSelector` em `src/components/ui/DataSelector.tsx` — ambos já tipados, sem deps novas.
