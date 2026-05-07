// deno-lint-ignore-file no-explicit-any
/**
 * Edge Function: process-distdfe-cron
 *
 * Cron diário (executado por pg_cron) que dispara a sincronização DistDF-e
 * para todos os CNPJs cadastrados em `nfe_distdfe_sync`. Para cada CNPJ,
 * invoca internamente a edge function `sefaz-distdfe` (action: consultar-nsu)
 * e persiste os documentos retornados em `nfe_distribuicao`. Resultados
 * (totais, erros, cStat) são gravados em `audit_logs` para rastreabilidade.
 *
 * Segurança: aceita apenas chamadas com `Authorization: Bearer <ANON_KEY>`
 * vindas do pg_cron (ou execução manual via supabase.functions.invoke por
 * um admin). Não exige sessão de usuário; usa SERVICE_ROLE para escrita
 * em `audit_logs` e leitura de `nfe_distdfe_sync`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface DistDFeDoc {
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

interface DistDFeResponse {
  sucesso: boolean;
  cnpj?: string;
  ambiente?: "1" | "2";
  cStat?: string;
  xMotivo?: string;
  ultNSU?: string;
  maxNSU?: string;
  docs?: DistDFeDoc[];
  erro?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const log = createLogger("process-distdfe-cron");

  // Sprint 7.1 P0 — gate de invocação anônima.
  // verify_jwt=false (necessário para o pg_cron chamar via net.http_post sem
  // sessão), portanto a função fica exposta. Exigimos um secret compartilhado
  // CRON_SECRET que o pg_cron envia via header X-Cron-Secret (ou query
  // ?cron_secret=). Quando o secret NÃO está configurado no projeto, mantemos
  // o comportamento antigo (open) para não quebrar deployments legados, mas
  // logamos um WARN bem visível para o operador atualizar.
  const expectedSecret = Deno.env.get("CRON_SECRET")?.trim();
  if (expectedSecret) {
    const url = new URL(req.url);
    const provided =
      req.headers.get("x-cron-secret")?.trim() ||
      url.searchParams.get("cron_secret")?.trim() ||
      "";
    if (provided !== expectedSecret) {
      log.info("invocação rejeitada: cron secret inválido/ausente", {
        hasHeader: !!req.headers.get("x-cron-secret"),
        hasQuery: !!url.searchParams.get("cron_secret"),
      });
      return json({ sucesso: false, erro: "Unauthorized: cron secret inválido." }, 401);
    }
  } else {
    log.info("CRON_SECRET não configurado — execução aberta (configure o secret e atualize o pg_cron)");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ambiente: prioridade body > empresa_config.ambiente_sefaz > "2" (homolog).
  // Antes o default era homologação fixa, o que silenciosamente perdia DistDF-e
  // em produção. Agora consultamos a configuração da empresa principal.
  let ambiente: "1" | "2" = "2";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.ambiente === "1" || body?.ambiente === "2") {
      ambiente = body.ambiente;
    } else {
      const { data: cfg } = await admin
        .from("empresa_config")
        .select("ambiente_sefaz, ambiente_padrao")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const cfgAmb = (cfg as { ambiente_sefaz?: string | number; ambiente_padrao?: string } | null);
      if (cfgAmb) {
        if (cfgAmb.ambiente_sefaz === "1" || cfgAmb.ambiente_sefaz === 1 || cfgAmb.ambiente_padrao === "producao") {
          ambiente = "1";
        } else if (cfgAmb.ambiente_sefaz === "2" || cfgAmb.ambiente_sefaz === 2 || cfgAmb.ambiente_padrao === "homologacao") {
          ambiente = "2";
        }
      }
    }
  } catch {
    // sem body / sem config — mantém default conservador
  }
  log.info("Ambiente DistDF-e resolvido", { ambiente });

  const inicio = new Date().toISOString();
  const resultados: Array<{
    cnpj: string;
    sucesso: boolean;
    novos: number;
    duplicados: number;
    cStat?: string;
    xMotivo?: string;
    erro?: string;
  }> = [];

  // Sprint 7.4 #17 — Circuit breaker para cStat=656 (consumo indevido).
  // Quando o AN devolve 656, o CNPJ fica bloqueado por ~1h. Persistimos
  // `distdfe_circuit_break_until` em `app_configuracoes` e abortamos a execução
  // até o vencimento, evitando reentrar no bloqueio.
  const CIRCUIT_KEY = `distdfe_circuit_break_until_${ambiente}`;
  try {
    const { data: cb } = await admin
      .from("app_configuracoes")
      .select("valor")
      .eq("chave", CIRCUIT_KEY)
      .maybeSingle();
    const until = (cb?.valor as { until?: string } | null)?.until;
    if (until && new Date(until).getTime() > Date.now()) {
      log.info("circuit breaker ativo — pulando execução", { until, ambiente });
      return json({
        sucesso: true,
        skipped: true,
        motivo: "circuit_breaker_656",
        ate: until,
        ambiente,
      });
    }
  } catch (e) {
    log.info("falha ao ler circuit breaker (seguindo)", { erro: (e as Error).message });
  }

  // 1) Lista todos os CNPJs cadastrados para o ambiente
  const { data: syncs, error: syncErr } = await admin
    .from("nfe_distdfe_sync")
    .select("cnpj, ultimo_nsu")
    .eq("ambiente", ambiente);

  if (syncErr) {
    log.error("Erro ao listar nfe_distdfe_sync", { erro: syncErr.message });
    return json({ sucesso: false, erro: syncErr.message }, 500);
  }

  // Se não há nenhum CNPJ ainda (primeira execução), faz uma sondagem com
  // ultNSU=0 — a edge function descobre o CNPJ a partir do A1.
  const lista = syncs && syncs.length > 0
    ? syncs.map((s) => ({ cnpj: s.cnpj, ultNSU: s.ultimo_nsu ?? "0" }))
    : [{ cnpj: "auto", ultNSU: "0" }];

  for (const item of lista) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/sefaz-distdfe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({
          action: "consultar-nsu",
          ambiente,
          ultNSU: item.ultNSU,
        }),
      });
      const data = (await resp.json()) as DistDFeResponse;

      if (!data.sucesso) {
        resultados.push({
          cnpj: item.cnpj,
          sucesso: false,
          novos: 0,
          duplicados: 0,
          cStat: data.cStat,
          xMotivo: data.xMotivo,
          erro: data.erro ?? "Falha na consulta",
        });
        continue;
      }

      // Persiste documentos
      const docs = (data.docs ?? []).filter(
        (d) => d.chave && /^\d{44}$/.test(d.chave),
      );
      let novos = 0;
      let duplicados = 0;

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
          usuario_id: null,
        };
        const { error: upErr, data: upData } = await admin
          .from("nfe_distribuicao")
          .upsert(payload, { onConflict: "chave_acesso", ignoreDuplicates: false })
          .select("id")
          .maybeSingle();
        if (upErr) {
          if ((upErr as { code?: string }).code === "23505") duplicados++;
          continue;
        }
        if (upData) novos++;
      }

      // Atualiza nfe_distdfe_sync
      if (data.cnpj) {
        await admin.from("nfe_distdfe_sync").upsert(
          {
            cnpj: data.cnpj,
            ambiente,
            ultimo_nsu: data.ultNSU ?? item.ultNSU,
            max_nsu: data.maxNSU ?? null,
            ultima_sync_at: new Date().toISOString(),
            ultima_resposta_cstat: data.cStat ?? null,
            ultima_resposta_xmotivo: data.xMotivo ?? null,
            ultima_qtd_docs: docs.length,
          },
          { onConflict: "cnpj,ambiente" },
        );
      }

      resultados.push({
        cnpj: data.cnpj ?? item.cnpj,
        sucesso: true,
        novos,
        duplicados,
        cStat: data.cStat,
        xMotivo: data.xMotivo,
      });

      // Se AN devolveu cStat=656, ativa breaker por 65 minutos.
      if (data.cStat === "656") {
        const breakUntil = new Date(Date.now() + 65 * 60 * 1000).toISOString();
        await admin.from("app_configuracoes").upsert(
          {
            chave: CIRCUIT_KEY,
            valor: { until: breakUntil, motivo: data.xMotivo ?? "consumo indevido", cnpj: data.cnpj ?? item.cnpj },
          },
          { onConflict: "chave" },
        );
        log.info("circuit breaker armado (cStat=656)", { until: breakUntil });
        break;
      }
    } catch (e) {
      const err = e as Error;
      log.error("Erro ao sincronizar CNPJ", { cnpj: item.cnpj, erro: err.message });
      resultados.push({
        cnpj: item.cnpj,
        sucesso: false,
        novos: 0,
        duplicados: 0,
        erro: err.message,
      });
    }
  }

  const fim = new Date().toISOString();
  const totalNovos = resultados.reduce((s, r) => s + r.novos, 0);
  const totalDuplicados = resultados.reduce((s, r) => s + r.duplicados, 0);
  const totalErros = resultados.filter((r) => !r.sucesso).length;

  // Registra log em auditoria_logs
  await admin.from("auditoria_logs").insert({
    tabela: "nfe_distribuicao",
    acao: "distdfe_cron_run",
    registro_id: null,
    usuario_id: null,
    dados_novos: {
      ambiente,
      inicio,
      fim,
      total_cnpjs: resultados.length,
      total_novos: totalNovos,
      total_duplicados: totalDuplicados,
      total_erros: totalErros,
      detalhes: resultados,
    },
  });

  log.info("Sincronização DistDF-e concluída", {
    total_cnpjs: resultados.length,
    total_novos: totalNovos,
    total_erros: totalErros,
  });

  return json({
    sucesso: true,
    ambiente,
    inicio,
    fim,
    total_cnpjs: resultados.length,
    total_novos: totalNovos,
    total_duplicados: totalDuplicados,
    total_erros: totalErros,
    resultados,
  });
});
