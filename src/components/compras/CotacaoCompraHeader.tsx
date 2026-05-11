/**
 * Subcomponente: cabeçalho do drawer de cotação com estatísticas e stepper.
 */
import { formatCurrency } from '@/lib/format';
import { PackageSearch, Users2, TrendingDown, X } from 'lucide-react';
import { FLOW_STEPS, getFlowStepIndex } from './cotacaoCompraTypes';
import { canonicalCotacaoStatus } from './comprasStatus';
import type { CotacaoCompra, CotacaoItem, Proposta } from './cotacaoCompraTypes';

interface DrawerStats {
  uniqueSuppliers: number;
  bestTotal: number;
  selectedPropostas: Proposta[];
  selectedSupplierName: string | null;
  allItemsHaveSelected: boolean;
}

interface CotacaoCompraHeaderProps {
  selected: CotacaoCompra;
  viewItems: CotacaoItem[];
  viewPropostas: Proposta[];
  drawerStats: DrawerStats;
}

export function CotacaoCompraHeaderSummary({ selected, viewItems, drawerStats }: CotacaoCompraHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center justify-center gap-1">
            <PackageSearch className="h-3 w-3" /> Itens
          </p>
          <p className="text-xl font-bold font-mono mt-0.5">{viewItems.length}</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center justify-center gap-1">
            <Users2 className="h-3 w-3" /> Fornecedores
          </p>
          <p className="text-xl font-bold font-mono mt-0.5">{drawerStats.uniqueSuppliers}</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">com proposta</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center justify-center gap-1">
            <TrendingDown className="h-3 w-3" /> Melhor Total
          </p>
          {drawerStats.bestTotal > 0 ? (
            <p className="text-sm font-bold font-mono mt-0.5 text-success dark:text-success leading-tight">
              {formatCurrency(drawerStats.bestTotal)}
            </p>
          ) : (
            <p className="text-[11px] mt-1 text-muted-foreground leading-tight">Aguardando propostas</p>
          )}
        </div>
      </div>
      {/* Flow stepper */}
      {selected.status !== "rejeitada" && selected.status !== "cancelada" ? (
        <div className="rounded-lg bg-muted/30 border px-3 py-2">
          <div className="flex items-center">
            {FLOW_STEPS.map((step, i) => {
              const currentIdx = getFlowStepIndex(selected.status);
              const stepIdx = getFlowStepIndex(step.key);
              const isActive = canonicalCotacaoStatus(selected.status) === step.key;
              const isPast = currentIdx > stepIdx;
              return (
                <div key={step.key} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center gap-0.5 min-w-0">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${isActive ? "bg-primary" : isPast ? "bg-success" : "bg-muted-foreground/25"}`} />
                    <span className={`text-[9px] font-medium truncate max-w-[48px] ${isActive ? "text-primary" : isPast ? "text-success dark:text-success" : "text-muted-foreground/50"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < FLOW_STEPS.length - 1 && (
                    <div className={`flex-1 h-px mx-1 ${isPast || isActive ? "bg-success/40" : "bg-muted-foreground/15"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-2 ${selected.status === "rejeitada" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-muted text-muted-foreground"}`}>
          <X className="h-3.5 w-3.5" />
          {selected.status === "rejeitada" ? "Cotação rejeitada — processo encerrado" : "Cotação cancelada"}
        </div>
      )}
    </div>
  );
}
