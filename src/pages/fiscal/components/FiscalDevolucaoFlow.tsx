import { forwardRef, useImperativeHandle, useState } from "react";
import { DevolucaoDialog, type NfItemDevolver, type NfSimples } from "@/components/fiscal/DevolucaoDialog";
import { listNotaFiscalItensCompletos } from "@/services/fiscal.service";
import type { NotaFiscal } from "@/types/domain";

interface NfItemRowMin {
  id: string;
  produto_id?: string;
  produtos?: { nome: string } | null;
  quantidade: number;
  valor_unitario: number;
}

export interface FiscalDevolucaoFlowHandle {
  open: (nf: NotaFiscal) => Promise<void>;
}

interface Props {
  /** Disparado após uma devolução ser gerada com sucesso (refetch da lista). */
  onSuccess: () => void;
}

/**
 * Encapsula o `DevolucaoDialog` + carga inicial dos itens da NF de origem.
 * Exposto via ref imperativa: `flowRef.current.open(nf)`.
 */
export const FiscalDevolucaoFlow = forwardRef<FiscalDevolucaoFlowHandle, Props>(({ onSuccess }, ref) => {
  const [open, setOpen] = useState(false);
  const [nf, setNf] = useState<NfSimples | null>(null);
  const [itens, setItens] = useState<NfItemDevolver[]>([]);

  useImperativeHandle(ref, () => ({
    open: async (n: NotaFiscal) => {
      const rows = await listNotaFiscalItensCompletos(n.id).catch(() => []);
      setNf(n as unknown as NfSimples);
      setItens(
        (rows as unknown as NfItemRowMin[]).map((i) => ({
          id: i.id,
          produto_id: i.produto_id,
          nome: i.produtos?.nome || "—",
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
          qtd_devolver: 0,
        })),
      );
      setOpen(true);
    },
  }), []);

  return (
    <DevolucaoDialog
      open={open}
      onOpenChange={setOpen}
      devolucaoNF={nf}
      devolucaoItens={itens}
      setDevolucaoItens={setItens}
      onSuccess={onSuccess}
    />
  );
});

FiscalDevolucaoFlow.displayName = "FiscalDevolucaoFlow";
