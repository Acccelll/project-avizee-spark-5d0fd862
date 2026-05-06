import { useQuery } from "@tanstack/react-query";
import {
  fetchProdutosEstoque,
  fetchEstoquePosicao,
  type ProdutoRow,
  type EstoquePosicaoRow,
} from "@/services/estoque.service";

export function useEstoque() {
  return useQuery<ProdutoRow[], Error>({
    queryKey: ["estoque-produtos"],
    queryFn: fetchProdutosEstoque,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Returns aggregated stock position from the `vw_estoque_posicao` Supabase
 * view. Use this hook in pages that need the consolidated saldo_atual and
 * estoque_reservado without client-side aggregation.
 */
export function useEstoquePosicao() {
  return useQuery<EstoquePosicaoRow[], Error>({
    queryKey: ["estoque-posicao"],
    queryFn: fetchEstoquePosicao,
    staleTime: 2 * 60 * 1000,
  });
}
