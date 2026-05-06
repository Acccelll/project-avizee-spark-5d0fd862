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
import { formatDate } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SocioDrawer } from "@/components/socios/SocioDrawer";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSocio, setDrawerSocio] = useState<Socio | null>(null);
  const [selected, setSelected] = useState<Socio | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<SocioForm>(emptyForm);
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

  const kpis = useMemo(() => {
    const ativos = socios.filter((s) => s.ativo);
    const somaAtual = ativos.reduce((acc, s) => acc + Number(s.percentual_participacao_atual ?? 0), 0);
    return { total: socios.length, ativos: ativos.length, soma: somaAtual };
  }, [socios]);

  const openCreate = () => {
    setMode("create");
    setForm(emptyForm);
    setSelected(null);
    setActiveTab("identificacao");
    setModalOpen(true);
  };

  const openEdit = (s: Socio) => {
    setMode("edit");
    setSelected(s);
    setForm({
      nome: s.nome, cpf: s.cpf ?? "", email: s.email ?? "", telefone: s.telefone ?? "",
      ativo: s.ativo,
      data_entrada: s.data_entrada, data_saida: s.data_saida,
      forma_recebimento_padrao: s.forma_recebimento_padrao ?? "pix",
      chave_pix: s.chave_pix ?? "", banco: s.banco ?? "", agencia: s.agencia ?? "",
      conta: s.conta ?? "", tipo_conta: s.tipo_conta ?? "corrente",
      observacoes: s.observacoes ?? "",
    });
    setActiveTab("identificacao");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return; }
    await submit(async () => {
      const payload = {
        nome: form.nome.trim(),
        cpf: form.cpf.trim() || null,
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
    if (!novaPart.vigencia_inicio) { toast.error("Informe a vigência inicial"); return; }
    await createPart.mutateAsync({
      socio_id: selected.id,
      percentual: novaPart.percentual,
      vigencia_inicio: novaPart.vigencia_inicio,
      vigencia_fim: novaPart.vigencia_fim || null,
    });
    setNovaPart({ percentual: 0, vigencia_inicio: new Date().toISOString().split("T")[0], vigencia_fim: "" });
  };

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "cpf", label: "CPF", render: (s: Socio) => s.cpf || "—" },
    { key: "percentual_participacao_atual", label: "Participação atual", render: (s: Socio) => `${Number(s.percentual_participacao_atual ?? 0).toFixed(2)}%` },
    { key: "ativo", label: "Status", render: (s: Socio) => <StatusBadge status={s.ativo ? "ativo" : "inativo"} /> },
    { key: "data_entrada", label: "Entrada", render: (s: Socio) => s.data_entrada ? formatDate(s.data_entrada) : "—" },
    { key: "email", label: "E-mail", hidden: true, render: (s: Socio) => s.email || "—" },
    { key: "telefone", label: "Telefone", hidden: true, render: (s: Socio) => s.telefone || "—" },
  ];

  return (
    <>
      <ModulePage
        title="Sócios"
        subtitle="Cadastro societário e histórico de participações"
        addLabel="Novo Sócio"
        onAdd={openCreate}
        summaryCards={
          <>
            <SummaryCard title="Total de Sócios" value={String(kpis.total)} icon={Briefcase} />
            <SummaryCard title="Ativos" value={String(kpis.ativos)} icon={UserCheck} variant="success" />
            <SummaryCard
              title="Soma de participações"
              value={`${kpis.soma.toFixed(2)}%`}
              icon={Percent}
              variant={Math.abs(kpis.soma - 100) > 0.01 ? "warning" : "success"}
            />
          </>
        }
      >
        <DataTable
          columns={columns}
          data={socios}
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
            onCancel={() => setModalOpen(false)}
            submitAsForm
            formId="socio-form"
            mode={mode}
          />
        }
      >
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className={mode === "edit" ? "grid w-full grid-cols-2" : "grid w-full grid-cols-1"}>
            <TabsTrigger value="identificacao">Cadastro</TabsTrigger>
            {mode === "edit" && <TabsTrigger value="participacoes">Participações</TabsTrigger>}
          </TabsList>

          <TabsContent value="identificacao">
            <form id="socio-form" onSubmit={handleSubmit} className="space-y-6">
              <section className="space-y-3">
                <header className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação</span>
                  <div className="flex-1 h-px bg-border" />
                </header>
                <div className="space-y-1.5">
                  <Label htmlFor="soc-nome">Nome completo *</Label>
                  <Input id="soc-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-cpf">CPF</Label>
                    <MaskedInput id="soc-cpf" mask="cpf" showValidation value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} placeholder="000.000.000-00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-status">Status</Label>
                    <Select value={form.ativo ? "ativo" : "inativo"} onValueChange={(v) => setForm({ ...form, ativo: v === "ativo" })}>
                      <SelectTrigger id="soc-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-email">E-mail</Label>
                    <Input id="soc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="soc-tel">Telefone</Label>
                    <Input id="soc-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Forma padrão</Label>
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
                  <div className="space-y-1.5">
                    <Label>Chave Pix</Label>
                    <Input value={form.chave_pix} onChange={(e) => setForm({ ...form, chave_pix: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
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
                    <Label>Tipo</Label>
                    <Select value={form.tipo_conta} onValueChange={(v) => setForm({ ...form, tipo_conta: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="corrente">Corrente</SelectItem>
                        <SelectItem value="poupanca">Poupança</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} />
              </section>
            </form>
          </TabsContent>

          {mode === "edit" && (
            <TabsContent value="participacoes" className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium text-sm">Adicionar período de participação</h4>
                <div className="grid grid-cols-4 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>Percentual (%)</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={novaPart.percentual} onChange={(e) => setNovaPart({ ...novaPart, percentual: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vigência início</Label>
                    <Input type="date" value={novaPart.vigencia_inicio} onChange={(e) => setNovaPart({ ...novaPart, vigencia_inicio: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vigência fim (opcional)</Label>
                    <Input type="date" value={novaPart.vigencia_fim} onChange={(e) => setNovaPart({ ...novaPart, vigencia_fim: e.target.value })} />
                  </div>
                  <Button type="button" onClick={adicionarParticipacao}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                  Períodos não podem se sobrepor para o mesmo sócio.
                </p>
              </div>

              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Percentual</th>
                      <th className="text-left p-3 font-medium">Início</th>
                      <th className="text-left p-3 font-medium">Fim</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participacoes.length === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nenhum histórico</td></tr>
                    )}
                    {participacoes.map((p: SocioParticipacao) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="p-3 font-mono">{Number(p.percentual).toFixed(2)}%</td>
                        <td className="p-3">{formatDate(p.vigencia_inicio)}</td>
                        <td className="p-3">{p.vigencia_fim ? formatDate(p.vigencia_fim) : "—"}</td>
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
            </TabsContent>
          )}
        </Tabs>
      </FormModal>
    </>
  );
}