import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Singleton de canal Realtime para o módulo Logística.
 *
 * Escuta `remessas`, `remessa_eventos`, `recebimentos_compra` e
 * `estoque_movimentos` em um único canal e invalida as query keys
 * relevantes — evita múltiplas subscrições paralelas (era um problema
 * apontado na auditoria Onda 5: SH-01/SH-02).
 *
 * Uso: chamar **uma única vez** na página `/logistica` (raiz).
 */
export function useLogisticaRealtime(enabled = true): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const invalidate = (keys: string[]) => {
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    };

    const channel = supabase
      .channel("logistica-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "remessas" },
        () => invalidate(["remessas", "entregas"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "remessa_eventos" },
        () => invalidate(["remessa-eventos", "remessas"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recebimentos_compra" },
        () =>
          invalidate([
            "recebimentos",
            "pedidos-compra",
            "estoque-posicao",
            "estoque-movimentacoes",
          ]),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "estoque_movimentos" },
        () => invalidate(["estoque-posicao", "estoque-movimentacoes"]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}