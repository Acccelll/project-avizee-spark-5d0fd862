/**
 * Fluxo de Caixa — fetcher canônico via React Query.
 *
 * Substitui o `useEffect + useState` original em `FluxoCaixa.tsx`,
 * permitindo invalidação cross-módulo automática (ver
 * `src/services/_invalidationKeys.ts` → `fluxo-caixa`).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Lancamento, ContaBancaria } from "@/types/domain";

/**
 * Baixa enriquecida com `tipo` e `conta_bancaria_id` do lançamento pai.
 * Permite separar Realizado por `data_baixa` (eixo real) sem misturar com
 * o eixo de previsão (`data_vencimento`).
 */
export interface BaixaFluxo {
  id: string;
  lancamento_id: string;
  data_baixa: string;
  valor_pago: number;
  tipo: "receber" | "pagar";
  conta_bancaria_id: string | null;
}

export interface FluxoCaixaData {
  lancamentos: Lancamento[];
  contasBancarias: ContaBancaria[];
  baixas: BaixaFluxo[];
}

export function useFluxoCaixaData(dataInicio: string, dataFim: string) {
  return useQuery<FluxoCaixaData>({
    queryKey: ["fluxo-caixa", dataInicio, dataFim],
    queryFn: async () => {
      const [{ data: lancs }, { data: contas }, { data: baixasRaw }] = await Promise.all([
        supabase
          .from("financeiro_lancamentos")
          .select(
            "id, tipo, valor, saldo_restante, valor_pago, status, data_vencimento, data_pagamento, conta_bancaria_id, descricao, forma_pagamento, nota_fiscal_id, documento_pai_id, observacoes, contas_bancarias(descricao, bancos(nome))",
          )
          .eq("ativo", true)
          .gte("data_vencimento", dataInicio)
          .lte("data_vencimento", dataFim),
        supabase
          .from("contas_bancarias")
          .select("*, bancos(nome)")
          .eq("ativo", true),
        supabase
          .from("financeiro_baixas")
          .select(
            "id, lancamento_id, data_baixa, valor_pago, conta_bancaria_id, financeiro_lancamentos!inner(tipo)",
          )
          .is("estornada_em", null)
          .gte("data_baixa", dataInicio)
          .lte("data_baixa", dataFim),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape de join Supabase não-tipado
      const baixas: BaixaFluxo[] = ((baixasRaw as any[]) ?? []).map((b) => ({
        id: b.id,
        lancamento_id: b.lancamento_id,
        data_baixa: b.data_baixa,
        valor_pago: Number(b.valor_pago),
        tipo: (b.financeiro_lancamentos?.tipo ?? "receber") as "receber" | "pagar",
        conta_bancaria_id: b.conta_bancaria_id ?? null,
      }));
      return {
        lancamentos: (lancs as Lancamento[]) ?? [],
        contasBancarias: (contas as ContaBancaria[]) ?? [],
        baixas,
      };
    },
    staleTime: 60 * 1000,
  });
}
