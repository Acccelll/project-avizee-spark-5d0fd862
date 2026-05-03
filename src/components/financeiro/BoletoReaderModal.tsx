import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { parseBoleto, formatLinhaDigitavel } from "@/lib/boleto";
import { formatCurrency } from "@/lib/format";
import { Barcode } from "lucide-react";

export interface BoletoResult {
  linhaDigitavel: string;
  valor: number;
  vencimento: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (result: BoletoResult) => void;
}

/**
 * Leitor manual de linha digitável de boleto (DDA MVP).
 * Não consulta banco — apenas extrai valor/vencimento codificados.
 */
export function BoletoReaderModal({ open, onClose, onApply }: Props) {
  const [raw, setRaw] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [vencimento, setVencimento] = useState<string>("");
  const [parsed, setParsed] = useState(false);

  const handleParse = () => {
    const r = parseBoleto(raw);
    if (!r) {
      toast.error("Linha digitável inválida (use 47 ou 48 dígitos)");
      return;
    }
    setValor(r.valor || 0);
    setVencimento(r.vencimento || "");
    setParsed(true);
    if (r.tipo === "arrecadacao") {
      toast.info("Arrecadação detectada — confira o vencimento manualmente");
    } else {
      toast.success("Boleto lido");
    }
  };

  const handleApply = () => {
    if (!valor || !vencimento) {
      toast.error("Preencha valor e vencimento");
      return;
    }
    onApply({
      linhaDigitavel: formatLinhaDigitavel(raw),
      valor,
      vencimento,
    });
    handleClose();
  };

  const handleClose = () => {
    setRaw("");
    setValor(0);
    setVencimento("");
    setParsed(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="w-4 h-4" /> Ler boleto (DDA manual)
          </DialogTitle>
          <DialogDescription>
            Cole a linha digitável (47 dígitos para boleto bancário, 48 para arrecadação).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Linha digitável</Label>
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
              rows={2}
              className="font-mono text-sm"
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleParse}>
              Interpretar
            </Button>
          </div>
          {parsed && (
            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 bg-muted/30">
              <div className="space-y-1">
                <Label className="text-xs">Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(Number(e.target.value))}
                />
                <p className="text-[11px] text-muted-foreground">{formatCurrency(valor || 0)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vencimento</Label>
                <Input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleApply} disabled={!parsed}>
            Aplicar ao lançamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}