/**
 * DistDF-e — orquestrador cliente.
 *
 * Chama a edge function `sefaz-distdfe` (que faz mTLS contra o Ambiente
 * Nacional usando o A1 do storage) e persiste os documentos retornados em
 * `nfe_distribuicao`, atualizando `nfe_distdfe_sync.ultimo_nsu`.
 *
 * Idempotência:
 *  - inserção em `nfe_distribuicao` faz `upsert` por `chave_acesso`.
 *  - documentos sem chave (eventos avulsos) são ignorados nesta onda.
 */

import { supabase } from "@/integrations/supabase/client";

export interface DistDFeDoc {
  nsu: string;
  schema: string;
  xml: string;
  chave?: string;
  resumo?: {
    cnpjEmitente?: string;
    nomeEmitente?: string;
    valorTotal?: number;
    dataEmissao?: string;
    numero?: string;
    serie?: string;
    situacao?: string;
  };
}

export interface DistDFeResponse {
  sucesso: boolean;
  cnpj?: string;
  ambiente?: "1" | "2";
  cStat?: string;
  xMotivo?: string;
  mensagemCstat?: string | null;
  ultNSU?: string;
  maxNSU?: string;
  docs?: DistDFeDoc[];
  erro?: string;
}

/**
 * Consulta documentos novos a partir do último NSU sincronizado para o CNPJ.
 * Persiste resultados e devolve estatística da sincronização.
 */
export async function sincronizarDistDFe(
  ambiente: "1" | "2" = "2",
): Promise<{
  sucesso: boolean;
  novos: number;
  duplicados: number;
  ultNSU?: string;
  maxNSU?: string;
  cStat?: string;
  xMotivo?: string;
  erro?: string;
}> {
  // 1) Buscar CNPJ via edge function (que extrai do A1) — aqui usamos o
  //    valor armazenado em `nfe_distdfe_sync` se existir; senão começa em '0'
  //    e a edge function preenche o CNPJ.

  // Sondagem inicial: tenta obter um registro de sync existente (qualquer CNPJ);
  // a edge function retorna o CNPJ correto e atualizamos depois.
  const { data: syncs } = await supabase
    .from("nfe_distdfe_sync")
    .select("cnpj, ultimo_nsu")
    .eq("ambiente", ambiente)
    .limit(1);
  const ultNSU = syncs?.[0]?.ultimo_nsu ?? "0";

  // 2) Chama edge function
  const { data, error } = await supabase.functions.invoke<DistDFeResponse>(
    "sefaz-distdfe",
    { body: { action: "consultar-nsu", ambiente, ultNSU } },
  );
  if (error) {
    return { sucesso: false, novos: 0, duplicados: 0, erro: error.message };
  }
  if (!data?.sucesso) {
    return {
      sucesso: false,
      novos: 0,
      duplicados: 0,
      cStat: data?.cStat,
      xMotivo: data?.xMotivo,
      erro: data?.erro ?? "Resposta inesperada do Ambiente Nacional",
    };
  }

  // 3) Persiste documentos (apenas os com chave de NF-e)
  const docs = (data.docs ?? []).filter((d) => d.chave && /^\d{44}$/.test(d.chave));
  let novos = 0;
  let duplicados = 0;
  const { data: { user } } = await supabase.auth.getUser();

  for (const d of docs) {
    const r = d.resumo ?? {};
    const payload = {
      chave_acesso: d.chave!,
      nsu: d.nsu,
      cnpj_emitente: r.cnpjEmitente ?? null,
      nome_emitente: r.nomeEmitente ?? null,
      numero: r.numero ?? null,
      serie: r.serie ?? null,
      data_emissao: r.dataEmissao ?? null,
      valor_total: r.valorTotal ?? null,
      status_manifestacao: "sem_manifestacao",
      usuario_id: user?.id ?? null,
    };
    const { error: upErr, data: upData } = await supabase
      .from("nfe_distribuicao")
      .upsert(payload, { onConflict: "chave_acesso", ignoreDuplicates: false })
      .select("id")
      .maybeSingle();
    if (upErr) {
      // 23505 indica conflito de unique não resolvido por upsert — conta como duplicado
      if ((upErr as { code?: string }).code === "23505") duplicados++;
      continue;
    }
    if (upData) novos++;
  }

  // 4) Atualiza nfe_distdfe_sync (upsert por cnpj+ambiente)
  if (data.cnpj) {
    await supabase.from("nfe_distdfe_sync").upsert(
      {
        cnpj: data.cnpj,
        ambiente,
        ultimo_nsu: data.ultNSU ?? ultNSU,
        max_nsu: data.maxNSU ?? null,
        ultima_sync_at: new Date().toISOString(),
        ultima_resposta_cstat: data.cStat ?? null,
        ultima_resposta_xmotivo: data.xMotivo ?? null,
        ultima_qtd_docs: docs.length,
      },
      { onConflict: "cnpj,ambiente" },
    );
  }

  return {
    sucesso: true,
    novos,
    duplicados,
    ultNSU: data.ultNSU,
    maxNSU: data.maxNSU,
    cStat: data.cStat,
    xMotivo: data.xMotivo,
  };
}

/**
 * Consulta direta de uma NF-e por chave de acesso via DistDFe `consChNFe`.
 *
 * Estratégia em 2 níveis (mem://features/fiscal-consulta-por-chave):
 *   1. Cache local: `nfe_distribuicao.xml_nfe WHERE chave_acesso = ?`
 *      (alimentado pelo cron e por consultas anteriores).
 *   2. SEFAZ: edge `sefaz-distdfe` action `consultar-chave`.
 *
 * Após sucesso na SEFAZ, faz upsert em `nfe_distribuicao(chave_acesso,
 * xml_nfe)` para cachear a próxima consulta.
 */
export async function consultarNFePorChave(params: {
  chave: string;
  ambiente?: "1" | "2";
}): Promise<{
  sucesso: boolean;
  origem: "cache" | "sefaz";
  xml?: string;
  cStat?: string;
  xMotivo?: string;
  mensagemCstat?: string | null;
  erro?: string;
}> {
  const chave = (params.chave || "").replace(/\D/g, "");
  const ambiente: "1" | "2" = params.ambiente === "2" ? "2" : "1";
  if (chave.length !== 44) {
    return { sucesso: false, origem: "sefaz", erro: "Chave de acesso inválida (exige 44 dígitos)." };
  }

  // 1) Cache local — `xml_nfe` quando preenchido pelo cron ou consulta prévia.
  try {
    const { data: cache } = await supabase
      .from("nfe_distribuicao")
      .select("xml_nfe")
      .eq("chave_acesso", chave)
      .maybeSingle();
    const xmlCache = (cache as { xml_nfe?: string } | null)?.xml_nfe;
    if (xmlCache && xmlCache.includes("<")) {
      return { sucesso: true, origem: "cache", xml: xmlCache };
    }
  } catch { /* noop — segue para SEFAZ */ }

  // 2) SEFAZ via edge function.
  const { data, error } = await supabase.functions.invoke<DistDFeResponse>(
    "sefaz-distdfe",
    { body: { action: "consultar-chave", ambiente, chNFe: chave } },
  );
  if (error) return { sucesso: false, origem: "sefaz", erro: error.message };
  if (!data?.sucesso) {
    return {
      sucesso: false,
      origem: "sefaz",
      cStat: data?.cStat,
      xMotivo: data?.xMotivo,
      mensagemCstat: data?.mensagemCstat ?? null,
      erro: data?.erro ?? data?.xMotivo ?? "Falha na consulta DistDFe.",
    };
  }

  // Procura o doc com a chave e schema procNFe (XML completo). cStat 138 +
  // documentos = sucesso da chamada (pode vir 1 procNFe). 137 = não encontrado.
  const docs = (data.docs ?? []).filter((d) => d.chave === chave && d.xml);
  const doc = docs.find((d) => /procNFe|nfeProc/.test(d.schema)) ?? docs[0];
  const xml = doc?.xml;

  if (!xml) {
    return {
      sucesso: false,
      origem: "sefaz",
      cStat: data.cStat,
      xMotivo: data.xMotivo,
      mensagemCstat: data.mensagemCstat ?? null,
      erro:
        data.cStat === "137" || data.cStat === "138"
          ? `${data.xMotivo ?? "Documento não encontrado"} — ${data.cStat === "138"
              ? "a chave existe mas a NF-e não é destinada ao CNPJ deste certificado A1. Solicite o XML ao emissor."
              : "verifique se a chave está correta."}`
          : data.xMotivo ?? "Resposta sem XML.",
    };
  }

  // Cacheia em `nfe_distribuicao` para próximas consultas.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("nfe_distribuicao").upsert(
      {
        chave_acesso: chave,
        xml_nfe: xml,
        nsu: doc?.nsu ?? "0",
        cnpj_emitente: doc?.resumo?.cnpjEmitente ?? null,
        nome_emitente: doc?.resumo?.nomeEmitente ?? null,
        numero: doc?.resumo?.numero ?? null,
        serie: doc?.resumo?.serie ?? null,
        data_emissao: doc?.resumo?.dataEmissao ?? null,
        valor_total: doc?.resumo?.valorTotal ?? null,
        status_manifestacao: "sem_manifestacao",
        usuario_id: user?.id ?? null,
      },
      { onConflict: "chave_acesso", ignoreDuplicates: false },
    );
  } catch { /* cache best-effort */ }

  return {
    sucesso: true,
    origem: "sefaz",
    xml,
    cStat: data.cStat,
    xMotivo: data.xMotivo,
    mensagemCstat: data.mensagemCstat ?? null,
  };
}