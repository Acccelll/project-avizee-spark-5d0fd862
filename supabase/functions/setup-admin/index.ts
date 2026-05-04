// DISABLED — esta função foi um bootstrap inseguro com credenciais hardcoded
// (admin@avizee.com / admin123456) e sem autenticação. Mantida apenas como
// stub que responde 410 Gone para preservar a rota e evitar que callers antigos
// rebentem com 404 confuso. Não reativar — qualquer provisionamento de admin
// deve ser feito via Supabase Auth Admin (Dashboard > Cloud > Users).

import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve((req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "gone",
      message:
        "setup-admin foi descontinuado. Crie administradores pelo painel de Cloud > Users.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
