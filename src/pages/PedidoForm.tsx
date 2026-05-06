import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageShell } from "@/components/PageShell";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { getPedidoStatusLabel, validarTransicaoPedido } from "@/lib/comercialWorkflow";
import { useSalvarPedido } from "@/pages/comercial/hooks/useSalvarPedido";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";

/**
 * Status operacionais editáveis manualmente. Estados terminais alcançados via
 * RPC (`faturada`, `faturada_parcial`, `cancelada`) NÃO entram aqui — devem
 * ser disparados pelas ações Gerar NF / Cancelar Pedido.
 */
const STATUS_ORDER = ["pendente", "aprovada", "em_separacao", "separado", "em_transporte", "entregue"] as const;

const statusOptions = [
  { value: "pendente", label: "Pendente" },
  { value: "aprovada", label: "Aprovado" },
  { value: "em_separacao", label: "Em Separação" },
  { value: "separado", label: "Separado" },
  { value: "em_transporte", label: "Em Transporte" },
  { value: "entregue", label: "Entregue" },
];

interface PedidoEditForm {
  status: string;
  po_number: string;
  data_po_cliente: string;
  data_prometida_despacho: string;
  prazo_despacho_dias: string;
  observacoes: string;
}

interface PedidoRecord {
  id: string;
  numero: string;
  status: string | null;
  status_faturamento: string | null;
  data_emissao: string | null;
  po_number: string | null;
  data_po_cliente: string | null;
  data_prometida_despacho: string | null;
  prazo_despacho_dias: number | null;
  observacoes: string | null;
  valor_total: number | null;
  clientes?: { nome_razao_social: string } | null;
  orcamentos?: { numero: string } | null;
}

const PedidoForm = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [pedido, setPedido] = useState<PedidoRecord | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  const salvarPedido = useSalvarPedido();
  const saving = salvarPedido.isPending;
  const { form, updateForm, reset, markPristine, isDirty } = useEditDirtyForm<PedidoEditForm>({
    status: "",
    po_number: "",
    data_po_cliente: "",
    data_prometida_despacho: "",
    prazo_despacho_dias: "",
    observacoes: "",
  });

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("ordens_venda")
          .select("id, numero, status, status_faturamento, data_emissao, po_number, data_po_cliente, data_prometida_despacho, prazo_despacho_dias, observacoes, valor_total, clientes(nome_razao_social), orcamentos(numero)")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          toast.error("Pedido não encontrado.");
          navigate("/pedidos");
          return;
        }
        const typed = data as unknown as PedidoRecord;
        setPedido(typed);
        reset({
          status: typed.status || "pendente",
          po_number: typed.po_number || "",
          data_po_cliente: typed.data_po_cliente || "",
          data_prometida_despacho: typed.data_prometida_despacho || "",
          prazo_despacho_dias: typed.prazo_despacho_dias != null ? String(typed.prazo_despacho_dias) : "",
          observacoes: typed.observacoes || "",
        });
      } catch (err: unknown) {
        notifyError(err);
        navigate("/pedidos");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate, reset]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const handleSave = async () => {
    if (!id) return;
    if (form.status && !validarTransicaoPedido(form.status, pedido?.status_faturamento ?? null)) {
      toast.error("Transição de status inválida para o faturamento atual do pedido.");
      return;
    }
    try {
      await salvarPedido.mutateAsync({
        id,
        patch: {
          status: form.status || null,
          po_number: form.po_number || null,
          data_po_cliente: form.data_po_cliente || null,
          data_prometida_despacho: form.data_prometida_despacho || null,
          prazo_despacho_dias: form.prazo_despacho_dias ? Number(form.prazo_despacho_dias) : null,
          observacoes: form.observacoes || null,
        },
      });
      markPristine();
      navigate("/pedidos");
    } catch {
      // erro já reportado via toast no hook
    }
  };

  const set = (field: keyof PedidoEditForm, value: string) =>
    updateForm({ [field]: value } as Partial<PedidoEditForm>);

  const handleCancel = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "Você possui alterações não salvas no pedido.",
        confirmLabel: "Descartar alterações",
        confirmVariant: "destructive",
      });
      if (!ok) return;
    }
    navigate("/pedidos");
  };

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Carregando pedido...</div>;
  }

  if (!pedido) return null;

  return (
    <PageShell
      backTo={handleCancel}
      title={`Editando Pedido — ${pedido.numero}`}
      subtitle={
        <>
          {pedido.clientes?.nome_razao_social || "—"}
          {pedido.orcamentos?.numero ? ` · Orçamento ${pedido.orcamentos.numero}` : ""}
        </>
      }
      actions={
        <>
          <StatusBadge status={pedido.status || "pendente"} label={getPedidoStatusLabel(pedido.status)} />
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </>
      }
      meta={
        <div className="flex items-center flex-wrap gap-x-6 gap-y-2 rounded-xl border bg-card/60 px-5 py-3 text-sm shadow-soft">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Pedido</span>
            <span className="font-mono font-bold text-primary">{pedido.numero}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Emissão</span>
            <span className="font-medium">{formatDate(pedido.data_emissao)}</span>
          </div>
          {pedido.valor_total != null && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Total</span>
              <span className="font-mono font-bold text-primary">
                {Number(pedido.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          )}
        </div>
      }
    >
      <div className="max-w-3xl space-y-5">
        {/* MB-04: mini-resumo sticky no topo (mobile) — total + status sempre visíveis ao rolar. */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b md:hidden flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Pedido {pedido.numero}</p>
            <p className="font-mono font-bold text-primary text-sm truncate">
              {formatCurrency(Number(pedido.valor_total || 0))}
            </p>
          </div>
          <StatusBadge status={pedido.status || "pendente"} label={getPedidoStatusLabel(pedido.status)} />
        </div>

        <div className="rounded-xl border bg-muted/20 px-4 py-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Escopo desta edição</p>
          <p className="text-sm text-muted-foreground mt-1">
            Esta tela altera apenas dados operacionais do pedido. Itens, valores e vínculos (orçamento e faturamento) são controlados pelo fluxo comercial/fiscal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Pedido</p>
            <p className="font-mono font-semibold text-primary">{pedido.numero}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Cliente</p>
            <p className="text-sm truncate">{pedido.clientes?.nome_razao_social || "—"}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Orçamento origem</p>
            <p className="font-mono text-sm">{pedido.orcamentos?.numero || "—"}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Valor total</p>
            <p className="font-mono font-semibold">{formatCurrency(Number(pedido.valor_total || 0))}</p>
          </div>
        </div>

        {/* Status + Datas */}
        <div className="bg-card rounded-xl border shadow-soft p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Status Operacional</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* M-05: só mostra status atingíveis a partir do status atual
                      (ordem operacional + matriz CHECK chk_ordens_venda_matriz_status).
                      Mantém o status atual sempre visível como fallback. */}
                  {statusOptions
                    .filter((o) => {
                      if (o.value === pedido?.status) return true;
                      const currentIdx = STATUS_ORDER.indexOf((pedido?.status as typeof STATUS_ORDER[number]) || "pendente");
                      const targetIdx = STATUS_ORDER.indexOf(o.value as typeof STATUS_ORDER[number]);
                      if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) return false;
                      return validarTransicaoPedido(o.value, pedido?.status_faturamento);
                    })
                    .map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data Prometida de Despacho</Label>
              <Input
                type="date"
                value={form.data_prometida_despacho}
                onChange={(e) => set("data_prometida_despacho", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prazo de Despacho (dias)</Label>
              <Input
                type="number"
                min={0}
                value={form.prazo_despacho_dias}
                onChange={(e) => set("prazo_despacho_dias", e.target.value)}
                placeholder="Ex: 5"
              />
            </div>
          </div>
        </div>

        {/* PO do Cliente */}
        <div className="bg-card rounded-xl border shadow-soft p-5 space-y-4">
          <h3 className="font-semibold text-foreground">PO do Cliente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Número do PO</Label>
              <Input
                value={form.po_number}
                onChange={(e) => set("po_number", e.target.value)}
                placeholder="Ex: PO-2024-0001"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data do PO</Label>
              <Input
                type="date"
                value={form.data_po_cliente}
                onChange={(e) => set("data_po_cliente", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Observações */}
        <div className="bg-card rounded-xl border shadow-soft p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Observações</h3>
          <Textarea
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Observações internas ou para o cliente..."
            className="min-h-[100px]"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          {isDirty && (
            <span className="inline-flex items-center gap-1 text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5" /> Alterações pendentes
            </span>
          )}
        </div>

        {/* Spacer mobile para não cobrir conteúdo com o footer sticky */}
        {isDirty && <div className="h-24 md:hidden" aria-hidden />}
      </div>

      {/* Footer sticky mobile — só aparece quando há alterações pendentes */}
      {isDirty && (
        <div
          className="md:hidden fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t z-40 px-3 py-3 flex flex-col-reverse gap-2"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <Button variant="outline" onClick={handleCancel} className="w-full min-h-11">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="w-full min-h-11 gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      )}
      {dialog}
    </PageShell>
  );
};

export default PedidoForm;
