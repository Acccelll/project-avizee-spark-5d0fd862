import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { closeOnly } from "@/lib/overlay";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import ProdutoForm from "./ProdutoForm";

interface ProdutoFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  produtoId?: string;
  onClose: () => void;
  onSaved?: (produtoId: string) => void;
}

/**
 * Modal XL que embute o ProdutoForm em uma Dialog (full-screen em mobile).
 * Mantém o padrão dos demais cadastros (Clientes/Fornecedores) sem perder
 * abas, composição, fornecedores e dialogs auxiliares do form.
 */
export function ProdutoFormModal({ open, mode, produtoId, onClose, onSaved }: ProdutoFormModalProps) {
  const [dirty, setDirty] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const handleClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "Há alterações não salvas. Deseja sair mesmo assim?",
        confirmLabel: "Descartar",
        confirmVariant: "destructive",
      });
      if (!ok) return;
    }
    setDirty(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={closeOnly(handleClose)}>
        <DialogContent
          className={[
            "sm:max-w-5xl max-h-[92dvh] overflow-hidden p-0 flex flex-col",
            "max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-0 max-sm:m-0 max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-x-0",
            "[&>[aria-hidden='true']:first-child]:max-sm:hidden",
          ].join(" ")}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{mode === "create" ? "Novo Produto" : "Editar Produto"}</DialogTitle>
            <DialogDescription>Formulário de cadastro de produto.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
            {open && (
              <ProdutoForm
                embedded
                embeddedMode={mode}
                embeddedId={produtoId}
                onCancel={handleClose}
                onSaved={(id) => {
                  setDirty(false);
                  onSaved?.(id);
                  onClose();
                }}
                onDirtyChange={setDirty}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}

export default ProdutoFormModal;