// deno-lint-ignore-file no-explicit-any
/**
 * Edge Function: process-nfe-retry-cron
 *
 * Worker periódico que processa a fila `nfe_emissao_pendente` (EF-04). Para
 * cada item elegível (status=pendente, proxima_tentativa<=now()), tenta
 * reenviar à SEFAZ via `sefaz-proxy` (action `enviar-sem-assinatura-vault`)
 * usando o `payload` salvo no registro. Em caso de sucesso, marca a nota
 * fiscal como confirmada/autorizada e atualiza o protocolo. Em caso de
 * falha, calcula backoff exponencial via RPC `nfe_emissao_pendente_concluir`.
 *
 * Segurança: usa o mesmo padrão CRON_SECRET do process-distdfe-cron. SR é
 * usado para chamadas internas. Throttle: processa no máximo 5 itens por run.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface PendenteRow {
  id: string;
  nota_fiscal_id: string;
  payload: { xml: string; url: string; soapAction: string };
  tentativas: number;
  max_tentativas: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const log = createLogger("process-nfe-retry-cron");

  // Gate via CRON_SECRET (mesmo padrão do process-distdfe-cron).
  const expectedSecret = Deno.env.get("CRON_SECRET")?.trim();
  if (expectedSecret) {
    const url = new URL(req.url);
    const provided =
      req.headers.get("x-cron-secret")?.trim() ||
      url.searchParams.get("cron_secret")?.trim() ||
      "";
    if (provided !== expectedSecret) {
      log.warn("invalid cron secret");
      return json({ error: "Unauthorized" }, 401);
    }
  } else {
    log.warn("CRON_SECRET ausente — função aberta. Configure o secret no projeto.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Reservar lote (até 5 itens) via RPC atômica
  const { data: lote, error: loteErr } = await admin.rpc(
    "nfe_emissao_pendente_listar_proximo_lote",
    { p_limit: 5 },
  );
  if (loteErr) {
    log.error("erro ao listar lote", loteErr);
    return json({ error: loteErr.message }, 500);
  }
  const itens = (lote ?? []) as PendenteRow[];
  log.info("lote reservado", { count: itens.length });

  if (itens.length === 0) {
    return json({ sucesso: true, processados: 0 });
  }

  let okCount = 0;
  let failCount = 0;

  for (const item of itens) {
    try {
      const payload = item.payload;
      if (!payload?.xml || !payload?.url || !payload?.soapAction) {
        await admin.rpc("nfe_emissao_pendente_concluir", {
          p_id: item.id,
          p_sucesso: false,
          p_erro: "Payload inválido (xml/url/soapAction ausente)",
        });
        failCount++;
        continue;
      }

      // Invoca sefaz-proxy via REST com SR para bypass de auth.
      const resp = await fetch(`${supabaseUrl}/functions/v1/sefaz-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
        },
        body: JSON.stringify({
          action: "enviar-sem-assinatura-vault",
          xml: payload.xml,
          url: payload.url,
          soapAction: payload.soapAction,
        }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.sucesso) {
        const erro = data?.erro || `HTTP ${resp.status}`;
        await admin.rpc("nfe_emissao_pendente_concluir", {
          p_id: item.id,
          p_sucesso: false,
          p_erro: String(erro).slice(0, 1000),
        });
        failCount++;
        continue;
      }

      const xmlRetorno: string = data.xmlRetorno ?? "";
      const protocolo = xmlRetorno.match(/<nProt>(.*?)<\/nProt>/)?.[1];
      const status = xmlRetorno.match(/<cStat>(.*?)<\/cStat>/)?.[1];
      const motivo = xmlRetorno.match(/<xMotivo>(.*?)<\/xMotivo>/)?.[1];
      const autorizado = status === "100" || status === "150";

      if (autorizado) {
        await admin.from("notas_fiscais").update({
          status: "confirmada",
          status_sefaz: "autorizada",
          protocolo_sefaz: protocolo,
        }).eq("id", item.nota_fiscal_id);
        await admin.rpc("nfe_emissao_pendente_concluir", {
          p_id: item.id,
          p_sucesso: true,
          p_protocolo: protocolo,
        });
        okCount++;
      } else {
        await admin.rpc("nfe_emissao_pendente_concluir", {
          p_id: item.id,
          p_sucesso: false,
          p_erro: `cStat=${status} ${motivo ?? ""}`.slice(0, 1000),
        });
        failCount++;
      }
    } catch (err: any) {
      log.error("falha ao processar item", { id: item.id, err: err?.message });
      await admin.rpc("nfe_emissao_pendente_concluir", {
        p_id: item.id,
        p_sucesso: false,
        p_erro: String(err?.message ?? err).slice(0, 1000),
      });
      failCount++;
    }
  }

  return json({ sucesso: true, processados: itens.length, okCount, failCount });
});