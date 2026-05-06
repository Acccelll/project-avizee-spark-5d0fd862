import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { INVALIDATION_KEYS } from "@/services/_invalidationKeys";
import { aprovarOrcamento } from "@/services/comercial/orcamentosLifecycle.service";

interface AprovarInput {
  id: string;
  numero?: string;
}

/**
 * Wrapper RQ para `aprovar_orcamento`. Centraliza invalidação cross-módulo
 * (orçamentos + ordens_venda + pedidos) e toast de sucesso.
 */
export function useAprovarOrcamento() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, AprovarInput>({
    mutationFn: ({ id }) => aprovarOrcamento(id),
    onSuccess: (_data, variables) => {
      INVALIDATION_KEYS.conversaoOrcamento.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
      toast.success(
        variables.numero
          ? `Orçamento ${variables.numero} aprovado!`
          : "Orçamento aprovado!",
      );
    },
    onError: (err) => {
      notifyError(err);
    },
  });
}