import { useMemo, useState } from "react";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { useUrlListState } from "@/hooks/useUrlListState";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { SummaryCard } from "@/components/SummaryCard";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import {
  Plus, X, FileText, Banknote, CreditCard, QrCode, ArrowLeftRight, HelpCircle,
  Building2, Wallet, AlertTriangle, Users, TrendingUp, CalendarDays, StickyNote,
  Info, CheckCircle, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useCan } from "@/hooks/useCan";
import { toast } from "sonner";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useEditDeepLink } from "@/hooks/useEditDeepLink";

interface FormaPagamento {
  id: string;
  descricao: string;
  prazo_dias: number;
  parcelas: number;
  intervalos_dias: number[];
  gera_financeiro: boolean;
  tipo: string;
  observacoes: string;
  ativo: boolean;
  created_at: string;
}

const tipoLabel: Record<string, string> = {
  pix: "PIX", boleto: "Boleto", cartao: "Cartão",
  dinheiro: "Dinheiro", transferencia: "Transferência", outro: "Outro",
  boleto_dda: "Boleto/DDA",
};

const tipoIcon: Record<string, React.ElementType> = {
  pix: QrCode, boleto: FileText, cartao: CreditCard,
  dinheiro: Banknote, transferencia: ArrowLeftRight, outro: HelpCircle,
};

interface FormaPagamentoForm {
  descricao: string;
  prazo_dias: number;
  parcelas: number;
  intervalos_dias: number[];
  gera_financeiro: boolean;
  tipo: string;
  observacoes: string;
  ativo: boolean;
}

const emptyForm: FormaPagamentoForm = {
  descricao: "", prazo_dias: 0, parcelas: 1, intervalos_dias: [], gera_financeiro: true, tipo: "boleto", observacoes: "", ativo: true,
};

export default function FormasPagamento() {
  const { pushView } = useRelationalNavigation();
  const { data, loading, create, update, remove } = useSupabaseCrud<FormaPagamento>({ table: "formas_pagamento", filterAtivo: false });
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<FormaPagamento | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const { form, updateForm, reset, isDirty, markPristine } = useEditDirtyForm<FormaPagamentoForm>(emptyForm);
  const { saving, submit } = useSubmitLock();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { can } = useCan();
  const canExcluir = can("formas_pagamento:excluir");
  const { value: filterValue, set: setFilter, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      ativo: { type: "stringArray" },
      tipo: { type: "stringArray" },
      gera: { type: "stringArray" },
    },
  });
  const searchTerm = filterValue.q;
  const setSearchTerm = (v: string) => setFilter({ q: v });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Deep-link: abrir edição via ?editId=… (drawer "Editar" → modal).
  useEditDeepLink<FormaPagamento>({
    table: "formas_pagamento",
    onLoad: (f) => openEdit(f),
  });

  // Advanced filters (em URL via useUrlListState)
  const ativoFilters = filterValue.ativo;
  const setAtivoFilters = (v: string[]) => setFilter({ ativo: v });
  const tipoFilters = filterValue.tipo;
  const setTipoFilters = (v: string[]) => setFilter({ tipo: v });
  const geraFinanceiroFilters = filterValue.gera;
  const setGeraFinanceiroFilters = (v: string[]) => setFilter({ gera: v });

  // Dynamic intervals
  const [newIntervalo, setNewIntervalo] = useState<number>(30);

  const closeModal = async () => {
    if (isDirty && !(await confirm())) return;
    setModalOpen(false);
  };

  const openCreate = () => {
    setMode("create");
    reset({ ...emptyForm });
    setSelected(null);
    setModalOpen(true);
  };
  const openEdit = (f: FormaPagamento) => {
    setMode("edit"); setSelected(f);
    const intervalos = Array.isArray(f.intervalos_dias) ? f.intervalos_dias : [];
    reset({ descricao: f.descricao, prazo_dias: f.prazo_dias, parcelas: f.parcelas, intervalos_dias: intervalos, gera_financeiro: f.gera_financeiro, tipo: f.tipo, observacoes: f.observacoes || "", ativo: f.ativo });
    setModalOpen(true);
  };
  const openView = (f: FormaPagamento) => { pushView("forma_pagamento", f.id); };

  const addIntervalo = () => {
    const current = Array.isArray(form.intervalos_dias) ? form.intervalos_dias : [];
    const updated = [...current, newIntervalo].sort((a, b) => a - b);
    updateForm({ intervalos_dias: updated, parcelas: updated.length });
    setNewIntervalo((updated[updated.length - 1] || 0) + 30);
  };

  const removeIntervalo = (idx: number) => {
    const updated = form.intervalos_dias.filter((_, i) => i !== idx);
    updateForm({ intervalos_dias: updated, parcelas: Math.max(1, updated.length) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao) { toast.error("Descrição é obrigatória"); return; }
    await submit(async () => {
      const payload = {
        ...form,
        intervalos_dias: form.intervalos_dias.length > 0 ? form.intervalos_dias : [],
        parcelas: form.intervalos_dias.length > 0 ? form.intervalos_dias.length : form.parcelas,
      };
      if (mode === "create") await create(payload as Partial<FormaPagamento>);
      else if (selected) await update(selected.id, payload as Partial<FormaPagamento>);
      markPristine();
      setModalOpen(false);
    });
  };

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return data.filter((f) => {
      if (ativoFilters.length > 0) {
        const val = f.ativo ? "ativo" : "inativo";
        if (!ativoFilters.includes(val)) return false;
      }
      if (tipoFilters.length > 0) {
        if (!tipoFilters.includes(f.tipo)) return false;
      }
      if (geraFinanceiroFilters.length > 0) {
        const val = f.gera_financeiro ? "sim" : "nao";
        if (!geraFinanceiroFilters.includes(val)) return false;
      }
      if (!query) return true;
      return f.descricao.toLowerCase().includes(query);
    });
  }, [data, searchTerm, ativoFilters, tipoFilters, geraFinanceiroFilters]);

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    ativoFilters.forEach((v) =>
      chips.push({ key: "ativo", label: "Status", value: v, displayValue: v === "ativo" ? "Ativo" : "Inativo" })
    );
    tipoFilters.forEach((v) =>
      chips.push({ key: "tipo",
      mobileCard: true, label: "Tipo", value: v, displayValue: tipoLabel[v] || v })
    );
    geraFinanceiroFilters.forEach((v) =>
      chips.push({ key: "gera_financeiro", label: "Gera Financeiro", value: v, displayValue: v === "sim" ? "Sim" : "Não" })
    );
    return chips;
  }, [ativoFilters, tipoFilters, geraFinanceiroFilters]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "ativo") setAtivoFilters(ativoFilters.filter((v) => v !== value));
    if (key === "tipo") setTipoFilters(tipoFilters.filter((v) => v !== value));
    if (key === "gera_financeiro") setGeraFinanceiroFilters(geraFinanceiroFilters.filter((v) => v !== value));
  };

  const summaryAtivos = useMemo(() => data.filter((f) => f.ativo).length, [data]);
  const summaryGeraFin = useMemo(() => data.filter((f) => f.gera_financeiro).length, [data]);

  const ativoOptions: MultiSelectOption[] = [
    { label: "Ativo", value: "ativo" },
    { label: "Inativo", value: "inativo" },
  ];

  const tipoOptions: MultiSelectOption[] = Object.entries(tipoLabel).map(([value, label]) => ({ value, label }));

  const geraFinanceiroOptions: MultiSelectOption[] = [
    { label: "Gera Financeiro", value: "sim" },
    { label: "Não Gera", value: "nao" },
  ];

  const columns = [
    {
      key: "descricao",
      mobilePrimary: true, label: "Forma de Pagamento", sortable: true,
      render: (f: FormaPagamento) => {
        const Icon = tipoIcon[f.tipo];
        return (
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
            <span className="font-medium leading-tight">{f.descricao}</span>
          </div>
        );
      },
    },
    {
      key: "tipo", label: "Tipo",
      render: (f: FormaPagamento) => (
        <span className="text-xs font-medium">{tipoLabel[f.tipo] || f.tipo}</span>
      ),
    },
    {
      key: "prazo",
      mobileCard: true, label: "Prazo / Parcelas", sortable: true,
      render: (f: FormaPagamento) => {
        const intervals = Array.isArray(f.intervalos_dias) && f.intervalos_dias.length > 0 ? f.intervalos_dias : null;
        if (intervals) {
          return (
            <div>
              <span className="font-mono text-xs font-medium">{intervals.join(" / ")} d</span>
              <span className="ml-1 text-xs text-muted-foreground">({intervals.length}x)</span>
            </div>
          );
        }
        return (
          <span className="font-mono text-xs font-medium">
            {f.prazo_dias === 0 ? "À vista" : `${f.prazo_dias}d`}
          </span>
        );
      },
    },
    {
      key: "gera_financeiro", label: "Gera Financeiro",
      render: (f: FormaPagamento) => (
        <Badge
          variant="outline"
          className={f.gera_financeiro
            ? "bg-success/10 text-success border-success/30 text-xs gap-1"
            : "text-xs gap-1 text-muted-foreground"}
        >
          {f.gera_financeiro ? <CheckCircle className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
          {f.gera_financeiro ? "Sim" : "Não"}
        </Badge>
      ),
    },
    { key: "ativo", label: "Status", render: (f: FormaPagamento) => <StatusBadge status={f.ativo ? "ativo" : "inativo"} /> },
    {
      key: "observacoes", label: "Observações", hidden: true,
      render: (f: FormaPagamento) => f.observacoes
        ? <span className="text-xs text-muted-foreground truncate max-w-xs block">{f.observacoes}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
  ];

  return (
    <><ModulePage
        title="Formas de Pagamento"
        subtitle="Central de consulta e parametrização de condições de pagamento"
        addLabel="Nova Forma"
        onAdd={openCreate}
        summaryCards={
          <>
            <SummaryCard title="Total" value={String(data.length)} icon={CreditCard} />
            <SummaryCard title="Ativas" value={String(summaryAtivos)} icon={CheckCircle} variant="success" />
            <SummaryCard title="Inativas" value={String(data.length - summaryAtivos)} icon={Ban} />
            <SummaryCard title="Geram Financeiro" value={String(summaryGeraFin)} icon={Wallet} variant="info" />
          </>
        }
      >
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por descrição..."
          activeFilters={activeFilterChips}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={() => clearFilters(["ativo", "tipo", "gera"])}
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
            options={tipoOptions}
            selected={tipoFilters}
            onChange={setTipoFilters}
            placeholder="Tipo"
            className="w-[130px]"
          />
          <MultiSelect
            options={geraFinanceiroOptions}
            selected={geraFinanceiroFilters}
            onChange={setGeraFinanceiroFilters}
            placeholder="Financeiro"
            className="w-[140px]"
          />
        </AdvancedFilterBar>

        <DataTable
          columns={columns}
          data={filteredData}
          loading={loading}
          moduleKey="formas_pagamento"
          showColumnToggle={true}
          onView={openView}
          onEdit={openEdit}
          onDelete={canExcluir ? (f) => { setSelected(f); setDeleteConfirmOpen(true); } : undefined}
          deleteBehavior="soft"
          mobileIdentifierKey="tipo"
          mobileStatusKey="ativo"
        />
      </ModulePage>

      <FormModal
        open={modalOpen}
        onClose={closeModal}
        title={mode === "create" ? "Nova Forma de Pagamento" : "Editar Forma de Pagamento"}
        size="lg"
        mode={mode}
        identifier={mode === "edit" && form.tipo ? form.tipo.toUpperCase() : undefined}
        isDirty={isDirty}
        footer={
          <FormModalFooter
            saving={saving}
            isDirty={isDirty}
            onCancel={closeModal}
            submitAsForm
            formId="forma-pgto-form"
            mode={mode}
            primaryLabel={mode === "create" ? "Criar Forma de Pagamento" : "Salvar Alterações"}
          />
        }
      >
        <form id="forma-pgto-form" onSubmit={handleSubmit} className="space-y-6">

          {/* ── BLOCO 1: IDENTIFICAÇÃO DA REGRA ───────────────────────── */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b mb-4">
              <CreditCard className="w-4 h-4 text-primary/70" />
              <h3 className="font-semibold text-sm">Identificação da Regra</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fp-descricao">Descrição <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Input
                  id="fp-descricao"
                  value={form.descricao}
                  onChange={(e) => updateForm({ descricao: e.target.value })}
                  required
                  aria-required="true"
                  placeholder="Ex: 30/60/90 DDL"
                  className="text-base font-medium"
                />
                <p className="text-xs text-muted-foreground">Nome da forma de pagamento como aparecerá em clientes, orçamentos e pedidos.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => updateForm({ tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="boleto_dda">Boleto/DDA</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="cobranca_automatica">Cobrança Automática</SelectItem>
                      <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {mode === "edit" && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <div className="flex items-center gap-2 h-10">
                      <Switch
                        checked={form.ativo}
                        onCheckedChange={(v) => updateForm({ ativo: v })}
                      />
                      <span className="text-sm text-muted-foreground">{form.ativo ? "Ativo" : "Inativo"}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── BLOCO 2: CONDIÇÃO DE PAGAMENTO ────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b mb-4">
              <CalendarDays className="w-4 h-4 text-primary/70" />
              <h3 className="font-semibold text-sm">Condição de Pagamento</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Prazo Padrão{" "}
                  <span className="text-xs font-normal text-muted-foreground">(dias)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={form.prazo_dias}
                    onChange={(e) => updateForm({ prazo_dias: Number(e.target.value) })}
                    className="w-28"
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {form.prazo_dias === 0
                    ? "Pagamento à vista (0 dias)."
                    : `Vencimento padrão: ${form.prazo_dias} dias após a emissão.`}
                  {" "}Aplicado como padrão em clientes, orçamentos e pedidos.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Intervalos de Parcelas <span className="text-xs font-normal text-muted-foreground">(dias por parcela)</span></Label>
                <p className="text-xs text-muted-foreground">Defina os dias de vencimento de cada parcela a partir da data de emissão. Se preenchido, substitui o prazo padrão no cálculo das parcelas.</p>
                <div className="flex flex-wrap gap-2 min-h-[36px] rounded-md border bg-muted/20 px-2 py-1.5">
                  {(form.intervalos_dias as number[]).length === 0 ? (
                    <span className="text-xs text-muted-foreground italic self-center">Nenhum intervalo adicionado — pagamento em parcela única.</span>
                  ) : (
                    (form.intervalos_dias as number[]).map((d: number, idx: number) => (
                      <Badge key={idx} variant="secondary" className="gap-1 text-sm font-mono">
                        {d}d
                        <button type="button" onClick={() => removeIntervalo(idx)} className="ml-1 hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <Input type="number" min={1} value={newIntervalo} onChange={(e) => setNewIntervalo(Number(e.target.value))} className="w-28 h-9 text-sm" placeholder="Dias" />
                  <Button type="button" size="sm" variant="outline" className="h-9 gap-2" onClick={addIntervalo}>
                    <Plus className="w-4 h-4" /> Adicionar parcela
                  </Button>
                </div>
                {(form.intervalos_dias as number[]).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{(form.intervalos_dias as number[]).length}</span> parcela(s):{" "}
                    {(form.intervalos_dias as number[]).join(" / ")} dias.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── BLOCO 3: COMPORTAMENTO FINANCEIRO ─────────────────────── */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b mb-4">
              <Wallet className="w-4 h-4 text-primary/70" />
              <h3 className="font-semibold text-sm">Comportamento Financeiro</h3>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-medium">Gera Financeiro</p>
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, registra lançamentos automáticos no financeiro ao utilizar esta forma em pedidos e orçamentos.
                  </p>
                </div>
                <Switch
                  checked={form.gera_financeiro}
                  onCheckedChange={(v) => updateForm({ gera_financeiro: v })}
                />
              </div>
            </div>
          </div>

          {/* ── BLOCO 4: USO / CONTEXTO ───────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b mb-4">
              <Info className="w-4 h-4 text-primary/70" />
              <h3 className="font-semibold text-sm">Uso / Contexto</h3>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Users className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span><span className="font-medium text-foreground">Clientes:</span> pode ser definida como forma de pagamento padrão no cadastro do cliente.</span>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span><span className="font-medium text-foreground">Orçamentos e Pedidos:</span> aplicada automaticamente quando o cliente possui esta forma como padrão.</span>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span><span className="font-medium text-foreground">Financeiro:</span> {form.gera_financeiro ? "gera lançamentos automáticos ao finalizar pedidos." : "não gera lançamentos automáticos — ative em Comportamento Financeiro se necessário."}</span>
              </div>
            </div>
          </div>

          {/* ── BLOCO 5: OBSERVAÇÕES ──────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b mb-4">
              <StickyNote className="w-4 h-4 text-primary/70" />
              <h3 className="font-semibold text-sm">Observações</h3>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Notas internas sobre o uso desta forma de pagamento. Instruções, restrições ou acordos comerciais específicos.</p>
              <Textarea
                value={form.observacoes}
                onChange={(e) => updateForm({ observacoes: e.target.value })}
                placeholder="Ex: Utilizada apenas para clientes com limite aprovado acima de R$ 5.000..."
                rows={3}
              />
            </div>
          </div>

        </form>
      </FormModal>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => { if (selected) { remove(selected.id); } setDeleteConfirmOpen(false); }}
        title="Excluir forma de pagamento"
        description={`Tem certeza que deseja excluir "${selected?.descricao || ""}"? Esta ação não pode ser desfeita.`}
      >
        {selected && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Prazo padrão: </span>
                <span className="font-semibold font-mono">
                  {selected.prazo_dias === 0 ? "À vista" : `${selected.prazo_dias} dias`}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Gera financeiro: </span>
                <span className={`font-semibold ${selected.gera_financeiro ? "text-success" : ""}`}>
                  {selected.gera_financeiro ? "Sim" : "Não"}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Considere <strong>inativar</strong> em vez de excluir para preservar o histórico.</p>
          </div>
        )}
      </ConfirmDialog>
      {confirmDialog}
    </>
  );
}
