import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { processarBaixaLote, type BaixaItemOverride } from "@/services/financeiro.service";
import { Pencil, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { FORMA_PAGAMENTO_OPTIONS } from "@/lib/financeiro";

interface ContaBancaria {
  id: string;
  descricao: string;
  bancos?: { nome: string };
}

interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  saldo_restante: number | null;
  tipo: string;
  data_vencimento: string;
  status?: string;
  clientes?: { nome_razao_social: string };
  fornecedores?: { nome_razao_social: string };
}

interface BaixaLoteModalProps {
  open: boolean;
  onClose: () => void;
  selectedLancamentos: Lancamento[];
  contasBancarias: ContaBancaria[];
  onSuccess: () => void;
}

export function BaixaLoteModal({ open, onClose, selectedLancamentos: rawLancamentos, contasBancarias, onSuccess }: BaixaLoteModalProps) {
  // Bloqueia pagos/cancelados defensivamente; o servidor também ignora.
  const selectedLancamentos = useMemo(
    () => rawLancamentos.filter((l) => l.status !== "pago" && l.status !== "cancelado"),
    [rawLancamentos],
  );
  const [baixaDate, setBaixaDate] = useState(new Date().toISOString().split("T")[0]);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [contaBancaria, setContaBancaria] = useState("");
  const [tipoBaixa, setTipoBaixa] = useState<"total" | "parcial">("total");
  const [valorPagoBaixa, setValorPagoBaixa] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, BaixaItemOverride>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftOverride, setDraftOverride] = useState<BaixaItemOverride>({});

  const totalBaixa = useMemo(() => {
    return selectedLancamentos.reduce((s, l) => s + Number(l.saldo_restante != null ? l.saldo_restante : l.valor || 0), 0);
  }, [selectedLancamentos]);

  useEffect(() => {
    if (open) {
      setBaixaDate(new Date().toISOString().split("T")[0]);
      setFormaPagamento("");
      setContaBancaria("");
      setTipoBaixa("total");
      setValorPagoBaixa(totalBaixa);
      setOverrides({});
      setEditingId(null);
      setDraftOverride({});
    }
  }, [open, totalBaixa]);

  const startEdit = (l: Lancamento) => {
    const existing = overrides[l.id] ?? {};
    const saldo = Number(l.saldo_restante != null ? l.saldo_restante : l.valor || 0);
    setDraftOverride({
      data_baixa: existing.data_baixa ?? baixaDate,
      forma_pagamento: existing.forma_pagamento ?? formaPagamento,
      conta_bancaria_id: existing.conta_bancaria_id ?? contaBancaria,
      valor_pago: existing.valor_pago ?? saldo,
      observacoes: existing.observacoes ?? "",
    });
    setEditingId(l.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftOverride({});
  };

  const saveEdit = (id: string) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...draftOverride } }));
    setEditingId(null);
    setDraftOverride({});
  };

  const removeOverride = (id: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!baixaDate) return;
    if (!formaPagamento) return;
    if (!contaBancaria) return;
    if (tipoBaixa === "parcial" && (valorPagoBaixa <= 0 || valorPagoBaixa >= totalBaixa)) return;

    setProcessing(true);
    const ok = await processarBaixaLote({
      selectedIds: selectedLancamentos.map(l => l.id),
      selectedLancamentos,
      tipoBaixa,
      valorPagoBaixa,
      totalBaixa,
      baixaDate,
      formaPagamento,
      contaBancariaId: contaBancaria,
      overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    });
    setProcessing(false);
    if (ok) {
      onClose();
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto max-sm:!inset-x-0 max-sm:!bottom-0 max-sm:!top-auto max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!left-0 max-sm:!w-full max-sm:!max-w-full max-sm:rounded-t-2xl max-sm:rounded-b-none">
        <DialogHeader>
          <DialogTitle>Confirmar Baixa — {selectedLancamentos.length} título(s)</DialogTitle>
          <DialogDescription>Revise os títulos selecionados e informe os dados do pagamento.</DialogDescription>
        </DialogHeader>
        {selectedLancamentos.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhum título selecionado para baixa.
            </p>
            <p className="text-xs text-muted-foreground">
              Selecione um ou mais lançamentos na lista de Lançamentos e use o botão
              <span className="font-semibold"> "Baixar selecionados"</span> para iniciar uma baixa em lote.
            </p>
            <Button onClick={onClose} className="mt-2">Entendi</Button>
          </div>
        ) : (
        <>
        <div className="space-y-4">
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Descrição</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Parceiro</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Valor</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Vencimento</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {selectedLancamentos.map((l, idx) => {
                  const isEditing = editingId === l.id;
                  const ovr = overrides[l.id];
                  const hasOverride = !!ovr;
                  if (isEditing) {
                    return (
                      <tr key={l.id} className="bg-primary/5 border-y-2 border-primary/30">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div>
                                <p className="text-xs font-semibold">{l.descricao}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {l.tipo === "receber" ? l.clientes?.nome_razao_social : l.fornecedores?.nome_razao_social || "—"}
                                  {" · "}Vencimento {new Date(l.data_vencimento).toLocaleDateString("pt-BR")}
                                  {" · "}<span className="font-mono">{formatCurrency(Number(l.valor))}</span>
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase">Data baixa</Label>
                                <Input type="date" className="h-8 text-xs"
                                  value={draftOverride.data_baixa ?? ""}
                                  onChange={(e) => setDraftOverride(d => ({ ...d, data_baixa: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase">Valor pago</Label>
                                <Input type="number" step="0.01" min={0} className="h-8 text-xs font-mono"
                                  value={draftOverride.valor_pago ?? 0}
                                  onChange={(e) => setDraftOverride(d => ({ ...d, valor_pago: Number(e.target.value) }))}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase">Forma pgto</Label>
                                <Select value={draftOverride.forma_pagamento || ""} onValueChange={(v) => setDraftOverride(d => ({ ...d, forma_pagamento: v }))}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                  <SelectContent>
                                    {FORMA_PAGAMENTO_OPTIONS.map((o) => (
                                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase">Conta bancária</Label>
                                <Select value={draftOverride.conta_bancaria_id || ""} onValueChange={(v) => setDraftOverride(d => ({ ...d, conta_bancaria_id: v }))}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                  <SelectContent>
                                    {contasBancarias.map(c => (
                                      <SelectItem key={c.id} value={c.id}>{c.bancos?.nome} - {c.descricao}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase">Observações</Label>
                              <Textarea rows={2} className="text-xs"
                                value={draftOverride.observacoes ?? ""}
                                onChange={(e) => setDraftOverride(d => ({ ...d, observacoes: e.target.value }))}
                                placeholder="Notas específicas para este título (opcional)"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs">
                                <X className="h-3 w-3 mr-1" />Voltar
                              </Button>
                              <Button type="button" size="sm" onClick={() => saveEdit(l.id)} className="h-7 text-xs">
                                <Check className="h-3 w-3 mr-1" />Aplicar a este título
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={l.id} className={idx % 2 === 0 ? "bg-muted/20" : ""}>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          {hasOverride && <Check className="h-3 w-3 text-primary shrink-0" aria-label="Personalizado" />}
                          <span>{l.descricao}</span>
                        </div>
                        {hasOverride && (
                          <p className="text-[10px] text-primary mt-0.5">
                            Personalizado: {ovr.valor_pago != null ? formatCurrency(ovr.valor_pago) : ""}
                            {ovr.data_baixa ? ` · ${new Date(ovr.data_baixa + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}
                            {ovr.forma_pagamento ? ` · ${ovr.forma_pagamento}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{l.tipo === "receber" ? l.clientes?.nome_razao_social : l.fornecedores?.nome_razao_social || "—"}</td>
                      <td className="px-3 py-2 text-xs font-mono text-right font-semibold">{formatCurrency(Number(l.valor))}</td>
                      <td className="px-3 py-2 text-xs text-right">{new Date(l.data_vencimento).toLocaleDateString("pt-BR")}</td>
                      <td className="px-3 py-2 text-xs text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2"
                            onClick={() => startEdit(l)} aria-label="Editar este título">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {hasOverride && (
                            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-muted-foreground"
                              onClick={() => removeOverride(l.id)} aria-label="Remover personalização">
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={2} className="px-3 py-2 text-xs font-semibold">Total</td>
                  <td className="px-3 py-2 text-xs font-mono text-right font-bold text-primary">{formatCurrency(totalBaixa)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          {Object.keys(overrides).length > 0 && (
            <p className="text-xs text-primary flex items-center gap-1.5">
              <Check className="h-3 w-3" />
              {Object.keys(overrides).length} título(s) com configuração individual — sobrescrevem os defaults abaixo.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Baixa *</Label>
              <Input type="date" value={baixaDate} onChange={(e) => setBaixaDate(e.target.value)} required className="h-11 sm:h-10" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Baixa</Label>
              <Select value={tipoBaixa} onValueChange={(v) => setTipoBaixa(v as "total" | "parcial")}>
                <SelectTrigger className="h-11 sm:h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Forma de Pagamento *</Label>
              <Select value={formaPagamento || "none"} onValueChange={(v) => setFormaPagamento(v === "none" ? "" : v)}>
                <SelectTrigger className="h-11 sm:h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione...</SelectItem>
                  {FORMA_PAGAMENTO_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conta Bancária *</Label>
              <Select value={contaBancaria || "none"} onValueChange={(v) => setContaBancaria(v === "none" ? "" : v)}>
                <SelectTrigger className="h-11 sm:h-10"><SelectValue placeholder="Selecione conta..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione...</SelectItem>
                  {contasBancarias.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.bancos?.nome} - {c.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {tipoBaixa === "parcial" && (
            <div className="space-y-2">
              <Label>Valor a Pagar *</Label>
              <Input type="number" inputMode="decimal" step="0.01" min={0.01} max={totalBaixa - 0.01} className="h-11 sm:h-10 font-mono"
                value={valorPagoBaixa} onChange={(e) => setValorPagoBaixa(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Total: {formatCurrency(totalBaixa)} — Restante: {formatCurrency(Math.max(0, totalBaixa - valorPagoBaixa))}</p>
            </div>
          )}

          {/* Cash flow impact indicator */}
          {baixaDate && totalBaixa > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
              💡 Esta operação afetará o saldo projetado do dia{" "}
              <strong>{new Date(baixaDate + "T00:00:00").toLocaleDateString("pt-BR")}</strong> em{" "}
              <strong>{formatCurrency(tipoBaixa === "parcial" ? valorPagoBaixa : totalBaixa)}</strong>{" "}
              ({selectedLancamentos.length} título{selectedLancamentos.length !== 1 ? "s" : ""}).
            </div>
          )}
        </div>
        <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 bg-card border-t shadow-[0_-4px_8px_-4px_rgba(0,0,0,0.06)] sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:py-0 sm:bg-transparent sm:border-0 sm:shadow-none">
          <Button variant="outline" onClick={onClose} disabled={processing} aria-label="Cancelar baixa em lote">Cancelar</Button>
          <Button onClick={handleConfirm} disabled={processing || !baixaDate} aria-label="Confirmar baixa em lote" className="h-11 sm:h-10">
            {processing ? "Processando..." : "Confirmar Baixa"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
