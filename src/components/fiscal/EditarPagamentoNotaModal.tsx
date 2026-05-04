import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/utils/errorMessages";
import { ParcelasFiscalEditor, gerarPlanoParcelas, type ParcelaPlano } from "@/pages/fiscal/components/ParcelasFiscalEditor";
import type { NotaFiscal } from "@/types/domain";

interface Props {
  open: boolean;
  onClose: () => void;
  nota: NotaFiscal | null;
  onSaved?: () => void;
}

export function EditarPagamentoNotaModal({ open, onClose, nota, onSaved }: Props) {
  const [forma, setForma] = useState<string>("");
  const [condicao, setCondicao] = useState<string>("a_vista");
  const [qtdParcelas, setQtdParcelas] = useState<number>(1);
  const [primeiroVenc, setPrimeiroVenc] = useState<string>("");
  const [intervalo, setIntervalo] = useState<number>(30);
  const [plano, setPlano] = useState<ParcelaPlano[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !nota) return;
    setForma(nota.forma_pagamento || "");
    setCondicao(nota.condicao_pagamento || "a_vista");
    setQtdParcelas(1);
    const emissao = nota.data_emissao || new Date().toISOString().split("T")[0];
    const venc = (() => {
      const d = new Date(emissao + "T00:00:00");
      d.setDate(d.getDate() + 30);
      return d.toISOString().split("T")[0];
    })();
    setPrimeiroVenc(venc);
    setIntervalo(30);
    setPlano([]);
  }, [open, nota]);

  if (!nota) return null;

  const total = Number(nota.valor_total || 0);

  const handleSave = async () => {
    if (!forma) {
      toast.error("Selecione a forma de pagamento.");
      return;
    }
    setSaving(true);
    try {
      const parcelasPayload =
        condicao === "a_prazo" && qtdParcelas > 1
          ? (plano.length === qtdParcelas ? plano : gerarPlanoParcelas(total, qtdParcelas, primeiroVenc, intervalo))
          : [{ numero: 1, vencimento: condicao === "a_prazo" ? primeiroVenc : (nota.data_emissao || new Date().toISOString().split("T")[0]), valor: total }];

      const { error } = await supabase.rpc("atualizar_financeiro_nota", {
        p_nota_id: nota.id,
        p_forma_pagamento: forma,
        p_condicao_pagamento: condicao,
        p_parcelas: parcelasPayload as never,
      } as never);
      if (error) throw error;
      toast.success("Pagamento atualizado e lançamentos regenerados.");
      onSaved?.();
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar pagamento da NF {nota.numero}</DialogTitle>
          <DialogDescription>
            Atualiza forma/condição e regenera os lançamentos no Contas a {nota.tipo === "entrada" ? "Pagar" : "Receber"}.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Lançamentos em aberto vinculados a esta nota serão substituídos.
            Parcelas já baixadas (pagas/parciais) impedem a alteração — estorne antes.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="boleto_dda">Boleto/DDA</SelectItem>
                <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Condição</Label>
            <Select value={condicao} onValueChange={setCondicao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a_vista">À Vista</SelectItem>
                <SelectItem value="a_prazo">A Prazo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {condicao === "a_prazo" && (
            <div className="space-y-2">
              <Label>Nº Parcelas</Label>
              <Input type="number" min={1} max={48} value={qtdParcelas}
                onChange={(e) => setQtdParcelas(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          )}
        </div>

        {condicao === "a_prazo" && (
          <ParcelasFiscalEditor
            total={total}
            qtdParcelas={qtdParcelas}
            dataEmissao={nota.data_emissao || ""}
            primeiroVencimento={primeiroVenc}
            intervaloDias={intervalo}
            parcelas={plano}
            onPrimeiroVencimentoChange={setPrimeiroVenc}
            onIntervaloChange={setIntervalo}
            onParcelasChange={setPlano}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar pagamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}