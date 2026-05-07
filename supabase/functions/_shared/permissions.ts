// deno-lint-ignore-file no-explicit-any
/**
 * Helpers de autorização para Edge Functions.
 *
 * Centraliza a verificação de `user_permissions` e `user_roles` para evitar
 * que cada edge function reimplemente a lógica de RBAC. Usa SERVICE_ROLE
 * porque RLS de `user_permissions` exige `auth.uid()` e não conseguimos
 * confiar em getUser() para resolver permissões expiradas.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface PermissionRequirement {
  resource: string;
  action: string;
}

/**
 * Valida que o usuário tem PELO MENOS UMA das permissões listadas
 * (`allowed`) ou é admin via `user_roles`. Lança erro `403` em caso
 * contrário; o handler chamador deve mapear para HTTP 403.
 */
export async function requireAnyPermission(
  userId: string,
  allowed: PermissionRequirement[],
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Admin global passa direto.
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roleRows?.some((r: any) => r.role === "admin")) return;

  const orFilter = allowed
    .map((p) => `and(resource.eq.${p.resource},action.eq.${p.action})`)
    .join(",");

  const { data, error } = await admin
    .from("user_permissions")
    .select("resource, action, allowed, expires_at")
    .eq("user_id", userId)
    .eq("allowed", true)
    .or(orFilter);

  if (error) {
    throw Object.assign(new Error(`Falha ao verificar permissões: ${error.message}`), {
      status: 500,
    });
  }

  const now = Date.now();
  const valid = (data ?? []).some((row: any) => {
    if (!row.expires_at) return true;
    return new Date(row.expires_at).getTime() > now;
  });

  if (!valid) {
    throw Object.assign(
      new Error(
        `Permissão negada — requer uma de: ${
          allowed.map((a) => `${a.resource}:${a.action}`).join(", ")
        }`,
      ),
      { status: 403 },
    );
  }
}
