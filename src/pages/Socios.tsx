import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { SummaryCard } from "@/components/SummaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, UserCheck, Percent, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useSocios, useSocioParticipacoes } from "@/hooks/useSocios";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { toast } from "sonner";
import type { Socio, SocioParticipacao } from "@/types/domain";
import { formatDate, formatPercent } from "@/lib/format";
import { cpfMask } from "@/utils/masks";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/ui/scrollable-tabs";
import { SocioDrawer } from "@/components/socios/SocioDrawer";
import { useDocumentoUnico } from "@/hooks/useDocumentoUnico";
import { validateCPF } from "@/lib/validators";

interface SocioForm {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  ativo: boolean;
  data_entrada: string | null;
  data_saida: string | null;
  forma_recebimento_padrao: string;
  chave_pix: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
  observacoes: string;
}

const emptyForm: SocioForm = {
  nome: "", cpf: "", email: "", telefone: "", ativo: true,
  data_entrada: new Date().toISOString().split("T")[0], data_saida: null,
  forma_recebimento_padrao: "pix", chave_pix: "", banco: "", agencia: "", conta: "", tipo_conta: "corrente",
  observacoes: "",
};

export default function Socios() {
  const { socios, loading, create, update, remove } = useSocios();
  const { isAdmin } = useIsAdmin();
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<"all" | "ativos" | "cpf_pendente">("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSocio, setDrawerSocio] = useState<Socio | null>(null);
  const [selected, setSelected] = useState<Socio | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<SocioForm>(emptyForm);
  const [initialForm, setInitialForm] = useState<SocioForm>(emptyForm);
  const [activeTab, setActiveTab] = useState(tabFromUrl ?? "identificacao");
  const { saving, submit } = useSubmitLock();

  // Mantém aba sincronizada com URL (deep links externos como /socios?tab=participacoes).
  const handleTabChange = (next: string) => {
    setActiveTab(next);
    const sp = new URLSearchParams(searchParams);
    if (next === "identificacao") sp.delete("tab"); else sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  const { participacoes, create: createPart, remove: removePart } = useSocioParticipacoes(selected?.id);
  const [novaPart, setNovaPart] = useState({ percentual: 0, vigencia_inicio: new Date().toISOString().split("T")[0], vigencia_fim: "" });

  const { isUnique: cpfUnico } = useDocumentoUnico("cpf", form.cpf, selected?.id, "socios");

  const kpis = useMemo(() => {
    const ativos = socios.filter((s) => s.ativo);
    const somaAtual = ativos.reduce((acc, s) => acc + Number(s.percentual_participacao_atual ?? 0), 0);
    const cpfPendentes = socios.filter((s) => !s.cpf || !String(s.cpf).trim()).length;
    return { total: socios.length, ativos: ativos.length, soma: somaAtual, cpfPendentes };
  }, [socios]);

  const composicaoInfo = useMemo(() => {
    const delta = kpis.soma - 100;
    if (Math.abs(delta) < 0.01) {
      return { variant: "success" as const, subtitle: "Composição válida" };
    }
    if (delta < 0) {
      return { variant: "warning" as const, subtitle: `Faltam ${formatPercent(Math.abs(delta))}` };
    }
    return { variant: "danger" as const, subtitle: `Excede ${formatPercent(delta)}` };
  }, [kpis.soma]);

  const filteredSocios = useMemo(() => {
    let base = socios;
    if (quickFilter === "ativos") base = base.filter((s) => s.ativo);
    else if (quickFilter === "cpf_pendente") base = base.filter((s) => !s.cpf || !String(s.cpf).trim());
    const q = search.trim().toLowerCase();
    if (!q) return base;
    const qDigits = q.replace(/\D/g, "");
    return base.filter((s) => {
      const nomeMatch = s.nome?.toLowerCase().includes(q);
      const cpfDigits = (s.cpf ?? "").replace(/\D/g, "");
      const cpfMatch = qDigits.length > 0 && cpfDigits.includes(qDigits);
      return nomeMatch || cpfMatch;
    });
  }, [socios, search, quickFilter]);

  const renderCpfCell = (s: Socio) => {
    const digits = (s.cpf ?? "").replace(/\D/g, "");
    if (digits.length !== 11) {
      return <Badge variant="outline" className="text-muted-foreground font-normal">CPF pendente</Badge>;
    }
    if (isAdmin) return <span className="tabular-nums">{cpfMask(digits)}</span>;
    return <span className="tabular-nums">{`***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`}</span>;
  };

  const openCreate = () => {
    setMode("create");
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setSelected(null);
    setActiveTab("identificacao");
    setModalOpen(true);
  };

  const openEdit = (s: Socio) => {
    setMode("edit");
    setSelected(s);
    const next: SocioForm = {
      nome: s.nome,
      cpf: s.cpf ? cpfMask(s.cpf) : "",
      email: s.email ?? "",
      telefone: s.telefone ?? "",
      ativo: s.ativo,
      data_entrada: s.data_entrada, data_saida: s.data_saida,
      forma_recebimento_padrao: s.forma_recebimento_padrao ?? "pix",
      chave_pix: s.chave_pix ?? "", banco: s.banco ?? "", agencia: s.agencia ?? "",
      conta: s.conta ?? "", tipo_conta: s.tipo_conta ?? "corrente",
      observacoes: s.observacoes ?? "",
    };
    setForm(next);
    setInitialForm(next);
    setActiveTab("identificacao");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return; }
    const cpfDigits = form.cpf.replace(/\D/g, "");
    if (cpfDigits) {
      if (cpfDigits.length !== 11 || !validateCPF(cpfDigits)) {
        toast.error("CPF inválido"); return;
      }
      if (cpfUnico === false) {
        toast.error("CPF já cadastrado para outro sócio"); return;
      }
    }
    await submit(async () => {
      const payload = {
        nome: form.nome.trim(),
        cpf: cpfDigits || null,
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        ativo: form.ativo,
        data_entrada: form.data_entrada || null,
        data_saida: form.data_saida || null,
        forma_recebimento_padrao: form.forma_recebimento_padrao || null,
        chave_pix: form.chave_pix.trim() || null,
        banco: form.banco.trim() || null,
        agencia: form.agencia.trim() || null,
        conta: form.conta.trim() || null,
        tipo_conta: form.tipo_conta || null,
        observacoes: form.observacoes.trim() || null,
      };
      if (mode === "create") {
        await create.mutateAsync(payload);
      } else if (selected) {
        await update.mutateAsync({ id: selected.id, ...payload });
      }
      setModalOpen(false);
    });
  };

  const adicionarParticipacao = async () => {
    if (!selected) return;
    if (novaPart.percentual <= 0) { toast.error("Informe um percentual maior que zero"); return; }
    if (novaPart.percentual > 100) { toast.error("Percentual não pode ultrapassar 100%"); return; }
    if (!novaPart.vigencia_inicio) { toast.error("Informe a vigência inicial"); return; }
    const somaVigentes = participacoes
      .filter((p) => !p.vigencia_fim)
      .reduce((acc, p) => acc + Number(p.percentual), 0);
    const projetada = somaVigentes + novaPart.percentual;
    if (projetada > 100.0001) {
      toast.error(`A soma das participações ficará em ${formatPercent(projetada)}. Ajuste antes de salvar.`);
      return;
    }
    await createPart.mutateAsync({
      socio_id: selected.id,
      percentual: novaPart.percentual,
      vigencia_inicio: novaPart.vigencia_inicio,
      vigencia_fim: novaPart.vigencia_fim || null,
    });
    setNovaPart({ percentual: 0, vigencia_inicio: new Date().toISOString().split("T")[0], vigencia_fim: "" });
  };

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  const somaVigentes = useMemo(
    () => participacoes.filter((p) => !p.vigencia_fim).reduce((a, p) => a + Number(p.percentual), 0),
    [participacoes],
  );
  const somaProjetada = somaVigentes + (Number(novaPart.percentual) || 0);
  const composicaoStatus = (() => {
    if (Math.abs(somaVigentes - 100) < 0.01) return { label: "Composição válida", variant: "default" as const };
    if (somaVigentes < 100) return { label: "Incompleta", variant: "secondary" as const };
    return { label: "Excedida", variant: "destructive" as const };
  })();
  const formaRec = form.forma_recebimento_padrao;
  const showPix = formaRec === "pix";
  const showBanco = formaRec === "ted";

  const columns = [
    { key: "nome", label: "Nome", mobilePrimary: true },
    { key: "cpf", label: "CPF", render: renderCpfCell },
    { key: "percentual_participacao_atual", label: "Participação atual", render: (s: Socio) => formatPercent(Number(s.percentual_participacao_atual ?? 0)) },
    { key: "ativo", label: "Status", render: (s: Socio) => <StatusBadge status={s.ativo ? "ativo" : "inativo"} /> },
    { key: "data_entrada", label: "Entrada societária", render: (s: Socio) => s.data_entrada ? formatDate(s.data_entrada) : "—" },
    { key: "email", label: "E-mail", hidden: true, render: (s: Socio) => s.email || "—" },
    { key: "telefone", label: "Telefone", hidden: true, render: (s: Socio) => s.telefone || "—" },
    {
      key: "_mobile_part",
      label: "Participação",
      hidden: true,
      mobileCard: true,
      render: (s: Socio) => {
        const pct = formatPercent(Number(s.percentual_participacao_atual ?? 0));
        return s.data_entrada ? `${pct} · desde ${formatDate(s.data_entrada)}` : `${pct} · entrada não informada`;
      },
    },
  ];

  return (
    <>
      <ModulePage
        title="Sócios"
        subtitle="Cadastro societário e histórico de participações"
        addLabel="Novo Sócio"
        onAdd={openCreate}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nome ou CPF..."
        summaryCards={
          <>
            <SummaryCard
              title="Total de Sócios"
              shortTitle="Sócios"
              value={String(kpis.total)}
              icon={Briefcase}
              onClick={() => setQuickFilter("all")}
              active={quickFilter === "all"}
              aria-label="Mostrar todos os sócios"
            />
            <SummaryCard
              title="Ativos"
              shortTitle="Ativos"
              value={String(kpis.ativos)}
              icon={UserCheck}
              variant="success"
              onClick={() => setQuickFilter((q) => (q === "ativos" ? "all" : "ativos"))}
              active={quickFilter === "ativos"}
              aria-label="Filtrar sócios ativos"
            />
            <SummaryCard
              title="Soma de participações"
              shortTitle="Participação"
              value={formatPercent(kpis.soma)}
              subtitle={composicaoInfo.subtitle}
              icon={Percent}
              variant={composicaoInfo.variant}
            />
            {kpis.cpfPendentes > 0 && (
              <SummaryCard
                title="CPF pendente"
                shortTitle="CPF pend."
                value={String(kpis.cpfPendentes)}
                icon={AlertTriangle}
                variant="warning"
                onClick={() => setQuickFilter((q) => (q === "cpf_pendente" ? "all" : "cpf_pendente"))}
                active={quickFilter === "cpf_pendente"}
                aria-label="Filtrar sócios com CPF pendente"
              />
            )}
          </>
        }
      >
        <DataTable
          columns={columns}
          data={filteredSocios}
          loading={loading}
          moduleKey="socios"
          showColumnToggle
          onEdit={openEdit}
          onDelete={(s) => remove.mutate(s.id)}
          deleteBehavior="hard"
          onView={(s) => {
            setDrawerSocio(s);
            setDrawerOpen(true);
          }}
          mobileIdentifierKey="cpf"
          mobileStatusKey="ativo"
        />
      </ModulePage>

      <SocioDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        socio={drawerSocio}
        onEdit={(s) => {
          setDrawerOpen(false);
          openEdit(s);
        }}
      />

      <FormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={mode === "create" ? "Novo Sócio" : "Editar Sócio"}
        size="lg"
        mode={mode}
        identifier={mode === "edit" && selected?.cpf ? selected.cpf : undefined}
        status={mode === "edit" && selected ? <StatusBadge status={selected.ativo ? "ativo" : "inativo"} /> : undefined}
        footer={
          <FormModalFooter
            saving={saving}
            isDirty={isDirty}
            onCancel={() => setModalOpen(false)}
            submitAsForm
            formId="socio-form"
            mode={mode}
            disabledHint={!isDirty ? "Faça uma alteração para habilitar." : undefined}
          />
        }
      >
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <ScrollableTabsList
            containerClassName="sticky top-0 z-10 bg-background"
            className={mode === "edit" ? "grid w-full grid-cols-2" : "grid w-full grid-cols-1"}
          >
            <TabsTrigger value="identificacao">Cadastro</TabsTrigger>
            {mode === "edit" && <TabsTrigger value="participacoes">Participações</TabsTrigger>}
          </ScrollableTabsList>

          <TabsContent value="identificacao">
            <form
              id="socio-form"
              onSubmit={handleSubmit}
              className="space-y-6 outline-none focus:outline-none focus-visible:ring-0 focus-visible:outline-none"
            >
              <section className="space-y-3">
                <header className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação</span>
                  <div className="flex-1 h-px bg-border" />
                </header>
                <div className="space-y-1.5">
                  <Label htmlFor="soc-nome">Nome completo *</Label>
                  <Input id="soc-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-cpf">CPF</Label>
                    <MaskedInput id="soc-cpf" mask="cpf" showValidation value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} placeholder="000.000.000-00" />
                    {cpfUnico === false && (
                      <p className="text-[10px] text-destructive">CPF já cadastrado para outro sócio</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-status">Status do sócio</Label>
                    <Select value={form.ativo ? "ativo" : "inativo"} onValueChange={(v) => setForm({ ...form, ativo: v === "ativo" })}>
                      <SelectTrigger id="soc-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-email">E-mail</Label>
                    <Input id="soc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-tel">Telefone</Label>
                    <Input id="soc-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-entrada">Data de entrada</Label>
                    <Input id="soc-entrada" type="date" value={form.data_entrada ?? ""} onChange={(e) => setForm({ ...form, data_entrada: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-saida">Data de saída</Label>
                    <Input id="soc-saida" type="date" value={form.data_saida ?? ""} onChange={(e) => setForm({ ...form, data_saida: e.target.value || null })} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <header className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recebimento</span>
                  <div className="flex-1 h-px bg-border" />
                </header>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Forma padrão de recebimento</Label>
                    <Select value={form.forma_recebimento_padrao} onValueChange={(v) => setForm({ ...form, forma_recebimento_padrao: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">Pix</SelectItem>
                        <SelectItem value="ted">TED</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {showPix && (
                    <div className="space-y-1.5">
                      <Label>Chave Pix</Label>
                      <Input value={form.chave_pix} onChange={(e) => setForm({ ...form, chave_pix: e.target.value })} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                    </div>
                  )}
                </div>
                {showBanco && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label>Banco</Label>
                      <Input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Agência</Label>
                      <Input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Conta</Label>
                      <Input value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo de conta</Label>
                      <Select value={form.tipo_conta} onValueChange={(v) => setForm({ ...form, tipo_conta: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="corrente">Corrente</SelectItem>
                          <SelectItem value="poupanca">Poupança</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {(formaRec === "dinheiro" || formaRec === "outro") && (
                  <p className="text-xs text-muted-foreground">
                    Sem dados bancários necessários. Use o campo Observações para registrar instruções específicas.
                  </p>
                )}
              </section>

              <section className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} />
                <p className="text-[11px] text-muted-foreground text-right">{form.observacoes.length}/500</p>
              </section>
            </form>
          </TabsContent>

          {mode === "edit" && (
            <TabsContent value="participacoes" className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Participação atual</div>
                  <div className="font-mono text-base">
                    {formatPercent(Number(selected?.percentual_participacao_atual ?? 0))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total do quadro societário</div>
                  <div className="font-mono text-base">{formatPercent(somaVigentes)} <span className="text-muted-foreground text-xs">/ 100,00%</span></div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <Badge variant={composicaoStatus.variant}>{composicaoStatus.label}</Badge>
                </div>
              </div>
              {composicaoStatus.label === "Incompleta" && (
                <p className="text-xs text-muted-foreground -mt-2">
                  A soma vigente de todos os sócios ainda não totaliza 100,00%.
                </p>
              )}
              {composicaoStatus.label === "Excedida" && (
                <p className="text-xs text-destructive -mt-2">
                  A soma vigente ultrapassa 100,00%. Ajuste os períodos.
                </p>
              )}
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium text-sm">Adicionar período de participação</h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:items-end">
                  <div className="space-y-1.5">
                    <Label>Percentual (%)</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={novaPart.percentual} onChange={(e) => setNovaPart({ ...novaPart, percentual: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vigência início</Label>
                    <Input type="date" value={novaPart.vigencia_inicio} onChange={(e) => setNovaPart({ ...novaPart, vigencia_inicio: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label title="Deixe em branco para manter o período em aberto. Períodos não podem se sobrepor.">Vigência fim (opcional)</Label>
                    <Input type="date" value={novaPart.vigencia_fim} onChange={(e) => setNovaPart({ ...novaPart, vigencia_fim: e.target.value })} />
                  </div>
                  <Button type="button" onClick={adicionarParticipacao} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
                </div>
                {somaProjetada > 100.0001 && (
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                    A soma das participações ficará em {formatPercent(somaProjetada)}. Ajuste antes de salvar.
                  </p>
                )}
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                  Períodos não podem se sobrepor para o mesmo sócio.
                </p>
              </div>

              <div className="rounded-lg border hidden sm:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Percentual</th>
                      <th className="text-left p-3 font-medium">Início</th>
                      <th className="text-left p-3 font-medium">Situação</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participacoes.length === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nenhum histórico</td></tr>
                    )}
                    {participacoes.map((p: SocioParticipacao) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="p-3 font-mono">{formatPercent(Number(p.percentual))}</td>
                        <td className="p-3">{formatDate(p.vigencia_inicio)}</td>
                        <td className="p-3">
                          {p.vigencia_fim ? (
                            <span className="text-muted-foreground">Encerrada em {formatDate(p.vigencia_fim)}</span>
                          ) : (
                            <Badge>Vigente</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button size="icon" variant="ghost" onClick={() => removePart.mutate(p.id)} aria-label="Remover participação">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 sm:hidden">
                {participacoes.length === 0 && (
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum histórico</div>
                )}
                {participacoes.map((p: SocioParticipacao) => (
                  <div key={p.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-base">{formatPercent(Number(p.percentual))}</span>
                      {p.vigencia_fim ? (
                        <span className="text-xs text-muted-foreground">Encerrada em {formatDate(p.vigencia_fim)}</span>
                      ) : (
                        <Badge>Vigente</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">Início: {formatDate(p.vigencia_inicio)}</div>
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" onClick={() => removePart.mutate(p.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-1" />Excluir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </FormModal>
    </>
  );
}