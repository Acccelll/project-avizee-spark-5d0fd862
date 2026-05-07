import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Recebimento } from "@/types/logistica";

export type { Recebimento };

async function fetchRecebimentos(): Promise<Recebimento[]> {
  const { data, error } = await (supabase as any)
    .from("vw_recebimentos_consolidado")
    .select("*");
  if (error) throw new Error(error.message);

  type Row = {
    pedido_compra_id: string;
    numero_compra: string | null;
    fornecedor: string | null;
    previsao_entrega: string | null;
    data_recebimento: string | null;
    quantidade_pedida: number | null;
    quantidade_recebida: number | null;
    pendencia: number | null;
    status_logistico: string | null;
    nf_vinculada: string | null;
    tem_consolidacao_real: boolean | null;
    tem_divergencia: boolean | null;
    total_recebimentos: number | null;
  };

  return ((data as Row[]) ?? []).map((r) => ({
    id: r.pedido_compra_id,
    numero_compra: r.numero_compra ?? "—",
    fornecedor: r.fornecedor ?? "—",
    previsao_entrega: r.previsao_entrega,
    data_recebimento: r.data_recebimento,
    quantidade_pedida: Number(r.quantidade_pedida ?? 0),
    quantidade_recebida: Number(r.quantidade_recebida ?? 0),
    pendencia: Number(r.pendencia ?? 0),
    status_logistico: r.status_logistico ?? "pedido_emitido",
    nf_vinculada: r.nf_vinculada,
    responsavel: "—",
    recebimento_real: Boolean(r.tem_consolidacao_real),
    observacao_recebimento: null,
    total_recebimentos: Number(r.total_recebimentos ?? 0),
    tem_divergencia: Boolean(r.tem_divergencia),
  }));
}

export function useRecebimentos() {
  return useQuery<Recebimento[], Error>({
    queryKey: ["recebimentos"],
    queryFn: fetchRecebimentos,
    staleTime: 2 * 60 * 1000,
  });
}
