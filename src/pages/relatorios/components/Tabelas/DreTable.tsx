/**
 * DreTable — renders the DRE (Demonstrativo de Resultado) in its structured
 * accounting layout: headers, subtotals, deductions, and final result.
 */

import { formatCurrency } from "@/lib/format";
import type { DreRow } from "@/types/relatorios";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface DreTableProps {
  rows: DreRow[];
}

export function DreTable({ rows }: DreTableProps) {
  const isMobile = useIsMobile();

  if (!rows.length) {
    return (
      <div className="p-6 text-sm text-muted-foreground text-center">
        Sem dados para o período selecionado.
      </div>
    );
  }

  // Onda 9.3 (MB-04) — em mobile renderizamos cards em vez de tabela larga.
  if (isMobile) {
    return (
      <div className="p-2 space-y-1.5">
        {rows.map((row, i) => {
          const tone =
            row.tipo === "header"
              ? "bg-primary/5 font-bold"
              : row.tipo === "subtotal"
              ? "bg-muted/50 font-semibold border"
              : row.tipo === "resultado"
              ? "bg-primary/10 font-bold border-2 border-primary/30"
              : "border";
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2.5 flex items-center justify-between gap-3",
                tone,
                row.tipo !== "header" && row.tipo !== "subtotal" && row.tipo !== "resultado" && "text-muted-foreground",
              )}
            >
              <span className={cn("text-sm leading-snug", row.tipo === "deducao" && "pl-3")}>
                {row.linha}
              </span>
              <span
                className={cn(
                  "text-sm font-mono tabular-nums whitespace-nowrap flex-shrink-0",
                  row.valor < 0 && "text-destructive",
                  row.tipo === "resultado" && "text-base",
                )}
              >
                {formatCurrency(row.valor)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4">
      <table className="w-full text-sm tabular-nums">
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={
                row.tipo === "header"
                  ? "bg-primary/5 font-bold"
                  : row.tipo === "subtotal"
                  ? "bg-muted/50 font-semibold border-t"
                  : row.tipo === "resultado"
                  ? "bg-primary/10 font-bold text-base sm:text-lg border-t-2 border-primary/30"
                  : "text-muted-foreground"
              }
            >
              <td
                className={`px-2 sm:px-4 py-2.5 sm:py-3 ${
                  row.tipo === "deducao" ? "pl-8" : ""
                }`}
              >
                {row.linha}
              </td>
              <td
                className={`px-2 sm:px-4 py-2.5 sm:py-3 text-right font-mono whitespace-nowrap ${
                  row.valor < 0 ? "text-destructive" : ""
                }`}
              >
                {formatCurrency(row.valor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
