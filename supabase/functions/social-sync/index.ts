import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireAnyPermission } from "../_shared/permissions.ts";

/**
 * Social Media Sync Edge Function
 * Onda 10 — exige autenticação via JWT + permissão `social:sincronizar` ou
 * papel admin, e valida ownership da `account_id` na tabela `social_contas`.
 * Mock só é retornado quando o token está ausente E `SOCIAL_SYNC_ALLOW_MOCK`
 * estiver ativo (uso em dev). Em produção, retorna 422 `TOKEN_NOT_CONFIGURED`.
 */
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get("platform");
    const mockOverride = url.searchParams.get("mock") === "1";

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Use POST" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Auth: exige JWT válido ────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    try {
      await requireAnyPermission(authData.user.id, [
        { resource: "social", action: "sincronizar" },
      ]);
    } catch (permErr) {
      const status = (permErr as { status?: number })?.status ?? 403;
      return new Response(
        JSON.stringify({ error: (permErr as Error).message }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const accountId = body.account_id;

    if (!platform || !accountId) {
      return new Response(
        JSON.stringify({ error: "platform (query) e account_id (body) são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Ownership: account_id existe e plataforma bate ────────────
    const { data: contaRow, error: contaErr } = await serviceClient
      .from("social_contas")
      .select("id, plataforma, ativo")
      .eq("id", accountId)
      .maybeSingle();
    if (contaErr) {
      return new Response(
        JSON.stringify({ error: `Falha ao validar conta: ${contaErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!contaRow || contaRow.ativo === false) {
      return new Response(
        JSON.stringify({ error: "Conta não encontrada." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (contaRow.plataforma !== platform) {
      return new Response(
        JSON.stringify({ error: "Plataforma não corresponde à conta informada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (platform === "instagram_business") {
      return await syncInstagram(accountId, body.access_token, corsHeaders, mockOverride);
    }

    if (platform === "linkedin_page") {
      return await syncLinkedIn(accountId, body.access_token, corsHeaders, mockOverride);
    }

    return new Response(
      JSON.stringify({ error: `Plataforma "${platform}" não suportada. Use instagram_business ou linkedin_page.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[social-sync]", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function mockAllowed(): boolean {
  return Deno.env.get("SOCIAL_SYNC_ALLOW_MOCK") === "true";
}

function tokenMissingResponse(
  platform: "Instagram" | "LinkedIn",
  corsHeaders: Record<string, string>,
) {
  return new Response(
    JSON.stringify({
      success: false,
      error: "TOKEN_NOT_CONFIGURED",
      message: `Token do ${platform} não configurado. Configure em Administração > Social.`,
    }),
    { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function syncInstagram(
  accountId: string,
  tokenOverride: string | undefined,
  corsHeaders: Record<string, string>,
  mockOverride: boolean,
) {
  const token = tokenOverride || Deno.env.get("INSTAGRAM_ACCESS_TOKEN");

  if (!token) {
    if (!(mockOverride && mockAllowed())) {
      return tokenMissingResponse("Instagram", corsHeaders);
    }
    // Mock explícito (dev) — só com flag SOCIAL_SYNC_ALLOW_MOCK=true.
    return new Response(
      JSON.stringify({
        success: true,
        mode: "mock",
        message: "Mock explícito (?mock=1) — não use em produção.",
        data: generateMockInstagramData(),
        syncedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Fetch Instagram Business Account insights
    const [profileRes, mediaRes, insightsRes] = await Promise.all([
      fetch(`https://graph.facebook.com/v19.0/${accountId}?fields=id,name,username,followers_count,media_count,profile_picture_url&access_token=${token}`),
      fetch(`https://graph.facebook.com/v19.0/${accountId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,permalink&limit=25&access_token=${token}`),
      fetch(`https://graph.facebook.com/v19.0/${accountId}/insights?metric=impressions,reach,profile_views&period=day&since=${getDateNDaysAgo(30)}&until=${getTodayISO()}&access_token=${token}`),
    ]);

    const profile = await profileRes.json();
    const media = await mediaRes.json();
    const insights = await insightsRes.json();

    if (profile.error) {
      throw new Error(`Instagram API: ${profile.error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "live",
        data: {
          profile,
          recentMedia: media.data || [],
          insights: insights.data || [],
        },
        syncedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

async function syncLinkedIn(
  accountId: string,
  tokenOverride: string | undefined,
  corsHeaders: Record<string, string>,
  mockOverride: boolean,
) {
  const token = tokenOverride || Deno.env.get("LINKEDIN_ACCESS_TOKEN");

  if (!token) {
    if (!(mockOverride && mockAllowed())) {
      return tokenMissingResponse("LinkedIn", corsHeaders);
    }
    return new Response(
      JSON.stringify({
        success: true,
        mode: "mock",
        message: "Mock explícito (?mock=1) — não use em produção.",
        data: generateMockLinkedInData(),
        syncedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Fetch LinkedIn Organization data
    const orgRes = await fetch(
      `https://api.linkedin.com/v2/organizations/${accountId}?projection=(id,localizedName,vanityName,logoV2)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    const orgData = await orgRes.json();

    if (orgData.status === 401 || orgData.status === 403) {
      throw new Error(`LinkedIn API: ${orgData.message || "Unauthorized"}`);
    }

    // Fetch follower statistics
    const statsRes = await fetch(
      `https://api.linkedin.com/v2/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${accountId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );
    const statsData = await statsRes.json();

    return new Response(
      JSON.stringify({
        success: true,
        mode: "live",
        data: {
          organization: orgData,
          followerStats: statsData.elements || [],
        },
        syncedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateMockInstagramData() {
  return {
    profile: {
      id: "mock_ig_001",
      name: "Empresa Demo",
      username: "empresa_demo",
      followers_count: 4520,
      media_count: 187,
    },
    recentMedia: Array.from({ length: 10 }, (_, i) => ({
      id: `post_${i}`,
      media_type: i % 3 === 0 ? "VIDEO" : i % 2 === 0 ? "CAROUSEL_ALBUM" : "IMAGE",
      like_count: Math.floor(Math.random() * 200) + 20,
      comments_count: Math.floor(Math.random() * 30) + 2,
      timestamp: new Date(Date.now() - i * 86400000 * 2).toISOString(),
    })),
    insights: [
      { name: "impressions", values: [{ value: 12450 }] },
      { name: "reach", values: [{ value: 8900 }] },
      { name: "profile_views", values: [{ value: 340 }] },
    ],
  };
}

function generateMockLinkedInData() {
  return {
    organization: {
      id: "mock_li_001",
      localizedName: "Empresa Demo LTDA",
      vanityName: "empresa-demo",
    },
    followerStats: [
      { followerCounts: { organicFollowerCount: 1250, paidFollowerCount: 80 } },
    ],
  };
}
