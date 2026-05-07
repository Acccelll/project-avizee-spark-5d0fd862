import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Ban, CheckCircle2, Clock3, FileDown, FileEdit, HelpCircle, ShieldCheck, XCircle } from "lucide-react";

export type FiscalInternalStatus =
  | "rascunho"
  | "pendente"
  | "confirmada"
  | "importada"
  | "cancelada";

export type FiscalSefazStatus =
  | "nao_enviada"
  | "pendente_envio"
  | "em_processamento"
  | "aguardando_protocolo"
  | "autorizada"
  | "rejeitada"
  | "cancelada_sefaz"
  | "inutilizada"
  | "importada_externa";

export interface FiscalStatusVisual {
  label: string;
  classes: string;
  icon: LucideIcon;
  description: string;
}

const DEFAULT_INTERNAL: FiscalStatusVisual = {
  label: "Status desconhecido",
  classes: "bg-muted text-muted-foreground border-border",
  icon: HelpCircle,
  description: "Status interno não mapeado no front.",
};

const DEFAULT_SEFAZ: FiscalStatusVisual = {
  label: "Não enviado",
  classes: "bg-muted text-muted-foreground border-border",
  icon: Clock3,
  description: "Documento ainda não enviado para SEFAZ.",
};

export const fiscalInternalStatusMap: Record<string, FiscalStatusVisual> = {
  pendente: {
    label: "Pendente",
    classes: "bg-warning/10 text-warning border-warning/20",
    icon: Clock3,
    description: "Rascunho operacional. Sem impacto definitivo em estoque e financeiro.",
  },
  rascunho: {
    label: "Rascunho",
    classes: "bg-muted text-muted-foreground border-border",
    icon: FileEdit,
    description: "Documento em preparação no ERP.",
  },
  confirmada: {
    label: "Confirmada",
    classes: "bg-primary/10 text-primary border-primary/20",
    icon: CheckCircle2,
    description: "Confirmação operacional concluída. Estoque e financeiro já impactados.",
  },
  importada: {
    label: "Importada",
    classes: "bg-info/10 text-info border-info/20",
    icon: FileDown,
    description: "Nota importada de fonte externa.",
  },
  cancelada: {
    label: "Cancelada",
    classes: "bg-destructive/10 text-destructive border-destructive/20",
    icon: Ban,
    description: "Documento cancelado no ERP.",
  },
};

export const fiscalSefazStatusMap: Record<string, FiscalStatusVisual> = {
  nao_enviada: {
    label: "Não enviada",
    classes: "bg-muted text-muted-foreground border-border",
    icon: Clock3,
    description: "NF ainda não enviada para autorização na SEFAZ.",
  },
  pendente_envio: {
    label: "Pendente de envio",
    classes: "bg-warning/10 text-warning border-warning/20",
    icon: Clock3,
    description: "Documento pronto para envio, aguardando processamento.",
  },
  em_processamento: {
    label: "Em processamento",
    classes: "bg-info/10 text-info border-info/20",
    icon: Clock3,
    description: "SEFAZ recebeu e está processando a solicitação.",
  },
  aguardando_protocolo: {
    label: "Aguardando protocolo",
    classes: "bg-info/10 text-info border-info/20",
    icon: Clock3,
    description: "Lote enviado, aguardando número de protocolo da SEFAZ.",
  },
  autorizada: {
    label: "Autorizada",
    classes: "bg-success/10 text-success border-success/20",
    icon: ShieldCheck,
    description: "Autorizada eletronicamente pela SEFAZ.",
  },
  rejeitada: {
    label: "Rejeitada",
    classes: "bg-destructive/10 text-destructive border-destructive/20",
    icon: XCircle,
    description: "Rejeição retornada pela SEFAZ.",
  },
  cancelada_sefaz: {
    label: "Cancelada",
    classes: "bg-destructive/10 text-destructive border-destructive/20",
    icon: Ban,
    description: "Cancelamento aprovado na SEFAZ.",
  },
  inutilizada: {
    label: "Inutilizada",
    classes: "bg-muted text-muted-foreground border-border",
    icon: AlertTriangle,
    description: "Numeração inutilizada na SEFAZ.",
  },
  importada_externa: {
    label: "Importada externa",
    classes: "bg-info/10 text-info border-info/20",
    icon: FileDown,
    description: "Documento emitido fora do ERP e apenas importado.",
  },
};

export const fiscalInternalStatusOptions = [
  "rascunho",
  "pendente",
  "confirmada",
  "importada",
  "cancelada",
] as const;

export const fiscalSefazStatusOptions = [
  "nao_enviada",
  "pendente_envio",
  "em_processamento",
  "aguardando_protocolo",
  "autorizada",
  "rejeitada",
  "cancelada_sefaz",
  "inutilizada",
  "importada_externa",
] as const;

export function getFiscalInternalStatus(status?: string | null): FiscalStatusVisual {
  if (!status) return DEFAULT_INTERNAL;
  return fiscalInternalStatusMap[status] ?? { ...DEFAULT_INTERNAL, label: status };
}

export function getFiscalSefazStatus(status?: string | null): FiscalStatusVisual {
  if (!status) return DEFAULT_SEFAZ;
  return fiscalSefazStatusMap[status] ?? { ...DEFAULT_SEFAZ, label: status };
}

export function canConfirmFiscal(status?: string | null) {
  return status === "pendente" || status === "rascunho";
}

export function canEditFiscal(status?: string | null, statusSefaz?: string | null) {
  if (status === "cancelada") return false;
  if (statusSefaz && ["cancelada_sefaz", "inutilizada", "denegada"].includes(statusSefaz)) return false;
  return true;
}

export function isFiscalReadOnly(status?: string | null, statusSefaz?: string | null) {
  if (status === "cancelada") return true;
  if (statusSefaz && ["cancelada_sefaz", "inutilizada", "denegada"].includes(statusSefaz)) return true;
  return false;
}

export function isFiscalStructurallyLocked(status?: string | null, statusSefaz?: string | null) {
  if (status === "confirmada" || status === "importada") return true;
  if (statusSefaz === "autorizada" || statusSefaz === "em_processamento") return true;
  return false;
}

export function canEstornarFiscal(status?: string | null) {
  return status === "confirmada";
}

export function canDevolverFiscal(status?: string | null, tipo?: string | null, tipoOperacao?: string | null) {
  return status === "confirmada" && tipo === "saida" && (tipoOperacao || "normal") === "normal";
}
