# Onda 41c — Editar Grupo Econômico (mobile)

Foco: aliviar o topo, reduzir altura útil consumida por elementos fixos e tornar a edição menos longa em telas ≤ 768px. Sem mudanças de schema, RLS, ou lógica de negócio. Apenas `src/pages/GruposEconomicos.tsx` e ajustes mínimos em `src/components/FormModal.tsx` / `FormModalFooter.tsx` se necessário.

## Alta prioridade

### 1. Header mais leve no mobile
- "Ver painel" como **link discreto** no mobile (`variant="ghost"`, ícone + texto pequeno) e mantém botão `outline` no desktop (`hidden sm:inline-flex` / `sm:hidden`).
- Reduzir o `meta` no mobile: manter apenas `Cadastrado em DD/MM/AAAA`. Os indicadores "Nenhuma empresa vinculada" e "Sem matriz definida" passam a ser uma **única linha condensada** ao final do meta: `Sem empresa · Sem matriz` (texto curto, sem ícones), só renderizada quando ao menos um for verdadeiro.
- Remover o `Star` repetido no meta (já há indicação de matriz no bloco dedicado).

### 2. Título sem truncamento
- Passar `title="Editar Grupo"` no mobile e `"Editar Grupo Econômico"` no desktop (alternativa mais simples: encurtar para `"Editar Grupo"` em ambos — proposta na implementação).
- Ajuste mínimo no `FormModal.tsx`: o `DialogTitle` já tem `truncate`; trocar para `truncate sm:truncate` mantendo wrap em mobile (`break-words leading-tight`) — ver seção técnica.

### 3. Footer mais compacto
- No mobile, "Cancelar" vira **link secundário** (`variant="link"`, altura natural) e "Salvar Alterações" continua como botão sólido full-width.
- O footer sticky atual já existe. Apenas ajuste em `FormModalFooter.tsx` para aceitar `cancelAsLink` opcional (default false) — quando true, no mobile renderiza Cancelar como link inline acima/abaixo do botão primário, reduzindo a altura do bloco.
- Mantém comportamento atual no desktop.

### 4. Reduzir sensação de formulário longo (acordeão no mobile)
- Envolver as seções em um componente local **`MobileSection`** que, em `useIsMobile()`, renderiza um header tappable + chevron (similar ao `MobileCollapsibleBlock`), e no desktop renderiza o conteúdo direto (mantém o visual atual).
- Seções: **Identificação** (aberta por padrão), **Empresa Matriz** (aberta), **Estrutura do Grupo** (recolhida no edit), **Observações** (recolhida), **Resumo Consolidado** (recolhida — mostra só os 3 números no header quando fechado).
- Estado local com `useState`, sem persistência (não vale criar pref para isso).

## Média prioridade

### 5. Resumo Consolidado compacto no mobile
- Quando fechado: header mostra `Empresas: N · Saldo: R$ X · Vencidos: N` (uma linha resumida).
- Quando aberto: cards atuais empilhados (já estão `grid-cols-1` no mobile).

### 6. Observações com altura inicial menor
- `min-h-[64px] rows={3}` no mobile, mantém `min-h-[96px] rows={4}` no desktop via `sm:min-h-[96px]`.
- Encurtar microcopy: "Notas internas sobre o grupo." → mantém. Placeholder mais curto: `"Histórico, condições, particularidades..."`.

### 7. Microcopy mais curta
- Identificação: "Nome usado para consolidar dados comerciais e financeiros."
- Empresa Matriz: "Opcional. Defina a empresa principal do grupo."
- Botão na empty state da Estrutura: trocar "Abrir clientes" por **"Vincular em Clientes"**.

## Detalhes técnicos

**Arquivos:**
- `src/pages/GruposEconomicos.tsx` — alterações 1, 2 (passagem de prop), 4, 5, 6, 7.
- `src/components/FormModal.tsx` — minor: `DialogTitle` permitir wrap em mobile.
- `src/components/FormModalFooter.tsx` — adicionar prop opcional `cancelAsLink?: boolean` (no-op no desktop).

**`MobileSection` (componente local em GruposEconomicos.tsx):**
```tsx
function MobileSection({ icon, title, summary, defaultOpen, children }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen ?? true);
  if (!isMobile) return <>{header desktop atual}{children}</>;
  return (
    <div className="border-t first:border-t-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 py-3">
        <Icon /> <span>{title}</span>
        {!open && summary && <span className="ml-auto text-xs text-muted-foreground">{summary}</span>}
        <ChevronDown className={cn('ml-auto', open && 'rotate-180')} />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
```

**Header compactado:** consolidar os 2 indicadores em um único item no array `meta`:
```ts
const semVinculos = !loadingSummary && (modalEmpresas.length === 0 || !form.empresa_matriz_id);
const partes = [
  modalEmpresas.length === 0 ? "Sem empresa" : null,
  !form.empresa_matriz_id ? "Sem matriz" : null,
].filter(Boolean).join(" · ");
// adiciona { label: partes } se semVinculos
```

**Ver painel responsivo:**
```tsx
<Button className="hidden sm:inline-flex ...">Ver painel</Button>
<Button variant="ghost" size="sm" className="sm:hidden h-7 px-1.5 text-xs gap-1">
  <ExternalLink/>Painel
</Button>
```

## Out of scope
- Persistência do estado aberto/fechado das seções.
- Mudanças no Drawer (`GrupoEconomicoView`) — já tratado em Onda 41.
- Mudanças no grid `/grupos-economicos` (lista) — já tratado anteriormente.
- Schema, RLS, RPCs.
