import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Entrega, EntregaFilters } from "@/types/logistica";

export type { Entrega, EntregaFilters };

async function fetchEntregas(): Promise<Entrega[]> {
  const [vRes, remessasRes] = await Promise.all([
    (supabase as any).from("vw_entregas_consolidadas").select("*"),
    supabase
      .from("remessas")
      .select("id,ordem_venda_id,codigo_rastreio")
      .eq("ativo", true),
  ]);
  if (vRes.error) throw new Error(vRes.error.message);

  const remessasByOv = new Map<string, { id: string; codigo_rastreio: string | null }[]>();
  for (const r of remessasRes.data ?? []) {
    const key = r.ordem_venda_id ?? "";
    const list = remessasByOv.get(key) ?? [];
    list.push({ id: r.id, codigo_rastreio: r.codigo_rastreio });
    remessasByOv.set(key, list);
  }

  type Row = {
    ordem_venda_id: string;
    numero_pedido: string | null;
    cliente: string | null;
    cidade: string | null;
    uf: string | null;
    transportadora: string | null;
    total_volumes: number | null;
    peso_total: number | null;
    previsao_envio: string | null;
    previsao_entrega: string | null;
    data_expedicao: string | null;
    data_entrega: string | null;
    status_consolidado: string;
    total_remessas: number | null;
    responsavel_nome?: string | null;
  };

  return ((vRes.data as Row[]) ?? []).map((r) => {
    const remessas = remessasByOv.get(r.ordem_venda_id) ?? [];
    const count = Number(r.total_remessas ?? remessas.length);
    return {
      id: r.ordem_venda_id,
      numero_pedido: r.numero_pedido ?? "—",
      cliente: r.cliente ?? "—",
      cidade_uf: [r.cidade, r.uf].filter(Boolean).join("/") || "—",
      transportadora: r.transportadora ?? "—",
      volumes: Number(r.total_volumes ?? 0),
      peso_total: Number(r.peso_total ?? 0),
      previsao_envio: r.previsao_envio,
      previsao_entrega: r.previsao_entrega,
      data_expedicao: r.data_expedicao,
      data_entrega: r.data_entrega,
      status_logistico: r.status_consolidado,
      responsavel: r.responsavel_nome ?? "—",
      codigo_rastreio: remessas[0]?.codigo_rastreio ?? null,
      remessas_count: count,
      remessa_ids: remessas.map((x) => x.id),
      exibicao_remessas: count === 0 ? "nenhuma" : count === 1 ? "unica" : "multipla",
      status_fonte: count === 0 ? "sem_remessa" : count === 1 ? "remessa_unica" : "ultima_remessa",
    };
  });
}

export function useEntregas() {
  return useQuery<Entrega[], Error>({
    queryKey: ["entregas"],
    queryFn: fetchEntregas,
    staleTime: 2 * 60 * 1000,
  });
}
