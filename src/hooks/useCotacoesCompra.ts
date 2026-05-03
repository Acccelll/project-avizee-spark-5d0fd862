
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { validateForm } from "@/lib/validationSchemas";
import { cotacaoCompraSchema, validateCotacaoItems } from "@/lib/cotacaoCompraSchema";
import { useGerarPedidoCompra } from "@/pages/comercial/hooks/useGerarPedidoCompra";
import type { Database } from "@/integrations/supabase/types";
import {
  type CotacaoCompra,
  type CotacaoItem,
  type CotacaoSummary,
  type Proposta,
  type LocalItem,
  buildEmptyForm,
} from "@/components/compras/cotacaoCompraTypes";
import { canonicalCotacaoStatus } from "@/components/compras/comprasStatus";
import * as ccs from "@/services/cotacoesCompra.service";
import { useCotacoesEnrichment } from "@/hooks/compras/useCotacoesEnrichment";
import { useCotacaoPropostas } from "@/hooks/compras/useCotacaoPropostas";

export function useCotacoesCompra() {
  const navigate = useNavigate();
  const gerarPedidoCompra = useGerarPedidoCompra();
  const queryClient = useQueryClient();
  const { data, loading, fetchData, remove } = useSupabaseCrud({
    table: "cotacoes_compra",
    orderBy: "created_at",
    ascending: false,
  });
  const fornecedoresCrud = useSupabaseCrud({ table: "fornecedores" });
  const produtosCrud = useSupabaseCrud({ table: "produtos" });

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<CotacaoCompra | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState(buildEmptyForm());
  const [localItems, setLocalItems] = useState<LocalItem[]>([]);
  const { saving, submit } = useSubmitLock({ errorPrefix: "Erro ao salvar cotação" });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [viewItems, setViewItems] = useState<CotacaoItem[]>([]);
  const [viewPropostas, setViewPropostas] = useState<Proposta[]>([]);

  // KPIs
  const kpis = useMemo(() => {
    const emCotacao = data.filter((c) => ["aberta", "em_analise"].includes(canonicalCotacaoStatus(c.status))).length;
    const aguardandoAprovacao = data.filter((c) => canonicalCotacaoStatus(c.status) === "aguardando_aprovacao").length;
    const convertidas = data.filter((c) => canonicalCotacaoStatus(c.status) === "convertida").length;
    return { total: data.length, emCotacao, aguardandoAprovacao, convertidas };
  }, [data]);

  const summaries = useCotacoesEnrichment(data);

  const propostasOps = useCotacaoPropostas({
    selected,
    viewPropostas,
    setViewPropostas,
  });
  const {
    addingProposal,
    setAddingProposal,
    proposalForm,
    setProposalForm,
    handleAddProposal,
    handleSelectProposal,
    handleDeleteProposal,
  } = propostasOps;

  // Drawer summary stats
  const drawerStats = useMemo(() => {
    const uniqueSuppliers = new Set(viewPropostas.map((p) => p.fornecedor_id)).size;
    const bestTotal = viewItems.reduce((sum, item) => {
      const itemPropostas = viewPropostas.filter((p) => p.item_id === item.id);
      if (itemPropostas.length === 0) return sum;
      const best = Math.min(...itemPropostas.map((p) => Number(p.preco_unitario)));
      return sum + best * item.quantidade;
    }, 0);
    const selectedPropostas = viewPropostas.filter((p) => p.selecionado);
    const selectedSupplierIds = [...new Set(selectedPropostas.map((p) => p.fornecedor_id))];
    const selectedSupplierName =
      selectedSupplierIds.length === 1
        ? viewPropostas.find(
            (p) => p.fornecedor_id === selectedSupplierIds[0] && p.selecionado
          )?.fornecedores?.nome_razao_social ?? null
        : selectedSupplierIds.length > 1
        ? `${selectedSupplierIds.length} fornecedores`
        : null;
    const allItemsHaveSelected =
      viewItems.length > 0 &&
      viewItems.every((item) => viewPropostas.some((p) => p.item_id === item.id && p.selecionado));
    return { uniqueSuppliers, bestTotal, selectedPropostas, selectedSupplierName, allItemsHaveSelected };
  }, [viewItems, viewPropostas]);

  const openCreate = async () => {
    setMode("create");
    const { data: rpcNumero, error: rpcErr } = await ccs.proximoNumeroCotacaoCompra();
    // Numeração crítica deve sempre vir do PostgreSQL SEQUENCE.
    // Se falhar, abortamos a criação para não gerar números duplicáveis.
    if (rpcErr || !rpcNumero) {
      console.error("[cotacoes_compra] proximo_numero_cotacao_compra falhou:", rpcErr);
      toast.error("Não foi possível gerar o número da cotação. Tente novamente.");
      return;
    }
    setForm({ ...buildEmptyForm(), numero: rpcNumero });
    setLocalItems([]);
    setSelected(null);
    setModalOpen(true);
  };

  const openEdit = async (c: CotacaoCompra) => {
    // Caminho único de edição: rota dedicada.
    // O modal foi aposentado para edição (race delete+insert client-side).
    // O form de rota usa `replace_cotacao_compra_itens` (RPC transacional).
    setDrawerOpen(false);
    navigate(`/cotacoes-compra/${c.id}`);
  };

  const openView = async (c: CotacaoCompra) => {
    setSelected({ ...c, status: canonicalCotacaoStatus(c.status) });
    setDrawerOpen(true);
    const [itens, propostas] = await Promise.all([
      ccs.listCotacaoItens(c.id),
      ccs.listCotacaoPropostas(c.id),
    ]);
    setViewItems((itens || []) as CotacaoItem[]);
    setViewPropostas((propostas || []) as Proposta[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Schema-driven validation (centraliza obrigatórios + status terminal).
    const result = validateForm(cotacaoCompraSchema, form);
    if (!result.success) {
      const firstError = Object.values(result.errors)[0];
      toast.error(firstError || "Corrija os erros do formulário");
      return;
    }
    const itemError = validateCotacaoItems(localItems);
    if (itemError) { toast.error(itemError); return; }

    await submit(async () => {
      const payload = {
        numero: form.numero,
        data_cotacao: form.data_cotacao,
        data_validade: form.data_validade || null,
        observacoes: form.observacoes || null,
        status: form.status,
      };
      let cotacaoId = selected?.id;
      if (mode === "create") {
        const newC = await ccs.insertCotacaoHeader(payload);
        cotacaoId = (newC as CotacaoCompra).id;
      } else if (selected) {
        // Sequential update -> delete: evita race onde Promise.all
        // apaga itens mesmo se o update do cabeçalho falhar.
        await ccs.updateCotacaoHeader(selected.id, payload);
        await ccs.deleteCotacaoItens(selected.id);
      }
      if (cotacaoId) {
        const itemsPayload = localItems
          .filter((i) => i.produto_id)
          .map((i) => ({
            cotacao_compra_id: cotacaoId as string,
            produto_id: i.produto_id,
            quantidade: i.quantidade,
            unidade: i.unidade,
          }));
        if (itemsPayload.length === 0) {
          toast.error("A cotação precisa de pelo menos 1 item.");
          throw new Error("Cotação sem itens válidos");
        }
        await ccs.insertCotacaoItens(itemsPayload);
      }
      toast.success("Cotação de compra salva!");
      setModalOpen(false);
      fetchData();

      // Caminho único: após CRIAR pelo modal rápido, redireciona para a
      // rota dedicada (a edição posterior só acontece via rota).
      if (mode === "create" && cotacaoId) {
        navigate(`/cotacoes-compra/${cotacaoId}`);
      }
    });
  };

  const addLocalItem = () => {
    setLocalItems([...localItems, { _localId: crypto.randomUUID(), produto_id: "", quantidade: 1, unidade: "UN" }]);
  };

  const updateLocalItem = (localId: string, field: string, value: unknown) => {
    setLocalItems(localItems.map((i) => (i._localId === localId ? { ...i, [field]: value } : i)));
  };

  const removeLocalItem = (localId: string) => {
    setLocalItems(localItems.filter((i) => i._localId !== localId));
  };

  const reloadPropostas = async () => {
    if (!selected) return;
    const propostas = await ccs.listCotacaoPropostas(selected.id);
    setViewPropostas((propostas || []) as Proposta[]);
  };

  const handleSendForApproval = async () => {
    if (!selected) return;
    try {
      await ccs.enviarCotacaoAprovacao(selected.id);
      setSelected({ ...selected, status: "aguardando_aprovacao" });
      toast.success("Cotação enviada para aprovação!");
      fetchData();
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const handleApprove = async () => {
    if (!selected) return;
    try {
      await ccs.aprovarCotacaoCompra(selected.id);
      setSelected({ ...selected, status: "aprovada" });
      toast.success("Cotação aprovada!");
      fetchData();
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const handleReject = async (motivo?: string) => {
    if (!selected) return;
    const motivoTrim = (motivo ?? "").trim();
    if (!motivoTrim) {
      toast.error("Informe o motivo da rejeição.");
      return;
    }
    try {
      await ccs.rejeitarCotacaoCompra(selected.id, motivoTrim);
      setSelected({ ...selected, status: "rejeitada" });
      toast.error("Cotação rejeitada.");
      fetchData();
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const handleCancel = async (motivo: string) => {
    if (!selected) return;
    const motivoTrim = (motivo ?? "").trim();
    if (!motivoTrim) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    try {
      await ccs.cancelarCotacaoCompra(selected.id, motivoTrim);
      setSelected({ ...selected, status: "cancelada" });
      toast.success("Cotação cancelada.");
      setDrawerOpen(false);
      fetchData();
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const gerarPedido = async () => {
    if (!selected) return;

    const propostasSelecionadas = viewPropostas.filter((p) => p.selecionado);
    if (propostasSelecionadas.length === 0) {
      toast.error("Selecione ao menos uma proposta antes de gerar o pedido.");
      return;
    }

    const fornecedoresDistintos = [...new Set(propostasSelecionadas.map((p) => p.fornecedor_id))];
    if (fornecedoresDistintos.length > 1) {
      toast.error(
        `As propostas selecionadas pertencem a fornecedores diferentes. Selecione propostas de apenas um fornecedor para gerar o pedido.`,
        { duration: 6000 }
      );
      return;
    }

    // Confirmação de impacto: cria pedido permanente e marca cotação como convertida.
    const fornecedorNome =
      propostasSelecionadas[0]?.fornecedores?.nome_razao_social ?? "fornecedor selecionado";
    const totalEstimado = propostasSelecionadas.reduce((sum, p) => {
      const item = viewItems.find((i) => i.id === p.item_id);
      return sum + Number(p.preco_unitario || 0) * Number(item?.quantidade || 0);
    }, 0);
    const ok = window.confirm(
      `Gerar pedido de compra?\n\n` +
      `Fornecedor: ${fornecedorNome}\n` +
      `Total estimado: ${totalEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n` +
      `Itens: ${propostasSelecionadas.length}\n\n` +
      `Esta ação marca a cotação como CONVERTIDA e não pode ser desfeita.`
    );
    if (!ok) return;

    // Delega para a RPC transacional `gerar_pedido_compra` via mutation hook.
    // O hook já invalida `cotacoes_compra` + `pedidos_compra` cross-módulo.
    try {
      const result = await gerarPedidoCompra.mutateAsync({
        id: selected.id,
        observacoes: `Gerado a partir da cotação ${selected.numero}`,
      });
      setDrawerOpen(false);
      fetchData();
      // CTA pós-conversão: leva direto para o pedido recém-criado (não para a lista).
      navigate(`/pedidos-compra/${result.pedidoId}`);
    } catch (err: unknown) {
      console.error("[gerarPedido]", err);
      // toast já emitido pelo hook
    }
  };

  const produtoOptions = (produtosCrud.data as Database["public"]["Tables"]["produtos"]["Row"][]).map((p) => ({
    id: p.id,
    label: p.nome,
    sublabel: p.codigo_interno || p.sku || "",
  }));

  const fornecedorOptions = (fornecedoresCrud.data as Database["public"]["Tables"]["fornecedores"]["Row"][]).map((f) => ({
    id: f.id,
    label: f.nome_razao_social,
    sublabel: f.cpf_cnpj || "",
  }));

  /**
   * Wrapper de fetchData que também invalida a queryKey `cotacoes_compra`
   * do React Query — garante que consumidores RQ (ex.: `useGerarPedidoCompra`,
   * outras telas) sincronizem com o cache do useSupabaseCrud (legacy).
   */
  const fetchDataWithInvalidation = async () => {
    await fetchData();
    queryClient.invalidateQueries({ queryKey: ["cotacoes_compra"] });
  };

  return {
    data,
    loading,
    fetchData: fetchDataWithInvalidation,
    remove,
    modalOpen,
    setModalOpen,
    drawerOpen,
    setDrawerOpen,
    selected,
    setSelected,
    mode,
    form,
    setForm,
    localItems,
    saving,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    viewItems,
    viewPropostas,
    addingProposal,
    setAddingProposal,
    proposalForm,
    setProposalForm,
    kpis,
    summaries,
    drawerStats,
    openCreate,
    openEdit,
    openView,
    handleSubmit,
    addLocalItem,
    updateLocalItem,
    removeLocalItem,
    handleAddProposal,
    handleSelectProposal,
    handleDeleteProposal,
    handleSendForApproval,
    handleApprove,
    handleReject,
    handleCancel,
    gerarPedido,
    produtoOptions,
    fornecedorOptions,
  };
}
