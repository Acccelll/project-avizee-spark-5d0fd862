import type { LucideIcon } from "lucide-react";
import {
  AlertOctagon,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  BadgeCheck,
  ClipboardCheck,
  PackageMinus,
  RotateCcw,
  ShieldAlert,
  Undo2,
} from "lucide-react";

export const tipoMovConfig: Record<string, { label: string; icon: LucideIcon; className: string; direction: "in" | "out" | "neutral"; critical?: boolean }> = {
  entrada: { label: "Entrada", icon: ArrowUpCircle, className: "bg-success/10 text-success border-success/20", direction: "in" },
  saida: { label: "Saída", icon: ArrowDownCircle, className: "bg-warning/10 text-warning border-warning/30", direction: "out" },
  ajuste: { label: "Ajuste Manual", icon: ShieldAlert, className: "bg-warning/10 text-warning border-warning/20", direction: "neutral", critical: true },
  reserva: { label: "Reserva", icon: PackageMinus, className: "bg-info/10 text-info border-info/30", direction: "out" },
  liberacao_reserva: { label: "Liberação de Reserva", icon: BadgeCheck, className: "bg-info/10 text-info border-info/30", direction: "in" },
  estorno: { label: "Estorno", icon: Undo2, className: "bg-accent/10 text-accent-foreground border-accent/30", direction: "neutral" },
  inventario: { label: "Inventário", icon: ClipboardCheck, className: "bg-accent/10 text-accent-foreground border-accent/30", direction: "neutral" },
  perda_avaria: { label: "Perda / Avaria", icon: AlertOctagon, className: "bg-destructive/10 text-destructive border-destructive/20", direction: "out", critical: true },
  transferencia: { label: "Transferência", icon: ArrowLeftRight, className: "bg-muted text-muted-foreground border-border", direction: "neutral" },
};

export const origemConfig: Record<string, { label: string; className: string; emphasis?: "low" | "high" }> = {
  manual: { label: "Manual", className: "bg-warning/10 text-warning border-warning/30", emphasis: "high" },
  compra: { label: "Compra", className: "bg-primary/10 text-primary border-primary/20" },
  pedido_compra: { label: "Pedido de Compra", className: "bg-primary/10 text-primary border-primary/20" },
  venda: { label: "Venda", className: "bg-success/10 text-success border-success/20" },
  pedido: { label: "Pedido de Venda", className: "bg-info/10 text-info border-info/30" },
  fiscal: { label: "Fiscal", className: "bg-accent/10 text-accent-foreground border-accent/30" },
  nota_fiscal: { label: "Nota Fiscal", className: "bg-accent/10 text-accent-foreground border-accent/30" },
  ajuste: { label: "Ajuste", className: "bg-warning/10 text-warning border-warning/20", emphasis: "high" },
  estorno_fiscal: { label: "Estorno Fiscal", className: "bg-muted text-muted-foreground border-border" },
};

export function getTipoMovConfig(tipo: string) {
  return tipoMovConfig[tipo] ?? {
    label: tipo.replaceAll("_", " "),
    icon: RotateCcw,
    className: "bg-muted text-muted-foreground border-border",
    direction: "neutral" as const,
  };
}

export function getOrigemConfig(origem: string | null | undefined) {
  return getOrigemConfigFull(origem, null);
}

/**
 * Variante que considera o motivo para inferir origem "Saldo inicial"
 * quando não há `documento_tipo` registrado (ex.: importação inicial).
 */
export function getOrigemConfigFull(
  origem: string | null | undefined,
  motivo: string | null | undefined,
) {
  if (!origem) {
    const m = String(motivo ?? "").trim().toLowerCase();
    if (m.startsWith("saldo inicial") || m.includes("importação inicial") || m.includes("importacao inicial")) {
      return {
        label: "Saldo inicial",
        className: "bg-info/10 text-info border-info/30",
        emphasis: "low" as const,
      };
    }
    return {
      label: "Sem origem",
      className: "bg-muted text-muted-foreground border-border",
      emphasis: "low" as const,
    };
  }
  return origemConfig[origem] ?? {
    label: origem.replaceAll("_", " "),
    className: "bg-muted text-muted-foreground border-border",
    emphasis: "low" as const,
  };
}
