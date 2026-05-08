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
import { useServerSort } from "@/hooks/useServerSort";
import { useTableCount } from "@/hooks/useTableCount";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { useViaCep } from "@/hooks/useViaCep";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { useDocumentoUnico } from "@/hooks/useDocumentoUnico";
import { useEditDeepLink } from "@/hooks/useEditDeepLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { listGruposEconomicosAtivos, listFormasPagamentoAtivas } from "@/services/clientes.service";
import { formatDate } from "@/lib/format";
import { cpfCnpjMask, phoneMask, cpfMask, cnpjMask } from "@/utils/masks";
import { toast } from "sonner";
import {
  Building2, Search, User2, Phone, CreditCard, MapPin, Truck, FileText,
  Info, Loader2, Calendar, Mail, Users, UserCheck, AlertTriangle,
  MessageSquare, Home, Pencil, Check as CheckIcon,
} from "lucide-react";
import { Plus } from "lucide-react";
import { SummaryCard } from "@/components/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { UF_OPTIONS } from "@/constants/brasil";
import { clienteFornecedorSchema, validateForm } from "@/lib/validationSchemas";
import { notifyError } from "@/utils/errorMessages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useCan } from "@/hooks/useCan";
import { ClienteEnderecosTab } from "./clientes/components/ClienteEnderecosTab";
import { ClienteComunicacoesTab } from "./clientes/components/ClienteComunicacoesTab";
import { ClienteTransportadorasTab } from "./clientes/components/ClienteTransportadorasTab";
import { QuickAddClientModal } from "@/components/QuickAddClientModal";
import { QuickAddFormaPagamentoModal } from "@/components/QuickAddFormaPagamentoModal";
import { MobileQuickAddFAB } from "@/components/MobileQuickAddFAB";
import { ContactInlineActions } from "@/components/ui/MobileCardActions";
import { useIsMobile } from "@/hooks/use-mobile";

interface Cliente {
  id: string;tipo_pessoa: string;nome_razao_social: string;nome_fantasia: string;
  cpf_cnpj: string;inscricao_estadual: string;email: string;telefone: string;celular: string;
  contato: string;prazo_padrao: number;limite_credito: number;
  forma_pagamento_id: string | null;forma_pagamento_padrao: string | null;prazo_preferencial: number | null;
  logradouro: string;numero: string;complemento: string;bairro: string;cidade: string;
  uf: string;cep: string;pais: string;observacoes: string;ativo: boolean;created_at: string;
  grupo_economico_id: string | null;tipo_relacao_grupo: string | null;caixa_postal: string | null;
}

interface GrupoEconomico { id: string; nome: string; }
interface FormaPagamentoBasic { id: string; descricao: string; }

interface ClienteFormData {
  tipo_pessoa: string;
  nome_razao_social: string;
  nome_fantasia: string;
  cpf_cnpj: string;
  inscricao_estadual: string;
  email: string;
  telefone: string;
  celular: string;
  contato: string;
  prazo_padrao: number;
  limite_credito: number;
  forma_pagamento_id: string;
  prazo_preferencial: number;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  pais: string;
  observacoes: string;
  grupo_economico_id: string;
  tipo_relacao_grupo: string;
  caixa_postal: string;
  ativo: boolean;
}

const emptyCliente: ClienteFormData = {
  tipo_pessoa: "J", nome_razao_social: "", nome_fantasia: "", cpf_cnpj: "",
  inscricao_estadual: "", email: "", telefone: "", celular: "", contato: "",
  prazo_padrao: 30, limite_credito: 0, forma_pagamento_id: "", prazo_preferencial: 0,
  logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "", pais: "Brasil",
  observacoes: "", grupo_economico_id: "", tipo_relacao_grupo: "independente", caixa_postal: "", ativo: true,
};

const relacaoOptions = [
  { value: "independente", label: "Independente" },
  { value: "matriz", label: "Matriz" },
  { value: "filial", label: "Filial" },
  { value: "coligada", label: "Coligada" },
];

const MAX_PAYMENT_DAYS = 365;
const MAX_OBSERVACOES_LENGTH = 2000;

const Clientes = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { value: filterValue, set: setFilter, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      tipo: { type: "stringArray" },
      grupo: { type: "stringArray" },
      ativo: { type: "stringArray" },
      cadastro: { type: "stringArray" },
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const tipoFilters = filterValue.tipo;
  const setTipoFilters = (v: string[]) => setFilter({ tipo: v });
  const grupoFilters = filterValue.grupo;
  const setGrupoFilters = (v: string[]) => setFilter({ grupo: v });
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const cadastroFilters = filterValue.cadastro;
  const setCadastroFilters = (v: string[]) => setFilter({ cadastro: v });
  const debouncedSearch = useDebounce(searchTerm, 350);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const { confirm: confirmDiscard, dialog: discardDialog } = useConfirmDialog();
  const { can } = useCan();
  const canExcluir = can("clientes:excluir");

  const serverFilters = useMemo(() => {
    const out: Array<{ column: string; value: string | string[] | boolean; operator?: "eq" | "in" }> = [];
    if (tipoFilters.length === 1) out.push({ column: "tipo_pessoa", value: tipoFilters[0] });
    else if (tipoFilters.length > 1) out.push({ column: "tipo_pessoa", value: tipoFilters, operator: "in" });
    // grupo: "sem_grupo" representa grupo_economico_id IS NULL — não dá para empurrar para `in`,
    // então só empurramos quando todos os valores são UUIDs reais.
    const realGroupIds = grupoFilters.filter((g) => g !== "sem_grupo");
    if (grupoFilters.length > 0 && realGroupIds.length === grupoFilters.length) {
      if (realGroupIds.length === 1) out.push({ column: "grupo_economico_id", value: realGroupIds[0] });
      else out.push({ column: "grupo_economico_id", value: realGroupIds, operator: "in" });
    }
    if (ativoFilters.length === 1) out.push({ column: "ativo", value: ativoFilters[0] === "ativo" });
    return out;
  }, [tipoFilters, grupoFilters, ativoFilters]);

  const hasSemGrupoFilter = grupoFilters.includes("sem_grupo");

  // Avalia "qualidade cadastral" do cliente — completo se possui documento,
  // contato (tel ou cel), e-mail, prazo > 0 e endereço (cidade+uf).
  // O detalhe do que falta vai num tooltip e alimenta os filtros "Cadastro".
  function getMissingFields(c: Cliente): string[] {
    const missing: string[] = [];
    if (!c.cpf_cnpj) missing.push("documento");
    if (!(c.celular || c.telefone)) missing.push("telefone");
    if (!c.email) missing.push("e-mail");
    if (!c.prazo_padrao || c.prazo_padrao <= 0) missing.push("prazo");
    if (!c.cidade || !c.uf) missing.push("endereço");
    if (!c.grupo_economico_id) missing.push("grupo");
    return missing;
  }

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
  } = useSupabaseCrud<Cliente>({
    table: "clientes",
    searchTerm: debouncedSearch,
    filterAtivo: false,
    filter: serverFilters,
    searchColumns: ["nome_razao_social", "nome_fantasia", "cpf_cnpj", "email", "cidade"],
    pageSize: 50,
    orderBy: sort.orderBy,
    ascending: sort.ascending,
  });
  const totalAtivos = useTableCount("clientes", { ativo: true }).data ?? null;
  const totalComGrupo = useTableCount("clientes", { grupo_economico_id: { not: { is: null } } }).data ?? null;
  const { pushView } = useRelationalNavigation();
  const { buscarCep, loading: cepLoading } = useViaCep();
  const { buscarCnpj, loading: cnpjLoading } = useCnpjLookup();

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Cliente | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<ClienteFormData>(emptyCliente);
  const docTipo = form.tipo_pessoa === "F" ? "cpf" : "cnpj";
  const { isUnique: docUnico, isLoading: docChecking } = useDocumentoUnico(
    docTipo, form.cpf_cnpj, selected?.id, "clientes",
  );
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [grupos, setGrupos] = useState<GrupoEconomico[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoBasic[]>([]);

  const [enderecosCount, setEnderecosCount] = useState(0);
  const [comunicacoesCount, setComunicacoesCount] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddFormaPagOpen, setQuickAddFormaPagOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    Promise.all([listGruposEconomicosAtivos(), listFormasPagamentoAtivas()])
      .then(([g, fp]) => {
        setGrupos(g as GrupoEconomico[]);
        setFormasPagamento(fp as FormaPagamentoBasic[]);
      })
      .catch((err) => console.error("[clientes] erro ao carregar lookups:", err));
  }, []);

  useEditDeepLink<Cliente>({
    table: "clientes",
    onLoad: (c) => openEdit(c),
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

  const openCreate = () => {
    setMode("create"); setForm({ ...emptyCliente }); setSelected(null); setIsDirty(false);
    setEnderecosCount(0); setComunicacoesCount(0);
    setModalOpen(true);
  };

  const openEdit = (c: Cliente) => {
    setMode("edit"); setSelected(c);
    setForm({
      tipo_pessoa: c.tipo_pessoa || "J", nome_razao_social: c.nome_razao_social, nome_fantasia: c.nome_fantasia || "",
      cpf_cnpj: c.cpf_cnpj || "", inscricao_estadual: c.inscricao_estadual || "",
      email: c.email || "", telefone: c.telefone || "", celular: c.celular || "", contato: c.contato || "",
      prazo_padrao: c.prazo_padrao || 30, limite_credito: c.limite_credito || 0,
      forma_pagamento_id: c.forma_pagamento_id || "",
      prazo_preferencial: c.prazo_preferencial || 0,
      logradouro: c.logradouro || "", numero: c.numero || "", complemento: c.complemento || "",
      bairro: c.bairro || "", cidade: c.cidade || "", uf: c.uf || "", cep: c.cep || "",
      pais: c.pais || "Brasil", observacoes: c.observacoes || "",
      grupo_economico_id: c.grupo_economico_id || "", tipo_relacao_grupo: c.tipo_relacao_grupo || "independente",
      caixa_postal: c.caixa_postal || "",
      ativo: c.ativo !== false,
    });
    setIsDirty(false);
    setEnderecosCount(0); setComunicacoesCount(0);
    setModalOpen(true);
  };

  const openView = (c: Cliente) => { pushView("cliente", c.id); };

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
      setFormErrors((prev) => ({ ...prev, cpf_cnpj: "Documento já cadastrado nesta tabela." }));
      toast.error("Documento já cadastrado. Corrija antes de salvar.");
      return;
    }
    setFormErrors({});
    setSaving(true);
    const payload = {
      ...form,
      grupo_economico_id: form.grupo_economico_id || null,
      caixa_postal: form.caixa_postal || null,
      forma_pagamento_id: form.forma_pagamento_id || null,
      // forma_pagamento_padrao DEPRECATED — leitura agora vem de join com formas_pagamento.
      // Mantemos null para não criar drift; backfill histórico permanece intacto.
      forma_pagamento_padrao: null,
      prazo_preferencial: form.prazo_preferencial || null,
    };
    try {
      if (mode === "create") await create(payload);
      else if (selected) await update(selected.id, payload);
      setIsDirty(false);
      setModalOpen(false);
    } catch (err) {
      console.error('[clientes] erro ao salvar:', err);
      notifyError(err);
    }
    setSaving(false);
  };

  const grupoNome = (id: string | null) => !id ? "—" : grupos.find((g) => g.id === id)?.nome || "—";
  const relacaoLabel: Record<string, string> = { matriz: "Matriz", filial: "Filial", coligada: "Coligada", independente: "Independente" };
  const updateForm = (updates: Partial<ClienteFormData>) => { setForm(prev => ({ ...prev, ...updates })); setIsDirty(true); };

  // tipo/ativo/grupo agora são server-side. Apenas o caso especial
  // "sem_grupo" misto (NULL + outros) ainda exige refinamento client-side.
  const filteredData = useMemo(() => {
    let out = data;
    if (hasSemGrupoFilter) {
      out = out.filter((cliente) => {
        const groupId = cliente.grupo_economico_id || "sem_grupo";
        return grupoFilters.includes(groupId);
      });
    }
    if (cadastroFilters.length > 0) {
      // Filtros client-side aplicados sobre a página atual.
      // TODO: migrar para RPC server-side (kpi_clientes_qualidade) numa próxima onda.
      out = out.filter((c) => {
        const missing = getMissingFields(c);
        return cadastroFilters.every((f) => {
          switch (f) {
            case "incompleto": return missing.filter((m) => m !== "grupo").length > 0;
            case "sem_contato": return !(c.celular || c.telefone) && !c.email;
            case "sem_telefone": return !(c.celular || c.telefone);
            case "sem_email": return !c.email;
            case "sem_prazo": return !c.prazo_padrao || c.prazo_padrao <= 0;
            case "sem_grupo": return !c.grupo_economico_id;
            default: return true;
          }
        });
      });
    }
    return out;
  }, [data, hasSemGrupoFilter, grupoFilters, cadastroFilters]);

  const columns = [
    {
      key: "nome_razao_social", mobilePrimary: true, label: "Cliente", sortable: true,
      // Permite ordenação server-side pela coluna de nome.
      serverSortable: true,
      render: (c: Cliente) => {
        const fantasiaDifere = c.nome_fantasia && c.nome_fantasia !== c.nome_razao_social;
        const cidadeUf = c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade || c.uf;
        const grupo = grupoNome(c.grupo_economico_id);
        const subline = [
          fantasiaDifere ? c.nome_fantasia : null,
          cidadeUf || null,
          grupo !== "—" ? grupo : null,
        ].filter(Boolean).join(" · ");
        return (
          <div className="min-w-0">
            <p className="font-medium leading-tight truncate">{c.nome_razao_social}</p>
            {subline && (
              <p className="text-xs text-muted-foreground truncate max-w-xs">{subline}</p>
            )}
          </div>
        );
      },
    },
    { key: "cpf_cnpj", mobileCard: true, label: "CPF / CNPJ", serverSortable: true,
      render: (c: Cliente) => (
        <span className="font-mono text-xs tabular-nums">
          {c.cpf_cnpj ? cpfCnpjMask(c.cpf_cnpj) : "—"}
        </span>
      ) },
    { key: "tipo_pessoa", mobileCard: true, label: "Tipo",
      render: (c: Cliente) => {
        const isPf = c.tipo_pessoa === "F";
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide font-semibold">
                {isPf ? "PF" : "PJ"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{isPf ? "Pessoa Física" : "Pessoa Jurídica"}</TooltipContent>
          </Tooltip>
        );
      },
    },
    { key: "contato_principal", mobileCard: true, label: "Contato",
      render: (c: Cliente) => {
        const phone = c.celular || c.telefone;
        if (!phone && !c.email) {
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setCadastroFilters(["sem_contato"]); }}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Sem contato
            </button>
          );
        }
        return (
          <div className="text-xs space-y-0.5">
            {phone && (
              <p className="font-medium tabular-nums flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                <span>{phoneMask(phone)}</span>
              </p>
            )}
            {c.email && (
              <p className="text-muted-foreground truncate max-w-[220px] flex items-center gap-1.5">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.email}</span>
              </p>
            )}
          </div>
        );
      },
    },
    { key: "prazo_padrao", mobileCard: true, label: "Prazo Pgto.",
      render: (c: Cliente) => c.prazo_padrao
        ? <span className="text-xs font-medium"><span className="tabular-nums">{c.prazo_padrao}</span> dias</span>
        : <span className="text-muted-foreground text-xs">Sem prazo</span> },
    { key: "situacao", label: "Situação",
      render: (c: Cliente) => {
        const missing = getMissingFields(c).filter((m) => m !== "grupo");
        if (missing.length === 0) {
          return <StatusBadge status="ativo" label="Completo" />;
        }
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                <AlertTriangle className="h-3 w-3" />
                Incompleto
              </span>
            </TooltipTrigger>
            <TooltipContent>Falta: {missing.join(", ")}</TooltipContent>
          </Tooltip>
        );
      },
    },
    { key: "grupo", label: "Grupo Econômico", hidden: true,
      render: (c: Cliente) => grupoNome(c.grupo_economico_id) },
    { key: "ativo", mobileCard: true, label: "Status", hidden: true,
      render: (c: Cliente) => <StatusBadge status={c.ativo ? "ativo" : "inativo"} /> },
  ];

  const cliActiveFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    tipoFilters.forEach(f => {
      chips.push({ key: "tipo", label: "Tipo", value: [f],
        displayValue: f === "J" ? "Pessoa Jurídica" : "Pessoa Física" });
    });
    grupoFilters.forEach(f => {
      const g = grupos.find(x => x.id === f);
      chips.push({ key: "grupo", label: "Grupo", value: [f], displayValue: g?.nome || "Sem grupo" });
    });
    ativoFilters.forEach(f => {
      chips.push({ key: "ativo", label: "Status", value: [f],
        displayValue: f === "ativo" ? "Ativo" : "Inativo" });
    });
    const cadastroLabels: Record<string, string> = {
      incompleto: "Incompletos",
      sem_contato: "Sem contato",
      sem_telefone: "Sem telefone",
      sem_email: "Sem e-mail",
      sem_prazo: "Sem prazo",
      sem_grupo: "Sem grupo",
    };
    cadastroFilters.forEach(f => {
      chips.push({ key: "cadastro", label: "Cadastro", value: [f],
        displayValue: cadastroLabels[f] || f });
    });
    return chips;
  }, [tipoFilters, grupoFilters, grupos, ativoFilters, cadastroFilters]);

  const handleRemoveCliFilter = (key: string, value?: string) => {
    if (key === "tipo") setTipoFilters(tipoFilters.filter(v => v !== value));
    if (key === "grupo") setGrupoFilters(grupoFilters.filter(v => v !== value));
    if (key === "ativo") setAtivoFilters(ativoFilters.filter(v => v !== value));
    if (key === "cadastro") setCadastroFilters(cadastroFilters.filter(v => v !== value));
  };

  const tipoOptions: MultiSelectOption[] = [
    { label: "Pessoa Jurídica", value: "J" },
    { label: "Pessoa Física", value: "F" },
  ];
  const grupoOptions: MultiSelectOption[] = [
    ...grupos.map(g => ({ label: g.nome, value: g.id })),
    { label: "Sem grupo", value: "sem_grupo" },
  ];
  const ativoOptions: MultiSelectOption[] = [
    { label: "Ativo", value: "ativo" },
    { label: "Inativo", value: "inativo" },
  ];
  const cadastroOptions: MultiSelectOption[] = [
    { label: "Incompletos", value: "incompleto" },
    { label: "Sem contato", value: "sem_contato" },
    { label: "Sem telefone", value: "sem_telefone" },
    { label: "Sem e-mail", value: "sem_email" },
    { label: "Sem prazo", value: "sem_prazo" },
    { label: "Sem grupo", value: "sem_grupo" },
  ];

  // Em modo paged `data` contém só a página atual — KPIs vêm de count() server-side.
  const summaryAtivos = totalAtivos ?? 0;
  const totalRegistros = totalCount ?? data.length;
  // KPI client-side: contagem de cadastros incompletos na página atual.
  // TODO: substituir por RPC agregado (kpi_clientes_qualidade) numa próxima onda.
  const summaryIncompletosPagina = useMemo(
    () => data.filter((c) => getMissingFields(c).filter((m) => m !== "grupo").length > 0).length,
    [data],
  );
  // Mantém o total de "com grupo" disponível para análise futura.
  void totalComGrupo;

  const isIncompletoActive = cadastroFilters.includes("incompleto");
  const ativoOnly = ativoFilters.length === 1 && ativoFilters[0] === "ativo";
  const inativoOnly = ativoFilters.length === 1 && ativoFilters[0] === "inativo";
  const noFilters = ativoFilters.length === 0 && tipoFilters.length === 0
    && grupoFilters.length === 0 && cadastroFilters.length === 0 && !searchTerm;

  return (
    <>
      <ModulePage
        title="Clientes"
        subtitle="Consulta comercial e cadastro de clientes"
        addLabel="Novo Cliente"
        onAdd={openCreate}
        addButtonHelpId="clientes.novoBtn"
        summaryCards={
          <>
            <SummaryCard
              title="Total de Clientes"
              shortTitle="Total"
              value={totalRegistros}
              icon={Users}
              onClick={() => clearFilters(["tipo", "grupo", "ativo", "cadastro"])}
              active={noFilters}
            />
            <SummaryCard
              title="Ativos"
              value={summaryAtivos}
              icon={UserCheck}
              variant="success"
              onClick={() => setAtivoFilters(ativoOnly ? [] : ["ativo"])}
              active={ativoOnly}
            />
            <SummaryCard
              title="Inativos"
              value={Math.max(0, totalRegistros - summaryAtivos)}
              icon={User2}
              onClick={() => setAtivoFilters(inativoOnly ? [] : ["inativo"])}
              active={inativoOnly}
            />
            <SummaryCard
              title="Incompletos (página)"
              shortTitle="Incompletos"
              value={summaryIncompletosPagina}
              icon={AlertTriangle}
              variant="warning"
              onClick={() => setCadastroFilters(isIncompletoActive ? [] : ["incompleto"])}
              active={isIncompletoActive}
            />
          </>
        }
      >
        <div data-help-id="clientes.filtros">
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={isMobile ? "Buscar cliente..." : "Buscar por nome, CNPJ, e-mail ou cidade..."}
          activeFilters={cliActiveFilters}
          onRemoveFilter={handleRemoveCliFilter}
          onClearAll={() => clearFilters(["tipo", "grupo", "ativo", "cadastro"])}
          count={totalCount ?? filteredData.length}
        >
          <MultiSelect options={ativoOptions} selected={ativoFilters} onChange={setAtivoFilters} placeholder="Status" className="w-[130px]" />
          <MultiSelect options={tipoOptions} selected={tipoFilters} onChange={setTipoFilters} placeholder="Tipos" className="w-[150px]" />
          <MultiSelect options={grupoOptions} selected={grupoFilters} onChange={setGrupoFilters} placeholder="Grupos" className="w-[200px]" />
          <MultiSelect options={cadastroOptions} selected={cadastroFilters} onChange={setCadastroFilters} placeholder="Cadastro" className="w-[160px]" />
        </AdvancedFilterBar>
        </div>

        <PullToRefresh onRefresh={fetchData}>
          <div data-help-id="clientes.tabela" className="pb-32 md:pb-0">
          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            moduleKey="clientes"
            showColumnToggle={true}
            onView={openView}
            onEdit={openEdit}
            onDelete={canExcluir ? (c) => remove(c.id) : undefined}
            deleteBehavior="soft"
            mobileIdentifierKey="cpf_cnpj"
            mobileStatusKey="ativo"
            mobileLabeledDetails
            serverPagination={{ page, setPage, totalCount, hasMore }}
            onServerSort={sort.onChange}
            serverSortKey={sort.sortKey}
            serverSortDir={sort.sortDir}
            mobileInlineActions={(c: Cliente) => (
              <ContactInlineActions
                phone={c.celular || c.telefone}
                whatsapp={c.celular || c.telefone}
                email={c.email}
                onView={() => openView(c)}
              />
            )}
          />
          </div>
        </PullToRefresh>
      </ModulePage>

      <MobileQuickAddFAB
        onClick={() => setQuickAddOpen(true)}
        label="Novo cliente"
      />
      <QuickAddClientModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={() => {
          setQuickAddOpen(false);
          fetchData();
          toast.success("Cliente cadastrado com sucesso");
        }}
      />

      <QuickAddFormaPagamentoModal
        open={quickAddFormaPagOpen}
        onClose={() => setQuickAddFormaPagOpen(false)}
        onCreated={async (id) => {
          const fp = await listFormasPagamentoAtivas();
          setFormasPagamento(fp as FormaPagamentoBasic[]);
          updateForm({ forma_pagamento_id: id });
          setQuickAddFormaPagOpen(false);
        }}
      />

      <FormModal
        open={modalOpen}
        onClose={async () => {
          if (isDirty && !(await confirmDiscard())) return;
          setModalOpen(false);
        }}
        title={mode === "create" ? "Novo Cliente" : "Editar Cliente"}
        size="xl"
        mode={mode}
        createHint="Preencha os dados básicos para criar o cliente. Endereços, transportadoras e comunicações ficam disponíveis após salvar."
        identifier={mode === "edit" && selected?.cpf_cnpj ? selected.cpf_cnpj : undefined}
        status={mode === "edit" && selected ? <StatusBadge status={selected.ativo ? "ativo" : "inativo"} /> : undefined}
        headerActions={mode === "edit" && selected ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch
              checked={form.ativo}
              onCheckedChange={(v) => updateForm({ ativo: v })}
              aria-label={form.ativo ? "Inativar cliente" : "Reativar cliente"}
            />
            <span className="font-medium">{form.ativo ? "Ativo" : "Inativo"}</span>
          </label>
        ) : undefined}
        meta={mode === "edit" && selected ? [
          ...(selected.created_at ? [{ icon: Calendar, label: `Cadastrado em ${formatDate(selected.created_at)}` }] : []),
          ...(form.forma_pagamento_id
            ? [{
                icon: CreditCard,
                label: formasPagamento.find((fp) => fp.id === form.forma_pagamento_id)?.descricao
                  ?? "Forma de pagamento",
              }]
            : []),
          ...(form.grupo_economico_id ? [{ icon: Building2, label: grupos.find(g => g.id === form.grupo_economico_id)?.nome ?? "Grupo" }] : []),
        ] : undefined}
        isDirty={isDirty}
        footer={
          <FormModalFooter
            saving={saving} isDirty={isDirty}
            onCancel={async () => {
              if (isDirty && !(await confirmDiscard())) return;
              setModalOpen(false);
            }}
            submitAsForm formId="cliente-form" mode={mode}
          />
        }
      >
        <form id="cliente-form" onSubmit={handleSubmit} className="space-y-0">
          <Tabs defaultValue="dados-gerais" className="w-full">
            <TabsList className="mb-4 w-full justify-start overflow-x-auto">
              <TabsTrigger value="dados-gerais" className="gap-1.5"><User2 className="h-3.5 w-3.5" />Dados Gerais</TabsTrigger>
              <TabsTrigger value="contatos" className="gap-1.5"><Phone className="h-3.5 w-3.5" />Contatos</TabsTrigger>
              <TabsTrigger value="endereco" className="gap-1.5"><MapPin className="h-3.5 w-3.5" />Endereço</TabsTrigger>
              {mode === "edit" && (
                <TabsTrigger value="entregas" className="gap-1.5">
                  <Home className="h-3.5 w-3.5" />Entregas
                  {enderecosCount > 0 && <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{enderecosCount}</span>}
                </TabsTrigger>
              )}
              <TabsTrigger value="comercial" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />Comercial</TabsTrigger>
              {mode === "edit" && (
                <TabsTrigger value="comunicacoes" className="gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />Comunicações
                  {comunicacoesCount > 0 && <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{comunicacoesCount}</span>}
                </TabsTrigger>
              )}
              <TabsTrigger value="observacoes" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Obs.</TabsTrigger>
            </TabsList>

            {/* DADOS GERAIS */}
            <TabsContent value="dados-gerais" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="space-y-1.5">
                  <Label>Tipo de Pessoa</Label>
                  <Select value={form.tipo_pessoa} onValueChange={(v) => updateForm({ tipo_pessoa: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="F">Pessoa Física</SelectItem>
                      <SelectItem value="J">Pessoa Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>CPF/CNPJ</Label>
                    {form.tipo_pessoa === "J" && (
                      <Tooltip>
                        <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                        <TooltipContent className="max-w-[220px] text-xs">
                          Informe o CNPJ e clique em <strong>Consultar</strong> para preencher automaticamente Razão Social, Nome Fantasia, e-mail, telefone e endereço.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <MaskedInput mask="cpf_cnpj" value={form.cpf_cnpj} onChange={(v) => updateForm({ cpf_cnpj: v })} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button" variant="outline" size="icon" className="shrink-0"
                          aria-label="Buscar dados do CNPJ"
                          disabled={cnpjLoading || form.tipo_pessoa !== "J"}
                          onClick={async () => {
                            const result = await buscarCnpj(form.cpf_cnpj);
                            if (result) {
                              setForm(prev => ({
                                ...prev,
                                nome_razao_social: result.razao_social || prev.nome_razao_social,
                                nome_fantasia: result.nome_fantasia || prev.nome_fantasia,
                                inscricao_estadual: result.inscricao_estadual || prev.inscricao_estadual,
                                email: result.email || prev.email,
                                telefone: result.telefone || prev.telefone,
                                logradouro: result.logradouro || prev.logradouro,
                                numero: result.numero || prev.numero,
                                complemento: result.complemento || prev.complemento,
                                bairro: result.bairro || prev.bairro,
                                cidade: result.municipio || prev.cidade,
                                uf: result.uf || prev.uf,
                                cep: result.cep || prev.cep,
                              }));
                              setIsDirty(true);
                            }
                          }}
                        >
                          {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {form.tipo_pessoa !== "J" ? "Disponível apenas para Pessoa Jurídica" : "Consultar CNPJ e preencher automaticamente"}
                      </TooltipContent>
                    </Tooltip>
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
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Inscrição Estadual</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-xs">
                        Inscrição Estadual para emissão de notas fiscais. Informe "ISENTO" quando aplicável.
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
                      <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-xs">
                        Nome comercial pelo qual o cliente é conhecido. Aparece nas listagens e relatórios.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input value={form.nome_fantasia} onChange={(e) => updateForm({ nome_fantasia: e.target.value })} placeholder="Nome comercial (opcional)" />
                </div>
              </div>
            </TabsContent>

            {/* CONTATOS */}
            <TabsContent value="contatos" className="space-y-4 mt-0">
              <div className="mb-6 space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Referência de atendimento</p>
                  <div className="space-y-1.5">
                    <Label>Pessoa de Contato</Label>
                    <Input value={form.contato} onChange={(e) => updateForm({ contato: e.target.value })} placeholder="Nome do responsável pelo contato comercial" />
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
                        type="email" value={form.email} onChange={(e) => updateForm({ email: e.target.value })}
                        placeholder="email@empresa.com.br"
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

            {/* COMUNICAÇÕES */}
            {mode === "edit" && selected && (
              <TabsContent value="comunicacoes" className="space-y-4 mt-0">
                <ClienteComunicacoesTab clienteId={selected.id} onCountChange={setComunicacoesCount} />
              </TabsContent>
            )}

            {/* ENDEREÇO */}
            <TabsContent value="endereco" className="space-y-4 mt-0">
              <p className="text-xs text-muted-foreground mb-3">
                Informe o CEP para preenchimento automático do logradouro, bairro, cidade e UF.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="space-y-1.5">
                  <Label>CEP</Label>
                  <div className="relative">
                    <MaskedInput
                      mask="cep" value={form.cep} onChange={(v) => updateForm({ cep: v })}
                      onBlur={async () => {
                        const result = await buscarCep(form.cep);
                        if (result) {
                          setForm(prev => ({ ...prev, logradouro: result.logradouro, bairro: result.bairro, cidade: result.localidade, uf: result.uf }));
                          setIsDirty(true);
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
                <div className="col-span-2 space-y-1.5">
                  <Label>Logradouro</Label>
                  <Input value={form.logradouro} onChange={(e) => updateForm({ logradouro: e.target.value })} placeholder="Rua, Av., Travessa..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Número</Label>
                  <Input value={form.numero} onChange={(e) => updateForm({ numero: e.target.value })} placeholder="Nº ou S/N" />
                </div>
                <div className="space-y-1.5">
                  <Label>Complemento</Label>
                  <Input value={form.complemento} onChange={(e) => updateForm({ complemento: e.target.value })} placeholder="Sala, bloco, andar..." />
                </div>
                <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => updateForm({ bairro: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => updateForm({ cidade: e.target.value })} /></div>
                <div className="space-y-1.5">
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
                <div className="space-y-1.5"><Label>País</Label><Input value={form.pais} onChange={(e) => updateForm({ pais: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Caixa Postal</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Caixa Postal para entrega de correspondências, quando diferente do endereço principal.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input value={form.caixa_postal} onChange={(e) => updateForm({ caixa_postal: e.target.value })} placeholder="Ex: CP 1234" />
                </div>
              </div>
            </TabsContent>

            {/* COMERCIAL */}
            <TabsContent value="comercial" className="space-y-4 mt-0">
              <div className="flex items-center gap-2 pb-1">
                <CreditCard className="w-4 h-4 text-primary/70" />
                <h3 className="font-semibold text-sm">Condições Comerciais</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Condições aplicadas por padrão em orçamentos e pedidos. Podem ser sobrescritas individualmente por operação.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                <div className="col-span-2 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Forma de Pagamento Padrão</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        Forma de pagamento pré-selecionada ao criar pedidos para este cliente.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={form.forma_pagamento_id || "nenhuma"}
                    onValueChange={(v) => updateForm({ forma_pagamento_id: v === "nenhuma" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Não definida" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Não definida</SelectItem>
                      {formasPagamento.map((fp) => <SelectItem key={fp.id} value={fp.id}>{fp.descricao}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setQuickAddFormaPagOpen(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Cadastrar nova forma
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Prazo Padrão (dias)</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        Prazo padrão em dias para pagamento. Aplicado automaticamente em novas operações.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number" min={0} max={MAX_PAYMENT_DAYS} value={form.prazo_padrao}
                    onChange={(e) => updateForm({ prazo_padrao: Number(e.target.value) })}
                    className={formErrors.prazo_padrao ? "border-destructive" : ""}
                  />
                  {formErrors.prazo_padrao && <p className="text-xs text-destructive">{formErrors.prazo_padrao}</p>}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Prazo Preferencial (dias)</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        Prazo alternativo negociado com o cliente. Diferente do prazo padrão — usado quando há condição especial acordada.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input type="number" min={0} max={MAX_PAYMENT_DAYS} value={form.prazo_preferencial}
                    onChange={(e) => updateForm({ prazo_preferencial: Number(e.target.value) })} />
                </div>
              </div>
              <div className="mb-4">
                <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Limite de Crédito (R$)</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        Valor máximo de crédito disponível para este cliente. Impacta a análise de risco no financeiro.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number" step="0.01" min={0} placeholder="0,00" value={form.limite_credito}
                    onChange={(e) => updateForm({ limite_credito: Number(e.target.value) })}
                    className={`max-w-xs ${formErrors.limite_credito ? "border-destructive" : ""}`}
                  />
                  {formErrors.limite_credito && <p className="text-xs text-destructive">{formErrors.limite_credito}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 pb-1 border-t">
                <Building2 className="w-4 h-4 text-primary/70" />
                <h3 className="font-semibold text-sm">Grupo Econômico</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Vincule o cliente a um grupo econômico para consolidar dados de vendas, crédito e relacionamento.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="space-y-1.5">
                  <Label>Grupo Econômico</Label>
                  <Select
                    value={form.grupo_economico_id || "nenhum"}
                    onValueChange={(v) => updateForm({ grupo_economico_id: v === "nenhum" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Nenhum</SelectItem>
                      {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Tipo de Relação</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs space-y-1">
                        <p><strong>Matriz:</strong> empresa controladora do grupo.</p>
                        <p><strong>Filial:</strong> empresa controlada pela matriz.</p>
                        <p><strong>Coligada:</strong> empresa com participação societária no grupo.</p>
                        <p><strong>Independente:</strong> sem vínculo hierárquico.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select value={form.tipo_relacao_grupo} onValueChange={(v) => updateForm({ tipo_relacao_grupo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {relacaoOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.grupo_economico_id ? (
                <div className="mb-4 flex items-center gap-2 bg-muted/30 rounded-md px-3 py-2 text-xs text-muted-foreground border">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                  <span>
                    <strong className="text-foreground">{grupos.find(g => g.id === form.grupo_economico_id)?.nome}</strong>
                    {" — "}{relacaoLabel[form.tipo_relacao_grupo] || form.tipo_relacao_grupo}
                  </span>
                </div>
              ) : <div className="mb-4" />}

              {mode === "create" ? (
                <div className="flex items-start gap-2 bg-muted/30 rounded-lg px-3 py-2.5 border border-dashed text-xs text-muted-foreground">
                  <Truck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Transportadoras preferenciais podem ser vinculadas após o cadastro inicial do cliente.</span>
                </div>
              ) : selected && (
                <ClienteTransportadorasTab clienteId={selected.id} />
              )}
            </TabsContent>

            {/* ENTREGAS */}
            {mode === "edit" && selected && (
              <TabsContent value="entregas" className="space-y-4 mt-0">
                <ClienteEnderecosTab
                  clienteId={selected.id}
                  fallbackEndereco={{
                    logradouro: form.logradouro, numero: form.numero, complemento: form.complemento,
                    bairro: form.bairro, cidade: form.cidade, uf: form.uf, cep: form.cep,
                  }}
                  onCountChange={setEnderecosCount}
                />
              </TabsContent>
            )}

            {/* OBSERVAÇÕES */}
            <TabsContent value="observacoes" className="space-y-4 mt-0">
              <p className="text-xs text-muted-foreground mb-3">
                Notas internas e contexto adicional sobre o cliente. Visível apenas internamente.
              </p>
              <div className="mb-6">
                <Textarea
                  rows={5} maxLength={MAX_OBSERVACOES_LENGTH}
                  value={form.observacoes}
                  onChange={(e) => updateForm({ observacoes: e.target.value })}
                  placeholder="Informações relevantes sobre o cliente: preferências, restrições, histórico de relacionamento..."
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">{(form.observacoes || "").length}/{MAX_OBSERVACOES_LENGTH}</p>
              </div>
            </TabsContent>
          </Tabs>
        </form>
      </FormModal>

      {discardDialog}
    </>
  );
};

export default Clientes;
