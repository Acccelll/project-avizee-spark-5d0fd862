/**
 * Página de detalhe e edição de Cotação de Compra.
 * Rota: /cotacoes-compra/:id
 *
 * Reaprovecha os subcomponentes existentes do drawer e do form modal,
 * expondo-os em rota dedicada para melhor usabilidade e rastreabilidade.
 */
import { useCallback, useEffect, useState, useMemo, type SetStateAction } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getCotacaoCompra,
  listCotacaoItens,
  listCotacaoPropostas,
  listProdutosParaCotacao,
  listFornecedoresParaCotacao,
  updateCotacaoHeader,
  replaceCotacaoItens,
  insertCotacaoProposta,
  selectCotacaoProposta,
  deleteCotacaoProposta,
} from "@/services/cotacoesCompra.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { AutocompleteSearch } from "@/components/ui/AutocompleteSearch";
import { CotacaoCompraPropostasPanel } from "@/components/compras/CotacaoCompraPropostasPanel";
import { CotacaoCompraItensTable } from "@/components/compras/CotacaoCompraItensTable";
import { ArrowLeft, Plus, Save, X } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { formatDate } from "@/lib/format";
import {
  type CotacaoCompra,
  type CotacaoItem,
  type Proposta,
  type LocalItem,
  statusLabels,
} from "@/components/compras/cotacaoCompraTypes";
import { canonicalCotacaoStatus } from "@/components/compras/comprasStatus";
import type { TableRow } from "@/types/domain";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { validarTransicaoCotacao } from "@/lib/comprasTransitions";

type ProdutoRow = TableRow<"produtos">;
type FornecedorRow = TableRow<"fornecedores">;

export default function CotacaoCompraForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const { saving, submit } = useSubmitLock({ errorPrefix: "Erro ao salvar cotação" });
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [cotacao, setCotacao] = useState<CotacaoCompra | null>(null);
  const [form, setForm] = useState({
    numero: "",
    data_cotacao: new Date().toISOString().split("T")[0],
    data_validade: "",
    observacoes: "",
    status: "aberta",
  });
  const [localItems, setLocalItems] = useState<LocalItem[]>([]);
  const [viewItems, setViewItems] = useState<CotacaoItem[]>([]);
  const [viewPropostas, setViewPropostas] = useState<Proposta[]>([]);
  const [addingProposal, setAddingProposal] = useState<string | null>(null);
  const [proposalForm, setProposalForm] = useState({
    fornecedor_id: "",
    preco_unitario: 0,
    prazo_entrega_dias: "",
    observacoes: "",
  });

  const [produtoOptions, setProdutoOptions] = useState<{ id: string; label: string; sublabel: string }[]>([]);
  const [fornecedorOptions, setFornecedorOptions] = useState<{ id: string; label: string; sublabel: string }[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Bloqueia fechar/recarregar a aba se houver mudanças não salvas.
  useBeforeUnloadGuard(isDirty);

  const updateForm = useCallback((next: SetStateAction<typeof form>) => {
    setForm(next);
    setIsDirty(true);
  }, []);

  const updateLocalItems = useCallback((next: SetStateAction<LocalItem[]>) => {
    setLocalItems(next);
    setIsDirty(true);
  }, []);

  useEffect(() => {
    async function load() {
      if (!id) { navigate("/cotacoes-compra"); return; }
      setLoading(true);
      const [cot, itens, propostas, prods, fors] = await Promise.all([
        getCotacaoCompra(id).catch(() => null),
        listCotacaoItens(id),
        listCotacaoPropostas(id),
        listProdutosParaCotacao(),
        listFornecedoresParaCotacao(),
      ]);

      if (!cot) { toast.error("Cotação não encontrada."); navigate("/cotacoes-compra"); return; }

      setCotacao(cot as CotacaoCompra);
      updateForm({
        numero: cot.numero,
        data_cotacao: cot.data_cotacao,
        data_validade: cot.data_validade || "",
        observacoes: cot.observacoes || "",
        status: canonicalCotacaoStatus(cot.status),
      });
      updateLocalItems(
        (itens || []).map((i: CotacaoItem) => ({
          _localId: i.id,
          id: i.id,
          produto_id: i.produto_id,
          quantidade: i.quantidade,
          unidade: i.unidade || "UN",
        }))
      );
      setViewItems((itens || []) as CotacaoItem[]);
      setViewPropostas((propostas || []) as Proposta[]);
      setProdutoOptions(
        (prods || []).map((p: ProdutoRow) => ({
          id: p.id,
          label: p.nome || "",
          sublabel: p.codigo_interno || p.sku || "",
        }))
      );
      setFornecedorOptions(
        (fors || []).map((f: FornecedorRow) => ({
          id: f.id,
          label: f.nome_razao_social || "",
          sublabel: f.cpf_cnpj || "",
        }))
      );
      setIsDirty(false);
      setLoading(false);
    }
    load();
  }, [id, navigate, updateForm, updateLocalItems]);

  const isTerminal = cotacao ? ["convertida", "cancelada"].includes(cotacao.status) : false;

  const addLocalItem = () => {
    updateLocalItems([...localItems, { _localId: crypto.randomUUID(), produto_id: "", quantidade: 1, unidade: "UN" }]);
  };
  const updateLocalItem = (localId: string, field: string, value: unknown) => {
    updateLocalItems(localItems.map((i) => (i._localId === localId ? { ...i, [field]: value } : i)));
  };
  const removeLocalItem = (localId: string) => {
    updateLocalItems(localItems.filter((i) => i._localId !== localId));
  };

  const reloadPropostas = async () => {
    if (!cotacao) return;
    const data = await listCotacaoPropostas(cotacao.id).catch(() => []);
    setViewPropostas(data as Proposta[]);
  };

  const handleSave = async () => {
    if (!cotacao) return;

    if (!form.numero) { toast.error("Número é obrigatório."); return; }
    if (localItems.length === 0) { toast.error("Adicione ao menos um item."); return; }
    const itemSemProduto = localItems.findIndex((i) => !i.produto_id);
    if (itemSemProduto !== -1) { toast.error(`Item ${itemSemProduto + 1}: selecione um produto.`); return; }
    const itemSemQtd = localItems.findIndex((i) => Number(i.quantidade || 0) <= 0);
    if (itemSemQtd !== -1) { toast.error(`Item ${itemSemQtd + 1}: quantidade deve ser maior que zero.`); return; }
    const prodIds = localItems.map((i) => i.produto_id);
    if (prodIds.some((pid, idx) => prodIds.indexOf(pid) !== idx)) {
      toast.error("Produto duplicado na cotação. Cada produto deve aparecer apenas uma vez.");
      return;
    }
    if (["convertida", "cancelada"].includes(form.status)) {
      toast.error("O status selecionado só pode ser definido por ações do sistema.");
      return;
    }
    // Validador puro: bloqueia transição inválida antes do round-trip ao banco.
    if (cotacao && form.status !== cotacao.status) {
      const v = validarTransicaoCotacao(cotacao.status, form.status);
      if (!v.ok) {
        toast.error(v.motivo ?? "Transição de status inválida.");
        return;
      }
    }

    await submit(async () => {
      const payload = {
        numero: form.numero,
        data_cotacao: form.data_cotacao,
        data_validade: form.data_validade || null,
        observacoes: form.observacoes || null,
        status: form.status,
      };
      await updateCotacaoHeader(cotacao.id, payload);

      // Substituição atômica via RPC (evita ficar sem itens em caso de falha)
      const itemsPayload = localItems.filter((i) => i.produto_id).map((i) => ({
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        unidade: i.unidade,
      }));
      await replaceCotacaoItens(cotacao.id, itemsPayload);

      toast.success("Cotação salva!", {
        description: cotacao?.numero ? `Cotação ${cotacao.numero}` : undefined,
      });
      setCotacao({ ...cotacao, ...payload } as CotacaoCompra);

      // Reload items to refresh viewItems with DB ids
      const itensReload = await listCotacaoItens(cotacao.id).catch(() => []);
      setViewItems(itensReload as CotacaoItem[]);
      updateLocalItems(
        (itensReload as CotacaoItem[]).map((i: CotacaoItem) => ({
          _localId: i.id,
          id: i.id,
          produto_id: i.produto_id,
          quantidade: i.quantidade,
          unidade: i.unidade || "UN",
        }))
      );
      setIsDirty(false);
    });
  };

  const handleBack = async () => {
    if (isDirty) {
      const ok = await confirm();
      if (!ok) return;
    }
    navigate("/cotacoes-compra");
  };

  const handleAddProposal = async (itemId: string) => {
    if (!proposalForm.fornecedor_id || !cotacao) {
      toast.error("Selecione um fornecedor.");
      return;
    }
    if (Number(proposalForm.preco_unitario) <= 0) {
      toast.error("Preço unitário deve ser maior que zero.");
      return;
    }
    const duplicado = viewPropostas.some(
      (p) => p.item_id === itemId && p.fornecedor_id === proposalForm.fornecedor_id,
    );
    if (duplicado) {
      toast.error("Este fornecedor já tem uma proposta para este item.");
      return;
    }
    try {
      await insertCotacaoProposta({
        cotacao_compra_id: cotacao.id,
        item_id: itemId,
        fornecedor_id: proposalForm.fornecedor_id,
        preco_unitario: proposalForm.preco_unitario,
        prazo_entrega_dias: proposalForm.prazo_entrega_dias ? Number(proposalForm.prazo_entrega_dias) : null,
        observacoes: proposalForm.observacoes || null,
      });
      toast.success("Proposta adicionada!");
      setAddingProposal(null);
      setProposalForm({ fornecedor_id: "", preco_unitario: 0, prazo_entrega_dias: "", observacoes: "" });
      await reloadPropostas();
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const handleSelectProposal = async (propostaId: string, itemId: string) => {
    if (!cotacao) return;
    try {
      await selectCotacaoProposta({ cotacaoId: cotacao.id, itemId, propostaId });
      toast.success("Fornecedor selecionado!");
      await reloadPropostas();
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const handleDeleteProposal = async (propostaId: string) => {
    if (!cotacao) return;
    try {
      await deleteCotacaoProposta(propostaId);
      toast.success("Proposta removida.");
      await reloadPropostas();
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const uniqueSuppliers = useMemo(
    () => new Set(viewPropostas.map((p) => p.fornecedor_id)).size,
    [viewPropostas],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!cotacao) return null;

  return (
    <PageShell
      backTo={handleBack}
      maxWidth="5xl"
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono">{cotacao.numero}</span>
          <StatusBadge status={cotacao.status} label={statusLabels[cotacao.status] || cotacao.status} />
        </span>
      }
      subtitle={`Criada em ${formatDate(cotacao.data_cotacao)}`}
      actions={
        !isTerminal && (
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        )
      }
    >

        {isTerminal && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
            Esta cotação está em status <strong>{statusLabels[cotacao.status]}</strong> e não pode ser editada.
          </div>
        )}

        {/* Form */}
        {!isTerminal && (
          <div className="rounded-lg border bg-card p-5 space-y-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados da Cotação</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Número *</Label>
                <Input value={form.numero} disabled required className="font-mono" />
                <p className="text-[11px] text-muted-foreground">
                  Número atribuído automaticamente pelo sistema.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Data Cotação</Label>
                <Input type="date" value={form.data_cotacao} onChange={(e) => updateForm({ ...form, data_cotacao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={form.data_validade} onChange={(e) => updateForm({ ...form, data_validade: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Input value={statusLabels[form.status] || form.status} disabled />
                <p className="text-[11px] text-muted-foreground">
                  O status é alterado por ações de workflow (aprovar/rejeitar/gerar pedido), não no formulário.
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
                    <div key={item._localId} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                      <span className="text-xs text-muted-foreground font-mono w-6">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <AutocompleteSearch
                          options={produtoOptions}
                          value={item.produto_id}
                          onChange={(val) => updateLocalItem(item._localId, "produto_id", val)}
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
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => updateForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
        )}

        {/* Itens (read-only view when terminal) */}
        {isTerminal && viewItems.length > 0 && (
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Itens</p>
            <CotacaoCompraItensTable items={viewItems} />
          </div>
        )}

        {/* Proposals panel */}
        {viewItems.length > 0 && (
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Propostas de Fornecedores</p>
            <CotacaoCompraPropostasPanel
              selected={cotacao}
              viewItems={viewItems}
              viewPropostas={viewPropostas}
              uniqueSuppliers={uniqueSuppliers}
              fornecedorOptions={fornecedorOptions}
              addingProposal={addingProposal}
              setAddingProposal={setAddingProposal}
              proposalForm={proposalForm}
              setProposalForm={setProposalForm}
              onSelectProposal={handleSelectProposal}
              onDeleteProposal={handleDeleteProposal}
              onAddProposal={handleAddProposal}
            />
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar para Cotações
          </Button>
          {!isTerminal && (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          )}
        </div>
      {confirmDialog}
    </PageShell>
  );
}
