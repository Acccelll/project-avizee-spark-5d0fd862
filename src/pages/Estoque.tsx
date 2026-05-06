import { useState, useMemo } from "react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { SummaryCard } from "@/components/SummaryCard";
import { EstoqueMovimentacaoDrawer } from "@/components/estoque/EstoqueMovimentacaoDrawer";
import { EstoquePosicaoDrawer } from "@/components/estoque/EstoquePosicaoDrawer";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useAjustarEstoque } from "@/pages/estoque/hooks/useAjustarEstoque";
import { useEstoquePosicao } from "@/pages/estoque/hooks/useEstoque";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/ui/scrollable-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Card, CardContent } from "@/components/ui/card";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { PeriodFilter, type PeriodValue } from "@/components/filters/PeriodFilter";
import { periodToDateFrom, periodToDateTo } from "@/lib/periodFilter";
import type { Period } from "@/components/filters/periodTypes";
import { toast } from "sonner";
import { formatNumber, formatCurrency } from "@/lib/format";
import type { TableRow } from "@/types/domain";
import { AlertTriangle, ArrowDownCircle, RotateCcw,
  TrendingDown, Package, CheckCircle, XCircle, ShieldAlert,
  DollarSign, SlidersHorizontal, ChevronsUpDown, Info, CircleAlert,
  ArrowRight, History,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { getOrigemConfig, getTipoMovConfig, tipoMovConfig } from "@/components/estoque/estoqueMovimentacaoConfig";
import { useIsMobile } from "@/hooks/use-mobile";
import { EstoqueAjusteSheet } from "@/components/estoque/EstoqueAjusteSheet";
import { useCan } from "@/hooks/useCan";
import { logger } from "@/lib/logger";
import { formatVariacoesSuffix } from "@/utils/cadastros";

type ProdutoRow = TableRow<"produtos">;

interface Movimento {
  id: string; produto_id: string; tipo: string; quantidade: number;
  saldo_anterior: number; saldo_atual: number; motivo: string | null;
  documento_tipo: string | null; documento_id: string | null; created_at: string;
  usuario_id?: string | null;
  produtos?: { nome: string; sku: string | null } | null;
}

type ProdutoPosicao = ProdutoRow & {
  estoque_reservado?: number | null;
};

type SituacaoEstoque = "normal" | "atencao" | "critico" | "zerado";

function getSituacao(p: ProdutoPosicao): SituacaoEstoque {
  const atual = Number(p.estoque_atual ?? 0);
  const minimo = Number(p.estoque_minimo ?? 0);
  if (atual <= 0) return "zerado";
  if (minimo > 0 && atual <= minimo) return "critico";
  if (minimo > 0 && atual <= minimo * 1.2) return "atencao";
  return "normal";
}

const situacaoConfig: Record<SituacaoEstoque, { label: string; icon: typeof CheckCircle; cls: string }> = {
  normal:  { label: "Normal",           icon: CheckCircle,   cls: "bg-success/10 text-success border-success/20" },
  atencao: { label: "Em Atenção",        icon: AlertTriangle, cls: "bg-warning/10 text-warning border-warning/20" },
  critico: { label: "Abaixo do Mínimo", icon: TrendingDown,  cls: "bg-destructive/10 text-destructive border-destructive/20" },
  zerado:  { label: "Sem Estoque",       icon: XCircle,       cls: "bg-destructive/10 text-destructive border-destructive/20" },
};

function SituacaoEstoqueBadge({ situacao }: { situacao: SituacaoEstoque }) {
  const cfg = situacaoConfig[situacao];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-xs font-medium gap-1 ${cfg.cls}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

const Estoque = () => {
  const { data, loading } = useSupabaseCrud<Movimento>({
    table: "estoque_movimentos", select: "*, produtos(nome, sku)", hasAtivo: false,
  });
  const isMobile = useIsMobile();
  const produtosCrud = useSupabaseCrud<ProdutoPosicao>({ table: "produtos" });
  const ajustar = useAjustarEstoque();
  const saving = ajustar.isPending;
  // Aba Saldos consome a view `vw_estoque_posicao` para refletir reservas.
  const { data: estoquePosicao = [], isLoading: posicaoLoading } = useEstoquePosicao();
  const [activeTab, setActiveTab] = useState("saldos");
  const [searchParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Movimento | null>(null);
  const [posicaoDrawerOpen, setPosicaoDrawerOpen] = useState(false);
  const [selectedPosicao, setSelectedPosicao] = useState<ProdutoPosicao | null>(null);
  const [form, setForm] = useState({
    produto_id: "",
    tipo: "ajuste" as "entrada" | "saida" | "ajuste",
    quantidade: 0,
    motivo: "",
    categoria_ajuste: "correcao_inventario",
  });
  const [confirmMovOpen, setConfirmMovOpen] = useState(false);
  const [pendingMovForm, setPendingMovForm] = useState<typeof form | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [showTodosProdutos, setShowTodosProdutos] = useState(false);
  const [produtoSelectorOpen, setProdutoSelectorOpen] = useState(false);
  // Bottom-sheet de ajuste rápido (mobile-first; pré-preenchível pelo banner crítico ou pelos cards)
  const [ajusteSheetOpen, setAjusteSheetOpen] = useState(false);
  const [ajusteSheetProdutoId, setAjusteSheetProdutoId] = useState<string | null>(null);
  const [ajusteSheetTipo, setAjusteSheetTipo] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const { can } = useCan();
  const canAjustar = can("estoque:editar");

  const abrirAjusteRapido = (produtoId: string, tipo: "entrada" | "saida" | "ajuste" = "entrada") => {
    if (!canAjustar) {
      toast.error("Você não tem permissão para ajustar estoque.");
      return;
    }
    setAjusteSheetProdutoId(produtoId);
    setAjusteSheetTipo(tipo);
    setAjusteSheetOpen(true);
  };
  // Saldos filters
  const [searchPosicao, setSearchPosicao] = useState("");
  const [situacaoFilters, setSituacaoFilters] = useState<string[]>([]);

  // Drill-down from Dashboard: ?critico=1 → tab "saldos" + filter for critical/zeroed.
  useEffect(() => {
    if (searchParams.get("critico") === "1") {
      setActiveTab("saldos");
      setSituacaoFilters((prev) => (prev.length ? prev : ["critico", "zerado"]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drill-down one-shot via ?critico=1; setters do useState são estáveis
  }, [searchParams]);
  // Movimentações filters
  const [searchMovimentacao, setSearchMovimentacao] = useState("");
  const [tipoFilters, setTipoFilters] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // Produtos abaixo do mínimo
  const abaixoMinimo = useMemo(() =>
    produtosCrud.data.filter((p) => p.ativo && (p.estoque_minimo ?? 0) > 0 && Number(p.estoque_atual ?? 0) <= Number(p.estoque_minimo ?? 0)),
    [produtosCrud.data]
  );

  // KPIs operacionais
  const kpis = useMemo(() => {
    const ativos = produtosCrud.data.filter((p) => p.ativo);
    const totalItens = ativos.length;
    // Use preco_custo for stock valuation; fall back to preco_venda only when cost is unavailable.
    const valorEstoque = ativos.reduce(
      (s, p) => s + Number(p.estoque_atual ?? 0) * Number(p.preco_custo ?? p.preco_venda ?? 0),
      0,
    );
    const itensZerados = ativos.filter((p) => Number(p.estoque_atual ?? 0) <= 0).length;
    const itensCriticos = abaixoMinimo.length + itensZerados;
    const ajustesManuais = data.filter((m) => m.tipo === "ajuste").length;
    return { totalItens, valorEstoque, itensCriticos, ajustesManuais };
  }, [produtosCrud.data, abaixoMinimo, data]);

  // Sparklines: contagem diária dos últimos 14 dias por tipo de movimento.
  // Mostra a tendência recente sem nova query — usa o `data` já carregado.
  const sparklines = useMemo(() => {
    const days = 14;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets: { saida: number[]; ajuste: number[]; entrada: number[] } = {
      saida: new Array(days).fill(0),
      ajuste: new Array(days).fill(0),
      entrada: new Array(days).fill(0),
    };
    for (const m of data) {
      if (!m.created_at) continue;
      const d = new Date(m.created_at);
      d.setHours(0, 0, 0, 0);
      const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
      if (diff < 0 || diff >= days) continue;
      const idx = days - 1 - diff;
      if (m.tipo === "saida" && buckets.saida[idx] !== undefined) buckets.saida[idx]++;
      else if (m.tipo === "ajuste" && buckets.ajuste[idx] !== undefined) buckets.ajuste[idx]++;
      else if (m.tipo === "entrada" && buckets.entrada[idx] !== undefined) buckets.entrada[idx]++;
    }
    return buckets;
  }, [data]);

  // Posição atual / Saldos
  const posicaoAtual = useMemo(() => {
    const q = searchPosicao.toLowerCase();
    // Adapta linhas da view `vw_estoque_posicao` para o shape ProdutoPosicao
    // usado pelos componentes/colunas existentes (mantém compatibilidade).
    const adaptados: ProdutoPosicao[] = estoquePosicao.map((row) => ({
      id: row.produto_id,
      nome: row.produto_nome,
      sku: row.sku,
      codigo_interno: row.codigo_interno,
      unidade_medida: row.unidade_medida,
      estoque_minimo: row.estoque_minimo ?? 0,
      preco_custo: row.preco_custo,
      preco_venda: row.preco_venda ?? 0,
      ativo: row.ativo,
      estoque_atual: row.estoque_atual,
      estoque_reservado: row.estoque_reservado,
      variacoes: row.variacoes,
      // Campos extras exigidos pelo tipo gerado mas não usados na coluna:
      created_at: "",
      updated_at: "",
    } as unknown as ProdutoPosicao));
    return adaptados
      .filter((p) => p.ativo !== false)
      .filter((p) => showTodosProdutos || Number(p.estoque_atual ?? 0) !== 0 || Number(p.estoque_minimo ?? 0) > 0)
      .filter((p) => {
        if (!q) return true;
        return p.nome?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.codigo_interno?.toLowerCase().includes(q);
      })
      .filter((p) => {
        if (!situacaoFilters.length) return true;
        return situacaoFilters.includes(getSituacao(p));
      });
  }, [estoquePosicao, searchPosicao, situacaoFilters, showTodosProdutos]);

  // Movimentações filtradas
  const filteredData = useMemo(() => {
    const q = searchMovimentacao.toLowerCase();
    return data.filter((m) => {
      if (tipoFilters.length > 0 && !tipoFilters.includes(m.tipo)) return false;
      if (dataInicio && m.created_at < dataInicio) return false;
      if (dataFim && m.created_at > dataFim + "T23:59:59") return false;
      if (q) {
        const nome = m.produtos?.nome?.toLowerCase() ?? "";
        const sku = m.produtos?.sku?.toLowerCase() ?? "";
        if (!nome.includes(q) && !sku.includes(q)) return false;
      }
      return true;
    });
  }, [data, tipoFilters, dataInicio, dataFim, searchMovimentacao]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingSubmit || saving) return;
    if (!form.produto_id) { toast.error("Selecione um produto"); return; }
    if (form.quantidade <= 0) { toast.error("A quantidade deve ser maior que zero"); return; }
    // Justificativa opcional por ora — RPC `ajustar_estoque_manual` exige
    // `motivo_estruturado` com >=10 chars para tipos críticos; aplicamos
    // fallback automático no executeMovimentacao quando vazia.
    // Warn about negative balance (allow with explicit confirmation via ConfirmDialog)
    if (form.tipo === "saida") {
      const produto = produtosCrud.data.find((p) => p.id === form.produto_id);
      const saldo = Number(produto?.estoque_atual ?? 0);
      if (form.quantidade > saldo) {
        // Will leave negative — still allow, but confirm explicitly
      }
    }
    setPendingMovForm({ ...form });
    setConfirmMovOpen(true);
  };

  const executeMovimentacao = async () => {
    if (!pendingMovForm || pendingSubmit || saving) return;
    setPendingSubmit(true);
    try {
      const produto = produtosCrud.data.find((p) => p.id === pendingMovForm.produto_id);
      const saldo_anterior = Number(produto?.estoque_atual ?? 0);
      const qty = pendingMovForm.tipo === "saida"
        ? -pendingMovForm.quantidade
        : pendingMovForm.tipo === "ajuste"
        ? pendingMovForm.quantidade - saldo_anterior
        : pendingMovForm.quantidade;
      const saldo_atual = pendingMovForm.tipo === "ajuste"
        ? pendingMovForm.quantidade
        : saldo_anterior + qty;

      // Roteia via RPC `ajustar_estoque_manual`, que enforca:
      //  - role admin/estoquista para tipos críticos
      //  - categoria_ajuste e motivo_estruturado >= 10 chars
      //  - atualização atômica de produtos.estoque_atual + auditoria
      const tipoRpc = pendingMovForm.tipo;
      const isCritico = tipoRpc === "ajuste";
      const motivoFinal = pendingMovForm.motivo?.trim()
        ? pendingMovForm.motivo
        : "Ajuste sem justificativa registrada";
      // Para entrada/saída a quantidade é o delta; para ajuste é o saldo absoluto.
      const quantidadeRpc = tipoRpc === "ajuste" ? pendingMovForm.quantidade : Math.abs(qty);
      await ajustar.mutateAsync({
        produto_id: pendingMovForm.produto_id,
        tipo: tipoRpc,
        quantidade: quantidadeRpc,
        motivo: motivoFinal,
        categoria_ajuste: isCritico ? pendingMovForm.categoria_ajuste : undefined,
        motivo_estruturado: isCritico ? motivoFinal : undefined,
      });
      // Variáveis de saldo previstas mantidas apenas para preview na UI.
      void saldo_anterior; void saldo_atual;

      // The hook's onSuccess already calls toast.success + cache invalidation.
      setForm({
        produto_id: "",
        tipo: "ajuste",
        quantidade: 0,
        motivo: "",
        categoria_ajuste: "correcao_inventario",
      });
      setPendingMovForm(null);
    } catch (err) {
      // onError in the hook already calls toast.error — log only for debugging.
      logger.error("[estoque] executeMovimentacao:", err);
    } finally {
      setPendingSubmit(false);
    }
  };

  // Saldos filter chips
  const saldosActiveFilters = useMemo((): FilterChip[] => {
    return situacaoFilters.map((s) => ({
      key: "situacao",
      label: "Situação",
      value: [s],
      displayValue: situacaoConfig[s as SituacaoEstoque]?.label ?? s,
    }));
  }, [situacaoFilters]);

  const handleRemoveSaldoFilter = (key: string, value?: string) => {
    if (key === "situacao") setSituacaoFilters((prev) => prev.filter((v) => v !== value));
  };

  // Movimentações filter chips
  const movActiveFilters = useMemo((): FilterChip[] => {
    return tipoFilters.map((f) => ({
      key: "tipo",
      label: "Tipo",
      value: [f],
      displayValue: tipoMovConfig[f]?.label ?? f,
    }));
  }, [tipoFilters]);

  const handleRemoveMovFilter = (key: string, value?: string) => {
    if (key === "tipo") setTipoFilters((prev) => prev.filter((v) => v !== value));
  };

  const tipoOptions: MultiSelectOption[] = [
    { label: "Entrada", value: "entrada" },
    { label: "Saída", value: "saida" },
    { label: "Ajuste Manual", value: "ajuste" },
    { label: "Transferência", value: "transferencia" },
    { label: "Reserva", value: "reserva" },
    { label: "Lib. de Reserva", value: "liberacao_reserva" },
    { label: "Estorno", value: "estorno" },
    { label: "Inventário", value: "inventario" },
    { label: "Perda/Avaria", value: "perda_avaria" },
  ];

  const situacaoOptions: MultiSelectOption[] = [
    { label: "Normal", value: "normal" },
    { label: "Em Atenção", value: "atencao" },
    { label: "Abaixo do Mínimo", value: "critico" },
    { label: "Sem Estoque", value: "zerado" },
  ];

  const movColumns = [
    { key: "produto", label: "Produto", mobilePrimary: true, render: (m: Movimento) => (
      <div><span className="font-medium">{m.produtos?.nome ?? "—"}</span><br/><span className="text-xs text-muted-foreground font-mono">{m.produtos?.sku}</span></div>
    )},
    { key: "tipo", label: "Tipo", render: (m: Movimento) => {
      const cfg = getTipoMovConfig(m.tipo);
      const Icon = cfg.icon;
      return (
        <Badge variant="outline" className={`text-xs font-medium gap-1 ${cfg.className}`}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </Badge>
      );
    }},
    { key: "quantidade", label: "Qtd", render: (m: Movimento) => {
      const cfg = getTipoMovConfig(m.tipo);
      const neg = cfg.direction === "out";
      const qtyTextClass =
        cfg.className.split(" ").find((c) => c.startsWith("text-")) ??
        (neg ? "text-destructive" : "text-success");
      return <span className={`font-mono font-semibold ${qtyTextClass}`}>{neg ? "-" : "+"}{formatNumber(m.quantidade)}</span>;
    }},
    { key: "saldo_atual", label: "Saldo", render: (m: Movimento) => <span className="font-semibold font-mono">{formatNumber(m.saldo_atual)}</span> },
    { key: "origem", label: "Origem", render: (m: Movimento) => {
      const origem = getOrigemConfig(m.documento_tipo);
      return <Badge variant="outline" className={`text-xs ${origem.className}`}>{origem.label}</Badge>;
    } },
    { key: "motivo", label: "Motivo / Observação", render: (m: Movimento) => m.motivo || <span className="text-muted-foreground">—</span> },
    { key: "created_at", label: "Data", render: (m: Movimento) => new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) },
  ];

  const posColumns = [
    { key: "nome", label: "Produto", mobilePrimary: true, render: (p: ProdutoPosicao) => (
      <div><span className="font-medium">{p.nome}</span>{p.sku && <><br/><span className="text-xs text-muted-foreground font-mono">{p.sku}</span></>}</div>
    )},
    { key: "unidade", label: "Unid.", render: (p: ProdutoPosicao) => p.unidade_medida ?? "UN" },
    { key: "estoque_atual", label: "Estoque Atual", render: (p: ProdutoPosicao) => <span className="font-semibold font-mono">{formatNumber(Number(p.estoque_atual ?? 0))}</span> },
    { key: "estoque_reservado", label: "Reservado", render: (p: ProdutoPosicao) => <span className="font-mono text-muted-foreground">{formatNumber(Number(p.estoque_reservado ?? 0))}</span>, hidden: true },
    { key: "estoque_disponivel", label: "Disponível", render: (p: ProdutoPosicao) => <span className="font-mono font-semibold">{formatNumber(Number(p.estoque_atual ?? 0) - Number(p.estoque_reservado ?? 0))}</span> },
    { key: "estoque_minimo", label: "Mínimo", render: (p: ProdutoPosicao) => <span className="font-mono text-muted-foreground">{(p.estoque_minimo ?? 0) > 0 ? formatNumber(p.estoque_minimo ?? 0) : "—"}</span> },
    { key: "situacao", label: "Situação", render: (p: ProdutoPosicao) => <SituacaoEstoqueBadge situacao={getSituacao(p)} /> },
    { key: "valor_estoque", label: "Valor Est.", render: (p: ProdutoPosicao) => {
      // Use preco_custo for valuation; fallback to preco_venda when cost is unavailable.
      const custo = Number(p.preco_custo ?? p.preco_venda ?? 0);
      return <span className="font-mono font-medium">{formatCurrency(Number(p.estoque_atual ?? 0) * custo)}</span>;
    }, hidden: true },
  ];

  // Preview do ajuste para o produto selecionado
  const produtoSelecionado = produtosCrud.data.find((p) => p.id === form.produto_id);
  const saldoAtualPreview = Number(produtoSelecionado?.estoque_atual ?? 0);
  const qty = isNaN(form.quantidade) ? 0 : form.quantidade;
  const novoSaldoPreview = form.tipo === "ajuste"
    ? qty
    : form.tipo === "saida"
    ? saldoAtualPreview - qty
    : saldoAtualPreview + qty;

  return (
    <><ModulePage
        title="Estoque"
        subtitle="Central de saúde do estoque — saldos, rastreabilidade e ajustes controlados"
        headerActions={
          <Button variant="outline" size="sm" className="gap-2 max-sm:hidden" onClick={() => setActiveTab("ajuste")} disabled={!canAjustar} title={canAjustar ? "Atalho — em mobile use a tab abaixo" : "Você não tem permissão para ajustar estoque"} data-help-id="estoque.ajusteBtn">
            <SlidersHorizontal className="h-4 w-4" />
            Ajuste Manual
          </Button>
        }
        summaryCards={
          <>
            <SummaryCard
              title="Itens em Estoque"
              value={formatNumber(kpis.totalItens)}
              icon={Package}
              variation="produtos ativos"
              variationType="neutral"
            />
            <SummaryCard
              title="Valor em Estoque"
              value={formatCurrency(kpis.valorEstoque)}
              icon={DollarSign}
              variation="pelo preço de custo"
              variationType="neutral"
              variant="info"
            />
            <SummaryCard
              title="Itens Críticos"
              value={formatNumber(kpis.itensCriticos)}
              icon={TrendingDown}
              variation={kpis.itensCriticos > 0 ? "exigem atenção" : "estoque saudável"}
              variationType={kpis.itensCriticos > 0 ? "negative" : "positive"}
              variant={kpis.itensCriticos > 0 ? "danger" : undefined}
              onClick={kpis.itensCriticos > 0 ? () => { setActiveTab("saldos"); setSituacaoFilters(["critico", "zerado"]); } : undefined}
              sparklineData={sparklines.saida}
            />
            <SummaryCard
              title="Ajustes Manuais"
              value={formatNumber(kpis.ajustesManuais)}
              icon={RotateCcw}
              variation="evento sensível auditável"
              variationType="negative"
              variant="warning"
              sparklineData={sparklines.ajuste}
            />
          </>
        }
      >

        {abaixoMinimo.length > 0 && (
          <Card className="mb-4 border-destructive/50 bg-destructive/5">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-1">
                <AlertTriangle className="w-4 h-4" /> {abaixoMinimo.length} produto(s) abaixo do estoque mínimo
              </div>
              <div className="flex flex-wrap gap-2">
                {abaixoMinimo.slice(0, 8).map((p) => (
                  <div key={p.id} className="inline-flex items-stretch rounded-full overflow-hidden border border-destructive/30 bg-destructive/10 max-sm:min-h-[44px]">
                    <button
                      type="button"
                      className="text-xs text-destructive px-3 py-1 max-sm:py-2 font-medium hover:bg-destructive/20 transition-colors text-left"
                      onClick={() => { setSelectedPosicao(p as ProdutoPosicao); setPosicaoDrawerOpen(true); }}
                      title="Ver posição"
                    >
                      {p.nome} <span className="font-mono opacity-80">({p.estoque_atual}/{p.estoque_minimo})</span>
                    </button>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-destructive border-l border-destructive/30 px-3 py-1 hover:bg-destructive/20 transition-colors flex items-center gap-1"
                      onClick={() => abrirAjusteRapido(p.id, "entrada")}
                      title="Registrar entrada rápida"
                    >
                      <SlidersHorizontal className="h-3 w-3" /> Ajustar
                    </button>
                  </div>
                ))}
                {abaixoMinimo.length > 8 && <span className="text-xs text-muted-foreground">+{abaixoMinimo.length - 8} mais</span>}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <ScrollableTabsList className="mb-4" data-help-id="estoque.tabs">
            <TabsTrigger value="saldos" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />Saldos
            </TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />Movimentações
            </TabsTrigger>
            <TabsTrigger value="ajuste" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />Ajuste Manual
            </TabsTrigger>
          </ScrollableTabsList>

          {/* ── ABA SALDOS ─────────────────────────────────────── */}
          <TabsContent value="saldos">
            <div className="mb-2">
              <p className="text-xs text-muted-foreground">Estado atual do estoque — posição de cada item, criticidade e valor.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-info/30/40 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 text-info" />
                A lista exibe por padrão apenas itens com saldo ≠ 0 ou com estoque mínimo definido.
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setShowTodosProdutos((prev) => !prev)}>
                  {showTodosProdutos ? "Ocultar sem movimentação" : "Mostrar todos os produtos"}
                </Button>
              </div>
            </div>
            <div data-help-id="estoque.filtros">
            <AdvancedFilterBar
              searchValue={searchPosicao}
              onSearchChange={setSearchPosicao}
              searchPlaceholder="Buscar produto por nome, SKU ou código..."
              activeFilters={saldosActiveFilters}
              onRemoveFilter={handleRemoveSaldoFilter}
              onClearAll={() => { setSituacaoFilters([]); setSearchPosicao(""); setShowTodosProdutos(false); }}
              count={posicaoAtual.length}
            >
              <MultiSelect
                options={situacaoOptions}
                selected={situacaoFilters}
                onChange={setSituacaoFilters}
                placeholder="Situação"
                className="w-[180px]"
              />
            </AdvancedFilterBar>
            </div>
            <div data-help-id="estoque.tabela">
            <DataTable
              columns={posColumns}
              data={posicaoAtual}
              loading={posicaoLoading}
              moduleKey="estoque-saldos"
              showColumnToggle={true}
              onView={(p) => { setSelectedPosicao(p as ProdutoPosicao); setPosicaoDrawerOpen(true); }}
              mobileStatusKey="situacao"
              mobileIdentifierKey="estoque_atual"
              rowAccent={(p) => {
                const sit = getSituacao(p as ProdutoPosicao);
                if (sit === 'zerado') return 'destructive';
                if (sit === 'critico') return 'warning';
                return null;
              }}
              mobilePrimaryAction={(p) => {
                const sit = getSituacao(p as ProdutoPosicao);
                if (sit !== "critico" && sit !== "zerado") return null;
                return (
                  <Button
                    size="lg"
                    variant="default"
                    className="h-11 w-full gap-2 text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirAjusteRapido(p.id, "entrada");
                    }}
                  >
                    <SlidersHorizontal className="h-4 w-4" /> Ajustar saldo
                  </Button>
                );
              }}
              emptyTitle="Nenhum item encontrado"
              emptyDescription="Ajuste os filtros ou verifique se há produtos com estoque ou mínimo cadastrado."
            />
            </div>
          </TabsContent>

          {/* ── ABA MOVIMENTAÇÕES ──────────────────────────────── */}
          <TabsContent value="movimentacoes">
            <div className="mb-2">
              <p className="text-xs text-muted-foreground">Auditoria rápida — entradas, saídas, ajustes e origem de cada movimentação.</p>
            </div>
            <AdvancedFilterBar
              searchValue={searchMovimentacao}
              onSearchChange={setSearchMovimentacao}
              searchPlaceholder="Buscar produto por nome ou SKU..."
              activeFilters={movActiveFilters}
              onRemoveFilter={handleRemoveMovFilter}
              onClearAll={() => { setTipoFilters([]); setSearchMovimentacao(""); setDataInicio(""); setDataFim(""); }}
              count={filteredData.length}
            >
              <MultiSelect
                options={tipoOptions}
                selected={tipoFilters}
                onChange={setTipoFilters}
                placeholder="Tipo de Movimento"
                className="w-[200px]"
              />
              <PeriodFilter
                mode="both"
                value={{ preset: null, from: dataInicio || null, to: dataFim || null }}
                onChange={(next: PeriodValue) => {
                  if (next.preset) {
                    const from = periodToDateFrom(next.preset as Period);
                    const to = periodToDateTo(next.preset as Period) ?? new Date().toISOString().slice(0, 10);
                    setDataInicio(from);
                    setDataFim(to);
                    return;
                  }
                  setDataInicio(next.from || "");
                  setDataFim(next.to || "");
                }}
                direction="past"
              />
            </AdvancedFilterBar>
            <DataTable
              columns={movColumns}
              data={filteredData}
              loading={loading}
              moduleKey="estoque-movimentacoes"
              showColumnToggle={true}
              onView={(m) => { setSelected(m); setDrawerOpen(true); }}
              mobileStatusKey="tipo"
              mobileIdentifierKey="quantidade"
              emptyTitle="Nenhuma movimentação encontrada"
              emptyDescription="Ajuste os filtros de tipo, data ou busque por produto."
            />
          </TabsContent>

          {/* ── ABA AJUSTE MANUAL ─────────────────────────────── */}
          <TabsContent value="ajuste">
            <div className="space-y-5">
              {/* Aviso de operação sensível — borda lateral discreta */}
              <div className="rounded-md border-l-4 border-warning bg-warning/5 px-4 py-3 flex gap-3">
                <ShieldAlert className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-warning mb-0.5">Operação administrativa controlada</p>
                  <p className="text-xs text-muted-foreground">
                    Ajustes manuais alteram diretamente o saldo do estoque e geram rastreabilidade.
                    Todas as operações ficam registradas com responsável e data.
                  </p>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {/* Coluna esquerda: formulário (2/3) */}
                <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-4">
                  {/* Card: Produto */}
                  <Card>
                    <CardContent className="space-y-3 pt-5">
                      <h3 className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Produto</h3>
                      <div className="space-y-2">
                  <Label>Produto *</Label>
                  <Popover open={produtoSelectorOpen} onOpenChange={setProdutoSelectorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={produtoSelectorOpen}
                        className="w-full justify-between font-normal h-9 max-sm:h-11 text-left"
                      >
                        {form.produto_id ? (() => {
                          const p = produtosCrud.data.find((x) => x.id === form.produto_id);
                          return p ? (
                            <span className="truncate flex items-center gap-2">
                              <span className="font-medium">{p.nome}{formatVariacoesSuffix((p as { variacoes?: unknown }).variacoes)}</span>
                              {p.sku && <span className="text-muted-foreground font-mono text-xs">({p.sku})</span>}
                              <span className="text-muted-foreground text-xs ml-1">Est: {formatNumber(p.estoque_atual)}</span>
                            </span>
                          ) : "Selecione o produto...";
                        })() : (
                          <span className="text-muted-foreground">Selecione o produto...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] sm:w-[480px] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Buscar por nome, SKU ou código..." />
                        <CommandList>
                          <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                          <CommandGroup>
                            {produtosCrud.data.filter((p) => p.ativo !== false).map((p) => (
                              <CommandItem
                                key={p.id}
                                value={[p.nome, formatVariacoesSuffix((p as { variacoes?: unknown }).variacoes), p.sku, p.codigo_interno].filter(Boolean).join(" ")}
                                onSelect={() => {
                                  setForm((f) => ({ ...f, produto_id: p.id }));
                                  setProdutoSelectorOpen(false);
                                }}
                                className={cn("gap-2 cursor-pointer", form.produto_id === p.id && "bg-primary/5")}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{p.nome}{formatVariacoesSuffix((p as { variacoes?: unknown }).variacoes)}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {p.sku && <span className="text-[11px] text-muted-foreground font-mono">{p.sku}</span>}
                                    {p.codigo_interno && p.codigo_interno !== p.sku && <span className="text-[11px] text-muted-foreground font-mono">CI: {p.codigo_interno}</span>}
                                    <span className="text-[11px] text-muted-foreground">{p.unidade_medida || "UN"}</span>
                                  </div>
                                </div>
                                <span className={cn("text-xs font-mono font-semibold shrink-0", Number(p.estoque_atual) <= 0 ? "text-destructive" : "text-success")}>
                                  {formatNumber(p.estoque_atual)} {p.unidade_medida || "UN"}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card: Operação */}
                  <Card>
                    <CardContent className="space-y-4 pt-5">
                      <h3 className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Operação</h3>
                      <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Operação *</Label>
                     <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as "entrada" | "saida" | "ajuste" })}>
                      <SelectTrigger className="max-sm:h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada — adicionar ao saldo</SelectItem>
                        <SelectItem value="saida">Saída — reduzir do saldo</SelectItem>
                        <SelectItem value="ajuste">Ajuste — definir novo saldo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{form.tipo === "ajuste" ? "Novo Saldo *" : "Quantidade *"}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.quantidade || ""}
                      onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
                      className="max-sm:h-11"
                      inputMode="decimal"
                      required
                    />
                  </div>
                </div>

                <div className={cn(
                  "rounded-md border-l-4 px-3 py-2 text-xs flex gap-2 border bg-card",
                  form.tipo === "saida" ? "border-l-warning bg-warning/5 text-warning" :
                  form.tipo === "entrada" ? "border-success/40 bg-success/5 text-success" :
                  "border-warning/40 bg-warning/10 text-warning"
                )}>
                  {form.tipo === "ajuste" ? <ShieldAlert className="h-3.5 w-3.5 mt-0.5" /> : <CircleAlert className="h-3.5 w-3.5 mt-0.5" />}
                  <p>
                    {form.tipo === "ajuste"
                      ? "Ajuste manual define o novo saldo absoluto e deve ser usado apenas para correções administrativas."
                      : form.tipo === "saida"
                        ? "Saída manual reduz o saldo e pode levar a saldo negativo se a quantidade exceder o disponível."
                        : "Entrada manual incrementa o saldo; prefira fluxos de compra quando houver documento fiscal."}
                  </p>
                </div>

                {form.tipo === "ajuste" && (
                  <div className="space-y-2">
                    <Label>
                      Categoria do ajuste *{" "}
                      <span className="text-xs font-normal text-muted-foreground">(exigido pela RPC; cai em auditoria_logs)</span>
                    </Label>
                    <Select
                      value={form.categoria_ajuste}
                      onValueChange={(v) => setForm({ ...form, categoria_ajuste: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="correcao_inventario">Correção de inventário</SelectItem>
                        <SelectItem value="perda">Perda</SelectItem>
                        <SelectItem value="avaria">Avaria</SelectItem>
                        <SelectItem value="vencimento">Vencimento</SelectItem>
                        <SelectItem value="furto_extravio">Furto / extravio</SelectItem>
                        <SelectItem value="divergencia_recebimento">Divergência de recebimento</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Apenas usuários com perfil <strong>admin</strong> ou <strong>estoquista</strong> podem registrar ajustes críticos. A justificativa é opcional, mas recomendada para auditoria.
                    </p>
                  </div>
                )}
                    </CardContent>
                  </Card>

                  {/* Card destaque: Preview do saldo */}
                  {produtoSelecionado && (
                    <Card className="border-primary/30 bg-primary/5">
                      <CardContent className="pt-5">
                        <h3 className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground mb-3">Impacto no saldo</h3>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Saldo Atual</p>
                            <p className="font-bold font-mono text-3xl tabular-nums">{formatNumber(saldoAtualPreview)}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{produtoSelecionado.unidade_medida || "UN"}</p>
                          </div>
                          <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0" />
                          <div className="flex-1 text-right">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Novo Saldo</p>
                            <p className={cn(
                              "font-bold font-mono text-3xl tabular-nums",
                              novoSaldoPreview < 0 ? "text-destructive" :
                              novoSaldoPreview === 0 ? "text-warning" :
                              novoSaldoPreview === saldoAtualPreview ? "text-muted-foreground" :
                              "text-success"
                            )}>
                              {formatNumber(novoSaldoPreview)}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {novoSaldoPreview > saldoAtualPreview ? `+${formatNumber(novoSaldoPreview - saldoAtualPreview)} ` :
                               novoSaldoPreview < saldoAtualPreview ? `${formatNumber(novoSaldoPreview - saldoAtualPreview)} ` : "sem alteração "}
                              {produtoSelecionado.unidade_medida || "UN"}
                            </p>
                          </div>
                        </div>
                        {novoSaldoPreview < 0 && (
                          <div className="mt-3 text-xs text-destructive font-medium flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Atenção: o saldo ficará negativo após esta operação.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Card: Justificativa */}
                  <Card>
                    <CardContent className="space-y-3 pt-5">
                      <h3 className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Justificativa</h3>
                      <div className="space-y-2">
                  <Label>
                    Motivo / Justificativa{" "}
                    <span className="text-xs font-normal text-muted-foreground">(opcional — recomendado para auditoria)</span>
                  </Label>
                  <Textarea
                    value={form.motivo}
                    onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                    placeholder="Descreva o motivo do ajuste (ex: contagem física, correção de lançamento, perda identificada...)"
                    rows={3}
                  />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Botões fixos no rodapé */}
                  <div className="sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-background/95 backdrop-blur border-t flex justify-end gap-2">
                   <Button
                     type="button"
                     variant="outline"
                     onClick={() => setForm({ produto_id: "", tipo: "ajuste", quantidade: 0, motivo: "", categoria_ajuste: "correcao_inventario" })}
                   >
                    Limpar
                  </Button>
                  <Button type="submit" disabled={saving || pendingSubmit}>
                    {saving || pendingSubmit ? "Registrando..." : "Registrar Ajuste"}
                  </Button>
                  </div>
                </form>

                {/* Coluna direita: histórico recente */}
                <aside className="lg:col-span-1">
                  <Card className="lg:sticky lg:top-4">
                    <CardContent className="pt-5 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <History className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                          {produtoSelecionado ? "Últimos ajustes" : "Histórico"}
                        </h3>
                      </div>
                      {!produtoSelecionado ? (
                        <p className="text-xs text-muted-foreground py-6 text-center">
                          Selecione um produto para ver o histórico de ajustes.
                        </p>
                      ) : (() => {
                        const ajustes = data
                          .filter((m) => m.produto_id === produtoSelecionado.id && m.tipo === "ajuste")
                          .sort((a, b) => b.created_at.localeCompare(a.created_at))
                          .slice(0, 5);
                        if (ajustes.length === 0) {
                          return (
                            <p className="text-xs text-muted-foreground py-6 text-center">
                              Nenhum ajuste manual registrado para este produto.
                            </p>
                          );
                        }
                        return (
                          <ul className="space-y-2.5">
                            {ajustes.map((m) => (
                              <li key={m.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="font-mono font-semibold tabular-nums">
                                    {formatNumber(m.saldo_anterior)} → {formatNumber(m.saldo_atual)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(m.created_at).toLocaleDateString("pt-BR")}
                                  </span>
                                </div>
                                {m.motivo && (
                                  <p className="text-muted-foreground line-clamp-2">{m.motivo}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </aside>
              </div>
            </div>
          </TabsContent>
        </Tabs>

      </ModulePage>

      <EstoqueMovimentacaoDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelected(null); }}
        movimentacao={selected}
      />

      <EstoquePosicaoDrawer
        open={posicaoDrawerOpen}
        onClose={() => setPosicaoDrawerOpen(false)}
        produto={selectedPosicao}
        movimentos={data}
      />

      <ConfirmDialog
        open={confirmMovOpen}
        onClose={() => { setConfirmMovOpen(false); setPendingMovForm(null); }}
        onConfirm={() => { setConfirmMovOpen(false); executeMovimentacao(); }}
        title="Confirmar movimentação de estoque"
        description={(() => {
          if (!pendingMovForm) return "";
          const produto = produtosCrud.data.find((p) => p.id === pendingMovForm.produto_id);
          const nome = produto?.nome ?? "produto";
          const tipoLabels: Record<string, string> = { entrada: "entrada de", saida: "saída de", ajuste: "ajuste para" };
          const tipoLabel = tipoLabels[pendingMovForm.tipo] ?? pendingMovForm.tipo;
          const avisoNegativo = pendingMovForm.tipo === "saida" && novoSaldoPreview < 0 ? " O saldo ficará negativo." : "";
          const avisoAjuste = pendingMovForm.tipo === "ajuste" ? " Este ajuste sobrescreve o saldo atual." : "";
          return `Confirmar ${tipoLabel} ${pendingMovForm.quantidade} unidade(s) do produto "${nome}"?${avisoAjuste}${avisoNegativo}`;
        })()}
        confirmLabel="Confirmar"
        confirmVariant="default"
        loading={saving || pendingSubmit}
      />

      <EstoqueAjusteSheet
        open={ajusteSheetOpen}
        onClose={() => { setAjusteSheetOpen(false); setAjusteSheetProdutoId(null); }}
        produtoId={ajusteSheetProdutoId}
        tipoInicial={ajusteSheetTipo}
      />
    </>
  );
};

export default Estoque;
