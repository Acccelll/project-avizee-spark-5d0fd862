import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatWeightKg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { RotateCcw, X } from "lucide-react";

interface TotaisForm {
  valor_total: number;
  desconto: number;
  imposto_st: number;
  imposto_ipi: number;
  frete_valor: number;
  outras_despesas: number;
}

interface Props {
  totalProdutos: number;
  pesoTotal?: number;
  /** Quando definido, indica que o peso foi sobrescrito manualmente.
   *  Se `null`, usa o peso calculado (`pesoTotal`). */
  pesoOverride?: number | null;
  onPesoOverrideChange?: (value: number | null) => void;
  form: TotaisForm;
  onChange: (field: string, value: number) => void;
  /** Quando há cotação aplicada, exibe chip "Frete aplicado: ..." com botão Limpar. */
  freteSimulacaoId?: string | null;
  freteServico?: string | null;
  onClearFrete?: () => void;
}

export function OrcamentoTotaisCard({ totalProdutos, pesoTotal, pesoOverride, onPesoOverrideChange, form, onChange, freteSimulacaoId, freteServico, onClearFrete }: Props) {
  const valorTotal = totalProdutos - form.desconto + form.imposto_st + form.imposto_ipi + form.frete_valor + form.outras_despesas;
  const isOverridden = pesoOverride !== null && pesoOverride !== undefined;
  const pesoEffective = isOverridden ? Number(pesoOverride) : (pesoTotal ?? 0);

  return (
    <div className="bg-card rounded-xl border shadow-soft p-5">
      <h3 className="font-semibold text-foreground mb-4">Totais e Ajustes</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Total Produtos</Label>
          <div className="h-10 flex items-center px-3 bg-accent/30 rounded-md font-mono text-sm font-semibold">
            {formatCurrency(totalProdutos)}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">(-) Desconto</Label>
          <Input type="number" step="0.01" min="0" className="font-mono text-sm" value={form.desconto || ""} onChange={(e) => onChange("desconto", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">(+) Imposto S.T.</Label>
          <Input type="number" step="0.01" min="0" className="font-mono text-sm" value={form.imposto_st || ""} onChange={(e) => onChange("imposto_st", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">(+) Imposto IPI</Label>
          <Input type="number" step="0.01" min="0" className="font-mono text-sm" value={form.imposto_ipi || ""} onChange={(e) => onChange("imposto_ipi", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">(+) Frete</Label>
          <Input type="number" step="0.01" min="0" className="font-mono text-sm" value={form.frete_valor || ""} onChange={(e) => onChange("frete_valor", Number(e.target.value))} />
          {freteSimulacaoId && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-accent/30 rounded px-2 py-1">
              <span className="truncate">Aplicado: <strong className="text-foreground">{freteServico || "cotação"}</strong> — {formatCurrency(form.frete_valor)}</span>
              {onClearFrete && (
                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 ml-auto shrink-0" onClick={onClearFrete} aria-label="Limpar frete aplicado" title="Limpar frete aplicado">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">(+) Outras Despesas</Label>
          <Input type="number" step="0.01" min="0" className="font-mono text-sm" value={form.outras_despesas || ""} onChange={(e) => onChange("outras_despesas", Number(e.target.value))} />
        </div>
      </div>
      <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-4">
        {pesoTotal !== undefined && (
          onPesoOverrideChange ? (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Peso total (kg)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                className="h-9 w-28 font-mono text-sm"
                value={isOverridden ? pesoOverride ?? 0 : Number((pesoTotal ?? 0).toFixed(2))}
                onChange={(e) => onPesoOverrideChange(Number(e.target.value))}
                title={isOverridden ? `Calculado automaticamente: ${formatWeightKg(pesoTotal ?? 0)}` : undefined}
              />
              {isOverridden && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={`Recalcular (${formatWeightKg(pesoTotal ?? 0)})`}
                  onClick={() => onPesoOverrideChange(null)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              {isOverridden && (
                <span className="text-[10px] uppercase tracking-wide text-warning font-semibold">manual</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground font-mono">Peso total: <strong>{formatWeightKg(pesoEffective)}</strong></span>
          )
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">Total Final</span>
          <span className="text-2xl font-bold font-mono text-primary">{formatCurrency(valorTotal)}</span>
        </div>
      </div>
    </div>
  );
}
