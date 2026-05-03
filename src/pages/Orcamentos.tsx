
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCard } from "@/components/SummaryCard";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { Badge } from "@/components/ui/badge";
import { ArrowRightCircle, CheckCircle, FileText, DollarSign, Clock, BarChart3, AlertTriangle, Eye, Pencil } from "lucide-react";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { PeriodFilter, type PeriodValue } from "@/components/filters/PeriodFilter";
import { periodToDateFrom, periodToDateTo } from "@/lib/periodFilter";
import type { Period } from "@/components/filters/periodTypes";
import { toast } from "sonner";
import { formatCurrency, formatDate, calculateDaysBetween } from "@/lib/format";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useCan } from "@/hooks/useCan";
import { Send } from "lucide-react";
import { sendForApproval, approveOrcamento, duplicateOrcamento } from "@/services/orcamentos.service";
import { useConverterOrcamento } from "@/pages/comercial/hooks/useConverterOrcamento";
import { useCrossModuleToast } from "@/hooks/useCrossModuleToast";
import { CrossModuleActionDialog, type ImpactItem } from "@/components/CrossModuleActionDialog";
import { statusOrcamento } from "@/lib/statusSchema";
import { canApproveOrcamento, canConvertOrcamento, canSendOrcamento, getOrcamentoStatusLabel, normalizeOrcamentoStatus } from "@/lib/comercialWorkflow";
import { notifyError } from "@/utils/errorMessages";
import { useClientesRef } from "@/hooks/useReferenceCache";
import { useActionLock } from "@/hooks/useActionLock";
import { useUrlListState } from "@/hooks/useUrlListState";
import { subscribeComercial } from "@/lib/realtime/comercialChannel";
import { INVALIDATION_KEYS } from "@/services/_invalidationKeys";
import { logger } from "@/lib/logger";

interface Orcamento {
  id: string;
  numero: string;
  cliente_id: string | null;
  data_orcamento: string | null;
  validade: string | null;
  valor_total: number | null;
  observacoes: string | null;
  status: string;
  origem?: string | null;
  quantidade_total: number | null;
  peso_total: number | null;
  pagamento: string | null;
  prazo_pagamento: string | null;
  prazo_entrega: string | null;
  ativo: boolean;
  // Additional fields present in DB
  frete_valor?: number | null;
  frete_tipo?: string | null;
  modalidade?: string | null;
  cliente_snapshot?: unknown;
  clientes?: { nome_razao_social: string } | null;
}

const TERMINAL_STATUSES = ["convertido", "cancelado", "rejeitado", "expirado"];
const PROXIMA_VENCER_DIAS = 7;

const historicoOptions: { label: string; value: string }[] = [
  { label: "Excluir históricos", value: "excluir" },
  { label: "Apenas históricos", value: "apenas" },
  { label: "Todos", value: "todos" },
];

const validadeOptions: { label: string; value: string }[] = [
  { label: "Vencidas", value: "vencida" },
  { label: `Próximas a vencer (≤${PROXIMA_VENCER_DIAS}d)`, value: "proxima" },
  { label: "Vigentes", value: "vigente" },
];

function getValidadeStatus(validade: string | null, status: string): "vencida" | "proxima" | "vigente" | "sem_validade" {
  if (!validade) return "sem_validade";
  if (TERMINAL_STATUSES.includes(status)) return "vigente";
  const daysLeft = calculateDaysBetween(new Date(), validade);
  if (daysLeft < 0) return "vencida";
  if (daysLeft <= PROXIMA_VENCER_DIAS) return "proxima";
  return "vigente";
}

function ValidadeBadge({ validade, status }: { validade: string | null; status: string }) {
  if (!validade) return <span className="text-muted-foreground">—</span>;
  const vs = getValidadeStatus(validade, status);
  const daysLeft = calculateDaysBetween(new Date(), validade);
  if (vs === "vencida") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="text-xs text-destructive font-medium">{formatDate(validade)}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-destructive/10 text-destructive border-destructive/20 gap-1">
          <AlertTriangle className="h-2.5 w-2.5" />Vencida
        </Badge>
      </span>
    );
  }
  if (vs === "proxima") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="text-xs text-warning font-medium">{formatDate(validade)}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-warning/10 text-warning border-warning/30 gap-1">
          <Clock className="h-2.5 w-2.5" />{daysLeft}d restantes
        </Badge>
      </span>
    );
  }
  return <span className="text-xs">{formatDate(validade)}</span>;
}

const statusLabels: Record<string, string> = Object.fromEntries(
  Object.entries(statusOrcamento).map(([k, v]) => [k, v.label])
);

const Orcamentos = () => {
  const navigate = useNavigate();
  const { pushView } = useRelationalNavigation();
  const { data: rawData, loading, fetchData } = useSupabaseCrud({ table: "orcamentos", select: "*, clientes(nome_razao_social)" });
  const data = rawData as unknown as Orcamento[];
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [poNumberCliente, setPoNumberCliente] = useState("");
  const [dataPoCliente, setDataPoCliente] = useState("");
  const qc = useQueryClient();

  // Realtime: invalida grid quando orçamentos mudam (aprovação/conversão em
  // outras abas, RPCs ou triggers) — mantém a lista sincronizada sem refresh.
  useEffect(() => {
    return subscribeComercial(() => {
      INVALIDATION_KEYS.conversaoOrcamento.forEach((key) => {
        qc.invalidateQueries({ queryKey: [key] });
      });
      fetchData();
    });
  }, [qc, fetchData]);

  // Querystring CSV unificada com Pedidos/Financeiro (compatível com `buildDrilldownUrl`).
  const { value: filterState, set: setFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      status: { type: "stringArray" },
      cliente: { type: "stringArray" },
      validade: { type: "stringArray" },
      de: { type: "string" },
      ate: { type: "string" },
      historico: { type: "string" },
    },
  });
  const searchTerm = filterState.q;
  const statusFilters = filterState.status;
  const clienteFilters = filterState.cliente;
  const validadeFilters = filterState.validade;
  const dataInicio = filterState.de;
  const dataFim = filterState.ate;
  const historicoFilter = filterState.historico || "todos";

  const setSearchTerm = (v: string) => setFilters({ q: v });
  const setStatusFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(statusFilters) : fn;
    setFilters({ status: next });
  };
  const setClienteFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(clienteFilters) : fn;
    setFilters({ cliente: next });
  };
  const setValidadeFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(validadeFilters) : fn;
    setFilters({ validade: next });
  };
  const setDataInicio = (v: string) => setFilters({ de: v });
  const setDataFim = (v: string) => setFilters({ ate: v });

  const periodValue: PeriodValue = { preset: null, from: dataInicio || null, to: dataFim || null };
  const handlePeriodChange = (next: PeriodValue) => {
    if (next.preset) {
      const from = periodToDateFrom(next.preset as Period);
      const to = periodToDateTo(next.preset as Period) ?? new Date().toISOString().slice(0, 10);
      setFilters({ de: from, ate: to });
      return;
    }
    setFilters({ de: next.from || "", ate: next.to || "" });
  };
  const setHistoricoFilter = (v: string) => setFilters({ historico: v === "todos" ? "" : v });
  const { data: clientesList = [] } = useClientesRef();
  const { isAdmin } = useIsAdmin();
  const { can } = useCan();
  const canAprovar = can("orcamentos:aprovar") || isAdmin;
  const sendLock = useActionLock();
  const approveLock = useActionLock();
  const convertLock = useActionLock();
  const converterOrcamento = useConverterOrcamento();
  const crossToast = useCrossModuleToast();

  const handleSendForApproval = useCallback(async (orc: Orcamento) => {
    await sendLock.run(async () => {
      try {
        await sendForApproval(orc);
        fetchData();
      } catch (err: unknown) {
        notifyError(err);
      }
    });
  }, [fetchData, sendLock]);

  const handleDuplicate = async (orc: Orcamento) => {
    try {
      const created = await duplicateOrcamento(orc);
      toast.success(`Orçamento duplicado: ${created.numero}`);
      fetchData();
      navigate(`/orcamentos/${created.id}`);
    } catch (err: unknown) {
      logger.error('[orcamentos] duplicar:', err);
      notifyError(err);
    }
  };

  const handleApprove = async (orc: Orcamento) => {
    if (!canAprovar) {
      toast.error("Você não tem permissão para aprovar orçamentos.");
      return;
    }
    await approveLock.run(async () => {
      try {
        await approveOrcamento(orc);
        fetchData();
      } catch (err: unknown) {
        notifyError(err);
      }
    });
  };

  const handleConvertToPedido = async (orc: Orcamento) => {
    await convertLock.run(async () => {
      try {
        // RPC transacional + invalidação cross-módulo (orcamentos + ordens_venda + pedidos).
        const result = await converterOrcamento.mutateAsync({
          orcamento: orc,
          options: { poNumber: poNumberCliente, dataPo: dataPoCliente },
        });
        setPoNumberCliente("");
        setDataPoCliente("");
        fetchData();
        // Aviso quando o orçamento sai do filtro atual após conversão.
        const filtroEscondeConvertido =
          statusFilters.length > 0 && !statusFilters.includes("convertido");
        if (filtroEscondeConvertido) {
          toast.info(
            `Orçamento ${orc.numero} agora está como "convertido" e saiu do filtro atual.`,
            { duration: 5000 }
          );
        }
        // Toast com CTA: abre o pedido criado em drawer (sem sair da grid de cotações).
        crossToast.success({
          title: "Pedido gerado!",
          description: `OV ${result.ovNumero} criada a partir do orçamento ${orc.numero}.`,
          actionLabel: "Abrir pedido",
          action: { drawer: { type: "ordem_venda", id: result.ovId } },
        });
      } catch {
        // toast já emitido pelo hook
      } finally {
        setConvertingId(null);
      }
    });
  };


  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return data.filter((orc) => {
      const isHistorico = orc.origem === "importacao_historica" || orc.status === "historico";
      if (historicoFilter === "excluir" && isHistorico) return false;
      if (historicoFilter === "apenas" && !isHistorico) return false;
      const normalizedStatus = normalizeOrcamentoStatus(orc.status);
      if (statusFilters.length > 0 && !statusFilters.includes(normalizedStatus)) return false;
      if (clienteFilters.length > 0 && !clienteFilters.includes(orc.cliente_id || "")) return false;

      if (validadeFilters.length > 0) {
        const vs = getValidadeStatus(orc.validade, orc.status);
        if (!validadeFilters.includes(vs)) return false;
      }

      if (dataInicio) {
        const emissao = orc.data_orcamento;
        if (!emissao || emissao < dataInicio) return false;
      }
      if (dataFim) {
        const emissao = orc.data_orcamento;
        if (!emissao || emissao > dataFim) return false;
      }

      if (!query) return true;
      return [orc.numero, orc.clientes?.nome_razao_social, orc.observacoes].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [data, searchTerm, statusFilters, clienteFilters, validadeFilters, dataInicio, dataFim, historicoFilter]);

  const kpis = useMemo(() => {
    const total = filteredData.length;
    const totalValue = filteredData.reduce((s, o) => s + Number(o.valor_total || 0), 0);
    const approved = filteredData.filter(o => o.status === "aprovado").length;
    const converted = filteredData.filter(o => o.status === "convertido").length;
    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : "0";
    return { total, totalValue, approved, conversionRate };
  }, [filteredData]);

  const columns = [
    {
      key: "numero",
      mobileCard: true, label: "Nº Orçamento", sortable: true,
      render: (o: Orcamento) => <span className="font-mono text-xs font-semibold text-primary">{o.numero}</span>,
    },
    {
      key: "cliente",
      mobilePrimary: true, label: "Cliente",
      render: (o: Orcamento) => (
        <span className="font-medium text-sm">{o.clientes?.nome_razao_social || "—"}</span>
      ),
    },
    {
      key: "data_orcamento", label: "Emissão", sortable: true,
      render: (o: Orcamento) => <span className="text-xs">{formatDate(o.data_orcamento)}</span>,
    },
    {
      key: "validade", label: "Validade",
      render: (o: Orcamento) => <ValidadeBadge validade={o.validade} status={o.status} />,
    },
    {
      key: "valor_total",
      mobileCard: true, label: "Total", sortable: true,
      render: (o: Orcamento) => <span className="font-semibold font-mono text-sm">{formatCurrency(Number(o.valor_total || 0))}</span>,
    },
    {
      key: "status",
      mobileCard: true, label: "Status", sortable: true,
      render: (o: Orcamento) => {
        const vs = getValidadeStatus(o.validade, o.status);
        const normalizedStatus = normalizeOrcamentoStatus(o.status);
        const effectiveStatus = vs === "vencida" && normalizedStatus === "enviado" ? "expirado" : normalizedStatus;
        return <StatusBadge status={effectiveStatus} label={statusLabels[effectiveStatus] ?? getOrcamentoStatusLabel(o.status)} />;
      },
    },
    {
      key: "pagamento", label: "Pagamento", hidden: true,
      render: (o: Orcamento) => {
        const parts = [o.pagamento, o.prazo_pagamento].filter(Boolean);
        return <span className="text-xs text-muted-foreground">{parts.length > 0 ? parts.join(" · ") : "—"}</span>;
      },
    },
    {
      key: "prazo_entrega", label: "Prazo Entrega", hidden: true,
      render: (o: Orcamento) => <span className="text-xs text-muted-foreground">{o.prazo_entrega || "—"}</span>,
    },
    {
      key: "peso_total", label: "Peso Total", hidden: true,
      render: (o: Orcamento) => <span className="text-xs text-muted-foreground">{o.peso_total ? `${o.peso_total} kg` : "—"}</span>,
    },
  ];

  const convertingOrc = data.find(o => o.id === convertingId);

  const orcActiveFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    statusFilters.forEach(f => {
      chips.push({ key: "status", label: "Status", value: [f], displayValue: statusLabels[f] || f });
    });
    clienteFilters.forEach(f => {
      const cli = clientesList.find(x => x.id === f);
      chips.push({ key: "cliente", label: "Cliente", value: [f], displayValue: cli?.nome_razao_social || f });
    });
    validadeFilters.forEach(f => {
      const opt = validadeOptions.find(x => x.value === f);
      chips.push({ key: "validade", label: "Validade", value: [f], displayValue: opt?.label || f });
    });
    if (dataInicio) chips.push({ key: "dataInicio", label: "Emissão desde", value: [dataInicio], displayValue: formatDate(dataInicio) });
    if (dataFim) chips.push({ key: "dataFim", label: "Emissão até", value: [dataFim], displayValue: formatDate(dataFim) });
    return chips;
  }, [statusFilters, clienteFilters, validadeFilters, dataInicio, dataFim, clientesList]);

  const handleRemoveOrcFilter = (key: string, value?: string) => {
    if (key === "status") setStatusFilters(prev => prev.filter(v => v !== value));
    if (key === "cliente") setClienteFilters(prev => prev.filter(v => v !== value));
    if (key === "validade") setValidadeFilters(prev => prev.filter(v => v !== value));
    if (key === "dataInicio") setDataInicio("");
    if (key === "dataFim") setDataFim("");
  };

  const statusOptions: MultiSelectOption[] = Object.entries(statusLabels).map(([k, v]) => ({
    label: v, value: k
  }));

  const clienteOptions: MultiSelectOption[] = clientesList.map(c => ({
    label: c.nome_razao_social, value: c.id
  }));

  return (
    <><ModulePage
        title="Orçamentos"
        subtitle="Central de consulta e acompanhamento do funil comercial"
        addLabel="Novo Orçamento"
        onAdd={() => navigate("/orcamentos/novo")}
        addButtonHelpId="orcamentos.novoBtn"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard title="Total de Orçamentos" value={String(kpis.total)} icon={FileText} variationType="neutral" variation="registros" />
          <SummaryCard title="Valor Total" value={formatCurrency(kpis.totalValue)} icon={DollarSign} variationType="neutral" variation="acumulado" />
          <SummaryCard title="Aprovadas" value={String(kpis.approved)} icon={CheckCircle} variationType="positive" variation="aguardando geração de pedido" />
          <SummaryCard title="Taxa de Conversão" value={`${kpis.conversionRate}%`} icon={BarChart3} variationType="positive" variation="orçamentos → Pedido" />
        </div>

        <div data-help-id="orcamentos.filtros">
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por número do orçamento ou cliente..."
          activeFilters={orcActiveFilters}
          onRemoveFilter={handleRemoveOrcFilter}
          onClearAll={() => { setStatusFilters([]); setClienteFilters([]); setValidadeFilters([]); setDataInicio(""); setDataFim(""); setSearchTerm(""); }}
          count={filteredData.length}
        >
          <MultiSelect
            options={statusOptions}
            selected={statusFilters}
            onChange={setStatusFilters}
            placeholder="Status"
            className="w-[200px]"
          />
          <MultiSelect
            options={validadeOptions}
            selected={validadeFilters}
            onChange={setValidadeFilters}
            placeholder="Validade"
            className="w-[200px]"
          />
          <select
            value={historicoFilter}
            onChange={(e) => setHistoricoFilter(e.target.value)}
            className="h-9 px-3 text-xs rounded-md border border-input bg-background"
            title="Filtro de orçamentos históricos importados"
          >
            {historicoOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <MultiSelect
            options={clienteOptions}
            selected={clienteFilters}
            onChange={setClienteFilters}
            placeholder="Clientes"
            className="w-[250px]"
          />
          <PeriodFilter mode="both" value={periodValue} onChange={handlePeriodChange} direction="past" />
        </AdvancedFilterBar>
        </div>

        <PullToRefresh onRefresh={fetchData}>
          <div data-help-id="orcamentos.tabela">
          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            moduleKey="cotacoes"
            showColumnToggle={true}
            onView={(o) => pushView("orcamento", o.id)}
            onEdit={(o) => navigate(`/orcamentos/${o.id}`)}
            rowExtraActions={(o: Orcamento) => (
              <>
                {canSendOrcamento(o.status) && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={sendLock.pending} onClick={(e) => { e.stopPropagation(); handleSendForApproval(o); }}>
                    <Send className="w-3 h-3" /> Enviar
                  </Button>
                )}
                {canApproveOrcamento(o.status) && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleApprove(o); }} disabled={!canAprovar || approveLock.pending} title={!canAprovar ? "Você não tem permissão para aprovar" : ""}>
                    <CheckCircle className="w-3 h-3" /> Aprovar
                  </Button>
                )}
                {canConvertOrcamento(o.status) && (
                  <Button size="sm" variant="default" className="h-7 px-2 text-xs gap-1" disabled={convertLock.pending} onClick={(e) => {
                    e.stopPropagation();
                    setPoNumberCliente("");
                    setDataPoCliente("");
                    setConvertingId(o.id);
                  }}>
                    <ArrowRightCircle className="w-3 h-3" /> Converter em Pedido
                  </Button>
                )}
              </>
            )}
            mobileStatusKey="status"
            mobileIdentifierKey="numero"
            mobileInlineActions={(o) => (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 w-10 p-0"
                  onClick={(e) => { e.stopPropagation(); pushView("orcamento", o.id); }}
                  aria-label="Ver detalhes"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 w-10 p-0"
                  onClick={(e) => { e.stopPropagation(); navigate(`/orcamentos/${o.id}`); }}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
            mobilePrimaryAction={(o) => {
              if (canConvertOrcamento(o.status)) {
                return (
                  <Button
                    size="lg"
                    variant="default"
                    className="h-11 w-full gap-2 text-sm"
                    disabled={convertLock.pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPoNumberCliente("");
                      setDataPoCliente("");
                      setConvertingId(o.id);
                    }}
                  >
                    <ArrowRightCircle className="w-4 h-4" /> Converter em Pedido
                  </Button>
                );
              }
              if (canApproveOrcamento(o.status)) {
                return (
                  <Button
                    size="lg"
                    variant="default"
                    className="h-11 w-full gap-2 text-sm"
                    disabled={!canAprovar || approveLock.pending}
                    title={!canAprovar ? "Você não tem permissão para aprovar" : ""}
                    onClick={(e) => { e.stopPropagation(); handleApprove(o); }}
                  >
                    <CheckCircle className="w-4 h-4" /> Aprovar
                  </Button>
                );
              }
              if (canSendOrcamento(o.status)) {
                return (
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-11 w-full gap-2 text-sm"
                    disabled={sendLock.pending}
                    onClick={(e) => { e.stopPropagation(); handleSendForApproval(o); }}
                  >
                    <Send className="w-4 h-4" /> Enviar para aprovação
                  </Button>
                );
              }
              return null;
            }}
            emptyTitle="Nenhum orçamento encontrado"
            emptyDescription="Crie um novo orçamento ou ajuste os filtros aplicados."
          />
          </div>
        </PullToRefresh>
      </ModulePage>

      <CrossModuleActionDialog
        open={!!convertingId}
        onClose={() => {
          setConvertingId(null);
          setPoNumberCliente("");
          setDataPoCliente("");
        }}
        onConfirm={() => convertingOrc && handleConvertToPedido(convertingOrc)}
        title="Converter em Pedido de Venda"
        description={`Confirma a conversão do orçamento ${convertingOrc?.numero} em Pedido de Venda? Nenhuma Nota Fiscal será emitida nesta etapa.`}
        confirmLabel="Converter em Pedido"
        loading={convertLock.pending}
        impacts={[
          {
            label: "Cria 1 Pedido de Venda em /pedidos (sem emitir NF)",
            detail: convertingOrc ? formatCurrency(Number(convertingOrc.valor_total || 0)) : undefined,
            tone: "primary",
          },
          { label: "Orçamento muda para “convertido”", tone: "info" },
          { label: "Pedido fica disponível para faturamento", tone: "success" },
        ] satisfies ImpactItem[]}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Nº Pedido do Cliente (PO)</Label>
            <Input
              value={poNumberCliente}
              onChange={(e) => setPoNumberCliente(e.target.value)}
              placeholder="Ex: PO-2026-00123"
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">Número do pedido de compra emitido pelo cliente.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Data do Pedido do Cliente</Label>
            <Input
              type="date"
              value={dataPoCliente}
              onChange={(e) => setDataPoCliente(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </CrossModuleActionDialog>
    </>
  );
};

export default Orcamentos;
