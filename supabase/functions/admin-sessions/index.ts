// deno-lint-ignore-file no-explicit-any
/**
 * Edge Function: admin-sessions
 * Lista e revoga sessões de usuários (somente para administradores).
 *
 * POST { action: "list" }     → lista todos os usuários com info de sessão
 * POST { action: "revoke", userId: "..." } → revoga todas as sessões do usuário
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createLogger } from "../_shared/logger.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const moduleLog = createLogger("admin-sessions");

function json(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(serviceClient: any, req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw { status: 401, message: "Sessão inválida." };

  const { data: authData, error: authError } =
    await serviceClient.auth.getUser(token);
  if (authError || !authData.user)
    throw { status: 401, message: "Sessão inválida." };

  const { data: roles } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);

  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin)
    throw {
      status: 403,
      message: "Apenas administradores podem gerenciar sessões.",
    };

  return authData.user;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await requireAdmin(serviceClient, req);

    const { action, userId } = await req.json();

    if (action === "metrics") {
      const { data: usersData, error: usersError } =
        await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw usersError;

      const now = Date.now();
      const ACTIVE_WINDOW_MS = 30 * 60 * 1000; // 30 min
      const INACTIVE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 d

      let ativas = 0;
      let inativasMais30d = 0;
      const users = usersData.users ?? [];
      for (const u of users as any[]) {
        const last = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : null;
        if (last && now - last <= ACTIVE_WINDOW_MS) ativas += 1;
        if (!last || now - last > INACTIVE_THRESHOLD_MS) inativasMais30d += 1;
      }

      return json({ ativas, inativasMais30d, totalUsuarios: users.length }, 200, corsHeaders);
    }

    if (action === "list") {
      const { data: usersData, error: usersError } =
        await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw usersError;

      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("id, nome");
      const profileMap = new Map(
        (profiles ?? []).map((p: any) => [p.id, p.nome]),
      );

      const sessoes = (usersData.users ?? []).map((user: any) => ({
        id: user.id,
        user_id: user.id,
        user_email: user.email ?? null,
        user_name: profileMap.get(user.id) ?? user.user_metadata?.full_name ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        user_agent: null, // Not available via admin API
        ip: null, // Not available via admin API
      }));

      return json(sessoes, 200, corsHeaders);
    }

    if (action === "revoke") {
      if (!userId) return json({ error: "userId é obrigatório" }, 400, corsHeaders);

      const { error } = await serviceClient.auth.admin.signOut(userId, "global");
      if (error) throw error;

      return json({ success: true }, 200, corsHeaders);
    }

    return json({ error: "Ação inválida. Use 'list' ou 'revoke'." }, 400, corsHeaders);
  } catch (err: any) {
    moduleLog.error("Request failed", err);
    const status = err.status ?? 500;
    const message =
      err.message ?? "Erro interno ao gerenciar sessões.";
    return json({ error: message }, status, corsHeaders);
  }
});
