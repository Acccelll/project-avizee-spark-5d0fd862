import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";

/**
 * Social Media Sync Edge Function
 * Supports syncing insights from Instagram Business and LinkedIn Pages.
 *
 * POST /social-sync?platform=instagram_business
 *   Body: { account_id: string, access_token?: string }
 *
 * POST /social-sync?platform=linkedin_page
 *   Body: { account_id: string, access_token?: string }
 *
 * If no access_token is provided, falls back to env secrets:
 *   INSTAGRAM_ACCESS_TOKEN, LINKEDIN_ACCESS_TOKEN
 */
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get("platform");

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Use POST" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    if (platform === "instagram_business") {
      return await syncInstagram(accountId, body.access_token, corsHeaders);
    }

    if (platform === "linkedin_page") {
      return await syncLinkedIn(accountId, body.access_token);
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

async function syncInstagram(accountId: string, tokenOverride?: string) {
  const token = tokenOverride || Deno.env.get("INSTAGRAM_ACCESS_TOKEN");

  if (!token) {
    // Return mock data when no token configured
    return new Response(
      JSON.stringify({
        success: true,
        mode: "mock",
        message: "Token do Instagram não configurado. Retornando dados simulados.",
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

async function syncLinkedIn(accountId: string, tokenOverride?: string) {
  const token = tokenOverride || Deno.env.get("LINKEDIN_ACCESS_TOKEN");

  if (!token) {
    return new Response(
      JSON.stringify({
        success: true,
        mode: "mock",
        message: "Token do LinkedIn não configurado. Retornando dados simulados.",
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
