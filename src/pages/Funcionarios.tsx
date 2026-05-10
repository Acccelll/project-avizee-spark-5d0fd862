import { useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useUrlListState } from "@/hooks/useUrlListState";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { SummaryCard } from "@/components/SummaryCard";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, Users, UserCheck, UserX, HelpCircle } from "lucide-react";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { deleteFuncionario } from "@/services/rh.service";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { notifyError } from "@/utils/errorMessages";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useCan } from "@/hooks/useCan";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDocumentoUnico } from "@/hooks/useDocumentoUnico";
import { useEditDeepLink } from "@/hooks/useEditDeepLink";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { cpfMask } from "@/utils/masks";
import { CheckCircle2, XCircle, Loader2, EyeOff } from "lucide-react";

interface Funcionario {
  id: string; nome: string; cpf: string; cargo: string; departamento: string;
  data_admissao: string; data_demissao: string | null; salario_base: number;
  tipo_contrato: string; observacoes: string; ativo: boolean; created_at: string;
  motivo_inativacao?: string | null;
}

const tipoContratoLabel: Record<string, string> = { clt: "CLT", pj: "PJ", estagio: "Estágio", temporario: "Temporário" };

const tipoContratoBadgeClass: Record<string, string> = {
  clt: "border-border bg-muted/40 text-foreground",
  pj: "border-primary/30 bg-primary/10 text-primary",
  estagio: "border-warning/30 bg-warning/10 text-warning",
  temporario: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
};

/** Mascara CPF preservando apenas os 3 últimos dígitos + DV. Ex.: ***.***.789-01 */
function maskCpfPartial(cpf: string | null | undefined): string {
  const digits = (cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return cpf || "";
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/** Calcula tempo de casa em "X anos e Y meses" (ou "Z meses" / "menos de 1 mês"). */
function tempoDeCasa(admissao: string | null | undefined, demissao?: string | null): string {
  if (!admissao) return "";
  const start = new Date(admissao);
  const end = demissao ? new Date(demissao) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return "";
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 1) return "menos de 1 mês";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} ${rem === 1 ? "mês" : "meses"}`;
  const yLabel = `${years} ${years === 1 ? "ano" : "anos"}`;
  if (rem === 0) return yLabel;
  return `${yLabel} e ${rem} ${rem === 1 ? "mês" : "meses"}`;
}

/** Currency em formato compacto BR (R$ 17,5 mil / R$ 1,2 mi). Usado em KPIs mobile. */
function formatCurrencyCompact(value: number): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return formatCurrency(value);
  }
}

/** Typed form for create/edit — avoids `Record<string, any>`. */
interface FuncionarioForm {
  nome: string; cpf: string; cargo: string; departamento: string;
  data_admissao: string; data_demissao: string | null; salario_base: number;
  tipo_contrato: string; observacoes: string; ativo: boolean;
  motivo_inativacao: string;
}

const emptyForm: FuncionarioForm = {
  nome: "", cpf: "", cargo: "", departamento: "", data_admissao: new Date().toISOString().split("T")[0],
  data_demissao: null, salario_base: 0, tipo_contrato: "clt", observacoes: "", ativo: true,
  motivo_inativacao: "",
};

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  // CPFs with all identical digits (e.g. 000.000.000-00, 111.111.111-11) are structurally
  // valid but officially rejected by the Receita Federal as non-existent.
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const calc = (factor: number) => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) sum += Number(digits[i]) * (factor - i);
    const rem = (sum * 10) % 11;
    return rem === 10 || rem === 11 ? 0 : rem;
  };
  return calc(10) === Number(digits[9]) && calc(11) === Number(digits[10]);
}

export default function Funcionarios() {
  const { value: filterValue, set: setFilter, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      ativo: { type: "stringArray" },
      contrato: { type: "stringArray" },
      departamento: { type: "stringArray" },
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const tipoContratoFilters = filterValue.contrato;
  const setTipoContratoFilters = (v: string[]) => setFilter({ contrato: v });
  const departamentoFilters = filterValue.departamento;
  const setDepartamentoFilters = (v: string[]) => setFilter({ departamento: v });
  const debouncedSearch = useDebounce(searchTerm, 350);
  const { data, loading, create, update, remove, fetchData } = useSupabaseCrud<Funcionario>({
    table: "funcionarios",
    searchTerm: debouncedSearch,
    filterAtivo: false,
    searchColumns: ["nome", "cpf", "cargo", "departamento"],
  });
  const { pushView } = useRelationalNavigation();
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Funcionario | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const { form, setForm, updateForm, reset, isDirty: isFormDirty, markPristine } = useEditDirtyForm<FuncionarioForm>(emptyForm);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { saving: submitting, submit } = useSubmitLock();
  const { isUnique: cpfUnico, isLoading: cpfChecking } = useDocumentoUnico("cpf", form.cpf, selected?.id, "funcionarios");
  const { confirm: confirmDiscard, dialog: confirmDiscardDialog } = useConfirmDialog();
  const { can } = useCan();
  const canExcluir = can("administracao:visualizar"); // funcionários: gerenciados por admin/RH
  // (filters above migrated to useUrlListState)

  // Deep-link: abrir edição via ?editId=… (usado pelo drawer ao clicar em "Editar").
  useEditDeepLink<Funcionario>({
    table: "funcionarios",
    onLoad: (f) => openEdit(f),
  });

  const kpis = useMemo(() => {
    const ativos = data.filter(f => f.ativo);
    const totalSalarios = ativos.reduce((s, f) => s + Number(f.salario_base || 0), 0);
    return { total: data.length, ativos: ativos.length, inativos: data.length - ativos.length, totalSalarios };
  }, [data]);

  const openCreate = () => {
    setMode("create");
    reset({ ...emptyForm });
    setSelected(null);
    setModalOpen(true);
  };
  const openEdit = (f: Funcionario) => {
    setMode("edit"); setSelected(f);
    const next: FuncionarioForm = { nome: f.nome, cpf: f.cpf ? cpfMask(f.cpf) : "", cargo: f.cargo || "", departamento: f.departamento || "", data_admissao: f.data_admissao, data_demissao: f.data_demissao || null, salario_base: f.salario_base, tipo_contrato: f.tipo_contrato, observacoes: f.observacoes || "", ativo: f.ativo, motivo_inativacao: f.motivo_inativacao || "" };
    reset(next);
    setModalOpen(true);
  };

  const handleCloseModal = async () => {
    if (isFormDirty) {
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

  const openView = (f: Funcionario) => { pushView("funcionario", f.id); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    const cpfDigits = form.cpf.replace(/\D/g, "");
    if (form.cpf && !isValidCpf(cpfDigits)) { toast.error("CPF inválido"); return; }
    if (cpfChecking) {
      toast.error("Aguarde a verificação do CPF antes de salvar.");
      return;
    }
    if (cpfUnico === false) {
      toast.error("CPF já cadastrado. Corrija antes de salvar.");
      return;
    }
    await submit(async () => {
      const payload = {
        ...form,
        cpf: cpfDigits,
        data_demissao: form.ativo ? null : (form.data_demissao || null),
      };
      if (mode === "create") await create(payload as Partial<Funcionario>);
      else if (selected) {
        await update(selected.id, payload as Partial<Funcionario>);
        if (selected.ativo && !form.ativo) {
          toast.info(`${selected.nome} foi inativado. O histórico de folha é preservado.`);
        }
      }
      markPristine();
      setModalOpen(false);
    });
  };

  const filteredData = useMemo(() => {
    return data.filter(f => {
      if (ativoFilters.length > 0) {
        const status = f.ativo ? "ativo" : "inativo";
        if (!ativoFilters.includes(status)) return false;
      }
      if (tipoContratoFilters.length > 0 && !tipoContratoFilters.includes(f.tipo_contrato)) return false;
      if (departamentoFilters.length > 0 && !departamentoFilters.includes(f.departamento || "")) return false;
      return true;
    });
  }, [data, ativoFilters, tipoContratoFilters, departamentoFilters]);

  const activeFilters = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    ativoFilters.forEach(f => chips.push({ key: "ativo", label: "Status", value: [f], displayValue: f === "ativo" ? "Ativo" : "Inativo" }));
    tipoContratoFilters.forEach(f => chips.push({ key: "tipo_contrato", label: "Contrato", value: [f], displayValue: tipoContratoLabel[f] || f }));
    departamentoFilters.forEach(f => chips.push({ key: "departamento", label: "Depto.", value: [f], displayValue: f }));
    return chips;
  }, [ativoFilters, tipoContratoFilters, departamentoFilters]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "ativo") setAtivoFilters(ativoFilters.filter(v => v !== value));
    else if (key === "tipo_contrato") setTipoContratoFilters(tipoContratoFilters.filter(v => v !== value));
    else if (key === "departamento") setDepartamentoFilters(departamentoFilters.filter(v => v !== value));
  };

  const ativoOptions: MultiSelectOption[] = [
    { label: "Ativo", value: "ativo" },
    { label: "Inativo", value: "inativo" },
  ];

  const tipoContratoOptions: MultiSelectOption[] = [
    { label: "CLT", value: "clt" },
    { label: "PJ", value: "pj" },
    { label: "Estágio", value: "estagio" },
    { label: "Temporário", value: "temporario" },
  ];

  const departamentoOptions: MultiSelectOption[] = useMemo(() => {
    const set = new Set<string>();
    data.forEach(f => { if (f.departamento) set.add(f.departamento); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map(d => ({ label: d, value: d }));
  }, [data]);

  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();

  const columns = [
    {
      key: "nome",
      label: "Funcionário",
      mobilePrimary: true,
      render: (f: Funcionario) => (
        <div className="flex flex-col leading-tight">
          <span className="font-medium">{f.nome}</span>
          {/* Desktop: CPF mascarado embaixo do nome. Mobile: CPF vai como
              identifier do card; mostramos o cargo aqui como subtítulo. */}
          {f.cpf && (
            <span className="hidden sm:inline text-xs text-muted-foreground font-mono">
              {maskCpfPartial(f.cpf)}
            </span>
          )}
          {f.cargo && (
            <span className="sm:hidden text-sm text-muted-foreground">
              {f.cargo}
            </span>
          )}
        </div>
      ),
    },
    { key: "ativo", label: "Status", render: (f: Funcionario) => <StatusBadge status={f.ativo ? "ativo" : "inativo"} /> },
    // Cargo: visível na tabela desktop, suprimido no card mobile (vai como subtítulo do nome).
    { key: "cargo", label: "Cargo", mobileCard: false, render: (f: Funcionario) => f.cargo || "—" },
    { key: "departamento", label: "Depto.", mobileCard: true, render: (f: Funcionario) => f.departamento || "—" },
    {
      key: "tipo_contrato",
      label: "Contrato",
      mobileCard: true,
      render: (f: Funcionario) => (
        <Badge
          variant="outline"
          className={cn("font-normal", tipoContratoBadgeClass[f.tipo_contrato] || "")}
        >
          {tipoContratoLabel[f.tipo_contrato] || f.tipo_contrato}
        </Badge>
      ),
    },
    {
      key: "data_admissao",
      label: "Admissão",
      mobileCard: true,
      render: (f: Funcionario) => {
        const tempo = tempoDeCasa(f.data_admissao, f.data_demissao);
        return (
          <div className="flex flex-col leading-tight">
            <span>{formatDate(f.data_admissao)}</span>
            {tempo && <span className="text-xs text-muted-foreground">{tempo}</span>}
          </div>
        );
      },
    },
    {
      key: "cpf",
      label: "CPF",
      hidden: true,
      render: (f: Funcionario) => (f.cpf ? `CPF ${maskCpfPartial(f.cpf)}` : ""),
    },
    // Coluna sensível — só disponível para admins (TODO: granular `funcionarios:salario_view`).
    ...(isAdmin
      ? [{
          key: "salario_base",
          label: "Salário Base",
          hidden: true,
          render: (f: Funcionario) => (
            <span className="font-mono">{formatCurrency(Number(f.salario_base))}</span>
          ),
        }]
      : []),
  ];

  return (
    <><ModulePage
        title="Funcionários"
        subtitle="Central de consulta e gestão de funcionários"
        addLabel="Novo Funcionário"
        onAdd={openCreate}
        summaryCards={
          <>
            <SummaryCard title="Total de Funcionários" shortTitle="Total" value={String(kpis.total)} icon={Users} />
            <SummaryCard title="Ativos" shortTitle="Ativos" value={String(kpis.ativos)} icon={UserCheck} variant="success" />
            <SummaryCard title="Inativos" shortTitle="Inativos" value={String(kpis.inativos)} icon={UserX} variant={kpis.inativos > 0 ? "danger" : "default"} />
            <SummaryCard
              title="Salários (ativos)"
              shortTitle="Folha"
              subtitle="Soma de salários-base de ativos. Não inclui encargos."
              value={isMobile ? formatCurrencyCompact(kpis.totalSalarios) : formatCurrency(kpis.totalSalarios)}
              icon={DollarSign}
            />
          </>
        }
      >
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={isMobile ? "Buscar funcionário..." : "Buscar por nome, cargo, CPF, departamento..."}
          activeFilters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={() => clearFilters(["ativo", "contrato", "departamento"])}
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
            options={tipoContratoOptions}
            selected={tipoContratoFilters}
            onChange={setTipoContratoFilters}
            placeholder="Contrato"
            className="w-[150px]"
          />
          {departamentoOptions.length > 0 && (
            <MultiSelect
              options={departamentoOptions}
              selected={departamentoFilters}
              onChange={setDepartamentoFilters}
              placeholder="Departamento"
              className="w-[170px]"
            />
          )}
        </AdvancedFilterBar>

        <PullToRefresh onRefresh={fetchData}>
          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            moduleKey="funcionarios"
            showColumnToggle={true}
            onView={openView}
            onEdit={openEdit}
            onDelete={canExcluir ? async (f) => {
              try {
                await deleteFuncionario(f.id);
                toast.success("Funcionário desativado.");
                fetchData();
              } catch (err) {
                notifyError(err);
              }
            } : undefined}
            deleteBehavior="soft"
            mobileIdentifierKey="cpf"
            mobileStatusKey="ativo"
          />
        </PullToRefresh>
      </ModulePage>

      {/* Create/Edit Modal */}
      <FormModal
        open={modalOpen}
        onClose={handleCloseModal}
        title={mode === "create" ? "Novo Funcionário" : "Editar Funcionário"}
        size="lg"
        mode={mode}
        createHint="Informe nome, CPF, cargo e admissão. Folha e financeiro ficam disponíveis após o cadastro."
        identifier={mode === "edit" && selected?.cpf ? `CPF ${cpfMask(selected.cpf)}` : undefined}
        status={mode === "edit" && selected ? <StatusBadge status={selected.ativo ? "ativo" : "inativo"} /> : undefined}
        meta={mode === "edit" && selected ? [
          ...(selected.cargo ? [{ label: selected.cargo }] : []),
          ...(selected.departamento ? [{ label: selected.departamento }] : []),
          ...(selected.data_admissao ? [{ label: `Admissão: ${formatDate(selected.data_admissao)}` }] : []),
          ...(selected.ativo && selected.data_admissao && tempoDeCasa(selected.data_admissao)
            ? [{ label: tempoDeCasa(selected.data_admissao) }]
            : []),
        ] : undefined}
        isDirty={isFormDirty}
        confirmOnDirty
        footer={
          <FormModalFooter
            saving={submitting}
            isDirty={isFormDirty}
            onCancel={handleCloseModal}
            submitAsForm
            formId="funcionario-form"
            mode={mode}
            disabled={(() => {
              const d = form.cpf.replace(/\D/g, "");
              if (form.cpf && d.length === 11 && !isValidCpf(d)) return true;
              if (cpfChecking) return true;
              if (cpfUnico === false) return true;
              return false;
            })()}
            disabledReason={(() => {
              const d = form.cpf.replace(/\D/g, "");
              if (form.cpf && d.length === 11 && !isValidCpf(d)) return "Corrija o CPF antes de salvar";
              if (cpfChecking) return "Aguarde a verificação do CPF";
              if (cpfUnico === false) return "CPF já cadastrado em outro funcionário";
              return undefined;
            })()}
          />
        }
      >
        <form id="funcionario-form" onSubmit={handleSubmit} className="space-y-6">

          {/* BLOCO: IDENTIFICAÇÃO */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Identificação</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-nome" className="font-medium">Nome completo *</Label>
              <Input id="emp-nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do colaborador" required className="text-base" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="emp-cpf">CPF <span className="text-muted-foreground text-xs font-normal">— identificador</span></Label>
                <MaskedInput
                  id="emp-cpf"
                  mask="cpf"
                  value={form.cpf}
                  onChange={(v) => setForm({ ...form, cpf: v })}
                  placeholder="000.000.000-00"
                />
                {(() => {
                  const d = form.cpf.replace(/\D/g, "");
                  if (!d) return null;
                  if (d.length < 11) {
                    return <p className="text-[11px] text-muted-foreground">Digite os 11 dígitos do CPF</p>;
                  }
                  if (!isValidCpf(d)) {
                    return <p className="text-[11px] text-destructive flex items-center gap-1"><XCircle className="w-3 h-3" /> CPF inválido</p>;
                  }
                  if (cpfChecking) {
                    return <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Verificando…</p>;
                  }
                  if (cpfUnico === false) {
                    return <p className="text-[11px] text-destructive flex items-center gap-1"><XCircle className="w-3 h-3" /> CPF já cadastrado</p>;
                  }
                  if (cpfUnico === true) {
                    return <p className="text-[11px] text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> CPF válido</p>;
                  }
                  return null;
                })()}
              </div>
              {mode === "edit" && (
                <div className="space-y-1.5">
                  <Label htmlFor="emp-status">Situação do colaborador</Label>
                  <Select value={form.ativo ? "ativo" : "inativo"} onValueChange={v => setForm({ ...form, ativo: v === "ativo" })}>
                    <SelectTrigger id="emp-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* BLOCO: VÍNCULO */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Vínculo</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="emp-tipo-contrato">Tipo de Contrato</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex cursor-help"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[230px] text-xs">
                    CLT: vínculo com carteira assinada · PJ: prestação de serviços · Estágio: contrato de estágio · Temporário: prazo determinado
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select value={form.tipo_contrato} onValueChange={v => setForm({ ...form, tipo_contrato: v })}>
                <SelectTrigger id="emp-tipo-contrato"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clt">CLT</SelectItem>
                  <SelectItem value="pj">PJ</SelectItem>
                  <SelectItem value="estagio">Estágio</SelectItem>
                  <SelectItem value="temporario">Temporário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="emp-admissao">Data de Admissão *</Label>
                <Input id="emp-admissao" type="date" value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} required />
              </div>
              {form.ativo ? (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">Data de Desligamento</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border border-dashed border-border/60 text-sm text-muted-foreground">
                    Não aplicável — colaborador ativo
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="emp-demissao">Data de Desligamento *</Label>
                  <Input
                    id="emp-demissao"
                    type="date"
                    value={form.data_demissao ?? new Date().toISOString().split("T")[0]}
                    onChange={e => setForm({ ...form, data_demissao: e.target.value || null })}
                    required
                  />
                </div>
              )}
            </div>
            {!form.ativo && (
              <div className="space-y-1.5">
                <Label htmlFor="emp-motivo-deslig">Motivo do desligamento</Label>
                <Textarea
                  id="emp-motivo-deslig"
                  value={(form as FuncionarioForm & { motivo_inativacao?: string }).motivo_inativacao ?? ""}
                  onChange={e => setForm({ ...form, motivo_inativacao: e.target.value } as FuncionarioForm)}
                  placeholder="Pedido de demissão, término de contrato, etc."
                  rows={2}
                />
              </div>
            )}
          </div>

          {/* BLOCO: ESTRUTURA INTERNA */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Estrutura Interna</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="emp-cargo">Cargo</Label>
                <Input id="emp-cargo" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} placeholder="Ex: Analista, Operador..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-departamento">Departamento</Label>
                <Input id="emp-departamento" value={form.departamento} onChange={e => setForm({ ...form, departamento: e.target.value })} placeholder="Ex: TI, RH, Produção..." />
              </div>
            </div>
          </div>

          {/* BLOCO: REMUNERAÇÃO */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Remuneração</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="emp-salario" className="font-medium">Salário Base *</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex cursor-help"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px] text-xs">
                    Base para o cálculo da folha. Ao gerar financeiro: lançamento de salário (venc. dia 5) e FGTS 8% (venc. dia 7) do mês seguinte.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input id="emp-salario" type="number" step="0.01" min={0} value={form.salario_base} onChange={e => setForm({ ...form, salario_base: Number(e.target.value) })} required className="font-mono font-semibold text-base" />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <DollarSign className="w-3 h-3 shrink-0" />
                Impacta o cálculo da folha e os lançamentos financeiros (salário + FGTS).
              </p>
            </div>
          </div>

          {/* Folha / contexto financeiro vivem no FuncionarioView (drawer) — fonte única. */}

          {/* BLOCO: OBSERVAÇÕES */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Observações</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-obs">Notas internas <span className="text-muted-foreground text-xs font-normal">— visível apenas internamente</span></Label>
              <Textarea id="emp-obs" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Notas sobre o colaborador, histórico relevante, acordos específicos..." rows={3} />
            </div>
          </div>

        </form>
      </FormModal>

      {confirmDiscardDialog}
    </>
  );
}
