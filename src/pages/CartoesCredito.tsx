import { useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import { SummaryCard } from "@/components/SummaryCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { notifyError } from "@/utils/errorMessages";
import {
  listCartoes,
  createCartao,
  updateCartao,
  inativarCartao,
  getCartaoInUseCounts,
  type CartaoCredito,
} from "@/services/cartoesCredito.service";
import { listBancosAtivos } from "@/services/contasBancarias.service";
import type { Tables } from "@/integrations/supabase/types";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { CreditCard, CheckCircle, Ban, Wallet } from "lucide-react";

type Banco = Tables<"bancos">;

interface CartaoForm {
  nome: string;
  banco_id: string;
  bandeira: string;
  ultimos4: string;
  limite: number;
  dia_fechamento: number;
  dia_vencimento: number;
  observacoes: string;
  ativo: boolean;
}

const emptyForm: CartaoForm = {
  nome: "",
  banco_id: "",
  bandeira: "",
  ultimos4: "",
  limite: 0,
  dia_fechamento: 1,
  dia_vencimento: 10,
  observacoes: "",
  ativo: true,
};

const BANDEIRAS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Outras"];

export default function CartoesCredito() {
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [selected, setSelected] = useState<CartaoCredito | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { saving, submit } = useSubmitLock();
  const { form, updateForm, reset, isDirty, markPristine } = useEditDirtyForm<CartaoForm>(emptyForm);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([listCartoes(), listBancosAtivos()]);
      setCartoes(c);
      setBancos(b);
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const ativos = useMemo(() => cartoes.filter((c) => c.ativo), [cartoes]);
  const inativos = cartoes.length - ativos.length;
  const limiteTotal = useMemo(
    () => ativos.reduce((s, c) => s + Number(c.limite || 0), 0),
    [ativos],
  );

  const filteredData = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return cartoes;
    return cartoes.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        (c.bancos?.nome || "").toLowerCase().includes(q) ||
        (c.bandeira || "").toLowerCase().includes(q) ||
        (c.ultimos4 || "").includes(q),
    );
  }, [cartoes, searchTerm]);

  const closeModal = async () => {
    if (isDirty && !(await confirm())) return;
    setModalOpen(false);
  };

  const openCreate = () => {
    setMode("create");
    setSelected(null);
    reset({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (c: CartaoCredito) => {
    setMode("edit");
    setSelected(c);
    reset({
      nome: c.nome,
      banco_id: c.banco_id || "",
      bandeira: c.bandeira || "",
      ultimos4: c.ultimos4 || "",
      limite: Number(c.limite || 0),
      dia_fechamento: c.dia_fechamento,
      dia_vencimento: c.dia_vencimento,
      observacoes: c.observacoes || "",
      ativo: c.ativo,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (form.dia_fechamento < 1 || form.dia_fechamento > 31) {
      toast.error("Dia de fechamento deve estar entre 1 e 31");
      return;
    }
    if (form.dia_vencimento < 1 || form.dia_vencimento > 31) {
      toast.error("Dia de vencimento deve estar entre 1 e 31");
      return;
    }
    if (form.ultimos4 && !/^\d{4}$/.test(form.ultimos4)) {
      toast.error("Últimos 4 dígitos deve ser exatamente 4 números");
      return;
    }

    await submit(async () => {
      try {
        const payload = {
          nome: form.nome.trim(),
          banco_id: form.banco_id || null,
          bandeira: form.bandeira || null,
          ultimos4: form.ultimos4 || null,
          limite: form.limite || null,
          dia_fechamento: form.dia_fechamento,
          dia_vencimento: form.dia_vencimento,
          observacoes: form.observacoes || null,
          ativo: form.ativo,
        };
        if (mode === "create") {
          await createCartao(payload);
          toast.success("Cartão criado");
        } else if (selected) {
          await updateCartao(selected.id, payload);
          toast.success("Cartão atualizado");
        }
        markPristine();
        setModalOpen(false);
        fetchData();
      } catch (err) {
        notifyError(err);
      }
    });
  };

  const handleDelete = async (c: CartaoCredito) => {
    try {
      const counts = await getCartaoInUseCounts(c.id);
      if (counts.lancamentos > 0 || counts.faturas > 0) {
        const ok = await confirm();
        if (!ok) return;
      }
      await inativarCartao(c.id);
      toast.success("Cartão inativado");
      fetchData();
    } catch (e) {
      notifyError(e);
    }
  };

  const columns = [
    {
      key: "nome",
      label: "Cartão",
      sortable: true,
      render: (c: CartaoCredito) => (
        <div className="flex items-center gap-2">
          <CreditCard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div>
            <p className="font-medium leading-tight">{c.nome}</p>
            <p className="text-xs text-muted-foreground">
              {c.bandeira || "—"}
              {c.ultimos4 ? ` • •••• ${c.ultimos4}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "banco",
      label: "Banco",
      render: (c: CartaoCredito) => (
        <span className="text-sm">{c.bancos?.nome || "—"}</span>
      ),
    },
    {
      key: "ciclo",
      label: "Fechamento / Vencimento",
      render: (c: CartaoCredito) => (
        <span className="font-mono text-xs">
          dia {c.dia_fechamento} / dia {c.dia_vencimento}
        </span>
      ),
    },
    {
      key: "limite",
      label: "Limite",
      sortable: true,
      render: (c: CartaoCredito) => (
        <span className="font-mono text-sm">{formatCurrency(Number(c.limite || 0))}</span>
      ),
    },
    {
      key: "ativo",
      label: "Status",
      render: (c: CartaoCredito) => (
        <StatusBadge status={c.ativo ? "ativo" : "inativo"} />
      ),
    },
  ];

  return (
    <>
      <ModulePage
        title="Cartões de Crédito"
        subtitle="Cadastro de cartões com ciclo de fechamento e vencimento para gerar faturas automáticas"
        addLabel="Novo Cartão"
        onAdd={openCreate}
        summaryCards={
          <>
            <SummaryCard title="Total" value={String(cartoes.length)} icon={CreditCard} />
            <SummaryCard title="Ativos" value={String(ativos.length)} icon={CheckCircle} variant="success" />
            <SummaryCard title="Inativos" value={String(inativos)} icon={Ban} />
            <SummaryCard
              title="Limite Total"
              value={formatCurrency(limiteTotal)}
              icon={Wallet}
              variant="success"
            />
          </>
        }
      >
        <AdvancedFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome, banco, bandeira ou últimos 4..."
          activeFilters={[]}
          onRemoveFilter={() => {}}
          onClearAll={() => setSearchTerm("")}
          count={filteredData.length}
        />

        <DataTable
          columns={columns}
          data={filteredData}
          loading={loading}
          moduleKey="cartoes-credito"
          showColumnToggle
          onEdit={openEdit}
          onDelete={handleDelete}
          mobileIdentifierKey="nome"
          mobileStatusKey="ativo"
          emptyTitle="Nenhum cartão cadastrado"
          emptyDescription="Cadastre um cartão para gerar faturas e amarrar lançamentos."
        />
      </ModulePage>

      <FormModal
        open={modalOpen}
        onClose={closeModal}
        title={mode === "create" ? "Novo Cartão de Crédito" : "Editar Cartão"}
        size="md"
        mode={mode}
        isDirty={isDirty}
        footer={
          <FormModalFooter
            saving={saving}
            isDirty={isDirty}
            onCancel={closeModal}
            submitAsForm
            formId="cartao-form"
            mode={mode}
          />
        }
      >
        <form id="cartao-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => updateForm({ nome: e.target.value })}
                placeholder="Ex: Nubank Empresarial"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Banco emissor</Label>
              <Select value={form.banco_id} onValueChange={(v) => updateForm({ banco_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {bancos.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bandeira</Label>
              <Select value={form.bandeira} onValueChange={(v) => updateForm({ bandeira: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {BANDEIRAS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Últimos 4 dígitos</Label>
              <Input
                value={form.ultimos4}
                onChange={(e) => updateForm({ ultimos4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                placeholder="0000"
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Limite</Label>
              <Input
                type="number"
                step="0.01"
                value={form.limite}
                onChange={(e) => updateForm({ limite: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Dia de fechamento *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.dia_fechamento}
                onChange={(e) => updateForm({ dia_fechamento: Number(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Dia de vencimento *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.dia_vencimento}
                onChange={(e) => updateForm({ dia_vencimento: Number(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => updateForm({ observacoes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          {mode === "edit" && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="cartao-ativo" className="text-sm font-medium cursor-pointer">
                  Cartão ativo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Cartões inativos não aparecem na seleção de lançamentos
                </p>
              </div>
              <Switch
                id="cartao-ativo"
                checked={form.ativo}
                onCheckedChange={(v) => updateForm({ ativo: v })}
              />
            </div>
          )}
        </form>
      </FormModal>
      {confirmDialog}
    </>
  );
}