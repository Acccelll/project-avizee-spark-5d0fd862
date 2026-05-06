import { supabase } from "@/integrations/supabase/client";

export interface OrcamentoLifecycleResult {
  id: string;
  numero: string;
  status: string;
}

export async function enviarOrcamentoAprovacao(id: string): Promise<OrcamentoLifecycleResult> {
  const { data, error } = await supabase.rpc("enviar_orcamento_aprovacao", { p_id: id });
  if (error) throw new Error(error.message);
  return data as unknown as OrcamentoLifecycleResult;
}

export async function aprovarOrcamento(id: string): Promise<OrcamentoLifecycleResult> {
  const { data, error } = await supabase.rpc("aprovar_orcamento", { p_id: id });
  if (error) throw new Error(error.message);
  return data as unknown as OrcamentoLifecycleResult;
}