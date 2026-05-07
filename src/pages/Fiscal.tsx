import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OriginContextBanner } from "@/components/navigation/OriginContextBanner";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import { listCartoesAtivos, type CartaoCredito } from "@/services/cartoesCredito.service";
import { calcularFaturaParaData } from "@/lib/cartaoFatura";
import { SummaryCard } from "@/components/SummaryCard";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { ItemsGrid, type GridItem } from "@/components/ui/ItemsGrid";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { supabase } from "@/integrations/supabase/client";
import { MonthPicker } from "@/components/filters/MonthPicker";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { formatCurrency, formatDate } from "@/lib/format";
import { calcularTotalNF } from "@/lib/fiscal";
import { FileText, DollarSign, CheckCircle, Clock, ArrowLeftRight, MoreVertical, Eye, Edit as EditIcon, XCircle as XCircleIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useCan } from "@/hooks/useCan";
import { NotaFiscalDrawer } from "@/components/fiscal/NotaFiscalDrawer";
import {
  registrarEventoFiscal,
  cancelarNotaFiscal,
  listOrdensVendaParaFiscal,
  listContasContabeisLancaveis,
  getPedidoCompraResumo,
  listNotaFiscalItensCompletos,
  getEmpresaConfigPrincipal,
  upsertNotaFiscalComItens,
} from "@/services/fiscal.service";
import {
  useConfirmarNotaFiscal,
  useEstornarNotaFiscal,
} from "@/pages/fiscal/hooks/useNotaFiscalLifecycle";
import { useNFeXmlImport } from "@/pages/fiscal/hooks/useNFeXmlImport";
import type { TraducaoLinha } from "@/pages/fiscal/hooks/useNFeXmlImport";
import { useFiscalFilters } from "@/pages/fiscal/hooks/useFiscalFilters";
import { useFiscalKpis } from "@/pages/fiscal/hooks/useFiscalKpis";
import { TraducaoXmlDrawer } from "@/pages/fiscal/components/TraducaoXmlDrawer";
import { BuscarPorChaveDialog } from "@/pages/fiscal/components/BuscarPorChaveDialog";
import { FiscalChaveScannerDialog } from "@/pages/fiscal/components/FiscalChaveScannerDialog";
import { FiscalToolbarActions } from "@/pages/fiscal/components/FiscalToolbarActions";
import { FiscalDanfeViewer, type FiscalDanfeViewerHandle } from "@/pages/fiscal/components/FiscalDanfeViewer";
import { FiscalDevolucaoFlow, type FiscalDevolucaoFlowHandle } from "@/pages/fiscal/components/FiscalDevolucaoFlow";
import { NotaFiscalEditModal } from "@/components/fiscal/NotaFiscalEditModal";
import { useActionLock } from "@/hooks/useActionLock";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useInvalidateAfterMutation } from "@/hooks/useInvalidateAfterMutation";
import { INVALIDATION_KEYS } from "@/services/_invalidationKeys";
import {
  canConfirmFiscal,
  canEstornarFiscal,
  fiscalInternalStatusOptions,
  fiscalSefazStatusOptions,
  getFiscalInternalStatus,
  getFiscalSefazStatus,
} from "@/lib/fiscalStatus";
import { FiscalInternalStatusBadge, FiscalSefazStatusBadge } from "@/components/fiscal/FiscalStatusBadges";
import type { NotaFiscal as NotaFiscalDomain } from "@/types/domain";
import { CertificadoValidadeAlert } from "@/components/fiscal/CertificadoValidadeAlert";
import { logger } from "@/lib/logger";
import { QuickAddProductModal } from "@/components/QuickAddProductModal";
import { QuickAddSupplierModal } from "@/components/QuickAddSupplierModal";
import { NfeCreateFormModal } from "@/pages/fiscal/components/NfeCreateFormModal";

/**
 * Tipo canônico re-exportado de @/types/domain para preservar compat. local.
 * Centralização: Fase 3 do roadmap fiscal.
 */
export type NotaFiscal = NotaFiscalDomain;

interface FiscalForm {
  tipo: string;
  numero: string;
  serie: string;
  chave_acesso: string;
  data_emissao: string;
  fornecedor_id: string;
  cliente_id: string;
  valor_total: number;
  status: string;
  observacoes: string;
  movimenta_estoque: boolean;
  gera_financeiro: boolean;
  forma_pagamento: string;
  condicao_pagamento: string;
  ordem_venda_id: string;
  conta_contabil_id: string;
  modelo_documento: string;
  cartao_id: string;
  frete_valor: number;
  icms_valor: number;
  ipi_valor: number;
  pis_valor: number;
  cofins_valor: number;
  icms_st_valor: number;
  desconto_valor: number;
  outras_despesas: number;
  origem: string;
  [key: string]: string | number | boolean;
}

const emptyForm: FiscalForm = {
  tipo: "entrada", numero: "", serie: "1", chave_acesso: "", data_emissao: new Date().toISOString().split("T")[0],
  fornecedor_id: "", cliente_id: "", valor_total: 0, status: "pendente", observacoes: "",
  movimenta_estoque: true, gera_financeiro: true, forma_pagamento: "", condicao_pagamento: "a_vista",
  ordem_venda_id: "", conta_contabil_id: "", modelo_documento: "55", cartao_id: "",
  frete_valor: 0, icms_valor: 0, ipi_valor: 0, pis_valor: 0, cofins_valor: 0,
  icms_st_valor: 0, desconto_valor: 0, outras_despesas: 0, origem: "manual",
};

const modeloLabels: Record<string, string> = {
  '55': 'NF-e', '65': 'NFC-e', '57': 'CT-e', '67': 'CT-e OS', 'nfse': 'NFS-e', 'outro': 'Outro'
};

const origemLabels: Record<string, string> = { manual: "Manual", pedido: "Pedido", importacao_xml: "Importação XML" };

interface FornecedorRef { id: string; nome_razao_social: string; cpf_cnpj: string | null; }
interface ClienteRef { id: string; nome_razao_social: string; cpf_cnpj: string | null; }
interface ProdutoRef { id: string; nome: string; sku: string | null; codigo_interno: string | null; unidade_medida: string | null; variacoes: string[] | null; }
interface OrdemVendaRef { id: string; numero: string; clientes?: { nome_razao_social: string } | null; }
interface ContaContabilRef { id: string; codigo: string; descricao: string; }
interface NfItemRow {
  id: string; produto_id: string; quantidade: number; valor_unitario: number;
  conta_contabil_id: string | null; cfop: string | null; cst: string | null;
  ncm: string | null; unidade: string | null; descricao: string | null;
  icms_valor: number | null; icms_aliquota: number | null; icms_base: number | null;
  ipi_valor: number | null; ipi_aliquota: number | null;
  pis_valor: number | null; pis_aliquota: number | null; base_pis: number | null;
  cofins_valor: number | null; cofins_aliquota: number | null; base_cofins: number | null;
  valor_st: number | null; base_st: number | null;
  csosn: string | null; cst_pis: string | null; cst_cofins: string | null; cst_ipi: string | null;
  desconto: number | null; codigo_produto: string | null;
  produtos?: { nome: string; sku: string } | null;
}

/** Fiscal fields preserved per item index across edits. */
interface NfItemFiscalData {
  cfop?: string | null; cst?: string | null; ncm?: string | null; unidade?: string | null;
  descricao?: string | null; icms_valor?: number | null; icms_aliquota?: number | null;
  icms_base?: number | null; ipi_valor?: number | null; ipi_aliquota?: number | null;
  pis_valor?: number | null; pis_aliquota?: number | null; base_pis?: number | null;
  cofins_valor?: number | null; cofins_aliquota?: number | null; base_cofins?: number | null;
  valor_st?: number | null; base_st?: number | null;
  csosn?: string | null; cst_pis?: string | null; cst_cofins?: string | null;
  cst_ipi?: string | null; desconto?: number | null; codigo_produto?: string | null;
}

interface DevolucaoItem extends NfItemRow { qtd_devolver: number; nome: string; }

const Fiscal = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { can } = useCan();
  const canEstornarNF = can("faturamento_fiscal:cancelar") || can("faturamento_fiscal:admin_fiscal");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, loading, remove, fetchData } = useSupabaseCrud<NotaFiscal>({
    table: "notas_fiscais", select: "*, fornecedores(nome_razao_social, cpf_cnpj), clientes(nome_razao_social), ordens_venda(numero)"
  });
  const fornecedoresCrud = useSupabaseCrud<FornecedorRef>({ table: "fornecedores" });
  const clientesCrud = useSupabaseCrud<ClienteRef>({ table: "clientes" });
  const produtosCrud = useSupabaseCrud<ProdutoRef>({ table: "produtos" });
  const [ordensVenda, setOrdensVenda] = useState<OrdemVendaRef[]>([]);
  const [contasContabeis, setContasContabeis] = useState<ContaContabilRef[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<NotaFiscal | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState({ ...emptyForm });
  const [items, setItems] = useState<GridItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [parcelas, setParcelas] = useState(1);
  const [primeiroVencimento, setPrimeiroVencimento] = useState<string>("");
  const [intervaloDias, setIntervaloDias] = useState<number>(30);
  const [parcelasPlano, setParcelasPlano] = useState<import("@/pages/fiscal/components/ParcelasFiscalEditor").ParcelaPlano[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [itemContaContabil, setItemContaContabil] = useState<Record<number, string>>({});
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const [buscarChaveOpen, setBuscarChaveOpen] = useState(false);
  const [buscarChaveInicial, setBuscarChaveInicial] = useState<string | undefined>(undefined);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [danfeOpen, setDanfeOpen] = useState(false);
  const [danfeData, setDanfeData] = useState<Record<string, unknown> | null>(null);
  const [vencimentoNotaIds, setVencimentoNotaIds] = useState<Set<string> | null>(null);
  const [itemFiscalData, setItemFiscalData] = useState<Record<number, NfItemFiscalData>>({});
  // Tradução XML — etapa explícita de mapeamento entre o XML do fornecedor e o cadastro interno.
  const [traducaoLinhas, setTraducaoLinhas] = useState<TraducaoLinha[]>([]);
  const [traducaoOpen, setTraducaoOpen] = useState(false);
  const [traducaoReadOnly, setTraducaoReadOnly] = useState(false);
  /** Snapshot do resultado do XML aguardando confirmação da tradução (quando há pendência). */
  const [pendingXmlImport, setPendingXmlImport] = useState<{
    nfe: import("@/lib/nfeXmlParser").NFeData;
    fornecedorId: string;
    fornecedorNome: string;
    fiscalMap: Record<number, NfItemFiscalData>;
  } | null>(null);
  /** True quando a NF aberta no modal foi originada de um XML — controla o banner. */
  const [xmlOriginInfo, setXmlOriginInfo] = useState<{
    fornecedorId: string;
    fornecedorNome: string;
    cobranca?: import("@/lib/nfeXmlParser").NFeCobranca;
  } | null>(null);
  // Quick-add disparado a partir do drawer de tradução XML
  const [quickProdutoLinhaIdx, setQuickProdutoLinhaIdx] = useState<number | null>(null);
  const [quickProdutoNome, setQuickProdutoNome] = useState("");
  // Quick-add de fornecedor a partir do XML (emitente não cadastrado)
  const [quickFornecedorOpen, setQuickFornecedorOpen] = useState(false);
  const [quickFornecedorDefaults, setQuickFornecedorDefaults] = useState<{
    nome_razao_social?: string;
    cpf_cnpj?: string;
    email?: string;
    telefone?: string;
  }>({});
  // Devolução
  const [devolucaoModalOpen, setDevolucaoModalOpen] = useState(false);
  const [devolucaoNF, setDevolucaoNF] = useState<NotaFiscal | null>(null);
  const [devolucaoItens, setDevolucaoItens] = useState<DevolucaoItem[]>([]);

  const valorProdutos = items.reduce((s, i) => s + (i.valor_total || 0), 0);
  // Total da NF: ICMS, PIS e COFINS são impostos "por dentro" (já embutidos no
  // valor do produto) e NÃO devem ser somados. Apenas ICMS-ST e IPI acrescem
  // ao total da nota — junto com frete e outras despesas; desconto subtrai.
  // Regra unificada em calcularTotalNF.
  const totalImpostos =
    Number(form.ipi_valor || 0) + Number(form.icms_st_valor || 0);
  const totalNF = calcularTotalNF(
    valorProdutos,
    Number(form.desconto_valor || 0),
    Number(form.icms_st_valor || 0),
    Number(form.ipi_valor || 0),
    Number(form.frete_valor || 0),
    Number(form.outras_despesas || 0),
  );

  useEffect(() => {
    const load = async () => {
      const [ovs, contas, cs] = await Promise.all([
        listOrdensVendaParaFiscal(),
        listContasContabeisLancaveis(),
        listCartoesAtivos().catch(() => []),
      ]);
      setOrdensVenda(ovs);
      setContasContabeis(contas);
      setCartoes(cs);
    };
    load();
  }, []);

  const confirmarLock = useActionLock();
  const estornarLock = useActionLock();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const invalidate = useInvalidateAfterMutation();
  const confirmarMutation = useConfirmarNotaFiscal();
  const estornarMutation = useEstornarNotaFiscal();
  const { importXml } = useNFeXmlImport({
    fornecedores: fornecedoresCrud.data,
    produtos: produtosCrud.data,
  });

  // Contexto de origem vindo da URL (ex.: redirect de Pedido de Compra após receber).
  const pedidoCompraOriginId = searchParams.get("pedido_compra_id");
  const fornecedorOriginId = searchParams.get("fornecedor_id");
  const tipoOriginParam = searchParams.get("tipo");
  const [originPedidoNumero, setOriginPedidoNumero] = useState<string | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const openCreate = () => { setMode("create"); setForm({ ...emptyForm }); setItems([]); setSelected(null); setParcelas(1); setItemContaContabil({}); setItemFiscalData({}); setXmlOriginInfo(null); setTraducaoLinhas([]); setModalOpen(true); };

  // Atalho rápido: ?new=1 abre o formulário de emissão.
  useEffect(() => {
    if (autoOpened) return;
    if (searchParams.get("new") !== "1") return;
    setAutoOpened(true);
    openCreate();
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- atalho ?new=1 one-shot; openCreate/setSearchParams capturados via closure
  }, [searchParams, autoOpened]);

  // Deep-link `/fiscal?nf=:id` — abre o NotaFiscalDrawer da nota indicada.
  // Substitui a antiga rota /fiscal/:id (FiscalDetail), agora deprecada (D-2).
  useEffect(() => {
    const nfId = searchParams.get("nf");
    if (!nfId || loading) return;
    const found = data.find((n) => n.id === nfId);
    if (!found) return;
    setSelected(found);
    setDrawerOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("nf");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot via querystring
  }, [searchParams, data, loading]);

  // Auto-abre o modal de NF de entrada pré-preenchida quando vem de PC.
  useEffect(() => {
    if (autoOpened || !pedidoCompraOriginId || tipoOriginParam !== "entrada") return;
    let cancelled = false;
    (async () => {
      const pc = await getPedidoCompraResumo(pedidoCompraOriginId).catch(() => null);
      if (cancelled) return;
      setOriginPedidoNumero(pc?.numero ?? null);
      setMode("create");
      setForm({
        ...emptyForm,
        tipo: "entrada",
        fornecedor_id: fornecedorOriginId || pc?.fornecedor_id || "",
        observacoes: pc?.numero ? `Recebimento do Pedido de Compra ${pc.numero}` : "",
      });
      setItems([]);
      setSelected(null);
      setParcelas(1);
      setItemContaContabil({});
      setItemFiscalData({});
      setModalOpen(true);
      setAutoOpened(true);
    })();
    return () => { cancelled = true; };
  }, [pedidoCompraOriginId, fornecedorOriginId, tipoOriginParam, autoOpened]);

  const openEdit = async (n: NotaFiscal) => {
    // Mobile: form com itens dinâmicos não cabe em modal — navegar para página dedicada.
    // Alinha com mem://produto/quando-drawer-quando-pagina.
    if (isMobile) {
      navigate(`/fiscal/${n.id}/editar`);
      return;
    }
    setMode("edit"); setSelected(n);
    setForm({
      tipo: n.tipo, numero: n.numero, serie: n.serie || "1", chave_acesso: n.chave_acesso || "",
      data_emissao: n.data_emissao, fornecedor_id: n.fornecedor_id || "", cliente_id: n.cliente_id || "",
      valor_total: n.valor_total, status: n.status, observacoes: n.observacoes || "",
      movimenta_estoque: n.movimenta_estoque !== false, gera_financeiro: n.gera_financeiro !== false,
      forma_pagamento: n.forma_pagamento || "", condicao_pagamento: n.condicao_pagamento || "a_vista",
      ordem_venda_id: n.ordem_venda_id || "", conta_contabil_id: n.conta_contabil_id || "",
      modelo_documento: n.modelo_documento || "55",
      cartao_id: (n as { cartao_id?: string | null }).cartao_id || "",
      frete_valor: n.frete_valor || 0, icms_valor: n.icms_valor || 0, ipi_valor: n.ipi_valor || 0,
      pis_valor: n.pis_valor || 0, cofins_valor: n.cofins_valor || 0, icms_st_valor: n.icms_st_valor || 0,
      desconto_valor: n.desconto_valor || 0, outras_despesas: n.outras_despesas || 0,
      origem: n.origem || "manual",
    });
    const itens = await listNotaFiscalItensCompletos(n.id).catch(() => []);
    const itensTyped = itens as unknown as NfItemRow[];
    const loadedItems = itensTyped.map((i) => ({
      id: i.id, produto_id: i.produto_id, codigo: i.produtos?.sku || "",
      descricao: i.produtos?.nome || "", quantidade: i.quantidade,
      valor_unitario: i.valor_unitario, valor_total: i.quantidade * i.valor_unitario,
    }));
    setItems(loadedItems);
    const contaMap: Record<number, string> = {};
    const fiscalMap: Record<number, NfItemFiscalData> = {};
    itensTyped.forEach((i, idx) => {
      if (i.conta_contabil_id) contaMap[idx] = i.conta_contabil_id;
      fiscalMap[idx] = {
        cfop: i.cfop, cst: i.cst, ncm: i.ncm, unidade: i.unidade,
        descricao: i.descricao, icms_valor: i.icms_valor, icms_aliquota: i.icms_aliquota,
        icms_base: i.icms_base, ipi_valor: i.ipi_valor, ipi_aliquota: i.ipi_aliquota,
        pis_valor: i.pis_valor, pis_aliquota: i.pis_aliquota, base_pis: i.base_pis,
        cofins_valor: i.cofins_valor, cofins_aliquota: i.cofins_aliquota, base_cofins: i.base_cofins,
        valor_st: i.valor_st, base_st: i.base_st,
        csosn: i.csosn, cst_pis: i.cst_pis, cst_cofins: i.cst_cofins, cst_ipi: i.cst_ipi,
        desconto: i.desconto, codigo_produto: i.codigo_produto,
      };
    });
    setItemContaContabil(contaMap);
    setItemFiscalData(fiscalMap);
    setModalOpen(true);
  };

  const openView = (n: NotaFiscal) => {
    setSelected(n);
    setDrawerOpen(true);
  };

  const openDanfe = async (n: NotaFiscal) => {
    const [itens, empresa] = await Promise.all([
      listNotaFiscalItensCompletos(n.id).catch(() => []),
      getEmpresaConfigPrincipal().catch(() => null),
    ]);
    setDanfeData({
      numero: n.numero, serie: n.serie, chave_acesso: n.chave_acesso,
      data_emissao: n.data_emissao, tipo: n.tipo, status: n.status,
      emitente: n.tipo === "saida" && empresa ? { nome: empresa.razao_social, cnpj: empresa.cnpj, endereco: empresa.logradouro, cidade: empresa.cidade, uf: empresa.uf } : (n.fornecedores ? { nome: n.fornecedores.nome_razao_social, cnpj: n.fornecedores.cpf_cnpj } : undefined),
      destinatario: n.tipo === "saida" && n.clientes ? { nome: n.clientes.nome_razao_social } : (empresa ? { nome: empresa.razao_social, cnpj: empresa.cnpj } : undefined),
      itens: (itens as unknown as NfItemRow[]).map((i) => ({ descricao: i.produtos?.nome || "", quantidade: i.quantidade, valor_unitario: i.valor_unitario, cfop: i.cfop, cst: i.cst, icms_valor: i.icms_valor, ipi_valor: i.ipi_valor, pis_valor: i.pis_valor, cofins_valor: i.cofins_valor })),
      valor_total: n.valor_total, frete_valor: n.frete_valor, icms_valor: n.icms_valor,
      ipi_valor: n.ipi_valor, pis_valor: n.pis_valor, cofins_valor: n.cofins_valor,
      desconto_valor: n.desconto_valor, outras_despesas: n.outras_despesas,
      observacoes: n.observacoes, forma_pagamento: n.forma_pagamento, condicao_pagamento: n.condicao_pagamento,
    });
    setDanfeOpen(true);
  };

  const handleConfirmar = async (nf: NotaFiscal) => {
    if (!canConfirmFiscal(nf.status)) {
      toast.error(`NF ${nf.numero} não está em estado confirmável.`);
      return;
    }
    const ok = await confirm({
      title: "Confirmar nota fiscal",
      description: `Ao confirmar a NF ${nf.numero}, o ERP registrará efeitos operacionais (estoque) e financeiros conforme a configuração da nota.`,
      confirmLabel: "Confirmar e processar",
      confirmVariant: "default",
    });
    if (!ok) return;
    await confirmarLock.run(async () => {
      try {
        await confirmarMutation.mutateAsync(nf.id);
        toast.success(`NF ${nf.numero} confirmada com sucesso. Impactos operacionais aplicados.`);
        fetchData();
        // Invalidação cross-módulo: outros módulos abertos em background
        // (Estoque, Financeiro, Pedidos) refletem a mudança imediatamente.
        await invalidate(INVALIDATION_KEYS.fiscalLifecycle);
      } catch (err: unknown) {
        logger.error('[fiscal] confirmar NF:', err);
        notifyError(err);
      }
    });
  };

  const handleEstornar = async (nf: NotaFiscal) => {
    if (!canEstornarFiscal(nf.status)) {
      toast.error(`NF ${nf.numero} não está em estado estornável.`);
      return;
    }
    const ok = await confirm({
      title: "Estornar nota fiscal",
      description: `Estorno da NF ${nf.numero}: o sistema reverterá os movimentos de estoque, cancelará lançamentos financeiros e recalculará faturamento vinculado.`,
      confirmLabel: "Estornar",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    await estornarLock.run(async () => {
      try {
        await estornarMutation.mutateAsync({ nfId: nf.id });
        toast.success(`NF ${nf.numero} estornada! Estoque e financeiro revertidos.`);
        fetchData();
        await invalidate(INVALIDATION_KEYS.fiscalLifecycle);
      } catch (err: unknown) {
        logger.error('[fiscal] estornar NF:', err);
        notifyError(err);
      }
    });
  };

  const handleCancelarRascunho = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: "Cancelar rascunho",
      description: `Cancelar o rascunho da NF ${selected.numero}? Esta ação não pode ser desfeita.`,
      confirmLabel: "Cancelar rascunho",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    try {
      // Usa RPC canônica `cancelar_nota_fiscal`: respeita máquina de estados,
      // estorna efeitos quando necessário e registra evento dentro da transação.
      await cancelarNotaFiscal(selected.id, `Rascunho da NF ${selected.numero} cancelado pelo usuário.`);
      toast.success("Rascunho inativado com sucesso.");
      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      logger.error('[fiscal] cancelar rascunho:', err);
      notifyError(err);
    }
  };

  const buildNfItemsPayload = (nfId: string) => items.map((i, idx) => {
    if (!i.produto_id) {
      throw new Error(`Item ${idx + 1} sem vínculo de produto. Vincule todos os itens antes de salvar.`);
    }
    const fiscal = itemFiscalData[idx] || {};
    // Tradução XML: se a NF veio de XML, gravar XML cru em *_origem (verdade fiscal)
    // e o match_status. Os campos quantidade/valor_unitario/unidade já são os internos convertidos.
    const traducao = traducaoLinhas.find((t) => t.index === idx);
    return {
      nota_fiscal_id: nfId,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      valor_unitario: i.valor_unitario,
      conta_contabil_id: itemContaContabil[idx] || null,
      cfop: fiscal.cfop ?? null,
      cst: fiscal.cst ?? null,
      ncm: fiscal.ncm ?? null,
      unidade: fiscal.unidade ?? null,
      descricao: fiscal.descricao ?? i.descricao ?? null,
      icms_valor: fiscal.icms_valor ?? null,
      icms_aliquota: fiscal.icms_aliquota ?? null,
      icms_base: fiscal.icms_base ?? null,
      ipi_valor: fiscal.ipi_valor ?? null,
      ipi_aliquota: fiscal.ipi_aliquota ?? null,
      pis_valor: fiscal.pis_valor ?? null,
      pis_aliquota: fiscal.pis_aliquota ?? null,
      base_pis: fiscal.base_pis ?? null,
      cofins_valor: fiscal.cofins_valor ?? null,
      cofins_aliquota: fiscal.cofins_aliquota ?? null,
      base_cofins: fiscal.base_cofins ?? null,
      valor_st: fiscal.valor_st ?? null,
      base_st: fiscal.base_st ?? null,
      csosn: fiscal.csosn ?? null,
      cst_pis: fiscal.cst_pis ?? null,
      cst_cofins: fiscal.cst_cofins ?? null,
      cst_ipi: fiscal.cst_ipi ?? null,
      desconto: fiscal.desconto ?? null,
      codigo_produto: fiscal.codigo_produto ?? i.codigo ?? null,
      // XML cru preservado quando há tradução associada.
      codigo_produto_origem: traducao?.xmlCodigo ?? null,
      descricao_produto_origem: traducao?.xmlDescricao ?? null,
      unidade_origem: traducao?.xmlUnidade ?? null,
      quantidade_origem: traducao?.xmlQuantidade ?? null,
      valor_unitario_origem: traducao?.xmlValorUnitario ?? null,
      valor_total_origem: traducao?.xmlValorTotal ?? null,
      match_status: traducao ? (traducao.matchStatus || null) : null,
    };
  });

  const handleSaveAndConfirm = async () => {
    if (!form.numero) { toast.error("Número é obrigatório"); return; }
    if (form.tipo === "entrada" && !form.fornecedor_id) { toast.error("Fornecedor é obrigatório para notas de entrada"); return; }
    if (form.tipo === "saida" && !form.cliente_id) { toast.error("Cliente é obrigatório para notas de saída"); return; }
    if (items.length === 0) { toast.error("Adicione ao menos um item antes de confirmar"); return; }
    const unlinkedCount = items.filter(i => !i.produto_id).length;
    if (unlinkedCount > 0) { toast.error(`${unlinkedCount} item(ns) sem produto vinculado. Vincule todos os itens antes de confirmar.`); return; }
    if (!selected) return;
    setSaving(true);
    try {
      const savedTotal = totalNF || form.valor_total;
      const payload = {
        ...form,
        fornecedor_id: form.fornecedor_id || null,
        cliente_id: form.cliente_id || null,
        ordem_venda_id: form.ordem_venda_id || null,
        conta_contabil_id: form.conta_contabil_id || null,
        valor_total: savedTotal,
      };
      await upsertNotaFiscalComItens({
        mode: "edit",
        nfId: selected.id,
        payload: payload as never,
        itemsBuilder: (nfId) => buildNfItemsPayload(nfId) as never,
      });
      const nfForConfirm = { ...selected, ...payload, valor_total: savedTotal };
      await confirmarMutation.mutateAsync(selected.id);
      toast.success("Nota fiscal salva e confirmada! Estoque e financeiro atualizados.");
      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      logger.error('[fiscal] salvar e confirmar NF:', err);
      notifyError(err);
    }
    setSaving(false);
  };

  /** Aplica o resultado da tradução ao form/items e abre o modal da NF. */
  const aplicarImportacaoXml = (
    nfe: import("@/lib/nfeXmlParser").NFeData,
    fornecedorId: string,
    fornecedorNome: string,
    linhas: TraducaoLinha[],
    fiscalMap: Record<number, NfItemFiscalData>,
  ) => {
    const newItems: GridItem[] = linhas.map((t) => {
      const qtdInterna = t.fatorConversao > 0 ? t.xmlQuantidade * t.fatorConversao : t.xmlQuantidade;
      const vUnInterno = qtdInterna > 0 ? t.xmlValorTotal / qtdInterna : t.xmlValorUnitario;
      const matched = produtosCrud.data.find((p) => p.id === t.produtoId);
      return {
        produto_id: t.produtoId,
        codigo: t.xmlCodigo,
        descricao: matched?.nome || t.xmlDescricao,
        quantidade: qtdInterna,
        valor_unitario: vUnInterno,
        valor_total: t.xmlValorTotal,
      };
    });
    setForm({
      ...emptyForm,
      tipo: "entrada",
      numero: nfe.numero,
      serie: nfe.serie,
      chave_acesso: nfe.chaveAcesso,
      data_emissao: nfe.dataEmissao || new Date().toISOString().split("T")[0],
      fornecedor_id: fornecedorId,
      frete_valor: nfe.valorFrete,
      icms_valor: nfe.icmsTotal,
      ipi_valor: nfe.ipiTotal,
      pis_valor: nfe.pisTotal,
      cofins_valor: nfe.cofinsTotal,
      icms_st_valor: nfe.icmsStTotal,
      desconto_valor: nfe.valorDesconto,
      outras_despesas: nfe.valorOutrasDespesas,
      valor_total: nfe.valorTotal,
      origem: "importacao_xml",
    });
    setItems(newItems);
    setMode("create");
    setSelected(null);
    setItemContaContabil({});
    setItemFiscalData(fiscalMap);
    setTraducaoLinhas(linhas);
    setXmlOriginInfo({ fornecedorId, fornecedorNome, cobranca: nfe.cobranca });
    setModalOpen(true);
  };

  /** Persiste o de-para (produtos_fornecedores) para as linhas marcadas como "salvar tradução". */
  const salvarDeParaFornecedor = async (fornecedorId: string, linhas: TraducaoLinha[]) => {
    const aSalvar = linhas.filter((l) => l.salvarDePara && l.produtoId && l.xmlCodigo);
    if (aSalvar.length === 0 || !fornecedorId) return;
    try {
      const rows = aSalvar.map((l) => ({
        produto_id: l.produtoId,
        fornecedor_id: fornecedorId,
        referencia_fornecedor: l.xmlCodigo,
        descricao_fornecedor: l.xmlDescricao,
        unidade_fornecedor: l.xmlUnidade,
        fator_conversao: l.fatorConversao,
      }));
      // Upsert por (produto_id, fornecedor_id) — chave natural do de-para.
      const { error } = await supabase
        .from("produtos_fornecedores")
        .upsert(rows, { onConflict: "produto_id,fornecedor_id" });
      if (error) throw error;
    } catch (err) {
      logger.error("[fiscal] salvar de-para fornecedor:", err);
      toast.warning("NF importada, mas não foi possível salvar a tradução para o fornecedor.");
    }
  };

  const handleXmlImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await processarXmlImportado(file);
    } catch (err: unknown) {
      logger.error("[fiscal] XML import:", err);
      toast.error(`Erro ao importar XML: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (xmlInputRef.current) xmlInputRef.current.value = "";
  };

  /**
   * Núcleo do fluxo de importação de XML, agnóstico à origem (upload manual
   * ou consulta por chave de acesso). Centralizar aqui evita divergência
   * de UX (traducao drawer, quick-add fornecedor, fluxo de aplicação).
   */
  const processarXmlImportado = async (input: File | string) => {
      const result = await importXml(input);
      if (!result) {
        return;
      }
      const { nfe, fornecedorId, fiscalMap, traducao, traducaoOk } = result;
      const fornecedorNome = fornecedoresCrud.data.find((f) => f.id === fornecedorId)?.nome_razao_social || nfe.emitente.razaoSocial || "—";

      // Sem fornecedor → oferecer cadastro rápido pré-preenchido com dados do XML.
      if (!fornecedorId && nfe.emitente?.cnpj) {
        setQuickFornecedorDefaults({
          nome_razao_social: nfe.emitente.razaoSocial || "",
          cpf_cnpj: nfe.emitente.cnpj,
          email: (nfe.emitente as { email?: string }).email || "",
          telefone: (nfe.emitente as { telefone?: string }).telefone || "",
        });
        // Mantém pendingXmlImport para retomar após cadastro do fornecedor.
        setPendingXmlImport({ nfe, fornecedorId: "", fornecedorNome, fiscalMap: fiscalMap as Record<number, NfItemFiscalData> });
        setTraducaoLinhas(traducao);
        setQuickFornecedorOpen(true);
        toast.info(`Fornecedor ${nfe.emitente.cnpj} não cadastrado. Cadastre rapidamente para continuar.`);
        return;
      }

      if (traducaoOk) {
        // 100% OK → vai direto pro form. Banner permite reabrir em modo somente-leitura.
        aplicarImportacaoXml(nfe, fornecedorId, fornecedorNome, traducao, fiscalMap as Record<number, NfItemFiscalData>);
        toast.success("XML importado. Tradução automática aplicada.");
      } else {
        // Pendência → drawer obrigatório, segura abertura do form.
        setPendingXmlImport({ nfe, fornecedorId, fornecedorNome, fiscalMap: fiscalMap as Record<number, NfItemFiscalData> });
        setTraducaoLinhas(traducao);
        setTraducaoReadOnly(false);
        setTraducaoOpen(true);
      }
  };

  const handleTraducaoConfirm = async (linhas: TraducaoLinha[]) => {
    if (pendingXmlImport) {
      // Fluxo "tinha pendência": agora aplica e abre o form.
      const { nfe, fornecedorId, fornecedorNome, fiscalMap } = pendingXmlImport;
      await salvarDeParaFornecedor(fornecedorId, linhas);
      aplicarImportacaoXml(nfe, fornecedorId, fornecedorNome, linhas, fiscalMap);
      setPendingXmlImport(null);
      setTraducaoOpen(false);
      toast.success("Tradução confirmada. Revise a NF e salve.");
    } else if (xmlOriginInfo) {
      // Reabertura via banner em modo edição (caso usuário queira ajustar): atualiza items e salva de-para.
      await salvarDeParaFornecedor(xmlOriginInfo.fornecedorId, linhas);
      const newItems: GridItem[] = linhas.map((t) => {
        const qtdInterna = t.fatorConversao > 0 ? t.xmlQuantidade * t.fatorConversao : t.xmlQuantidade;
        const vUnInterno = qtdInterna > 0 ? t.xmlValorTotal / qtdInterna : t.xmlValorUnitario;
        const matched = produtosCrud.data.find((p) => p.id === t.produtoId);
        return {
          produto_id: t.produtoId,
          codigo: t.xmlCodigo,
          descricao: matched?.nome || t.xmlDescricao,
          quantidade: qtdInterna,
          valor_unitario: vUnInterno,
          valor_total: t.xmlValorTotal,
        };
      });
      setItems(newItems);
      setTraducaoLinhas(linhas);
      setTraducaoOpen(false);
      toast.success("Tradução atualizada.");
    }
  };

  const handleTraducaoCancel = () => {
    setTraducaoOpen(false);
    if (pendingXmlImport) {
      setPendingXmlImport(null);
      toast.info("Importação de XML cancelada.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero) { toast.error("Número é obrigatório"); return; }
    if (form.tipo === "entrada" && !form.fornecedor_id) { toast.error("Fornecedor é obrigatório para notas de entrada"); return; }
    if (form.tipo === "saida" && !form.cliente_id) { toast.error("Cliente é obrigatório para notas de saída"); return; }
    if (form.forma_pagamento === "cartao_credito" && !form.cartao_id) {
      toast.error("Selecione o cartão de crédito.");
      return;
    }
    const unlinkedCount = items.filter(i => !i.produto_id).length;
    if (unlinkedCount > 0) {
      toast.error(`${unlinkedCount} item(ns) sem produto vinculado. Vincule todos os itens ou remova-os antes de salvar.`);
      return;
    }
    setSaving(true);
    try {
      const savedTotal = totalNF || form.valor_total;
      const planoParcelas = form.condicao_pagamento === "a_prazo" && parcelas > 1 ? parcelasPlano : null;
      const payload = { ...form, fornecedor_id: form.fornecedor_id || null, cliente_id: form.cliente_id || null, ordem_venda_id: form.ordem_venda_id || null, conta_contabil_id: form.conta_contabil_id || null, cartao_id: form.cartao_id || null, valor_total: savedTotal, valor_produtos: valorProdutos, parcelas: planoParcelas };
      const nfId = await upsertNotaFiscalComItens({
        mode: mode === "create" ? "create" : "edit",
        nfId: selected?.id,
        payload: payload as never,
        itemsBuilder: (id) => buildNfItemsPayload(id) as never,
      });
      if (mode === "create") {
        await registrarEventoFiscal({
          nota_fiscal_id: nfId,
          tipo_evento: form.origem === "importacao_xml" ? "importacao_xml" : "criacao",
          status_novo: "pendente",
          descricao: form.origem === "importacao_xml"
            ? `NF ${form.numero} criada via importação de XML.`
            : `NF ${form.numero} criada manualmente.`,
          payload_resumido: { valor_total: savedTotal, itens: items.length },
        });
        // Geração de financeiro a partir das duplicatas do XML (NF-e de entrada).
        if (
          form.tipo === "entrada" &&
          form.origem === "importacao_xml" &&
          xmlOriginInfo?.cobranca?.duplicatas?.length
        ) {
          try {
            const { mapTPagSefaz } = await import("@/lib/financeiro");
            const formaPag = xmlOriginInfo.cobranca.tPag
              ? mapTPagSefaz(xmlOriginInfo.cobranca.tPag)
              : "boleto_dda";
            const { error: rpcErr } = await supabase.rpc("gerar_financeiro_nfe_entrada", {
              p_nota_id: nfId,
              p_duplicatas: xmlOriginInfo.cobranca.duplicatas.map((d) => ({
                numero: d.numero,
                vencimento: d.vencimento,
                valor: d.valor,
              })),
              p_forma_pagamento: formaPag,
              p_cartao_id: form.cartao_id || null,
            } as never);
            if (rpcErr) throw rpcErr;
            toast.success(
              `${xmlOriginInfo.cobranca.duplicatas.length} parcela(s) gerada(s) em Contas a Pagar.`,
            );
          } catch (rpcErr) {
            logger.error("[fiscal] gerar financeiro NFe:", rpcErr);
            toast.warning(
              "NF salva, mas houve falha ao gerar parcelas no financeiro. Lance manualmente.",
            );
          }
        } else if (
          form.tipo === "entrada" &&
          form.origem === "importacao_xml" &&
          !xmlOriginInfo?.cobranca?.duplicatas?.length
        ) {
          toast.info("XML sem duplicatas/condição financeira clara — informe a condição manualmente.");
        } else if (
          form.tipo === "entrada" &&
          form.gera_financeiro &&
          form.forma_pagamento === "cartao_credito" &&
          form.cartao_id
        ) {
          // NF de entrada manual (sem XML) com cartão de crédito → gerar parcelas
          // a partir do plano do editor (ou parcela única se à vista).
          const duplicatas =
            form.condicao_pagamento === "a_prazo" && parcelasPlano.length > 0
              ? parcelasPlano.map((p, i) => ({
                  numero: String(i + 1),
                  vencimento: p.vencimento,
                  valor: p.valor,
                }))
              : [{ numero: "1", vencimento: form.data_emissao, valor: savedTotal }];
          try {
            const { error: rpcErr } = await supabase.rpc("gerar_financeiro_nfe_entrada", {
              p_nota_id: nfId,
              p_duplicatas: duplicatas,
              p_forma_pagamento: "cartao_credito",
              p_cartao_id: form.cartao_id,
            } as never);
            if (rpcErr) throw rpcErr;
            toast.success(`${duplicatas.length} parcela(s) lançada(s) na fatura do cartão.`);
          } catch (rpcErr) {
            logger.error("[fiscal] gerar financeiro cartao:", rpcErr);
            toast.warning("NF salva, mas houve falha ao gerar parcelas no cartão.");
          }
        }
      } else if (selected) {
        await registrarEventoFiscal({
          nota_fiscal_id: selected.id,
          tipo_evento: "edicao",
          descricao: `NF ${form.numero} editada. Novo total: R$ ${savedTotal.toFixed(2)}.`,
          payload_resumido: { valor_total: savedTotal, itens: items.length },
        });
      }
      toast.success("Nota fiscal salva!"); setModalOpen(false); fetchData();
    } catch (err: unknown) { logger.error('[fiscal] salvar NF:', err); notifyError(err); }
    setSaving(false);
  };

  const openDevolucao = async (nf: NotaFiscal) => {
    const itens = await listNotaFiscalItensCompletos(nf.id).catch(() => []);
    setDevolucaoNF(nf);
    setDevolucaoItens((itens as unknown as NfItemRow[]).map((i) => ({ ...i, qtd_devolver: 0, nome: i.produtos?.nome || "—" })));
    setDevolucaoModalOpen(true);
  };

  const handleInativar = async (nfId: string) => {
    const nf = data.find((item) => item.id === nfId);
    if (!nf) return;
    if (!canConfirmFiscal(nf.status)) {
      toast.error("Inativação permitida apenas para notas em preparação (rascunho/pendente).");
      return;
    }
    const ok = await confirm({
      title: "Inativar rascunho fiscal",
      description: `A NF ${nf.numero} será inativada no ERP. Esta ação não cancela eventos na SEFAZ.`,
      confirmLabel: "Inativar",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    try {
      // Unifica com FiscalDetail: usa RPC canônica em vez de DELETE físico.
      await cancelarNotaFiscal(nfId, `NF ${nf.numero} inativada via grid.`);
      toast.success(`NF ${nf.numero} inativada.`);
      fetchData();
    } catch (err: unknown) {
      logger.error('[fiscal] inativar NF:', err);
      notifyError(err);
    }
  };

  const tipoParam = searchParams.get("tipo");
  // Drill-down from Dashboard: ?status=rascunho or ?status=pendente,rascunho.
  const statusUrlParam = searchParams.get("status");
  const statusFromUrl = useMemo(
    () => (statusUrlParam ? statusUrlParam.split(",").map((s) => s.trim()).filter(Boolean) : []),
    [statusUrlParam],
  );

  // Filtros, busca e chips encapsulados em hook (Fase 6 — refatoração Fiscal).
  const {
    filteredData,
    activeFilterChips: fiscalActiveFilters,
    consultaSearch,
    setConsultaSearch,
    tipoFilters,
    setTipoFilters,
    modeloFilters,
    setModeloFilters,
    statusFilters,
    setStatusFilters,
    origemFilters,
    setOrigemFilters,
    statusSefazFilters,
    setStatusSefazFilters,
    emissaoMes,
    setEmissaoMes,
    vencimentoMes,
    setVencimentoMes,
    removeFilter: handleRemoveFiscalFilter,
  } = useFiscalFilters(data, {
    tipoFromUrl: tipoParam,
    statusFromUrl,
    vencimentoNotaIds,
  });

  // Carrega IDs de notas com lançamentos vencendo no mês selecionado.
  useEffect(() => {
    if (!vencimentoMes) {
      setVencimentoNotaIds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const start = vencimentoMes + "-01";
      const [y, m] = vencimentoMes.split("-").map(Number);
      const endDate = new Date(y, m, 0);
      const end = endDate.toISOString().slice(0, 10);
      const { data: rows, error } = await supabase
        .from("financeiro_lancamentos")
        .select("nota_fiscal_id")
        .eq("ativo", true)
        .not("nota_fiscal_id", "is", null)
        .gte("data_vencimento", start)
        .lte("data_vencimento", end);
      if (cancelled) return;
      if (error) {
        setVencimentoNotaIds(new Set());
        return;
      }
      const set = new Set<string>();
      (rows || []).forEach((r) => {
        if (r.nota_fiscal_id) set.add(r.nota_fiscal_id as string);
      });
      setVencimentoNotaIds(set);
    })();
    return () => { cancelled = true; };
  }, [vencimentoMes]);

  // KPIs — agora vêm da RPC `kpis_fiscal`, refletindo o universo total filtrado
  // server-side (não apenas os 1000 primeiros que o hook traz). Isso garante
  // que cards continuem corretos quando a paginação real for ativada.
  const kpisDateRange = useMemo(() => {
    if (!emissaoMes) return { dateFrom: null as string | null, dateTo: null as string | null };
    const start = `${emissaoMes}-01`;
    const [y, m] = emissaoMes.split("-").map(Number);
    const end = new Date(y, m, 0).toISOString().slice(0, 10);
    return { dateFrom: start, dateTo: end };
  }, [emissaoMes]);

  const { data: kpisRpc } = useFiscalKpis({
    dateFrom: kpisDateRange.dateFrom,
    dateTo: kpisDateRange.dateTo,
    tipos: tipoParam ? [tipoParam] : (tipoFilters.length ? tipoFilters : null),
    status: statusFromUrl.length ? statusFromUrl : (statusFilters.length ? statusFilters : null),
    modelos: modeloFilters.length ? modeloFilters : null,
    search: consultaSearch || null,
  });

  const kpis = useMemo(
    () => ({
      total: kpisRpc?.totalCount ?? 0,
      pendentes: kpisRpc?.pendente ?? 0,
      confirmadas: kpisRpc?.confirmadas_efetivas ?? 0,
      valorTotal: kpisRpc?.total_valor ?? 0,
    }),
    [kpisRpc],
  );

  const tipoOptions: MultiSelectOption[] = [{ label: "Entrada", value: "entrada" }, { label: "Saída", value: "saida" }];
  const modeloOptions: MultiSelectOption[] = Object.entries(modeloLabels).map(([v, l]) => ({ label: l, value: v }));
  const statusOptions: MultiSelectOption[] = fiscalInternalStatusOptions.map((value) => ({
    value,
    label: getFiscalInternalStatus(value).label,
  }));
  const origemOptions: MultiSelectOption[] = Object.entries(origemLabels).map(([v, l]) => ({ label: l, value: v }));
  const statusSefazOptions: MultiSelectOption[] = fiscalSefazStatusOptions.map((value) => ({
    value,
    label: getFiscalSefazStatus(value).label,
  }));

  const tipoConfig = tipoParam === "entrada"
    ? { title: "Notas de Entrada", subtitle: "Central de conferência e recebimento fiscal", addLabel: "Nova NF de Entrada", moduleKey: "notas-entrada", parceiroLabel: "Fornecedor" }
    : tipoParam === "saida"
    ? { title: "Notas de Saída", subtitle: "Notas fiscais de saída e faturamento", addLabel: "Nova NF de Saída", moduleKey: "notas-saida", parceiroLabel: "Cliente" }
    : { title: "Fiscal", subtitle: "Notas fiscais, faturas e documentos", addLabel: "Nova NF", moduleKey: "notas-fiscais", parceiroLabel: "Parceiro" };

  // Em mobile, exibe ERP + SEFAZ empilhados como sub-pill no header do card (statusBadge).
  const renderFiscalStatus = (n: NotaFiscal) =>
    isMobile ? (
      <div className="flex flex-col items-end gap-1">
        <FiscalInternalStatusBadge status={n.status} />
        <FiscalSefazStatusBadge status={n.status_sefaz || "nao_enviada"} className="text-[10px] px-1.5 py-0" />
      </div>
    ) : (
      <FiscalInternalStatusBadge status={n.status} />
    );

  const parceiroLabel = tipoConfig.parceiroLabel;

  const columns = [
    {
      key: "numero",
      label: "Nº Nota",
      render: (n: NotaFiscal) => (
        <span className="font-mono text-sm font-bold text-primary">{n.numero}</span>
      ),
    },
    {
      key: "parceiro",
      label: parceiroLabel,
      render: (n: NotaFiscal) => {
        // Devolução de saída: NF de entrada gerada a partir de uma saída.
        // It carries cliente_id (not fornecedor_id), so we resolve correctly.
        const nome =
          n.tipo === "entrada" && n.tipo_operacao === "devolucao" && n.clientes?.nome_razao_social
            ? n.clientes.nome_razao_social
            : n.tipo === "entrada"
            ? n.fornecedores?.nome_razao_social || "—"
            : n.clientes?.nome_razao_social || "—";
        return <span className="font-medium">{nome}</span>;
      },
    },
    {
      key: "data_emissao",
      label: "Emissão",
      sortable: true,
      render: (n: NotaFiscal) => formatDate(n.data_emissao),
    },
    {
      key: "status",
      label: "Status ERP",
      render: renderFiscalStatus,
    },
    {
      key: "valor_total",
      label: "Total",
      sortable: true,
      render: (n: NotaFiscal) => (
        <span className="font-semibold font-mono">{formatCurrency(Number(n.valor_total))}</span>
      ),
    },
    {
      key: "tipo",
      label: "Tipo",
      hidden: !!tipoParam,
      render: (n: NotaFiscal) => n.tipo === "entrada" ? "Entrada" : "Saída",
    },
    {
      key: "serie",
      label: "Série",
      hidden: true,
      render: (n: NotaFiscal) => (
        <span className="font-mono text-xs text-muted-foreground">{n.serie || "1"}</span>
      ),
    },
    {
      key: "modelo",
      label: "Modelo",
      // U1: modelo é informação chave em página que mistura NF-e/NFC-e/CT-e/NFS-e.
      render: (n: NotaFiscal) => (
        <span className="text-xs font-mono font-medium">{modeloLabels[n.modelo_documento || "55"] || n.modelo_documento}</span>
      ),
    },
    {
      key: "operacao",
      label: "Operação",
      // U2: visibilidade de devolução vs operação normal sem precisar abrir a NF.
      render: (n: NotaFiscal) => {
        if ((n.tipo_operacao || "normal") === "devolucao")
          return <span className="text-xs text-warning font-medium">Devolução</span>;
        return <span className="text-xs text-muted-foreground">Normal</span>;
      },
    },
    {
      key: "chave_acesso",
      label: "Chave de Acesso",
      hidden: true,
      render: (n: NotaFiscal) =>
        n.chave_acesso
          ? <span className="font-mono text-xs text-muted-foreground">
              {n.chave_acesso.length > 12 ? `${n.chave_acesso.slice(0, 8)}…${n.chave_acesso.slice(-4)}` : n.chave_acesso}
            </span>
          : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "ov",
      label: "Pedido Vinc.",
      hidden: true,
      render: (n: NotaFiscal) =>
        n.ordens_venda?.numero
          ? <span className="font-mono text-xs">{n.ordens_venda.numero}</span>
          : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "origem",
      label: "Origem",
      hidden: true,
      render: (n: NotaFiscal) => (
        <Badge variant="outline" className="text-xs capitalize">
          {origemLabels[n.origem || "manual"] || n.origem || "Manual"}
        </Badge>
      ),
    },
    {
      key: "status_sefaz",
      label: "Status SEFAZ",
      render: (n: NotaFiscal) => <FiscalSefazStatusBadge status={n.status_sefaz || "nao_enviada"} />,
    },
  ];

  return (
    <><ModulePage title={tipoConfig.title} subtitle={tipoConfig.subtitle} addLabel={tipoConfig.addLabel} onAdd={openCreate}
        addButtonHelpId="fiscal.novoBtn"
        headerActions={
          <FiscalToolbarActions
            ref={xmlInputRef}
            onXmlChange={handleXmlImport}
            onImportClick={() => xmlInputRef.current?.click()}
            onBuscarChaveClick={() => setBuscarChaveOpen(true)}
            onScannerClick={() => setScannerOpen(true)}
          />
        }
      >
        {pedidoCompraOriginId && (
          <OriginContextBanner
            originLabel={
              originPedidoNumero
                ? `Voltar ao Pedido de Compra ${originPedidoNumero}`
                : "Voltar ao Pedido de Compra"
            }
            onBack={() => navigate(`/pedidos-compra?drawer=pedido_compra:${pedidoCompraOriginId}`)}
            description="Vinculando NF de entrada deste pedido"
          />
        )}
        <CertificadoValidadeAlert />
        <div data-help-id="fiscal.filtros">
        <AdvancedFilterBar
          searchValue={consultaSearch}
          onSearchChange={setConsultaSearch}
          searchPlaceholder="Buscar por número, chave ou parceiro..."
          activeFilters={fiscalActiveFilters}
          onRemoveFilter={handleRemoveFiscalFilter}
          onClearAll={() => { setTipoFilters([]); setModeloFilters([]); setStatusFilters([]); setOrigemFilters([]); setStatusSefazFilters([]); setEmissaoMes(""); setVencimentoMes(""); }}
          count={filteredData.length}
        >
          {!tipoParam && <MultiSelect options={tipoOptions} selected={tipoFilters} onChange={setTipoFilters} placeholder="Tipo" className="w-[150px]" />}
          <MultiSelect options={modeloOptions} selected={modeloFilters} onChange={setModeloFilters} placeholder="Modelos" className="w-[180px]" />
          <MultiSelect options={statusOptions} selected={statusFilters} onChange={setStatusFilters} placeholder="Status ERP" className="w-[180px]" />
          <MultiSelect options={origemOptions} selected={origemFilters} onChange={setOrigemFilters} placeholder="Origem" className="w-[180px]" />
          <MultiSelect options={statusSefazOptions} selected={statusSefazFilters} onChange={setStatusSefazFilters} placeholder="Status SEFAZ" className="w-[180px]" />
          <MonthPicker label="Emissão" value={emissaoMes} onChange={setEmissaoMes} />
          <MonthPicker label="Vencimento" value={vencimentoMes} onChange={setVencimentoMes} />
        </AdvancedFilterBar>
        </div>

        {/* Banner mobile tappable: filtra para Pendentes em 1 toque */}
        {isMobile && kpis.pendentes > 0 && (
          <button
            type="button"
            onClick={() => setStatusFilters(["pendente"])}
            className="md:hidden w-full mb-3 min-h-11 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 flex items-center justify-between gap-3 active:bg-warning/20 transition-colors"
            aria-label={`Filtrar ${kpis.pendentes} notas pendentes`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock className="h-4 w-4 shrink-0 text-warning" />
              <span className="text-sm font-medium text-warning-foreground truncate">
                {kpis.pendentes} {kpis.pendentes === 1 ? "nota pendente" : "notas pendentes"}
              </span>
            </div>
            <span className="text-xs text-warning shrink-0">Filtrar →</span>
          </button>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total de NFs oculto em mobile (redundante com count da lista) */}
          <SummaryCard className="hidden md:block" title="Total de NFs" value={String(kpis.total)} icon={FileText} variationType="neutral" variation="registros" />
          <SummaryCard title="Valor Total" value={formatCurrency(kpis.valorTotal)} icon={DollarSign} variationType="neutral" variation="acumulado" />
          <SummaryCard title="Pendentes" value={String(kpis.pendentes)} icon={Clock} variationType={kpis.pendentes > 0 ? "negative" : "neutral"} variation="aguardando confirmação" />
          <SummaryCard title="Confirmadas" value={String(kpis.confirmadas)} icon={CheckCircle} variationType="positive" variation="processadas" />
        </div>

        <div data-help-id="fiscal.tabela">
        <DataTable
          columns={columns}
          data={filteredData}
          loading={loading}
          moduleKey={tipoConfig.moduleKey}
          showColumnToggle={true}
          onView={openView}
          onEdit={openEdit}
          mobileStatusKey="status"
          mobileIdentifierKey="parceiro"
          mobilePrimaryAction={(n) => {
            if (canConfirmFiscal(n.status)) {
              return (
                <Button
                  size="sm"
                  className="w-full min-h-11 gap-2"
                  onClick={() => handleConfirmar(n)}
                  aria-label={`Confirmar NF ${n.numero}`}
                >
                  <CheckCircle className="h-4 w-4" /> Confirmar NF
                </Button>
              );
            }
            if (["confirmada", "autorizada", "importada"].includes(n.status)) {
              return (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full min-h-11 gap-2"
                  onClick={() => openDanfe(n)}
                  aria-label={`Visualizar DANFE da NF ${n.numero}`}
                >
                  <FileText className="h-4 w-4" /> DANFE
                </Button>
              );
            }
            return (
              <Button
                size="sm"
                variant="outline"
                className="w-full min-h-11 gap-2"
                onClick={() => openView(n)}
                aria-label={`Ver detalhes da NF ${n.numero}`}
              >
                <Eye className="h-4 w-4" /> Ver detalhes
              </Button>
            );
          }}
          mobileInlineActions={(n) => {
            const editable = ["pendente", "rascunho"].includes(n.status);
            const canDevolucao = n.tipo === "saida" && (n.tipo_operacao || "normal") === "normal" && ["confirmada", "autorizada", "importada"].includes(n.status);
            return (
              <>
                {editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 min-h-11"
                    onClick={() => navigate(`/fiscal/${n.id}`)}
                    aria-label={`Editar NF ${n.numero}`}
                  >
                    <EditIcon className="h-4 w-4 mr-1.5" /> Editar
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 min-h-11"
                      aria-label="Mais ações"
                    >
                      <MoreVertical className="h-4 w-4 mr-1.5" /> Mais
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => openView(n)}>
                      <Eye className="h-4 w-4 mr-2" /> Ver detalhes
                    </DropdownMenuItem>
                    {["confirmada", "autorizada", "importada"].includes(n.status) && (
                      <DropdownMenuItem onClick={() => openDanfe(n)}>
                        <FileText className="h-4 w-4 mr-2" /> DANFE
                      </DropdownMenuItem>
                    )}
                    {canDevolucao && (
                      <DropdownMenuItem onClick={() => openDevolucao(n)}>
                        <ArrowLeftRight className="h-4 w-4 mr-2" /> Devolução
                      </DropdownMenuItem>
                    )}
                    {canEstornarFiscal(n.status) && canEstornarNF && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleEstornar(n)}
                        >
                          <XCircleIcon className="h-4 w-4 mr-2" /> Estornar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            );
          }}
        />
        </div>
      </ModulePage>

      {/* Form Modal - Create */}
      <NfeCreateFormModal
        open={modalOpen && mode === "create"}
        onClose={() => { setModalOpen(false); setXmlOriginInfo(null); setTraducaoLinhas([]); }}
        form={form as unknown as Record<string, string | number | boolean>}
        setForm={(next) => setForm(next as unknown as typeof form)}
        items={items}
        setItems={setItems}
        itemContaContabil={itemContaContabil}
        setItemContaContabil={setItemContaContabil}
        parcelas={parcelas}
        setParcelas={setParcelas}
        primeiroVencimento={primeiroVencimento}
        setPrimeiroVencimento={setPrimeiroVencimento}
        intervaloDias={intervaloDias}
        setIntervaloDias={setIntervaloDias}
        parcelasPlano={parcelasPlano}
        setParcelasPlano={setParcelasPlano}
        saving={saving}
        onSubmit={handleSubmit}
        fornecedores={fornecedoresCrud.data}
        clientes={clientesCrud.data}
        produtos={produtosCrud.data}
        ordensVenda={ordensVenda}
        contasContabeis={contasContabeis}
        cartoes={cartoes}
        valorProdutos={valorProdutos}
        totalImpostos={totalImpostos}
        totalNF={totalNF}
        xmlOriginInfo={xmlOriginInfo}
        traducaoLinhasCount={traducaoLinhas.length}
        onAbrirTraducao={() => { setTraducaoReadOnly(false); setTraducaoOpen(true); }}
        onCriarProdutoQuick={() => { setQuickProdutoLinhaIdx(-1); setQuickProdutoNome(""); }}
      />

      {/* Edit Modal */}
      {selected && (
        <NotaFiscalEditModal
          open={modalOpen && mode === "edit"}
          onClose={() => setModalOpen(false)}
          selected={selected}
          form={form}
          setForm={setForm}
          items={items}
          setItems={setItems}
          itemContaContabil={itemContaContabil}
          setItemContaContabil={setItemContaContabil}
          parcelas={parcelas}
          setParcelas={setParcelas}
          saving={saving}
          onSubmit={handleSubmit}
          onSaveAndConfirm={selected.status === "pendente" ? handleSaveAndConfirm : undefined}
          onCancelarRascunho={selected.status === "pendente" ? handleCancelarRascunho : undefined}
          fornecedores={fornecedoresCrud.data}
          clientes={clientesCrud.data}
          ordensVenda={ordensVenda}
          contasContabeis={contasContabeis}
          produtosCrud={produtosCrud.data}
          valorProdutos={valorProdutos}
          totalImpostos={totalImpostos}
          totalNF={totalNF}
        />
      )}

      {/* View Drawer */}
      <NotaFiscalDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selected={selected}
        onEdit={openEdit}
        onDelete={handleInativar}
        onConfirmar={handleConfirmar}
        onEstornar={handleEstornar}
        onDevolucao={openDevolucao}
        onDanfe={(nf) => { setDrawerOpen(false); openDanfe(nf); }}
        onPermanentlyDeleted={() => { setDrawerOpen(false); fetchData(); }}
        onRefresh={fetchData}
      />

      {/* Devolução Dialog */}
      <DevolucaoDialog
        open={devolucaoModalOpen}
        onOpenChange={setDevolucaoModalOpen}
        devolucaoNF={devolucaoNF}
        devolucaoItens={devolucaoItens}
        setDevolucaoItens={setDevolucaoItens as unknown as (itens: unknown[]) => void}
        onSuccess={fetchData}
      />

      <DanfeViewer open={danfeOpen} onClose={() => setDanfeOpen(false)} data={danfeData as never} />

      {/* Busca de NF-e por chave de acesso (44 dígitos) — DistDFe local + sync SEFAZ */}
      <BuscarPorChaveDialog
        open={buscarChaveOpen}
        chaveInicial={buscarChaveInicial}
        onClose={() => {
          setBuscarChaveOpen(false);
          setBuscarChaveInicial(undefined);
        }}
        onXmlObtido={async (xml) => {
          try {
            await processarXmlImportado(xml);
          } catch (err) {
            logger.error("[fiscal] processar XML por chave:", err);
            toast.error(
              `Erro ao processar XML: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }}
      />

      {/* Scanner de chave (câmera/upload/digitação) — extrai apenas a chave;
          os fluxos de consulta/XML continuam canônicos. */}
      <FiscalChaveScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onBuscarXml={(chave) => {
          setScannerOpen(false);
          setBuscarChaveInicial(chave);
          setBuscarChaveOpen(true);
        }}
        onConsultarSituacao={(chave) => {
          setScannerOpen(false);
          setBuscarChaveInicial(chave);
          setBuscarChaveOpen(true);
        }}
      />

      {/* Tradução XML — etapa explícita XML→cadastro. Obrigatório com pendência, opcional via banner. */}
      <TraducaoXmlDrawer
        open={traducaoOpen}
        readOnly={traducaoReadOnly}
        fornecedorNome={pendingXmlImport?.fornecedorNome ?? xmlOriginInfo?.fornecedorNome ?? ""}
        fornecedorId={pendingXmlImport?.fornecedorId ?? xmlOriginInfo?.fornecedorId ?? ""}
        produtos={produtosCrud.data}
        linhas={traducaoLinhas}
        onCancel={handleTraducaoCancel}
        onConfirm={handleTraducaoConfirm}
        onCreateProduto={(idx, nome) => {
          setQuickProdutoLinhaIdx(idx);
          setQuickProdutoNome(nome);
        }}
      />

      {/* Cadastro rápido de produto a partir do XML */}
      <QuickAddProductModal
        open={quickProdutoLinhaIdx !== null}
        defaultNome={quickProdutoNome}
        onClose={() => { setQuickProdutoLinhaIdx(null); setQuickProdutoNome(""); }}
        onCreated={async (produtoId) => {
          const idx = quickProdutoLinhaIdx;
          await produtosCrud.fetchData();
          if (idx !== null && idx >= 0) {
            setTraducaoLinhas((prev) => prev.map((l) =>
              l.index === idx ? { ...l, produtoId, matchStatus: "manual", pendente: false, salvarDePara: true } : l
            ));
          } else if (idx === -1) {
            // Entrada manual via ItemsGrid: anexa o novo produto à última linha do grid (ou cria uma).
            setItems((prev) => {
              const next = [...prev];
              const target = next.findIndex((i) => !i.produto_id);
              const matched = produtosCrud.data.find((p) => p.id === produtoId) as { codigo_interno?: string; nome?: string; preco_custo?: number } | undefined;
              const row = {
                produto_id: produtoId,
                codigo: String(matched?.codigo_interno || ""),
                descricao: String(matched?.nome || ""),
                quantidade: 0,
                valor_unitario: Number(matched?.preco_custo || 0),
                valor_total: 0,
              };
              if (target >= 0) next[target] = row; else next.push(row);
              return next;
            });
          }
          setQuickProdutoLinhaIdx(null);
          setQuickProdutoNome("");
        }}
      />

      {/* Cadastro rápido de fornecedor a partir do XML */}
      <QuickAddSupplierModal
        open={quickFornecedorOpen}
        defaults={quickFornecedorDefaults}
        onClose={() => { setQuickFornecedorOpen(false); }}
        onCreated={async (fornecedorId) => {
          await fornecedoresCrud.fetchData();
          setQuickFornecedorOpen(false);
          // Retoma o fluxo de importação XML pendente
          if (pendingXmlImport) {
            const fornecedorNome = quickFornecedorDefaults.nome_razao_social || "";
            const newPending = { ...pendingXmlImport, fornecedorId, fornecedorNome };
            setPendingXmlImport(newPending);
            setTraducaoReadOnly(false);
            setTraducaoOpen(true);
          }
        }}
      />

      {confirmDialog}
    </>
  );
};

export default Fiscal;
