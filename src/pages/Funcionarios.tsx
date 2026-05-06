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
import { Edit, Trash2, DollarSign, Users, UserCheck, UserX, CalendarDays, FileText, AlertTriangle, CheckCircle2, HelpCircle, Loader2, Info } from "lucide-react";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createFolhaPagamento, gerarFinanceiroFolha } from "@/services/rh.service";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { notifyError } from "@/utils/errorMessages";
import { useEffect } from "react";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useCan } from "@/hooks/useCan";
import { useDocumentoUnico } from "@/hooks/useDocumentoUnico";
import { useEditDeepLink } from "@/hooks/useEditDeepLink";
import { logger } from "@/lib/logger";

interface Funcionario {
  id: string; nome: string; cpf: string; cargo: string; departamento: string;
  data_admissao: string; data_demissao: string | null; salario_base: number;
  tipo_contrato: string; observacoes: string; ativo: boolean; created_at: string;
}

interface FolhaPagamento {
  id: string; funcionario_id: string; competencia: string; salario_base: number;
  proventos: number; descontos: number; valor_liquido: number; observacoes: string;
  status: string; financeiro_gerado: boolean;
}

interface FinanceiroLancamento {
  id: string; descricao: string; valor: number; data_vencimento: string;
  data_pagamento: string | null; status: string;
}

const tipoContratoLabel: Record<string, string> = { clt: "CLT", pj: "PJ", estagio: "Estágio", temporario: "Temporário" };

/** Typed form for create/edit — avoids `Record<string, any>`. */
interface FuncionarioForm {
  nome: string; cpf: string; cargo: string; departamento: string;
  data_admissao: string; data_demissao: string | null; salario_base: number;
  tipo_contrato: string; observacoes: string; ativo: boolean;
}

const emptyForm: FuncionarioForm = {
  nome: "", cpf: "", cargo: "", departamento: "", data_admissao: new Date().toISOString().split("T")[0],
  data_demissao: null, salario_base: 0, tipo_contrato: "clt", observacoes: "", ativo: true,
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
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const tipoContratoFilters = filterValue.contrato;
  const setTipoContratoFilters = (v: string[]) => setFilter({ contrato: v });
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

  // Folha states
  const [folhaModalOpen, setFolhaModalOpen] = useState(false);
  const [folhaForm, setFolhaForm] = useState({ competencia: "", proventos: 0, descontos: 0, observacoes: "" });
  const [folhas, setFolhas] = useState<FolhaPagamento[]>([]);
  const [loadingFolhas, setLoadingFolhas] = useState(false);

  // Financeiro states
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([]);
  const [loadingLancamentos, setLoadingLancamentos] = useState(false);

  const kpis = useMemo(() => {
    const ativos = data.filter(f => f.ativo);
    const totalSalarios = ativos.reduce((s, f) => s + Number(f.salario_base || 0), 0);
    return { total: data.length, ativos: ativos.length, inativos: data.length - ativos.length, totalSalarios };
  }, [data]);

  // Derived values used in the edit form context section
  const lancamentosAbertos = lancamentos.filter(l => l.status === "aberto");

  const openCreate = () => {
    setMode("create");
    reset({ ...emptyForm });
    setSelected(null);
    setFolhas([]);
    setLancamentos([]);
    setModalOpen(true);
  };
  const openEdit = (f: Funcionario) => {
    setMode("edit"); setSelected(f);
    const next: FuncionarioForm = { nome: f.nome, cpf: f.cpf || "", cargo: f.cargo || "", departamento: f.departamento || "", data_admissao: f.data_admissao, data_demissao: f.data_demissao || null, salario_base: f.salario_base, tipo_contrato: f.tipo_contrato, observacoes: f.observacoes || "", ativo: f.ativo };
    reset(next);
    // limpa estados de drawer-context para evitar mostrar dados de registro anterior por instante
    setFolhas([]);
    setLancamentos([]);
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
      const payload = { ...form, data_demissao: form.data_demissao || null };
      if (mode === "create") await create(payload as Partial<Funcionario>);
      else if (selected) {
        await update(selected.id, payload as Partial<Funcionario>);
        if (selected.ativo && !form.ativo && folhas.length > 0) {
          toast.info(`${selected.nome} foi inativado. O histórico de folha foi preservado.`);
        }
      }
      markPristine();
      setModalOpen(false);
    });
  };

  const handleFolhaSubmit = async () => {
    if (!selected || !folhaForm.competencia) { toast.error("Competência é obrigatória"); return; }
    // Validate AAAA-MM format and prevent duplicate competência for the same employee.
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(folhaForm.competencia)) {
      toast.error("Competência inválida. Use o formato AAAA-MM.");
      return;
    }
    if (folhas.some((f) => f.competencia === folhaForm.competencia)) {
      toast.error(`Já existe folha para a competência ${folhaForm.competencia}.`);
      return;
    }
    const liquido = Number(selected.salario_base) + Number(folhaForm.proventos) - Number(folhaForm.descontos);
    try {
      await createFolhaPagamento({
        funcionario_id: selected.id,
        competencia: folhaForm.competencia,
        salario_base: selected.salario_base,
        proventos: folhaForm.proventos || 0,
        descontos: folhaForm.descontos || 0,
        valor_liquido: liquido,
        observacoes: folhaForm.observacoes || null,
        status: "processada",
      });
      toast.success("Folha registrada!");
      setFolhaModalOpen(false);
      openView(selected);
    } catch (err) {
      notifyError(err);
    }
  };

  const handleFecharFolha = async (folha: FolhaPagamento) => {
    if (folha.financeiro_gerado) {
      toast.warning('Lançamentos financeiros já foram gerados para esta folha.');
      return;
    }
    try {
      const r = await gerarFinanceiroFolha(folha.id);
      if (r?.erro) { toast.error(r.erro); return; }
      toast.success(
        `Lançamentos financeiros gerados: salário (${r.data_pagamento}) e FGTS (${r.data_fgts}).`,
      );
      if (selected) openView(selected);
    } catch (err) {
      logger.error('[funcionarios] erro ao gerar financeiro:', err);
      notifyError(err);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(f => {
      if (ativoFilters.length > 0) {
        const status = f.ativo ? "ativo" : "inativo";
        if (!ativoFilters.includes(status)) return false;
      }
      if (tipoContratoFilters.length > 0 && !tipoContratoFilters.includes(f.tipo_contrato)) return false;
      return true;
    });
  }, [data, ativoFilters, tipoContratoFilters]);

  const activeFilters = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    ativoFilters.forEach(f => chips.push({ key: "ativo", label: "Status", value: [f], displayValue: f === "ativo" ? "Ativo" : "Inativo" }));
    tipoContratoFilters.forEach(f => chips.push({ key: "tipo_contrato", label: "Contrato", value: [f], displayValue: tipoContratoLabel[f] || f }));
    return chips;
  }, [ativoFilters, tipoContratoFilters]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "ativo") setAtivoFilters(ativoFilters.filter(v => v !== value));
    else if (key === "tipo_contrato") setTipoContratoFilters(tipoContratoFilters.filter(v => v !== value));
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

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "ativo", label: "Status", render: (f: Funcionario) => <StatusBadge status={f.ativo ? "ativo" : "inativo"} /> },
    { key: "cargo", label: "Cargo", render: (f: Funcionario) => f.cargo || "—" },
    { key: "departamento", label: "Depto.", render: (f: Funcionario) => f.departamento || "—" },
    { key: "tipo_contrato", label: "Contrato", render: (f: Funcionario) => tipoContratoLabel[f.tipo_contrato] || f.tipo_contrato },
    { key: "data_admissao", label: "Admissão", render: (f: Funcionario) => formatDate(f.data_admissao) },
    { key: "cpf", label: "CPF", hidden: true, render: (f: Funcionario) => f.cpf || "—" },
    { key: "salario_base", label: "Salário Base", hidden: true, render: (f: Funcionario) => <span className="font-mono">{formatCurrency(Number(f.salario_base))}</span> },
  ];

  // Current month as YYYY-MM for default competencia
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <><ModulePage
        title="Funcionários"
        subtitle="Central de consulta e gestão de funcionários"
        addLabel="Novo Funcionário"
        onAdd={openCreate}
        summaryCards={
          <>
            <SummaryCard title="Total de Funcionários" value={String(kpis.total)} icon={Users} />
            <SummaryCard title="Ativos" value={String(kpis.ativos)} icon={UserCheck} variant="success" />
            <SummaryCard title="Inativos" value={String(kpis.inativos)} icon={UserX} variant={kpis.inativos > 0 ? "danger" : "default"} />
            <SummaryCard title="Folha Mensal" value={formatCurrency(kpis.totalSalarios)} icon={DollarSign} />
          </>
        }
      >
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome, cargo, CPF, departamento..."
          activeFilters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={() => clearFilters(["ativo", "contrato"])}
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
            onDelete={canExcluir ? (f) => remove(f.id) : undefined}
            deleteBehavior="soft"
            mobileIdentifierKey="cargo"
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
        identifier={mode === "edit" && selected?.cpf ? selected.cpf : undefined}
        status={mode === "edit" && selected ? <StatusBadge status={selected.ativo ? "ativo" : "inativo"} /> : undefined}
        meta={mode === "edit" && selected ? [
          ...(selected.cargo ? [{ label: selected.cargo }] : []),
          ...(selected.departamento ? [{ label: selected.departamento }] : []),
          ...(selected.data_admissao ? [{ label: `Admissão: ${formatDate(selected.data_admissao)}` }] : []),
        ] : undefined}
        isDirty={isFormDirty}
        footer={
          <FormModalFooter
            saving={submitting}
            isDirty={isFormDirty}
            onCancel={handleCloseModal}
            submitAsForm
            formId="funcionario-form"
            mode={mode}
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
                <Input id="emp-cpf" value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
              </div>
              {mode === "edit" && (
                <div className="space-y-1.5">
                  <Label htmlFor="emp-status">Status do colaborador</Label>
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
                  <SelectItem value="clt">CLT — Consolidação das Leis do Trabalho</SelectItem>
                  <SelectItem value="pj">PJ — Pessoa Jurídica</SelectItem>
                  <SelectItem value="estagio">Estágio</SelectItem>
                  <SelectItem value="temporario">Temporário — prazo determinado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="emp-admissao">Data de Admissão *</Label>
                <Input id="emp-admissao" type="date" value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-demissao">Data de Desligamento</Label>
                <Input id="emp-demissao" type="date" value={form.data_demissao ?? ""} onChange={e => setForm({ ...form, data_demissao: e.target.value || null })} />
                {!form.data_demissao && <p className="text-[11px] text-muted-foreground">Preencher apenas se houver desligamento</p>}
              </div>
            </div>
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

          {/* BLOCO: FOLHA / CONTEXTO FINANCEIRO (apenas em edição, quando há dados) */}
          {mode === "edit" && !loadingFolhas && (folhas.length > 0 || lancamentos.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Folha / Contexto Financeiro</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {folhas.length > 0
                      ? `${folhas.length} competência${folhas.length !== 1 ? "s" : ""} de folha registrada${folhas.length !== 1 ? "s" : ""}. Este colaborador gera lançamentos financeiros.`
                      : "Este colaborador possui lançamentos financeiros vinculados."}
                  </span>
                </p>
                <div className={`grid gap-2 ${folhas[0] ? "grid-cols-3" : "grid-cols-1"}`}>
                  {folhas[0] && (
                    <>
                      <div className="rounded-md border bg-background px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Última Competência</p>
                        <p className="font-mono text-sm font-medium mt-0.5">{folhas[0].competencia}</p>
                      </div>
                      <div className="rounded-md border bg-background px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Líquido Recente</p>
                        <p className="font-mono text-sm font-medium mt-0.5">{formatCurrency(Number(folhas[0].valor_liquido))}</p>
                      </div>
                    </>
                  )}
                  <div className="rounded-md border bg-background px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Financeiro Pendente</p>
                    <p className={`font-mono text-sm font-medium mt-0.5 ${lancamentosAbertos.length > 0 ? "text-warning dark:text-warning" : "text-muted-foreground"}`}>
                      {lancamentosAbertos.length > 0
                        ? `${lancamentosAbertos.length} aberto${lancamentosAbertos.length !== 1 ? "s" : ""}`
                        : "Em dia"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

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
