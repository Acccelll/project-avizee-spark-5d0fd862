import { useState, useEffect } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import {
  permanentDeleteRecord,
  type PermanentDeleteTable,
} from "@/services/fiscal.service";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tabela do Supabase (ex: "funcionarios", "transportadoras"). */
  table: PermanentDeleteTable;
  id: string;
  /** Nome legível usado no título e na descrição (ex: "transportadora"). */
  entityLabel: string;
  /** Identificação do registro (nome / descrição) usada na confirmação. */
  recordName: string;
  /** Texto extra opcional (ex: dependências detectadas) acima do campo. */
  warning?: string;
  /** Lista de efeitos colaterais (filhos que serão removidos junto). */
  sideEffects?: string[];
  /** Chamado após exclusão bem-sucedida. */
  onDeleted: () => void;
}

/**
 * Diálogo de exclusão definitiva (hard delete).
 *
 * Por contrato (ver mem://produto/excluir-vs-inativar-vs-cancelar):
 *  - Só deve ser oferecido para admins.
 *  - Só deve aparecer quando o registro já está inativo.
 *  - Exige digitação literal de "EXCLUIR" para confirmar.
 *  - Falhas de FK são traduzidas para mensagem amigável.
 */
export function PermanentDeleteDialog({
  open,
  onClose,
  table,
  id,
  entityLabel,
  recordName,
  warning,
  sideEffects,
  onDeleted,
}: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) setConfirmText("");
  }, [open]);

  const canConfirm = confirmText.trim().toUpperCase() === "EXCLUIR";

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      loading={deleting}
      confirmDisabled={!canConfirm}
      confirmLabel="Excluir definitivamente"
      title={`Excluir ${entityLabel} permanentemente`}
      description={`Esta ação é irreversível. O registro "${recordName}" será removido em definitivo do banco de dados e não poderá ser recuperado.`}
      onConfirm={async () => {
        setDeleting(true);
        try {
          try {
            await permanentDeleteRecord(table, id);
          } catch (error) {
            // 23503 = foreign_key_violation
            const code = (error as { code?: string }).code;
            if (code === "42501") {
              throw new Error(
                "Apenas administradores podem executar exclusão definitiva.",
              );
            }
            if (code === "23503") {
              throw new Error(
                "Não é possível excluir: o registro está referenciado em outras tabelas (histórico, vínculos). Mantenha-o inativo.",
              );
            }
            // Trigger fiscal de proteção (notas_fiscais): só permite DELETE em rascunho/nao_enviada.
            const msg = (error as { message?: string }).message || "";
            if (table === "notas_fiscais" && /DELETE bloqueado/i.test(msg)) {
              throw new Error(
                "Exclusão bloqueada por exigência fiscal: notas que já foram canceladas, inutilizadas ou enviadas à SEFAZ devem ser preservadas no banco. Apenas rascunhos não enviados podem ser removidos definitivamente.",
              );
            }
            throw error;
          }
          toast.success(`${entityLabel.charAt(0).toUpperCase()}${entityLabel.slice(1)} excluída(o) permanentemente.`);
          onClose();
          onDeleted();
        } catch (err) {
          notifyError(err);
        } finally {
          setDeleting(false);
        }
      }}
    >
      <div className="space-y-3 pt-1">
        {warning && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
            {warning}
          </p>
        )}
        {sideEffects && sideEffects.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
            <p className="font-medium text-destructive mb-1">
              Também serão removidos em definitivo:
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-foreground/90">
              {sideEffects.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete-input" className="text-xs">
            Digite <span className="font-mono font-semibold">EXCLUIR</span> para confirmar:
          </Label>
          <Input
            id="confirm-delete-input"
            autoComplete="off"
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="EXCLUIR"
            className="font-mono"
            disabled={deleting}
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}