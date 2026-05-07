import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ModulePage } from "@/components/ModulePage";
import { SummaryCard } from "@/components/SummaryCard";
import { CheckCircle2, Clock, ShoppingCart } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { usePedidosCompra } from "@/hooks/usePedidosCompra";
import {
  usePedidoCompraFilters,
} from "@/components/compras/usePedidoCompraFilters";
import { PedidoCompraFilters } from "@/components/compras/PedidoCompraFilters";
import { PedidoCompraTable } from "@/components/compras/PedidoCompraTable";
import { PedidoCompraFormModal } from "@/components/compras/PedidoCompraFormModal";
import { PedidoCompraDrawer } from "@/components/compras/PedidoCompraDrawer";
import { RegistrarRecebimentoDialog } from "@/components/compras/RegistrarRecebimentoDialog";
import { pedidoNumero } from "@/components/compras/pedidoCompraTypes";
import { type MultiSelectOption } from "@/components/ui/MultiSelect";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useCan } from "@/hooks/useCan";
import { pedidoStatusLabelMap } from "@/components/compras/comprasStatus";
import { useComprasRealtime } from "@/hooks/useComprasRealtime";

const statusLabels: Record<string, string> = pedidoStatusLabelMap;

export default function PedidosCompra() {
  const ctx = usePedidosCompra();
  const { isAdmin } = useIsAdmin();
  const { can } = useCan();
  const [recebDialog, setRecebDialog] = useState<{ id: string; numero: string } | null>(null);
  // Aprovar/Cancelar/Rejeitar pedido de compra requer permissão explícita; admin
  // mantém acesso total. Mantemos a prop `isAdmin` no Drawer para evitar refactor
  // amplo — semântica passa a ser "pode operar" (admin OU permissão).
  const canOperate = isAdmin || can("compras:aprovar") || can("compras:cancelar");

  // Realtime: invalida React Query quando outro usuário/aba altera registros.
  useComprasRealtime();

  const filters = usePedidoCompraFilters(ctx.pedidos, ctx.fornecedoresAtivos, statusLabels);

  // Drill-down from Dashboard: ?atrasadas=1 → narrows to pedidos that are still
  // awaiting receipt (the closest semantic match — "atrasado" is not a real
  // status, just a temporal interpretation).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("atrasadas") === "1") {
      filters.setRecebimentoFilters((prev) => (prev.includes("aguardando") ? prev : ["aguardando", "parcial"]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drill-down one-shot via ?atrasadas=1; filters.setRecebimentoFilters é setter estável
  }, [searchParams]);

  // Atalho rápido: /pedidos-compra?new=1 abre o formulário de criação.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      ctx.openCreate();
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot por mount; openCreate estável.
  }, []);

  const statusOptions = useMemo<MultiSelectOption[]>(
    () => Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v })),
    [],
  );

  const fornecedorOptions2 = useMemo<MultiSelectOption[]>(
    () => ctx.fornecedoresAtivos.map((f) => ({ value: String(f.id), label: f.nome_razao_social ?? "" })),
    [ctx.fornecedoresAtivos],
  );

  return (
    <><ModulePage
        title="Pedidos de Compra"
        subtitle="Central de consulta e acompanhamento operacional de pedidos de compra"
        addLabel="Novo Pedido"
        onAdd={ctx.openCreate}
        count={filters.filteredData.length}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            title="Total"
            value={formatNumber(ctx.kpis.total)}
            icon={ShoppingCart}
            variationType="neutral"
            variation="pedidos"
          />
          <SummaryCard
            title="Valor Total"
            value={formatCurrency(ctx.kpis.totalValue)}
            icon={ShoppingCart}
            variationType="neutral"
            variation="acumulado"
          />
          <SummaryCard
            title="Aguardando"
            value={formatNumber(ctx.kpis.aguardando)}
            icon={Clock}
            variationType={ctx.kpis.aguardando > 0 ? "negative" : "positive"}
            variant={ctx.kpis.aguardando > 0 ? "warning" : undefined}
            variation="em andamento"
          />
          <SummaryCard
            title="Recebidos"
            value={formatNumber(ctx.kpis.recebidos)}
            icon={CheckCircle2}
            variationType="positive"
            variation="concluídos"
          />
        </div>

        <PedidoCompraFilters
          searchTerm={filters.searchTerm}
          onSearchChange={filters.setSearchTerm}
          activeFilters={filters.activeFilters}
          onRemoveFilter={filters.handleRemoveFilter}
          onClearAll={filters.handleClearAllFilters}
          count={filters.filteredData.length}
          statusFilters={filters.statusFilters}
          onStatusFiltersChange={filters.setStatusFilters}
          recebimentoFilters={filters.recebimentoFilters}
          onRecebimentoFiltersChange={filters.setRecebimentoFilters}
          fornecedorFilters={filters.fornecedorFilters}
          onFornecedorFiltersChange={filters.setFornecedorFilters}
          dataInicio={filters.dataInicio}
          onDataInicioChange={filters.setDataInicio}
          dataFim={filters.dataFim}
          onDataFimChange={filters.setDataFim}
          statusOptions={statusOptions}
          fornecedorOptions2={fornecedorOptions2}
        />

        <PedidoCompraTable
          data={filters.filteredData}
          loading={ctx.loading}
          statusLabels={statusLabels}
          onView={ctx.openView}
          onEdit={ctx.openEdit}
          onSend={ctx.marcarEnviado}
          onReceive={(p) => setRecebDialog({ id: String(p.id), numero: pedidoNumero(p) })}
        />
      </ModulePage>

      <PedidoCompraFormModal
        open={ctx.modalOpen}
        onClose={() => ctx.setModalOpen(false)}
        mode={ctx.mode}
        selected={ctx.selected}
        form={ctx.form}
        setForm={ctx.setForm}
        items={ctx.items}
        setItems={ctx.setItems}
        saving={ctx.saving}
        fornecedorOptions={ctx.fornecedorOptions}
        produtosOptionsData={ctx.produtosOptionsData}
        formasPagamento={ctx.formasPagamento}
        fornecedoresLoading={ctx.fornecedoresLoading}
        produtosLoading={ctx.produtosLoading}
        viewEstoque={ctx.viewEstoque}
        viewCotacao={ctx.viewCotacao}
        statusLabels={statusLabels}
        onSubmit={ctx.handleSubmit}
      />

      {ctx.selected && (
        <PedidoCompraDrawer
          open={ctx.drawerOpen}
          onClose={() => ctx.setDrawerOpen(false)}
          selected={ctx.selected}
          viewItems={ctx.viewItems}
          viewEstoque={ctx.viewEstoque}
          viewFinanceiro={ctx.viewFinanceiro}
          viewCotacao={ctx.viewCotacao}
          onEdit={() => { ctx.setDrawerOpen(false); ctx.openEdit(ctx.selected!); }}
          onDelete={async () => { ctx.setDrawerOpen(false); await ctx.deleteSelected(); }}
          onSend={ctx.marcarEnviado}
          onReceive={ctx.darEntrada}
          onCancel={ctx.cancelarPedido}
          onSolicitarAprovacao={ctx.solicitarAprovacao}
          onAprovar={ctx.aprovarPedido}
          onRejeitar={ctx.rejeitarPedido}
          onAfterRecebimentoChange={() => { ctx.refreshAll(); ctx.setDrawerOpen(false); }}
          isAdmin={canOperate}
          statusLabels={statusLabels}
        />
      )}

      {recebDialog && (
        <RegistrarRecebimentoDialog
          open={true}
          onClose={() => setRecebDialog(null)}
          pedidoId={recebDialog.id}
          pedidoNumero={recebDialog.numero}
          onSuccess={() => { ctx.refreshAll(); setRecebDialog(null); }}
        />
      )}
    </>
  );
}
