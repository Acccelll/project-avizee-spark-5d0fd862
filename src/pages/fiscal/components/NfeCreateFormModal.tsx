import { FormModal } from "@/components/FormModal";
import { Button } from "@/components/ui/button";
import { type GridItem } from "@/components/ui/ItemsGrid";
import { type ParcelaPlano } from "@/pages/fiscal/components/ParcelasFiscalEditor";
import { NfeFormBody } from "@/pages/fiscal/components/NfeFormBody";
import type { CartaoCredito } from "@/services/cartoesCredito.service";

export interface FornecedorRefMin { id: string; nome_razao_social: string; cpf_cnpj: string | null; }
export interface ClienteRefMin { id: string; nome_razao_social: string; cpf_cnpj: string | null; }
export interface ProdutoRefMin { id: string; nome: string; sku: string | null; codigo_interno: string | null; unidade_medida: string | null; variacoes: string[] | null; }
export interface OrdemVendaRefMin { id: string; numero: string; clientes?: { nome_razao_social: string } | null; }
export interface ContaContabilRefMin { id: string; codigo: string; descricao: string; }

/**
 * Modal de criação (mode="create") da NF — extraído in-place de `Fiscal.tsx`
 * como parte da decomposição do god-component (Onda 7). A lógica de estado
 * permanece no pai; este wrapper apenas isola a marcação JSX.
 */
export interface NfeCreateFormModalProps {
  open: boolean;
  onClose: () => void;
  form: Record<string, string | number | boolean>;
  setForm: (next: Record<string, string | number | boolean>) => void;
  items: GridItem[];
  setItems: (items: GridItem[]) => void;
  itemContaContabil: Record<number, string>;
  setItemContaContabil: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  parcelas: number;
  setParcelas: (n: number) => void;
  primeiroVencimento: string;
  setPrimeiroVencimento: (v: string) => void;
  intervaloDias: number;
  setIntervaloDias: (n: number) => void;
  parcelasPlano: ParcelaPlano[];
  setParcelasPlano: (p: ParcelaPlano[]) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  fornecedores: FornecedorRefMin[];
  clientes: ClienteRefMin[];
  produtos: ProdutoRefMin[];
  ordensVenda: OrdemVendaRefMin[];
  contasContabeis: ContaContabilRefMin[];
  cartoes: CartaoCredito[];
  valorProdutos: number;
  totalImpostos: number;
  totalNF: number;
  xmlOriginInfo: { fornecedorNome: string } | null;
  traducaoLinhasCount: number;
  onAbrirTraducao: () => void;
  onCriarProdutoQuick: () => void;
}

export function NfeCreateFormModal(props: NfeCreateFormModalProps) {
  const {
    open, onClose, saving, onSubmit, ...bodyProps
  } = props;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Nova Nota Fiscal"
      size="xl"
      mode="create"
      createHint="Importe um XML para preencher automaticamente, ou comece definindo o tipo (entrada/saída) e o emitente."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <NfeFormBody {...bodyProps} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </FormModal>
  );
}