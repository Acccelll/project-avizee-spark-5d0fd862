import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type NotaFiscalEventoInsert =
  Database["public"]["Tables"]["nota_fiscal_eventos"]["Insert"];

/**
 * Registra um evento na timeline da NF (eventos internos do ERP).
 * Para retornos SEFAZ atômicos, use `registrarRetornoSefaz` em
 * `nf-sefaz.service`.
 */
export async function registrarEventoFiscal(params: {
  nota_fiscal_id: string;
  tipo_evento: string;
  status_anterior?: string;
  status_novo?: string;
  descricao?: string;
  payload_resumido?: Record<string, unknown>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const payload: NotaFiscalEventoInsert = {
    nota_fiscal_id: params.nota_fiscal_id,
    tipo_evento: params.tipo_evento,
    status_anterior: params.status_anterior || null,
    status_novo: params.status_novo || null,
    descricao: params.descricao || null,
    payload_resumido: (params.payload_resumido ?? null) as NotaFiscalEventoInsert["payload_resumido"],
    usuario_id: user?.id || null,
  };
  await supabase.from("nota_fiscal_eventos").insert(payload);
}
