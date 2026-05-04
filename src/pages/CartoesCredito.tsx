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
  gerarFaturaCartao,
  listFaturasPorCartao,
  baixarFaturaCartao,
  type CartaoFatura,
  type CartaoCredito,
} from "@/services/cartoesCredito.service";
import { listBancosAtivos, listContasBancarias, type ContaBancaria } from "@/services/contasBancarias.service";
import type { Tables } from "@/integrations/supabase/types";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { CreditCard, CheckCircle, Ban, Wallet, FileText, Receipt } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PermanentDeleteDialog } from "@/components/PermanentDeleteDialog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Trash2 } from "lucide-react";

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
  const [faturaOpen, setFaturaOpen] = useState(false);
  const [faturaCartao, setFaturaCartao] = useState<CartaoCredito | null>(null);
  const [faturaCompetencia, setFaturaCompetencia] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [faturaSaving, setFaturaSaving] = useState(false);
  const [faturasListOpen, setFaturasListOpen] = useState(false);
  const [faturasListCartao, setFaturasListCartao] = useState<CartaoCredito | null>(null);
  const [faturasList, setFaturasList] = useState<CartaoFatura[]>([]);
  const [faturasLoading, setFaturasLoading] = useState(false);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [baixaFatura, setBaixaFatura] = useState<CartaoFatura | null>(null);
  const [baixaContaId, setBaixaContaId] = useState("");
  const [baixaData, setBaixaData] = useState(() => new Date().toISOString().split("T")[0]);
  const [baixaSaving, setBaixaSaving] = useState(false);
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

  const openFatura = (c: CartaoCredito) => {
    setFaturaCartao(c);
    setFaturaOpen(true);
  };

  const handleGerarFatura = async () => {
    if (!faturaCartao) return;
    setFaturaSaving(true);
    try {
      const res = await gerarFaturaCartao(faturaCartao.id, faturaCompetencia);
      if (!res.ok) {
        toast.error(res.erro || "Falha ao gerar fatura");
      } else {
        toast.success(
          `Fatura ${faturaCompetencia} gerada — total ${formatCurrency(res.valor_total || 0)}`,
        );
        setFaturaOpen(false);
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setFaturaSaving(false);
    }
  };

  const openFaturasList = async (c: CartaoCredito) => {
    setFaturasListCartao(c);
    setFaturasListOpen(true);
    setFaturasLoading(true);
    try {
      const [fs, cbs] = await Promise.all([
        listFaturasPorCartao(c.id),
        contasBancarias.length ? Promise.resolve(contasBancarias) : listContasBancarias(),
      ]);
      setFaturasList(fs);
      if (!contasBancarias.length) setContasBancarias(cbs);
    } catch (e) {
      notifyError(e);
    } finally {
      setFaturasLoading(false);
    }
  };

  const handleBaixarFatura = async () => {
    if (!baixaFatura || !baixaContaId || !baixaData) {
      toast.error("Selecione conta bancária e data");
      return;
    }
    setBaixaSaving(true);
    try {
      const res = await baixarFaturaCartao(baixaFatura.id, baixaContaId, baixaData);
      toast.success(`${res.length} lançamento(s) baixado(s)`);
      setBaixaFatura(null);
      setBaixaContaId("");
      if (faturasListCartao) {
        const fs = await listFaturasPorCartao(faturasListCartao.id);
        setFaturasList(fs);
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setBaixaSaving(false);
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
          rowExtraActions={(c: CartaoCredito) =>
            c.ativo ? (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFaturasList(c);
                  }}
                >
                  <Receipt className="w-3.5 h-3.5 mr-1" /> Faturas
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFatura(c);
                  }}
                >
                  <FileText className="w-3.5 h-3.5 mr-1" /> Gerar fatura
                </Button>
              </div>
            ) : null
          }
          mobileIdentifierKey="nome"
          mobileStatusKey="ativo"
          emptyTitle="Nenhum cartão cadastrado"
          emptyDescription="Cadastre um cartão para gerar faturas e amarrar lançamentos."
        />
      </ModulePage>

      <Dialog open={faturaOpen} onOpenChange={(o) => !o && setFaturaOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gerar fatura — {faturaCartao?.nome}</DialogTitle>
            <DialogDescription>
              Agrega lançamentos do cartão na competência e cria um título consolidado no Financeiro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Competência (YYYY-MM)</Label>
              <Input
                type="month"
                value={faturaCompetencia}
                onChange={(e) => setFaturaCompetencia(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A operação é idempotente — pode ser repetida; o título será atualizado se ainda estiver em aberto.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFaturaOpen(false)}>Cancelar</Button>
            <Button onClick={handleGerarFatura} disabled={faturaSaving}>
              {faturaSaving ? "Gerando..." : "Gerar fatura"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={faturasListOpen} onOpenChange={(o) => !o && setFaturasListOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Faturas — {faturasListCartao?.nome}</DialogTitle>
            <DialogDescription>
              Ciclo: dia {faturasListCartao?.dia_fechamento} (fechamento) / dia {faturasListCartao?.dia_vencimento} (vencimento).
            </DialogDescription>
          </DialogHeader>
          {faturasLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : faturasList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma fatura encontrada.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto divide-y border rounded-md">
              {faturasList.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{f.competencia}</p>
                    <p className="text-xs text-muted-foreground">
                      Vence {new Date(f.data_vencimento).toLocaleDateString("pt-BR")} • {formatCurrency(Number(f.valor_total || 0))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={f.status} />
                    {f.status !== "paga" && Number(f.valor_total || 0) > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setBaixaFatura(f);
                          setBaixaData(new Date().toISOString().split("T")[0]);
                        }}
                      >
                        Baixar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!baixaFatura} onOpenChange={(o) => !o && setBaixaFatura(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Baixar fatura {baixaFatura?.competencia}</DialogTitle>
            <DialogDescription>
              Quita em lote todos os lançamentos da fatura, debitando da conta bancária escolhida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Conta bancária *</Label>
              <Select value={baixaContaId} onValueChange={setBaixaContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {contasBancarias.filter((c) => c.ativo).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.bancos?.nome} — {c.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data da baixa *</Label>
              <Input type="date" value={baixaData} onChange={(e) => setBaixaData(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Total previsto: <strong>{formatCurrency(Number(baixaFatura?.valor_total || 0))}</strong>
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBaixaFatura(null)}>Cancelar</Button>
            <Button onClick={handleBaixarFatura} disabled={baixaSaving || !baixaContaId}>
              {baixaSaving ? "Processando..." : "Confirmar baixa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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