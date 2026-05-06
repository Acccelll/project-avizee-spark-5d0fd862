import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Singleton realtime channel para o módulo Comercial.
 *
 * Escuta mudanças em `ordens_venda` e `notas_fiscais` (publicação
 * `supabase_realtime`) e dispara callbacks registrados.
 *
 * Uso típico em telas:
 * ```ts
 * useEffect(() => subscribeComercial(() => qc.invalidateQueries({ queryKey: ["ordens_venda"] })), [qc]);
 * ```
 *
 * Por que singleton: múltiplas telas (Pedidos grid, OrdemVendaView drawer,
 * Fiscal grid) precisam reagir aos mesmos eventos. Sem singleton cada
 * consumidor abriria seu próprio canal — multiplicando conexões em
 * desenvolvimento (StrictMode) e produção.
 */

export interface ComercialChange {
  table: "ordens_venda" | "notas_fiscais";
  /** id da linha afetada (quando disponível). */
  id?: string;
  /** id da OV vinculada — útil para listeners de drawer de OV. */
  ordemVendaId?: string;
}

type Listener = (change: ComercialChange) => void;

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;

function broadcast(change: ComercialChange) {
  for (const cb of listeners) {
    try {
      cb(change);
    } catch (err) {
      console.error("[comercial-channel] listener threw:", err);
    }
  }
}

type RowLike = { id?: string | null; ordem_venda_id?: string | null };
function rowFromPayload(payload: { new?: unknown; old?: unknown }): RowLike {
  return ((payload?.new as RowLike) ?? (payload?.old as RowLike) ?? {}) as RowLike;
}

function ensureChannel() {
  if (channel) return;
  channel = supabase
    .channel("comercial-shared")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ordens_venda" },
      (payload) => {
        const row = rowFromPayload(payload);
        broadcast({
          table: "ordens_venda",
          id: row.id ?? undefined,
          ordemVendaId: row.id ?? undefined,
        });
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notas_fiscais" },
      (payload) => {
        const row = rowFromPayload(payload);
        broadcast({
          table: "notas_fiscais",
          id: row.id ?? undefined,
          ordemVendaId: row.ordem_venda_id ?? undefined,
        });
      },
    )
    .subscribe();
}

/**
 * Inscreve um callback no canal compartilhado do Comercial.
 * Retorna função de cleanup — chame no `useEffect` return.
 */
export function subscribeComercial(listener: Listener): () => void {
  listeners.add(listener);
  ensureChannel();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}