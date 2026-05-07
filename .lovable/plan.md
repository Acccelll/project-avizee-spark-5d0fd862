
# Revisão End-to-End — Onda 8 (Relatórios · Workbook · Apresentação · Budget)

## 1. Resumo da Onda 8

A Onda 8 consolida toda a camada **analítica e de output executivo** do AviZee. Hoje ela cobre:

- **Relatórios Operacionais** (`/relatorios`) — 20 relatórios em 5 categorias (financeiro, comercial, compras, estoque, cadastros), com catálogo, filtros canônicos (`PeriodoFilter` próprio), KPIs, gráficos (recharts), tabela (`DataTable`), drill-down, exportação CSV/XLSX/PDF, favoritos persistidos e preview pré-impressão.
- **Workbook Gerencial** (`/workbook-gerencial`) — geração de planilha .xlsx (exceljs) consumindo views materializadas `vw_workbook_*`, dois modos (dinâmico/fechado), histórico, download e CSV de histórico.
- **Apresentação Gerencial** (`/apresentacao-gerencial`) — geração de .pptx (pptxgenjs), templates, comentários editáveis, fluxo de aprovação (rascunho → revisão → final), cadências automáticas, telemetria de slides.
- **Budget Mensal** (`/budget`) — input manual de metas (`budgets_mensais`) consumido pelo Workbook nas colunas Δ% / orçado.
- **Camada de dados:** `relatorios.service` (dispatcher) com 6 loaders dedicados; `lib/workbook/fetchWorkbookData` agregando 21 fontes; `lib/apresentacao/fetchPresentationData`. Views `vw_workbook_*` definidas em `20260411210000_workbook_gerencial.sql` (97 ocorrências em migrations).

Arquitetura geral é sólida e em linha com a doutrina do projeto (statusKind canônico, design tokens, RLS). Esta revisão consolida os gaps remanescentes que ainda atrapalham confiabilidade dos números, performance e mobile.

---

## 2. Problemas críticos (bloqueiam confiança/uso)

1. **DRE com heurística de substring frágil** — `loaders/financeiro.ts:310` classifica CMV verificando `descricao.toLowerCase().includes("compra")`. Viola a regra "status/tipo nunca por substring" e produz CMV inflado/deflacionado conforme o operador escreve "Compra de mat.", "compra avulsa", "compras gerais". Precisa ler `nota_fiscal_id IS NOT NULL` + categoria contábil real (`conta_contabil_id`) ou `tipo_documento`.
2. **PDF sem *streaming* nem aviso real de risco** — `useRelatorioExport` corta em 200 linhas e mostra um toast, mas o usuário só percebe a perda de dados depois do download. O aviso precisa aparecer **antes** (modal de confirmação com opção "Excel completo") e o builder não tem proteção contra colunas extra-largas (overflow horizontal silencioso em relatórios com 12+ colunas).
3. **Workbook modo "fechado" perde V2** — `fetchClosedModeData` retorna `dre/caixaEvolutivo/vendasVendedor/abc/regiao/funil/comprasFornecedor/giro/critico/logistica/fiscal/budget = []` sem qualquer aviso visual no XLSX. O usuário gera um workbook vazio nas abas analíticas sem entender por quê.
4. **Origem dos dados não é declarada nos outputs** — Nem o PDF (export.service), nem o Workbook, nem a Apresentação carimbam **fonte/escopo/modo de geração** ("dinâmico vs fechado", "view vs snapshot"), conforme exige o ponto crítico #1 do escopo. Dois usuários comparando o mesmo relatório em momentos diferentes não conseguem reconciliar.
5. **`useRelatorio` não invalida quando os módulos de origem mudam** — `staleTime` 10min e `queryKey: ['relatorio', tipo, filtros]` isolam relatórios das mutations dos módulos. Vender um pedido / pagar um título não atualiza KPIs/DRE até refetch manual ou 10min. Falta `queryClient.invalidateQueries({ queryKey: ['relatorio'] })` nos pontos de mutação críticos (financeiro, faturamento, compras, estoque, fiscal).
6. **Sem limite no Excel/CSV** — exporta 100% das linhas em memória; em `vendas`, `movimentos_estoque`, `aging` (centenas de milhares) trava o navegador. Precisa de teto + chunked export OR aviso quando `rows.length > 10000`.
7. **`BudgetMensal` sem chave única** — não há `UNIQUE(competencia, categoria, centro_custo_id)`. Possíveis duplicatas inflam o orçado e quebram comparativos no Workbook.
8. **Apresentação consome `slides_json.ativos` com `as any`** (`ApresentacaoGerencial.tsx:55`) e `dataAvailability` com regra `!c.comentario_automatico?.includes('indisponíveis')` — outra heurística de substring para indicar disponibilidade. Precisa flag estruturada (`dados_indisponiveis: boolean`).

## 3. Problemas altos

9. **Catálogo `RelatorioCatalogo` inteiro é montado mesmo quando o usuário já selecionou um tipo** (chave `tipo` no URL). Mantido como rota independente seria mais barato; hoje renderiza KPI cards e descrições em todos os render passes do `Relatorios.tsx`.
10. **Loaders não paginam** — `vendas`, `compras`, `aging`, `movimentos_estoque` puxam até o limite default (1000 do Supabase) e silenciosamente truncam. Sem warning na UI; KPIs ficam errados quando há 1001+ registros.
11. **`PeriodoFilter` local diverge do `PeriodFilter` global canônico** (`mem://produto/contrato-de-periodos`). Faltam presets `15d`, `90d`, `year` e o suporte a `direction` futura. Usuário muda padrão entre módulos.
12. **DRE: deduções por NF saída independe do regime de caixa** — receita por `valor_pago` (cash basis) mas deduções por `data_emissao` (regime de competência). Mistura métodos sem aviso, distorcendo Receita Líquida.
13. **`isQuantityReport` propaga via `_isQuantityReport`/`_isDreReport`** com prefixo underscore (legado). Migrar tudo para `meta.kind` / `meta.valueNature` (já existe parcialmente). Risco baixo, mas confuso para novos loaders.
14. **Apresentação `numericPairs/findArrayRows` é heurístico** — chuta o que renderizar via inspeção do dicionário (`generatePresentation.ts:32-60`). Slide novo com schema diferente quebra silenciosamente. Falta esquema declarado por `SlideCodigo`.
15. **`fetchWorkbookData` faz 21 fetchs em paralelo** sem `AbortController`. Se o usuário fechar o dialog enquanto gera, fluxos continuam consumindo conexões/Bandwidth.
16. **Budget — sem suporte a centro de custo na UI** apesar do schema permitir (coluna `centro_custo_id`); workbook recebe sempre `null`.
17. **Mobile: tabela colapsada por padrão dificulta cópia/seleção** (Relatorios.tsx:667). Para relatórios pequenos (<10 linhas) o usuário precisa abrir explicitamente — defaultOpen quando `rows<=15`.

## 4. Melhorias médias / baixas

18. **Persistir `hiddenColumns`** por `tipo` em `localStorage` (UX recorrente).
19. **Gráfico**: oferecer toggle pizza ↔ barras (chart-type override) sem precisar editar `relatoriosConfig`.
20. **Workbook**: nome de arquivo poderia incluir `modo` (`workbook_gerencial_2026-01_2026-03_dinamico_xxx.xlsx`).
21. **Apresentação**: indicador de progresso por slide durante geração (hoje só "Gerando…").
22. **Relatórios**: barra "Atualizado há X" para reforçar que é um snapshot cacheado por 10min.
23. **Budget**: import CSV em massa e botão "Replicar último mês".
24. **Favoritos**: agrupar por categoria e suportar reordenação.

## 5. Problemas mobile

25. **`PeriodoFilter` local ocupa duas linhas** (`Hoje 7d 30d Mês Personalizado`) — quebra em viewports <360 px.
26. **`ExportMenu` no card desktop não está espelhado para mobile** dentro do Sheet de filtros — usuário precisa fechar o sheet, ver tabela, scroll até o final. Adicionar acesso a "Exportar" no header mobile.
27. **Gráfico (recharts) avisa `width(0) height(0)`** (visto no console). Container `h-56` pode renderizar antes do layout nas tabs/sheets — wrap com `<ResponsiveContainer minHeight={224}>` e usar `aspect`.
28. **Workbook/Apresentação**: o botão "Gerar" é um dialog que **não cabe** em smartphones <375px (formulário tem 5 colunas em sm:grid-cols-5). Precisa stack vertical até md.
29. **DataTable**: `mobileStatusKey/mobileIdentifierKey` derivados heuristicamente; em relatórios sem coluna textual (DRE, fluxo) o cartão mobile fica sem identificador.

## 6. Problemas desktop

30. **`Relatorios.tsx` 800 linhas** — mistura dispatch, layout, KPIs, render. Quebrar em `RelatorioWorkspace` (estado), `RelatorioFiltrosBar` (filtros desktop+mobile sheet), `RelatorioBody` (KPIs+chart+tabela).
31. **Densidade compacta** afeta apenas KPI cards, não a tabela. Usuário espera tabela densa também.
32. **Coluna `Ações` (drill-down)** sempre à direita, mesmo em layouts horizontais largos. Considerar flutuante/sticky.
33. **Apresentação: `ApresentacaoTelemetriaPanel`, `TemplateManager`, `CadenciaManager`** todos visíveis simultaneamente — página fica longa demais. Consolidar em abas.

## 7. Problemas de dados / performance

34. **DRE/Workbook/Apresentação não usam o **mesmo** dado fonte** — DRE em Relatórios usa `financeiro_lancamentos` cru, Workbook usa `vw_workbook_dre_mensal`, Apresentação usa `fetchPresentationData`. Possível divergência numérica entre as 3 visões para o mesmo período. Precisa de **uma view canônica** + 3 consumidores.
35. **Views `vw_workbook_*` não estão indexadas** para `competencia` (substring `slice(0,7)` em PG retorna texto sem usar índice em date). Em produção com >2 anos de histórico a geração demora >10s.
36. **Sem cache server-side para o Workbook** — toda geração refaz 21 queries. Considerar `workbook_geracoes.parametros_json + hash` como cache lookup antes de gerar.
37. **`fetchPresentationData` repete queries do Workbook** sem reuso. Quando ambos rodam em sequência, dobra a carga.

## 8. Problemas frontend / services / hooks

38. **`useRelatoriosFiltrosData` busca clientes/fornecedores/grupos** sem filtros — para tenants com 5k clientes, cada entrada na tela puxa lista inteira. Já tem `limits` mas precisa de **server-side search** no select.
39. **Tipos `RelatorioResultado` largos com `_isQuantityReport` / `_isDreReport`** legados — limpar e tipar via `meta.kind` discriminado.
40. **`(supabase as any).from(...)` em fetchWorkbookData** — ~21 ocorrências. Gerar tipos das views (`Database['public']['Views']`) e remover `any`.
41. **`useRelatorioExport` não invalida nada**, mas registra timing/`isExporting` por hook instance. Expor `exportProgress` (start/end) para UI mais rica.
42. **`relatoriosFavoritos.service`** não valida unicidade no client (server tem). Toast genérico em duplicate.
43. **Apresentação: `dataAvailability` reconstruído por reduce em todo render** — memorizar com `useMemo`.

---

## 9. Plano de Execução

Sprints incrementais; cada sprint encerra com build verde e itens marcados em `.lovable/plan.md`. Risco classificado: 🟢 baixo · 🟡 médio · 🔴 alto.

### Sprint 8.1 — Confiabilidade dos números (🔴)
- 8.1.1 DRE cash basis vs competência: documentar e oferecer toggle no filtro (`competencia | caixa`). Loader recalcula deduções do método escolhido.
- 8.1.2 Substituir heurística "compra" no CMV por classificação estruturada (`nota_fiscal_id IS NOT NULL` + tag `tipo_lancamento_dre`).
- 8.1.3 Carimbo de origem (modo, data de geração, view de fonte) no rodapé do PDF, capa do XLSX, capa da PPTX.
- 8.1.4 View canônica `vw_dre_periodo` consumida por Relatórios + Workbook + Apresentação (eliminar 3 cálculos paralelos).
- 8.1.5 `BudgetMensal`: migration `UNIQUE(competencia, categoria, COALESCE(centro_custo_id, '00000000-...'))`.

### Sprint 8.2 — Exportação segura (🟡)
- 8.2.1 Modal pré-export PDF com `recordCount` real, alerta visual quando >200, opção "exportar Excel".
- 8.2.2 Limite Excel/CSV configurável (default 10000) + aviso e opção "continuar".
- 8.2.3 Em PDF: layout de página A3 quando colunas >10; fallback para "muitas colunas → use Excel".
- 8.2.4 Worker para geração de XLSX/PDF (off main thread) — opcional via flag.

### Sprint 8.3 — Cache e invalidação cross-módulo (🟡)
- 8.3.1 Helper `invalidateRelatoriosByDomain(domain)` chamado em mutations de Financeiro, Comercial, Compras, Estoque, Fiscal.
- 8.3.2 Selo "Atualizado há X · Atualizar" exposto em `ReportHeader`.
- 8.3.3 Detect `rows.length === 1000` e exibir warning "Resultado pode estar truncado".

### Sprint 8.4 — Workbook & Apresentação robustos (🟡)
- 8.4.1 Modo fechado: avisos visuais por aba ("snapshot fechado não disponibiliza este corte") em vez de aba vazia.
- 8.4.2 Cache de geração via `hash_geracao` — se idêntico nos últimos 24h, devolver artefato existente.
- 8.4.3 Apresentação `dataAvailability` estruturado (campo `dados_indisponiveis: boolean` em `comentarios`).
- 8.4.4 Schema declarado por `SlideCodigo` (substituir `numericPairs/findArrayRows`).
- 8.4.5 `AbortController` em `fetchWorkbookData` / `fetchPresentationData`.

### Sprint 8.5 — Mobile UX (🟢)
- 8.5.1 Migrar `PeriodoFilter` local para `PeriodFilter` canônico (presets 15d/90d/year + responsive wrap).
- 8.5.2 Botão "Exportar" dentro do sheet mobile de filtros.
- 8.5.3 Wrap recharts com `minHeight` e `<div className="aspect-[4/3]">` para evitar warnings 0×0.
- 8.5.4 Workbook/Apresentação dialog: stack vertical até md.
- 8.5.5 DataTable mobile defaultOpen quando ≤15 rows.

### Sprint 8.6 — Refactor Relatorios.tsx (🟢)
- 8.6.1 Quebrar em `RelatorioWorkspace`, `RelatorioFiltrosBar`, `RelatorioBody`, `RelatorioKpiGrid`.
- 8.6.2 Eliminar flags `_isQuantityReport/_isDreReport`; usar discriminated union em `meta`.
- 8.6.3 Persistir `hiddenColumns` por `tipo` em `useDataTablePrefs` existente.

### Sprint 8.7 — Tipagem e qualidade (🟢)
- 8.7.1 Gerar tipos das `vw_workbook_*` e remover `(supabase as any)` em fetchWorkbookData.
- 8.7.2 Server-side search nos selects de cliente/fornecedor (`useRelatoriosFiltrosData`).
- 8.7.3 Memoizar `dataAvailability` em ApresentacaoGerencial.
- 8.7.4 Testes adicionais: substring DRE, limite PDF, modo fechado vazio.

### Sprint 8.8 — Polimento (🟢)
- Favoritos por categoria, replicar Budget do mês anterior, indicador de progresso por slide, telemetria de geração.

---

## Critérios de aceite globais
- Zero heurísticas de substring para status/tipo (grep `.toLowerCase().includes(` nos loaders zera).
- PDF nunca exporta sem confirmação quando >limit; XLSX avisa quando >10k.
- Mesmo período + mesma fonte → DRE bate em Relatórios, Workbook e Apresentação (teste e2e).
- Mobile (375 px) sem overflow horizontal nas 4 telas; gráfico sem warnings 0×0 no console.
- Mutations de Financeiro/Comercial/Compras/Estoque invalidam queries de relatório.
- Relatorios.tsx ≤ 400 linhas após refactor.
