# Onda 42r — Drawer de Pedidos: clareza operacional

Refinamento exclusivamente UI/UX no drawer `OrdemVendaView` (e dois ajustes pontuais no Timeline e CTA da aba Logística). Sem alterações de schema, RPCs ou regras de negócio. Reaproveita `verificarPrerequisitosNF` já existente (hoje usado só na grid `Pedidos.tsx`).

## Alta prioridade

1. **Cancelar → Cancelar pedido + aviso forte**
   - Renomear o botão desktop de `Cancelar` para `Cancelar pedido` (dropdown mobile já usa esse rótulo).
   - No diálogo de cancelamento, ampliar a descrição: explicar impactos (faturamento, logística, vínculo com orçamento) e que é **irreversível**; bloqueio quando há NF ativa já é tratado, mas reforçar o aviso.

2. **Gerar NF com checklist de pré-requisitos** (reuso)
   - Carregar `verificarPrerequisitosNF(selected.id)` quando o usuário abrir `setGenerateNfOpen(true)` (state local + `useEffect`).
   - No `CrossModuleActionDialog`, prefixar a lista de `impacts` com itens de pendência (tone `warning`) quando houver issues; quando não houver, exibir `Pré-validação OK` (tone `success`).
   - Trocar `confirmLabel` para `Gerar NF assim mesmo` quando houver pendências (sem bloquear — a RPC continua sendo a autoridade final).
   - Aplicar a mesma checklist no botão `Gerar NF` do empty-state da aba Faturamento.

3. **Status “Aguardando” → rótulo específico**
   - Manter a fonte `statusFaturamentoLabels` mas criar um helper local que troca `Aguardando` por `Aguardando NF` quando renderizado **fora do contexto de Faturamento** (header/KPI). Na aba Faturamento o rótulo já é claro pelo contexto (`Situação: Aguardando NF`).

4. **KPI Peso Total**
   - Quando `pesoTotal === 0`: exibir `0,00 kg` + sub-rótulo `peso não informado` em `text-warning` (mantendo grid). Remove o traço `—`.

5. **Aba Itens — composição de totais**
   - Após a tabela, expandir o bloco de total para mostrar:
     - `Subtotal dos itens` (soma `valor_total` dos `items`).
     - `Diferença` (= `selected.valor_total - subtotal`) com label `Ajustes/Frete/Impostos` quando ≠ 0; clicar leva para aba Faturamento.
     - `Total do pedido` em destaque.
   - Mostrar SKU/variação já existem; adicionar pequeno badge `Faturado` no item quando houver NF confirmada vinculada (heurística simples: `notasFiscais.some(n => ['confirmada','autorizada'].includes(n.status))` aplicada a todos os itens — sem mapeamento por item, mantendo escopo UI).

## Média prioridade

6. **Timeline — `shortLabel` para NF**
   - Em `OrdemVendaView`, passar `shortLabel: "NF"` no step `nf` para evitar truncamento `Nota F...` em mobile (componente já suporta `shortLabel`).
   - Também passar `shortLabel: "Orçamento"` e `shortLabel: "Pedido"` para consistência.

7. **Aba Logística — CTA `Criar remessa`**
   - Em `LogisticaRastreioSection` (apenas o empty-state visto pelo drawer): substituir/adicionar CTA primário `Criar remessa` que navegue para `/logistica?tab=remessas&from_pedido={id}` (parâmetro novo somente leitura, sem mudança de schema). O link `Ir para Remessas` vira ação secundária. *(Out of scope: criar a remessa de fato — apenas direcionar com contexto.)*

8. **Aba Resumo — agrupar em mini-cards**
   - Reorganizar conteúdo em 3 blocos visuais (`bg-card border rounded-lg p-3`):
     - **Cliente**: nome (link).
     - **Origem**: orçamento + PO (quando existirem).
     - **Operação**: frete + prazo + condição de pagamento + datas.
   - Compactar o bloco "Escopo de edição do pedido" para 1 linha (`Edição operacional · itens, valores e vínculos permanecem...`).

9. **Aba Vínculos — abrir cliente/orçamento direto**
   - Já usam `RelationalLink`; adicionar ícones `ExternalLink` (lucide) e tooltip "Abrir em drawer" para reforço visual. Sem mudança de comportamento.

## Baixa prioridade

10. Tooltips nos badges de status (KPI Faturamento + header) com a descrição operacional curta (ex.: `Aguardando emissão de NF`).
11. Microcopy do empty-state de NFs (`Nenhuma NF emitida ainda` → `Pedido ainda não foi faturado`).

## Fora de escopo

- Lógica fiscal real (CFOP/CST/estoque) — `verificarPrerequisitosNF` já cobre IE/condição/NCM e a SEFAZ valida o restante.
- Criação de remessa direto do drawer (apenas redireciona).
- Mapeamento item-a-item de "faturado" via `notas_fiscais_itens` (mantém heurística simples por NF).
- Mudanças em RPCs, schema, RLS, permissions.

## Detalhes técnicos

**Arquivos a editar (apenas frontend):**
- `src/components/views/OrdemVendaView.tsx` — itens 1, 2, 3, 4, 5, 6, 8, 9, 10, 11.
- `src/components/logistica/LogisticaRastreioSection.tsx` — item 7 (somente empty-state CTA).

**Estado novo no drawer:**
```ts
const [nfIssues, setNfIssues] = useState<NFPrerequisiteIssue[]>([]);
const [nfIssuesLoading, setNfIssuesLoading] = useState(false);

useEffect(() => {
  if (!generateNfOpen || !selected) return;
  setNfIssuesLoading(true);
  verificarPrerequisitosNF(selected.id)
    .then(setNfIssues)
    .finally(() => setNfIssuesLoading(false));
}, [generateNfOpen, selected]);
```

**Render dos `impacts` no `CrossModuleActionDialog`:** pré-pendar `nfIssues.map(i => ({ label: i.label, tone: 'warning' }))` antes dos impacts atuais; `confirmLabel` condicional.

**Composição de totais (aba Itens):**
```ts
const subtotalItens = items.reduce((s, i) => s + Number(i.valor_total || 0), 0);
const diferenca = Number(selected.valor_total || 0) - subtotalItens;
```

**Validação:** rodar `tsc` (build automático). Sem novas dependências.
