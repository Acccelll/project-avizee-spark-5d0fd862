
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCard } from "@/components/SummaryCard";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { FileOutput, AlertTriangle, Eye, Pencil } from "lucide-react";
import { useClientesRef } from "@/hooks/useReferenceCache";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { Button } from "@/components/ui/button";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { PeriodFilter, type PeriodValue } from "@/components/filters/PeriodFilter";
import { periodToDateFrom, periodToDateTo } from "@/lib/periodFilter";
import type { Period } from "@/components/filters/periodTypes";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, daysSince, formatNumber, calculateDaysBetween } from "@/lib/format";
import { FileText, DollarSign, Truck } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useFaturarPedido } from "@/pages/comercial/hooks/useFaturarPedido";
import { canFaturarPedido, getPedidoStatusLabel, statusFaturamentoLabels } from "@/lib/comercialWorkflow";
import { useCan } from "@/hooks/useCan";
import { statusPedido } from "@/lib/statusSchema";
import { verificarEstoquePedido } from "@/utils/comercialStock";
import { verificarPrerequisitosNF, type NFPrerequisiteIssue } from "@/utils/comercialNFChecks";
import type { StockShortfall } from "@/types/comercial";
import { subscribeComercial } from "@/lib/realtime/comercialChannel";
import { INVALIDATION_KEYS } from "@/services/_invalidationKeys";
import { useUrlListState } from "@/hooks/useUrlListState";
import { comercialKeys } from "@/lib/queryKeys/comercial";
import { notifyError } from "@/utils/errorMessages";
import { useAppConfig } from "@/hooks/useAppConfig";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Pedido {
  id: string;
  numero: string;
  data_emissao: string | null;
  cliente_id: string | null;
  cotacao_id: string | null;
  status: string;
  status_faturamento: string | null;
  data_aprovacao: string | null;
  data_prometida_despacho: string | null;
  prazo_despacho_dias: number | null;
  valor_total: number | null;
  observacoes: string | null;
  po_number: string | null;
  ativo: boolean;
  clientes?: { nome_razao_social: string } | null;
  orcamentos?: { id: string; numero: string } | null;
}

const TERMINAL_STATUSES_PEDIDO = ["entregue", "faturado", "cancelada"];
// M-03: padrão; agora override via app_configuracoes("comercial").alerta_prazo_despacho_dias.
const PRAZO_ALERTA_DIAS_DEFAULT = 3;
const DIAS_ABERTO_ALERTA = 30;

function getPrazoStatus(dataPrazo: string | null, statusOp: string, alertaDias: number): "atrasado" | "proximo" | "ok" | "sem_prazo" {
  if (!dataPrazo) return "sem_prazo";
  if (TERMINAL_STATUSES_PEDIDO.includes(statusOp)) return "ok";
  const daysLeft = calculateDaysBetween(new Date(), dataPrazo);
  if (daysLeft < 0) return "atrasado";
  if (daysLeft <= alertaDias) return "proximo";
  return "ok";
}

function PrazoBadge({ dataPrazo, status, alertaDias }: { dataPrazo: string | null; status: string; alertaDias: number }) {
  if (!dataPrazo) {
    return (
      <span
        className="text-xs text-muted-foreground italic"
        title="Sem prazo de despacho definido"
      >
        Sem prazo
      </span>
    );
  }
  const ps = getPrazoStatus(dataPrazo, status, alertaDias);
  const daysLeft = calculateDaysBetween(new Date(), dataPrazo);

  if (ps === "atrasado") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="text-xs text-destructive font-medium">{formatDate(dataPrazo)}</span>
        <StatusBadge status="atrasado" className="text-[10px] px-1.5 py-0 h-4" />
      </span>
    );
  }
  if (ps === "proximo") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="text-xs text-warning font-medium">{formatDate(dataPrazo)}</span>
        <StatusBadge status="proximo_vencimento" label={`${daysLeft}d restantes`} className="text-[10px] px-1.5 py-0 h-4" />
      </span>
    );
  }
  return <span className="text-xs">{formatDate(dataPrazo)}</span>;
}

function pedidoTooltipFor(p: { status: string; status_faturamento: string | null }): string {
  const s = p.status;
  const f = p.status_faturamento ?? "";
  if (s === "aprovada" && f === "aguardando") return "Pedido aprovado, aguardando emissão de NF";
  if (s === "aprovada" && f === "parcial") return "Aguardando NF complementar";
  if (s === "em_separacao") return "Pedido em separação no estoque";
  if (s === "separado") return "Pedido separado, pronto para faturar";
  if (s === "em_transporte") return "Pedido a caminho do cliente";
  if (s === "entregue") return "Pedido entregue ao cliente";
  if (s === "faturada" || f === "total") return "Pedido faturado integralmente";
  if (s === "cancelada") return "Pedido cancelado";
  return getPedidoStatusLabel(s);
}

const Pedidos = () => {
  const { pushView } = useRelationalNavigation();
  const navigate = useNavigate();
  const faturarPedido = useFaturarPedido();
  const { can } = useCan();
  const canFaturar = can("faturamento_fiscal:criar") || can("pedidos:editar");
  // M-03: alerta_prazo_despacho_dias parametrizável via app_configuracoes("comercial").
  const { value: comercialFlags } = useAppConfig<{ alerta_prazo_despacho_dias?: number }>(
    "comercial",
    { alerta_prazo_despacho_dias: PRAZO_ALERTA_DIAS_DEFAULT },
  );
  const prazoAlertaDias = Number(comercialFlags?.alerta_prazo_despacho_dias ?? PRAZO_ALERTA_DIAS_DEFAULT);
  const prazoFilterOptions: MultiSelectOption[] = [
    { label: "Atrasados", value: "atrasado" },
    { label: `Próximos (≤${prazoAlertaDias}d)`, value: "proximo" },
    { label: "No prazo", value: "ok" },
    { label: "Sem prazo", value: "sem_prazo" },
  ];
  const qc = useQueryClient();
  // A-07/SH-03: grid passa a usar React Query puro. As mutações (faturar,
  // cancelar) já chamam RPC + invalidam `["ordens_venda"]` via
  // INVALIDATION_KEYS, então não precisamos mais de `useSupabaseCrud` (que
  // mantinha cache paralelo). Realtime continua via subscribeComercial abaixo.
  const pedidosQuery = useQuery({
    queryKey: comercialKeys.pedidos(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("ordens_venda")
        .select("*, clientes(nome_razao_social), orcamentos(id, numero)")
        .eq("ativo", true)
        .order("created_at", { ascending: false });
      if (error) {
        notifyError(error);
        throw error;
      }
      return (rows ?? []) as unknown as Pedido[];
    },
  });
  const data = pedidosQuery.data ?? [];
  const loading = pedidosQuery.isLoading;
  const fetchData = async () => {
    await pedidosQuery.refetch();
  };

  // A-01 (decisão): cancelamento é "drawer-only" — não exibimos botão Cancelar
  // na grid para forçar a passagem pela tela de detalhe (motivo, NFs ativas,
  // confirmação cross-módulo). Permissão `pedidos:cancelar` continua sendo
  // checada dentro do `OrdemVendaView`.
  //
  // Realtime: invalida grid quando ordens_venda/notas_fiscais mudam em outras
  // abas, RPCs (faturar/estornar) ou triggers — mantém status_faturamento
  // sincronizado sem refresh manual.
  useEffect(() => {
    return subscribeComercial(() => {
      INVALIDATION_KEYS.faturamentoPedido.forEach((key) => {
        qc.invalidateQueries({ queryKey: [key] });
      });
    });
  }, [qc]);

  const [searchParams, setSearchParams] = useSearchParams();

  // Querystring CSV unificada com Orçamentos/Financeiro (compatível com
  // `buildDrilldownUrl`). Schema centralizado via `useUrlListState`.
  const { value: filterState, set: setFilters, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      status: { type: "stringArray" },
      faturamento: { type: "stringArray" },
      cliente: { type: "stringArray" },
      prazo: { type: "stringArray" },
      de: { type: "string" },
      ate: { type: "string" },
    },
  });
  const searchTerm = filterState.q;
  const statusFilters = filterState.status;
  const faturamentoFilters = filterState.faturamento;
  const clienteFilters = filterState.cliente;
  const prazoFilters = filterState.prazo;
  const dataInicio = filterState.de;
  const dataFim = filterState.ate;

  const setSearchTerm = (v: string) => setFilters({ q: v });
  const setStatusFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(statusFilters) : fn;
    setFilters({ status: next });
  };
  const setFaturamentoFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(faturamentoFilters) : fn;
    setFilters({ faturamento: next });
  };
  const setClienteFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(clienteFilters) : fn;
    setFilters({ cliente: next });
  };
  const setPrazoFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(prazoFilters) : fn;
    setFilters({ prazo: next });
  };
  const setDataInicio = (v: string) => setFilters({ de: v });
  const setDataFim = (v: string) => setFilters({ ate: v });

  // Bridge PeriodFilter (preset/range) ↔ URL (`de`/`ate`).
  // Presets são backward-looking (emissão dos últimos N dias) usando periodToDateFrom.
  const periodValue: PeriodValue = { preset: null, from: dataInicio || null, to: dataFim || null };
  const handlePeriodChange = (next: PeriodValue) => {
    if (next.preset) {
      const from = periodToDateFrom(next.preset as Period);
      const to = periodToDateTo(next.preset as Period) ?? new Date().toISOString().slice(0, 10);
      setSearchParams((prev) => {
        const np = new URLSearchParams(prev);
        np.set("de", from);
        np.set("ate", to);
        return np;
      }, { replace: true });
      return;
    }
    setSearchParams((prev) => {
      const np = new URLSearchParams(prev);
      if (next.from) np.set("de", next.from); else np.delete("de");
      if (next.to) np.set("ate", next.to); else np.delete("ate");
      return np;
    }, { replace: true });
  };

  const { data: clientesList = [] } = useClientesRef();
  const [generatingNfId, setGeneratingNfId] = useState<string | null>(null);
  const [insufficientStock, setInsufficientStock] = useState<StockShortfall[]>([]);
  const [stockCheckPending, setStockCheckPending] = useState(false);
  const [nfChecklist, setNfChecklist] = useState<NFPrerequisiteIssue[]>([]);

  // KPIs computed over the filtered list so they reflect what the user sees.
  // (filteredData is defined below; the memo deps include it.)

  const handleView = (pedido: Pedido) => {
    pushView("ordem_venda", pedido.id);
  };

  const handleRequestGenerateNF = async (pedido: Pedido) => {
    if (stockCheckPending || generatingNfId) return; // prevent double-click
    setStockCheckPending(true);
    try {
      const [shortfall, prereqs] = await Promise.all([
        verificarEstoquePedido(pedido.id),
        verificarPrerequisitosNF(pedido.id),
      ]);
      setInsufficientStock(shortfall);
      setNfChecklist(prereqs);
      setGeneratingNfId(pedido.id);
    } finally {
      setStockCheckPending(false);
    }
  };


  const handleGenerateNF = async (pedido: Pedido) => {
    try {
      // Usa RPC transacional via mutation hook (invalida fiscal/financeiro/estoque
      // em background — substitui a lógica TS multi-step + fetchData local).
      await faturarPedido.mutateAsync(pedido.id);
      // Não precisa refetch manual: o hook invalida ["ordens_venda"] em
      // INVALIDATION_KEYS.faturamentoPedido e o useQuery acima reage.
    } catch (err: unknown) {
      console.error('[pedidos] gerar NF:', err);
      // toast já emitido pelo hook
    } finally {
      setGeneratingNfId(null);
    }
  };

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return data.filter((pedido) => {
      if (statusFilters.length > 0 && !statusFilters.includes(pedido.status)) return false;
      if (faturamentoFilters.length > 0 && !faturamentoFilters.includes(pedido.status_faturamento ?? "")) return false;
      if (clienteFilters.length > 0 && !clienteFilters.includes(pedido.cliente_id || "")) return false;

      if (prazoFilters.length > 0) {
        const ps = getPrazoStatus(pedido.data_prometida_despacho, pedido.status, prazoAlertaDias);
        if (!prazoFilters.includes(ps)) return false;
      }

      if (dataInicio) {
        const emissao = pedido.data_emissao;
        if (!emissao || emissao < dataInicio) return false;
      }
      if (dataFim) {
        const emissao = pedido.data_emissao;
        if (!emissao || emissao > dataFim) return false;
      }

      if (!query) return true;
      return [pedido.numero, pedido.clientes?.nome_razao_social, pedido.orcamentos?.numero, pedido.po_number, pedido.observacoes].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [data, faturamentoFilters, searchTerm, statusFilters, clienteFilters, prazoFilters, dataInicio, dataFim, prazoAlertaDias]);

  // KPIs over filteredData so they reflect the user's current filter selection.
  const kpis = useMemo(() => {
    const total = filteredData.length;
    const totalValue = filteredData.reduce((s, o) => s + Number(o.valor_total || 0), 0);
    const aguardandoFat = filteredData.filter(o => canFaturarPedido(o)).length;
    const atrasados = filteredData.filter(o => getPrazoStatus(o.data_prometida_despacho, o.status, prazoAlertaDias) === "atrasado").length;
    const semPrazo = filteredData.filter(o =>
      !TERMINAL_STATUSES_PEDIDO.includes(o.status) && !o.data_prometida_despacho,
    ).length;
    return { total, totalValue, aguardandoFat, atrasados, semPrazo };
  }, [filteredData, prazoAlertaDias]);

  const activeFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    statusFilters.forEach(f => {
      chips.push({ key: "status",
      mobileCard: true, label: "Status", value: [f], displayValue: getPedidoStatusLabel(f) });
    });
    faturamentoFilters.forEach(f => {
      chips.push({ key: "faturamento", label: "Faturamento", value: [f], displayValue: statusFaturamentoLabels[f] || f });
    });
    clienteFilters.forEach(f => {
      const cli = clientesList.find(x => x.id === f);
      chips.push({ key: "cliente",
      mobilePrimary: true, label: "Cliente", value: [f], displayValue: cli?.nome_razao_social || f });
    });
    prazoFilters.forEach(f => {
      const opt = prazoFilterOptions.find(x => x.value === f);
      chips.push({ key: "prazo", label: "Prazo", value: [f], displayValue: opt?.label || f });
    });
    if (dataInicio) chips.push({ key: "dataInicio", label: "Emissão desde", value: [dataInicio], displayValue: formatDate(dataInicio) });
    if (dataFim) chips.push({ key: "dataFim", label: "Emissão até", value: [dataFim], displayValue: formatDate(dataFim) });
    return chips;
  }, [statusFilters, faturamentoFilters, clienteFilters, prazoFilters, dataInicio, dataFim, clientesList]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "status") setStatusFilters(prev => prev.filter(v => v !== value));
    if (key === "faturamento") setFaturamentoFilters(prev => prev.filter(v => v !== value));
    if (key === "cliente") setClienteFilters(prev => prev.filter(v => v !== value));
    if (key === "prazo") setPrazoFilters(prev => prev.filter(v => v !== value));
    if (key === "dataInicio") setDataInicio("");
    if (key === "dataFim") setDataFim("");
  };

  const statusOptions: MultiSelectOption[] = Object.entries(statusPedido).map(([k, v]) => ({ label: v.label, value: k }));
  const faturamentoOptions: MultiSelectOption[] = Object.entries(statusFaturamentoLabels).map(([k, v]) => ({ label: v, value: k }));
  const clienteOptions: MultiSelectOption[] = clientesList.map(c => ({ label: c.nome_razao_social, value: c.id }));

  const columns = [
    {
      key: "numero",
      mobileCard: true, label: "Nº Pedido", sortable: true,
      render: (p: Pedido) => (
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="font-mono text-xs font-semibold text-primary">{p.numero}</span>
          {(p.orcamentos?.numero || p.po_number) && (
            <span className="text-[11px] text-muted-foreground">
              {p.orcamentos?.numero && p.orcamentos.id && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); pushView("orcamento", p.orcamentos!.id); }}
                  className="font-mono hover:underline hover:text-primary"
                  title="Abrir orçamento de origem"
                >
                  Origem: {p.orcamentos.numero}
                </button>
              )}
              {p.orcamentos?.numero && p.po_number && <span> · </span>}
              {p.po_number && <span className="font-mono">PO {p.po_number}</span>}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "cliente", label: "Cliente",
      sortValue: (p: Pedido) => p.clientes?.nome_razao_social ?? "",
      render: (p: Pedido) => <span className="font-medium text-sm">{p.clientes?.nome_razao_social || "—"}</span>,
    },
    {
      key: "data_emissao", label: "Data Pedido", sortable: true,
      render: (p: Pedido) => <span className="text-xs">{formatDate(p.data_emissao)}</span>,
    },
    {
      key: "prazo", label: "Prazo Despacho",
      sortValue: (p: Pedido) => p.data_prometida_despacho ?? "",
      render: (p: Pedido) => <PrazoBadge dataPrazo={p.data_prometida_despacho} status={p.status} alertaDias={prazoAlertaDias} />,
    },
    {
      key: "status", label: "Status", sortable: true,
      render: (p: Pedido) => (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span><StatusBadge status={p.status} label={getPedidoStatusLabel(p.status)} /></span>
            </TooltipTrigger>
            <TooltipContent>{pedidoTooltipFor(p)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
    {
      key: "faturamento", label: "Faturamento",
      sortValue: (p: Pedido) => p.status_faturamento ?? "",
      render: (p: Pedido) => {
        const sf = p.status_faturamento ?? "";
        if (!sf) return <span className="text-muted-foreground text-xs">—</span>;
        const statusKey = sf === "total" ? "faturado" : sf;
        return (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span><StatusBadge status={statusKey} label={statusFaturamentoLabels[sf] || sf} /></span>
              </TooltipTrigger>
              <TooltipContent>{pedidoTooltipFor(p)}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      key: "valor_total",
      mobileCard: true, label: "Total", sortable: true,
      render: (p: Pedido) => <span className="font-semibold font-mono text-sm">{formatCurrency(Number(p.valor_total || 0))}</span>,
    },
    {
      key: "po_number", label: "PO Cliente", hidden: true,
      render: (p: Pedido) => p.po_number ? <span className="font-mono text-xs">{p.po_number}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "cotacao", label: "Orçamento", hidden: true,
      render: (p: Pedido) => p.orcamentos?.numero ? <span className="font-mono text-xs">{p.orcamentos.numero}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "dias", label: "Dias em Aberto", hidden: true,
      render: (p: Pedido) => {
        const dias = daysSince(p.data_emissao);
        return <span className={`font-mono text-xs ${dias > DIAS_ABERTO_ALERTA ? "text-destructive font-bold" : "text-muted-foreground"}`}>{dias}d</span>;
      },
    },
  ];

  return (
    <><ModulePage
        title="Pedidos"
        subtitle="Pedidos gerados a partir de orçamentos aprovados — acompanhe o ciclo até a emissão da NF"
        headerActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/orcamentos?status=aprovado")}
          >
            Ver orçamentos aprovados
          </Button>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard title="Total de Pedidos" value={formatNumber(kpis.total)} icon={FileText} variationType="neutral" variation="registros" />
          <SummaryCard title="Valor Total" value={formatCurrency(kpis.totalValue)} icon={DollarSign} variationType="neutral" variation="acumulado" />
          <SummaryCard
            title="Aguardando faturamento"
            value={formatNumber(kpis.aguardandoFat)}
            icon={FileOutput}
            variationType="positive"
            variation={kpis.aguardandoFat > 0 ? "prontos para gerar NF" : "nenhum pendente"}
          />
          <SummaryCard
            title="Atrasados"
            value={formatNumber(kpis.atrasados)}
            icon={AlertTriangle}
            variationType={kpis.atrasados > 0 ? "negative" as const : "neutral" as const}
            variation={
              kpis.atrasados === 0 && kpis.semPrazo > 0
                ? `${kpis.semPrazo} sem prazo definido`
                : "fora do prazo de despacho"
            }
          />
        </div>

        <div data-help-id="pedidos.filtros">
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por número, PO, cliente ou orçamento..."
          activeFilters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={() => clearFilters()}
          count={filteredData.length}
        >
          <MultiSelect
            options={statusOptions}
            selected={statusFilters}
            onChange={setStatusFilters}
            placeholder="Status"
            className="w-[180px]"
          />
          <MultiSelect
            options={faturamentoOptions}
            selected={faturamentoFilters}
            onChange={setFaturamentoFilters}
            placeholder="Faturamento"
            className="w-[180px]"
          />
          <MultiSelect
            options={prazoFilterOptions}
            selected={prazoFilters}
            onChange={setPrazoFilters}
            placeholder="Prazo"
            className="w-[180px]"
          />
          <MultiSelect
            options={clienteOptions}
            selected={clienteFilters}
            onChange={setClienteFilters}
            placeholder="Clientes"
            className="w-[200px]"
          />
          <PeriodFilter mode="both" value={periodValue} onChange={handlePeriodChange} direction="past" />
        </AdvancedFilterBar>
        </div>

        <PullToRefresh onRefresh={fetchData}>
        <div data-help-id="pedidos.tabela">
        <DataTable
          columns={columns}
          data={filteredData}
          loading={loading}
          moduleKey="pedidos"
          showColumnToggle={true}
          hideSinglePagePagination
          onView={handleView}
          onEdit={(p) => navigate(`/pedidos/${p.id}`)}
          rowExtraActions={(p) => (
            canFaturarPedido(p) && canFaturar ? (
              <Button
                size="sm"
                variant="default"
                className="h-7 px-2 text-xs gap-1"
                disabled={stockCheckPending || generatingNfId === p.id}
                onClick={(e) => { e.stopPropagation(); handleRequestGenerateNF(p); }}
              >
                <FileOutput className="w-3 h-3" />
                {p.status_faturamento === "parcial" ? "Gerar NF complementar" : "Gerar NF"}
              </Button>
            ) : null
          )}
          mobileStatusKey="status"
          mobileIdentifierKey="numero"
          mobileInlineActions={(p) => (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-10 w-10 p-0"
                onClick={(e) => { e.stopPropagation(); handleView(p); }}
                aria-label="Ver detalhes"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-10 w-10 p-0"
                onClick={(e) => { e.stopPropagation(); navigate(`/pedidos/${p.id}`); }}
                aria-label="Editar"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
          mobilePrimaryAction={(p) => {
            if (!canFaturarPedido(p) || !canFaturar) return null;
            return (
              <Button
                size="lg"
                variant="default"
                className="h-11 w-full gap-2 text-sm"
                disabled={stockCheckPending || generatingNfId === p.id}
                onClick={(e) => { e.stopPropagation(); handleRequestGenerateNF(p); }}
              >
                <FileOutput className="w-4 h-4" />
                {p.status_faturamento === "parcial" ? "Gerar NF complementar" : "Gerar NF"}
              </Button>
            );
          }}
          emptyTitle="Nenhum pedido encontrado"
          emptyDescription="Converta um orçamento aprovado em pedido ou ajuste os filtros aplicados."
        />
        </div>
        </PullToRefresh>
      </ModulePage>

      <ConfirmDialog
        open={!!generatingNfId}
        onClose={() => { setGeneratingNfId(null); setNfChecklist([]); setInsufficientStock([]); }}
        onConfirm={() => {
          const pedido = data.find(o => o.id === generatingNfId);
          if (pedido) handleGenerateNF(pedido);
        }}
        title="Gerar Nota Fiscal"
        description={insufficientStock.length > 0
          ? `O pedido ${data.find(o => o.id === generatingNfId)?.numero || ""} possui itens com estoque insuficiente. A NF pode gerar saldo negativo no estoque. Deseja continuar?`
          : nfChecklist.length > 0
            ? `Antes de gerar a NF do pedido ${data.find(o => o.id === generatingNfId)?.numero || ""}, revise as pendências fiscais abaixo. Você ainda pode prosseguir.`
            : `Deseja gerar uma Nota Fiscal de saída para o Pedido ${data.find(o => o.id === generatingNfId)?.numero || ""}? Todos os itens serão incluídos.`}
        confirmLabel={(insufficientStock.length > 0 || nfChecklist.length > 0) ? "Gerar NF assim mesmo" : "Gerar NF"}
        confirmVariant={(insufficientStock.length > 0 || nfChecklist.length > 0) ? "destructive" : "default"}
      >
        {nfChecklist.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm rounded-md border border-warning/40 bg-warning/5 p-3">
            {nfChecklist.map((it) => (
              <li key={it.code} className="flex items-start gap-2 text-warning-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                <span>{it.label}</span>
              </li>
            ))}
          </ul>
        )}
        {insufficientStock.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {insufficientStock.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-medium">{item.produto}</span> — faltam <span className="font-mono font-semibold">{item.falta}</span> unidades</span>
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
    </>
  );
};

export default Pedidos;
