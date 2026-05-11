import { CheckCircle2, Circle, ArrowRight, FileText, Receipt, FileOutput } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlowStep {
  key: "orcamento" | "pedido" | "nf";
  label: string;
  /** Rótulo curto exibido em telas estreitas (<sm). Default: `label`. */
  shortLabel?: string;
  hint?: string;
  done: boolean;
  current?: boolean;
  onClick?: () => void;
}

const ICONS = {
  orcamento: FileText,
  pedido: Receipt,
  nf: FileOutput,
} as const;

/**
 * Timeline visual do ciclo Comercial: Orçamento → Pedido de Venda → Nota Fiscal.
 * Deixa explícito que "Converter em Pedido" NÃO emite NF, apenas avança a etapa.
 */
export function ComercialFlowTimeline({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
      <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-2">
        Fluxo Comercial
      </p>
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
        {steps.map((step, i) => {
          const Icon = ICONS[step.key];
          const Status = step.done ? CheckCircle2 : Circle;
          const clickable = !!step.onClick;
          return (
            <div key={step.key} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={step.onClick}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
                  step.done
                    ? "border-success/40 bg-success/10 text-success"
                    : step.current
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/40 bg-background text-muted-foreground",
                  clickable && "hover:bg-accent cursor-pointer",
                  !clickable && "cursor-default",
                )}
                title={step.hint}
              >
                <Status className="h-3.5 w-3.5" />
                <Icon className="h-3.5 w-3.5" />
                <span className="font-medium whitespace-nowrap hidden sm:inline">
                  {step.label}
                </span>
                <span className="font-medium whitespace-nowrap sm:hidden">
                  {step.shortLabel ?? step.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}