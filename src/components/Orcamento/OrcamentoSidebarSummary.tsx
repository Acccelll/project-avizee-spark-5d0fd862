import { Weight } from "lucide-react";
import { formatCurrency, formatDate, formatWeightKg } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  qtdItens: number;
  totalProdutos: number;
  freteValor: number;
  valorTotal: number;
  pesoTotal?: number;
  validade?: string;
}

export function OrcamentoSidebarSummary({
  qtdItens,
  totalProdutos, freteValor, valorTotal,
  pesoTotal, validade,
}: Props) {
  const isExpired = validade ? new Date(validade) < new Date(new Date().toDateString()) : false;

  return (
    <div className="bg-card rounded-xl border shadow-soft p-4 sticky top-6">
      <h3 className="font-semibold text-foreground mb-3 text-sm">Resumo</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Itens</span>
          <span className="font-mono">{qtdItens}</span>
        </div>
        {(pesoTotal !== undefined && pesoTotal > 0) && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1">
              <Weight className="h-3.5 w-3.5" />Peso
            </span>
            <span className="font-mono text-xs">{formatWeightKg(pesoTotal)}</span>
          </div>
        )}
        {validade && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Validade</span>
            <span className={cn("font-mono text-xs", isExpired ? "text-destructive font-semibold" : "text-foreground")}>
              {formatDate(validade)}{isExpired ? " ⚠" : ""}
            </span>
          </div>
        )}
        <div className="border-t pt-2 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Produtos</span>
            <span className="font-mono">{formatCurrency(totalProdutos)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Frete</span>
            <span className="font-mono">{formatCurrency(freteValor)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t">
            <span className="font-semibold text-sm">Total</span>
            <span className="font-mono font-bold text-lg text-primary">{formatCurrency(valorTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
