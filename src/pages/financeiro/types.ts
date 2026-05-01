import type { ContaBancaria } from "@/types/domain";
import type { CartaoCredito } from "@/services/cartoesCredito.service";

export interface ContaContabil {
  id: string;
  codigo: string;
  descricao: string;
}

export interface LancamentoForm {
  tipo: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string;
  status: string;
  forma_pagamento: string;
  banco: string;
  cartao: string;
  cliente_id: string;
  fornecedor_id: string;
  conta_bancaria_id: string;
  conta_contabil_id: string;
  observacoes: string;
  gerar_parcelas: boolean;
  num_parcelas: number;
  intervalo_dias: number;
}

export const emptyLancamentoForm: LancamentoForm = {
  tipo: "receber",
  descricao: "",
  valor: 0,
  data_vencimento: new Date().toISOString().split("T")[0],
  data_pagamento: "",
  status: "aberto",
  forma_pagamento: "",
  banco: "",
  cartao: "",
  cliente_id: "",
  fornecedor_id: "",
  conta_bancaria_id: "",
  conta_contabil_id: "",
  observacoes: "",
  gerar_parcelas: false,
  num_parcelas: 2,
  intervalo_dias: 30,
};

export interface FinanceiroAuxiliaresState {
  contasBancarias: ContaBancaria[];
  contasContabeis: ContaContabil[];
  cartoes: CartaoCredito[];
}
