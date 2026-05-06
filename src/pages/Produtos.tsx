import { useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDebounce } from "@/hooks/useDebounce";
import { useUrlListState } from "@/hooks/useUrlListState";
import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { ModulePage } from "@/components/ModulePage";
import { SummaryCard } from "@/components/SummaryCard";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { listGruposAtivos } from "@/services/produtos.service";
import { Package, Archive, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useCan } from "@/hooks/useCan";
import { parseVariacoes } from "@/utils/cadastros";

type TipoItem = "produto" | "insumo";

interface Produto {
  id: string; sku: string; codigo_interno: string; nome: string; descricao: string;
  grupo_id: string; unidade_medida: string; preco_custo: number; preco_venda: number;
  estoque_atual: number; estoque_minimo: number; ncm: string; cst: string; cfop_padrao: string;
  peso: number; eh_composto: boolean; ativo: boolean; created_at: string; updated_at?: string;
  tipo_item: TipoItem; variacoes?: string[] | null;
}

type ProdutoTableRow = Produto & { display_codigo: string; display_sku_secundario: string | null };

type SituacaoEstoque = "normal" | "atencao" | "critico" | "zerado";

function getSituacaoEstoque(p: { estoque_atual?: number | null; estoque_minimo?: number | null }): SituacaoEstoque {
  const atual = Number(p.estoque_atual || 0);
  const minimo = Number(p.estoque_minimo || 0);
  if (atual <= 0) return "zerado";
  if (minimo > 0 && atual <= minimo) return "critico";
  if (minimo > 0 && atual <= minimo * 1.2) return "atencao";
  return "normal";
}

const situacaoEstoqueConfig: Record<SituacaoEstoque, { label: string; statusBadge: string; textClass: string }> = {
  normal:  { label: "Normal",            statusBadge: "confirmado", textClass: "text-foreground"  },
  atencao: { label: "Em atenção",         statusBadge: "pendente",   textClass: "text-warning"     },
  critico: { label: "Abaixo do mínimo",  statusBadge: "cancelado",  textClass: "text-destructive" },
  zerado:  { label: "Sem estoque",       statusBadge: "cancelado",  textClass: "text-destructive" },
};

function compactProductCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}
function normalizeProductCode(value: string | null | undefined): string {
  const compact = compactProductCode(value);
  if (!compact) return "";
  const normalized = /[A-Z]/i.test(compact)
    ? compact.replace(/^0+(?=[A-Z0-9]*[A-Z])/i, "")
    : compact;
  return normalized || compact;
}
function getProdutoDisplayCodigo(produto: Pick<Produto, "codigo_interno" | "sku">): string {
  return normalizeProductCode(produto.codigo_interno) || normalizeProductCode(produto.sku) || "—";
}
function getProdutoDisplaySkuSecundario(produto: Pick<Produto, "codigo_interno" | "sku">): string | null {
  const sku = String(produto.sku ?? "").trim();
  if (!sku) return null;
  const skuNormalizado = normalizeProductCode(sku);
  const codigoPrincipal = normalizeProductCode(getProdutoDisplayCodigo(produto));
  return skuNormalizado && skuNormalizado !== codigoPrincipal ? sku : null;
}
function getProdutoCanonicalScore(produto: Pick<Produto, "codigo_interno" | "sku" | "variacoes">): number {
  const rawPrimary = compactProductCode(produto.codigo_interno || produto.sku || "");
  const variacoesCount = parseVariacoes(produto.variacoes).length;
  let score = variacoesCount * 100;
  if (rawPrimary && normalizeProductCode(rawPrimary) === rawPrimary) score += 20;
  score -= rawPrimary.length;
  return score;
}
function pickCanonicalProduto<T extends Produto>(current: T, candidate: T): T {
  return getProdutoCanonicalScore(candidate) > getProdutoCanonicalScore(current) ? candidate : current;
}
function dedupeProdutosCanonicos<T extends Produto>(produtos: T[]): T[] {
  const deduped = new Map<string, T>();
  for (const produto of produtos) {
    const key = [
      normalizeProductCode(produto.codigo_interno || produto.sku),
      String(produto.nome || "").trim().toUpperCase(),
      String(produto.tipo_item || "produto"),
    ].join("::");
    if (!key.replace(/::/g, "")) { deduped.set(produto.id, produto); continue; }
    const existing = deduped.get(key);
    deduped.set(key, existing ? pickCanonicalProduto(existing, produto) : produto);
  }
  return Array.from(deduped.values());
}

const Produtos = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { value: filterValue, set: setFilter, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      tipo: { type: "stringArray" },
      tipoItem: { type: "stringArray" },
      estoque: { type: "stringArray" },
      grupo: { type: "stringArray" },
      ativo: { type: "stringArray" },
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const tipoFilters = filterValue.tipo;
  const setTipoFilters = (v: string[]) => setFilter({ tipo: v });
  const tipoItemFilters = filterValue.tipoItem;
  const setTipoItemFilters = (v: string[]) => setFilter({ tipoItem: v });
  const estoqueFilters = filterValue.estoque;
  const setEstoqueFilters = (v: string[]) => setFilter({ estoque: v });
  const grupoFilters = filterValue.grupo;
  const setGrupoFilters = (v: string[]) => setFilter({ grupo: v });
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const debouncedSearch = useDebounce(searchTerm, 350);
  const { can } = useCan();
  const canExcluir = can("produtos:excluir");

  const serverFilters = useMemo(() => {
    const out: Array<{ column: string; value: string | string[] | boolean; operator?: "eq" | "in" }> = [];
    if (ativoFilters.length === 1) out.push({ column: "ativo", value: ativoFilters[0] === "ativo" });
    if (tipoItemFilters.length === 1) out.push({ column: "tipo_item", value: tipoItemFilters[0] });
    else if (tipoItemFilters.length > 1) out.push({ column: "tipo_item", value: tipoItemFilters, operator: "in" });
    if (tipoFilters.length === 1) out.push({ column: "eh_composto", value: tipoFilters[0] === "composto" });
    const realGroupIds = grupoFilters.filter((g) => g !== "sem_grupo");
    if (grupoFilters.length > 0 && realGroupIds.length === grupoFilters.length) {
      if (realGroupIds.length === 1) out.push({ column: "grupo_id", value: realGroupIds[0] });
      else out.push({ column: "grupo_id", value: realGroupIds, operator: "in" });
    }
    return out;
  }, [ativoFilters, tipoItemFilters, tipoFilters, grupoFilters]);

  const hasSemGrupoFilter = grupoFilters.includes("sem_grupo");
  const hasEstoqueFilter = estoqueFilters.length > 0;

  const { data, loading, remove, fetchData } = useSupabaseCrud<Produto>({
    table: "produtos",
    searchTerm: debouncedSearch,
    filterAtivo: false,
    filter: serverFilters,
    searchColumns: ["nome", "sku", "codigo_interno", "ncm"],
  });
  const { pushView } = useRelationalNavigation();

  const { data: grupoLookup } = useQuery({
    queryKey: ["produtos", "lookup", "grupos-ativos"],
    queryFn: listGruposAtivos,
    staleTime: 5 * 60 * 1000,
  });
  const grupos = grupoLookup ?? [];

  const openCreate = () => navigate("/produtos/novo");
  const openEdit = (p: Produto) => navigate(`/produtos/${p.id}/editar`);
  const openView = (p: Produto) => pushView("produto", p.id);

  // Suporte ao deep-link legado (?editId=) e ao atalho ?new=1.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editId = (location.state as { editId?: string } | null)?.editId || params.get("editId");
    if (editId) {
      navigate(`/produtos/${editId}/editar`, { replace: true });
      return;
    }
    if (params.get("new") === "1") {
      navigate("/produtos/novo", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot
  }, [location.search, location.state]);

  const filteredData = useMemo(() => {
    const needsClientFilter = hasEstoqueFilter || hasSemGrupoFilter;
    const filtered = needsClientFilter
      ? data.filter((p) => {
          if (hasEstoqueFilter) {
            const situacao = getSituacaoEstoque(p);
            if (!estoqueFilters.includes(situacao)) return false;
          }
          if (hasSemGrupoFilter) {
            if (!grupoFilters.includes(p.grupo_id || "sem_grupo")) return false;
          }
          return true;
        })
      : data;
    return dedupeProdutosCanonicos(filtered).map<ProdutoTableRow>((produto) => ({
      ...produto,
      display_codigo: getProdutoDisplayCodigo(produto),
      display_sku_secundario: getProdutoDisplaySkuSecundario(produto),
    }));
  }, [data, hasEstoqueFilter, hasSemGrupoFilter, estoqueFilters, grupoFilters]);

  const columns = [
    { key: "sku", label: "SKU", sortable: true, render: (p: ProdutoTableRow) => (
      <span className="font-mono text-xs font-medium" title="SKU — código comercial canônico">{p.sku || "—"}</span>
    )},
    { key: "codigo_interno", label: "Cód. Interno", sortable: true, render: (p: ProdutoTableRow) => (
      <span className="font-mono text-xs text-muted-foreground" title="Código Interno (ERP) — sequencial PRD/INS">{p.codigo_interno || "—"}</span>
    )},
    { key: "nome", mobilePrimary: true, label: "Produto", sortable: true, render: (p: ProdutoTableRow) => (
      <div><span className="font-medium text-sm">{p.nome}</span></div>
    )},
    { key: "unidade_medida", label: "UN", render: (p: Produto) => (
      <span className="text-xs text-muted-foreground">{p.unidade_medida || "UN"}</span>
    )},
    { key: "variacoes", label: "Variações", render: (p: Produto) => {
      const items: string[] = Array.isArray(p.variacoes) ? p.variacoes : [];
      if (items.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
      const visiveis = items.slice(0, 2);
      const restantes = items.length - visiveis.length;
      return (
        <div className="flex flex-wrap items-center gap-1" title={items.join(", ")}>
          {visiveis.map((v, i) => (
            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20 font-medium">{v}</span>
          ))}
          {restantes > 0 && <span className="text-[10px] text-muted-foreground">+{restantes}</span>}
        </div>
      );
    }},
    { key: "estoque_atual", mobileCard: true, label: "Estoque", sortable: true, render: (p: Produto) => {
      const situacao = getSituacaoEstoque(p);
      const cfg = situacaoEstoqueConfig[situacao];
      return (
        <div className="space-y-0.5">
          <span className={`font-mono text-sm font-semibold ${cfg.textClass}`}>
            {p.estoque_atual ?? 0}
            <span className="text-[11px] text-muted-foreground ml-1 font-normal">{p.unidade_medida}</span>
          </span>
          {Number(p.estoque_minimo) > 0 && (
            <p className="text-[10px] text-muted-foreground font-mono leading-none">mín: {p.estoque_minimo}</p>
          )}
          {situacao !== "normal" && (
            <StatusBadge status={cfg.statusBadge} label={cfg.label} className="text-[10px] px-1.5 h-4 mt-0.5" />
          )}
        </div>
      );
    }},
    { key: "preco_venda", mobileCard: true, label: "P. Venda", sortable: true, render: (p: Produto) => (
      <span className="font-semibold font-mono text-sm">{formatCurrency(p.preco_venda)}</span>
    )},
    { key: "preco_custo", label: "P. Custo", sortable: true, render: (p: Produto) => (
      <span className="font-mono text-sm text-muted-foreground">{formatCurrency(p.preco_custo || 0)}</span>
    )},
    { key: "margem", label: "Margem", render: (p: Produto) => {
      const custo = Number(p.preco_custo || 0);
      const venda = Number(p.preco_venda);
      const margem = custo > 0 ? (venda / custo - 1) * 100 : 0;
      return (
        <div className="flex flex-col">
          <span className={`font-mono text-xs ${margem > 0 ? "text-success" : margem < 0 ? "text-destructive" : ""}`}>
            {custo > 0 ? `${margem.toFixed(1)}%` : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">+{formatCurrency(venda - custo)}</span>
        </div>
      );
    }},
    { key: "tipo_item", label: "Classificação", hidden: true, render: (p: Produto) => (
      <StatusBadge status={p.tipo_item || "produto"} />
    )},
    { key: "ativo", mobileCard: true, label: "Status", render: (p: Produto) => (
      <StatusBadge status={p.ativo !== false ? "ativo" : "inativo"} />
    )},
    { key: "eh_composto", label: "Tipo", hidden: true, render: (p: Produto) => (
      <StatusBadge status={p.eh_composto ? "composto" : "simples"} />
    )},
  ];

  const kpis = useMemo(() => {
    const ativos = data.filter(p => p.ativo !== false);
    const criticos = data.filter(p => {
      const s = getSituacaoEstoque(p);
      return s === "critico" || s === "zerado";
    });
    const insumos = data.filter(p => p.tipo_item === "insumo");
    const produtos = data.filter(p => (p.tipo_item || "produto") === "produto");
    return { total: data.length, ativos: ativos.length, criticos: criticos.length, insumos: insumos.length, produtos: produtos.length };
  }, [data]);

  const prodActiveFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    ativoFilters.forEach(f => chips.push({ key: "ativo", label: "Status", value: [f], displayValue: f === "ativo" ? "Ativo" : "Inativo" }));
    tipoFilters.forEach(f => chips.push({ key: "tipo", label: "Tipo", value: [f], displayValue: f === "simples" ? "Simples" : "Composto" }));
    tipoItemFilters.forEach(f => chips.push({ key: "tipoItem", label: "Classificação", value: [f], displayValue: f === "produto" ? "Produto" : "Insumo" }));
    estoqueFilters.forEach(f => chips.push({ key: "estoque", label: "Estoque", value: [f], displayValue: situacaoEstoqueConfig[f as SituacaoEstoque]?.label ?? f }));
    grupoFilters.forEach(f => {
      const g = grupos.find(x => x.id === f);
      chips.push({ key: "grupo", label: "Grupo", value: [f], displayValue: g?.nome || "Sem grupo" });
    });
    return chips;
  }, [ativoFilters, tipoFilters, tipoItemFilters, estoqueFilters, grupoFilters, grupos]);

  const handleRemoveProdFilter = (key: string, value?: string) => {
    if (key === "ativo") setAtivoFilters(ativoFilters.filter(v => v !== value));
    if (key === "tipo") setTipoFilters(tipoFilters.filter(v => v !== value));
    if (key === "tipoItem") setTipoItemFilters(tipoItemFilters.filter(v => v !== value));
    if (key === "estoque") setEstoqueFilters(estoqueFilters.filter(v => v !== value));
    if (key === "grupo") setGrupoFilters(grupoFilters.filter(v => v !== value));
  };

  const tipoOptions: MultiSelectOption[] = [
    { label: "Simples", value: "simples" },
    { label: "Composto", value: "composto" },
  ];
  const tipoItemOptions: MultiSelectOption[] = [
    { label: "Produto", value: "produto" },
    { label: "Insumo", value: "insumo" },
  ];
  const ativoOptions: MultiSelectOption[] = [
    { label: "Ativos", value: "ativo" },
    { label: "Inativos", value: "inativo" },
  ];
  const estoqueOptions: MultiSelectOption[] = [
    { label: "Sem estoque", value: "zerado" },
    { label: "Abaixo do mínimo", value: "critico" },
    { label: "Em atenção", value: "atencao" },
    { label: "Normal", value: "normal" },
  ];
  const grupoOptions: MultiSelectOption[] = [
    ...grupos.map(g => ({ label: g.nome, value: g.id })),
    { label: "Sem grupo", value: "sem_grupo" },
  ];

  return (
    <ModulePage
      title="Produtos"
      subtitle="Consulta e gestão de produtos"
      addLabel="Novo Produto"
      onAdd={openCreate}
      addButtonHelpId="produtos.novoBtn"
      summaryCards={
        <>
          <SummaryCard title="Total de Itens" value={kpis.total} icon={Package} variant="info" />
          <SummaryCard title="Produtos" value={kpis.produtos} icon={Package} variant="default"
            onClick={kpis.produtos > 0 ? () => setTipoItemFilters(["produto"]) : undefined}
            subtitle={kpis.produtos > 0 ? "Clique para filtrar" : undefined} />
          <SummaryCard title="Insumos" value={kpis.insumos} icon={Archive} variant="default"
            onClick={kpis.insumos > 0 ? () => setTipoItemFilters(["insumo"]) : undefined}
            subtitle={kpis.insumos > 0 ? "Clique para filtrar" : undefined} />
          <SummaryCard title="Abaixo do Mínimo" value={kpis.criticos} icon={AlertCircle}
            variant={kpis.criticos > 0 ? "danger" : "default"}
            onClick={kpis.criticos > 0 ? () => setEstoqueFilters(["critico", "zerado"]) : undefined}
            subtitle={kpis.criticos > 0 ? "Clique para filtrar" : undefined} />
        </>
      }
    >
      <div data-help-id="produtos.filtros">
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome, SKU ou código..."
          activeFilters={prodActiveFilters}
          onRemoveFilter={handleRemoveProdFilter}
          onClearAll={() => clearFilters(["tipo", "tipoItem", "estoque", "grupo", "ativo"])}
          count={filteredData.length}
        >
          <MultiSelect options={ativoOptions} selected={ativoFilters} onChange={setAtivoFilters} placeholder="Status" className="w-[150px]" />
          <MultiSelect options={tipoItemOptions} selected={tipoItemFilters} onChange={setTipoItemFilters} placeholder="Classificação" className="w-[160px]" />
          <MultiSelect options={tipoOptions} selected={tipoFilters} onChange={setTipoFilters} placeholder="Tipo" className="w-[150px]" />
          <MultiSelect options={estoqueOptions} selected={estoqueFilters} onChange={setEstoqueFilters} placeholder="Estoque" className="w-[180px]" />
          <MultiSelect options={grupoOptions} selected={grupoFilters} onChange={setGrupoFilters} placeholder="Grupos" className="w-[200px]" />
        </AdvancedFilterBar>
      </div>

      <PullToRefresh onRefresh={fetchData}>
        <div data-help-id="produtos.tabela">
          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            moduleKey="produtos"
            defaultSortKey="sku"
            showColumnToggle={true}
            onView={openView}
            onEdit={openEdit}
            onDelete={canExcluir ? (p) => remove(p.id) : undefined}
            deleteBehavior="soft"
            mobileIdentifierKey="sku"
            mobileStatusKey="ativo"
          />
        </div>
      </PullToRefresh>
    </ModulePage>
  );
};

export default Produtos;
