import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormModalFooterProps {
  saving?: boolean;
  isDirty?: boolean;
  onCancel: () => void;
  onSubmit?: () => void;
  /** Se o formulário usa <form onSubmit>, deixe true para o botão primário ser type=submit. */
  submitAsForm?: boolean;
  /** Form id, se o botão precisar acionar submit de um form que está fora do footer. */
  formId?: string;
  primaryLabel?: string;
  cancelLabel?: string;
  /** "create" => "Salvar" / "edit" => "Salvar Alterações". Sobrescrito por primaryLabel. */
  mode?: "create" | "edit";
  /** Desabilita o botão primário (além de saving). */
  disabled?: boolean;
  /** Tooltip / título nativo quando primário desabilitado. */
  disabledReason?: string;
  /** Quando passado e mode="create", renderiza botão "Salvar e criar outro". */
  onSaveAndNew?: () => void;
  /** Label do botão "Salvar e criar outro". */
  saveAndNewLabel?: string;
  secondaryActions?: ReactNode;
  className?: string;
  /** Quando true, "Cancelar" vira link discreto no mobile (reduz altura do footer). */
  cancelAsLink?: boolean;
}

export function FormModalFooter({
  saving = false,
  isDirty = false,
  onCancel,
  onSubmit,
  submitAsForm = false,
  formId,
  primaryLabel,
  cancelLabel = "Cancelar",
  mode = "edit",
  disabled = false,
  disabledReason,
  onSaveAndNew,
  saveAndNewLabel = "Salvar e criar outro",
  secondaryActions,
  className,
  cancelAsLink = false,
}: FormModalFooterProps) {
  const label = primaryLabel ?? (mode === "create" ? "Salvar" : "Salvar Alterações");
  const noChanges = mode === "edit" && !isDirty && !disabled;
  const primaryDisabled = saving || disabled || noChanges;
  const effectiveDisabledReason =
    disabledReason ?? (noChanges ? "Sem alterações para salvar" : undefined);
  const showSaveAndNew = mode === "create" && !!onSaveAndNew;

  const hasStatus = (isDirty && !saving) || saving;

  return (
    <div
      className={cn(
        "flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3",
        hasStatus ? "sm:justify-between" : "sm:justify-end",
        className,
      )}
    >
      {hasStatus && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0 max-sm:px-1">
          {isDirty && !saving && (
            <span className="inline-flex items-center gap-1.5">
              <Circle className="h-2 w-2 fill-warning text-warning" />
              <span className="font-medium">Alterações não salvas</span>
            </span>
          )}
          {saving && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Salvando...</span>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 max-sm:w-full sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap sm:justify-end">
        {secondaryActions}
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          aria-label={cancelLabel}
          className={cn(
            cancelAsLink
              ? "max-sm:w-full max-sm:h-8 max-sm:text-xs max-sm:border-0 max-sm:bg-transparent max-sm:underline-offset-4 max-sm:hover:underline max-sm:text-muted-foreground"
              : "max-sm:w-full max-sm:h-11",
          )}
        >
          {cancelLabel}
        </Button>
        {showSaveAndNew && (
          <Button
            type="button"
            variant="secondary"
            onClick={onSaveAndNew}
            disabled={primaryDisabled}
            title={primaryDisabled ? effectiveDisabledReason : undefined}
            className="max-sm:w-full max-sm:h-11"
          >
            {saveAndNewLabel}
          </Button>
        )}
        <Button
          type={submitAsForm ? "submit" : "button"}
          form={formId}
          onClick={submitAsForm ? undefined : onSubmit}
          disabled={primaryDisabled}
          title={primaryDisabled ? effectiveDisabledReason : undefined}
          className="max-sm:w-full max-sm:h-11"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {label}
        </Button>
      </div>
    </div>
  );
}
