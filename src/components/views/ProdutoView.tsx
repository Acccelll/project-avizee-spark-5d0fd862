import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { fetchProdutoDetalhes, deleteProduto } from "@/services/produtos.service";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, AlertTriangle, Archive, FileText, Edit, Trash2, ShoppingCart, Layers, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermanentDeleteDialog } from "@/components/PermanentDeleteDialog";
import { useCanHardDelete } from "@/hooks/useCanHardDelete";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { PrecosEspeciaisTab } from "@/components/precos/PrecosEspeciaisTab";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { usePublishDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { useDetailFetch } from "@/hooks/useDetailFetch";
import { useDetailActions } from "@/hooks/useDetailActions";
import { useInvalidateAfterMutation } from "@/hooks/useInvalidateAfterMutation";
import { notifyError } from "@/utils/errorMessages";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { RecordIdentityCard } from "@/components/ui/RecordIdentityCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DetailLoading, DetailError, DetailEmpty } from "@/components/ui/DetailStates";
import type {
  HistoricoNfItemRow,
  HistoricoNfVendaRow,
  ComposicaoItemRow,
  MovimentoEstoqueRow,
  ProdutoFornecedorViewRow,
} from "@/types/cadastros";

/** Raw shape returned by the produto_composicoes join query */
interface ComposicaoQueryRow {
  quantidade: number;
  ordem: number | null;
  produtos: { id: string; nome: string; sku: string; preco_custo: number | null } | null;
}

interface Props {
  id: string;
}

interface ProdutoDetail {
  produto: Tables<"produtos">;
  grupoNome: string | null;
  historicoCompras: HistoricoNfItemRow[];
  historicoVendas: HistoricoNfVendaRow[];
  composicao: ComposicaoItemRow[];
  movimentos: MovimentoEstoqueRow[];
  fornecedoresProd: ProdutoFornecedorViewRow[];
}

export function ProdutoView({ id }: Props) {
  const navigate = useNavigate();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("geral");
  const { canHardDelete: isAdmin } = useCanHardDelete();
  const { pushView, clearStack } = useRelationalNavigation();
  const { run, locked } = useDetailActions();
  const invalidate = useInvalidateAfterMutation();

  const { data, loading, error } = useDetailFetch<ProdutoDetail>(id, async (pId, signal) => {
    const res = await fetchProdutoDetalhes(pId, signal);
    if (!res) return null;
    const { produto: p, comprasRes, vendasRes, compRes, movRes, fornRes, grupoRes } = res;

    const pickData = <T,>(r: PromiseSettledResult<unknown>, fallback: T): T => {
      if (r.status !== "fulfilled") return fallback;
      const v = r.value as { data?: T | null } | null;
      return (v?.data ?? fallback) as T;
    };

    const comprasData = pickData(comprasRes, [] as unknown[]);
    const vendasData = pickData(vendasRes, [] as unknown[]);
    const compData = pickData(compRes, [] as unknown[]);
    const movData = pickData(movRes, [] as unknown[]);
    const fornData = pickData(fornRes, [] as unknown[]);
    const grupoData = pickData(grupoRes, null as Record<string, unknown> | null);

    return {
      produto: p,
      grupoNome: (grupoData as Record<string, unknown> | null)?.nome as string ?? null,
      historicoCompras: comprasData as HistoricoNfItemRow[],
      historicoVendas: vendasData as HistoricoNfVendaRow[],
      composicao: (compData as ComposicaoQueryRow[]).map((c) => ({
        id: c.produtos?.id ?? null,
        nome: c.produtos?.nome ?? null,
        sku: c.produtos?.sku ?? null,
        preco_custo: c.produtos?.preco_custo ?? null,
        quantidade: c.quantidade,
        ordem: c.ordem,
      })),
      movimentos: movData as MovimentoEstoqueRow[],
      fornecedoresProd: fornData as ProdutoFornecedorViewRow[],
    };
  });

  const selected = data?.produto ?? null;
  const grupoNome = data?.grupoNome ?? null;
  const historicoCompras = data?.historicoCompras ?? [];
  const historicoVendas = data?.historicoVendas ?? [];
  const composicao = data?.composicao ?? [];
  const movimentos = data?.movimentos ?? [];
  const fornecedoresProd = data?.fornecedoresProd ?? [];

  const selectedMargem = selected && (selected.preco_custo || 0) > 0 ? (selected.preco_venda / (selected.preco_custo || 1) - 1) * 100 : 0;
  const lucroBruto = selected ? selected.preco_venda - (selected.preco_custo || 0) : 0;
  const custoCompostoView = composicao.reduce((s, c) => s + c.quantidade * (c.preco_custo || 0), 0);
  const estoqueValor = selected ? (selected.estoque_atual || 0) * (selected.preco_custo || 0) : 0;

  const custoNum = Number(selected?.preco_custo || 0);
  const vendaNum = Number(selected?.preco_venda || 0);
  const markupPct = custoNum > 0 ? ((vendaNum / custoNum) - 1) * 100 : null;
  const margemSobreVendaPct = vendaNum > 0 ? ((vendaNum - custoNum) / vendaNum) * 100 : null;
  const lucroEmEstoque = lucroBruto * Number(selected?.estoque_atual || 0);

  // KPIs Compras
  const totalComprado = historicoCompras.reduce((s, h) => s + Number(h.quantidade || 0), 0);
  const valorComprado = historicoCompras.reduce((s, h) => s + Number(h.quantidade || 0) * Number(h.valor_unitario || 0), 0);
  const custoMedioCompras = totalComprado > 0 ? valorComprado / totalComprado : 0;

  // KPIs Vendas
  const totalVendido = historicoVendas.reduce((s, h) => s + Number(h.quantidade || 0), 0);
  const valorVendido = historicoVendas.reduce((s, h) => s + Number(h.quantidade || 0) * Number(h.valor_unitario || 0), 0);
  const ticketMedioVenda = totalVendido > 0 ? valorVendido / totalVendido : 0;
  const margemMediaVenda = ticketMedioVenda > 0 && (selected?.preco_custo || 0) > 0
    ? ((ticketMedioVenda / Number(selected!.preco_custo)) - 1) * 100
    : 0;

  const estoqueBaixo = selected ? Number(selected.estoque_atual) <= Number(selected.estoque_minimo) && Number(selected.estoque_minimo) > 0 : false;
  const naoControlaEstoque = selected ? Number(selected.estoque_minimo || 0) === 0 && Number(selected.estoque_atual || 0) === 0 : false;
  const semEstoque = selected ? Number(selected.estoque_atual || 0) === 0 && Number(selected.estoque_minimo || 0) > 0 : false;
  const reservado = Number((selected as { estoque_reservado?: number | null } | null)?.estoque_reservado || 0);
  const disponivel = Number(selected?.estoque_atual || 0) - reservado;
  const fiscalCompleto = !!(selected?.ncm && selected?.cst && selected?.cfop_padrao);
  const fiscalFaltantes: string[] = selected
    ? ([!selected.ncm && "NCM", !selected.cst && "CST", !selected.cfop_padrao && "CFOP"].filter(Boolean) as string[])
    : [];
  const semVenda = selected ? Number(selected.preco_venda || 0) === 0 : false;
  const semCusto = selected ? Number(selected.preco_custo || 0) === 0 : false;
  const fornecedorPrincipal = fornecedoresProd.find((f) => f.eh_principal);
  const ultimaEntrada = movimentos.find((m) => m.tipo === 'entrada');
  const ultimaSaida = movimentos.find((m) => m.tipo === 'saida');

  const fornecedoresCount = fornecedoresProd.length;
  const vendasCount = historicoVendas.length;

  type HealthAlert = { id: string; label: string; tone: "warning" | "destructive"; tab: string };
  const healthAlerts: HealthAlert[] = selected ? ([
    semEstoque && { id: "sem-estoque", label: "Sem estoque", tone: "destructive" as const, tab: "estoque" },
    !semEstoque && estoqueBaixo && { id: "abaixo-min", label: "Estoque abaixo do mínimo", tone: "warning" as const, tab: "estoque" },
    fornecedoresCount === 0 && { id: "sem-fornecedor", label: "Sem fornecedor vinculado", tone: "warning" as const, tab: "compras" },
    !fiscalCompleto && { id: "fiscal-inc", label: `Fiscal incompleto · faltam ${fiscalFaltantes.join(", ")}`, tone: "warning" as const, tab: "fiscal" },
    semVenda && { id: "sem-venda", label: "Preço de venda zerado", tone: "destructive" as const, tab: "preco" },
    semCusto && !semVenda && { id: "sem-custo", label: "Custo ausente — afeta margem", tone: "warning" as const, tab: "preco" },
  ].filter(Boolean) as HealthAlert[]) : [];

  // ── PUBLISH DRAWER SLOTS (header padronizado via DrawerHeaderShell) ──
  usePublishDrawerSlots(`produto:${id}`, {
    breadcrumb: "Cadastros › Produtos",
    summary: selected ? (
      <RecordIdentityCard
        icon={Package}
        title={selected.nome}
        meta={
          <>
            {selected.codigo_interno && <span className="font-mono">Cód: {selected.codigo_interno}</span>}
            {selected.sku && selected.sku !== selected.codigo_interno && (
              <span className="font-mono">SKU: {selected.sku}</span>
            )}
            <span className="text-muted-foreground/70">· atualizado {formatDate(selected.updated_at)}</span>
          </>
        }
        badges={
          <>
            <StatusBadge status={selected.ativo ? "ativo" : "inativo"} />
            <StatusBadge status={selected.eh_composto ? "composto" : "simples"} />
            <StatusBadge status={selected.tipo_item || "produto"} />
            {grupoNome && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
                <Layers className="h-2.5 w-2.5" />
                {grupoNome}
              </span>
            )}
          </>
        }
      />
    ) : undefined,
    actions: selected ? (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="Editar produto"
          onClick={() => {
            navigate(`/produtos?editId=${id}`);
            window.setTimeout(() => clearStack(), 0);
          }}
        >
          <Edit className="h-3.5 w-3.5" /> Editar
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              aria-label="Excluir produto"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          </TooltipTrigger>
          <TooltipContent>Excluir produto</TooltipContent>
        </Tooltip>
        {isAdmin && selected.ativo === false && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label="Excluir produto permanentemente"
            onClick={() => setPermDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir definitivamente
          </Button>
        )}
      </>
    ) : undefined,
  });

  if (loading) return <DetailLoading />;
  if (error) return <DetailError message={error.message} />;
  if (!selected) return <DetailEmpty title="Produto não encontrado" icon={Package} />;

  return (
    <div className="space-y-5">
      {healthAlerts.length > 0 && (
        <div className="flex flex-wrap gap-2" role="region" aria-label="Alertas do produto">
          {healthAlerts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveTab(a.tab)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                a.tone === "destructive"
                  ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
                  : "border-warning/30 bg-warning/5 text-warning hover:bg-warning/10",
              )}
              aria-label={`${a.label} — abrir aba`}
            >
              <AlertTriangle className="h-3 w-3" />
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <DrawerSummaryCard label="Venda" value={formatCurrency(selected.preco_venda)} align="center" />
        <DrawerSummaryCard label="Custo" value={formatCurrency(selected.preco_custo || 0)} align="center" />
        <DrawerSummaryCard
          label="Lucro Bruto"
          value={formatCurrency(lucroBruto)}
          tone={lucroBruto > 0 ? "success" : lucroBruto < 0 ? "destructive" : "neutral"}
          align="center"
        />
        <DrawerSummaryCard
          label="Margem"
          value={(selected.preco_custo || 0) > 0 ? `${selectedMargem.toFixed(1)}%` : "—"}
          tone={selectedMargem > 0 ? "success" : selectedMargem < 0 ? "destructive" : "neutral"}
          align="center"
        />
        <DrawerSummaryCard
          label="Estoque"
          value={naoControlaEstoque ? "—" : `${selected.estoque_atual ?? 0} ${selected.unidade_medida || ""}`}
          tone={semEstoque || estoqueBaixo ? "destructive" : "neutral"}
          hint={naoControlaEstoque ? "Não controla" : semEstoque ? "Sem estoque" : estoqueBaixo ? "Abaixo do mínimo" : undefined}
          align="center"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-7">
          <TabsTrigger value="geral" className="text-xs px-0.5">Geral</TabsTrigger>
          <TabsTrigger value="compras" className="text-xs px-0.5">
            Compras{fornecedoresCount > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({fornecedoresCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="preco" className="text-xs px-0.5">
            Preço{(semVenda || semCusto) && <span className="ml-1 text-[10px] text-warning" aria-label="Preço incompleto">!</span>}
          </TabsTrigger>
          <TabsTrigger value="estoque" className="text-xs px-0.5">
            Estoque{(estoqueBaixo || semEstoque) && <span className="ml-1 text-[10px] text-destructive" aria-label="Estoque crítico">!</span>}
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="text-xs px-0.5">
            Fiscal{!fiscalCompleto && <span className="ml-1 text-[10px] text-warning" aria-label="Fiscal incompleto">!</span>}
          </TabsTrigger>
          <TabsTrigger value="precos" className="text-xs px-0.5">Espec.</TabsTrigger>
          <TabsTrigger value="vendas" className="text-xs px-0.5">
            Vendas{vendasCount > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({vendasCount})</span>}
          </TabsTrigger>
        </TabsList>

        {/* Tab: Geral */}
        <TabsContent value="geral" className="space-y-3 mt-3">
          <div className="rounded-lg border bg-card p-3 space-y-2.5">
            <SectionTitle>Identificação</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              <FieldItem label="SKU" mono value={selected.sku} />
              <FieldItem label="Código interno" mono value={selected.codigo_interno} />
              <FieldItem label="Classificação" value={selected.tipo_item || "produto"} capitalize />
              <FieldItem label="Tipo" value={selected.eh_composto ? "Composto" : "Simples"} />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-3 space-y-2.5">
            <SectionTitle>Operacional</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              <FieldItem label="Unidade" value={selected.unidade_medida} />
              <FieldItem label="Grupo" value={grupoNome} emptyText="Sem grupo" />
              <FieldItem
                label="Peso"
                mono
                value={selected.peso ? `${selected.peso} kg` : null}
                emptyText="Peso não informado"
              />
              <FieldItem
                label="Variações"
                value={(() => {
                  const raw = (selected as { variacoes?: string[] | null }).variacoes;
                  return Array.isArray(raw) && raw.length > 0 ? `${raw.length} variação(ões)` : null;
                })()}
                emptyText="Sem variações"
              />
            </div>
          </div>

          {(() => {
            const raw = (selected as { variacoes?: string[] | null }).variacoes;
            const items: string[] = Array.isArray(raw) ? raw : [];
            if (items.length === 0) return null;
            return (
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <SectionTitle>Variações cadastradas</SectionTitle>
                <div className="flex flex-wrap gap-1">
                  {items.map((v, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border border-border font-medium"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
          {selected.descricao && (
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              <SectionTitle>Descrição</SectionTitle>
              <p className="text-sm text-foreground/80 whitespace-pre-line">{selected.descricao}</p>
            </div>
          )}
          {selected.eh_composto && composicao.length > 0 && (
            <div className="border-t pt-3">
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <Package className="w-3.5 h-3.5" /> Composição
              </h4>
              <div className="space-y-1">
                {composicao.map((c, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1.5 border-b last:border-b-0">
                    <button onClick={() => pushView("produto", c.id)} className="text-left text-primary font-medium hover:underline flex items-center gap-1">
                      {c.nome} <span className="text-muted-foreground font-mono text-[10px]">({c.sku})</span>
                    </button>
                    <div className="text-right text-xs">
                      <span className="font-mono">× {c.quantidade}</span>
                      {c.preco_custo != null && <p className="text-muted-foreground">{formatCurrency(c.preco_custo * c.quantidade)}</p>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-2">
                  <span>Custo Composto</span>
                  <span className="font-mono text-primary">{formatCurrency(custoCompostoView)}</span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab: Compras / Fornecedores */}
        <TabsContent value="compras" className="space-y-3 mt-3">
          <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <ShoppingCart className="w-3.5 h-3.5" /> Fornecedores Vinculados
          </h4>
          {fornecedoresProd.length === 0 ? (
            <DetailEmpty
              icon={ShoppingCart}
              title="Nenhum fornecedor vinculado"
              message="Vincule fornecedores para registrar custo de compra, código do fornecedor e lead time."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    navigate(`/produtos?editId=${id}`);
                    window.setTimeout(() => clearStack(), 0);
                  }}
                  className="h-8 gap-1"
                >
                  <ShoppingCart className="w-3.5 h-3.5" /> Vincular fornecedor
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
            {fornecedoresProd.map((f, idx: number) => (
                <div key={idx} className={`rounded-lg border p-3 bg-card hover:bg-muted/30 transition-colors ${f.eh_principal ? "border-primary/30" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <RelationalLink onClick={() => pushView("fornecedor", f.fornecedores?.id)} className="font-medium text-sm">
                      {f.fornecedores?.nome_razao_social || "—"}
                    </RelationalLink>
                    {f.eh_principal && (
                      <span className="inline-flex items-center text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">Principal</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {f.referencia_fornecedor && (
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Ref. Fornecedor</p>
                        <p className="font-mono text-xs">{f.referencia_fornecedor}</p>
                      </div>
                    )}
                    {f.unidade_fornecedor && (
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Unidade</p>
                        <p className="text-xs">{f.unidade_fornecedor}</p>
                      </div>
                    )}
                    {f.lead_time_dias != null && (
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Lead Time</p>
                        <p className="text-xs font-mono">{f.lead_time_dias}d</p>
                      </div>
                    )}
                    {f.preco_compra != null && (
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Preço Compra</p>
                        <p className="text-xs font-mono font-semibold">{formatCurrency(f.preco_compra)}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        {(historicoCompras.length > 0 || totalComprado > 0) && (
            <div className="border-t pt-3">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <DrawerSummaryCard label="Qtd Comprada" value={totalComprado.toLocaleString("pt-BR")} align="center" />
                <DrawerSummaryCard label="Valor Total" value={formatCurrency(valorComprado)} align="center" />
                <DrawerSummaryCard label="Custo Médio" value={formatCurrency(custoMedioCompras)} align="center" />
              </div>
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Últimas Compras
              </h4>
              <div className="space-y-1.5">
                {historicoCompras
                  .slice(0, 10)
                  .map((h, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs py-1.5 border-b last:border-b-0">
                      <div>
                        <RelationalLink onClick={() => pushView("nota_fiscal", h.notas_fiscais?.id)} mono className="text-xs">{h.notas_fiscais?.numero}</RelationalLink>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[150px]">{h.notas_fiscais?.fornecedores?.nome_razao_social || "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono">{formatCurrency(h.valor_unitario)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(h.notas_fiscais?.data_emissao)}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab: Preço */}
        <TabsContent value="preco" className="space-y-3 mt-3">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Custo</span>
                <p className="font-mono font-semibold text-lg">{formatCurrency(selected.preco_custo || 0)}</p>
                {semCusto && <p className="text-[10px] text-warning mt-0.5">Sem custo</p>}
              </div>
              <div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider block cursor-help">Markup</span>
                  </TooltipTrigger>
                  <TooltipContent>Markup = (venda / custo − 1) × 100. Calculado sobre o custo.</TooltipContent>
                </Tooltip>
                <p className={cn("font-mono font-semibold text-lg", markupPct == null ? "" : markupPct > 0 ? "text-success" : markupPct < 0 ? "text-destructive" : "")}>
                  {markupPct == null ? "—" : `${markupPct.toFixed(1)}%`}
                </p>
              </div>
              <div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider block cursor-help">Margem s/ venda</span>
                  </TooltipTrigger>
                  <TooltipContent>Margem = (venda − custo) / venda × 100. Calculada sobre o preço de venda.</TooltipContent>
                </Tooltip>
                <p className={`font-mono font-semibold text-lg ${selectedMargem > 0 ? "text-success" : selectedMargem < 0 ? "text-destructive" : ""}`}>
                  {margemSobreVendaPct == null ? "—" : `${margemSobreVendaPct.toFixed(1)}%`}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Venda</span>
                <p className="font-mono font-semibold text-lg text-primary">{formatCurrency(selected.preco_venda)}</p>
                {semVenda && <p className="text-[10px] text-warning mt-0.5">Não definido</p>}
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">Lucro Bruto</span>
                <span className={`font-mono font-semibold text-sm ${lucroBruto > 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(lucroBruto)}</span>
              </div>
              {Number(selected.estoque_atual || 0) > 0 && lucroBruto !== 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Lucro estimado em estoque</span>
                  <span className="font-mono text-xs">{formatCurrency(lucroEmEstoque)}</span>
                </div>
              )}
              {fornecedorPrincipal?.preco_compra != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Últ. Custo (Fornec. Principal)</span>
                  <span className="font-mono text-xs">{formatCurrency(fornecedorPrincipal.preco_compra)}</span>
                </div>
              )}
              {custoMedioCompras > 0 && Math.abs(custoMedioCompras - custoNum) > 0.01 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Custo médio das compras</span>
                  <span className="font-mono text-xs">
                    {formatCurrency(custoMedioCompras)}
                    <span className={cn("ml-1 text-[10px]", custoMedioCompras > custoNum ? "text-warning" : "text-success")}>
                      ({custoMedioCompras > custoNum ? "+" : ""}{((custoMedioCompras - custoNum) / (custoNum || 1) * 100).toFixed(1)}%)
                    </span>
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">Última atualização</span>
                <span className="font-mono text-xs text-muted-foreground">{formatDate(selected.updated_at)}</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Estoque */}
        <TabsContent value="estoque" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-lg border p-3 text-center ${estoqueBaixo ? "border-destructive/40 bg-destructive/5" : ""}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estoque Atual</p>
              <p className={`text-2xl font-bold font-mono ${estoqueBaixo ? "text-destructive" : ""}`}>{selected.estoque_atual ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">{selected.unidade_medida}</p>
              {estoqueBaixo && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <p className="text-[9px] text-destructive font-semibold">Abaixo do mínimo</p>
                </div>
              )}
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estoque Mínimo</p>
              <p className="text-2xl font-bold font-mono">{selected.estoque_minimo ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">{selected.unidade_medida}</p>
            </div>
          </div>
          {reservado > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Reservado</p>
                <p className="text-xl font-bold font-mono">{reservado}</p>
                <p className="text-[10px] text-muted-foreground">{selected.unidade_medida}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disponível</p>
                <p className={cn("text-xl font-bold font-mono", disponivel < 0 && "text-destructive")}>{disponivel}</p>
                <p className="text-[10px] text-muted-foreground">{selected.unidade_medida}</p>
              </div>
            </div>
          )}
          {estoqueValor > 0 && (
            <div className="rounded-lg border bg-card p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Valor em Estoque</span>
              </div>
              <span className="font-mono font-semibold text-sm">{formatCurrency(estoqueValor)}</span>
            </div>
          )}
          {(ultimaEntrada || ultimaSaida) && (
            <div className="grid grid-cols-2 gap-3">
              {ultimaEntrada && (
                <div className="rounded-lg border p-3 space-y-0.5">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Última Entrada</p>
                  <p className="font-mono font-semibold text-sm text-success">+{ultimaEntrada.quantidade}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(ultimaEntrada.created_at)}</p>
                  {ultimaEntrada.motivo && <p className="text-[9px] text-muted-foreground truncate">{ultimaEntrada.motivo}</p>}
                </div>
              )}
              {ultimaSaida && (
                <div className="rounded-lg border p-3 space-y-0.5">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Última Saída</p>
                  <p className="font-mono font-semibold text-sm text-destructive">-{ultimaSaida.quantidade}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(ultimaSaida.created_at)}</p>
                  {ultimaSaida.motivo && <p className="text-[9px] text-muted-foreground truncate">{ultimaSaida.motivo}</p>}
                </div>
              )}
            </div>
          )}
          {movimentos.length > 0 && (
            <div>
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <Archive className="w-3.5 h-3.5" /> Últimas Movimentações
              </h4>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {movimentos.map((m, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 border-b last:border-b-0 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${m.tipo === 'entrada' ? 'bg-success/10 text-success' : m.tipo === 'saida' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                        {m.tipo === 'entrada' ? '↑' : m.tipo === 'saida' ? '↓' : '↔'} {m.quantidade}
                      </span>
                      <span className="text-muted-foreground text-[10px]">{m.motivo || m.tipo}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground">{formatDate(m.created_at)}</span>
                      {m.saldo_atual != null && <p className="text-[9px] text-muted-foreground">Saldo: {m.saldo_atual}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab: Fiscal */}
        <TabsContent value="fiscal" className="space-y-3 mt-3">
          {!fiscalCompleto && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warning">Dados fiscais incompletos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Faltam: <strong className="text-foreground">{fiscalFaltantes.join(", ")}</strong>. Sem esses dados, a emissão fiscal pode ser bloqueada.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs border-warning/40 text-warning hover:bg-warning/10"
                onClick={() => {
                  navigate(`/produtos?editId=${id}`);
                  window.setTimeout(() => clearStack(), 0);
                }}
              >
                Completar dados
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Dados Fiscais</h4>
            {fiscalCompleto ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" /> Cadastro Completo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full font-medium">
                <AlertTriangle className="h-2.5 w-2.5" /> {fiscalFaltantes.length} pendência(s)
              </span>
            )}
          </div>
          <div className="space-y-2">
            <div className={cn("rounded-lg border bg-card p-3", !selected.ncm && "border-warning/30")}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">NCM</p>
              <p className="font-mono text-sm font-medium">{selected.ncm || <span className="text-muted-foreground text-xs italic">Não informado</span>}</p>
            </div>
            <div className={cn("rounded-lg border bg-card p-3", !selected.cst && "border-warning/30")}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">CST</p>
              <p className="font-mono text-sm font-medium">{selected.cst || <span className="text-muted-foreground text-xs italic">Não informado</span>}</p>
            </div>
            <div className={cn("rounded-lg border bg-card p-3", !selected.cfop_padrao && "border-warning/30")}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">CFOP Padrão</p>
              <p className="font-mono text-sm font-medium">{selected.cfop_padrao || <span className="text-muted-foreground text-xs italic">Não informado</span>}</p>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Preços Especiais */}
        <TabsContent value="precos" className="space-y-3 mt-3">
          <PrecosEspeciaisTab produtoId={selected.id} />
        </TabsContent>

        {/* Tab: Vendas */}
        <TabsContent value="vendas" className="space-y-3 mt-3">
          {historicoVendas.length === 0 ? (
            <DetailEmpty icon={FileText} title="Nenhuma venda registrada" message="Este produto ainda não foi vendido em notas fiscais de saída" />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <DrawerSummaryCard label="Qtd Vendida" value={totalVendido.toLocaleString("pt-BR")} align="center" />
                <DrawerSummaryCard label="Faturamento" value={formatCurrency(valorVendido)} align="center" />
                <DrawerSummaryCard label="Ticket Médio" value={formatCurrency(ticketMedioVenda)} align="center" />
                <DrawerSummaryCard
                  label="Margem Méd."
                  value={(selected.preco_custo || 0) > 0 ? `${margemMediaVenda.toFixed(1)}%` : "—"}
                  tone={margemMediaVenda > 0 ? "success" : margemMediaVenda < 0 ? "destructive" : "neutral"}
                  align="center"
                />
              </div>
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2 pt-2">
                <FileText className="w-3.5 h-3.5" /> Notas Fiscais de Saída
              </h4>
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {historicoVendas.map((h, idx: number) => {
                  const qtd = Number(h.quantidade || 0);
                  const vu = Number(h.valor_unitario || 0);
                  return (
                    <div key={idx} className="text-sm py-1.5 border-b last:border-b-0">
                      <div className="flex justify-between items-center">
                        <RelationalLink onClick={() => pushView("nota_fiscal", h.notas_fiscais?.id)} mono className="text-xs">{h.notas_fiscais?.numero}</RelationalLink>
                        <span className="text-[10px] text-muted-foreground">{formatDate(h.notas_fiscais?.data_emissao)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] mt-1">
                        {h.notas_fiscais?.clientes ? (
                          <RelationalLink onClick={() => pushView("cliente", h.notas_fiscais?.clientes?.id)} className="truncate max-w-[180px] text-xs">
                            {h.notas_fiscais.clientes.nome_razao_social}
                          </RelationalLink>
                        ) : (
                          <span className="truncate max-w-[180px] text-muted-foreground">—</span>
                        )}
                        <span className="font-mono">Qtd: {qtd} × {formatCurrency(vu)} = <span className="font-semibold">{formatCurrency(qtd * vu)}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={async () => {
          try {
            await deleteProduto(id);
            toast.success("Produto excluído com sucesso.");
            clearStack();
          } catch (err) {
            notifyError(err);
          } finally {
            setDeleteConfirmOpen(false);
          }
        }}
        title="Excluir produto"
        description={[
          `Tem certeza que deseja excluir "${selected?.nome || ""}"${selected?.sku ? ` (SKU: ${selected.sku})` : ""}?`,
          "Esta ação não pode ser desfeita.",
          fornecedoresProd.length > 0 ? `Este produto possui ${fornecedoresProd.length} fornecedor(es) vinculado(s).` : "",
          composicao.length > 0 ? "Este produto possui itens de composição." : "",
          (historicoCompras.length + historicoVendas.length) > 0 ? "Este produto possui histórico de notas fiscais." : "",
        ].filter(Boolean).join(" ")}
      />

      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="produtos"
        id={id}
        entityLabel="produto"
        recordName={selected?.nome || id}
        warning="Ação administrativa. Remove o produto do banco — não é inativação."
        sideEffects={[
          fornecedoresProd.length > 0 ? `${fornecedoresProd.length} vínculo(s) com fornecedor` : "Sem fornecedores vinculados",
          composicao.length > 0 ? `${composicao.length} item(ns) de composição` : "Sem composição",
          (historicoCompras.length + historicoVendas.length) > 0
            ? "Histórico fiscal vinculado — exclusão será bloqueada."
            : "Sem histórico fiscal.",
        ]}
        onDeleted={() => clearStack()}
      />
    </div>
  );
}

interface FieldItemProps {
  label: string;
  value: string | number | null | undefined;
  emptyText?: string;
  mono?: boolean;
  capitalize?: boolean;
}
function FieldItem({ label, value, emptyText = "—", mono, capitalize }: FieldItemProps) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      {isEmpty ? (
        <p className="text-sm text-muted-foreground italic">{emptyText}</p>
      ) : (
        <p className={cn("text-sm", mono && "font-mono", capitalize && "capitalize")}>{value}</p>
      )}
    </div>
  );
}
