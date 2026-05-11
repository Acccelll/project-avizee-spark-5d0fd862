import type { Lancamento } from "@/types/domain";

/**
 * Chip de criticidade temporal — exibido junto ao StatusBadge.
 * Resolve a pergunta "o que devo olhar primeiro?" sem depender só do `status`.
 * Reutilizado no grid de lançamentos e no header do drawer.
 */
export function PrazoChip({
  l,
  hoje,
  hojeStr,
  effectiveStatus,
}: {
  l: Pick<Lancamento, "data_vencimento">;
  hoje: Date;
  hojeStr: string;
  effectiveStatus: string;
}) {
  if (effectiveStatus === "pago" || effectiveStatus === "cancelado") return null;
  if (effectiveStatus === "vencido") {
    return <span className="inline-block text-[10px] font-medium px-1.5 py-0 leading-tight rounded bg-destructive/10 text-destructive">Vencido</span>;
  }
  if (effectiveStatus === "parcial") {
    return <span className="inline-block text-[10px] font-medium px-1.5 py-0 leading-tight rounded bg-info/10 text-info">Parcial</span>;
  }
  if (!l.data_vencimento) return null;
  if (l.data_vencimento === hojeStr) {
    return <span className="inline-block text-[10px] font-medium px-1.5 py-0 leading-tight rounded bg-warning/15 text-warning">Vence hoje</span>;
  }
  const [y, m, d] = l.data_vencimento.split("-").map(Number);
  const venc = new Date(y, m - 1, d);
  const dias = Math.floor((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (dias > 0 && dias <= 3) {
    return <span className="inline-block text-[10px] font-medium px-1.5 py-0 leading-tight rounded bg-warning/10 text-warning">≤{dias}d</span>;
  }
  return null;
}