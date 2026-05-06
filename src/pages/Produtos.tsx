import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { useUrlListState } from "@/hooks/useUrlListState";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { ModulePage } from "@/components/ModulePage";
import { SummaryCard } from "@/components/SummaryCard";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listGruposAtivos,
  listFornecedoresParaProduto,
  listUnidadesMedidaAtivas,
  listProdutoComposicao,
  listProdutoFornecedores,
  saveProdutoComposicao,
  saveProdutoFornecedores,
  createUnidadeMedida,
  proximoSkuDoGrupo,
  updateGrupoSigla,
} from "@/services/produtos.service";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Package, FileText, TrendingUp, Archive, ShoppingCart, AlertCircle, CheckCircle2, AlignLeft, Tag, Wand2, Pencil } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { FiscalAutocomplete } from "@/components/ui/FiscalAutocomplete";
import { ProductAutocomplete } from "@/components/ui/ProductAutocomplete";
import { cfopCodes, cstIcmsCodes } from "@/lib/fiscalData";
import { useNcmLookup } from '@/hooks/useNcmLookup';
import { Switch } from "@/components/ui/switch";
import { notifyError } from "@/utils/errorMessages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useCan } from "@/hooks/useCan";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { produtoSchema, produtoInsumoSchema, validateForm } from "@/lib/validationSchemas";
import { useEditDeepLink } from "@/hooks/useEditDeepLink";
import { QuickAddProductModal } from "@/components/QuickAddProductModal";
import { MobileQuickAddFAB } from "@/components/MobileQuickAddFAB";
import { parseVariacoes } from "@/utils/cadastros";

type TipoItem = "produto" | "insumo";

interface Produto {
  id: string;sku: string;codigo_interno: string;nome: string;descricao: string;
  grupo_id: string;unidade_medida: string;preco_custo: number;preco_venda: number;
  estoque_atual: number;estoque_minimo: number;ncm: string;cst: string;cfop_padrao: string;
  peso: number;eh_composto: boolean;ativo: boolean;created_at: string;updated_at?: string;tipo_item: TipoItem;
  variacoes?: string[] | null;
}

type ProdutoTableRow = Produto & {
  display_codigo: string;
  display_sku_secundario: string | null;
};

type ProdutoFormData = Omit<Produto, "id" | "estoque_atual" | "created_at" | "updated_at"> & { id?: string; variacoes_texto: string };

interface ComposicaoItem {
  id?: string;
  produto_filho_id: string;
  quantidade: number;
  ordem: number;
  nome?: string;
  sku?: string;
  preco_custo?: number;
}

interface FornecedorLink {
  id?: string;
  fornecedor_id: string;
  eh_principal: boolean;
  descricao_fornecedor: string;
  referencia_fornecedor: string;
  unidade_fornecedor: string;
  lead_time_dias: number;
  preco_compra: number;
  /** Quantas unidades internas (produto.unidade_medida) cabem em 1 unidade do fornecedor.
   *  qtd_interna = qtd_xml × fator. Default 1 quando unidades coincidem. */
  fator_conversao: number;
}

interface UnidadeMedidaOption {
  id: string;
  codigo: string;
  descricao: string;
  sigla: string | null;
}

type SituacaoEstoque = "normal" | "atencao" | "critico" | "zerado";

function getSituacaoEstoque(p: { estoque_atual?: number | null; estoque_minimo?: number | null }): SituacaoEstoque {
  const atual = Number(p.estoque_atual || 0);
  const minimo = Number(p.estoque_minimo || 0);
  if (atual <= 0) return "zerado";
  if (minimo > 0 && atual <= minimo) return "critico";
  if (minimo > 0 && atual <= minimo * 1.2) return "atencao";
  return "normal";
}

const situacaoEstoqueConfig: Record<SituacaoEstoque, { label: string; statusBadge: string; textClass: string }> = {
  normal:  { label: "Normal",           statusBadge: "confirmado",  textClass: "text-foreground"   },
  atencao: { label: "Em atenção",        statusBadge: "pendente",    textClass: "text-warning"      },
  critico: { label: "Abaixo do mínimo", statusBadge: "cancelado",   textClass: "text-destructive"  },
  zerado:  { label: "Sem estoque",      statusBadge: "cancelado",   textClass: "text-destructive"  },
};

const UNIDADES_FALLBACK = ["UN", "KG", "MT", "CX", "PC", "LT", "G", "M2", "M3", "ML", "PR", "JG", "KIT", "SC", "RL"];

const emptyProduto = {
  nome: "", sku: "", codigo_interno: "", descricao: "", unidade_medida: "UN" as string,
  preco_custo: 0, preco_venda: 0, estoque_minimo: 0, ncm: "", cst: "", cfop_padrao: "", peso: 0, eh_composto: false,
  grupo_id: "", tipo_item: "produto" as TipoItem, variacoes_texto: "", ativo: true,
};

function compactProductCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeProductCode(value: string | null | undefined): string {
  const compact = compactProductCode(value);
  if (!compact) return "";

  const normalized = /[A-Z]/i.test(compact)
    ? compact.replace(/^0+(?=[A-Z0-9]*[A-Z])/i, "")
    : compact;

  return normalized || compact;
}

function getProdutoDisplayCodigo(produto: Pick<Produto, "codigo_interno" | "sku">): string {
  return normalizeProductCode(produto.codigo_interno) || normalizeProductCode(produto.sku) || "—";
}

function getProdutoDisplaySkuSecundario(produto: Pick<Produto, "codigo_interno" | "sku">): string | null {
  const sku = String(produto.sku ?? "").trim();
  if (!sku) return null;

  const skuNormalizado = normalizeProductCode(sku);
  const codigoPrincipal = normalizeProductCode(getProdutoDisplayCodigo(produto));

  return skuNormalizado && skuNormalizado !== codigoPrincipal ? sku : null;
}

function getProdutoCanonicalScore(produto: Pick<Produto, "codigo_interno" | "sku" | "variacoes">): number {
  const rawPrimary = compactProductCode(produto.codigo_interno || produto.sku || "");
  const variacoesCount = parseVariacoes(produto.variacoes).length;

  let score = variacoesCount * 100;
  if (rawPrimary && normalizeProductCode(rawPrimary) === rawPrimary) score += 20;
  score -= rawPrimary.length;

  return score;
}

function pickCanonicalProduto<T extends Produto>(current: T, candidate: T): T {
  return getProdutoCanonicalScore(candidate) > getProdutoCanonicalScore(current) ? candidate : current;
}

function dedupeProdutosCanonicos<T extends Produto>(produtos: T[]): T[] {
  const deduped = new Map<string, T>();

  for (const produto of produtos) {
    const key = [
      normalizeProductCode(produto.codigo_interno || produto.sku),
      String(produto.nome || "").trim().toUpperCase(),
      String(produto.tipo_item || "produto"),
    ].join("::");

    if (!key.replace(/::/g, "")) {
      deduped.set(produto.id, produto);
      continue;
    }

    const existing = deduped.get(key);
    deduped.set(key, existing ? pickCanonicalProduto(existing, produto) : produto);
  }

  return Array.from(deduped.values());
}

const Produtos = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { value: filterValue, set: setFilter, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      tipo: { type: "stringArray" },
      tipoItem: { type: "stringArray" },
      estoque: { type: "stringArray" },
      grupo: { type: "stringArray" },
      ativo: { type: "stringArray" },
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const tipoFilters = filterValue.tipo;
  const setTipoFilters = (v: string[]) => setFilter({ tipo: v });
  const tipoItemFilters = filterValue.tipoItem;
  const setTipoItemFilters = (v: string[]) => setFilter({ tipoItem: v });
  const estoqueFilters = filterValue.estoque;
  const setEstoqueFilters = (v: string[]) => setFilter({ estoque: v });
  const grupoFilters = filterValue.grupo;
  const setGrupoFilters = (v: string[]) => setFilter({ grupo: v });
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const debouncedSearch = useDebounce(searchTerm, 350);
  const { confirm: confirmAction, dialog: confirmActionDialog } = useConfirmDialog();
  const { can } = useCan();
  const canExcluir = can("produtos:excluir");
  const serverFilters = useMemo(() => {
    const out: Array<{ column: string; value: string | string[] | boolean; operator?: "eq" | "in" }> = [];
    if (ativoFilters.length === 1) out.push({ column: "ativo", value: ativoFilters[0] === "ativo" });
    if (tipoItemFilters.length === 1) out.push({ column: "tipo_item", value: tipoItemFilters[0] });
    else if (tipoItemFilters.length > 1) out.push({ column: "tipo_item", value: tipoItemFilters, operator: "in" });
    if (tipoFilters.length === 1) out.push({ column: "eh_composto", value: tipoFilters[0] === "composto" });
    // grupo: "sem_grupo" representa NULL — só empurra quando todos são UUIDs reais
    const realGroupIds = grupoFilters.filter((g) => g !== "sem_grupo");
    if (grupoFilters.length > 0 && realGroupIds.length === grupoFilters.length) {
      if (realGroupIds.length === 1) out.push({ column: "grupo_id", value: realGroupIds[0] });
      else out.push({ column: "grupo_id", value: realGroupIds, operator: "in" });
    }
    return out;
  }, [ativoFilters, tipoItemFilters, tipoFilters, grupoFilters]);

  const hasSemGrupoFilter = grupoFilters.includes("sem_grupo");
  const hasEstoqueFilter = estoqueFilters.length > 0;

  const { data, loading, create, update, remove, duplicate, fetchData } = useSupabaseCrud<Produto>({
    table: "produtos",
    searchTerm: debouncedSearch,
    filterAtivo: false,
    filter: serverFilters,
    searchColumns: ["nome", "sku", "codigo_interno", "ncm"],
  });
  const { pushView } = useRelationalNavigation();
  const [unidadesMedida, setUnidadesMedida] = useState<UnidadeMedidaOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const { form, setForm, updateForm, reset: resetForm, markPristine, isDirty } = useEditDirtyForm<ProdutoFormData>(emptyProduto);
  const { saving, submit } = useSubmitLock();
  const [editComposicao, setEditComposicao] = useState<ComposicaoItem[]>([]);
  const [editFornecedores, setEditFornecedores] = useState<FornecedorLink[]>([]);
  const [fornecedoresList, setFornecedoresList] = useState<{id: string; nome_razao_social: string}[]>([]);
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  const [margemOverride, setMargemOverride] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [grupos, setGrupos] = useState<{id: string; nome: string; sigla?: string | null}[]>([]);
  const { buscarNcm, loading: ncmLoading } = useNcmLookup();

  // State for inline unit creation dialog
  const [novaUnidadeDialogOpen, setNovaUnidadeDialogOpen] = useState(false);
  const [novaUnidadeForm, setNovaUnidadeForm] = useState({ codigo: "", descricao: "", sigla: "" });
  const [savingNovaUnidade, setSavingNovaUnidade] = useState(false);

  // Edição rápida da sigla do grupo (regra de SKU = SIGLA + NNN)
  const [siglaDialogOpen, setSiglaDialogOpen] = useState(false);
  const [siglaInput, setSiglaInput] = useState("");
  const [savingSigla, setSavingSigla] = useState(false);

  // Lookups (grupos, fornecedores, unidades) via React Query — cache compartilhado
  // entre montagens. Mantemos cópia local para permitir mutações otimistas
  // (criação de unidade/sigla inline) sem invalidar o cache imediatamente.
  const { data: grupoLookup } = useQuery({
    queryKey: ["produtos", "lookup", "grupos-ativos"],
    queryFn: listGruposAtivos,
    staleTime: 5 * 60 * 1000,
  });
  const { data: fornecedorLookup } = useQuery({
    queryKey: ["produtos", "lookup", "fornecedores"],
    queryFn: listFornecedoresParaProduto,
    staleTime: 5 * 60 * 1000,
  });
  const { data: unidadeLookup } = useQuery({
    queryKey: ["produtos", "lookup", "unidades-medida"],
    queryFn: listUnidadesMedidaAtivas,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => { if (grupoLookup) setGrupos(grupoLookup); }, [grupoLookup]);
  useEffect(() => { if (fornecedorLookup) setFornecedoresList(fornecedorLookup); }, [fornecedorLookup]);
  useEffect(() => { if (unidadeLookup) setUnidadesMedida(unidadeLookup as UnidadeMedidaOption[]); }, [unidadeLookup]);

  useEditDeepLink<Produto>({
    table: "produtos",
    onLoad: (p) => openEdit(p),
  });

  // Atalho rápido: abrir formulário de criação ao chegar com ?new=1.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("new") !== "1") return;
    openCreate();
    params.delete("new");
    navigate(
      { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- atalho ?new=1 one-shot; openCreate/navigate são estáveis
  }, [location.search]);

  const produtosDisponiveis = useMemo(() => dedupeProdutosCanonicos(data), [data]);

  const custoComposto = editComposicao.reduce((s, c) => {
    const prod = data.find((p) => p.id === c.produto_filho_id);
    return s + c.quantidade * (prod?.preco_custo || 0);
  }, 0);

  // margemLucro: derivada de preco_custo/preco_venda; override manual quando usuário edita o campo "Margem (%)"
  const margemDerivada = (() => {
    const custo = form.eh_composto ? custoComposto : Number(form.preco_custo) || 0;
    const venda = Number(form.preco_venda) || 0;
    if (custo <= 0) return 30;
    return Math.round((venda / custo - 1) * 100);
  })();
  const margemLucro = margemOverride ?? margemDerivada;
  const precoSugerido = custoComposto * (1 + margemLucro / 100);

  const custoParaCalculo = form.eh_composto ? custoComposto : (Number(form.preco_custo) || 0);
  const lucroBruto = (Number(form.preco_venda) || 0) - custoParaCalculo;
  const margemPercent = custoParaCalculo > 0 ? ((Number(form.preco_venda) || 0) / custoParaCalculo - 1) * 100 : 0;
  const fiscalCompleto = !!(form.ncm && form.cst && form.cfop_padrao);

  const openCreate = () => {
    setMode("create");
    resetForm({ ...emptyProduto });
    setEditComposicao([]);
    setEditFornecedores([]);
    setEditingProduct(null);
    setMargemOverride(30);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = async (p: Produto) => {
    setMode("edit");
    setEditingProduct(p);
    setFormErrors({});
    // `produtos.variacoes` agora é text[] no banco. Convertemos para CSV apenas para o input.
    const variacoesTexto = Array.isArray(p.variacoes) ? p.variacoes.join(", ") : "";
    resetForm({
      id: p.id,
      nome: p.nome, sku: p.sku || "", codigo_interno: p.codigo_interno || "", descricao: p.descricao || "",
      unidade_medida: p.unidade_medida, preco_custo: p.preco_custo || 0, preco_venda: p.preco_venda,
      estoque_minimo: p.estoque_minimo || 0, ncm: (p.ncm || "").replace(/\D/g, ''), cst: p.cst || "", cfop_padrao: p.cfop_padrao || "",
      peso: p.peso || 0, eh_composto: p.eh_composto || false,
      grupo_id: p.grupo_id || "",
      tipo_item: p.tipo_item || "produto",
      variacoes_texto: variacoesTexto,
      ativo: p.ativo !== false,
    });
    const [compData, fornData] = await Promise.all([
      p.eh_composto ? listProdutoComposicao(p.id) : Promise.resolve([]),
      listProdutoFornecedores(p.id),
    ]);
    setEditComposicao(compData.map((c) => ({
      id: c.id, produto_filho_id: c.produto_filho_id, quantidade: c.quantidade, ordem: c.ordem,
      nome: c.produtos?.nome, sku: c.produtos?.sku, preco_custo: c.produtos?.preco_custo
    })));
    setEditFornecedores(fornData.map((f) => ({
      id: f.id, fornecedor_id: f.fornecedor_id, eh_principal: f.eh_principal || false,
      descricao_fornecedor: f.descricao_fornecedor || "", referencia_fornecedor: f.referencia_fornecedor || "",
      unidade_fornecedor: f.unidade_fornecedor || "", lead_time_dias: f.lead_time_dias || 0, preco_compra: f.preco_compra || 0,
      fator_conversao: (f as { fator_conversao?: number }).fator_conversao ?? 1,
    })));
    setMargemOverride(null); // deriva automaticamente do registro carregado
    setModalOpen(true);
  };

  const handleCloseModal = async () => {
    if (isDirty) {
      const ok = await confirmAction({
        title: "Descartar alterações?",
        description: "Há alterações não salvas. Deseja fechar mesmo assim?",
        confirmLabel: "Descartar",
        confirmVariant: "destructive",
      });
      if (!ok) return;
    }
    setModalOpen(false);
  };

  const openView = (p: Produto) => {
    pushView("produto", p.id);
  };

  const addComponent = () => {
    setEditComposicao([...editComposicao, { produto_filho_id: "", quantidade: 1, ordem: editComposicao.length + 1 }]);
  };
  const removeComponent = (idx: number) => setEditComposicao(editComposicao.filter((_, i) => i !== idx));
  const updateComponent = (idx: number, field: keyof ComposicaoItem, value: ComposicaoItem[keyof ComposicaoItem]) => {
    setEditComposicao(editComposicao.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const addFornecedor = () => {
    setEditFornecedores([...editFornecedores, { fornecedor_id: "", eh_principal: editFornecedores.length === 0, descricao_fornecedor: "", referencia_fornecedor: "", unidade_fornecedor: "", lead_time_dias: 0, preco_compra: 0, fator_conversao: 1 }]);
  };
  const removeFornecedor = (idx: number) => setEditFornecedores(editFornecedores.filter((_, i) => i !== idx));
  const updateFornecedor = (idx: number, field: keyof FornecedorLink, value: FornecedorLink[keyof FornecedorLink]) => {
    setEditFornecedores(editFornecedores.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  };
  const setPrincipalFornecedor = (idx: number) => {
    setEditFornecedores(editFornecedores.map((f, i) => ({ ...f, eh_principal: i === idx })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação Zod baseada em produtoSchema (nome, sku, unidade_medida, peso, ncm/cst/cfop, estoque_minimo, etc.)
    const dataParaValidar = {
      nome: form.nome,
      sku: form.sku,
      codigo_interno: form.codigo_interno,
      descricao: form.descricao,
      unidade_medida: form.unidade_medida,
      preco_custo: Number(form.preco_custo) || 0,
      preco_venda: Number(form.preco_venda) || 0,
      estoque_minimo: Number(form.estoque_minimo) || 0,
      ncm: form.ncm,
      cst: form.cst,
      cfop_padrao: form.cfop_padrao,
      peso: Number(form.peso) || 0,
      eh_composto: !!form.eh_composto,
      grupo_id: form.grupo_id,
    };
    // Para insumos, preço de venda é opcional → schema dedicado.
    const isInsumo = form.tipo_item === 'insumo';
    const validation = validateForm(
      isInsumo ? produtoInsumoSchema : produtoSchema,
      dataParaValidar,
    );
    if (!validation.success) {
      setFormErrors(validation.errors);
      const firstErr = Object.values(validation.errors)[0];
      toast.error(firstErr || "Verifique os campos do formulário");
      return;
    }
    setFormErrors({});

    // Regras adicionais não cobertas pelo schema (sub-entidades)
    if (form.eh_composto && editComposicao.length === 0) { toast.error("Produto composto precisa de ao menos um componente"); return; }
    if (form.eh_composto && editComposicao.some((c) => !c.produto_filho_id)) { toast.error("Selecione o produto para todos os componentes"); return; }
    const fornDups = editFornecedores.map(f => f.fornecedor_id).filter(Boolean);
    if (editFornecedores.some(f => !f.fornecedor_id)) { toast.error("Selecione o fornecedor para todos os vínculos ou remova os vazios"); return; }
    if (fornDups.length !== new Set(fornDups).size) { toast.error("Fornecedor duplicado: o mesmo fornecedor não pode ser vinculado duas vezes"); return; }

    await submit(async () => {
      // Persistimos como text[] no banco (BK-04). Snapshots em orcamentos_itens.variacao
      // continuam como string CSV (campo separado, não afetado).
      const variacoesArr = form.variacoes_texto
        ? form.variacoes_texto.split(",").map((v) => v.trim()).filter(Boolean)
        : [];
      const { variacoes_texto: _vt, ...rest } = form;
      // Normaliza NCM removendo qualquer máscara (pontos/traços) antes de persistir,
      // garantindo formato consistente no banco e no XML da NF-e.
      const ncmDigits = (form.ncm || "").replace(/\D/g, "");
      const payload: Record<string, unknown> = {
        ...rest,
        ncm: ncmDigits,
        variacoes: variacoesArr.length > 0 ? variacoesArr : null,
        preco_custo: form.eh_composto ? custoComposto : form.preco_custo,
      };
      // Código Interno é sempre gerado/mantido pelo backend (trigger PRD/INS).
      // Em criação: enviamos string vazia (trigger preenche). Em edição: removemos do payload para nunca sobrescrever.
      if (mode === "create") {
        payload.codigo_interno = "";
      } else {
        delete (payload as Record<string, unknown>).codigo_interno;
      }
      let produtoId: string;
      if (mode === "create") {
        const result = await create(payload);
        produtoId = result.id;
      } else if (form.id) {
        await update(form.id, payload);
        produtoId = form.id;
      } else {
        return;
      }
      // Composição: RPC transacional (delete + insert atômico).
      const composicaoItens = form.eh_composto
        ? editComposicao
            .filter((c) => c.produto_filho_id)
            .map((c) => ({ produto_filho_id: c.produto_filho_id, quantidade: c.quantidade }))
        : [];
      await saveProdutoComposicao({
        produtoPaiId: produtoId,
        itens: composicaoItens,
        ehComposto: !!form.eh_composto,
      });

      // Fornecedores: RPC transacional (delete + insert atômico).
      const fornecedoresPayload = editFornecedores
        .filter((f) => f.fornecedor_id)
        .map((f) => ({
          fornecedor_id: f.fornecedor_id,
          eh_principal: f.eh_principal ?? false,
          descricao_fornecedor: f.descricao_fornecedor || "",
          referencia_fornecedor: f.referencia_fornecedor || "",
          unidade_fornecedor: f.unidade_fornecedor || "",
          lead_time_dias: f.lead_time_dias ?? null,
          preco_compra: f.preco_compra ?? null,
          fator_conversao: f.fator_conversao ?? 1,
        }));
      await saveProdutoFornecedores({
        produtoId,
        itens: fornecedoresPayload,
      });
      markPristine();
      if (saveAndNewRef.current && mode === "create") {
        saveAndNewRef.current = false;
        resetForm({ ...emptyProduto });
        setEditComposicao([]);
        setEditFornecedores([]);
        setEditingProduct(null);
        setMargemOverride(30);
        setFormErrors({});
      } else {
        setModalOpen(false);
      }
    });
  };

  const saveAndNewRef = useRef(false);
  const handleSaveAndNew = () => {
    saveAndNewRef.current = true;
    document.getElementById("produto-form")?.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    );
  };

  const handleSalvarNovaUnidade = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigo = novaUnidadeForm.codigo.trim();
    const descricao = novaUnidadeForm.descricao.trim();
    if (!codigo) { toast.error("Código é obrigatório"); return; }
    if (!descricao) { toast.error("Descrição é obrigatória"); return; }
    setSavingNovaUnidade(true);
    try {
      let inserted;
      try {
        inserted = await createUnidadeMedida({
          codigo,
          descricao,
          sigla: novaUnidadeForm.sigla.trim() || null,
        });
      } catch (err) {
        notifyError(err);
        setSavingNovaUnidade(false);
        return;
      }
      const nova = inserted as UnidadeMedidaOption;
      setUnidadesMedida((prev) => [...prev, nova].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      updateForm({ unidade_medida: nova.codigo });
      setNovaUnidadeDialogOpen(false);
      setNovaUnidadeForm({ codigo: "", descricao: "", sigla: "" });
      toast.success(`Unidade "${nova.codigo}" criada com sucesso`);
    } catch (err) {
      console.error('[produtos] erro ao criar unidade:', err);
      notifyError(err);
    }
    setSavingNovaUnidade(false);
  };

  const filteredData = useMemo(() => {
    // ativo, tipo_item, eh_composto e grupo_id (UUIDs) são server-side.
    // Restam: situação de estoque (derivada em runtime) e "sem_grupo" misto.
    const needsClientFilter = hasEstoqueFilter || hasSemGrupoFilter;
    const filtered = needsClientFilter
      ? data.filter((p) => {
          if (hasEstoqueFilter) {
            const situacao = getSituacaoEstoque(p);
            if (!estoqueFilters.includes(situacao)) return false;
          }
          if (hasSemGrupoFilter) {
            if (!grupoFilters.includes(p.grupo_id || "sem_grupo")) return false;
          }
          return true;
        })
      : data;

    return dedupeProdutosCanonicos(filtered).map<ProdutoTableRow>((produto) => ({
      ...produto,
      display_codigo: getProdutoDisplayCodigo(produto),
      display_sku_secundario: getProdutoDisplaySkuSecundario(produto),
    }));
  }, [data, hasEstoqueFilter, hasSemGrupoFilter, estoqueFilters, grupoFilters]);

  const columns = [
    {
      key: "sku",
      label: "SKU",
      sortable: true,
      render: (p: ProdutoTableRow) => (
        <span className="font-mono text-xs font-medium" title="SKU — código comercial canônico">
          {p.sku || "—"}
        </span>
      ),
    },
    {
      key: "codigo_interno",
      label: "Cód. Interno",
      sortable: true,
      render: (p: ProdutoTableRow) => (
        <span className="font-mono text-xs text-muted-foreground" title="Código Interno (ERP) — sequencial PRD/INS">
          {p.codigo_interno || "—"}
        </span>
      ),
    },
    {
      key: "nome",
      mobilePrimary: true,
      label: "Produto",
      sortable: true,
      render: (p: ProdutoTableRow) => {
        return (
          <div>
            <span className="font-medium text-sm">{p.nome}</span>
          </div>
        );
      },
    },
    {
      key: "unidade_medida",
      label: "UN",
      render: (p: Produto) => (
        <span className="text-xs text-muted-foreground">{p.unidade_medida || "UN"}</span>
      ),
    },
    {
      key: "variacoes",
      label: "Variações",
      render: (p: Produto) => {
        const items: string[] = Array.isArray(p.variacoes) ? p.variacoes : [];
        if (items.length === 0) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const visiveis = items.slice(0, 2);
        const restantes = items.length - visiveis.length;
        return (
          <div className="flex flex-wrap items-center gap-1" title={items.join(", ")}>
            {visiveis.map((v, i) => (
              <span
                key={i}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20 font-medium"
              >
                {v}
              </span>
            ))}
            {restantes > 0 && (
              <span className="text-[10px] text-muted-foreground">+{restantes}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "estoque_atual",
      mobileCard: true,
      label: "Estoque",
      sortable: true,
      render: (p: Produto) => {
        const situacao = getSituacaoEstoque(p);
        const cfg = situacaoEstoqueConfig[situacao];
        return (
          <div className="space-y-0.5">
            <span className={`font-mono text-sm font-semibold ${cfg.textClass}`}>
              {p.estoque_atual ?? 0}
              <span className="text-[11px] text-muted-foreground ml-1 font-normal">{p.unidade_medida}</span>
            </span>
            {Number(p.estoque_minimo) > 0 && (
              <p className="text-[10px] text-muted-foreground font-mono leading-none">
                mín: {p.estoque_minimo}
              </p>
            )}
            {situacao !== "normal" && (
              <StatusBadge
                status={cfg.statusBadge}
                label={cfg.label}
                className="text-[10px] px-1.5 h-4 mt-0.5"
              />
            )}
          </div>
        );
      },
    },
    {
      key: "preco_venda",
      mobileCard: true,
      label: "P. Venda",
      sortable: true,
      render: (p: Produto) => (
        <span className="font-semibold font-mono text-sm">{formatCurrency(p.preco_venda)}</span>
      ),
    },
    {
      key: "preco_custo",
      label: "P. Custo",
      sortable: true,
      render: (p: Produto) => (
        <span className="font-mono text-sm text-muted-foreground">{formatCurrency(p.preco_custo || 0)}</span>
      ),
    },
    {
      key: "margem",
      label: "Margem",
      render: (p: Produto) => {
        const custo = Number(p.preco_custo || 0);
        const venda = Number(p.preco_venda);
        const margem = custo > 0 ? (venda / custo - 1) * 100 : 0;
        return (
          <div className="flex flex-col">
            <span className={`font-mono text-xs ${margem > 0 ? "text-success" : margem < 0 ? "text-destructive" : ""}`}>
              {custo > 0 ? `${margem.toFixed(1)}%` : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              +{formatCurrency(venda - custo)}
            </span>
          </div>
        );
      },
    },
    {
      key: "tipo_item",
      label: "Classificação",
      hidden: true,
      render: (p: Produto) => <StatusBadge status={p.tipo_item || "produto"} />,
    },
    {
      key: "ativo",
      mobileCard: true,
      label: "Status",
      render: (p: Produto) => <StatusBadge status={p.ativo !== false ? "ativo" : "inativo"} />,
    },
    {
      key: "eh_composto",
      label: "Tipo",
      hidden: true,
      render: (p: Produto) => <StatusBadge status={p.eh_composto ? "composto" : "simples"} />,
    },
  ];

  const kpis = useMemo(() => {
    const ativos = data.filter(p => p.ativo !== false);
    const criticos = data.filter(p => {
      const s = getSituacaoEstoque(p);
      return s === "critico" || s === "zerado";
    });
    const insumos = data.filter(p => p.tipo_item === "insumo");
    const produtos = data.filter(p => (p.tipo_item || "produto") === "produto");
    return { total: data.length, ativos: ativos.length, criticos: criticos.length, insumos: insumos.length, produtos: produtos.length };
  }, [data]);

  const prodActiveFilters = useMemo(() => {
    const chips: FilterChip[] = [];

    ativoFilters.forEach(f => {
      chips.push({
        key: "ativo",
        label: "Status",
        value: [f],
        displayValue: f === "ativo" ? "Ativo" : "Inativo",
      });
    });

    tipoFilters.forEach(f => {
      chips.push({
        key: "tipo",
        label: "Tipo",
        value: [f],
        displayValue: f === "simples" ? "Simples" : "Composto",
      });
    });

    tipoItemFilters.forEach(f => {
      chips.push({
        key: "tipoItem",
        label: "Classificação",
        value: [f],
        displayValue: f === "produto" ? "Produto" : "Insumo",
      });
    });

    estoqueFilters.forEach(f => {
      chips.push({
        key: "estoque",
        label: "Estoque",
        value: [f],
        displayValue: situacaoEstoqueConfig[f as SituacaoEstoque]?.label ?? f,
      });
    });

    grupoFilters.forEach(f => {
      const g = grupos.find(x => x.id === f);
      chips.push({
        key: "grupo",
        label: "Grupo",
        value: [f],
        displayValue: g?.nome || "Sem grupo",
      });
    });

    return chips;
  }, [ativoFilters, tipoFilters, tipoItemFilters, estoqueFilters, grupoFilters, grupos]);

  const handleRemoveProdFilter = (key: string, value?: string) => {
    if (key === "ativo") setAtivoFilters(ativoFilters.filter(v => v !== value));
    if (key === "tipo") setTipoFilters(tipoFilters.filter(v => v !== value));
    if (key === "tipoItem") setTipoItemFilters(tipoItemFilters.filter(v => v !== value));
    if (key === "estoque") setEstoqueFilters(estoqueFilters.filter(v => v !== value));
    if (key === "grupo") setGrupoFilters(grupoFilters.filter(v => v !== value));
  };

  const tipoOptions: MultiSelectOption[] = [
    { label: "Simples", value: "simples" },
    { label: "Composto", value: "composto" },
  ];

  const tipoItemOptions: MultiSelectOption[] = [
    { label: "Produto", value: "produto" },
    { label: "Insumo", value: "insumo" },
  ];

  const ativoOptions: MultiSelectOption[] = [
    { label: "Ativos", value: "ativo" },
    { label: "Inativos", value: "inativo" },
  ];

  const estoqueOptions: MultiSelectOption[] = [
    { label: "Sem estoque", value: "zerado" },
    { label: "Abaixo do mínimo", value: "critico" },
    { label: "Em atenção", value: "atencao" },
    { label: "Normal", value: "normal" },
  ];

  const grupoOptions: MultiSelectOption[] = [
    ...grupos.map(g => ({ label: g.nome, value: g.id })),
    { label: "Sem grupo", value: "sem_grupo" },
  ];

  return (
    <><ModulePage
        title="Produtos"
        subtitle="Consulta e gestão de produtos"
        addLabel="Novo Produto"
        onAdd={openCreate}
        addButtonHelpId="produtos.novoBtn"
        summaryCards={
          <>
            <SummaryCard
              title="Total de Itens"
              value={kpis.total}
              icon={Package}
              variant="info"
            />
            <SummaryCard
              title="Produtos"
              value={kpis.produtos}
              icon={Package}
              variant="default"
              onClick={kpis.produtos > 0 ? () => setTipoItemFilters(["produto"]) : undefined}
              subtitle={kpis.produtos > 0 ? "Clique para filtrar" : undefined}
            />
            <SummaryCard
              title="Insumos"
              value={kpis.insumos}
              icon={Archive}
              variant="default"
              onClick={kpis.insumos > 0 ? () => setTipoItemFilters(["insumo"]) : undefined}
              subtitle={kpis.insumos > 0 ? "Clique para filtrar" : undefined}
            />
            <SummaryCard
              title="Abaixo do Mínimo"
              value={kpis.criticos}
              icon={AlertCircle}
              variant={kpis.criticos > 0 ? "danger" : "default"}
              onClick={kpis.criticos > 0 ? () => setEstoqueFilters(["critico", "zerado"]) : undefined}
              subtitle={kpis.criticos > 0 ? "Clique para filtrar" : undefined}
            />
          </>
        }
      >

        <div data-help-id="produtos.filtros">
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome, SKU ou código..."
          activeFilters={prodActiveFilters}
          onRemoveFilter={handleRemoveProdFilter}
          onClearAll={() => clearFilters(["tipo", "tipoItem", "estoque", "grupo", "ativo"])}
          count={filteredData.length}
        >
          <MultiSelect
            options={ativoOptions}
            selected={ativoFilters}
            onChange={setAtivoFilters}
            placeholder="Status"
            className="w-[150px]"
          />
          <MultiSelect
            options={tipoItemOptions}
            selected={tipoItemFilters}
            onChange={setTipoItemFilters}
            placeholder="Classificação"
            className="w-[160px]"
          />
          <MultiSelect
            options={tipoOptions}
            selected={tipoFilters}
            onChange={setTipoFilters}
            placeholder="Tipo"
            className="w-[150px]"
          />
          <MultiSelect
            options={estoqueOptions}
            selected={estoqueFilters}
            onChange={setEstoqueFilters}
            placeholder="Estoque"
            className="w-[180px]"
          />
          <MultiSelect
            options={grupoOptions}
            selected={grupoFilters}
            onChange={setGrupoFilters}
            placeholder="Grupos"
            className="w-[200px]"
          />
        </AdvancedFilterBar>
        </div>

        <PullToRefresh onRefresh={fetchData}>
        <div data-help-id="produtos.tabela">
        <DataTable
          columns={columns}
          data={filteredData}
          loading={loading}
          moduleKey="produtos"
          defaultSortKey="sku"
          showColumnToggle={true}
          onView={openView}
          onEdit={openEdit}
          onDelete={canExcluir ? (p) => remove(p.id) : undefined}
          deleteBehavior="soft"
          mobileIdentifierKey="sku"
          mobileStatusKey="ativo"
        />
        </div>
        </PullToRefresh>
      </ModulePage>

      {/* Form Modal */}
      <FormModal
        open={modalOpen}
        onClose={handleCloseModal}
        title={mode === "create" ? "Novo Produto" : "Editar Produto"}
        size="xl"
        mode={mode}
        createHint="Preencha nome, SKU, unidade e grupo. Outras seções (estoque, preços, fiscal) ficam disponíveis após salvar."
        identifier={mode === "edit" && editingProduct ? (editingProduct.codigo_interno || editingProduct.sku || undefined) : undefined}
        status={mode === "edit" && editingProduct ? <StatusBadge status={editingProduct.ativo !== false ? "ativo" : "inativo"} /> : undefined}
        meta={mode === "edit" && editingProduct?.updated_at ? [
          { label: `Atualizado em ${formatDate(editingProduct.updated_at)}` },
        ] : undefined}
        headerActions={mode === "edit" && editingProduct ? (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => updateForm({ ativo: v })}
                aria-label={form.ativo ? "Inativar produto" : "Reativar produto"}
              />
              <span className="font-medium">{form.ativo ? "Ativo" : "Inativo"}</span>
            </label>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
              onClick={() => { setModalOpen(false); openView(editingProduct); }}>
              Ver resumo
            </Button>
          </>
        ) : undefined}
        footer={
          <FormModalFooter
            saving={saving}
            onCancel={handleCloseModal}
            submitAsForm
            formId="produto-form"
            mode={mode}
            onSaveAndNew={mode === "create" ? handleSaveAndNew : undefined}
          />
        }
      >
        <form id="produto-form" onSubmit={handleSubmit} className="space-y-0">

          <Tabs defaultValue="dados-gerais" className="w-full">
            <TabsList className="mb-4 w-full justify-start overflow-x-auto">
              <TabsTrigger value="dados-gerais" className="gap-1.5"><Package className="h-3.5 w-3.5" />Dados Gerais</TabsTrigger>
              <TabsTrigger value="estoque" className="gap-1.5"><Archive className="h-3.5 w-3.5" />Estoque</TabsTrigger>
              <TabsTrigger value="fiscal" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Fiscal</TabsTrigger>
              <TabsTrigger value="compras" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" />Compras</TabsTrigger>
              <TabsTrigger value="observacoes" className="gap-1.5"><AlignLeft className="h-3.5 w-3.5" />Obs.</TabsTrigger>
            </TabsList>

            {/* ── TAB: DADOS GERAIS ─────────────────────────── */}
            <TabsContent value="dados-gerais" className="space-y-4 mt-0">
          {/* ── Identificação ──────────────────────────── */}
          <div className="space-y-3 pt-1">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Package className="w-4 h-4" /> Identificação
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Nome do produto" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">SKU <span className="text-muted-foreground font-normal text-xs">(referência externa)</span></Label>
                <div className="flex gap-1.5">
                  <Input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="font-mono flex-1"
                    placeholder={(() => {
                      const g = grupos.find(g => g.id === form.grupo_id);
                      return g?.sigla ? `${g.sigla}001` : "Ex: PROD-001";
                    })()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                    title="Gerar próximo SKU pela sigla do grupo"
                    aria-label="Gerar próximo SKU"
                    disabled={!form.grupo_id || !grupos.find(g => g.id === form.grupo_id)?.sigla}
                    onClick={async () => {
                      try {
                        const next = await proximoSkuDoGrupo(form.grupo_id);
                        setForm({ ...form, sku: next });
                        toast.success(`SKU sugerido: ${next}`);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
                {form.grupo_id && !grupos.find(g => g.id === form.grupo_id)?.sigla && (
                  <p className="text-[11px] text-muted-foreground">
                    Defina uma sigla no grupo para gerar SKU automático (ex.: AG, SR).
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Código Interno (ERP)
                  <span className="text-muted-foreground font-normal text-xs">(gerado automaticamente — PRD/INS)</span>
                </Label>
                <Input
                  value={form.codigo_interno}
                  readOnly
                  disabled
                  className="font-mono bg-muted/40"
                  placeholder={mode === "create" ? "Será gerado ao salvar" : ""}
                  title="Código sequencial interno do ERP — não editável"
                />
              </div>
              <div className="space-y-2">
                <Label>Grupo de Produto</Label>
                <div className="flex gap-1.5">
                  <Select value={form.grupo_id || "nenhum"} onValueChange={(v) => setForm({ ...form, grupo_id: v === "nenhum" ? "" : v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Nenhum</SelectItem>
                      {grupos.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.nome}{g.sigla ? ` · ${g.sigla}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.grupo_id && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-9 w-9"
                      title="Editar sigla do grupo (usada para gerar SKU)"
                      aria-label="Editar sigla do grupo"
                      onClick={() => {
                        const g = grupos.find(g => g.id === form.grupo_id);
                        setSiglaInput(g?.sigla || "");
                        setSiglaDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Unidade de Medida</Label>
                <div className="flex gap-1.5">
                  <Select value={form.unidade_medida} onValueChange={(v) => setForm({ ...form, unidade_medida: v })}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {unidadesMedida.length > 0
                        ? unidadesMedida.map((u) => (
                            <SelectItem key={u.codigo} value={u.codigo}>
                              {u.codigo}{u.descricao !== u.codigo ? ` — ${u.descricao}` : ""}
                            </SelectItem>
                          ))
                        : UNIDADES_FALLBACK.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                    title="Criar nova unidade de medida"
                    aria-label="Criar nova unidade de medida"
                    onClick={() => { setNovaUnidadeForm({ codigo: "", descricao: "", sigla: "" }); setNovaUnidadeDialogOpen(true); }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            {/* Tipo toggle */}
            <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-muted/40 border">
              <div className="flex items-center gap-3">
                <span className={`text-sm ${!form.eh_composto ? "font-semibold" : "text-muted-foreground"}`}>Simples</span>
                <Switch
                  checked={form.eh_composto}
                  onCheckedChange={async (v) => {
                    if (!v && editComposicao.length > 0) {
                      const ok = await confirmAction({
                        title: "Desmarcar produto composto?",
                        description: `Desmarcar produto composto irá apagar os ${editComposicao.length} componente(s) ao salvar. Deseja continuar?`,
                        confirmLabel: "Continuar",
                        confirmVariant: "destructive",
                      });
                      if (!ok) return;
                    }
                    setForm({ ...form, eh_composto: v }); if (!v) setEditComposicao([]);
                  }}
                />
                <span className={`text-sm ${form.eh_composto ? "font-semibold" : "text-muted-foreground"}`}>Composto</span>
                <span className="text-xs text-muted-foreground ml-1">
                  {form.eh_composto
                    ? "Custo calculado automaticamente pela composição de componentes."
                    : "Produto com custo definido manualmente."}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Classificação</Label>
                <Select
                  value={form.tipo_item || "produto"}
                  onValueChange={(v) => setForm({ ...form, tipo_item: v as TipoItem })}
                >
                  <SelectTrigger className="h-8 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="produto">Produto</SelectItem>
                    <SelectItem value="insumo">Insumo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Comercial ──────────────────────────── */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2 border-t pt-3">
              <TrendingUp className="w-4 h-4" /> Comercial
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {!form.eh_composto ? (
                <div className="space-y-2">
                  <Label>Preço de Custo</Label>
                  <Input type="number" step="0.01" min="0" value={form.preco_custo} onChange={(e) => setForm({ ...form, preco_custo: Number(e.target.value) })} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Preço de Custo</Label>
                  <div className="h-9 flex items-center font-mono text-sm text-muted-foreground border rounded-md px-3 bg-muted/30">
                    {formatCurrency(custoComposto)} <span className="text-xs ml-1">(composição)</span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Preço de Venda {form.tipo_item !== 'insumo' ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal text-xs">(opcional para insumo)</span>}</Label>
                <Input type="number" step="0.01" min="0" value={form.preco_venda} onChange={(e) => setForm({ ...form, preco_venda: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Lucro Bruto</Label>
                <div className={`h-9 flex items-center font-mono text-sm font-semibold border rounded-md px-3 ${lucroBruto >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/5"}`}>
                  {formatCurrency(lucroBruto)}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Margem</Label>
                <div className={`h-9 flex items-center font-mono text-sm font-semibold border rounded-md px-3 ${margemPercent >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/5"}`}>
                  {custoParaCalculo > 0 ? `${margemPercent.toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* ── Variações ──────────────────────────── */}
          <div className="space-y-3 border-t pt-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Tag className="w-4 h-4" /> Variações Comerciais
            </h3>
            <div className="space-y-2">
              <Input
                value={form.variacoes_texto}
                onChange={(e) => setForm({ ...form, variacoes_texto: e.target.value })}
                placeholder="Ex: Azul, Vermelho, Verde, P, M, G"
              />
              <p className="text-xs text-muted-foreground">
                Separe as variações por vírgula. Exemplo: <em>Azul, Vermelho, 100ml, 200ml</em>.
                As variações ficam disponíveis para uso no orçamento.
              </p>
              {form.variacoes_texto && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.variacoes_texto.split(",").map((v) => v.trim()).filter(Boolean).map((v, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 font-medium">
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: ESTOQUE ─────────────────────────────── */}
            <TabsContent value="estoque" className="space-y-4 mt-0">
          {/* ── Suprimentos e Logística ──────────────────────────── */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Archive className="w-4 h-4" /> Suprimentos e Logística
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estoque Mínimo</Label>
                <Input type="number" min="0" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })} />
                {Number(form.estoque_minimo) === 0 && (
                  <p className="text-xs text-warning flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Sem estoque mínimo definido — produto sem controle de reposição.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Peso Unitário (kg)</Label>
                <Input type="number" step="0.001" min="0" value={form.peso} onChange={(e) => setForm({ ...form, peso: Number(e.target.value) })} />
              </div>
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: FISCAL ──────────────────────────────── */}
            <TabsContent value="fiscal" className="space-y-4 mt-0">
          {/* ── Dados Fiscais ──────────────────────────── */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" /> Dados Fiscais
              {fiscalCompleto && (
                <span className="ml-1 text-xs text-success font-normal flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Completo
                </span>
              )}
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>CST</Label>
                <FiscalAutocomplete data={cstIcmsCodes} value={form.cst} onChange={(v) => setForm({ ...form, cst: v })} placeholder="Ex: 000" />
                <p className="text-xs text-muted-foreground">Código de Situação Tributária do ICMS.</p>
              </div>
              <div className="space-y-2">
                <Label>CFOP Padrão</Label>
                <FiscalAutocomplete data={cfopCodes} value={form.cfop_padrao} onChange={(v) => setForm({ ...form, cfop_padrao: v })} placeholder="Ex: 5102" />
                <p className="text-xs text-muted-foreground">Código Fiscal de Operações e Prestações.</p>
              </div>
              <div className="space-y-2">
                <Label>NCM</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.ncm || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setForm({ ...form, ncm: val });
                    }}
                    placeholder="Ex: 84713012"
                    className={`flex-1 font-mono ${form.ncm && (form.ncm.length < 4 || form.ncm.length > 8) ? "border-destructive" : ""}`}
                    maxLength={8}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs"
                    disabled={ncmLoading || (form.ncm || '').replace(/\D/g, '').length < 4}
                    onClick={async () => {
                      const result = await buscarNcm(form.ncm || '');
                      if (result) setForm({ ...form, ncm: result.codigo });
                    }}
                  >
                    {ncmLoading ? '...' : 'Verificar'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">4–8 dígitos. Verifique na tabela TIPI da Receita Federal.</p>
              </div>
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: COMPRAS ─────────────────────────────── */}
            <TabsContent value="compras" className="space-y-4 mt-0">
          {/* ── Compras / Fornecedores ──────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Compras / Fornecedores
              </h3>
              <Button type="button" size="sm" variant="outline" onClick={addFornecedor} className="gap-1">
                <Plus className="w-3 h-3" /> Fornecedor
              </Button>
            </div>
            {editFornecedores.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum fornecedor vinculado. Clique em "+ Fornecedor" para adicionar.</p>
            )}
            {editFornecedores.map((forn, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Fornecedor *</Label>
                    <Select value={forn.fornecedor_id} onValueChange={(v) => updateFornecedor(idx, "fornecedor_id", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {fornecedoresList.map(f => <SelectItem key={f.id} value={f.id}>{f.nome_razao_social}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Switch
                      checked={forn.eh_principal}
                      onCheckedChange={() => setPrincipalFornecedor(idx)}
                    />
                    <Label className="text-xs cursor-pointer whitespace-nowrap">Principal</Label>
                  </div>
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover fornecedor" className="h-9 w-9 text-destructive shrink-0" onClick={() => removeFornecedor(idx)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Cód. Fornecedor (De/Para)</Label>
                    <Input className="h-9 font-mono" value={forn.referencia_fornecedor} onChange={(e) => updateFornecedor(idx, "referencia_fornecedor", e.target.value)} placeholder="Ex: REF-ABC" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Descrição no Fornecedor</Label>
                    <Input className="h-9" value={forn.descricao_fornecedor} onChange={(e) => updateFornecedor(idx, "descricao_fornecedor", e.target.value)} placeholder="Como o fornecedor denomina este item" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unidade Forn.</Label>
                    <Input className="h-9" value={forn.unidade_fornecedor} onChange={(e) => updateFornecedor(idx, "unidade_fornecedor", e.target.value)} placeholder="UN" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fator de Conversão</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      className="h-9"
                      value={forn.fator_conversao}
                      onChange={(e) => updateFornecedor(idx, "fator_conversao", Number(e.target.value))}
                      placeholder="1"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      1 {forn.unidade_fornecedor || "un. forn."} = {forn.fator_conversao || 1} {form.unidade_medida || "un. interna"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lead Time (dias)</Label>
                    <Input type="number" min="0" className="h-9" value={forn.lead_time_dias} onChange={(e) => updateFornecedor(idx, "lead_time_dias", Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preço de Compra</Label>
                    <Input type="number" step="0.01" min="0" className="h-9" value={forn.preco_compra} onChange={(e) => updateFornecedor(idx, "preco_compra", Number(e.target.value))} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Composição ──────────────────────────── */}
          {form.eh_composto &&
          <div className="space-y-3">
            <div className="flex items-center justify-between border-t pt-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Package className="w-4 h-4" /> Composição
              </h3>
              <Button type="button" size="sm" variant="outline" onClick={addComponent} className="gap-1"><Plus className="w-3 h-3" /> Componente</Button>
            </div>
            <p className="text-xs text-muted-foreground">O custo do produto composto é calculado automaticamente pela soma dos componentes abaixo.</p>
            {editComposicao.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum componente adicionado</p>}
            {editComposicao.map((comp, idx) => {
              const prod = data.find((p) => p.id === comp.produto_filho_id);
              return (
                <div key={idx} className="grid grid-cols-[1fr_100px_80px_40px] gap-2 items-end">
                  <div className="space-y-1"><Label className="text-xs">Produto</Label>
                    <ProductAutocomplete
                      products={produtosDisponiveis}
                      value={comp.produto_filho_id}
                      onChange={(v) => updateComponent(idx, "produto_filho_id", v)}
                      placeholder="Buscar produto..."
                    />
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Qtd</Label><Input type="number" min={0.01} step="0.01" value={comp.quantidade} onChange={(e) => updateComponent(idx, "quantidade", Number(e.target.value))} className="h-9" /></div>
                  <div className="space-y-1"><Label className="text-xs">Custo</Label><p className="h-9 flex items-center text-xs font-mono text-muted-foreground">{prod ? formatCurrency(comp.quantidade * (prod.preco_custo || 0)) : "—"}</p></div>
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover componente" className="h-9 w-9 text-destructive" onClick={() => removeComponent(idx)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              );
            })}
            {editComposicao.length > 0 &&
            <div className="border-t pt-3 space-y-2 bg-muted/20 rounded-lg p-3">
              <div className="flex justify-between text-sm"><span className="font-medium">Custo Total Composto</span><span className="font-mono font-semibold text-primary">{formatCurrency(custoComposto)}</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Margem (%)</Label><Input type="number" step="1" value={margemLucro} onChange={(e) => setMargemOverride(Number(e.target.value))} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">Preço Sugerido</Label><div className="h-9 flex items-center"><span className="font-mono font-semibold text-sm">{formatCurrency(precoSugerido)}</span><Button type="button" size="sm" variant="link" className="ml-2 text-xs h-auto p-0" onClick={() => setForm({ ...form, preco_venda: Number(precoSugerido.toFixed(2)) })}>Usar</Button></div></div>
              </div>
            </div>
            }
          </div>
          }
            </TabsContent>

            {/* ── TAB: OBSERVAÇÕES ─────────────────────────── */}
            <TabsContent value="observacoes" className="space-y-4 mt-0">
          {/* ── Descrição / Observações ──────────────────────────── */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <AlignLeft className="w-4 h-4" /> Descrição / Observações
            </h3>
            <Textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Descrição detalhada, características ou observações internas do produto..."
              rows={3}
            />
          </div>
            </TabsContent>
          </Tabs>

        </form>
      </FormModal>

      {/* ── Dialog: Nova Unidade de Medida ───────────────── */}
      <Dialog open={novaUnidadeDialogOpen} onOpenChange={(v) => { if (!v) { setNovaUnidadeDialogOpen(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Unidade de Medida</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSalvarNovaUnidade} className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Código <span className="text-destructive">*</span></Label>
              <Input
                value={novaUnidadeForm.codigo}
                onChange={(e) => setNovaUnidadeForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                placeholder="Ex: UN, KG, MT, CX"
                maxLength={10}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">Código curto em maiúsculas. Ex: KG, MT, LT.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição <span className="text-destructive">*</span></Label>
              <Input
                value={novaUnidadeForm.descricao}
                onChange={(e) => setNovaUnidadeForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Ex: Quilograma, Metro, Litro"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sigla <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Input
                value={novaUnidadeForm.sigla}
                onChange={(e) => setNovaUnidadeForm((f) => ({ ...f, sigla: e.target.value }))}
                placeholder="Ex: kg, m, l"
                maxLength={10}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setNovaUnidadeDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingNovaUnidade} className="gap-1.5">
                {savingNovaUnidade ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar Unidade
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar Sigla do Grupo (regra de SKU) ───────── */}
      <Dialog open={siglaDialogOpen} onOpenChange={(v) => { if (!v) setSiglaDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sigla do Grupo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              A sigla é usada como prefixo do SKU dos produtos deste grupo.
              Ex.: sigla <strong>AG</strong> gera <code className="font-mono">AG001, AG002, AG003…</code>
            </p>
            <div className="space-y-1.5">
              <Label>Sigla <span className="text-destructive">*</span></Label>
              <Input
                value={siglaInput}
                onChange={(e) => setSiglaInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                placeholder="Ex: AG"
                maxLength={4}
                autoFocus
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">2 a 4 caracteres (letras/números). Maiúsculas.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSiglaDialogOpen(false)}>Cancelar</Button>
              <Button
                type="button"
                disabled={savingSigla || siglaInput.length < 2}
                className="gap-1.5"
                onClick={async () => {
                  if (!form.grupo_id) return;
                  setSavingSigla(true);
                  try {
                    await updateGrupoSigla(form.grupo_id, siglaInput);
                    setGrupos((prev) => prev.map(g => g.id === form.grupo_id ? { ...g, sigla: siglaInput } : g));
                    toast.success("Sigla atualizada.");
                    setSiglaDialogOpen(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setSavingSigla(false);
                  }
                }}
              >
                {savingSigla ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {confirmActionDialog}
    </>);

};

export default Produtos;
