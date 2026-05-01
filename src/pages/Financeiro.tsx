import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { FormModal } from "@/components/FormModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SummaryCard } from "@/components/SummaryCard";
import { PeriodFilter } from "@/components/filters/PeriodFilter";
import { MonthFilter } from "@/components/filters/MonthFilter";
import { financialPeriods } from "@/components/filters/periodTypes";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import {
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  CalendarClock,
  Download,
  List,
  CalendarDays,
  FileDown,
  CreditCard,
  Eye,
  Pencil,
} from "lucide-react";
import { FinanceiroCalendar } from "@/components/financeiro/FinanceiroCalendar";
import { BaixaParcialDialog } from "@/components/financeiro/BaixaParcialDialog";
import { BaixaLoteModal } from "@/components/financeiro/BaixaLoteModal";
import { FinanceiroDrawer } from "@/components/financeiro/FinanceiroDrawer";
import { getEffectiveStatus, cancelarLancamento } from "@/services/financeiro.service";
import { statusFinanceiro as statusFinanceiroSchema, statusToOptions } from "@/lib/statusSchema";
import type { Lancamento, Cliente, Fornecedor } from "@/types/domain";
import { useFinanceiroAuxiliares } from "@/pages/financeiro/hooks/useFinanceiroAuxiliares";
import { useFinanceiroFiltros } from "@/pages/financeiro/hooks/useFinanceiroFiltros";
import { useFinanceiroKpis } from "@/pages/financeiro/hooks/useFinanceiroKpis";
import { useFinanceiroActions } from "@/pages/financeiro/hooks/useFinanceiroActions";
import { buildFinanceiroColumns } from "@/pages/financeiro/config/financeiroColumns";
import { FinanceiroLancamentoForm } from "@/pages/financeiro/components/FinanceiroLancamentoForm";
import { emptyLancamentoForm, type LancamentoForm } from "@/pages/financeiro/types";

const Financeiro = () => {
  const { id: paramId } = useParams<{ id?: string }>();
  const queryClient = useQueryClient();
  const autoOpenedRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data,
    loading,
    create,
    update,
    remove,
    fetchData,
  } = useSupabaseCrud<Lancamento>({
    table: "financeiro_lancamentos" as const,
    select: "*, clientes(nome_razao_social), fornecedores(nome_razao_social), contas_bancarias(descricao, bancos(nome)), contas_contabeis(descricao, codigo)",
  });

  // Após uma baixa/estorno, o saldo de `contas_bancarias` pode mudar — invalidar caches relacionados.
  const invalidateAfterBaixa = useCallback(() => {
    fetchData();
    queryClient.invalidateQueries({ queryKey: ["contas_bancarias"] });
    queryClient.invalidateQueries({ queryKey: ["ref", "contas_bancarias"] });
  }, [fetchData, queryClient]);

  const clientesCrud = useSupabaseCrud<Cliente>({ table: "clientes" });
  const fornecedoresCrud = useSupabaseCrud<Fornecedor>({ table: "fornecedores" });

  const { contasBancarias, contasContabeis } = useFinanceiroAuxiliares();

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Lancamento | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<LancamentoForm>({ ...emptyLancamentoForm });
  const [viewMode, setViewMode] = useState<"lista" | "calendario">("lista");
  const [baixaLoteOpen, setBaixaLoteOpen] = useState(false);
  const [baixaParcialOpen, setBaixaParcialOpen] = useState(false);
  const [baixaParcialTarget, setBaixaParcialTarget] = useState<Lancamento | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Lancamento | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelProcessing, setCancelProcessing] = useState(false);

  // Atalho do Dashboard: `/financeiro?baixa=lote` abre o modal de baixa em lote.
  const baixaAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (baixaAutoOpenedRef.current) return;
    if (searchParams.get("baixa") !== "lote") return;
    baixaAutoOpenedRef.current = true;
    setBaixaLoteOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("baixa");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const hoje = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const hojeStr = useMemo(() => hoje.toISOString().split("T")[0], [hoje]);

  const getLancamentoStatus = useCallback((l: Lancamento) => getEffectiveStatus(l.status, l.data_vencimento, hoje), [hoje]);

  useEffect(() => {
    if (!paramId || autoOpenedRef.current || loading || data.length === 0) return;
    const found = data.find((l) => l.id === paramId);
    if (found) {
      autoOpenedRef.current = true;
      setSelected(found);
      setDrawerOpen(true);
    }
  }, [paramId, data, loading]);

  const {
    selectedIds,
    setSelectedIds,
    searchTerm,
    setSearchTerm,
    statusFilters,
    setStatusFilters,
    tipoFilters,
    setTipoFilters,
    bancoFilters,
    setBancoFilters,
    origemFilters,
    setOrigemFilters,
    formaPagamentoFilters,
    setFormaPagamentoFilters,
    period,
    setPeriod,
    mes,
    setMes,
    filteredData,
    activeFilters,
    handleRemoveFilter,
    tipoOpts,
    bancoOpts,
    origemOpts,
    formaPagamentoOpts,
  } = useFinanceiroFiltros({ data, contasBancarias, getLancamentoStatus });

  const statusOpts = statusToOptions(statusFinanceiroSchema);

  const {
    saving,
    handleSubmit,
    handleExportar,
    handleEstorno,
    estornoTarget,
    setEstornoTarget,
    estornoProcessing,
    estornoMotivo,
    setEstornoMotivo,
  } = useFinanceiroActions({ filteredData, getLancamentoStatus, create, update, fetchData });

  const kpis = useFinanceiroKpis({ filteredData, getLancamentoStatus, hojeStr });

  const openCreate = () => {
    setMode("create");
    setForm({ ...emptyLancamentoForm });
    setModalOpen(true);
  };

  const openEdit = (l: Lancamento) => {
    setMode("edit");
    setSelected(l);
    setForm({
      tipo: l.tipo,
      descricao: l.descricao,
      valor: l.valor,
      data_vencimento: l.data_vencimento,
      data_pagamento: l.data_pagamento || "",
      status: l.status,
      forma_pagamento: l.forma_pagamento || "",
      banco: l.banco || "",
      cartao: l.cartao || "",
      cliente_id: l.cliente_id || "",
      fornecedor_id: l.fornecedor_id || "",
      conta_bancaria_id: l.conta_bancaria_id || "",
      conta_contabil_id: l.conta_contabil_id || "",
      observacoes: l.observacoes || "",
      gerar_parcelas: false,
      num_parcelas: 2,
      intervalo_dias: 30,
    });
    setModalOpen(true);
  };

  const selectedForBaixa = useMemo(
    () => data.filter((l) => selectedIds.includes(l.id)),
    [data, selectedIds],
  );

  const columns = useMemo(
    () =>
      buildFinanceiroColumns({
        getLancamentoStatus,
        hoje,
        hojeStr,
      }),
    [getLancamentoStatus, hoje, hojeStr],
  );

  return (
    <><ModulePage title="Lançamentos" subtitle="Gestão unificada de contas a pagar e receber" addLabel="Novo Lançamento" onAdd={openCreate} addButtonHelpId="financeiro.novoBtn">
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <PeriodFilter
            value={period}
            onChange={(p) => { setPeriod(p); setMes(null); }}
            options={financialPeriods}
            direction="future"
          />
          <MonthFilter value={mes} onChange={setMes} direction="future" />
          <div className="flex gap-1 ml-auto rounded-lg border p-0.5" data-help-id="financeiro.viewToggle">
            <Button
              size="sm"
              variant={viewMode === "lista" ? "default" : "ghost"}
              className="h-9 sm:h-7 gap-1.5 text-xs min-h-[36px] sm:min-h-0"
              onClick={() => setViewMode("lista")}
            >
              <List className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Lista
            </Button>
            <Button
              size="sm"
              variant={viewMode === "calendario" ? "default" : "ghost"}
              className="h-9 sm:h-7 gap-1.5 text-xs min-h-[36px] sm:min-h-0"
              onClick={() => setViewMode("calendario")}
            >
              <CalendarDays className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Calendário
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-9 sm:h-7 gap-1.5 text-xs min-h-[36px] sm:min-h-0"
            onClick={() => handleExportar("excel")}
          >
            <FileDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Exportar
          </Button>
        </div>

        {/* Mobile: banner "Vence Hoje" tappable acima dos KPIs (filtra para hoje) */}
        {kpis.venceHoje > 0 && (
          <button
            type="button"
            onClick={() => {
              setStatusFilters(["aberto"]);
              setPeriod("hoje");
            }}
            className="md:hidden mb-3 w-full min-h-11 flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-left text-sm transition-colors active:bg-warning/20"
            aria-label={`Filtrar lançamentos que vencem hoje (${kpis.venceHoje})`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Clock className="h-5 w-5 shrink-0 text-warning" />
              <span className="font-medium text-foreground truncate">
                {kpis.venceHoje} {kpis.venceHoje === 1 ? "título vence hoje" : "títulos vencem hoje"}
              </span>
            </span>
            <span className="text-xs text-muted-foreground shrink-0">Ver →</span>
          </button>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6" data-help-id="financeiro.kpis">
          <SummaryCard title="A Vencer" value={kpis.aVencer.toString()} subtitle={formatCurrency(kpis.totalAVencer)} icon={CalendarClock} variant="info" onClick={() => setStatusFilters(["aberto"])} />
          {/* Em mobile, "Vence Hoje" vira banner acima — esconder card duplicado */}
          <SummaryCard title="Vence Hoje" value={kpis.venceHoje.toString()} icon={Clock} variant="warning" className="hidden md:block" />
          <SummaryCard title="Vencidos" value={kpis.vencido.toString()} subtitle={formatCurrency(kpis.totalVencido)} icon={AlertTriangle} variant="danger" onClick={() => setStatusFilters(["vencido"])} />
          <SummaryCard title="Parcialmente Baixados" value={kpis.parcialCount.toString()} subtitle={formatCurrency(kpis.totalParcial)} icon={DollarSign} variant="info" onClick={() => setStatusFilters(["parcial"])} />
          <SummaryCard title="Pagos" value={kpis.pagoNoPeriodo.toString()} subtitle={formatCurrency(kpis.totalPago)} icon={CheckCircle} variant="success" onClick={() => setStatusFilters(["pago"])} />
        </div>

        <div data-help-id="financeiro.filtros">
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por descrição, pessoa, banco ou forma de pagamento..."
          activeFilters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={() => {
            setTipoFilters([]);
            setStatusFilters([]);
            setBancoFilters([]);
            setOrigemFilters([]);
            setFormaPagamentoFilters([]);
          }}
          count={filteredData.length}
          extra={selectedIds.length > 0 ? (
            <Button size="sm" variant="default" className="gap-2" onClick={() => {
              if (selectedIds.length === 0) {
                toast.error("Selecione os lançamentos");
                return;
              }
              setBaixaLoteOpen(true);
            }}>
              <Download className="w-3.5 h-3.5" /> Baixar {selectedIds.length} selecionado(s)
            </Button>
          ) : undefined}
        >
          <MultiSelect options={tipoOpts} selected={tipoFilters} onChange={setTipoFilters} placeholder="Tipo" className="w-[150px]" />
          <MultiSelect options={statusOpts} selected={statusFilters} onChange={setStatusFilters} placeholder="Status" className="w-[180px]" />
          <MultiSelect options={bancoOpts} selected={bancoFilters} onChange={setBancoFilters} placeholder="Bancos" className="w-[200px]" />
          <MultiSelect options={origemOpts} selected={origemFilters} onChange={setOrigemFilters} placeholder="Origem" className="w-[200px]" />
          <MultiSelect options={formaPagamentoOpts} selected={formaPagamentoFilters} onChange={setFormaPagamentoFilters} placeholder="Forma de pagamento" className="w-[220px]" />
        </AdvancedFilterBar>
        </div>

        {viewMode === "calendario" ? (
          <FinanceiroCalendar data={filteredData} onBaixaSuccess={invalidateAfterBaixa} />
        ) : (
          <PullToRefresh onRefresh={fetchData}>
            <div data-help-id="financeiro.tabela">
            <DataTable
              columns={columns}
              data={filteredData}
              loading={loading}
              moduleKey="financeiro-lancamentos"
              showColumnToggle={true}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              emptyTitle="Nenhum lançamento encontrado"
              emptyDescription="Tente ajustar os filtros ou crie um novo lançamento."
              onView={(l) => {
                setSelected(l);
                setDrawerOpen(true);
              }}
              rowExtraActions={(l) => {
                const es = getLancamentoStatus(l);
                if (es === "pago" || es === "cancelado") return null;
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5 whitespace-nowrap"
                    aria-label={`Baixar lançamento: ${l.descricao}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBaixaParcialTarget(l);
                      setBaixaParcialOpen(true);
                    }}
                  >
                    <CreditCard className="h-3 w-3" /> Baixar
                  </Button>
                );
              }}
              mobileStatusKey="status"
              mobileIdentifierKey="descricao"
              mobilePrimaryAction={(l) => {
                const es = getLancamentoStatus(l);
                if (es === "pago" || es === "cancelado") return null;
                return (
                  <Button
                    size="sm"
                    className="w-full h-11 gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBaixaParcialTarget(l);
                      setBaixaParcialOpen(true);
                    }}
                  >
                    <CreditCard className="h-4 w-4" /> Baixar
                  </Button>
                );
              }}
              mobileInlineActions={(l) => (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(l);
                      setDrawerOpen(true);
                    }}
                    aria-label="Ver detalhes"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(l);
                    }}
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            />
            </div>
          </PullToRefresh>
        )}
      </ModulePage>

      <FormModal open={modalOpen} onClose={() => setModalOpen(false)} title={mode === "create" ? "Novo Lançamento" : "Editar Lançamento"} size="lg">
        <FinanceiroLancamentoForm
          form={form}
          mode={mode}
          saving={saving}
          contasBancarias={contasBancarias}
          contasContabeis={contasContabeis}
          clientes={clientesCrud.data}
          fornecedores={fornecedoresCrud.data}
          setForm={setForm}
          onCancel={() => setModalOpen(false)}
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(mode, form, selected, () => setModalOpen(false));
          }}
        />
      </FormModal>

      <FinanceiroDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selected={selected}
        effectiveStatus={selected ? getLancamentoStatus(selected) : ""}
        onBaixa={(l) => {
          setBaixaParcialTarget(l);
          setBaixaParcialOpen(true);
        }}
        onEstorno={(l) => {
          setDrawerOpen(false);
          setEstornoTarget(l);
        }}
        onEdit={(l) => {
          setDrawerOpen(false);
          openEdit(l);
        }}
        onDelete={(id) => {
          const target = data.find((l) => l.id === id) ?? selected;
          setDrawerOpen(false);
          if (target) {
            setCancelTarget(target);
            setCancelMotivo("");
          }
        }}
      />

      <BaixaLoteModal
        open={baixaLoteOpen}
        onClose={() => setBaixaLoteOpen(false)}
        selectedLancamentos={selectedForBaixa}
        contasBancarias={contasBancarias}
        onSuccess={() => {
          setSelectedIds([]);
          invalidateAfterBaixa();
        }}
      />

      <ConfirmDialog
        open={!!estornoTarget}
        onClose={() => {
          setEstornoTarget(null);
          setEstornoMotivo("");
        }}
        onConfirm={handleEstorno}
        title="Confirmar Estorno"
        description={`Deseja estornar a baixa do lançamento "${estornoTarget?.descricao}"? O status voltará para Aberto.`}
        confirmLabel="Estornar"
        loading={estornoProcessing}
        confirmDisabled={!estornoMotivo.trim()}
      >
        <div className="space-y-2 mt-2">
          <Label className="text-sm font-medium">Motivo do estorno *</Label>
          <Textarea value={estornoMotivo} onChange={(e) => setEstornoMotivo(e.target.value)} placeholder="Informe o motivo do cancelamento da baixa..." rows={3} />
        </div>
      </ConfirmDialog>

      <BaixaParcialDialog
        open={baixaParcialOpen}
        onClose={() => setBaixaParcialOpen(false)}
        lancamento={baixaParcialTarget}
        contasBancarias={contasBancarias}
        onSuccess={() => {
          invalidateAfterBaixa();
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => {
          setCancelTarget(null);
          setCancelMotivo("");
        }}
        onConfirm={async () => {
          if (!cancelTarget) return;
          setCancelProcessing(true);
          const ok = await cancelarLancamento(cancelTarget.id, cancelMotivo.trim());
          setCancelProcessing(false);
          if (ok) {
            setCancelTarget(null);
            setCancelMotivo("");
            await fetchData();
          }
        }}
        title="Cancelar Lançamento"
        description={`Deseja cancelar "${cancelTarget?.descricao}"? O título permanecerá no histórico com status Cancelado.`}
        confirmLabel="Cancelar Lançamento"
        loading={cancelProcessing}
        confirmDisabled={cancelMotivo.trim().length < 5}
      >
        <div className="space-y-2 mt-2">
          <Label className="text-sm font-medium">Motivo do cancelamento *</Label>
          <Textarea
            value={cancelMotivo}
            onChange={(e) => setCancelMotivo(e.target.value)}
            placeholder="Mínimo de 5 caracteres. Ex.: duplicidade, divergência com NF, solicitação do cliente..."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            A exclusão definitiva não é permitida quando há baixas ou origem fora de “manual”. Use o cancelamento para preservar a trilha de auditoria.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
};

export default Financeiro;
