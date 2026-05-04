---
name: Edge Functions CORS infra
description: Shared CORS helper supabase/functions/_shared/cors.ts; ALLOWED_ORIGIN env appends extra origins
type: feature
---

All edge functions MUST import CORS headers from `supabase/functions/_shared/cors.ts`:

```ts
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // ...
});
```

Allow-list (always): localhost, 127.0.0.1, *.lovableproject.com, *.lovable.app, *.lovable.dev, https://sistema.avizee.com.br.
`ALLOWED_ORIGIN` env var (comma-separated) appends extra origins.

Echoes the request `Origin` only when allow-listed; otherwise falls back to `*`. Adds `Vary: Origin`.

Default `Access-Control-Allow-Headers` already includes Supabase client headers. Default `Methods`: `POST, OPTIONS` (override via opts).

Migrated functions: `admin-users`, `admin-sessions`, `setup-admin`, `social-sync`. Functions still using inline headers should be migrated when touched.