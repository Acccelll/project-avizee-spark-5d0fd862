import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { useUrlListState } from "@/hooks/useUrlListState";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useCan } from "@/hooks/useCan";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Building2, Info, Star, FileText, TrendingUp, ExternalLink, Users, Calendar, UserCheck, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useServerSort } from "@/hooks/useServerSort";
import { useTableCount } from "@/hooks/useTableCount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SummaryCard } from "@/components/SummaryCard";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { notifyError } from "@/utils/errorMessages";
import { useEditDeepLink } from "@/hooks/useEditDeepLink";
import { logger } from "@/lib/logger";

interface GrupoEconomico {
  id: string;
  nome: string;
  empresa_matriz_id: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
}

interface ClienteDoGrupo {
  id: string;
  nome_razao_social: string;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
  tipo_relacao_grupo: string | null;
  cidade: string | null;
  uf: string | null;
}

interface ClienteSimples {
  id: string;
  nome_razao_social: string;
}

interface GrupoEconomicoForm {
  nome: string;
  observacoes: string;
  empresa_matriz_id: string;
}

const emptyForm: GrupoEconomicoForm = { nome: "", observacoes: "", empresa_matriz_id: "" };

const relacaoLabel: Record<string, string> = {
  matriz: "Matriz",
  filial: "Filial",
  coligada: "Coligada",
  independente: "Independente",
};

function getRiskInfo(titulosVencidos: number, saldoConsolidado: number) {
  if (titulosVencidos > 0)
    return { label: "Risco", Icon: ShieldAlert, colorClass: "bg-destructive/10 text-destructive", badgeClass: "border-destructive/50 text-destructive" };
  if (saldoConsolidado > 0)
    return { label: "Atenção", Icon: AlertTriangle, colorClass: "bg-warning/10 text-warning dark:text-warning", badgeClass: "border-warning/50 text-warning dark:text-warning" };
  return { label: "Saudável", Icon: CheckCircle2, colorClass: "bg-success/10 text-success dark:text-success", badgeClass: "border-success/50 text-success dark:text-success" };
}

const GruposEconomicos = () => {
  const { value: filterValue, set: setFilter, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      ativo: { type: "stringArray" },
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const debouncedSearch = useDebounce(searchTerm, 350);
  const [clienteCountMap, setClienteCountMap] = useState<Record<string, number>>({});
  const { confirm: confirmDiscard, dialog: discardDialog } = useConfirmDialog();
  const { can } = useCan();
  const canExcluir = can("clientes:excluir") || can("administracao:visualizar");
  const { pushView } = useRelationalNavigation();

  const serverFilters = useMemo(() => {
    const out: Array<{ column: string; value: boolean }> = [];
    if (ativoFilters.length === 1) out.push({ column: "ativo", value: ativoFilters[0] === "ativo" });
    return out;
  }, [ativoFilters]);

  const sort = useServerSort("nome", "asc");
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
  } = useSupabaseCrud<GrupoEconomico>({
    table: "grupos_economicos",
    searchTerm: debouncedSearch,
    filterAtivo: false,
    filter: serverFilters,
    searchColumns: ["nome"],
    pageSize: 50,
    orderBy: sort.orderBy,
    ascending: sort.ascending,
  });
  const totalAtivosGrupos = useTableCount("grupos_economicos", { ativo: true }).data ?? null;

  // Stable string keys derived from data - avoids infinite effect loops caused by
  // useSupabaseCrud returning a new [] reference on every render while loading.
  const dataIdsKey = useMemo(() => data.map((g) => g.id).join(","), [data]);
  const matrizIdsKey = useMemo(
    () =>
      [...new Set(data.map((g) => g.empresa_matriz_id).filter(Boolean) as string[])].sort().join(","),
    [data],
  );

  // Load client counts per group whenever the set of group IDs changes
  useEffect(() => {
    supabase
      .from("clientes")
      .select("grupo_economico_id, id")
      .eq("ativo", true)
      .not("grupo_economico_id", "is", null)
      .then(({ data: clientes, error }) => {
        if (error) { logger.error("[grupos-economicos] erro ao carregar contagem de clientes:", error); return; }
        const counts: Record<string, number> = {};
        for (const c of (clientes || []) as { grupo_economico_id: string; id: string }[]) {
          counts[c.grupo_economico_id] = (counts[c.grupo_economico_id] || 0) + 1;
        }
        setClienteCountMap(counts);
      });
  }, [dataIdsKey]);

  // Lookup matriz_id -> nome via React Query (cache compartilhado e cancelável).
  const { data: matrizNomeMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["grupos-economicos", "matriz-nomes", matrizIdsKey],
    enabled: !!matrizIdsKey,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const ids = matrizIdsKey.split(",").filter(Boolean);
      if (ids.length === 0) return {};
      const { data: clientes, error } = await supabase
        .from("clientes")
        .select("id, nome_razao_social")
        .in("id", ids)
        .abortSignal(signal);
      if (error) {
        logger.error("[grupos-economicos] erro ao carregar nomes de matriz:", error);
        return {};
      }
      const map: Record<string, string> = {};
      for (const c of (clientes || []) as { id: string; nome_razao_social: string }[]) {
        map[c.id] = c.nome_razao_social;
      }
      return map;
    },
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<GrupoEconomico | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  // modal-specific state for the improved edit form
  const [clientesDisponiveis, setClientesDisponiveis] = useState<ClienteSimples[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [modalEmpresas, setModalEmpresas] = useState<ClienteDoGrupo[]>([]);
  const [modalSaldo, setModalSaldo] = useState(0);
  const [modalVencidos, setModalVencidos] = useState(0);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Deep-link: abrir edição via ?editId=… (drawer "Editar" → modal).
  useEditDeepLink<GrupoEconomico>({
    table: "grupos_economicos",
    onLoad: (g) => openEdit(g),
  });

  // Filtro de status agora é server-side (`serverFilters`).
  const filteredData = data;

  const isDirty = useMemo(
    () =>
      form.nome !== initialForm.nome ||
      (form.observacoes || "") !== (initialForm.observacoes || "") ||
      (form.empresa_matriz_id || "") !== (initialForm.empresa_matriz_id || ""),
    [form.nome, form.observacoes, form.empresa_matriz_id, initialForm.nome, initialForm.observacoes, initialForm.empresa_matriz_id],
  );

  const modalRiskInfo = getRiskInfo(modalVencidos, modalSaldo);
  const { Icon: ModalRiskIcon } = modalRiskInfo;

  const loadClientes = async () => {
    setLoadingClientes(true);
    try {
      const { data: c } = await supabase
        .from("clientes")
        .select("id, nome_razao_social")
        .eq("ativo", true)
        .order("nome_razao_social");
      setClientesDisponiveis((c as ClienteSimples[]) || []);
    } finally {
      setLoadingClientes(false);
    }
  };

  const loadModalSummary = async (g: GrupoEconomico) => {
    setLoadingSummary(true);
    setModalEmpresas([]);
    setModalSaldo(0);
    setModalVencidos(0);
    try {
      const { data: clientes } = await supabase
        .from("clientes")
        .select("id, nome_razao_social, nome_fantasia, cpf_cnpj, tipo_relacao_grupo, cidade, uf")
        .eq("grupo_economico_id", g.id)
        .eq("ativo", true);
      const clientesList: ClienteDoGrupo[] = (clientes as ClienteDoGrupo[]) || [];
      setModalEmpresas(clientesList);
      const clienteIds = clientesList.map((c) => c.id);
      if (clienteIds.length > 0) {
        const { data: titulos } = await supabase
          .from("financeiro_lancamentos")
          .select("valor, status")
          .in("cliente_id", clienteIds)
          .eq("tipo", "receber")
          .eq("ativo", true)
          .in("status", ["aberto", "vencido"]);
        const tots = (titulos || []) as { valor: string | number; status: string }[];
        setModalSaldo(tots.reduce((s, t) => s + Number(t.valor || 0), 0));
        setModalVencidos(tots.filter((t) => t.status === "vencido").length);
      }
    } finally {
      setLoadingSummary(false);
    }
  };

  const openCreate = () => {
    setMode("create");
    const f = { ...emptyForm };
    setForm(f);
    setInitialForm(f);
    setSelected(null);
    setModalEmpresas([]);
    setModalSaldo(0);
    setModalVencidos(0);
    setModalOpen(true);
    loadClientes();
  };

  const openEdit = (g: GrupoEconomico) => {
    setMode("edit");
    setSelected(g);
    const f = { nome: g.nome, observacoes: g.observacoes || "", empresa_matriz_id: g.empresa_matriz_id || "" };
    setForm(f);
    setInitialForm(f);
    setModalOpen(true);
    loadClientes();
    loadModalSummary(g);
  };

  const openView = (g: GrupoEconomico) => {
    pushView("grupo_economico", g.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!nome || nome.length < 2) return;
    setSaving(true);
    try {
      const payload = {
        nome,
        observacoes: form.observacoes?.trim() || null,
        empresa_matriz_id: form.empresa_matriz_id || null,
      };
      if (mode === "create") await create(payload);
      else if (selected) await update(selected.id, payload);
      setModalOpen(false);
    } catch (err: unknown) {
      logger.error("[grupos-economicos] erro ao salvar:", err);
      notifyError(err);
    }
    setSaving(false);
  };

  const handleCancel = async () => {
    if (isDirty && !(await confirmDiscard())) return;
    setModalOpen(false);
  };

  const handleViewFromEdit = () => {
    setModalOpen(false);
    if (selected) pushView("grupo_economico", selected.id);
  };

  const columns = [
    {
      key: "nome",
      label: "Nome do Grupo",
      sortable: true,
      render: (g: GrupoEconomico) => {
        const matrizNome = g.empresa_matriz_id ? matrizNomeMap[g.empresa_matriz_id] : null;
        return (
          <div>
            <p className="font-medium leading-tight">{g.nome}</p>
            {matrizNome && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Star className="h-2.5 w-2.5 text-primary/50 shrink-0" />
                {matrizNome}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "qtd_clientes",
      label: "Clientes",
      render: (g: GrupoEconomico) => {
        const count = clienteCountMap[g.id] ?? 0;
        return count > 0 ? (
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm tabular-nums">{count}</span>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      key: "empresa_matriz_id",
      label: "Empresa Matriz",
      hidden: true,
      render: (g: GrupoEconomico) => {
        const nome = g.empresa_matriz_id ? (matrizNomeMap[g.empresa_matriz_id] ?? "—") : "—";
        return <span className="text-xs">{nome}</span>;
      },
    },
    {
      key: "ativo",
      label: "Status",
      render: (g: GrupoEconomico) => <StatusBadge status={g.ativo ? "ativo" : "inativo"} />,
    },
    {
      key: "created_at",
      label: "Cadastro",
      hidden: true,
      render: (g: GrupoEconomico) => (
        <span className="text-xs text-muted-foreground">{g.created_at ? formatDate(g.created_at) : "—"}</span>
      ),
    },
  ];

  const ativoOptions: MultiSelectOption[] = [
    { label: "Ativo", value: "ativo" },
    { label: "Inativo", value: "inativo" },
  ];

  const activeFilters: FilterChip[] = ativoFilters.map((f) => ({
    key: "ativo",
    label: "Status",
    value: [f],
    displayValue: f === "ativo" ? "Ativo" : "Inativo",
  }));

  const summaryAtivos = useMemo(() => data.filter((g) => g.ativo).length, [data]);
  const summaryComClientes = useMemo(
    () => data.filter((g) => (clienteCountMap[g.id] ?? 0) > 0).length,
    [data, clienteCountMap],
  );

  return (
    <><ModulePage
        title="Grupos Econômicos"
        subtitle="Central de consulta e gestão de grupos econômicos"
        addLabel="Novo Grupo"
        onAdd={openCreate}
        count={filteredData.length}
        summaryCards={
          <>
            <SummaryCard title="Total de Grupos" value={data.length} icon={Building2} />
            <SummaryCard title="Ativos" value={summaryAtivos} icon={UserCheck} variant="success" />
            <SummaryCard title="Inativos" value={data.length - summaryAtivos} icon={Building2} />
            <SummaryCard title="Com Clientes" value={summaryComClientes} icon={Users} />
          </>
        }
      >
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome do grupo..."
          activeFilters={activeFilters}
          onRemoveFilter={(key) => {
            if (key === "ativo") setAtivoFilters([]);
          }}
          onClearAll={() => clearFilters(["ativo"])}
          count={filteredData.length}
        >
          <MultiSelect
            options={ativoOptions}
            selected={ativoFilters}
            onChange={setAtivoFilters}
            placeholder="Status"
            className="w-[130px]"
          />
        </AdvancedFilterBar>

        <PullToRefresh onRefresh={fetchData}>
          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            moduleKey="grupos-economicos"
            showColumnToggle={true}
            onView={openView}
            onEdit={openEdit}
            onDelete={canExcluir ? (g) => remove(g.id) : undefined}
            deleteBehavior="soft"
            mobileIdentifierKey="qtd_clientes"
            mobileStatusKey="ativo"
          />
        </PullToRefresh>
      </ModulePage>

      <FormModal
        open={modalOpen}
        onClose={handleCancel}
        title={mode === "create" ? "Novo Grupo Econômico" : "Editar Grupo Econômico"}
        size="lg"
        mode={mode}
        status={mode === "edit" && selected ? <StatusBadge status={selected.ativo ? "ativo" : "inativo"} /> : undefined}
        meta={mode === "edit" && selected ? [
          ...(selected.created_at ? [{ icon: Calendar, label: `Cadastrado em ${formatDate(selected.created_at)}` }] : []),
          ...(!loadingSummary && modalEmpresas.length > 0 ? [{ icon: Users, label: `${modalEmpresas.length} empresa${modalEmpresas.length !== 1 ? "s" : ""}` }] : []),
        ] : undefined}
        headerActions={mode === "edit" && selected ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={handleViewFromEdit}>
                <ExternalLink className="h-3 w-3" />Ver painel
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Fechar edição e abrir o painel completo</TooltipContent>
          </Tooltip>
        ) : undefined}
        isDirty={isDirty}
        footer={
          <FormModalFooter
            saving={saving}
            isDirty={isDirty}
            onCancel={handleCancel}
            submitAsForm
            formId="grupo-economico-form"
            mode={mode}
            disabled={!form.nome.trim() || form.nome.trim().length < 2}
            disabledReason="Nome do grupo deve ter pelo menos 2 caracteres"
          />
        }
      >
        <form id="grupo-economico-form" onSubmit={handleSubmit} className="space-y-0">
          {/* ── BLOCO 1: IDENTIFICAÇÃO DO GRUPO ── */}
          <div className="flex items-center gap-2 pb-3 border-b mb-3">
            <Building2 className="w-4 h-4 text-primary/70" />
            <h3 className="font-semibold text-sm">Identificação do Grupo</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Defina como o grupo será identificado no sistema. O nome é usado para consolidar dados comerciais e financeiros das empresas vinculadas.
          </p>
          <div className="mb-6 space-y-1.5">
            <div className="flex items-center gap-1">
              <Label className="text-sm font-medium">Nome do Grupo *</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  Grupos econômicos servem para consolidar empresas relacionadas e permitir leitura comercial e financeira conjunta. O nome deve ser único e representar claramente a estrutura.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Grupo ABC, Holding XYZ..."
              required
              minLength={2}
              className="font-medium"
            />
            {form.nome.trim().length > 0 && form.nome.trim().length < 2 && (
              <p className="text-xs text-destructive mt-1">O nome deve ter ao menos 2 caracteres.</p>
            )}
          </div>

          {/* ── BLOCO 2: EMPRESA MATRIZ ── */}
          <div className="flex items-center gap-2 pt-2 pb-3 border-t border-b mb-3">
            <Star className="w-4 h-4 text-primary/70" />
            <h3 className="font-semibold text-sm">Empresa Matriz</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            A empresa matriz é a controladora principal do grupo. Sua definição facilita a consolidação de informações e aparece em destaque no painel do grupo.
          </p>
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>Empresa Matriz</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  Selecione o cliente cadastrado que representa a empresa controladora deste grupo. A composição completa do grupo é definida pelos clientes vinculados a ele.
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={form.empresa_matriz_id || "nenhuma"}
              onValueChange={(v) => setForm({ ...form, empresa_matriz_id: v === "nenhuma" ? "" : v })}
              disabled={loadingClientes}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingClientes ? "Carregando clientes..." : "Selecionar empresa matriz..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Nenhuma</SelectItem>
                {clientesDisponiveis.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.empresa_matriz_id ? (
            <div className="mb-5 flex items-center gap-2 bg-primary/5 rounded-md px-3 py-2 text-xs text-muted-foreground border border-primary/20">
              <Star className="h-3.5 w-3.5 shrink-0 text-primary/60" />
              <span>
                <strong className="text-foreground">
                  {clientesDisponiveis.find((c) => c.id === form.empresa_matriz_id)?.nome_razao_social ?? "—"}
                </strong>
                {" — definida como empresa controladora do grupo"}
              </span>
            </div>
          ) : (
            <div className="mb-5 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 border">
              Sem empresa matriz definida. O grupo pode ser estruturado apenas com as empresas vinculadas.
            </div>
          )}

          {/* ── BLOCO: ESTRUTURA DO GRUPO ── */}
          <div className="flex items-center gap-2 pt-2 pb-3 border-t border-b mb-3">
            <Users className="w-4 h-4 text-primary/70" />
            <h3 className="font-semibold text-sm">Estrutura do Grupo</h3>
            {mode === "edit" && (
              <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">apenas leitura</span>
            )}
          </div>
          {mode === "create" ? (
            <div className="mb-5 flex items-start gap-2 bg-muted/30 rounded-md px-3 py-2.5 text-xs text-muted-foreground border">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Após criar o grupo, vincule as empresas acessando o cadastro de{" "}
                <strong className="text-foreground">Clientes</strong> e definindo o grupo econômico em cada uma. A composição completa (matriz, filiais, coligadas) é gerenciada pelos clientes vinculados.
              </span>
            </div>
          ) : loadingSummary ? (
            <div className="mb-5 h-[72px] rounded-lg bg-muted/30 animate-pulse" />
          ) : modalEmpresas.length === 0 ? (
            <div className="mb-5 flex items-start gap-2 bg-muted/30 rounded-md px-3 py-2.5 text-xs text-muted-foreground border">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Nenhuma empresa vinculada ainda. Para vincular empresas, acesse o cadastro de{" "}
                <strong className="text-foreground">Clientes</strong> e defina este grupo econômico em cada uma.
              </span>
            </div>
          ) : (
            <div className="mb-5 space-y-0.5">
              {modalEmpresas.slice(0, 5).map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors border-b last:border-b-0"
                >
                  <span className="text-xs font-medium text-foreground truncate flex-1">{emp.nome_razao_social}</span>
                  <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                    {relacaoLabel[emp.tipo_relacao_grupo ?? "independente"] ?? emp.tipo_relacao_grupo}
                  </span>
                </div>
              ))}
              {modalEmpresas.length > 5 && (
                <p className="text-[10px] text-muted-foreground text-center pt-1.5">
                  +{modalEmpresas.length - 5} empresa(s) vinculada(s)
                </p>
              )}
            </div>
          )}

          {/* ── BLOCO 3: CONTEXTO / OBSERVAÇÕES ── */}
          <div className="flex items-center gap-2 pt-2 pb-3 border-t border-b mb-3">
            <FileText className="w-4 h-4 text-primary/70" />
            <h3 className="font-semibold text-sm">Contexto / Observações</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Observações comerciais, financeiras e estruturais sobre o grupo.
          </p>
          <div className="mb-5 space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>Observações</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  Use este campo para registrar informações relevantes sobre o grupo: histórico, particularidades comerciais, condições especiais de relacionamento, etc.
                </TooltipContent>
              </Tooltip>
            </div>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Registre informações relevantes sobre o grupo econômico: histórico, particularidades comerciais, condições especiais..."
              className="min-h-[96px] resize-y"
              rows={4}
            />
          </div>

          {/* ── BLOCO 4: RESUMO CONSOLIDADO (edit mode only) ── */}
          {mode === "edit" && (
            <>
              <div className="flex items-center gap-2 pt-2 pb-3 border-t border-b mb-3">
                <TrendingUp className="w-4 h-4 text-primary/70" />
                <h3 className="font-semibold text-sm">Resumo Consolidado</h3>
                <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">apenas leitura</span>
              </div>
              {loadingSummary ? (
                <div className="mb-5 h-[76px] rounded-lg bg-muted/30 animate-pulse" />
              ) : (
                <div className="mb-5 space-y-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card p-3 text-center space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Empresas</p>
                      <p className="font-bold text-2xl text-foreground">{modalEmpresas.length}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saldo Aberto</p>
                      <p className={`font-mono font-bold text-lg ${modalSaldo > 0 ? "text-warning dark:text-warning" : "text-foreground"}`}>
                        {formatCurrency(modalSaldo)}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vencidos</p>
                      <p className={`font-bold text-2xl ${modalVencidos > 0 ? "text-destructive" : "text-success dark:text-success"}`}>
                        {modalVencidos}
                      </p>
                    </div>
                  </div>
                  {(modalEmpresas.length > 0 || modalSaldo > 0 || modalVencidos > 0) && (
                    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${modalRiskInfo.colorClass}`}>
                      <ModalRiskIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Grupo {modalRiskInfo.label}
                        {modalRiskInfo.label === "Risco" && ` — ${modalVencidos} título(s) vencido(s)`}
                        {modalRiskInfo.label === "Atenção" && ` — saldo aberto de ${formatCurrency(modalSaldo)}`}
                        {modalRiskInfo.label === "Saudável" && " — sem títulos em aberto"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── FOOTER ── */}
        </form>
      </FormModal>

      {discardDialog}
    </>
  );
};

export default GruposEconomicos;
