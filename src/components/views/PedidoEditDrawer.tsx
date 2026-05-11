import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ViewDrawerV2, DrawerStickyFooter } from "@/components/ViewDrawerV2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useSalvarPedido } from "@/pages/comercial/hooks/useSalvarPedido";
import { getPedidoStatusLabel, validarTransicaoPedido } from "@/lib/comercialWorkflow";
import { closeOnly } from "@/lib/overlay";

/**
 * Drawer de edição operacional do pedido — substitui a navegação para a
 * página `/pedidos/:id` quando o usuário clica em "Editar pedido". Edita
 * apenas campos operacionais (status, PO, datas, observações). Itens,
 * valores e vínculos seguem fluxo comercial/fiscal e não entram aqui,
 * por isso o padrão drawer (em vez de página) é apropriado.
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
  po_number: string | null;
  data_po_cliente: string | null;
  data_prometida_despacho: string | null;
  prazo_despacho_dias: number | null;
  observacoes: string | null;
  clientes?: { nome_razao_social: string } | null;
  orcamentos?: { numero: string } | null;
}

interface Props {
  open: boolean;
  pedidoId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function PedidoEditDrawer({ open, pedidoId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
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
    if (!open || !pedidoId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("ordens_venda")
          .select("id, numero, status, status_faturamento, po_number, data_po_cliente, data_prometida_despacho, prazo_despacho_dias, observacoes, clientes(nome_razao_social), orcamentos(numero)")
          .eq("id", pedidoId)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        if (!data) {
          toast.error("Pedido não encontrado.");
          onClose();
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
      } catch (err) {
        notifyError(err);
        if (!cancelled) onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, pedidoId, reset, onClose]);

  const set = (field: keyof PedidoEditForm, value: string) =>
    updateForm({ [field]: value } as Partial<PedidoEditForm>);

  const handleClose = async () => {
    if (saving) return;
    if (isDirty) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "Você possui alterações não salvas neste pedido.",
        confirmLabel: "Descartar alterações",
        confirmVariant: "destructive",
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!pedidoId) return;
    if (form.status && !validarTransicaoPedido(form.status, pedido?.status_faturamento ?? null)) {
      toast.error("Transição de status inválida para o faturamento atual do pedido.");
      return;
    }
    try {
      await salvarPedido.mutateAsync({
        id: pedidoId,
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
      onSaved?.();
      onClose();
    } catch {
      // toast já emitido pelo hook
    }
  };

  return (
    <>
      <ViewDrawerV2
        open={open}
        onClose={handleClose}
        variant="edit"
        title={pedido ? `Editar pedido ${pedido.numero}` : "Editar pedido"}
        subtitle={
          pedido ? (
            <span className="truncate">
              {pedido.clientes?.nome_razao_social || "—"}
              {pedido.orcamentos?.numero ? ` · Orçamento ${pedido.orcamentos.numero}` : ""}
            </span>
          ) : undefined
        }
        footerSticky
        footer={
          <DrawerStickyFooter
            hint={isDirty ? (
              <span className="inline-flex items-center gap-1 text-warning">
                <AlertTriangle className="w-3.5 h-3.5" /> Alterações pendentes
              </span>
            ) : undefined}
            left={
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancelar
              </Button>
            }
            right={
              <Button onClick={handleSave} disabled={saving || loading || !isDirty} className="gap-2">
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            }
          />
        }
      >
        {loading || !pedido ? (
          <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
            Carregando pedido...
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border bg-muted/20 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Escopo desta edição</p>
              <p className="text-sm text-muted-foreground mt-1">
                Esta edição altera apenas dados operacionais. Itens, valores e vínculos
                (orçamento e faturamento) são controlados pelo fluxo comercial/fiscal.
              </p>
            </div>

            <section className="bg-card rounded-xl border shadow-soft p-4 space-y-4">
              <h3 className="font-semibold text-foreground text-sm">Status operacional</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusOptions
                        .filter((o) => {
                          if (o.value === pedido.status) return true;
                          const currentIdx = STATUS_ORDER.indexOf((pedido.status as typeof STATUS_ORDER[number]) || "pendente");
                          const targetIdx = STATUS_ORDER.indexOf(o.value as typeof STATUS_ORDER[number]);
                          if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) return false;
                          return validarTransicaoPedido(o.value, pedido.status_faturamento);
                        })
                        .map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Atual: {getPedidoStatusLabel(pedido.status)}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data prometida de despacho</Label>
                  <Input
                    type="date"
                    value={form.data_prometida_despacho}
                    onChange={(e) => set("data_prometida_despacho", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Prazo de despacho (dias)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.prazo_despacho_dias}
                    onChange={(e) => set("prazo_despacho_dias", e.target.value)}
                    placeholder="Ex: 5"
                  />
                </div>
              </div>
            </section>

            <section className="bg-card rounded-xl border shadow-soft p-4 space-y-4">
              <h3 className="font-semibold text-foreground text-sm">PO do cliente</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </section>

            <section className="bg-card rounded-xl border shadow-soft p-4 space-y-3">
              <h3 className="font-semibold text-foreground text-sm">Observações</h3>
              <Textarea
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Observações internas ou para o cliente..."
                className="min-h-[100px]"
              />
            </section>
          </div>
        )}
      </ViewDrawerV2>
      {dialog}
    </>
  );
}

// helper kept for tree-shake friendliness against the closeOnly utility usage hint
void closeOnly;