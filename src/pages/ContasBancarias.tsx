import { useState, useEffect, useMemo } from "react";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { ContaBancariaDrawer } from "@/components/financeiro/ContaBancariaDrawer";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { SummaryCard } from "@/components/SummaryCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { notifyError } from "@/utils/errorMessages";
import {
  listBancosAtivos,
  listContasBancarias,
  getContaInUseCounts,
  createContaBancaria,
  updateContaBancaria,
  inativarContaBancaria,
  setBancoFornecedor,
} from "@/services/contasBancarias.service";
import { listFornecedoresAtivos } from "@/services/pedidosCompra.service";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  Wallet, Landmark, AlertTriangle, ShieldAlert,
  CheckCircle, Ban, Building2, ChevronsUpDown, Check,
} from "lucide-react";
import { useState as useStateAlias } from "react";
import { Button as ButtonAlias } from "@/components/ui/button";

function formatCnpj(v: string | null | undefined): string {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v;
}

interface FornecedorComboboxProps {
  fornecedores: Array<{ id: string; nome_razao_social: string; cpf_cnpj?: string | null }>;
  value: string;
  onChange: (v: string) => void;
}

function FornecedorCombobox({ fornecedores, value, onChange }: FornecedorComboboxProps) {
  const [open, setOpen] = useStateAlias(false);
  const selected = fornecedores.find((f) => f.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ButtonAlias
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected ? selected.nome_razao_social : "Buscar fornecedor por nome ou CNPJ..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </ButtonAlias>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const s = search.toLowerCase();
            return itemValue.toLowerCase().includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Nome, razão social ou CNPJ..." />
          <CommandList>
            <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__ nenhum"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check className={"mr-2 h-4 w-4 " + (value ? "opacity-0" : "opacity-100")} />
                <span className="text-muted-foreground">Nenhum</span>
              </CommandItem>
              {fornecedores.map((f) => {
                const cnpj = formatCnpj(f.cpf_cnpj);
                const itemKey = `${f.nome_razao_social} ${cnpj} ${f.cpf_cnpj ?? ""}`;
                return (
                  <CommandItem
                    key={f.id}
                    value={itemKey}
                    onSelect={() => {
                      onChange(f.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={
                        "mr-2 h-4 w-4 " + (value === f.id ? "opacity-100" : "opacity-0")
                      }
                    />
                    <div className="flex flex-col">
                      <span>{f.nome_razao_social}</span>
                      {cnpj && <span className="text-xs text-muted-foreground">{cnpj}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


interface Banco {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  fornecedor_id?: string | null;
  fornecedores?: { id: string; nome_razao_social: string } | null;
}
interface ContaBancaria {
  id: string; banco_id: string; descricao: string; agencia: string; conta: string;
  titular: string; saldo_atual: number; ativo: boolean;
  bancos?: {
    nome: string;
    tipo: string;
    fornecedor_id?: string | null;
    fornecedores?: { id: string; nome_razao_social: string } | null;
  };
}

interface FornecedorOption { id: string; nome_razao_social: string; cpf_cnpj?: string | null }

interface InUseCounts {
  lancamentos: number;
  baixas: number;
  caixaMovs: number;
}

const tipoContaLabel: Record<string, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
  investimento: "Investimento",
  caixa: "Caixa",
};

function getTipoLabel(tipo: string | undefined) {
  if (!tipo) return "—";
  return tipoContaLabel[tipo.toLowerCase()] ?? tipo;
}

type ContaBancariaForm = {
  banco_id: string;
  descricao: string;
  agencia: string;
  conta: string;
  titular: string;
  saldo_atual: number;
  ativo: boolean;
  /** Fornecedor vinculado ao banco (DDA). Não pertence à conta, mas é editável aqui por conveniência. */
  banco_fornecedor_id: string;
};
const emptyContaForm: ContaBancariaForm = {
  banco_id: "",
  descricao: "",
  agencia: "",
  conta: "",
  titular: "",
  saldo_atual: 0,
  ativo: true,
  banco_fornecedor_id: "",
};

const ContasBancarias = () => {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ContaBancaria | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const { saving, submit } = useSubmitLock();
  const { form, updateForm, reset, isDirty, markPristine } = useEditDirtyForm<ContaBancariaForm>(emptyContaForm);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [inUseCounts, setInUseCounts] = useState<InUseCounts>({ lancamentos: 0, baixas: 0, caixaMovs: 0 });
  const [confirmInactivate, setConfirmInactivate] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [tipoFilters, setTipoFilters] = useState<string[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [b, c, f] = await Promise.all([
        listBancosAtivos(),
        listContasBancarias(),
        listFornecedoresAtivos().catch(() => []),
      ]);
      setBancos(b);
      setContas(c as ContaBancaria[]);
      setFornecedores(
        (f as FornecedorOption[]).map((x) => ({
          id: x.id,
          nome_razao_social: x.nome_razao_social,
          cpf_cnpj: x.cpf_cnpj ?? null,
        })),
      );
    } catch (err) {
      notifyError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Derived summaries
  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo), [contas]);
  const contasInativas = useMemo(() => contas.length - contasAtivas.length, [contas, contasAtivas]);
  const saldoTotal = useMemo(
    () => contasAtivas.reduce((s, c) => s + Number(c.saldo_atual || 0), 0),
    [contasAtivas],
  );

  // Filter options derived from loaded accounts (same source as filtering logic)
  const tipoOptions = useMemo<MultiSelectOption[]>(() => {
    const tipos = new Set(
      contas.map((c) => c.bancos?.tipo).filter(Boolean) as string[],
    );
    return Array.from(tipos).map((t) => ({ value: t, label: getTipoLabel(t) }));
  }, [contas]);

  const statusOptions: MultiSelectOption[] = [
    { label: "Ativa", value: "ativo" },
    { label: "Inativa", value: "inativo" },
  ];

  // Client-side filtered data
  const filteredData = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return contas.filter((c) => {
      if (statusFilters.length > 0) {
        if (!statusFilters.includes(c.ativo ? "ativo" : "inativo")) return false;
      }
      if (tipoFilters.length > 0) {
        if (!tipoFilters.includes(c.bancos?.tipo || "")) return false;
      }
      if (!q) return true;
      return (
        c.descricao.toLowerCase().includes(q) ||
        (c.bancos?.nome || "").toLowerCase().includes(q) ||
        (c.agencia || "").toLowerCase().includes(q) ||
        (c.conta || "").toLowerCase().includes(q) ||
        (c.titular || "").toLowerCase().includes(q)
      );
    });
  }, [contas, searchTerm, statusFilters, tipoFilters]);

  // Active filter chips for the filter bar
  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    statusFilters.forEach((v) =>
      chips.push({ key: "status", label: "Status", value: v, displayValue: v === "ativo" ? "Ativa" : "Inativa" }),
    );
    tipoFilters.forEach((v) =>
      chips.push({ key: "tipo", label: "Tipo", value: v, displayValue: getTipoLabel(v) }),
    );
    return chips;
  }, [statusFilters, tipoFilters]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "status") setStatusFilters((prev) => prev.filter((v) => v !== value));
    if (key === "tipo") setTipoFilters((prev) => prev.filter((v) => v !== value));
  };

  const closeModal = async () => {
    if (isDirty && !(await confirm())) return;
    setModalOpen(false);
  };

  const openCreate = () => {
    setMode("create");
    reset({ ...emptyContaForm });
    setInUseCounts({ lancamentos: 0, baixas: 0, caixaMovs: 0 });
    setModalOpen(true);
  };

  const openEdit = async (c: ContaBancaria) => {
    setMode("edit");
    setSelected(c);
    const bancoAtual = bancos.find((b) => b.id === c.banco_id);
    reset({
      banco_id: c.banco_id,
      descricao: c.descricao,
      agencia: c.agencia || "",
      conta: c.conta || "",
      titular: c.titular || "",
      saldo_atual: c.saldo_atual || 0,
      ativo: c.ativo,
      banco_fornecedor_id:
        c.bancos?.fornecedor_id ?? bancoAtual?.fornecedor_id ?? "",
    });
    setModalOpen(true);
    try {
      const counts = await getContaInUseCounts(c.id);
      setInUseCounts(counts);
    } catch (err) {
      notifyError(err);
    }
  };

  const persistCreate = async () => {
    await submit(async () => {
      await createContaBancaria({
        banco_id: form.banco_id,
        descricao: form.descricao,
        agencia: form.agencia || null,
        conta: form.conta || null,
        titular: form.titular || null,
        saldo_atual: form.saldo_atual,
      });
      // Vincula o fornecedor ao banco (DDA), se selecionado e diferente do atual.
      if (form.banco_id) {
        const bancoAtual = bancos.find((b) => b.id === form.banco_id);
        const novoFornecedor = form.banco_fornecedor_id || null;
        if ((bancoAtual?.fornecedor_id ?? null) !== novoFornecedor) {
          await setBancoFornecedor(form.banco_id, novoFornecedor);
        }
      }
      toast.success("Conta criada com sucesso!");
      markPristine();
      setModalOpen(false);
      fetchData();
    });
  };

  const persistUpdate = async () => {
    if (!selected) return;
    await submit(async () => {
      await updateContaBancaria(selected.id, {
        descricao: form.descricao.trim(),
        banco_id: form.banco_id,
        agencia: form.agencia.trim() || null,
        conta: form.conta.trim() || null,
        titular: form.titular.trim() || null,
        ativo: form.ativo,
      });
      // Atualiza vínculo banco↔fornecedor se mudou.
      if (form.banco_id) {
        const bancoAtual = bancos.find((b) => b.id === form.banco_id);
        const novoFornecedor = form.banco_fornecedor_id || null;
        if ((bancoAtual?.fornecedor_id ?? null) !== novoFornecedor) {
          await setBancoFornecedor(form.banco_id, novoFornecedor);
        }
      }
      toast.success("Conta bancária atualizada com sucesso!");
      markPristine();
      setModalOpen(false);
      fetchData();
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.banco_id || !form.descricao) { toast.error("Banco e descrição são obrigatórios"); return; }
    if (mode === "edit" && selected) {
      const willDeactivate = !form.ativo && selected.ativo;
      const inUse = inUseCounts.lancamentos > 0 || inUseCounts.baixas > 0 || inUseCounts.caixaMovs > 0;
      if (willDeactivate && inUse) { setConfirmInactivate(true); return; }
      await persistUpdate();
    } else {
      await persistCreate();
    }
  };

  const handleDelete = async (c: ContaBancaria) => {
    try {
      await inativarContaBancaria(c.id);
      toast.success("Conta removida!");
      fetchData();
    } catch (err) {
      notifyError(err);
    }
  };

  const willDeactivate = mode === "edit" && selected && !form.ativo && selected.ativo;
  const inUse = inUseCounts.lancamentos > 0 || inUseCounts.baixas > 0 || inUseCounts.caixaMovs > 0;

  const columns = [
    {
      key: "descricao", label: "Conta Bancária", sortable: true,
      render: (c: ContaBancaria) => (
        <div className="flex items-center gap-2">
          <Landmark className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium leading-tight">{c.descricao}</p>
            {c.bancos?.nome && <p className="text-xs text-muted-foreground">{c.bancos.nome}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "banco", label: "Banco", sortable: true, hidden: true,
      render: (c: ContaBancaria) => <span className="text-sm">{c.bancos?.nome || "—"}</span>,
    },
    {
      key: "tipo", label: "Tipo de Conta",
      render: (c: ContaBancaria) => (
        <span className="text-xs font-medium">{getTipoLabel(c.bancos?.tipo)}</span>
      ),
    },
    {
      key: "agencia_conta", label: "Ag / Conta",
      render: (c: ContaBancaria) => (
        <span className="font-mono text-xs">
          {c.agencia ? `${c.agencia} / ${c.conta || "—"}` : (c.conta || "—")}
        </span>
      ),
    },
    {
      key: "titular", label: "Titular", hidden: true,
      render: (c: ContaBancaria) => c.titular
        ? <span className="text-sm">{c.titular}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: "saldo", label: "Saldo Atual", sortable: true,
      render: (c: ContaBancaria) => (
        <span className={`font-semibold font-mono text-sm ${Number(c.saldo_atual || 0) >= 0 ? "text-success" : "text-destructive"}`}>
          {formatCurrency(Number(c.saldo_atual || 0))}
        </span>
      ),
    },
    {
      key: "ativo", label: "Status",
      render: (c: ContaBancaria) => (
        <StatusBadge status={c.ativo ? "ativo" : "inativo"} />
      ),
    },
    {
      key: "uso", label: "Uso Operacional", hidden: true,
      render: (c: ContaBancaria) => (
        <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
          {c.ativo ? <CheckCircle className="w-3 h-3 text-success" /> : <Ban className="w-3 h-3" />}
          {c.ativo ? "Disponível" : "Inativa"}
        </Badge>
      ),
    },
  ];

  return (
    <><ModulePage
        title="Contas Bancárias"
        subtitle="Central de consulta e gestão das contas financeiras da empresa"
        addLabel="Nova Conta"
        onAdd={openCreate}
        summaryCards={
          <>
            <SummaryCard title="Total de Contas" value={String(contas.length)} icon={Building2} />
            <SummaryCard title="Ativas" value={String(contasAtivas.length)} icon={CheckCircle} variant="success" />
            <SummaryCard title="Inativas" value={String(contasInativas)} icon={Ban} />
            <SummaryCard
              title="Saldo Total"
              value={formatCurrency(saldoTotal)}
              icon={Wallet}
              variant={saldoTotal >= 0 ? "success" : "danger"}
            />
          </>
        }
      >
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome, banco, agência, conta ou titular..."
          activeFilters={activeFilterChips}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={() => { setStatusFilters([]); setTipoFilters([]); }}
          count={filteredData.length}
        >
          <MultiSelect
            options={statusOptions}
            selected={statusFilters}
            onChange={setStatusFilters}
            placeholder="Status"
            className="w-[130px]"
          />
          {tipoOptions.length > 0 && (
            <MultiSelect
              options={tipoOptions}
              selected={tipoFilters}
              onChange={setTipoFilters}
              placeholder="Tipo"
              className="w-[130px]"
            />
          )}
        </AdvancedFilterBar>

        <DataTable
          columns={columns}
          data={filteredData}
          loading={loading}
          moduleKey="contas-bancarias"
          showColumnToggle={true}
          onView={(c) => { setSelected(c); setDrawerOpen(true); }}
          onEdit={openEdit}
          onDelete={handleDelete}
          mobileIdentifierKey="agencia_conta"
          mobileStatusKey="ativo"
          emptyTitle="Nenhuma conta bancária encontrada"
          emptyDescription="Cadastre uma nova conta ou ajuste os filtros de busca."
        />
      </ModulePage>

      <FormModal
        open={modalOpen}
        onClose={closeModal}
        title={mode === "create" ? "Nova Conta Bancária" : "Editar Conta Bancária"}
        size="md"
        mode={mode}
        identifier={mode === "edit" && selected ? `${selected.bancos?.nome ?? ""}${selected.agencia ? ` · Ag. ${selected.agencia}` : ""}${selected.conta ? ` · ${selected.conta}` : ""}` : undefined}
        status={mode === "edit" && selected ? <StatusBadge status={selected.ativo ? "ativo" : "inativo"} /> : undefined}
        meta={mode === "edit" && selected?.titular ? [{ icon: Building2, label: `Titular: ${selected.titular}` }] : undefined}
        isDirty={isDirty}
        footer={
          <FormModalFooter
            saving={saving}
            isDirty={isDirty}
            onCancel={closeModal}
            submitAsForm
            formId="conta-bancaria-form"
            mode={mode}
          />
        }
      >
        <form id="conta-bancaria-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Banco *</Label>
              <Select value={form.banco_id} onValueChange={(v) => updateForm({ banco_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {bancos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Descrição *</Label><Input value={form.descricao} onChange={e => updateForm({ descricao: e.target.value })} placeholder="Ex: Conta Corrente Principal" required /></div>
            <div className="space-y-2"><Label>Agência</Label><Input value={form.agencia} onChange={e => updateForm({ agencia: e.target.value })} /></div>
            <div className="space-y-2"><Label>Conta</Label><Input value={form.conta} onChange={e => updateForm({ conta: e.target.value })} /></div>
            <div className="space-y-2"><Label>Titular</Label><Input value={form.titular} onChange={e => updateForm({ titular: e.target.value })} /></div>
            {mode === "create" && (
              <div className="space-y-2"><Label>Saldo Inicial</Label><Input type="number" step="0.01" value={form.saldo_atual} onChange={e => updateForm({ saldo_atual: Number(e.target.value) })} /></div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Fornecedor do banco (DDA) *</Label>
            <FornecedorCombobox
              fornecedores={fornecedores}
              value={form.banco_fornecedor_id}
              onChange={(v) => updateForm({ banco_fornecedor_id: v })}
            />
            <p className="text-[11px] text-muted-foreground">
              Vincula o banco a um fornecedor (ex.: Itaú → "Banco Itaú S.A."). Boletos
              DDA do banco passam a sugerir este fornecedor automaticamente. O vínculo
              é compartilhado por todas as contas do mesmo banco.
            </p>
          </div>
          {mode === "edit" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-ativo" className="text-sm font-medium cursor-pointer">Conta ativa</Label>
                  <p className="text-xs text-muted-foreground">Contas inativas não aparecem para seleção em lançamentos</p>
                </div>
                <Switch id="edit-ativo" checked={form.ativo} onCheckedChange={(checked) => updateForm({ ativo: checked })} />
              </div>
              {willDeactivate && inUse && (
                <Alert className="border-warning/40 bg-warning/5 text-warning dark:text-warning [&>svg]:text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs space-y-1">
                    <p className="font-semibold">Esta conta está em uso no sistema</p>
                    <p>
                      Foram encontrados{" "}
                      {inUseCounts.lancamentos > 0 && `${inUseCounts.lancamentos} lançamento(s)`}
                      {inUseCounts.lancamentos > 0 && inUseCounts.baixas > 0 && ", "}
                      {inUseCounts.baixas > 0 && `${inUseCounts.baixas} baixa(s)`}
                      {(inUseCounts.lancamentos > 0 || inUseCounts.baixas > 0) && inUseCounts.caixaMovs > 0 && " e "}
                      {inUseCounts.caixaMovs > 0 && `${inUseCounts.caixaMovs} movimento(s) de caixa`}
                      {" "}vinculados a esta conta.
                    </p>
                    <p>Ao salvar, você será solicitado a confirmar a inativação.</p>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </form>
      </FormModal>

      <AlertDialog open={confirmInactivate} onOpenChange={setConfirmInactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-warning" />
              Confirmar inativação da conta
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">Confirmar inativação</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2 space-y-2 text-sm">
            <p>A conta <strong>{selected?.descricao}</strong> ({selected?.bancos?.nome ?? "—"}) está vinculada a:</p>
            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
              {inUseCounts.lancamentos > 0 && <li>{inUseCounts.lancamentos} lançamento(s) financeiro(s)</li>}
              {inUseCounts.baixas > 0 && <li>{inUseCounts.baixas} baixa(s) registrada(s)</li>}
              {inUseCounts.caixaMovs > 0 && <li>{inUseCounts.caixaMovs} movimento(s) de caixa</li>}
            </ul>
            <p className="font-medium text-foreground">
              Deseja realmente inativar esta conta? Os vínculos existentes não serão removidos,
              mas a conta deixará de aparecer para novos lançamentos.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmInactivate(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await persistUpdate(); setConfirmInactivate(false); }}
              className="bg-warning hover:bg-warning text-white"
            >
              Confirmar inativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContaBancariaDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selected={selected}
        onEdit={(c) => openEdit(c)}
        onDelete={(c) => handleDelete(c)}
      />
      {confirmDialog}
    </>
  );
};

export default ContasBancarias;
