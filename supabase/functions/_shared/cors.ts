// Shared CORS helper for Lovable/Avizee edge functions.
//
// Strategy: allow Lovable preview/published hosts, the production custom
// domain, and localhost for dev. Additional origins can be appended via the
// ALLOWED_ORIGIN env var (comma-separated list of full origins).
//
// For sensitive functions (service role, admin endpoints), prefer
// `buildCorsHeaders(origin)` which echoes the request origin only when it
// matches the allow-list. Falls back to `*` only if no origin is present.

const STATIC_ALLOWED_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /\.lovableproject\.com$/i,
  /\.lovable\.app$/i,
  /\.lovable\.dev$/i,
  /^https?:\/\/sistema\.avizee\.com\.br$/i,
];

const ENV_ALLOWED = (Deno.env.get("ALLOWED_ORIGIN") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ENV_ALLOWED.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (
      STATIC_ALLOWED_PATTERNS.some(
        (re) => re.test(origin) || re.test(url.host) || re.test(url.hostname),
      )
    ) {
      return true;
    }
  } catch {
    // ignore parse errors
  }
  return false;
}

const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

export function buildCorsHeaders(
  origin: string | null,
  opts: { methods?: string; allowHeaders?: string } = {},
): Record<string, string> {
  const allow = origin && isOriginAllowed(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": opts.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": opts.methods ?? "POST, OPTIONS",
    "Vary": "Origin",
  };
}
