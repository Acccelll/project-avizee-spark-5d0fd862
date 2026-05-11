import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, AlertTriangle, ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";
import { closeOnly } from "@/lib/overlay";
import { notifyError } from "@/utils/errorMessages";
import { useEditDirtyForm } from "@/hooks/useEditDirtyForm";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useSalvarPedido } from "@/pages/comercial/hooks/useSalvarPedido";
import { getPedidoStatusLabel, validarTransicaoPedido, statusFaturamentoLabels } from "@/lib/comercialWorkflow";
import { StatusBadge } from "@/components/StatusBadge";

/**
 * Modal de edição operacional do pedido — segue o padrão dos demais
 * cadastros/edições (Dialog XL, full-screen em mobile). Edita apenas
 * campos operacionais (status, PO, datas, observações). Itens, valores
 * e vínculos seguem o fluxo comercial/fiscal e não entram aqui.
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
  clientes?: { nome_razao_social: string } | null;
  orcamentos?: { numero: string } | null;
}

interface Props {
  open: boolean;
  pedidoId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function PedidoEditModal({ open, pedidoId, onClose, onSaved }: Props) {
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
          .select("id, numero, status, status_faturamento, data_emissao, po_number, data_po_cliente, data_prometida_despacho, prazo_despacho_dias, observacoes, clientes(nome_razao_social), orcamentos(numero)")
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

  // Auto-sugere data prometida quando o usuário informa apenas o prazo em dias
  // (a partir de data_emissao). Não sobrescreve se a data já estiver preenchida.
  const setPrazoDias = (value: string) => {
    const patch: Partial<PedidoEditForm> = { prazo_despacho_dias: value };
    const dias = Number(value);
    if (
      value &&
      Number.isFinite(dias) &&
      dias > 0 &&
      !form.data_prometida_despacho &&
      pedido?.data_emissao
    ) {
      const base = new Date(pedido.data_emissao);
      if (!Number.isNaN(base.getTime())) {
        base.setDate(base.getDate() + dias);
        patch.data_prometida_despacho = base.toISOString().slice(0, 10);
      }
    }
    updateForm(patch);
  };

  // Validações contextuais (somente UI; RPC permanece autoridade final).
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (form.prazo_despacho_dias) {
      const n = Number(form.prazo_despacho_dias);
      if (!Number.isFinite(n) || n < 0) errors.push("Prazo de despacho deve ser um número positivo.");
    }
    if (form.data_prometida_despacho && pedido?.data_emissao) {
      if (form.data_prometida_despacho < pedido.data_emissao) {
        errors.push("Data prometida não pode ser anterior à data de emissão do pedido.");
      }
    }
    return errors;
  }, [form.prazo_despacho_dias, form.data_prometida_despacho, pedido?.data_emissao]);

  const semPrazo = !form.data_prometida_despacho && !form.prazo_despacho_dias;
  const statusChanged = pedido && form.status && form.status !== pedido.status;

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
    if (validation.length > 0) {
      toast.error(validation[0]);
      return;
    }
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
      <Dialog open={open} onOpenChange={closeOnly(handleClose)}>
        <DialogContent
          className={[
            "sm:max-w-3xl sm:max-h-[92dvh] overflow-hidden p-0 flex flex-col",
            "max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-0 max-sm:m-0 max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-x-0",
          ].join(" ")}
        >
          <DialogHeader className="px-5 py-4 border-b">
            <DialogTitle className="text-base">
              {pedido ? `Editar pedido ${pedido.numero}` : "Editar pedido"}
            </DialogTitle>
            <DialogDescription className="text-xs truncate">
              {pedido ? (
                <>
                  {pedido.clientes?.nome_razao_social || "—"}
                  {pedido.orcamentos?.numero ? ` · Origem: ${pedido.orcamentos.numero}` : ""}
                </>
              ) : "Carregando..."}
            </DialogDescription>
            {pedido && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <StatusBadge status={pedido.status || "pendente"} label={getPedidoStatusLabel(pedido.status)} />
                <StatusBadge
                  status={pedido.status_faturamento === "total" ? "faturado" : (pedido.status_faturamento || "aguardando")}
                  label={pedido.status_faturamento === "aguardando" || !pedido.status_faturamento
                    ? "Aguardando NF"
                    : (statusFaturamentoLabels[pedido.status_faturamento] || pedido.status_faturamento)}
                />
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {loading || !pedido ? (
              <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
                Carregando pedido...
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-xs text-muted-foreground inline-flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Esta tela altera apenas dados operacionais. Itens, valores e vínculos permanecem controlados pelo orçamento e pelo faturamento.
                </p>

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
                      {statusChanged ? (
                        <p className="text-[11px] text-warning inline-flex items-center gap-1">
                          Alteração: {getPedidoStatusLabel(pedido.status)}
                          <ArrowRight className="w-3 h-3" />
                          {getPedidoStatusLabel(form.status)}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Status atual do pedido no fluxo operacional. O status fiscal ({statusFaturamentoLabels[pedido.status_faturamento || "aguardando"] || "Aguardando NF"}) é controlado pelo faturamento.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Data prometida de despacho</Label>
                      <Input
                        type="date"
                        min={pedido.data_emissao || undefined}
                        value={form.data_prometida_despacho}
                        onChange={(e) => set("data_prometida_despacho", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Prazo de despacho (dias)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.prazo_despacho_dias}
                        onChange={(e) => setPrazoDias(e.target.value)}
                        placeholder="Ex: 5"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Use prazo <strong>ou</strong> data prometida — informar o prazo preenche a data automaticamente a partir da emissão.
                  </p>
                  {semPrazo && (
                    <p className="text-[11px] text-warning inline-flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Este pedido ainda não possui prazo de despacho definido — entra como pendência no KPI "Sem prazo".
                    </p>
                  )}
                  {validation.length > 0 && (
                    <ul className="text-[11px] text-destructive space-y-0.5">
                      {validation.map((m) => (
                        <li key={m} className="inline-flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" /> {m}
                        </li>
                      ))}
                    </ul>
                  )}
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
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground text-sm">Observações internas</h3>
                    <span className="text-[11px] text-muted-foreground">Visível apenas para a equipe — não vai para documentos do cliente.</span>
                  </div>
                  <Textarea
                    value={form.observacoes}
                    onChange={(e) => set("observacoes", e.target.value)}
                    maxLength={2000}
                    placeholder="Observações operacionais internas sobre este pedido..."
                    className="min-h-[100px]"
                  />
                </section>
              </div>
            )}
          </div>

          <div className="border-t bg-card px-5 py-3 flex items-center gap-2 flex-wrap"
               style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            {isDirty ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-warning mr-auto">
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse" aria-hidden />
                Alterações não salvas
              </span>
            ) : (
              <span className="text-xs text-muted-foreground mr-auto">Nenhuma alteração para salvar</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || loading || !isDirty || validation.length > 0}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}

export default PedidoEditModal;