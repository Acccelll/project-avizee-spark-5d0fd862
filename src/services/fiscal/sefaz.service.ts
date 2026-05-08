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

export interface DuplicidadeChaveInfo {
  id: string;
  numero: string | null;
  serie: string | null;
  status: string | null;
  status_sefaz: string | null;
}

/**
 * Verifica se a chave de acesso já existe em `notas_fiscais` e devolve
 * o contexto da NF encontrada (id, numero, serie, status, status_sefaz)
 * para que o caller mostre uma mensagem precisa.
 *
 * Quando `ignorarCanceladas=true`, NFs com status ERP `cancelada` ou
 * status SEFAZ `cancelada_sefaz`/`inutilizada` são ignoradas — útil para
 * permitir reimportação após cancelamento. Default `false` (qualquer
 * registro com a mesma chave é considerado duplicidade).
 */
export async function verificarDuplicidadeChave(
  chaveAcesso: string,
  options?: { ignorarCanceladas?: boolean },
): Promise<DuplicidadeChaveInfo | null> {
  if (!chaveAcesso || chaveAcesso.length < 44) return null;
  const { data, error } = await supabase
    .from("notas_fiscais")
    .select("id, numero, serie, status, status_sefaz")
    .eq("chave_acesso", chaveAcesso)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  if (options?.ignorarCanceladas) {
    const erpCanc = data.status === "cancelada";
    const sefazCanc =
      data.status_sefaz === "cancelada_sefaz" || data.status_sefaz === "inutilizada";
    if (erpCanc || sefazCanc) return null;
  }
  return {
    id: data.id,
    numero: data.numero ?? null,
    serie: data.serie ?? null,
    status: data.status ?? null,
    status_sefaz: data.status_sefaz ?? null,
  };
}
