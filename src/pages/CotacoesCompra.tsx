
import { useNavigate } from "react-router-dom";
import { ModulePage } from "@/components/ModulePage";
import { SummaryCard } from "@/components/SummaryCard";
import { FormModal } from "@/components/FormModal";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AutocompleteSearch } from "@/components/ui/AutocompleteSearch";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Info, Plus, X, ShoppingCart, Clock, FileSearch, AlertCircle } from "lucide-react";
import { formatNumber, formatDate } from "@/lib/format";
import { useCotacoesCompra } from "@/hooks/useCotacoesCompra";
import { CotacaoCompraFilters } from "@/components/compras/CotacaoCompraFilters";
import { useCotacaoCompraFilters } from "@/components/compras/useCotacaoCompraFilters";
import { CotacaoCompraTable } from "@/components/compras/CotacaoCompraTable";
import { CotacaoCompraDrawer } from "@/components/compras/CotacaoCompraDrawer";
import { statusLabels } from "@/components/compras/cotacaoCompraTypes";
import { useComprasRealtime } from "@/hooks/useComprasRealtime";
import { useMemo } from "react";

export default function CotacoesCompra() {
  const navigate = useNavigate();
  const {
    data, loading, remove,
    modalOpen, setModalOpen,
    drawerOpen, setDrawerOpen,
    selected,
    mode, form, setForm,
    localItems, saving,
    deleteConfirmOpen, setDeleteConfirmOpen,
    viewItems, viewPropostas,
    addingProposal, setAddingProposal,
    proposalForm, setProposalForm,
    kpis, summaries, drawerStats,
    openCreate, openEdit, openView,
    handleSubmit, addLocalItem, updateLocalItem, removeLocalItem,
    handleAddProposal, handleSelectProposal, handleDeleteProposal,
    handleSendForApproval, handleApprove, handleReject, handleCancel, gerarPedido,
    produtoOptions, fornecedorOptions,
  } = useCotacoesCompra();

  // Realtime: invalida queries quando outro usuário/aba altera registros.
  useComprasRealtime();

  // Para o filtro de fornecedor da cotação, usamos a lista de fornecedores
  // que aparecem em alguma proposta (cotação não tem FK direta).
  const fornecedorById = useMemo(() => {
    const m = new Map<string, string>();
    fornecedorOptions.forEach((f) => m.set(String(f.id), f.label));
    return m;
  }, [fornecedorOptions]);

  const {
    searchTerm, setSearchTerm,
    statusFilters, setStatusFilters,
    fornecedorFilters, setFornecedorFilters,
    dataInicio, setDataInicio,
    dataFim, setDataFim,
    validadeFilter, setValidadeFilter,
    filteredData, activeFilters, handleRemoveFilter, statusOptions,
  } = useCotacaoCompraFilters(data, statusLabels, {
    summaries,
    fornecedorLabel: (id) => fornecedorById.get(id),
  });

  const fornecedorMultiOptions = useMemo(
    () => fornecedorOptions.map((f) => ({ value: String(f.id), label: f.label })),
    [fornecedorOptions],
  );

  return (
    <><ModulePage
        title="Cotações de Compra"
        subtitle="Central de consulta e negociação de compra — propostas, comparação e aprovação."
        addLabel="Nova Cotação de Compra"
        onAdd={openCreate}
        count={data.length}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard title="Total" value={formatNumber(kpis.total)} icon={ShoppingCart} variationType="neutral" variation="cotações" />
          <SummaryCard title="Em Cotação" value={formatNumber(kpis.emCotacao)} icon={Clock} variationType="neutral" variation="abertas ou em análise" />
          <SummaryCard title="Sem propostas" value={formatNumber(kpis.semPropostas)} icon={AlertCircle} variationType={kpis.semPropostas > 0 ? "negative" : "positive"} variation="ações em aberto" />
          <SummaryCard title="Aguardando Aprovação" value={formatNumber(kpis.aguardandoAprovacao)} icon={FileSearch} variationType={kpis.aguardandoAprovacao > 0 ? "negative" : "neutral"} variation="pendentes de decisão" />
        </div>

        <CotacaoCompraFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeFilters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={() => {
            setStatusFilters([]);
            setFornecedorFilters([]);
            setDataInicio("");
            setDataFim("");
          }}
          count={filteredData.length}
          statusOptions={statusOptions}
          statusFilters={statusFilters}
          onStatusChange={setStatusFilters}
          fornecedorOptions={fornecedorMultiOptions}
          fornecedorFilters={fornecedorFilters}
          onFornecedorChange={setFornecedorFilters}
          dataInicio={dataInicio}
          onDataInicioChange={setDataInicio}
          dataFim={dataFim}
          onDataFimChange={setDataFim}
          validadeFilter={validadeFilter}
          onValidadeChange={setValidadeFilter}
        />

        <CotacaoCompraTable
          data={filteredData}
          loading={loading}
          summaries={summaries}
          onView={openView}
          onEdit={openEdit}
        />
      </ModulePage>

      {/* Create/Edit Modal */}
      <FormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={mode === "create" ? "Nova Cotação de Compra" : "Editar Cotação de Compra"}
        size="xl"
        mode={mode}
        createHint="Defina o número, fornecedores e itens a cotar. Você poderá registrar propostas após criar."
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === "edit" && selected && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  Editando <span className="font-mono text-primary">{selected.numero}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {localItems.length} {localItems.length === 1 ? "item" : "itens"} •{" "}
                  Criada em {formatDate(selected.data_cotacao)}
                </p>
              </div>
              <StatusBadge status={selected.status} label={statusLabels[selected.status] || selected.status} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Número *</Label>
              <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} required className="font-mono" disabled={mode === "edit"} />
            </div>
            <div className="space-y-2">
              <Label>Data Cotação</Label>
              <Input type="date" value={form.data_cotacao} onChange={(e) => setForm({ ...form, data_cotacao: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Validade</Label>
              <Input type="date" value={form.data_validade} onChange={(e) => setForm({ ...form, data_validade: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Input value={statusLabels[form.status] || form.status} disabled />
              <p className="text-[11px] text-muted-foreground">
                O status é controlado pelas ações de fluxo na visualização detalhada.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Itens Solicitados</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLocalItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Adicionar Item
              </Button>
            </div>
            {localItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum item adicionado. Clique em "Adicionar Item" para começar.
              </div>
            ) : (
              <div className="space-y-2">
                {localItems.map((item, idx) => (
                  <div key={item._localId} className="rounded-lg border bg-card p-3">
                    {/* Mobile: bloco vertical */}
                    <div className="md:hidden space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground font-mono uppercase">Item {idx + 1}</span>
                        <Button type="button" variant="ghost" size="icon" aria-label="Remover item" className="h-9 w-9 text-destructive" onClick={() => removeLocalItem(item._localId)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <AutocompleteSearch
                        options={produtoOptions}
                        value={item.produto_id}
                        onChange={(id) => updateLocalItem(item._localId, "produto_id", id)}
                        placeholder="Buscar produto..."
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Qtd</Label>
                          <Input
                            type="number" step="0.01" min="0.01"
                            value={item.quantidade}
                            onChange={(e) => updateLocalItem(item._localId, "quantidade", Number(e.target.value))}
                            className="h-11 font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unidade</Label>
                          <Input
                            value={item.unidade}
                            onChange={(e) => updateLocalItem(item._localId, "unidade", e.target.value)}
                            className="h-11 text-center" placeholder="UN"
                          />
                        </div>
                      </div>
                    </div>
                    {/* Desktop: linha horizontal */}
                    <div className="hidden md:flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono w-6">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                      <AutocompleteSearch
                        options={produtoOptions}
                        value={item.produto_id}
                        onChange={(id) => updateLocalItem(item._localId, "produto_id", id)}
                        placeholder="Buscar produto..."
                      />
                      </div>
                      <Input
                        type="number" step="0.01" min="0.01"
                        value={item.quantidade}
                        onChange={(e) => updateLocalItem(item._localId, "quantidade", Number(e.target.value))}
                        className="w-24 font-mono" placeholder="Qtd"
                      />
                      <Input
                        value={item.unidade}
                        onChange={(e) => updateLocalItem(item._localId, "unidade", e.target.value)}
                        className="w-16 text-center" placeholder="UN"
                      />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remover item" className="h-8 w-8 text-destructive" onClick={() => removeLocalItem(item._localId)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </FormModal>

      <CotacaoCompraDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setAddingProposal(null); }}
        selected={selected}
        viewItems={viewItems}
        viewPropostas={viewPropostas}
        drawerStats={drawerStats}
        fornecedorOptions={fornecedorOptions}
        addingProposal={addingProposal}
        setAddingProposal={setAddingProposal}
        proposalForm={proposalForm}
        setProposalForm={setProposalForm}
        onEdit={(c) => { setDrawerOpen(false); openEdit(c); }}
        onDeleteOpen={() => setDeleteConfirmOpen(true)}
        onSelectProposal={handleSelectProposal}
        onDeleteProposal={handleDeleteProposal}
        onAddProposal={handleAddProposal}
        onSendForApproval={handleSendForApproval}
        onApprove={handleApprove}
        onReject={handleReject}
        onCancel={handleCancel}
        onGerarPedido={gerarPedido}
        onNavigatePedidos={() => navigate("/pedidos-compra")}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => { if (selected) { setDrawerOpen(false); remove(selected.id); } setDeleteConfirmOpen(false); }}
        title="Excluir cotação"
        description={`Tem certeza que deseja excluir a cotação ${selected?.numero || ""}? Esta ação não pode ser desfeita.`}
      />
    </>
  );
}
