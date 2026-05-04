import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useRegistrarBaixa } from "@/pages/financeiro/hooks/useBaixaFinanceira";
import { formatCurrency } from "@/lib/format";
import { notifyError } from "@/utils/errorMessages";
import { toast } from "sonner";
import { FORMA_PAGAMENTO_OPTIONS } from "@/lib/financeiro";
import type { CartaoCredito } from "@/services/cartoesCredito.service";

interface ContaBancaria {
  id: string;
  descricao: string;
  bancos?: { nome: string };
}

interface Baixa {
  id: string;
  valor_pago: number;
  desconto?: number;
  juros?: number;
  multa?: number;
  abatimento?: number;
  data_baixa: string;
  forma_pagamento: string;
  observacoes: string;
  created_at: string;
}

interface BaixaParcialDialogProps {
  open: boolean;
  onClose: () => void;
  lancamento: {
    id: string;
    descricao: string;
    valor: number;
    saldo_restante?: number | null;
    status: string;
  } | null;
  contasBancarias: ContaBancaria[];
  cartoes?: CartaoCredito[];
  onSuccess: () => void;
}

export function BaixaParcialDialog({ open, onClose, lancamento, contasBancarias, cartoes = [], onSuccess }: BaixaParcialDialogProps) {
  const [valorPago, setValorPago] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [juros, setJuros] = useState(0);
  const [multa, setMulta] = useState(0);
  const [abatimento, setAbatimento] = useState(0);
  const [dataBaixa, setDataBaixa] = useState(new Date().toISOString().split("T")[0]);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [cartaoId, setCartaoId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [baixasAnteriores, setBaixasAnteriores] = useState<Baixa[]>([]);
  const [loadingBaixas, setLoadingBaixas] = useState(false);
  const registrarBaixa = useRegistrarBaixa();

  const saldoAtual = lancamento
    ? (lancamento.saldo_restante != null ? Number(lancamento.saldo_restante) : Number(lancamento.valor))
    : 0;

  const valorLiquido = valorPago - desconto + juros + multa - abatimento;
  const novoSaldo = Math.max(0, saldoAtual - valorPago - abatimento);

  const isStatusBlocked = lancamento
    ? (lancamento.status === "pago" || lancamento.status === "cancelado")
    : false;

  const isExcessivo = valorPago + abatimento > saldoAtual + 0.01;

  const lancamentoId = lancamento?.id;
  const lancamentoSaldo = lancamento
    ? (lancamento.saldo_restante != null ? Number(lancamento.saldo_restante) : Number(lancamento.valor))
    : 0;

  useEffect(() => {
    if (open && lancamentoId) {
      setValorPago(lancamentoSaldo);
      setDesconto(0);
      setJuros(0);
      setMulta(0);
      setAbatimento(0);
      setDataBaixa(new Date().toISOString().split("T")[0]);
      setFormaPagamento("");
      setContaBancariaId("");
      setCartaoId("");
      setObservacoes("");
      loadBaixas(lancamentoId);
    }
  }, [open, lancamentoId, lancamentoSaldo]);

  const loadBaixas = async (lancamentoId: string) => {
    setLoadingBaixas(true);
    const { data } = await supabase
      .from("financeiro_baixas")
      .select("*")
      .eq("lancamento_id", lancamentoId)
      .order("data_baixa", { ascending: false });
    setBaixasAnteriores((data ?? []) as Baixa[]);
    setLoadingBaixas(false);
  };

  const handleSubmit = async () => {
    if (!lancamento) return;
    if (!dataBaixa) { toast.error("Data de baixa é obrigatória"); return; }
    if (valorPago <= 0) { toast.error("Valor pago deve ser maior que zero"); return; }
    if (isExcessivo) { toast.error("Valor pago + abatimento não pode exceder o saldo restante"); return; }
    if (valorPago > saldoAtual) { toast.error("Valor pago não pode exceder o saldo restante"); return; }
    if (!formaPagamento) { toast.error("Forma de pagamento é obrigatória"); return; }
    if (!contaBancariaId) { toast.error("Conta bancária é obrigatória"); return; }
    const isCartao = formaPagamento === "cartao_credito" || formaPagamento === "cartao_debito";
    if (isCartao && cartoes.length > 0 && !cartaoId) { toast.error("Selecione o cartão utilizado"); return; }

    setSaving(true);
    try {
      // Server-side re-check: prevent double-baixa if status changed between render and click
      try {
        const { data: fresh } = await supabase
          .from("financeiro_lancamentos")
          .select("status, saldo_restante")
          .eq("id", lancamento.id)
          .single();
        if (fresh?.status === "pago" || (fresh?.saldo_restante != null && Number(fresh.saldo_restante) <= 0)) {
          toast.error("Este título já foi totalmente liquidado. Não é possível registrar nova baixa.");
          onClose();
          return;
        }
      } catch {
        // If the check fails, proceed with the original flow
      }

      // Valor líquido efetivo da baixa (considera desconto/juros/multa/abatimento).
      // A RPC `registrar_baixa_financeira` é a fonte oficial: atualiza saldo do lançamento,
      // saldo da conta bancária e gera movimento de caixa atomicamente.
      await registrarBaixa.mutateAsync({
        lancamentoId: lancamento.id,
        valorPago,
        dataBaixa,
        formaPagamento,
        contaBancariaId,
        observacoes: (() => {
          const cartao = cartaoId ? cartoes.find((c) => c.id === cartaoId) : null;
          const tag = cartao ? `[Cartão: ${cartao.nome}${cartao.ultimos4 ? ` ••••${cartao.ultimos4}` : ""}]` : "";
          const base = observacoes?.trim() || "";
          return [tag, base].filter(Boolean).join(" ").trim() || null;
        })(),
        desconto,
        juros,
        multa,
        abatimento,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error("[baixa]", err);
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  const totalJaPago = baixasAnteriores.reduce((s, b) => s + Number(b.valor_pago || 0), 0);
  const isCartao = formaPagamento === "cartao_credito" || formaPagamento === "cartao_debito";
  const cartoesAtivos = cartoes.filter((c) => c.ativo);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto max-sm:!inset-x-0 max-sm:!bottom-0 max-sm:!top-auto max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!left-0 max-sm:!w-full max-sm:!max-w-full max-sm:rounded-t-2xl max-sm:rounded-b-none">
        <DialogHeader>
          <DialogTitle>Registrar Baixa</DialogTitle>
          <DialogDescription>
            Informe os valores e dados do pagamento para realizar a baixa total ou parcial deste título.
          </DialogDescription>
        </DialogHeader>

        {lancamento && (
          <div className="space-y-5">
            {isStatusBlocked && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                ⚠️ Este título possui status <strong>{lancamento.status}</strong> e não aceita nova baixa.
              </div>
            )}
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Valor Original</span>
                <p className="mt-0.5 text-sm font-semibold">{formatCurrency(Number(lancamento.valor))}</p>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Já Pago</span>
                <p className="mt-0.5 text-sm font-semibold text-success">{formatCurrency(totalJaPago)}</p>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo Restante</span>
                <p className="mt-0.5 text-sm font-bold text-primary">{formatCurrency(saldoAtual)}</p>
              </div>
            </div>

            {/* Previous baixas */}
            {baixasAnteriores.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Baixas Anteriores</span>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Data</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Valor Pago</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Forma</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Obs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baixasAnteriores.map((b, i) => (
                        <tr key={b.id} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                          <td className="px-3 py-1.5">{new Date(b.data_baixa).toLocaleDateString("pt-BR")}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold">{formatCurrency(Number(b.valor_pago))}</td>
                          <td className="px-3 py-1.5">{b.forma_pagamento || "—"}</td>
                          <td className="px-3 py-1.5 truncate max-w-[120px]">{b.observacoes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor a Pagar *</Label>
                <Input type="number" inputMode="decimal" step="0.01" min={0} max={saldoAtual} value={valorPago} onChange={(e) => setValorPago(Number(e.target.value))} className="h-11 sm:h-10 font-mono" />
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setValorPago(saldoAtual)}
                    disabled={isStatusBlocked}
                    className="text-xs font-medium px-3 min-h-11 sm:min-h-0 sm:py-0.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    aria-label="Preencher com saldo total"
                  >
                    Saldo total
                  </button>
                  <button
                    type="button"
                    onClick={() => setValorPago(Number((saldoAtual / 2).toFixed(2)))}
                    disabled={isStatusBlocked}
                    className="text-xs font-medium px-3 min-h-11 sm:min-h-0 sm:py-0.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    aria-label="Preencher com 50% do saldo"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setValorPago(0)}
                    disabled={isStatusBlocked}
                    className="text-xs font-medium px-3 min-h-11 sm:min-h-0 sm:py-0.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    aria-label="Limpar valor"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Desconto</Label>
                <Input type="number" inputMode="decimal" step="0.01" min={0} value={desconto} onChange={(e) => setDesconto(Number(e.target.value))} className="h-11 sm:h-10 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Juros</Label>
                <Input type="number" inputMode="decimal" step="0.01" min={0} value={juros} onChange={(e) => setJuros(Number(e.target.value))} className="h-11 sm:h-10 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Multa</Label>
                <Input type="number" inputMode="decimal" step="0.01" min={0} value={multa} onChange={(e) => setMulta(Number(e.target.value))} className="h-11 sm:h-10 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Abatimento</Label>
                <Input type="number" inputMode="decimal" step="0.01" min={0} value={abatimento} onChange={(e) => setAbatimento(Number(e.target.value))} className="h-11 sm:h-10 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data de Baixa *</Label>
                <Input type="date" value={dataBaixa} onChange={(e) => setDataBaixa(e.target.value)} className="h-11 sm:h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pagamento *</Label>
                <Select value={formaPagamento || "none"} onValueChange={(v) => setFormaPagamento(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione...</SelectItem>
                    {FORMA_PAGAMENTO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Conta Bancária *</Label>
                <Select value={contaBancariaId || "none"} onValueChange={(v) => setContaBancariaId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione conta..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione...</SelectItem>
                    {contasBancarias.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.bancos?.nome} - {c.descricao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isCartao && (
                <div className="col-span-2 sm:col-span-3 space-y-1.5">
                  <Label className="text-xs">
                    Cartão {cartoesAtivos.length > 0 ? "*" : ""}
                  </Label>
                  {cartoesAtivos.length > 0 ? (
                    <Select value={cartaoId || "none"} onValueChange={(v) => setCartaoId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione cartão..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione...</SelectItem>
                        {cartoesAtivos.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}{c.ultimos4 ? ` •••• ${c.ultimos4}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Nenhum cartão cadastrado. Cadastre em Financeiro → Cartões para vincular à baixa.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
            </div>

            {/* Calculated summary */}
            <div className="rounded-lg border bg-accent/20 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor líquido da baixa</span>
                <span className="font-semibold font-mono">{formatCurrency(valorLiquido)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Novo saldo restante</span>
                <span className={`font-bold font-mono ${novoSaldo <= 0.01 ? "text-success" : "text-primary"}`}>
                  {formatCurrency(Math.max(0, novoSaldo))}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status após baixa</span>
                <Badge variant={novoSaldo <= 0.01 ? "default" : "secondary"}>
                  {novoSaldo <= 0.01 ? "Pago" : "Parcial"}
                </Badge>
              </div>
            </div>

            {/* Cash flow impact indicator */}
            {dataBaixa && valorLiquido > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
                💡 Esta operação afetará o saldo projetado do dia{" "}
                <strong>{new Date(dataBaixa + "T00:00:00").toLocaleDateString("pt-BR")}</strong> em{" "}
                <strong>{formatCurrency(valorLiquido)}</strong>.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 bg-card border-t shadow-[0_-4px_8px_-4px_rgba(0,0,0,0.06)] sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:py-0 sm:bg-transparent sm:border-0 sm:shadow-none">
          <Button variant="outline" onClick={onClose} disabled={saving} aria-label="Cancelar baixa">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || isStatusBlocked || isExcessivo} aria-label="Confirmar registro de baixa" className="h-11 sm:h-10">
            {saving ? "Processando..." : "Confirmar Baixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
