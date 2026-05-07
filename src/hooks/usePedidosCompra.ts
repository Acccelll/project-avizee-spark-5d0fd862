
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { notifyError } from "@/utils/errorMessages";
import { type GridItem } from "@/components/ui/ItemsGrid";
import {
  type PedidoCompra,
  type FornecedorOptionRow,
  type ProdutoOptionRow,
  buildEmptyPedidoForm,
} from "@/components/compras/pedidoCompraTypes";
import { canonicalPedidoStatus, pedidoStatusLabelMap } from "@/components/compras/comprasStatus";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { validateForm } from "@/lib/validationSchemas";
import { pedidoCompraSchema, validatePedidoItems } from "@/lib/pedidoCompraSchema";
import { todayISO } from "@/lib/dateUtils";
import { INVALIDATION_KEYS } from "@/services/_invalidationKeys";
import {
  proximoNumeroPedidoCompra,
  receberCompra,
} from "@/types/rpc";
import * as pcs from "@/services/pedidosCompra.service";
import { useCompraLifecycle } from "@/hooks/compras/useCompraLifecycle";

/** Shape of a row from pedidos_compra_itens joined with produtos */
export interface PedidoItemRow {
  id: string | number;
  produto_id: string | number | null;
  quantidade: number | null;
  preco_unitario?: number | null;
  subtotal?: number | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
  produtos: { nome: string | null; codigo_interno: string | null; estoque_atual?: number | null } | null;
}

/** Minimal cotacao_compra row returned from the draw query */
export interface CotacaoRow {
  id: string;
  numero: string;
  status: string;
  data_cotacao: string;
}

/** Minimal estoque_movimentos row (joined com produtos para o drawer) */
export interface EstoqueMovimentoRow {
  id?: string;
  produto_id: string | null;
  quantidade: number | null;
  saldo_anterior?: number | null;
  saldo_atual?: number | null;
  produtos?: { nome: string | null; codigo_interno: string | null } | null;
}

/** Minimal financeiro_lancamentos row */
export interface FinanceiroLancRow {
  id: string;
  descricao: string | null;
  valor: number | null;
  status: string | null;
  data_vencimento: string | null;
  tipo: string | null;
}

export interface PedidoCompraForm {
  fornecedor_id: string;
  data_pedido: string;
  data_entrega_prevista: string;
  data_entrega_real: string;
  frete_valor: string;
  condicao_pagamento: string;
  status: string;
  observacoes: string;
}

const statusLabels: Record<string, string> = pedidoStatusLabelMap;

export interface UsePedidosCompraReturn {
  // Data
  pedidos: PedidoCompra[];
  fornecedoresAtivos: FornecedorOptionRow[];
  fornecedorOptions: { id: string; label: string; sublabel: string }[];
  produtosOptionsData: (ProdutoOptionRow & { id: string; nome: string; codigo_interno: string; preco_venda: number; preco_custo: number; unidade_medida: string })[];
  formasPagamento: { id: string; descricao: string }[];
  loading: boolean;
  fornecedoresLoading: boolean;
  produtosLoading: boolean;
  statusLabels: Record<string, string>;
  kpis: { total: number; totalValue: number; aguardando: number; recebidos: number };

  // Form state
  form: PedidoCompraForm;
  setForm: React.Dispatch<React.SetStateAction<PedidoCompraForm>>;
  items: GridItem[];
  setItems: React.Dispatch<React.SetStateAction<GridItem[]>>;
  saving: boolean;
  mode: "create" | "edit";

  // Selected / view data
  selected: PedidoCompra | null;
  viewItems: PedidoItemRow[];
  viewEstoque: EstoqueMovimentoRow[];
  viewFinanceiro: FinanceiroLancRow[];
  viewCotacao: CotacaoRow | null;

  // Actions
  refreshAll: () => Promise<void>;
  openCreate: () => void;
  openEdit: (p: PedidoCompra) => Promise<void>;
  openView: (p: PedidoCompra) => Promise<void>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  darEntrada: (p: PedidoCompra) => Promise<void>;
  marcarEnviado: (p: PedidoCompra) => Promise<void>;
  cancelarPedido: (p: PedidoCompra) => Promise<void>;
  solicitarAprovacao: (p: PedidoCompra) => Promise<void>;
  aprovarPedido: (p: PedidoCompra) => Promise<void>;
  rejeitarPedido: (p: PedidoCompra, motivo: string) => Promise<void>;
  deleteSelected: () => Promise<void>;
  setSelected: React.Dispatch<React.SetStateAction<PedidoCompra | null>>;

  // Modal state
  modalOpen: boolean;
  setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  drawerOpen: boolean;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function usePedidosCompra(): UsePedidosCompraReturn {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<PedidoCompra | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<PedidoCompraForm>(buildEmptyPedidoForm());
  const [items, setItems] = useState<GridItem[]>([]);
  const { saving, submit } = useSubmitLock({ errorPrefix: "Erro ao salvar pedido" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewItems, setViewItems] = useState<PedidoItemRow[]>([]);
  const [viewEstoque, setViewEstoque] = useState<EstoqueMovimentoRow[]>([]);
  const [viewFinanceiro, setViewFinanceiro] = useState<FinanceiroLancRow[]>([]);
  const [viewCotacao, setViewCotacao] = useState<CotacaoRow | null>(null);

  const {
    data: pedidosRaw = [],
    isLoading: loading,
    refetch: refetchPedidos,
  } = useQuery({
    queryKey: ["pedidos_compra"],
    queryFn: async () => (await pcs.listPedidosCompra()) as PedidoCompra[],
    select: (data) => data.map((pedido) => ({
      ...pedido,
      status: canonicalPedidoStatus(pedido.status),
      fornecedor_nome: pedido.fornecedores?.nome_razao_social ?? null,
      fornecedor_cnpj: pedido.fornecedores?.cpf_cnpj ?? null,
    })),
  });

  const { data: fornecedoresRaw = [], isLoading: fornecedoresLoading } = useQuery({
    queryKey: ["pedidos_compra_fornecedores"],
    queryFn: async () => (await pcs.listFornecedoresParaPedido()) as FornecedorOptionRow[],
  });

  const { data: produtosRaw = [], isLoading: produtosLoading } = useQuery({
    queryKey: ["pedidos_compra_produtos"],
    queryFn: async () => (await pcs.listProdutosParaPedido()) as ProdutoOptionRow[],
  });

  const { data: formasPagamentoRaw = [] } = useQuery({
    queryKey: ["pedidos_compra_formas_pagamento"],
    queryFn: () => pcs.listFormasPagamentoParaPedido(),
  });

  const pedidos = pedidosRaw;
  const fornecedoresAtivos = fornecedoresRaw.filter((f) => f.ativo !== false);

  const fornecedorOptions = fornecedoresAtivos.map((f) => ({
    id: String(f.id),
    label: f.nome_razao_social || "",
    sublabel: f.cpf_cnpj || "",
  }));

  const produtosOptionsData = produtosRaw.map((p) => ({
    ...p,
    id: String(p.id),
    nome: p.nome || "",
    codigo_interno: p.codigo_interno || "",
    preco_venda: Number(p.preco_venda || 0),
    preco_custo: Number(p.preco_custo || 0),
    unidade_medida: p.unidade_medida || "",
  }));

  const kpis = useMemo(() => {
    const aguardando = pedidos.filter((p) =>
      ["rascunho", "aguardando_aprovacao", "aprovado", "enviado_ao_fornecedor", "aguardando_recebimento", "parcialmente_recebido"].includes(canonicalPedidoStatus(p.status)),
    );
    const recebidos = pedidos.filter((p) => canonicalPedidoStatus(p.status) === "recebido");
    const totalValue = pedidos.reduce((s, p) => s + Number(p.valor_total || 0), 0);
    return { total: pedidos.length, totalValue, aguardando: aguardando.length, recebidos: recebidos.length };
  }, [pedidos]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pedidos_compra"] }),
      queryClient.invalidateQueries({ queryKey: ["pedidos_compra_fornecedores"] }),
      queryClient.invalidateQueries({ queryKey: ["pedidos_compra_produtos"] }),
    ]);
    await refetchPedidos();
  };

  const openCreate = () => {
    setMode("create");
    // Use a fresh form so `data_pedido` reflects today's date.
    setForm(buildEmptyPedidoForm());
    setItems([]);
    setSelected(null);
    setModalOpen(true);
  };

  const openEdit = async (p: PedidoCompra) => {
    // Caminho único de edição: rota dedicada `/pedidos-compra/:id`.
    // O modal foi aposentado para edição; o form de rota usa
    // `replace_pedido_compra_itens` (RPC transacional) e suporta
    // dirty-tracking + voltar protegido.
    setDrawerOpen(false);
    navigate(`/pedidos-compra/${p.id}`);
  };

  const openView = async (p: PedidoCompra) => {
    setSelected(p);
    setViewItems([]);
    setViewEstoque([]);
    setViewFinanceiro([]);
    setViewCotacao(null);
    setDrawerOpen(true);

    const [itensResult, estResult] = await Promise.all([
      pcs.listPedidoCompraItens(String(p.id)),
      pcs.listEstoqueMovimentosPorPedido(p.id),
    ]);

    setViewItems((itensResult || []) as unknown as PedidoItemRow[]);
    setViewEstoque((estResult as EstoqueMovimentoRow[]) || []);

    if (p.cotacao_compra_id) {
      const cot = await pcs.getCotacaoResumoSimples(String(p.cotacao_compra_id));
      setViewCotacao(cot || null);
    }

    const finLanc = await pcs.listFinanceiroPorPedido(p.id);
    setViewFinanceiro((finLanc as FinanceiroLancRow[]) || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Schema-driven validation (centraliza obrigatórios do cabeçalho).
    const headerResult = validateForm(pedidoCompraSchema, form);
    if (!headerResult.success) {
      const firstError = Object.values(headerResult.errors)[0];
      toast.error(firstError || "Corrija os erros do formulário");
      return;
    }
    const itemError = validatePedidoItems(items);
    if (itemError) { toast.error(itemError); return; }

    const fornecedorId = String(form.fornecedor_id);
    const valorProdutos = items.reduce((s, i) => s + Number(i.valor_total || 0), 0);
    const valorTotal = valorProdutos + Number(form.frete_valor || 0);

    const payload = {
      fornecedor_id: fornecedorId,
      data_pedido: form.data_pedido,
      data_entrega_prevista: form.data_entrega_prevista || null,
      data_entrega_real: form.data_entrega_real || null,
      frete_valor: Number(form.frete_valor || 0),
      condicao_pagamento: form.condicao_pagamento || null,
      status: form.status,
      observacoes: form.observacoes || null,
      valor_total: valorTotal,
    };

    await submit(async () => {
      let pedidoId: string | number | undefined = selected?.id;

      if (mode === "create") {
        // Numeração crítica: sem fallback Date.now (violaria atomicidade
        // do SEQUENCE — risco de duplicidade entre usuários).
        const rpcNumero = await proximoNumeroPedidoCompra();
        if (!rpcNumero) throw new Error("Não foi possível gerar o número do pedido. Tente novamente.");
        const newP = await pcs.insertPedidoCompra({ numero: rpcNumero, ...payload });
        pedidoId = (newP as { id: string | number }).id;
      } else if (selected) {
        // Sequential: evita apagar itens caso o update do cabeçalho falhe.
        await pcs.updatePedidoCompra(selected.id, payload);
        await pcs.deletePedidoCompraItens(selected.id);
      }

      if (items.length > 0 && pedidoId) {
        const itemsPayload = items
          .filter((i) => i.produto_id)
          .map((i) => ({
            pedido_compra_id: String(pedidoId),
            produto_id: String(i.produto_id),
            quantidade: Number(i.quantidade || 0),
            preco_unitario: Number(i.valor_unitario || 0),
            subtotal: Number(i.valor_total || 0),
          }));

        if (itemsPayload.length > 0) {
          try {
            await pcs.insertPedidoCompraItens(itemsPayload);
          } catch (itemsError) {
            if (mode === "create" && pedidoId) {
              // rollback manual do cabeçalho criado neste submit.
              await pcs.deletePedidoCompraHard(pedidoId);
            }
            throw itemsError;
          }
        }
      }

      toast.success("Pedido de compra salvo!");
      setModalOpen(false);
      setItems([]);
      setForm(buildEmptyPedidoForm());
      await refreshAll();

      // Caminho único: após CRIAR pelo modal rápido, redirecionar para
      // a rota dedicada de edição. Edição posterior só acontece pela rota.
      if (mode === "create" && pedidoId) {
        navigate(`/pedidos-compra/${pedidoId}`);
      }
    });
  };

  const darEntrada = async (p: PedidoCompra) => {
    let itens: Awaited<ReturnType<typeof pcs.listPedidoItensParaRecebimento>> = [];
    try {
      itens = await pcs.listPedidoItensParaRecebimento(p.id);
    } catch (err) {
      console.error("[darEntrada] fetch itens", err);
      notifyError(err);
      return;
    }
    if (!itens || itens.length === 0) {
      toast.error("Pedido sem itens para registrar recebimento.");
      return;
    }

    const payloadItens = itens
      .map((i) => {
        const pendente = Number(i.quantidade || 0) - Number(i.quantidade_recebida || 0);
        return {
          item_pedido_id: i.id ? String(i.id) : null,
          produto_id: i.produto_id ? String(i.produto_id) : null,
          descricao: null,
          quantidade_recebida: pendente > 0 ? pendente : 0,
          valor_unitario: Number(i.preco_unitario || 0),
        };
      })
      .filter((i) => i.quantidade_recebida > 0);

    if (payloadItens.length === 0) {
      toast.error("Nenhum item com quantidade pendente para receber.");
      return;
    }

    let entradaOk = false;
    try {
      const hoje = todayISO();
      await receberCompra({
        p_pedido_id: String(p.id),
        p_data_recebimento: hoje,
        p_itens: payloadItens as unknown as never,
        p_observacoes: null,
      });

      entradaOk = true;
      // Toast simples — usuário já será redirecionado para /fiscal logo abaixo,
      // onde o OriginContextBanner mostra o caminho de volta.
      toast.success("Recebimento registrado!", {
        description:
          "Estoque atualizado. Lance a NF de entrada para gerar o contas a pagar.",
        duration: 5000,
      });
      // Invalidação cross-módulo: estoque, financeiro, NFs, pedidos.
      await Promise.all(
        INVALIDATION_KEYS.recebimentoCompra.map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      await refreshAll();
    } catch (err: unknown) {
      console.error("[darEntrada]", err);
      notifyError(err);
    }

    if (entradaOk) {
      // Passa UUID do pedido (não número) para que /fiscal possa pré-vincular
      // com segurança e mostrar breadcrumb de retorno. Ver CONTRACTS.md.
      const params = new URLSearchParams({
        tipo: "entrada",
        pedido_compra_id: String(p.id),
      });
      if (p.fornecedor_id) params.set("fornecedor_id", String(p.fornecedor_id));
      // Drawer fecha por desmontagem natural ao navegar.
      navigate(`/fiscal?${params.toString()}`);
    }
  };

  const {
    solicitarAprovacao,
    aprovarPedido,
    rejeitarPedido,
    marcarEnviado,
    cancelarPedido,
    deleteSelected,
  } = useCompraLifecycle({ refreshAll, setDrawerOpen, selected });

  return {
    pedidos,
    fornecedoresAtivos,
    fornecedorOptions,
    produtosOptionsData,
    formasPagamento: formasPagamentoRaw,
    loading,
    fornecedoresLoading,
    produtosLoading,
    statusLabels,
    kpis,
    form,
    setForm,
    items,
    setItems,
    saving,
    mode,
    selected,
    viewItems,
    viewEstoque,
    viewFinanceiro,
    viewCotacao,
    refreshAll,
    openCreate,
    openEdit,
    openView,
    handleSubmit,
    darEntrada,
    marcarEnviado,
    cancelarPedido,
    solicitarAprovacao,
    aprovarPedido,
    rejeitarPedido,
    deleteSelected,
    setSelected,
    modalOpen,
    setModalOpen,
    drawerOpen,
    setDrawerOpen,
  };
}
