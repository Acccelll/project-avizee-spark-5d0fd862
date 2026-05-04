/**
 * Pure calculation helpers and shared label maps for the Comercial module.
 *
 * All functions are side-effect-free so they can be unit-tested without mocks.
 */

/** Human-readable labels for payment methods used across Orcamento / OrdemVenda views. */
export const pagamentoLabels: Record<string, string> = {
  a_vista: "À Vista",
  a_prazo: "A Prazo",
  pix: "Pix",
  boleto: "Boleto/DDA",
  boleto_dda: "Boleto/DDA",
  cartao: "Cartão de Crédito",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  cheque: "Cheque",
  transferencia: "Transferência",
  cobranca_automatica: "Cobrança Automática",
  debito_automatico: "Débito Automático",
  outros: "Outros",
};

/** Human-readable labels for freight responsibility types. */
export const freteTipoLabels: Record<string, string> = {
  cif: "CIF (por conta do remetente)",
  fob: "FOB (por conta do destinatário)",
  terceiros: "Por conta de terceiros",
  sem_frete: "Sem frete",
};

export interface ItemPedido {
  valor_unitario: number;
  quantidade: number;
  desconto?: number;
}

/**
 * Calculates the total value of an order by summing all items.
 * Each item total is: valor_unitario * quantidade * (1 - desconto/100)
 */
export function calcularTotalPedido(itens: ItemPedido[]): number {
  return itens.reduce((total, item) => {
    const desconto = item.desconto ?? 0;
    const itemTotal = item.valor_unitario * item.quantidade * (1 - desconto / 100);
    return total + itemTotal;
  }, 0);
}

/**
 * Applies a percentage discount to a value.
 * Returns the discounted value (value * (1 - discount/100)).
 */
export function aplicarDesconto(valor: number, desconto: number): number {
  if (desconto < 0 || desconto > 100) {
    throw new Error("Desconto deve ser entre 0 e 100");
  }
  return valor * (1 - desconto / 100);
}

/**
 * Calculates the commission amount for a given value and commission rate.
 * Returns: valor * (percentual / 100)
 */
export function calcularComissao(valor: number, percentual: number): number {
  if (percentual < 0 || percentual > 100) {
    throw new Error("Percentual de comissão deve ser entre 0 e 100");
  }
  return valor * (percentual / 100);
}

/**
 * Calculates the profit margin percentage.
 * margem = ((precoVenda - custoTotal) / precoVenda) * 100
 * Returns 0 if precoVenda is 0.
 */
export function calcularMargem(precoVenda: number, custoTotal: number): number {
  if (precoVenda === 0) return 0;
  return ((precoVenda - custoTotal) / precoVenda) * 100;
}
