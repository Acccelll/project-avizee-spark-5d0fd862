/**
 * Formulário de Produto — pode ser renderizado de 2 formas:
 *  - Página dedicada (rota /produtos/novo ou /produtos/:id/editar) — modo legado
 *    preservado para compatibilidade com deep-links.
 *  - Embedded (dentro de `ProdutoFormModal`) — quando o usuário abre o modal a
 *    partir da listagem `/produtos`. Padrão canônico Onda 11+ (alinhado com
 *    Clientes/Fornecedores).
 *
 * As 5 abas (Dados Gerais, Estoque, Fiscal, Compras, Observações), composição,
 * fornecedores e dialogs auxiliares (Nova UM, Editar Sigla) permanecem
 * idênticos nos dois modos.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FiscalAutocomplete } from "@/components/ui/FiscalAutocomplete";
import { ProductAutocomplete } from "@/components/ui/ProductAutocomplete";
import { cfopCodes, cstIcmsCodes } from "@/lib/fiscalData";
import {
  Loader2, Plus, Trash2, Package, FileText, TrendingUp, Archive, ShoppingCart,
  AlertCircle, AlertTriangle, CheckCircle2, AlignLeft, Tag, Wand2, Pencil, Save,
  X, MoreVertical,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TabsListScrollable } from "@/components/ui/TabsListScrollable";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { useNcmLookup } from "@/hooks/useNcmLookup";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useFieldUnique } from "@/hooks/useFieldUnique";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { produtoSchema, produtoInsumoSchema, validateForm } from "@/lib/validationSchemas";
import { notifyError } from "@/utils/errorMessages";
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

type TipoItem = "produto" | "insumo";

interface Produto {
  id: string; sku: string; codigo_interno: string; nome: string; descricao: string;
  grupo_id: string; unidade_medida: string; preco_custo: number; preco_venda: number;
  estoque_atual: number; estoque_minimo: number; ncm: string; cst: string; cfop_padrao: string;
  peso: number; eh_composto: boolean; ativo: boolean; created_at: string; updated_at?: string; tipo_item: TipoItem;
  variacoes?: string[] | null;
}

type ProdutoFormData = Omit<Produto, "id" | "estoque_atual" | "created_at" | "updated_at"> & { id?: string; variacoes_texto: string };

interface ComposicaoItem {
  id?: string; produto_filho_id: string; quantidade: number; ordem: number;
  nome?: string; sku?: string; preco_custo?: number;
}

interface FornecedorLink {
  id?: string; fornecedor_id: string; eh_principal: boolean;
  descricao_fornecedor: string; referencia_fornecedor: string; unidade_fornecedor: string;
  lead_time_dias: number; preco_compra: number; fator_conversao: number;
}

interface UnidadeMedidaOption { id: string; codigo: string; descricao: string; sigla: string | null; }

const UNIDADES_FALLBACK = ["UN", "KG", "MT", "CX", "PC", "LT", "G", "M2", "M3", "ML", "PR", "JG", "KIT", "SC", "RL"];

const emptyProduto: ProdutoFormData = {
  nome: "", sku: "", codigo_interno: "", descricao: "", unidade_medida: "UN",
  preco_custo: 0, preco_venda: 0, estoque_minimo: 0, ncm: "", cst: "", cfop_padrao: "", peso: 0, eh_composto: false,
  grupo_id: "", tipo_item: "produto", variacoes_texto: "", ativo: true,
};

export interface ProdutoFormProps {
  /** Quando true, renderiza sem PageShell (para embutir em modal/drawer). */
  embedded?: boolean;
  /** Modo explícito quando embedded. Default: derivado de embeddedId. */
  embeddedMode?: "create" | "edit";
  /** ID do produto a editar quando embedded. */
  embeddedId?: string;
  /** Callback após salvar com sucesso (embedded). Recebe o id criado/atualizado. */
  onSaved?: (produtoId: string) => void;
  /** Callback para fechar (embedded). */
  onCancel?: () => void;
  /** Reportar mudanças de dirty state ao container (embedded). */
  onDirtyChange?: (dirty: boolean) => void;
}

export default function ProdutoForm({
  embedded = false,
  embeddedMode,
  embeddedId,
  onSaved,
  onCancel,
  onDirtyChange,
}: ProdutoFormProps = {}) {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const id = embedded ? embeddedId : params.id;
  const queryClient = useQueryClient();
  const mode: "create" | "edit" = embedded
    ? (embeddedMode ?? (embeddedId ? "edit" : "create"))
    : (id ? "edit" : "create");
  const { pushView } = useRelationalNavigation();

  const [loading, setLoading] = useState(mode === "edit");
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  const { form, setForm, updateForm, reset: resetForm, markPristine, isDirty } = useEditDirtyForm<ProdutoFormData>(emptyProduto);
  const { saving, submit } = useSubmitLock();
  useBeforeUnloadGuard(isDirty && !embedded);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const [editComposicao, setEditComposicao] = useState<ComposicaoItem[]>([]);
  const [editFornecedores, setEditFornecedores] = useState<FornecedorLink[]>([]);
  const [margemOverride, setMargemOverride] = useState<number | null>(mode === "create" ? 30 : null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [grupos, setGrupos] = useState<{ id: string; nome: string; sigla?: string | null }[]>([]);
  const [fornecedoresList, setFornecedoresList] = useState<{ id: string; nome_razao_social: string }[]>([]);
  const [unidadesMedida, setUnidadesMedida] = useState<UnidadeMedidaOption[]>([]);
  const { buscarNcm, loading: ncmLoading } = useNcmLookup();
  const { confirm: confirmAction, dialog: confirmActionDialog } = useConfirmDialog();

  const { isUnique: skuUnico, isLoading: skuChecking } = useFieldUnique(
    "produtos", "sku", form.sku || "", editingProduct?.id, { minLength: 2 },
  );

  // Dialog: Nova Unidade
  const [novaUnidadeDialogOpen, setNovaUnidadeDialogOpen] = useState(false);
  const [novaUnidadeForm, setNovaUnidadeForm] = useState({ codigo: "", descricao: "", sigla: "" });
  const [savingNovaUnidade, setSavingNovaUnidade] = useState(false);
  // Dialog: Sigla do Grupo
  const [siglaDialogOpen, setSiglaDialogOpen] = useState(false);
  const [siglaInput, setSiglaInput] = useState("");
  const [savingSigla, setSavingSigla] = useState(false);

  // Lookups com cache compartilhado.
  const { data: grupoLookup } = useQuery({ queryKey: ["produtos", "lookup", "grupos-ativos"], queryFn: listGruposAtivos, staleTime: 5 * 60 * 1000 });
  const { data: fornecedorLookup } = useQuery({ queryKey: ["produtos", "lookup", "fornecedores"], queryFn: listFornecedoresParaProduto, staleTime: 5 * 60 * 1000 });
  const { data: unidadeLookup } = useQuery({ queryKey: ["produtos", "lookup", "unidades-medida"], queryFn: listUnidadesMedidaAtivas, staleTime: 5 * 60 * 1000 });
  useEffect(() => { if (grupoLookup) setGrupos(grupoLookup); }, [grupoLookup]);
  useEffect(() => { if (fornecedorLookup) setFornecedoresList(fornecedorLookup); }, [fornecedorLookup]);
  useEffect(() => { if (unidadeLookup) setUnidadesMedida(unidadeLookup as UnidadeMedidaOption[]); }, [unidadeLookup]);

  // Lookup de produtos para autocompletar componentes (apenas se composto).
  const { data: produtosLookup = [] } = useQuery({
    queryKey: ["produtos", "lookup", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, sku, codigo_interno, preco_custo, variacoes")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as unknown as Produto[];
    },
    staleTime: 60 * 1000,
    enabled: form.eh_composto || mode === "edit",
  });

  // Carregamento inicial em modo edit.
  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: p, error } = await supabase.from("produtos").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!p) { toast.error("Produto não encontrado"); navigate("/produtos", { replace: true }); return; }
        if (cancelled) return;
        const prod = p as unknown as Produto;
        setEditingProduct(prod);
        const variacoesTexto = Array.isArray(prod.variacoes) ? prod.variacoes.join(", ") : "";
        resetForm({
          id: prod.id,
          nome: prod.nome, sku: prod.sku || "", codigo_interno: prod.codigo_interno || "", descricao: prod.descricao || "",
          unidade_medida: prod.unidade_medida, preco_custo: prod.preco_custo || 0, preco_venda: prod.preco_venda,
          estoque_minimo: prod.estoque_minimo || 0, ncm: (prod.ncm || "").replace(/\D/g, ''),
          cst: prod.cst || "", cfop_padrao: prod.cfop_padrao || "",
          peso: prod.peso || 0, eh_composto: prod.eh_composto || false,
          grupo_id: prod.grupo_id || "",
          tipo_item: prod.tipo_item || "produto",
          variacoes_texto: variacoesTexto,
          ativo: prod.ativo !== false,
        });
        const [compData, fornData] = await Promise.all([
          prod.eh_composto ? listProdutoComposicao(prod.id) : Promise.resolve([]),
          listProdutoFornecedores(prod.id),
        ]);
        if (cancelled) return;
        setEditComposicao(compData.map((c) => ({
          id: c.id, produto_filho_id: c.produto_filho_id, quantidade: c.quantidade, ordem: c.ordem,
          nome: c.produtos?.nome, sku: c.produtos?.sku, preco_custo: c.produtos?.preco_custo,
        })));
        setEditFornecedores(fornData.map((f) => ({
          id: f.id, fornecedor_id: f.fornecedor_id, eh_principal: f.eh_principal || false,
          descricao_fornecedor: f.descricao_fornecedor || "", referencia_fornecedor: f.referencia_fornecedor || "",
          unidade_fornecedor: f.unidade_fornecedor || "", lead_time_dias: f.lead_time_dias || 0,
          preco_compra: f.preco_compra || 0, fator_conversao: f.fator_conversao ?? 1,
        })));
        setMargemOverride(null);
      } catch (err) {
        notifyError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega 1x por id
  }, [id, mode]);

  // Cálculos derivados
  const custoComposto = editComposicao.reduce((s, c) => {
    const prod = produtosLookup.find((p) => p.id === c.produto_filho_id);
    return s + c.quantidade * (prod?.preco_custo || 0);
  }, 0);
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

  const produtosDisponiveis = useMemo(() => produtosLookup, [produtosLookup]);

  // Helpers de itens dinâmicos
  const addComponent = () =>
    setEditComposicao([...editComposicao, { produto_filho_id: "", quantidade: 1, ordem: editComposicao.length + 1 }]);
  const removeComponent = (idx: number) => setEditComposicao(editComposicao.filter((_, i) => i !== idx));
  const updateComponent = (idx: number, field: keyof ComposicaoItem, value: ComposicaoItem[keyof ComposicaoItem]) =>
    setEditComposicao(editComposicao.map((c, i) => i === idx ? { ...c, [field]: value } : c));

  const addFornecedor = () =>
    setEditFornecedores([...editFornecedores, { fornecedor_id: "", eh_principal: editFornecedores.length === 0, descricao_fornecedor: "", referencia_fornecedor: "", unidade_fornecedor: "", lead_time_dias: 0, preco_compra: 0, fator_conversao: 1 }]);
  const removeFornecedor = (idx: number) => setEditFornecedores(editFornecedores.filter((_, i) => i !== idx));
  const updateFornecedor = (idx: number, field: keyof FornecedorLink, value: FornecedorLink[keyof FornecedorLink]) =>
    setEditFornecedores(editFornecedores.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  const setPrincipalFornecedor = (idx: number) =>
    setEditFornecedores(editFornecedores.map((f, i) => ({ ...f, eh_principal: i === idx })));

  const handleBack = async () => {
    if (isDirty) {
      const ok = await confirmAction({
        title: "Descartar alterações?",
        description: "Há alterações não salvas. Deseja sair mesmo assim?",
        confirmLabel: "Descartar",
        confirmVariant: "destructive",
      });
      if (!ok) return;
    }
    if (embedded) onCancel?.();
    else navigate("/produtos");
  };

  const saveAndNewRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dataParaValidar = {
      nome: form.nome, sku: form.sku, codigo_interno: form.codigo_interno, descricao: form.descricao,
      unidade_medida: form.unidade_medida,
      preco_custo: Number(form.preco_custo) || 0, preco_venda: Number(form.preco_venda) || 0,
      estoque_minimo: Number(form.estoque_minimo) || 0,
      ncm: form.ncm, cst: form.cst, cfop_padrao: form.cfop_padrao,
      peso: Number(form.peso) || 0, eh_composto: !!form.eh_composto, grupo_id: form.grupo_id,
    };
    const isInsumo = form.tipo_item === "insumo";
    const validation = validateForm(isInsumo ? produtoInsumoSchema : produtoSchema, dataParaValidar);
    if (!validation.success) {
      setFormErrors(validation.errors);
      const firstErr = Object.values(validation.errors)[0];
      toast.error(firstErr || "Verifique os campos do formulário");
      return;
    }
    setFormErrors({});

    if (form.sku && skuChecking) { toast.error("Aguarde a verificação do SKU."); return; }
    if (form.sku && skuUnico === false) {
      setFormErrors((prev) => ({ ...prev, sku: "SKU já cadastrado em outro produto." }));
      toast.error("SKU já cadastrado em outro produto.");
      return;
    }

    if (form.eh_composto && editComposicao.length === 0) { toast.error("Produto composto precisa de ao menos um componente"); return; }
    if (form.eh_composto && editComposicao.some((c) => !c.produto_filho_id)) { toast.error("Selecione o produto para todos os componentes"); return; }
    const fornDups = editFornecedores.map(f => f.fornecedor_id).filter(Boolean);
    if (editFornecedores.some(f => !f.fornecedor_id)) { toast.error("Selecione o fornecedor para todos os vínculos ou remova os vazios"); return; }
    if (fornDups.length !== new Set(fornDups).size) { toast.error("Fornecedor duplicado: o mesmo fornecedor não pode ser vinculado duas vezes"); return; }

    await submit(async () => {
      const variacoesArr = form.variacoes_texto
        ? form.variacoes_texto.split(",").map((v) => v.trim()).filter(Boolean)
        : [];
      const { variacoes_texto: _vt, id: _id, ...rest } = form;
      const ncmDigits = (form.ncm || "").replace(/\D/g, "");
      const payload: Record<string, unknown> = {
        ...rest,
        ncm: ncmDigits,
        variacoes: variacoesArr.length > 0 ? variacoesArr : null,
        preco_custo: form.eh_composto ? custoComposto : form.preco_custo,
      };
      if (mode === "create") {
        payload.codigo_interno = "";
      } else {
        delete (payload as Record<string, unknown>).codigo_interno;
      }

      let produtoId: string;
      try {
        if (mode === "create") {
          const { data: created, error } = await supabase.from("produtos").insert(payload as never).select("*").single();
          if (error) throw error;
          produtoId = (created as { id: string }).id;
        } else if (id) {
          const { error } = await supabase.from("produtos").update(payload as never).eq("id", id);
          if (error) throw error;
          produtoId = id;
        } else {
          return;
        }

        const composicaoItens = form.eh_composto
          ? editComposicao.filter((c) => c.produto_filho_id).map((c) => ({ produto_filho_id: c.produto_filho_id, quantidade: c.quantidade }))
          : [];
        await saveProdutoComposicao({ produtoPaiId: produtoId, itens: composicaoItens, ehComposto: !!form.eh_composto });

        const fornecedoresPayload = editFornecedores.filter((f) => f.fornecedor_id).map((f) => ({
          fornecedor_id: f.fornecedor_id, eh_principal: f.eh_principal ?? false,
          descricao_fornecedor: f.descricao_fornecedor || "", referencia_fornecedor: f.referencia_fornecedor || "",
          unidade_fornecedor: f.unidade_fornecedor || "",
          lead_time_dias: f.lead_time_dias ?? null, preco_compra: f.preco_compra ?? null, fator_conversao: f.fator_conversao ?? 1,
        }));
        await saveProdutoFornecedores({ produtoId, itens: fornecedoresPayload });

        markPristine();
        queryClient.invalidateQueries({ queryKey: ["produtos"] });
        toast.success(mode === "create" ? "Produto criado com sucesso" : "Produto atualizado");

        if (saveAndNewRef.current && mode === "create") {
          saveAndNewRef.current = false;
          if (embedded) {
            // Reseta o form para nova criação dentro do mesmo modal.
            resetForm(emptyProduto);
            setEditingProduct(null);
            setEditComposicao([]);
            setEditFornecedores([]);
            setMargemOverride(30);
          } else {
            navigate("/produtos/novo", { replace: true });
          }
        } else {
          if (embedded) onSaved?.(produtoId);
          else navigate("/produtos");
        }
      } catch (err) {
        notifyError(err);
      }
    });
  };

  const handleSaveAndNew = () => {
    saveAndNewRef.current = true;
    document.getElementById("produto-form")?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  };

  const handleSalvarNovaUnidade = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigo = novaUnidadeForm.codigo.trim();
    const descricao = novaUnidadeForm.descricao.trim();
    if (!codigo) { toast.error("Código é obrigatório"); return; }
    if (!descricao) { toast.error("Descrição é obrigatória"); return; }
    setSavingNovaUnidade(true);
    try {
      const inserted = await createUnidadeMedida({
        codigo, descricao, sigla: novaUnidadeForm.sigla.trim() || null,
      });
      const nova = inserted as UnidadeMedidaOption;
      setUnidadesMedida((prev) => [...prev, nova].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      updateForm({ unidade_medida: nova.codigo });
      setNovaUnidadeDialogOpen(false);
      setNovaUnidadeForm({ codigo: "", descricao: "", sigla: "" });
      toast.success(`Unidade "${nova.codigo}" criada com sucesso`);
    } catch (err) {
      notifyError(err);
    } finally {
      setSavingNovaUnidade(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const titleText = mode === "create" ? "Novo Produto" : "Editar Produto";

  const headerTitle = (
    <div className="flex flex-col min-w-0">
      <span className="text-xs sm:text-sm text-muted-foreground font-medium leading-tight">{titleText}</span>
      {mode === "edit" && editingProduct && (
        <>
          <span className="text-base sm:text-lg font-semibold leading-tight truncate">
            {editingProduct.nome || "—"}
          </span>
          {editingProduct.codigo_interno && (
            <span className="font-mono text-[11px] text-muted-foreground leading-tight sm:hidden">
              {editingProduct.codigo_interno}
            </span>
          )}
          {editingProduct.codigo_interno && (
            <span className="hidden sm:inline ml-0 font-mono text-xs text-muted-foreground">
              {editingProduct.codigo_interno}
            </span>
          )}
        </>
      )}
    </div>
  );
  const headerSubtitle =
    mode === "edit" && editingProduct
      ? <>Atualizado em {editingProduct.updated_at ? formatDate(editingProduct.updated_at) : "—"}</>
      : "Preencha nome, SKU, unidade e grupo. Outras seções (estoque, preços, fiscal) ficam disponíveis após salvar.";
  // Status agora é controlado exclusivamente pelo toggle nas headerActions
  const headerBadge = undefined;
  const headerActions = (
    <div className="flex items-center gap-2">
      {mode === "edit" && editingProduct && (
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={form.ativo}
            onCheckedChange={(v) => updateForm({ ativo: v })}
            aria-label={form.ativo ? "Inativar produto" : "Reativar produto"}
          />
          <span className="font-medium">{form.ativo ? "Ativo" : "Inativo"}</span>
        </label>
      )}
      {/* Ações secundárias visíveis em sm+; no mobile vão para o kebab */}
      {mode === "edit" && editingProduct && (
        <Button type="button" variant="ghost" size="sm" className="hidden sm:inline-flex h-8 px-2 text-xs"
          onClick={() => pushView("produto", editingProduct.id)}>
          Ver resumo
        </Button>
      )}
      {mode === "create" && (
        <Button type="button" variant="outline" onClick={handleSaveAndNew} disabled={saving} className="hidden sm:inline-flex">
          Salvar e novo
        </Button>
      )}
      {/* Kebab no mobile com ações secundárias */}
      {(mode === "edit" || mode === "create") && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="sm:hidden h-9 w-9" aria-label="Mais ações">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {mode === "edit" && editingProduct && (
              <DropdownMenuItem onClick={() => pushView("produto", editingProduct.id)}>
                Ver resumo
              </DropdownMenuItem>
            )}
            {mode === "create" && (
              <DropdownMenuItem onClick={handleSaveAndNew} disabled={saving}>
                Salvar e novo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {/* Salvar visível somente em sm+; no mobile usamos footer sticky */}
      <Button type="submit" form="produto-form" disabled={saving} className="hidden sm:inline-flex gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Salvando..." : "Salvar"}
      </Button>
      {/* Botão X de fechar — só no mobile, no embedded */}
      {embedded && (
        <Button type="button" variant="ghost" size="icon" className="sm:hidden h-9 w-9" aria-label="Fechar" onClick={handleBack}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  const formBody = (
    <form id="produto-form" onSubmit={handleSubmit} className="space-y-0">
          <Tabs defaultValue="dados-gerais" className="w-full">
            <div className="sticky top-0 z-10 bg-background mb-3 sm:mb-4">
              <TabsListScrollable cols={5}>
                <TabsTrigger value="dados-gerais" className="gap-1.5 px-4 h-10 text-sm sm:text-xs sm:px-2 sm:h-9 shrink-0 sm:shrink"><Package className="h-3.5 w-3.5" />Dados Gerais</TabsTrigger>
                <TabsTrigger value="estoque" className="gap-1.5 px-4 h-10 text-sm sm:text-xs sm:px-2 sm:h-9 shrink-0 sm:shrink"><Archive className="h-3.5 w-3.5" />Estoque</TabsTrigger>
                <TabsTrigger value="fiscal" className="gap-1.5 px-4 h-10 text-sm sm:text-xs sm:px-2 sm:h-9 shrink-0 sm:shrink"><FileText className="h-3.5 w-3.5" />Fiscal</TabsTrigger>
                <TabsTrigger value="compras" className="gap-1.5 px-4 h-10 text-sm sm:text-xs sm:px-2 sm:h-9 shrink-0 sm:shrink"><ShoppingCart className="h-3.5 w-3.5" />Compras</TabsTrigger>
                <TabsTrigger value="observacoes" className="gap-1.5 px-4 h-10 text-sm sm:text-xs sm:px-2 sm:h-9 shrink-0 sm:shrink"><AlignLeft className="h-3.5 w-3.5" />Obs.</TabsTrigger>
              </TabsListScrollable>
            </div>

            {/* DADOS GERAIS */}
            <TabsContent value="dados-gerais" className="space-y-4 mt-0 min-h-[420px]">
              <div className="space-y-3 pt-1">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Identificação</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Nome *</Label>
                    <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Nome do produto" />
                    {formErrors.nome && <p className="text-xs text-destructive">{formErrors.nome}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">SKU comercial <span className="text-muted-foreground font-normal text-xs">(código de venda)</span></Label>
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
                      <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9"
                        title="Gerar SKU automaticamente pela sigla do grupo" aria-label="Gerar SKU automaticamente"
                        disabled={!form.grupo_id || !grupos.find(g => g.id === form.grupo_id)?.sigla}
                        onClick={async () => {
                          try {
                            const next = await proximoSkuDoGrupo(form.grupo_id);
                            setForm({ ...form, sku: next });
                            toast.success(`SKU sugerido: ${next}`);
                          } catch (err) { toast.error((err as Error).message); }
                        }}>
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {skuChecking && form.sku && <p className="text-xs text-muted-foreground">Verificando SKU...</p>}
                    {!skuChecking && skuUnico === false && <p className="text-xs text-destructive">SKU já cadastrado em outro produto.</p>}
                    {form.grupo_id && !grupos.find(g => g.id === form.grupo_id)?.sigla && (
                      <p className="text-[11px] text-muted-foreground">Defina sigla no grupo para gerar SKU automático.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Código Interno (ERP)
                      <span className="text-muted-foreground font-normal text-xs">(sequencial — gerado automaticamente)</span>
                    </Label>
                    <Input value={form.codigo_interno} readOnly disabled
                      className="font-mono bg-muted/40"
                      placeholder={mode === "create" ? "Será gerado ao salvar" : ""}
                      title="Código sequencial interno do ERP — não editável" />
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
                        <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9"
                          title="Editar sigla do grupo (usada para gerar SKU)" aria-label="Editar sigla do grupo"
                          onClick={() => {
                            const g = grupos.find(g => g.id === form.grupo_id);
                            setSiglaInput(g?.sigla || "");
                            setSiglaDialogOpen(true);
                          }}>
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
                            : UNIDADES_FALLBACK.map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9"
                        title="Criar nova unidade de medida" aria-label="Criar nova unidade de medida"
                        onClick={() => { setNovaUnidadeForm({ codigo: "", descricao: "", sigla: "" }); setNovaUnidadeDialogOpen(true); }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Classificação</Label>
                    <Select value={form.tipo_item || "produto"} onValueChange={(v) => setForm({ ...form, tipo_item: v as TipoItem })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="produto">Produto</SelectItem>
                        <SelectItem value="insumo">Insumo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/40 border space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo de composição</Label>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm ${!form.eh_composto ? "font-semibold" : "text-muted-foreground"}`}>Simples</span>
                    <Switch checked={form.eh_composto}
                      onCheckedChange={async (v) => {
                        if (!v && editComposicao.length > 0) {
                          const ok = await confirmAction({
                            title: "Desmarcar produto composto?",
                            description: `Desmarcar produto composto irá apagar os ${editComposicao.length} componente(s) ao salvar. Deseja continuar?`,
                            confirmLabel: "Continuar", confirmVariant: "destructive",
                          });
                          if (!ok) return;
                        }
                        setForm({ ...form, eh_composto: v }); if (!v) setEditComposicao([]);
                      }} />
                    <span className={`text-sm ${form.eh_composto ? "font-semibold" : "text-muted-foreground"}`}>Composto</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {form.eh_composto
                      ? "Custo calculado pelos componentes."
                      : "Custo informado manualmente."}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2 border-t pt-3"><TrendingUp className="w-4 h-4" /> Comercial</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {!form.eh_composto ? (
                    <div className="space-y-2">
                      <Label>Preço de Custo</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                        <Input type="number" step="0.01" min="0" className="pl-9" value={form.preco_custo} onChange={(e) => setForm({ ...form, preco_custo: Number(e.target.value) })} />
                      </div>
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
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                      <Input type="number" step="0.01" min="0" className="pl-9" value={form.preco_venda} onChange={(e) => setForm({ ...form, preco_venda: Number(e.target.value) })} />
                    </div>
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
                      {custoParaCalculo > 0 ? `${margemPercent.toFixed(1).replace(".", ",")}%` : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t pt-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Tag className="w-4 h-4" /> Variações Comerciais</h3>
                <div className="space-y-2">
                  <Input value={form.variacoes_texto} onChange={(e) => setForm({ ...form, variacoes_texto: e.target.value })}
                    placeholder="Ex: Azul, Vermelho, Verde, P, M, G" />
                  <p className="text-xs text-muted-foreground">
                    Separe por vírgula. Ex.: <em>Azul, Vermelho, P, M, G</em>.
                  </p>
                  {form.variacoes_texto && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {form.variacoes_texto.split(",").map((v) => v.trim()).filter(Boolean).map((v, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 font-medium">{v}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ESTOQUE */}
            <TabsContent value="estoque" className="space-y-4 mt-0 min-h-[420px]">
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Archive className="w-4 h-4" /> Suprimentos e Logística</h3>
                {mode === "edit" && editingProduct && (() => {
                  const atual = Number(editingProduct.estoque_atual ?? 0);
                  const reservado = Number(((editingProduct as unknown) as { estoque_reservado?: number | null }).estoque_reservado ?? 0);
                  const disponivel = atual - reservado;
                  const min = Number(editingProduct.estoque_minimo ?? 0);
                  const controla = !(atual === 0 && min === 0);
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border bg-muted/20 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estoque atual</p>
                        <p className="font-mono font-semibold text-sm">{atual} {editingProduct.unidade_medida}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Reservado</p>
                        <p className="font-mono font-semibold text-sm">{reservado} {editingProduct.unidade_medida}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disponível</p>
                        <p className={`font-mono font-semibold text-sm ${disponivel < 0 ? "text-destructive" : ""}`}>{disponivel} {editingProduct.unidade_medida}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Controla estoque?</p>
                        <p className="font-semibold text-sm">{controla ? "Sim" : "Não"}</p>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-2">
                    <Label>Estoque Mínimo</Label>
                    <Input type="number" min="0" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })} />
                    {Number(form.estoque_minimo) === 0 && (
                      <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-warning">Sem estoque mínimo definido.</span>{" "}
                          Defina um valor para que o sistema alerte quando o produto precisar de reposição.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Peso Unitário (kg)</Label>
                    <Input type="number" step="0.001" min="0" value={form.peso} onChange={(e) => setForm({ ...form, peso: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* FISCAL */}
            <TabsContent value="fiscal" className="space-y-4 mt-0 min-h-[420px]">
              {!fiscalCompleto && (() => {
                const faltantes = [!form.ncm && "NCM", !form.cst && "CST", !form.cfop_padrao && "CFOP"].filter(Boolean) as string[];
                return (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-warning">Cadastro fiscal incompleto</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Preencha NCM, CST e CFOP padrão para evitar bloqueios em notas fiscais.
                        {faltantes.length > 0 && (
                          <> Faltam: <strong className="text-foreground">{faltantes.join(", ")}</strong>.</>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Dados Fiscais
                  {fiscalCompleto && (
                    <span className="ml-1 text-xs text-success font-normal flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completo</span>
                  )}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="space-y-2">
                    <Label>CST</Label>
                    <FiscalAutocomplete data={cstIcmsCodes} value={form.cst} onChange={(v) => setForm({ ...form, cst: v })} placeholder="Ex: 000" />
                    <p className="text-xs text-muted-foreground">Situação tributária do ICMS.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>CFOP Padrão</Label>
                    <FiscalAutocomplete data={cfopCodes} value={form.cfop_padrao} onChange={(v) => setForm({ ...form, cfop_padrao: v })} placeholder="Ex: 5102" />
                    <p className="text-xs text-muted-foreground">Código fiscal de operações.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>NCM</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input value={form.ncm || ''} onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                          setForm({ ...form, ncm: val });
                        }}
                        placeholder="Ex: 84713012"
                        className={`flex-1 font-mono ${form.ncm && (form.ncm.length < 4 || form.ncm.length > 8) ? "border-destructive" : ""}`}
                        maxLength={8} />
                      <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs w-full sm:w-auto"
                        disabled={ncmLoading || (form.ncm || '').replace(/\D/g, '').length < 4}
                        onClick={async () => {
                          const result = await buscarNcm(form.ncm || '');
                          if (result) setForm({ ...form, ncm: result.codigo });
                        }}>
                       {ncmLoading ? '...' : 'Verificar NCM'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">4–8 dígitos (tabela TIPI).</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* COMPRAS */}
            <TabsContent value="compras" className="space-y-4 mt-0 min-h-[420px]">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Compras / Fornecedores</h3>
                  <Button type="button" size="sm" variant="outline" onClick={addFornecedor} className="gap-1">
                    <Plus className="w-3 h-3" /> Fornecedor
                  </Button>
                </div>
                {editFornecedores.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-muted/20 p-6 flex flex-col items-center justify-center text-center space-y-2">
                    <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium">Nenhum fornecedor vinculado</p>
                    <p className="text-xs text-muted-foreground max-w-md">
                      Vincule fornecedores para registrar código do fornecedor, custo de compra, prazo e histórico de aquisição.
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={addFornecedor} className="gap-1 mt-1">
                      <Plus className="w-3.5 h-3.5" /> Vincular fornecedor
                    </Button>
                  </div>
                )}
                {editFornecedores.map((forn, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-3 bg-muted/20">
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Fornecedor *</Label>
                        <Select value={forn.fornecedor_id} onValueChange={(v) => updateFornecedor(idx, "fornecedor_id", v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {fornecedoresList.map(f => <SelectItem key={f.id} value={f.id}>{f.nome_razao_social}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:pb-1">
                        <div className="flex items-center gap-2">
                          <Switch checked={forn.eh_principal} onCheckedChange={() => setPrincipalFornecedor(idx)} />
                          <Label className="text-xs cursor-pointer whitespace-nowrap">Principal</Label>
                        </div>
                        <Button type="button" size="icon" variant="ghost" aria-label="Remover fornecedor" className="h-9 w-9 text-destructive shrink-0" onClick={() => removeFornecedor(idx)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
                        <Input type="number" step="any" min="0" className="h-9" value={forn.fator_conversao}
                          onChange={(e) => updateFornecedor(idx, "fator_conversao", Number(e.target.value))} placeholder="1" />
                        <p className="text-[10px] text-muted-foreground">
                          1 {forn.unidade_fornecedor || "un. forn."} = {forn.fator_conversao || 1} {form.unidade_medida || "un. interna"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Lead Time (dias)</Label>
                        <Input type="number" min="0" className="h-9" value={forn.lead_time_dias}
                          onChange={(e) => updateFornecedor(idx, "lead_time_dias", Number(e.target.value))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Preço de Compra</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                          <Input type="number" step="0.01" min="0" className="h-9 pl-9" value={forn.preco_compra}
                            onChange={(e) => updateFornecedor(idx, "preco_compra", Number(e.target.value))} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {form.eh_composto && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-t pt-3">
                    <h3 className="font-semibold text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Composição</h3>
                    <Button type="button" size="sm" variant="outline" onClick={addComponent} className="gap-1"><Plus className="w-3 h-3" /> Componente</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">O custo do produto composto é calculado automaticamente pela soma dos componentes abaixo.</p>
                  {editComposicao.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum componente adicionado</p>}
                  {editComposicao.map((comp, idx) => {
                    const prod = produtosLookup.find((p) => p.id === comp.produto_filho_id);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="grid grid-cols-[1fr_72px_40px] sm:grid-cols-[1fr_100px_80px_40px] gap-2 items-end">
                          <div className="space-y-1"><Label className="text-xs">Produto</Label>
                            <ProductAutocomplete products={produtosDisponiveis} value={comp.produto_filho_id}
                              onChange={(v) => updateComponent(idx, "produto_filho_id", v)} placeholder="Buscar produto..." />
                          </div>
                          <div className="space-y-1"><Label className="text-xs">Qtd</Label>
                            <Input type="number" min={0.01} step="0.01" value={comp.quantidade}
                              onChange={(e) => updateComponent(idx, "quantidade", Number(e.target.value))} className="h-9" />
                          </div>
                          <div className="hidden sm:block space-y-1"><Label className="text-xs">Custo</Label>
                            <p className="h-9 flex items-center text-xs font-mono text-muted-foreground">
                              {prod ? formatCurrency(comp.quantidade * (prod.preco_custo || 0)) : "—"}
                            </p>
                          </div>
                          <Button type="button" size="icon" variant="ghost" aria-label="Remover componente" className="h-9 w-9 text-destructive" onClick={() => removeComponent(idx)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="sm:hidden text-[11px] text-muted-foreground font-mono pl-1">
                          Custo: {prod ? formatCurrency(comp.quantidade * (prod.preco_custo || 0)) : "—"}
                        </p>
                      </div>
                    );
                  })}
                  {editComposicao.length > 0 && (
                    <div className="border-t pt-3 space-y-2 bg-muted/20 rounded-lg p-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Custo Total Composto</span>
                        <span className="font-mono font-semibold text-primary">{formatCurrency(custoComposto)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Margem (%)</Label>
                          <Input type="number" step="1" value={margemLucro}
                            onChange={(e) => setMargemOverride(Number(e.target.value))} className="h-9" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Preço Sugerido</Label>
                          <div className="h-9 flex items-center">
                            <span className="font-mono font-semibold text-sm">{formatCurrency(precoSugerido)}</span>
                            <Button type="button" size="sm" variant="link" className="ml-2 text-xs h-auto p-0"
                              onClick={() => setForm({ ...form, preco_venda: Number(precoSugerido.toFixed(2)) })}>
                              Usar
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* OBSERVAÇÕES */}
            <TabsContent value="observacoes" className="space-y-4 mt-0 min-h-[420px]">
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><AlignLeft className="w-4 h-4" /> Descrição comercial</h3>
                <p className="text-xs text-muted-foreground">Texto exibido em orçamentos, pedidos e catálogos.</p>
                <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Características, especificações técnicas, conteúdo da embalagem…" rows={4} />
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                <p className="text-sm font-medium">Observação interna</p>
                <p className="text-xs text-muted-foreground">
                  Para anotações internas que não devem aparecer em documentos comerciais, use o campo <strong>Observação</strong> dentro do orçamento ou pedido.
                </p>
              </div>
            </TabsContent>
          </Tabs>
    </form>
  );

  const auxDialogs = (
    <>

      {/* Dialog: Nova Unidade */}
      <Dialog open={novaUnidadeDialogOpen} onOpenChange={(v) => { if (!v) setNovaUnidadeDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Unidade de Medida</DialogTitle></DialogHeader>
          <form onSubmit={handleSalvarNovaUnidade} className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>Código <span className="text-destructive">*</span></Label>
              <Input value={novaUnidadeForm.codigo}
                onChange={(e) => setNovaUnidadeForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                placeholder="Ex: UN, KG, MT, CX" maxLength={10} autoFocus />
              <p className="text-[11px] text-muted-foreground">Código curto em maiúsculas. Ex: KG, MT, LT.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição <span className="text-destructive">*</span></Label>
              <Input value={novaUnidadeForm.descricao}
                onChange={(e) => setNovaUnidadeForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Ex: Quilograma, Metro, Litro" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label>Sigla <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Input value={novaUnidadeForm.sigla}
                onChange={(e) => setNovaUnidadeForm((f) => ({ ...f, sigla: e.target.value }))}
                placeholder="Ex: kg, m, l" maxLength={10} />
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

      {/* Dialog: Sigla do Grupo */}
      <Dialog open={siglaDialogOpen} onOpenChange={(v) => { if (!v) setSiglaDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sigla do Grupo</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              A sigla é usada como prefixo do SKU dos produtos deste grupo.
              Ex.: sigla <strong>AG</strong> gera <code className="font-mono">AG001, AG002, AG003…</code>
            </p>
            <div className="space-y-1.5">
              <Label>Sigla <span className="text-destructive">*</span></Label>
              <Input value={siglaInput}
                onChange={(e) => setSiglaInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                placeholder="Ex: AG" maxLength={4} autoFocus className="font-mono" />
              <p className="text-[11px] text-muted-foreground">2 a 4 caracteres (letras/números). Maiúsculas.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSiglaDialogOpen(false)}>Cancelar</Button>
              <Button type="button" disabled={savingSigla || siglaInput.length < 2} className="gap-1.5"
                onClick={async () => {
                  if (!form.grupo_id) return;
                  setSavingSigla(true);
                  try {
                    await updateGrupoSigla(form.grupo_id, siglaInput);
                    setGrupos((prev) => prev.map(g => g.id === form.grupo_id ? { ...g, sigla: siglaInput } : g));
                    toast.success("Sigla atualizada.");
                    setSiglaDialogOpen(false);
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setSavingSigla(false);
                  }
                }}>
                {savingSigla ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {confirmActionDialog}
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 border-b bg-background/95 px-1 pb-3 mb-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {headerTitle}
              {headerBadge}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{headerSubtitle}</p>
          </div>
          <div className="shrink-0">{headerActions}</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {formBody}
        </div>
        {auxDialogs}
      </div>
    );
  }

  return (
    <>
      <PageShell
        backTo={handleBack}
        maxWidth="5xl"
        title={headerTitle}
        subtitle={headerSubtitle}
        badge={headerBadge}
        actions={headerActions}
      >
        {formBody}
      </PageShell>
      {auxDialogs}
    </>
  );
}