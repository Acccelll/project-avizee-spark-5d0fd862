import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useLocation } from "react-router-dom";
import { useUrlListState } from "@/hooks/useUrlListState";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { ModulePage } from "@/components/ModulePage";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { useViaCep } from "@/hooks/useViaCep";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { useDocumentoUnico } from "@/hooks/useDocumentoUnico";
import { useEditDeepLink } from "@/hooks/useEditDeepLink";
import {
  listProdutosDoFornecedor,
  listComprasDoFornecedor,
  deleteProdutoFornecedor,
} from "@/services/fornecedores.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Search, User2, Phone, ShoppingCart, MapPin,
  Info, Loader2, Calendar, Mail, CheckCircle2, Handshake, BadgeCheck, Package,
  Users, UserCheck, UserX, Trash2, Plus,
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/format";
import { clienteFornecedorSchema, validateForm } from "@/lib/validationSchemas";
import { SummaryCard } from "@/components/SummaryCard";
import { UF_OPTIONS } from "@/constants/brasil";
import { AddProdutoFornecedor } from "@/components/fornecedores/AddProdutoFornecedor";
import { notifyError } from "@/utils/errorMessages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useCan } from "@/hooks/useCan";
import { QuickAddSupplierModal } from "@/components/QuickAddSupplierModal";
import { MobileQuickAddFAB } from "@/components/MobileQuickAddFAB";
import { ContactInlineActions } from "@/components/ui/MobileCardActions";
import { logger } from "@/lib/logger";

const MAX_OBSERVACOES_LENGTH = 2000;
const MAX_PRAZO_DAYS = 365;
const MIN_NOME_RAZAO_SOCIAL_LENGTH = 2;

interface Fornecedor {
  id: string;tipo_pessoa: string;nome_razao_social: string;nome_fantasia: string;
  cpf_cnpj: string;inscricao_estadual: string;email: string;telefone: string;celular: string;
  contato: string;prazo_padrao: number;logradouro: string;numero: string;complemento: string;
  bairro: string;cidade: string;uf: string;cep: string;pais: string;
  observacoes: string;ativo: boolean;created_at: string;updated_at: string;
}

const emptyForm: Omit<Fornecedor, "id" | "created_at" | "updated_at"> = {
  tipo_pessoa: "J", nome_razao_social: "", nome_fantasia: "", cpf_cnpj: "",
  inscricao_estadual: "", email: "", telefone: "", celular: "", contato: "",
  prazo_padrao: 30, logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", cep: "", pais: "Brasil", observacoes: "", ativo: true,
};

const Fornecedores = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm: confirmDiscard, dialog: discardDialog } = useConfirmDialog();
  const { can } = useCan();
  const canExcluir = can("fornecedores:excluir");
  const { value: filterValue, set: setFilter, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      tipo: { type: "stringArray" },
      ativo: { type: "stringArray" },
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const tipoFilters = filterValue.tipo;
  const setTipoFilters = (v: string[]) => setFilter({ tipo: v });
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const debouncedSearch = useDebounce(searchTerm, 350);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEditDeepLink<Fornecedor>({
    table: "fornecedores",
    onLoad: (f) => openEdit(f),
  });

  const serverFilters = useMemo(() => {
    const out: Array<{ column: string; value: string | string[] | boolean | boolean[]; operator?: "eq" | "in" }> = [];
    if (tipoFilters.length === 1) out.push({ column: "tipo_pessoa", value: tipoFilters[0] });
    else if (tipoFilters.length > 1) out.push({ column: "tipo_pessoa", value: tipoFilters, operator: "in" });
    if (ativoFilters.length === 1) {
      out.push({ column: "ativo", value: ativoFilters[0] === "ativo" });
    } else if (ativoFilters.length === 2) {
      // ambos selecionados → sem filtro
    }
    return out;
  }, [tipoFilters, ativoFilters]);

  const sort = useServerSort("nome_razao_social", "asc");
  const {
    data,
    loading,
    create,
    update,
    remove,
    fetchData,
    page,
    setPage,
    totalCount,
    hasMore,
  } = useSupabaseCrud<Fornecedor>({
    table: "fornecedores",
    searchTerm: debouncedSearch,
    filterAtivo: false,
    filter: serverFilters,
    searchColumns: ["nome_razao_social", "nome_fantasia", "cpf_cnpj", "email", "cidade"],
    pageSize: 50,
    orderBy: sort.orderBy,
    ascending: sort.ascending,
  });
  const totalAtivos = useTableCount("fornecedores", { ativo: true }).data ?? null;
  const { pushView } = useRelationalNavigation();
  const { buscarCep, loading: cepLoading } = useViaCep();
  const { buscarCnpj, loading: cnpjLoading } = useCnpjLookup();
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Fornecedor | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState({ ...emptyForm });
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const docTipo = form.tipo_pessoa === "F" ? "cpf" : "cnpj";
  const { isUnique: docUnico, isLoading: docChecking } = useDocumentoUnico(
    docTipo,
    form.cpf_cnpj,
    selected?.id,
    "fornecedores",
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalProdutosForn, setModalProdutosForn] = useState<Array<{
    id: string; produto_nome: string; preco_compra: number | null;
    lead_time_dias: number | null; eh_principal: boolean | null;
  }>>([]);
  const [modalComprasForn, setModalComprasForn] = useState<{ count: number; ultima: string | null; total: number }>({ count: 0, ultima: null, total: 0 });
  const [loadingFornContext, setLoadingFornContext] = useState(false);

  // Token para descartar resultados de loads obsoletos quando o usuário troca de registro.
  const loadTokenRef = useRef(0);

  const loadFornContext = async (fornecedorId: string, token?: number) => {
    setLoadingFornContext(true);
    try {
      const [pf, compras] = await Promise.all([
        listProdutosDoFornecedor(fornecedorId, 5),
        listComprasDoFornecedor(fornecedorId, 20),
      ]);
      if (token !== undefined && token !== loadTokenRef.current) return;
      setModalProdutosForn(pf.map((p) => ({
        id: p.id,
        produto_nome: p.produtos?.nome || "—",
        preco_compra: p.preco_compra,
        lead_time_dias: p.lead_time_dias,
        eh_principal: p.eh_principal,
      })));
      setModalComprasForn({
        count: compras.length,
        ultima: compras[0]?.data_compra || null,
        total: compras.reduce((s, c) => s + Number(c.valor_total || 0), 0),
      });
    } catch (err) {
      logger.error("[fornecedores] erro ao carregar contexto:", err);
      notifyError(err);
    } finally {
      setLoadingFornContext(false);
    }
  };

  const updateForm = (patch: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  const openCreate = () => {
    loadTokenRef.current += 1;
    setMode("create"); setForm({ ...emptyForm }); setSelected(null); setIsDirty(false);
    setModalProdutosForn([]); setModalComprasForn({ count: 0, ultima: null, total: 0 });
    setModalOpen(true);
  };
  const openEdit = (f: Fornecedor) => {
    const token = ++loadTokenRef.current;
    setMode("edit");setSelected(f);
    setForm({
      tipo_pessoa: f.tipo_pessoa || "J", nome_razao_social: f.nome_razao_social, nome_fantasia: f.nome_fantasia || "",
      cpf_cnpj: f.cpf_cnpj || "", inscricao_estadual: f.inscricao_estadual || "",
      email: f.email || "", telefone: f.telefone || "", celular: f.celular || "", contato: f.contato || "",
      prazo_padrao: f.prazo_padrao || 30, logradouro: f.logradouro || "", numero: f.numero || "",
      complemento: f.complemento || "", bairro: f.bairro || "", cidade: f.cidade || "",
      uf: f.uf || "", cep: f.cep || "", pais: f.pais || "Brasil", observacoes: f.observacoes || "",
      ativo: f.ativo !== false,
    });
    setIsDirty(false);
    setModalProdutosForn([]); setModalComprasForn({ count: 0, ultima: null, total: 0 });
    void loadFornContext(f.id, token);
    setModalOpen(true);
  };

  const openView = (f: Fornecedor) => {
    pushView("fornecedor", f.id);
  };

  const saveAndNewRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateForm(clienteFornecedorSchema, form);
    if (!validation.success) {
      setFormErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError || "Corrija os erros do formulário");
      return;
    }
    if (docChecking) {
      toast.error("Aguarde a verificação do documento antes de salvar.");
      return;
    }
    if (docUnico === false) {
      setFormErrors((prev) => ({ ...prev, cpf_cnpj: "Documento já cadastrado em outra entidade." }));
      toast.error("Documento já cadastrado. Corrija antes de salvar.");
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      if (mode === "create") await create(form);else
      if (selected) await update(selected.id, form);
      setIsDirty(false);
      if (saveAndNewRef.current && mode === "create") {
        saveAndNewRef.current = false;
        setForm({ ...emptyForm });
        setSelected(null);
        setFormErrors({});
      } else {
        setModalOpen(false);
      }
    } catch (err) {
      logger.error('[fornecedores] erro ao salvar:', err);
      notifyError(err);
    }
    setSaving(false);
  };

  const handleSaveAndNew = () => {
    saveAndNewRef.current = true;
    // dispara submit do form
    document.getElementById("fornecedor-form")?.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    );
  };

  // Filtros agora são server-side (`serverFilters`); a lista já vem filtrada.
  const filteredData = data;

  const columns = [
  {
    key: "nome_razao_social",
      mobilePrimary: true, label: "Nome / Razão Social", sortable: true,
    render: (f: Fornecedor) => (
      <div>
        <p className="font-medium leading-tight">{f.nome_razao_social}</p>
        {f.nome_fantasia && f.nome_fantasia !== f.nome_razao_social && (
          <p className="text-xs text-muted-foreground truncate max-w-xs">{f.nome_fantasia}</p>
        )}
      </div>
    ),
  },
  {
    key: "cpf_cnpj",
      mobileCard: true, label: "CPF / CNPJ",
    render: (f: Fornecedor) => <span className="font-mono text-xs">{f.cpf_cnpj || "—"}</span>,
  },
  {
    key: "tipo_pessoa", label: "Tipo",
    render: (f: Fornecedor) => (
      <span className={`text-xs font-semibold ${f.tipo_pessoa === "F" ? "text-info dark:text-info" : "text-accent-foreground dark:text-accent-foreground"}`}>
        {f.tipo_pessoa === "F" ? "PF" : "PJ"}
      </span>
    ),
  },
  {
    key: "contato_principal", label: "Contato",
    render: (f: Fornecedor) => {
      const phone = f.celular || f.telefone;
      if (!phone && !f.email) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <div className="text-xs space-y-0.5">
          {phone && <p className="font-medium tabular-nums">{phone}</p>}
          {f.email && <p className="text-muted-foreground truncate max-w-xs">{f.email}</p>}
        </div>
      );
    },
  },
  {
    key: "prazo_padrao", label: "Prazo", hidden: true,
    render: (f: Fornecedor) => f.prazo_padrao
      ? <span className="font-mono text-xs font-medium">{f.prazo_padrao}d</span>
      : <span className="text-muted-foreground text-xs">—</span>,
  },
  {
    key: "cidade",
      mobileCard: true, label: "Cidade", sortable: true, hidden: true,
    render: (f: Fornecedor) => f.cidade
      ? <span className="text-xs">{f.cidade}{f.uf ? `/${f.uf}` : ""}</span>
      : <span className="text-muted-foreground text-xs">—</span>,
  },
  { key: "ativo",
      mobileCard: true, label: "Status", hidden: true, render: (f: Fornecedor) => <StatusBadge status={f.ativo ? "ativo" : "inativo"} /> },
  ];


  const fornActiveFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    tipoFilters.forEach(f => {
      chips.push({
        key: "tipo",
        label: "Tipo",
        value: [f],
        displayValue: f === "J" ? "Pessoa Jurídica" : "Pessoa Física"
      });
    });
    ativoFilters.forEach(f => {
      chips.push({
        key: "ativo",
        label: "Status",
        value: [f],
        displayValue: f === "ativo" ? "Ativo" : "Inativo"
      });
    });
    return chips;
  }, [tipoFilters, ativoFilters]);

  const handleRemoveFornFilter = (key: string, value?: string) => {
    if (key === "tipo") setTipoFilters(tipoFilters.filter(v => v !== value));
    if (key === "ativo") setAtivoFilters(ativoFilters.filter(v => v !== value));
  };

  const tipoOptions: MultiSelectOption[] = [
    { label: "Pessoa Jurídica", value: "J" },
    { label: "Pessoa Física", value: "F" },
  ];

  const ativoOptions: MultiSelectOption[] = [
    { label: "Ativo", value: "ativo" },
    { label: "Inativo", value: "inativo" },
  ];

  const summaryAtivos = useMemo(() => data.filter(f => f.ativo).length, [data]);

  return (
    <><ModulePage
        title="Fornecedores"
        subtitle="Consulta e gestão de fornecedores"
        addLabel="Novo Fornecedor"
        onAdd={openCreate}
        summaryCards={
          <>
            <SummaryCard title="Total de Fornecedores" value={data.length} icon={Users} />
            <SummaryCard title="Ativos" value={summaryAtivos} icon={UserCheck} variant="success" />
            <div className="hidden md:contents">
              <SummaryCard title="Inativos" value={data.length - summaryAtivos} icon={UserX} />
            </div>
          </>
        }
      >
        
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por razão social, CNPJ, e-mail ou cidade..."
          activeFilters={fornActiveFilters}
          onRemoveFilter={handleRemoveFornFilter}
          onClearAll={() => clearFilters()}
          count={filteredData.length}
        >
          <MultiSelect
            options={ativoOptions}
            selected={ativoFilters}
            onChange={setAtivoFilters}
            placeholder="Status"
            className="w-full sm:w-[140px]"
          />
          <MultiSelect
            options={tipoOptions}
            selected={tipoFilters}
            onChange={setTipoFilters}
            placeholder="Tipos"
            className="w-full sm:w-[150px]"
          />
        </AdvancedFilterBar>

        <PullToRefresh onRefresh={fetchData}>
          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            moduleKey="fornecedores"
            showColumnToggle={true}
            onView={openView}
            onEdit={openEdit}
            onDelete={canExcluir ? (f) => remove(f.id) : undefined}
            deleteBehavior="soft"
            mobileIdentifierKey="cpf_cnpj"
            mobileStatusKey="ativo"
            mobileInlineActions={(f: Fornecedor) => (
              <ContactInlineActions
                phone={f.celular || f.telefone}
                whatsapp={f.celular || f.telefone}
                email={f.email}
                onView={() => openView(f)}
              />
            )}
          />
        </PullToRefresh>
      </ModulePage>
      <MobileQuickAddFAB onClick={() => setQuickAddOpen(true)} label="Novo fornecedor" />
      <QuickAddSupplierModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={() => { setQuickAddOpen(false); fetchData(); toast.success("Fornecedor cadastrado"); }}
      />

      <FormModal
        open={modalOpen}
        onClose={async () => {
          if (isDirty && !(await confirmDiscard())) return;
          setModalOpen(false);
        }}
        title={mode === "create" ? "Novo Fornecedor" : "Editar Fornecedor"}
        size="xl"
        mode={mode}
        createHint="Preencha razão social, CPF/CNPJ e contato principal. Demais dados podem ser complementados depois."
        identifier={mode === "edit" && selected?.cpf_cnpj ? selected.cpf_cnpj : undefined}
        status={mode === "edit" && selected ? <StatusBadge status={selected.ativo ? "ativo" : "inativo"} /> : undefined}
        headerActions={mode === "edit" && selected ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch
              checked={form.ativo}
              onCheckedChange={(v) => updateForm({ ativo: v })}
              aria-label={form.ativo ? "Inativar fornecedor" : "Reativar fornecedor"}
            />
            <span className="font-medium">{form.ativo ? "Ativo" : "Inativo"}</span>
          </label>
        ) : undefined}
        meta={mode === "edit" && selected ? [
          ...(selected.created_at ? [{ icon: Calendar, label: `Cadastrado em ${formatDate(selected.created_at)}` }] : []),
          ...(selected.updated_at && selected.updated_at !== selected.created_at ? [{ icon: BadgeCheck, label: `Atualizado em ${formatDate(selected.updated_at)}` }] : []),
          ...(form.prazo_padrao ? [{ icon: ShoppingCart, label: `Prazo padrão: ${form.prazo_padrao} dias` }] : []),
        ] : undefined}
        isDirty={isDirty}
        footer={
          <FormModalFooter
            saving={saving}
            isDirty={isDirty}
            onCancel={async () => {
              if (isDirty && !(await confirmDiscard())) return;
              setModalOpen(false);
            }}
            submitAsForm
            formId="fornecedor-form"
            mode={mode}
            onSaveAndNew={mode === "create" ? handleSaveAndNew : undefined}
          />
        }
      >
        <form id="fornecedor-form" onSubmit={handleSubmit} className="space-y-0">

          <Tabs defaultValue="dados-gerais" className="w-full">
            <TabsList className="mb-4 w-full justify-start overflow-x-auto">
              <TabsTrigger value="dados-gerais" className="gap-1.5"><User2 className="h-3.5 w-3.5" />Dados Gerais</TabsTrigger>
              <TabsTrigger value="contatos" className="gap-1.5"><Phone className="h-3.5 w-3.5" />Contatos</TabsTrigger>
              <TabsTrigger value="endereco" className="gap-1.5"><MapPin className="h-3.5 w-3.5" />Endereço</TabsTrigger>
              <TabsTrigger value="compras" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" />Compras</TabsTrigger>
              <TabsTrigger value="observacoes" className="gap-1.5"><Handshake className="h-3.5 w-3.5" />Obs.</TabsTrigger>
            </TabsList>

            {/* ── TAB: DADOS GERAIS ─────────────────────────── */}
            <TabsContent value="dados-gerais" className="space-y-4 mt-0">
          <div className="flex items-center gap-2 pb-2">
            <User2 className="w-4 h-4 text-primary/70" />
            <h3 className="font-semibold text-sm">Identificação</h3>
            {form.cpf_cnpj && form.nome_razao_social.length >= MIN_NOME_RAZAO_SOCIAL_LENGTH && (
              <span className="ml-auto flex items-center gap-1 text-xs text-success font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Dados fiscais preenchidos
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="space-y-1.5">
              <Label>Tipo de Pessoa</Label>
              <Select value={form.tipo_pessoa} onValueChange={(v) => updateForm({ tipo_pessoa: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="J">Pessoa Jurídica</SelectItem>
                  <SelectItem value="F">Pessoa Física</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>CPF/CNPJ</Label>
                {form.tipo_pessoa === "J" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">
                      Informe o CNPJ e clique em <strong>Consultar</strong> para preencher automaticamente Razão Social, Nome Fantasia, e-mail, telefone e endereço.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex gap-1">
                <MaskedInput mask="cpf_cnpj" value={form.cpf_cnpj} onChange={(v) => updateForm({ cpf_cnpj: v })} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 px-3 text-xs"
                  disabled={cnpjLoading || form.tipo_pessoa !== "J"}
                  onClick={async () => {
                    const result = await buscarCnpj(form.cpf_cnpj);
                    if (result) {
                       updateForm({
                        nome_razao_social: result.razao_social || form.nome_razao_social,
                        nome_fantasia: result.nome_fantasia || form.nome_fantasia,
                        inscricao_estadual: result.inscricao_estadual || form.inscricao_estadual,
                        email: result.email || form.email,
                        telefone: result.telefone || form.telefone,
                        logradouro: result.logradouro || form.logradouro,
                        numero: result.numero || form.numero,
                        complemento: result.complemento || form.complemento,
                        bairro: result.bairro || form.bairro,
                        cidade: result.municipio || form.cidade,
                        uf: result.uf || form.uf,
                        cep: result.cep || form.cep,
                      });
                    }
                  }}
                >
                  {cnpjLoading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}Consultando...</>
                    : <><Search className="h-3.5 w-3.5" />{" "}Consultar CNPJ</>}
                </Button>
              </div>
              {formErrors.cpf_cnpj && <p className="text-xs text-destructive">{formErrors.cpf_cnpj}</p>}
              {!formErrors.cpf_cnpj && docChecking && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />Verificando unicidade...
                </p>
              )}
              {!formErrors.cpf_cnpj && !docChecking && docUnico === false && (
                <p className="text-xs text-destructive">CPF/CNPJ já cadastrado em cliente ou fornecedor.</p>
              )}
              {form.tipo_pessoa === "J" && !formErrors.cpf_cnpj && (
                <p className="text-xs text-muted-foreground">Consultar CNPJ preenche razão social, endereço e contato automaticamente.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Inscrição Estadual</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-xs">
                    Inscrição Estadual para emissão e recebimento de notas fiscais. Informe "ISENTO" quando aplicável.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input value={form.inscricao_estadual} onChange={(e) => updateForm({ inscricao_estadual: e.target.value })} placeholder="Ex: 123.456.789.000 ou ISENTO" />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-1.5">
              <Label>Nome / Razão Social <span className="text-destructive">*</span></Label>
              <Input
                value={form.nome_razao_social}
                onChange={(e) => updateForm({ nome_razao_social: e.target.value })}
                required
                placeholder={form.tipo_pessoa === "J" ? "Razão social conforme CNPJ" : "Nome completo"}
                className={formErrors.nome_razao_social ? "border-destructive" : ""}
              />
              {formErrors.nome_razao_social && <p className="text-xs text-destructive">{formErrors.nome_razao_social}</p>}
            </div>
            <div className="col-span-2 md:col-span-3 space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Nome Fantasia</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-xs">
                    Nome comercial pelo qual o fornecedor é conhecido. Aparece nas listagens, pedidos e relatórios.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input value={form.nome_fantasia} onChange={(e) => updateForm({ nome_fantasia: e.target.value })} placeholder="Nome comercial (opcional)" />
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: CONTATOS ─────────────────────────────── */}
            <TabsContent value="contatos" className="space-y-4 mt-0">
          <div className="mb-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Referência de atendimento</p>
              <div className="space-y-1.5">
                <Label>Pessoa de Contato</Label>
                <Input
                  value={form.contato}
                  onChange={(e) => updateForm({ contato: e.target.value })}
                  placeholder="Nome do responsável pelo atendimento comercial"
                />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Canais de comunicação</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-2 md:col-span-3 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label>E-mail</Label>
                  </div>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateForm({ email: e.target.value })}
                    placeholder="email@fornecedor.com.br"
                    className={formErrors.email ? "border-destructive" : ""}
                  />
                  {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <MaskedInput mask="telefone" value={form.telefone} onChange={(v) => updateForm({ telefone: v })} />
                  {formErrors.telefone && <p className="text-xs text-destructive">{formErrors.telefone}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Celular / WhatsApp</Label>
                  <MaskedInput mask="celular" value={form.celular} onChange={(v) => updateForm({ celular: v })} />
                  {formErrors.celular && <p className="text-xs text-destructive">{formErrors.celular}</p>}
                </div>
              </div>
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: ENDEREÇO ─────────────────────────────── */}
            <TabsContent value="endereco" className="space-y-4 mt-0">
          <p className="text-xs text-muted-foreground mb-3">
            Informe o CEP para preenchimento automático do logradouro, bairro, cidade e UF.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
            <div className="col-span-2 md:col-span-2 space-y-1.5">
              <Label>CEP</Label>
              <div className="relative">
                <MaskedInput
                  mask="cep"
                  value={form.cep}
                  onChange={(v) => updateForm({ cep: v })}
                  onBlur={async () => {
                    const result = await buscarCep(form.cep);
                    if (result) {
                      updateForm({ logradouro: result.logradouro, bairro: result.bairro, cidade: result.localidade, uf: result.uf });
                    }
                  }}
                  className={cepLoading ? "pr-8" : ""}
                />
                {cepLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
              {formErrors.cep && <p className="text-xs text-destructive">{formErrors.cep}</p>}
            </div>
            <div className="col-span-2 md:col-span-3 space-y-1.5">
              <Label>Logradouro</Label>
              <Input value={form.logradouro} onChange={(e) => updateForm({ logradouro: e.target.value })} placeholder="Rua, Av., Travessa..." />
            </div>
            <div className="col-span-2 md:col-span-1 space-y-1.5">
              <Label>Número</Label>
              <Input value={form.numero} onChange={(e) => updateForm({ numero: e.target.value })} placeholder="Nº ou S/N" />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-1.5">
              <Label>Complemento</Label>
              <Input value={form.complemento} onChange={(e) => updateForm({ complemento: e.target.value })} placeholder="Sala, bloco, galpão..." />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-1.5">
              <Label>Bairro</Label>
              <Input value={form.bairro} onChange={(e) => updateForm({ bairro: e.target.value })} />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-1.5">
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={(e) => updateForm({ cidade: e.target.value })} />
            </div>
            <div className="col-span-1 md:col-span-1 space-y-1.5">
              <Label>UF</Label>
              <Select value={form.uf || undefined} onValueChange={(v) => updateForm({ uf: v })}>
                <SelectTrigger className={formErrors.uf ? "border-destructive" : ""}>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UF_OPTIONS.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.uf && <p className="text-xs text-destructive">{formErrors.uf}</p>}
            </div>
            <div className="col-span-1 md:col-span-2 space-y-1.5">
              <Label>País</Label>
              <Input value={form.pais} onChange={(e) => updateForm({ pais: e.target.value })} />
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: COMPRAS ──────────────────────────────── */}
            <TabsContent value="compras" className="space-y-4 mt-0">
          <div className="flex items-center gap-2 pb-1">
            <ShoppingCart className="w-4 h-4 text-primary/70" />
            <h3 className="font-semibold text-sm">Condições de Compra</h3>
            <span className="ml-auto text-xs bg-info/10 text-info border border-info/30 dark:text-info dark:border-info rounded-full px-2 py-0.5 leading-none">
              Aplica-se a compras e financeiro
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Condições comerciais padrão deste fornecedor. Aplicadas automaticamente em cotações e pedidos de compra. Podem ser sobrescritas por operação.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="col-span-2 md:col-span-2 space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Prazo Padrão (dias)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px] text-xs">
                    Prazo padrão de pagamento em dias, contados a partir da emissão do pedido ou recebimento da NF. Impacta diretamente o fluxo de caixa do financeiro.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                min={0}
                max={MAX_PRAZO_DAYS}
                value={form.prazo_padrao}
                onChange={(e) => updateForm({ prazo_padrao: Number(e.target.value) })}
                placeholder="Ex: 30"
                className={formErrors.prazo_padrao ? "border-destructive" : ""}
              />
              {formErrors.prazo_padrao && <p className="text-xs text-destructive">{formErrors.prazo_padrao}</p>}
            </div>
          </div>

          {/* Context block for edit mode — products and purchase history */}
          {mode === "edit" && (
            loadingFornContext ? (
              <div className="h-[80px] rounded-lg bg-muted/30 animate-pulse mb-6" />
            ) : (modalProdutosForn.length > 0 || modalComprasForn.count > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {modalProdutosForn.length > 0 && (
                  <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Produtos Fornecidos</p>
                    </div>
                    {modalProdutosForn.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs truncate text-foreground">{p.produto_nome}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {p.preco_compra != null && <span className="text-[10px] font-mono text-muted-foreground">{formatCurrency(p.preco_compra)}</span>}
                          {p.lead_time_dias != null && <span className="text-[10px] text-muted-foreground">{p.lead_time_dias}d</span>}
                        </div>
                      </div>
                    ))}
                    {modalProdutosForn.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+{modalProdutosForn.length - 3} produto(s)</p>
                    )}
                  </div>
                )}
                {modalComprasForn.count > 0 && (
                  <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Histórico de Compras</p>
                    </div>
                    <p className="text-xs text-foreground">{modalComprasForn.count} compra{modalComprasForn.count !== 1 ? "s" : ""} registrada{modalComprasForn.count !== 1 ? "s" : ""}</p>
                    {modalComprasForn.ultima && (
                      <p className="text-[10px] text-muted-foreground">Última: {formatDate(modalComprasForn.ultima)}</p>
                    )}
                    {modalComprasForn.total > 0 && (
                      <p className="text-[10px] text-muted-foreground font-mono">Total: {formatCurrency(modalComprasForn.total)}</p>
                    )}
                  </div>
                )}
              </div>
            ) : null
          )}

          {/* Manual product linkage */}
          {mode === "edit" && selected && (
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Vincular Produto Manualmente
                </h4>
              </div>
              {/* All linked products */}
              {modalProdutosForn.length > 0 && (
                <div className="space-y-1">
                  {modalProdutosForn.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-muted/30">
                      <span className="text-xs truncate">{p.produto_nome}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.preco_compra != null && <span className="text-[10px] font-mono text-muted-foreground">{formatCurrency(p.preco_compra)}</span>}
                        {p.lead_time_dias != null && <span className="text-[10px] text-muted-foreground">{p.lead_time_dias}d</span>}
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" aria-label="Remover vínculo"
                          onClick={async () => {
                            try {
                              await deleteProdutoFornecedor(p.id);
                              toast.success("Vínculo removido");
                              loadFornContext(selected.id);
                            } catch (err) {
                              notifyError(err);
                            }
                          }}
                        ><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <AddProdutoFornecedor fornecedorId={selected.id} onAdded={() => loadFornContext(selected.id)} />
            </div>
          )}
            </TabsContent>

            {/* ── TAB: OBSERVAÇÕES ──────────────────────────── */}
            <TabsContent value="observacoes" className="space-y-4 mt-0">
          <p className="text-xs text-muted-foreground mb-3">
            Observações internas, comerciais e operacionais sobre o fornecedor. Visível apenas internamente.
            Use este campo para registrar condições especiais negociadas, restrições de fornecimento,
            preferências logísticas e histórico de relacionamento.
          </p>
          <div className="mb-6">
            <Textarea
              rows={5}
              maxLength={MAX_OBSERVACOES_LENGTH}
              value={form.observacoes}
              onChange={(e) => updateForm({ observacoes: e.target.value })}
              placeholder="Informações relevantes: condições especiais negociadas, restrições de fornecimento, preferências logísticas, histórico de relacionamento..."
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">{form.observacoes.length}/{MAX_OBSERVACOES_LENGTH}</p>
          </div>
            </TabsContent>
          </Tabs>

        </form>
      </FormModal>

      {discardDialog}
    </>);

};

export default Fornecedores;
