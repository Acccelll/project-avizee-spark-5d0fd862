const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://consultadanfe.com/api/v1";

interface ReqBody {
  action: "consulta" | "danfe";
  chave: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("CONSULTADANFE_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "CONSULTADANFE_API_KEY não configurado." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const chave = String(body?.chave ?? "").replace(/\D/g, "");
  if (chave.length !== 44) {
    return new Response(
      JSON.stringify({ error: "Chave de acesso inválida — exige 44 dígitos." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const action = body.action ?? "consulta";
  const endpoint = action === "danfe" ? "/danfe" : "/consulta";

  try {
    const upstream = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ chave }),
    });

    const text = await upstream.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    return new Response(
      JSON.stringify({
        ok: upstream.ok,
        status: upstream.status,
        errorCode: upstream.headers.get("x-error-code") ?? null,
        data: parsed,
      }),
      {
        status: upstream.ok ? 200 : upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});