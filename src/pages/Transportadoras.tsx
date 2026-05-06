import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useUrlListState } from "@/hooks/useUrlListState";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Trash2, Search, Building2, MapPin, Truck, Star, Phone, FileText, Loader2, Users, UserCheck, UserX, Plus } from "lucide-react";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { useViaCep } from "@/hooks/useViaCep";
import { useDocumentoUnico } from "@/hooks/useDocumentoUnico";
import { Switch } from "@/components/ui/switch";
import {
  getTransportadoraContext,
  listClientesAtivos,
  listClientesVinculados,
  vincularClienteTransportadora,
  desvincularClienteTransportadora,
  deleteTransportadora,
  type ClienteVinculadoView,
} from "@/services/transportadoras.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { SummaryCard } from "@/components/SummaryCard";
import { UF_OPTIONS } from "@/constants/brasil";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { notifyError } from "@/utils/errorMessages";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useCan } from "@/hooks/useCan";
import { transportadoraSchema, validateForm } from "@/lib/validationSchemas";
import { useEditDeepLink } from "@/hooks/useEditDeepLink";

interface Transportadora {
  id: string;
  tipo_pessoa: string;
  nome_razao_social: string;
  nome_fantasia: string;
  cpf_cnpj: string;
  contato: string;
  telefone: string;
  email: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  modalidade: string;
  prazo_medio: string;
  observacoes: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

type TransportadoraFormData = Omit<Transportadora, "id" | "created_at" | "updated_at">;

type ClienteVinculado = ClienteVinculadoView;

const emptyForm: TransportadoraFormData = {
  tipo_pessoa: "J",
  nome_razao_social: "", nome_fantasia: "", cpf_cnpj: "", contato: "",
  telefone: "", email: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", cep: "", modalidade: "rodoviario",
  prazo_medio: "", observacoes: "", ativo: true,
};

const MODALIDADE_LABEL: Record<string, string> = {
  rodoviario: "Rodoviário",
  aereo: "Aéreo",
  maritimo: "Marítimo",
  ferroviario: "Ferroviário",
  multimodal: "Multimodal",
};

export default function Transportadoras() {
  const { value: filterValue, set: setFilter, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      ativo: { type: "stringArray" },
      modalidade: { type: "stringArray" },
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const modalidadeFilters = filterValue.modalidade;
  const setModalidadeFilters = (v: string[]) => setFilter({ modalidade: v });
  const debouncedSearch = useDebounce(searchTerm, 350);

  const { data, loading, create, update, remove, fetchData } = useSupabaseCrud<Transportadora>({
    table: "transportadoras",
    searchTerm: debouncedSearch,
    filterAtivo: false,
    searchColumns: ["nome_razao_social", "nome_fantasia", "cpf_cnpj", "cidade"],
  });
  const { pushView } = useRelationalNavigation();
  const { buscarCnpj, loading: cnpjLoading } = useCnpjLookup();
  const { buscarCep, loading: cepLoading } = useViaCep();
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Transportadora | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<TransportadoraFormData>(emptyForm);
  const { isUnique: docUnico, isLoading: docChecking } = useDocumentoUnico(
    form.tipo_pessoa === "F" ? "cpf" : "cnpj",
    form.cpf_cnpj,
    selected?.id,
    "transportadoras",
  );
  const { saving, submit } = useSubmitLock();
  const { confirm: confirmDiscard, dialog: confirmDiscardDialog } = useConfirmDialog();
  const { can } = useCan();
  const canExcluir = can("transportadoras:excluir");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [modalCliCount, setModalCliCount] = useState(0);
  const [modalRemCount, setModalRemCount] = useState(0);
  const [loadingModalCtx, setLoadingModalCtx] = useState(false);
  const [clientesList, setClientesList] = useState<{id: string; nome_razao_social: string}[]>([]);
  const [editClientesVinculados, setEditClientesVinculados] = useState<ClienteVinculado[]>([]);
  const [loadingEditClientes, setLoadingEditClientes] = useState(false);
  const [vinculoClienteId, setVinculoClienteId] = useState("");
  const [savingVinculoCliente, setSavingVinculoCliente] = useState(false);

  // Deep-link: abrir edição via ?editId=… (drawer "Editar" → modal).
  useEditDeepLink<Transportadora>({
    table: "transportadoras",
    onLoad: (t) => openEdit(t),
  });

  const loadModalContext = async (transportadoraId: string) => {
    setLoadingModalCtx(true);
    try {
      const ctx = await getTransportadoraContext(transportadoraId);
      setModalCliCount(ctx.clientes);
      setModalRemCount(ctx.remessas);
    } catch (err) {
      console.error("[transportadoras] erro ao carregar contexto do modal:", err);
    } finally {
      setLoadingModalCtx(false);
    }
  };

  useEffect(() => {
    listClientesAtivos()
      .then((d) => setClientesList(d))
      .catch((err) => console.error("[transportadoras] erro ao carregar clientes:", err));
  }, []);

  const loadEditClientes = async (transportadoraId: string) => {
    setLoadingEditClientes(true);
    try {
      const data = await listClientesVinculados(transportadoraId);
      setEditClientesVinculados(data);
    } catch (err) {
      console.error("[transportadoras] erro ao carregar clientes vinculados:", err);
    } finally {
      setLoadingEditClientes(false);
    }
  };

  const handleVincularCliente = async (transportadoraId: string) => {
    if (!vinculoClienteId) { toast.error("Selecione um cliente"); return; }
    const already = editClientesVinculados.some(cv => cv.cliente_id === vinculoClienteId);
    if (already) { toast.error("Cliente já vinculado a esta transportadora"); return; }
    setSavingVinculoCliente(true);
    try {
      await vincularClienteTransportadora(
        vinculoClienteId,
        transportadoraId,
        editClientesVinculados.length + 1,
      );
      setVinculoClienteId("");
      await loadEditClientes(transportadoraId);
      toast.success("Cliente vinculado");
    } catch (err) {
      console.error("[transportadoras] erro ao vincular cliente:", err);
      notifyError(err);
    }
    setSavingVinculoCliente(false);
  };

  const handleDesvincularCliente = async (vinculoId: string, transportadoraId: string) => {
    try {
      await desvincularClienteTransportadora(vinculoId);
      await loadEditClientes(transportadoraId);
      toast.success("Vínculo removido");
    } catch (err) {
      console.error("[transportadoras] erro ao remover vínculo:", err);
      notifyError(err);
    }
  };

  const openCreate = () => { setMode("create"); setForm({...emptyForm}); setSelected(null); setModalCliCount(0); setModalRemCount(0); setModalOpen(true); };
  const openEdit = (t: Transportadora) => {
    setMode("edit"); setSelected(t);
    setForm({
      tipo_pessoa: t.tipo_pessoa || "J",
      nome_razao_social: t.nome_razao_social, nome_fantasia: t.nome_fantasia || "",
      cpf_cnpj: t.cpf_cnpj || "", contato: t.contato || "",
      telefone: t.telefone || "", email: t.email || "",
      logradouro: t.logradouro || "", numero: t.numero || "",
      complemento: t.complemento || "", bairro: t.bairro || "",
      cidade: t.cidade || "", uf: t.uf || "", cep: t.cep || "",
      modalidade: t.modalidade || "rodoviario",
      prazo_medio: t.prazo_medio || "", observacoes: t.observacoes || "",
      ativo: t.ativo ?? true,
    });
    setModalCliCount(0); setModalRemCount(0);
    setEditClientesVinculados([]);
    setVinculoClienteId("");
    Promise.all([loadModalContext(t.id), loadEditClientes(t.id)]);
    setModalOpen(true);
  };
  const openView = (t: Transportadora) => {
    pushView("transportadora", t.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateForm(transportadoraSchema, form);
    if (!validation.success) {
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError || "Corrija os erros do formulário");
      return;
    }
    if (docChecking) {
      toast.error("Aguarde a verificação do CNPJ antes de salvar.");
      return;
    }
    if (docUnico === false) {
      toast.error("CNPJ já cadastrado. Corrija antes de salvar.");
      return;
    }
    await submit(async () => {
      const submitData = { ...form };
      if (mode === "create") await create(submitData);
      else if (selected) await update(selected.id, submitData);
      setModalOpen(false);
    });
  };

  const handleCloseModal = async () => {
    if (hasChanges) {
      const ok = await confirmDiscard({
        title: "Descartar alterações?",
        description: "Há alterações não salvas. Deseja fechar mesmo assim?",
        confirmLabel: "Descartar",
        confirmVariant: "destructive",
      });
      if (!ok) return;
    }
    setModalOpen(false);
  };


  const hasChanges = useMemo(() => {
    if (mode === "create") return JSON.stringify(form) !== JSON.stringify(emptyForm);
    if (!selected) return false;
    const original: TransportadoraFormData = {
      tipo_pessoa: selected.tipo_pessoa || "J",
      nome_razao_social: selected.nome_razao_social || "",
      nome_fantasia: selected.nome_fantasia || "",
      cpf_cnpj: selected.cpf_cnpj || "",
      contato: selected.contato || "",
      telefone: selected.telefone || "",
      email: selected.email || "",
      logradouro: selected.logradouro || "",
      numero: selected.numero || "",
      complemento: selected.complemento || "",
      bairro: selected.bairro || "",
      cidade: selected.cidade || "",
      uf: selected.uf || "",
      cep: selected.cep || "",
      modalidade: selected.modalidade || "rodoviario",
      prazo_medio: selected.prazo_medio || "",
      observacoes: selected.observacoes || "",
      ativo: selected.ativo ?? true,
    };
    return JSON.stringify(form) !== JSON.stringify(original);
  }, [form, mode, selected]);

  const remessaStatusMap: Record<string, { label: string; classes: string }> = {
    pendente:    { label: "Pendente",    classes: "bg-warning/10 text-warning border-warning/20" },
    postado:     { label: "Postado",     classes: "bg-info/10 text-info border-info/20" },
    em_transito: { label: "Em Trânsito", classes: "bg-info/10 text-info border-info/20" },
    entregue:    { label: "Entregue",    classes: "bg-success/10 text-success border-success/20" },
    devolvido:   { label: "Devolvido",   classes: "bg-destructive/10 text-destructive border-destructive/20" },
  };

  const filteredData = useMemo(() => {
    return data.filter(t => {
      if (ativoFilters.length > 0) {
        const status = t.ativo ? "ativo" : "inativo";
        if (!ativoFilters.includes(status)) return false;
      }
      if (modalidadeFilters.length > 0) {
        if (!modalidadeFilters.includes(t.modalidade || "")) return false;
      }
      return true;
    });
  }, [data, ativoFilters, modalidadeFilters]);

  const columns = [
    {
      key: "nome_razao_social",
      mobilePrimary: true, label: "Transportadora", sortable: true,
      render: (t: Transportadora) => (
        <div>
          <p className="font-medium leading-tight">{t.nome_razao_social}</p>
          {t.nome_fantasia && t.nome_fantasia !== t.nome_razao_social && (
            <p className="text-xs text-muted-foreground truncate max-w-xs">{t.nome_fantasia}</p>
          )}
        </div>
      ),
    },
    {
      key: "cpf_cnpj", label: "CPF/CNPJ",
      render: (t: Transportadora) => (
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold ${t.tipo_pessoa === "F" ? "text-info" : "text-muted-foreground"}`}>
            {t.tipo_pessoa === "F" ? "PF" : "PJ"}
          </span>
          <span className="font-mono text-xs">{t.cpf_cnpj || "—"}</span>
        </div>
      ),
    },
    {
      key: "contato_principal", label: "Contato",
      render: (t: Transportadora) => {
        if (!t.telefone && !t.email) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="text-xs space-y-0.5">
            {t.telefone && <p className="font-medium tabular-nums">{t.telefone}</p>}
            {t.email && <p className="text-muted-foreground truncate max-w-xs">{t.email}</p>}
          </div>
        );
      },
    },
    {
      key: "cidade",
      mobileCard: true, label: "Cidade / UF", sortable: true,
      render: (t: Transportadora) => t.cidade
        ? <span className="text-xs">{t.cidade}{t.uf ? `/${t.uf}` : ""}</span>
        : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: "modalidade",
      mobileCard: true, label: "Modalidade",
      render: (t: Transportadora) => {
        const label = MODALIDADE_LABEL[t.modalidade] || t.modalidade;
        if (!label) return <span className="text-muted-foreground text-xs">—</span>;
        return <span className="text-xs font-medium">{label}</span>;
      },
    },
    {
      key: "prazo_medio", label: "Prazo Médio",
      render: (t: Transportadora) => t.prazo_medio
        ? <span className="font-mono text-xs font-medium">{t.prazo_medio}d</span>
        : <span className="text-muted-foreground text-xs">—</span>,
    },
    { key: "ativo",
      mobileCard: true, label: "Status", hidden: true, render: (t: Transportadora) => <StatusBadge status={t.ativo ? "ativo" : "inativo"} /> },
  ];

  const ativoOptions: MultiSelectOption[] = [
    { label: "Ativo", value: "ativo" },
    { label: "Inativo", value: "inativo" },
  ];

  const modalidadeOptions: MultiSelectOption[] = [
    { label: "Rodoviário", value: "rodoviario" },
    { label: "Aéreo", value: "aereo" },
    { label: "Marítimo", value: "maritimo" },
    { label: "Ferroviário", value: "ferroviario" },
    { label: "Multimodal", value: "multimodal" },
  ];

  const activeFilterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    ativoFilters.forEach(f => chips.push({
      key: "ativo", label: "Status", value: [f],
      displayValue: f === "ativo" ? "Ativo" : "Inativo",
    }));
    modalidadeFilters.forEach(f => chips.push({
      key: "modalidade", label: "Modalidade", value: [f],
      displayValue: MODALIDADE_LABEL[f] || f,
    }));
    return chips;
  }, [ativoFilters, modalidadeFilters]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "ativo") setAtivoFilters(ativoFilters.filter(v => v !== value));
    if (key === "modalidade") setModalidadeFilters(modalidadeFilters.filter(v => v !== value));
  };

  const summaryAtivos = useMemo(() => data.filter(t => t.ativo).length, [data]);

  return (
    <><ModulePage
        title="Transportadoras"
        subtitle="Central de consulta de transportadoras e logística"
        addLabel="Nova Transportadora"
        onAdd={openCreate}
        summaryCards={
          <>
            <SummaryCard title="Total" value={data.length} icon={Truck} />
            <SummaryCard title="Ativas" value={summaryAtivos} icon={UserCheck} variant="success" />
            <SummaryCard title="Inativas" value={data.length - summaryAtivos} icon={UserX} />
          </>
        }
      >
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome, CNPJ ou cidade..."
          activeFilters={activeFilterChips}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={() => clearFilters(["ativo", "modalidade"])}
          count={filteredData.length}
        >
          <MultiSelect
            options={ativoOptions}
            selected={ativoFilters}
            onChange={setAtivoFilters}
            placeholder="Status"
            className="w-[130px]"
          />
          <MultiSelect
            options={modalidadeOptions}
            selected={modalidadeFilters}
            onChange={setModalidadeFilters}
            placeholder="Modalidade"
            className="w-[150px]"
          />
        </AdvancedFilterBar>

        <PullToRefresh onRefresh={fetchData}>
          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            moduleKey="transportadoras"
            showColumnToggle={true}
            onView={openView}
            onEdit={openEdit}
            onDelete={canExcluir ? (t) => { setSelected(t); setDeleteConfirmOpen(true); } : undefined}
            deleteBehavior="soft"
            mobileIdentifierKey="cpf_cnpj"
            mobileStatusKey="ativo"
            emptyTitle="Nenhuma transportadora encontrada"
            emptyDescription="Tente ajustar os filtros ou cadastre uma nova transportadora."
          />
        </PullToRefresh>
      </ModulePage>

      <FormModal
        open={modalOpen}
        onClose={handleCloseModal}
        title={mode === "create" ? "Nova Transportadora" : "Editar Transportadora"}
        size="xl"
        mode={mode}
        createHint="Informe a razão social, CNPJ e modalidade. Tabelas e endereços de coleta podem ser configurados depois."
        identifier={mode === "edit" && selected?.cpf_cnpj ? selected.cpf_cnpj : undefined}
        status={mode === "edit" && selected ? <StatusBadge status={selected.ativo ? "ativo" : "inativo"} /> : undefined}
        meta={mode === "edit" && selected ? [
          ...(selected.created_at ? [{ label: `Cadastro: ${formatDate(selected.created_at)}` }] : []),
          ...(selected.updated_at ? [{ label: `Atualizado: ${formatDate(selected.updated_at)}` }] : []),
          { icon: Truck, label: MODALIDADE_LABEL[selected.modalidade] || "—" },
          ...(selected.cidade ? [{ icon: MapPin, label: `${selected.cidade}${selected.uf ? `/${selected.uf}` : ""}` }] : []),
        ] : undefined}
        isDirty={hasChanges}
        footer={
          <FormModalFooter
            saving={saving}
            isDirty={hasChanges}
            onCancel={handleCloseModal}
            submitAsForm
            formId="transportadora-form"
            mode={mode}
          />
        }
      >
        <form id="transportadora-form" onSubmit={handleSubmit} className="space-y-0">

          <Tabs defaultValue="dados-gerais" className="w-full">
            <TabsList className="mb-4 w-full justify-start overflow-x-auto">
              <TabsTrigger value="dados-gerais" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Dados Gerais</TabsTrigger>
              <TabsTrigger value="contatos" className="gap-1.5"><Phone className="h-3.5 w-3.5" />Contatos</TabsTrigger>
              <TabsTrigger value="operacional" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Operacional</TabsTrigger>
              <TabsTrigger value="endereco" className="gap-1.5"><MapPin className="h-3.5 w-3.5" />Endereço</TabsTrigger>
              {mode === "edit" && (
                <TabsTrigger value="clientes-vinculados" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" />Clientes
                  {editClientesVinculados.length > 0 && <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{editClientesVinculados.length}</span>}
                </TabsTrigger>
              )}
              <TabsTrigger value="observacoes" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Obs.</TabsTrigger>
            </TabsList>

            {/* ── TAB: DADOS GERAIS ─────────────────────────── */}
            <TabsContent value="dados-gerais" className="space-y-4 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
            <div className="col-span-2 md:col-span-1 space-y-2">
              <Label>Tipo</Label>
              <Select value={form.tipo_pessoa} onValueChange={(v) => setForm({ ...form, tipo_pessoa: v, cpf_cnpj: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="J">Pessoa Jurídica</SelectItem>
                  <SelectItem value="F">Pessoa Física</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>{form.tipo_pessoa === "F" ? "CPF" : "CNPJ"}</Label>
              <div className="flex gap-1">
                <MaskedInput mask={form.tipo_pessoa === "F" ? "cpf" : "cnpj"} value={form.cpf_cnpj} onChange={(v) => setForm({ ...form, cpf_cnpj: v })} />
                <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={cnpjLoading || form.tipo_pessoa !== "J"}
                  aria-label="Buscar CNPJ"
                  title="Buscar dados pelo CNPJ e preencher automaticamente"
                  onClick={async () => {
                    const result = await buscarCnpj(form.cpf_cnpj);
                    if (result) setForm(prev => ({
                      ...prev,
                      nome_razao_social: result.razao_social || prev.nome_razao_social,
                      nome_fantasia: result.nome_fantasia || prev.nome_fantasia,
                      email: result.email || prev.email,
                      telefone: result.telefone || prev.telefone,
                      cidade: result.municipio || prev.cidade,
                      uf: result.uf || prev.uf,
                    }));
                  }}>
                  {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                {form.tipo_pessoa === "F"
                  ? "Informe o CPF do transportador autônomo."
                  : "Informe o CNPJ e clique em buscar para preencher automaticamente."}
              </p>
              {docChecking && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />Verificando unicidade...
                </p>
              )}
              {!docChecking && docUnico === false && (
                <p className="text-xs text-destructive">{form.tipo_pessoa === "F" ? "CPF" : "CNPJ"} já cadastrado em outra transportadora.</p>
              )}
            </div>
            <div className="col-span-2 md:col-span-3 space-y-2">
              <Label>Razão Social / Nome *</Label>
              <Input value={form.nome_razao_social} onChange={(e) => setForm({ ...form, nome_razao_social: e.target.value })} required placeholder="Razão social ou nome da transportadora" />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-2">
              <Label>Nome Fantasia</Label>
              <Input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} placeholder="Nome comercial (se diferente da razão social)" />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-2">
              <Label>Status</Label>
              <div className="flex items-center gap-3 h-9 px-3 rounded-md border bg-background">
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                <span className="text-sm text-muted-foreground">{form.ativo ? "Ativo" : "Inativo"}</span>
              </div>
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: CONTATOS ─────────────────────────────── */}
            <TabsContent value="contatos" className="space-y-4 mt-0">
          <div className="mb-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Referência de atendimento</p>
              <div className="space-y-2">
                <Label>Contato Principal</Label>
                <Input value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} placeholder="Nome do responsável ou setor de atendimento" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Canais de comunicação</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <MaskedInput mask="telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
                </div>
                <div className="col-span-1 md:col-span-2 space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@transportadora.com.br" />
                </div>
              </div>
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: OPERACIONAL ──────────────────────────── */}
            <TabsContent value="operacional" className="space-y-4 mt-0">
          <p className="text-xs text-muted-foreground mb-4">Define como a transportadora opera e o prazo médio de entrega. Esses dados são usados em pedidos, remessas e compras.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <Label className="font-semibold text-sm">Modalidade Principal</Label>
              <Select value={form.modalidade} onValueChange={(v) => setForm({ ...form, modalidade: v })}>
                <SelectTrigger className="h-10 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rodoviario">Rodoviário</SelectItem>
                  <SelectItem value="aereo">Aéreo</SelectItem>
                  <SelectItem value="maritimo">Marítimo</SelectItem>
                  <SelectItem value="ferroviario">Ferroviário</SelectItem>
                  <SelectItem value="multimodal">Multimodal</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-tight">Forma predominante de transporte utilizada pela transportadora.</p>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold text-sm">Prazo Médio de Entrega</Label>
              <div className="relative">
                <Input value={form.prazo_medio} onChange={(e) => setForm({ ...form, prazo_medio: e.target.value })} placeholder="Ex: 3-5" className="h-10 pr-24 font-mono" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none">dias úteis</span>
              </div>
              <p className="text-xs text-muted-foreground leading-tight">Prazo médio informado pela transportadora. Usado como referência em remessas.</p>
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: ENDEREÇO ─────────────────────────────── */}
            <TabsContent value="endereco" className="space-y-4 mt-0">
          <p className="text-xs text-muted-foreground mb-4">Informe o CEP para preenchimento automático do logradouro, bairro, cidade e UF.</p>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
            <div className="col-span-2 space-y-2">
              <Label>CEP</Label>
              <div className="flex gap-1">
                <MaskedInput mask="cep" value={form.cep} onChange={(v) => setForm({ ...form, cep: v })} />
                <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={cepLoading}
                  aria-label="Buscar CEP"
                  title="Buscar endereço pelo CEP"
                  onClick={async () => {
                    const result = await buscarCep(form.cep);
                    if (result) setForm(prev => ({
                      ...prev,
                      logradouro: result.logradouro || prev.logradouro,
                      bairro: result.bairro || prev.bairro,
                      cidade: result.localidade || prev.cidade,
                      uf: result.uf || prev.uf,
                    }));
                  }}>
                  {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="col-span-2 md:col-span-3 space-y-2">
              <Label>Logradouro</Label>
              <Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} placeholder="Rua, Avenida, etc." />
            </div>
            <div className="col-span-1 space-y-2">
              <Label>Número</Label>
              <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="Nº" />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-2">
              <Label>Complemento</Label>
              <Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} placeholder="Sala, Bloco, etc." />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-2">
              <Label>Bairro</Label>
              <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </div>
            <div className="col-span-2 md:col-span-3 space-y-2">
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </div>
            <div className="col-span-1 space-y-2">
              <Label>UF</Label>
              <Select value={form.uf || undefined} onValueChange={(v) => setForm({ ...form, uf: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UF_OPTIONS.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
            </TabsContent>

            {/* ── TAB: CLIENTES VINCULADOS ────────────────── */}
            {mode === "edit" && (
            <TabsContent value="clientes-vinculados" className="space-y-4 mt-0">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary/70" />
              <h3 className="font-semibold text-sm">Clientes Vinculados</h3>
              {editClientesVinculados.length > 0 && (
                <Badge variant="secondary" className="text-xs">{editClientesVinculados.length}</Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Vincule clientes a esta transportadora para facilitar o uso nos processos logísticos.
          </p>
          {/* Adicionar vínculo */}
          <div className="flex gap-2 mb-3">
            <Select value={vinculoClienteId} onValueChange={setVinculoClienteId}>
              <SelectTrigger className="flex-1 h-9"><SelectValue placeholder="Selecionar cliente..." /></SelectTrigger>
              <SelectContent>
                {clientesList
                   .filter(cl => !editClientesVinculados.some(cv => cv.cliente_id === cl.id))
                  .map(cl => <SelectItem key={cl.id} value={cl.id}>{cl.nome_razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              type="button" size="sm"
              disabled={!vinculoClienteId || savingVinculoCliente}
              onClick={() => selected && handleVincularCliente(selected.id)}
              className="gap-1 h-9"
            >
              <Plus className="h-3.5 w-3.5" />
              Vincular
            </Button>
          </div>
          {loadingEditClientes ? (
            <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
          ) : editClientesVinculados.length === 0 ? (
            <div className="flex items-start gap-2 bg-muted/30 rounded-lg px-3 py-3 border border-dashed text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Nenhum cliente vinculado. Use o seletor acima para vincular clientes a esta transportadora.</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {editClientesVinculados.map((cv) => (
                <div key={cv.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors border-b last:border-b-0 group">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {cv.prioridade === 1 && <Star className="h-3 w-3 text-warning shrink-0" />}
                    <div>
                      <span className="text-xs font-medium text-foreground">{cv.clientes?.nome_razao_social}</span>
                      {cv.clientes?.cpf_cnpj && <span className="ml-1.5 text-[10px] text-muted-foreground font-mono">{cv.clientes.cpf_cnpj}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cv.modalidade && <span className="text-xs text-muted-foreground capitalize">{cv.modalidade}</span>}
                    {cv.prazo_medio && <span className="text-xs text-muted-foreground font-mono">{cv.prazo_medio}d</span>}
                    <Button
                      type="button" size="icon" variant="ghost"
                      className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remover vínculo"
                      onClick={() => selected && handleDesvincularCliente(cv.id, selected.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
            </TabsContent>
            )}

            {/* ── TAB: OBSERVAÇÕES ──────────────────────────── */}
            <TabsContent value="observacoes" className="space-y-4 mt-0">
          <p className="text-xs text-muted-foreground mb-4">Notas internas, operacionais e de atendimento sobre a transportadora.</p>
          <div className="mb-6">
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Restrições de atendimento, particularidades operacionais, observações de logística..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Uso no Sistema — edit mode only */}
          {mode === "edit" && (
            <>
              <div className="flex items-center gap-2 pt-3 pb-2 border-t">
                <Users className="w-4 h-4 text-primary/70" />
                <h3 className="font-semibold text-sm">Uso no Sistema</h3>
                <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">apenas leitura</span>
              </div>
              {loadingModalCtx ? (
                <div className="mb-6 h-[72px] rounded-lg bg-muted/30 animate-pulse" />
              ) : (
                <div className="mb-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-card p-3 text-center space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Clientes Vinculados</p>
                      <p className="font-bold text-2xl text-foreground">{modalCliCount}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Remessas</p>
                      <p className="font-bold text-2xl text-foreground">{modalRemCount}</p>
                    </div>
                  </div>
                  {(modalCliCount > 0 || modalRemCount > 0) ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Esta transportadora está em uso ativo. Considere inativar em vez de excluir caso necessário.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-2">
                      Nenhum vínculo ativo encontrado para esta transportadora.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
            </TabsContent>
          </Tabs>

        </form>
      </FormModal>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={async () => {
          if (selected) {
            try {
              await deleteTransportadora(selected.id);
              toast.success("Transportadora desativada.");
              fetchData();
            } catch (err) {
              notifyError(err);
            }
          }
          setDeleteConfirmOpen(false);
        }}
        title="Excluir transportadora"
        description={`Tem certeza que deseja excluir "${selected?.nome_razao_social || ""}"? Esta ação não pode ser desfeita.`}
      >
        <p className="text-xs text-muted-foreground">Considere inativar a transportadora em vez de excluí-la para preservar o histórico.</p>
      </ConfirmDialog>
      {confirmDiscardDialog}
    </>
  );
}
