import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { receberCompra } from "@/types/rpc";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { todayISO } from "@/lib/dateUtils";
import { notifyError } from "@/utils/errorMessages";
import { Loader2, PackageCheck, Info } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  pedidoId: string;
  pedidoNumero: string;
  onSuccess?: () => void;
}

interface ItemRow {
  id: string;
  produto_id: string | null;
  quantidade: number;
  quantidade_recebida: number;
  preco_unitario: number;
  pendente: number;
  receber: string; // edited string
  produto_nome: string;
  codigo_interno: string;
}

/**
 * Diálogo de recebimento granular: lista os itens com saldo pendente
 * e permite ao usuário definir quanto receber de cada um antes de
 * chamar a RPC `receber_compra`.
 *
 * O usuário pode receber tudo (default) ou ajustar manualmente.
 */
export function RegistrarRecebimentoDialog({ open, onClose, pedidoId, pedidoNumero, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [dataRecebimento, setDataRecebimento] = useState(todayISO());
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("pedidos_compra_itens")
          .select("id, produto_id, quantidade, quantidade_recebida, preco_unitario, produtos(nome, codigo_interno)")
          .eq("pedido_compra_id", pedidoId);
        if (error) throw error;
        if (cancelled) return;
        const mapped: ItemRow[] = (data || []).map((i) => {
          const qtd = Number(i.quantidade || 0);
          const qtdRec = Number(i.quantidade_recebida || 0);
          const pendente = Math.max(0, qtd - qtdRec);
          return {
            id: String(i.id),
            produto_id: i.produto_id ? String(i.produto_id) : null,
            quantidade: qtd,
            quantidade_recebida: qtdRec,
            preco_unitario: Number(i.preco_unitario || 0),
            pendente,
            receber: pendente > 0 ? String(pendente) : "0",
            produto_nome: i.produtos?.nome ?? "—",
            codigo_interno: i.produtos?.codigo_interno ?? "",
          };
        });
        setItems(mapped);
        setDataRecebimento(todayISO());
        setObservacoes("");
      } catch (err) {
        notifyError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, pedidoId]);

  const updateReceber = (id: string, val: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, receber: val } : i)));
  };

  const fillAll = () => {
    setItems((prev) => prev.map((i) => ({ ...i, receber: String(i.pendente) })));
  };
  const clearAll = () => {
    setItems((prev) => prev.map((i) => ({ ...i, receber: "0" })));
  };

  const totalReceberQtd = items.reduce((s, i) => s + (Number(i.receber) || 0), 0);
  const totalReceberValor = items.reduce((s, i) => s + (Number(i.receber) || 0) * i.preco_unitario, 0);

  const handleSubmit = async () => {
    const payload = items
      .map((i) => {
        const qtd = Number(i.receber) || 0;
        if (qtd > i.pendente) {
          throw new Error(`Quantidade a receber para "${i.produto_nome}" excede o pendente (${i.pendente}).`);
        }
        return {
          item_pedido_id: i.id,
          produto_id: i.produto_id,
          descricao: null,
          quantidade_recebida: qtd,
          valor_unitario: i.preco_unitario,
        };
      })
      .filter((i) => i.quantidade_recebida > 0);

    if (payload.length === 0) {
      toast.error("Informe ao menos uma quantidade a receber.");
      return;
    }
    setSaving(true);
    try {
      await receberCompra({
        p_pedido_id: pedidoId,
        p_data_recebimento: dataRecebimento,
        p_itens: payload as never,
        p_observacoes: observacoes.trim() || null,
      });
      toast.success("Recebimento registrado.");
      onSuccess?.();
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className={
        "max-w-3xl " +
        // Mobile: bottom-sheet
        "max-sm:!top-auto max-sm:!bottom-0 max-sm:!left-0 max-sm:!right-0 max-sm:!translate-x-0 max-sm:!translate-y-0 " +
        "max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 " +
        "max-sm:max-h-[92vh] max-sm:overflow-y-auto max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] " +
        "max-sm:before:content-[''] max-sm:before:absolute max-sm:before:top-2 max-sm:before:left-1/2 max-sm:before:-translate-x-1/2 max-sm:before:h-1 max-sm:before:w-10 max-sm:before:rounded-full max-sm:before:bg-muted-foreground/30 max-sm:pt-6"
      }>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Registrar recebimento — {pedidoNumero}
          </DialogTitle>
          <DialogDescription>
            Ajuste a quantidade a receber por item. Itens com pendência zero são ignorados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-info/40 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 text-info shrink-0" />
          <span>
            O recebimento <strong>atualiza o estoque</strong> e registra a compra. O <strong>contas a pagar</strong> será gerado ao confirmar a <strong>NF de entrada</strong> vinculada.
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando itens...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="data-rec">Data do recebimento</Label>
                <Input
                  id="data-rec"
                  type="date"
                  value={dataRecebimento}
                  onChange={(e) => setDataRecebimento(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={fillAll} disabled={saving}>
                  Receber tudo
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={saving}>
                  Zerar
                </Button>
              </div>
            </div>

            {/* Mobile: cards verticais */}
            <div className="md:hidden space-y-2 max-h-[55vh] overflow-y-auto">
              {items.map((i) => (
                <div key={i.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div>
                    <p className="font-medium text-sm">{i.produto_nome}</p>
                    {i.codigo_interno && (
                      <p className="text-[10px] font-mono text-muted-foreground">{i.codigo_interno}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Pedido</p>
                      <p className="font-mono">{i.quantidade}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Recebido</p>
                      <p className="font-mono text-success">{i.quantidade_recebida}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-warning uppercase">Pendente</p>
                      <p className="font-mono text-warning font-semibold">{i.pendente}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-primary uppercase">Receber agora</Label>
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      max={i.pendente}
                      value={i.receber}
                      disabled={i.pendente === 0 || saving}
                      onChange={(e) => updateReceber(i.id, e.target.value)}
                      className="h-11 text-right font-mono"
                    />
                  </div>
                </div>
              ))}
              <div className="rounded-lg bg-muted/30 p-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Total a receber</span>
                <span className="font-mono text-sm font-bold">
                  {totalReceberQtd} un · {formatCurrency(totalReceberValor)}
                </span>
              </div>
            </div>

            {/* Desktop: tabela */}
            <div className="hidden md:block rounded-lg border max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="border-b">
                    <th className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">Produto</th>
                    <th className="px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground">Pedido</th>
                    <th className="px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground">Recebido</th>
                    <th className="px-2 py-1.5 text-right text-xs font-semibold text-warning">Pendente</th>
                    <th className="px-2 py-1.5 text-right text-xs font-semibold text-primary">Receber agora</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1.5">
                        <div className="font-medium truncate max-w-[200px]">{i.produto_nome}</div>
                        {i.codigo_interno && (
                          <div className="text-[10px] font-mono text-muted-foreground">{i.codigo_interno}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs">{i.quantidade}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs text-success">
                        {i.quantidade_recebida}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs text-warning font-semibold">
                        {i.pendente}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          max={i.pendente}
                          value={i.receber}
                          disabled={i.pendente === 0 || saving}
                          onChange={(e) => updateReceber(i.id, e.target.value)}
                          className="h-7 text-right font-mono text-xs w-24 ml-auto"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 border-t">
                    <td colSpan={4} className="px-2 py-1.5 text-xs font-semibold text-right text-muted-foreground">
                      Total a receber
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs font-bold">
                      {totalReceberQtd} un · {formatCurrency(totalReceberValor)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div>
              <Label htmlFor="obs-rec">Observações (opcional)</Label>
              <Textarea
                id="obs-rec"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: NF 1234, transportadora XYZ"
                className="min-h-16"
              />
            </div>
          </div>
        )}

        <DialogFooter className="max-sm:flex-col-reverse max-sm:gap-2 max-sm:space-x-0">
          <Button variant="outline" onClick={onClose} disabled={saving} className="max-sm:h-11 max-sm:w-full">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || loading || totalReceberQtd <= 0} className="gap-2 max-sm:h-11 max-sm:w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Registrar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
