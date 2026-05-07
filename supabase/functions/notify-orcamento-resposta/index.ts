// Recebe {token, acao} do site público após `acao_cliente_orcamento`.
// Localiza o orçamento, vendedor (com fallback para admins) e dispara o
// template transacional `orcamento-respondido`. Idempotente por (id, acao).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Payload {
  token?: string
  acao?: 'aprovado' | 'rejeitado'
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = (await req.json().catch(() => ({}))) as Payload
    const token = (body.token ?? '').trim()
    const acao = body.acao
    if (!token || (acao !== 'aprovado' && acao !== 'rejeitado')) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    })

    // Busca orçamento pelo token (ignora RLS via service role).
    const { data: orc, error: orcErr } = await admin
      .from('orcamentos')
      .select(
        'id, numero, status, vendedor_id, cliente_resposta_comentario, cliente_resposta_em, cliente_id',
      )
      .eq('public_token', token)
      .maybeSingle()

    if (orcErr || !orc) {
      return new Response(JSON.stringify({ error: 'orcamento_nao_encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (orc.status !== acao) {
      // RPC ainda não rodou ou status incompatível — não envia.
      return new Response(JSON.stringify({ skipped: true, reason: 'status_mismatch' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cliente (para o nome amigável no email).
    let clienteNome: string | undefined
    if (orc.cliente_id) {
      const { data: cli } = await admin
        .from('clientes')
        .select('nome_razao_social')
        .eq('id', orc.cliente_id)
        .maybeSingle()
      clienteNome = cli?.nome_razao_social ?? undefined
    }

    // Determina destinatários: vendedor responsável + admins (fallback).
    const destinatarios = new Set<string>()
    if (orc.vendedor_id) {
      const { data: vend } = await admin
        .from('profiles')
        .select('email')
        .eq('id', orc.vendedor_id)
        .maybeSingle()
      if (vend?.email) destinatarios.add(vend.email.toLowerCase())
    }

    if (destinatarios.size === 0) {
      // Sem vendedor — busca admins via has_role.
      const { data: admins } = await admin
        .from('user_roles')
        .select('user_id, profiles:profiles!inner(email)')
        .eq('role', 'admin')
      ;(admins ?? []).forEach((row: { profiles?: { email?: string | null } | null }) => {
        const e = row.profiles?.email
        if (e) destinatarios.add(e.toLowerCase())
      })
    }

    if (destinatarios.size === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'sem_destinatarios' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const origin = req.headers.get('origin') ?? 'https://sistema.avizee.com.br'
    const linkInterno = `${origin}/orcamentos/${orc.id}`
    const respondidoEm = fmtDateTime(orc.cliente_resposta_em)

    const results: Array<{ to: string; ok: boolean; error?: string }> = []
    for (const recipientEmail of destinatarios) {
      const idempotencyKey = `orc-resp-${orc.id}-${acao}-${recipientEmail}`
      const { error: invokeErr } = await admin.functions.invoke(
        'send-transactional-email',
        {
          body: {
            templateName: 'orcamento-respondido',
            recipientEmail,
            idempotencyKey,
            templateData: {
              numero: orc.numero,
              clienteNome,
              acao,
              comentario: orc.cliente_resposta_comentario ?? undefined,
              respondidoEm,
              linkInterno,
            },
          },
        },
      )
      results.push({
        to: recipientEmail,
        ok: !invokeErr,
        error: invokeErr?.message,
      })
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'internal', message: (err as Error)?.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})