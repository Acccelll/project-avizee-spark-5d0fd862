/**
 * `apresentacao-cadencia-runner` — executa a cadência mensal automática
 * de Apresentação Gerencial.
 *
 * Quando invocada (manualmente ou por pg_cron diário), percorre as
 * configurações ativas em `apresentacao_cadencia` cuja:
 *   - `dia_do_mes` == dia atual (UTC) OU `force=true` no body
 *   - ainda não foram executadas para a competência alvo (mês anterior)
 *
 * Para cada uma:
 *   1. Cria registro `apresentacao_geracoes` com status='pendente' e
 *      status_editorial='revisao' apontando para a competência do mês anterior.
 *   2. Enfileira e-mail para os destinatários listando o link de aprovação.
 *   3. Atualiza `ultima_execucao_*` na cadência.
 *
 * A geração binária do .pptx é feita pelo cliente quando o aprovador
 * acessa o módulo (mantém a engine pptxgenjs no browser).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function competenciaAlvo(): { inicial: string; final: string; label: string } {
  const now = new Date();
  const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = ref.getUTCFullYear();
  const m = String(ref.getUTCMonth() + 1).padStart(2, "0");
  return { inicial: `${y}-${m}`, final: `${y}-${m}`, label: `${m}/${y}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("apresentacao-cadencia-runner", req);

  // 9.5 — M-07: gate via CRON_SECRET (mesmo padrão de process-nfe-retry-cron
  // e process-distdfe-cron). Sem secret configurado a função fica aberta —
  // logamos warn para sinalizar a necessidade de provisionamento.
  const expectedSecret = Deno.env.get("CRON_SECRET")?.trim();
  if (expectedSecret) {
    const url = new URL(req.url);
    const provided =
      req.headers.get("x-cron-secret")?.trim() ||
      url.searchParams.get("cron_secret")?.trim() ||
      "";
    if (provided !== expectedSecret) {
      log.warn("invalid cron secret");
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: corsHeaders },
      );
    }
  } else {
    log.warn("CRON_SECRET ausente — função aberta. Configure o secret no projeto.");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let body: { force?: boolean; cadenciaId?: string } = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /* sem body */ }
  }

  // 9.5 — M-07: usa fuso America/Sao_Paulo para alinhar `dia_do_mes` com o
  // calendário brasileiro (evita disparo no dia 31 às 22h BRT que já é dia 1
  // em UTC, ou perda de execução no dia 1 entre 00–03h BRT).
  const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const today = nowBrt.getDate();
  const competencia = competenciaAlvo();
  const appUrl = Deno.env.get("APP_URL") ?? "";

  let query = supabase.from("apresentacao_cadencia").select("*").eq("ativo", true);
  if (body.cadenciaId) query = query.eq("id", body.cadenciaId);
  else if (!body.force) query = query.eq("dia_do_mes", today);

  const { data: cadencias, error } = await query;
  if (error) {
    log.error("listing cadencias failed", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
  log.info("cadencias loaded", { count: cadencias?.length ?? 0, force: !!body.force, cadenciaId: body.cadenciaId ?? null });

  const resultados: Array<Record<string, unknown>> = [];

  for (const cad of cadencias ?? []) {
    try {
      // Idempotência: já existe geração desta cadência para a competência?
      const { data: existente } = await supabase
        .from("apresentacao_geracoes")
        .select("id")
        .eq("cadencia_id", cad.id)
        .eq("competencia_inicial", `${competencia.inicial}-01`)
        .maybeSingle();

      if (existente) {
        resultados.push({ cadencia_id: cad.id, status: "ja_existe", geracao_id: existente.id });
        continue;
      }

      const params = {
        templateId: cad.template_id,
        competenciaInicial: competencia.inicial,
        competenciaFinal: competencia.final,
        modoGeracao: cad.modo_geracao,
        exigirRevisao: cad.exigir_revisao,
      };

      const { data: geracao, error: insertError } = await supabase
        .from("apresentacao_geracoes")
        .insert({
          template_id: cad.template_id,
          cadencia_id: cad.id,
          competencia_inicial: `${competencia.inicial}-01`,
          competencia_final: `${competencia.final}-01`,
          modo_geracao: cad.modo_geracao,
          status: "pendente",
          status_editorial: cad.exigir_revisao ? "revisao" : "rascunho",
          parametros_json: params,
          observacoes: `Rascunho automático criado pela cadência "${cad.nome}".`,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // E-mail para aprovadores
      const destinatarios = (cad.destinatarios_emails ?? []).filter(Boolean);
      const subject = `Apresentação Gerencial ${competencia.label} aguardando aprovação`;
      const html = [
        `<p>Um rascunho automático da Apresentação Gerencial foi criado pela cadência <strong>${cad.nome}</strong>.</p>`,
        `<ul>`,
        `<li><strong>Competência:</strong> ${competencia.label}</li>`,
        `<li><strong>Modo:</strong> ${cad.modo_geracao}</li>`,
        `<li><strong>Revisão:</strong> ${cad.exigir_revisao ? "obrigatória antes da versão final" : "não exigida"}</li>`,
        `</ul>`,
        `<p>Acesse <a href="${appUrl}/relatorios/apresentacao-gerencial">Apresentação Gerencial</a> para revisar comentários e gerar a versão final.</p>`,
      ].join("");

      for (const to of destinatarios) {
        const { error: queueError } = await supabase.rpc("queue_email", {
          p_to: to,
          p_subject: subject,
          p_html: html,
          p_template: "apresentacao_cadencia",
        });
        if (queueError) log.error("queue_email failed", { to, error: queueError });
      }

      await supabase
        .from("apresentacao_cadencia")
        .update({
          ultima_execucao_em: new Date().toISOString(),
          ultima_execucao_status: "ok",
          ultima_execucao_geracao_id: geracao.id,
        })
        .eq("id", cad.id);

      resultados.push({ cadencia_id: cad.id, status: "criado", geracao_id: geracao.id, destinatarios: destinatarios.length });
    } catch (err) {
      log.error("cadencia processing failed", { cadencia_id: cad.id, error: err instanceof Error ? err.message : String(err) });
      await supabase
        .from("apresentacao_cadencia")
        .update({
          ultima_execucao_em: new Date().toISOString(),
          ultima_execucao_status: `erro: ${err instanceof Error ? err.message : String(err)}`,
        })
        .eq("id", cad.id);
      resultados.push({ cadencia_id: cad.id, status: "erro", error: String(err) });
    }
  }

  return new Response(JSON.stringify({ ok: true, competencia: competencia.label, total: resultados.length, resultados }), { status: 200, headers: corsHeaders });
});