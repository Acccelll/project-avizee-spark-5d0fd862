import { supabase } from "@/integrations/supabase/client";

/**
 * Registra retorno SEFAZ (autorização/rejeição/cancelamento/etc) de forma
 * atômica: atualiza `notas_fiscais` (status_sefaz, protocolo, chave, motivo,
 * ambiente) e insere o evento correspondente em `notas_fiscais_eventos` na
 * mesma transação.
 */
export async function registrarRetornoSefaz(params: {
  nfId: string;
  statusSefaz:
    | "nao_enviada" | "enviada" | "processando" | "autorizada"
    | "rejeitada" | "cancelada_sefaz" | "denegada" | "inutilizada";
  protocolo?: string | null;
  chaveAcesso?: string | null;
  motivo?: string | null;
  ambiente?: "homologacao" | "producao" | null;
  xmlRetorno?: string | null;
  payloadResumido?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabase.rpc("registrar_retorno_sefaz", {
    p_nf_id: params.nfId,
    p_status_sefaz: params.statusSefaz,
    p_protocolo: params.protocolo ?? null,
    p_chave_acesso: params.chaveAcesso ?? null,
    p_motivo: params.motivo ?? null,
    p_ambiente: params.ambiente ?? null,
    p_xml_retorno: params.xmlRetorno ?? null,
    p_payload_resumido: (params.payloadResumido ?? null) as never,
  } as never);
  if (error) throw error;
}

export async function verificarDuplicidadeChave(
  chaveAcesso: string,
): Promise<boolean> {
  if (!chaveAcesso || chaveAcesso.length < 44) return false;
  const { data } = await supabase
    .from("notas_fiscais")
    .select("id")
    .eq("chave_acesso", chaveAcesso)
    .limit(1);
  return (data?.length || 0) > 0;
}
