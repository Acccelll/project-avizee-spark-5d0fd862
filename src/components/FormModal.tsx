import { ReactNode, type ComponentType } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Circle } from "lucide-react";
import { closeOnly } from "@/lib/overlay";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

export interface FormModalMetaItem {
  icon?: ComponentType<{ className?: string }>;
  label: ReactNode;
}

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Modo do formulário — controla chip "Novo" e hint inicial. */
  mode?: "create" | "edit";
  /** Hint exibido no topo do conteúdo apenas no modo create. ReactNode ou string. */
  createHint?: ReactNode;
  /** Identificador secundário (CNPJ, SKU, código). Renderizado em fonte mono ao lado do título. */
  identifier?: ReactNode;
  /** Badge de status (use <StatusBadge />) renderizado ao lado do título. */
  status?: ReactNode;
  /** Linha de metadados abaixo do título (datas, classificação, etc). */
  meta?: FormModalMetaItem[];
  /** Ações rápidas no canto superior direito do header (antes do botão fechar). */
  headerActions?: ReactNode;
  /** Indica alterações não salvas — exibe pílula no meta row. */
  isDirty?: boolean;
  /** Quando true e isDirty=true, intercepta ESC/click-outside pedindo confirmação antes de fechar. */
  confirmOnDirty?: boolean;
  /** Footer sticky (use <FormModalFooter />). */
  footer?: ReactNode;
}

const sizeMap = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
};

export function FormModal({
  open,
  onClose,
  title,
  children,
  size = "md",
  mode,
  createHint,
  identifier,
  status,
  meta,
  headerActions,
  isDirty,
  confirmOnDirty,
  footer,
}: FormModalProps) {
  const isCreate = mode === "create";
  const hasMeta = (meta && meta.length > 0) || isDirty;
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const handleClose = async () => {
    if (confirmOnDirty && isDirty) {
      const ok = await confirm();
      if (!ok) return;
    }
    onClose();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={closeOnly(handleClose)}>
      <DialogContent
        className={cn(
          sizeMap[size],
          "max-h-[90dvh] overflow-hidden p-0 flex flex-col",
          "max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-0 max-sm:m-0 max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-x-0",
          // FormModal vai full-screen em mobile — esconde o drag handle do
          // bottom-sheet (DialogContent default), pois aqui não é arrastável.
          "[&>[aria-hidden='true']:first-child]:max-sm:hidden",
        )}
      >
        <DialogHeader className="shrink-0 bg-background px-6 pt-5 pb-3.5 pr-12 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold leading-tight truncate">
                {title}
              </DialogTitle>
              {isCreate && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-success bg-success/10 border border-success/30 rounded px-1.5 py-0.5">
                  Novo
                </span>
              )}
              {identifier && (
                <span className="text-xs font-mono text-muted-foreground bg-muted/60 border border-border/60 rounded px-1.5 py-0.5 whitespace-nowrap max-sm:basis-full max-sm:w-full">
                  {identifier}
                </span>
              )}
              {status && <span className="inline-flex">{status}</span>}
            </div>
            {headerActions && (
              <div className="flex items-center gap-1.5 shrink-0 mr-7">{headerActions}</div>
            )}
          </div>
          <DialogDescription className="sr-only">Formulário para {title}</DialogDescription>
          {hasMeta && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {meta?.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <span key={idx} className="inline-flex items-center gap-1.5">
                    {Icon && <Icon className="h-3.5 w-3.5 opacity-70" />}
                    <span>{item.label}</span>
                    {idx < (meta?.length ?? 0) - 1 && <span className="opacity-40">·</span>}
                  </span>
                );
              })}
              {isDirty && (
                <span className="inline-flex items-center gap-1.5 text-warning-foreground">
                  {meta && meta.length > 0 && <span className="opacity-40">·</span>}
                  <Circle className="h-2 w-2 fill-warning text-warning" />
                  <span className="font-medium">Alterações não salvas</span>
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 max-sm:pb-24">
          {isCreate && createHint && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground/80 flex items-start gap-2">
              <span aria-hidden="true">💡</span>
              <span className="flex-1">{createHint}</span>
            </div>
          )}
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3 max-sm:px-4 max-sm:py-2 max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))] max-sm:shadow-[0_-4px_12px_-4px_hsl(var(--background))]">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
    {confirmDialog}
    </>
  );
}
