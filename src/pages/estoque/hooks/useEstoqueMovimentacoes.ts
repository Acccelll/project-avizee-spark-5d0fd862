import { useQuery } from "@tanstack/react-query";
import {
  fetchMovimentacoes,
  fetchMovimentacoesPorProduto,
  type EstoqueMovimento,
} from "@/services/estoque.service";

export function useEstoqueMovimentacoes(produtoId?: string) {
  return useQuery<EstoqueMovimento[], Error>({
    queryKey: produtoId
      ? ["estoque-movimentacoes", produtoId]
      : ["estoque-movimentacoes"],
    queryFn: produtoId
      ? () => fetchMovimentacoesPorProduto(produtoId)
      : fetchMovimentacoes,
    staleTime: 60 * 1000,
  });
}
