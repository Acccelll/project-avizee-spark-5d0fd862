// deno-lint-ignore-file no-explicit-any
// IMPORTANT: This function uses service role key and MUST NOT be accessed from arbitrary origins.
// The ALLOWED_ORIGIN env var MUST be set in production with the real application domain.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createLogger } from "../_shared/logger.ts";

// Lista de origens permitidas. Pode ser estendida via env `ALLOWED_ORIGIN`
// (lista separada por vírgula). Suporta:
//  - lovableproject.com / lovable.app (preview e publicação Lovable)
//  - sistema.avizee.com.br (custom domain atual)
//  - localhost para desenvolvimento
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

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ENV_ALLOWED.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (STATIC_ALLOWED_PATTERNS.some((re) => re.test(origin) || re.test(url.host) || re.test(url.hostname))) {
      return true;
    }
  } catch {
    // ignore parse errors
  }
  return false;
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && isOriginAllowed(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const INACTIVE_BAN_DURATION = "876000h";

type AppRole =
  | "admin"
  | "vendedor"
  | "financeiro"
  | "estoquista"
  | "gestor_compras"
  | "operador_logistico";

const VALID_ROLES: ReadonlySet<AppRole> = new Set([
  "admin",
  "vendedor",
  "financeiro",
  "estoquista",
  "gestor_compras",
  "operador_logistico",
]);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(data: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeRole(role: string | undefined): AppRole {
  if (typeof role === "string" && VALID_ROLES.has(role as AppRole)) return role as AppRole;
  return "vendedor";
}

/** Normaliza lista de roles secundários: dedupe, valida, exclui o padrão e o "admin" (admin nunca é secundário — é o role principal). */
function normalizeSecondaryRoles(value: unknown, padrao: AppRole): AppRole[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<AppRole>();
  for (const r of value) {
    if (typeof r !== "string") continue;
    if (!VALID_ROLES.has(r as AppRole)) continue;
    if (r === padrao) continue; // já é o padrão
    if (r === "admin") continue; // admin só como role padrão
    set.add(r as AppRole);
  }
  return Array.from(set);
}

function normalizePermissions(permissionKeys: unknown) {
  // Aceita 3 shapes (back-compat):
  //  1. `string[]`                        — só allow (legado)
  //  2. `{ allow, deny }`                 — tri-state explícito (novo)
  //  3. `null/undefined`                  — sem mudanças
  type Desired = { resource: string; action: string; allowed: boolean };
  const out: Desired[] = [];
  const seen = new Set<string>();

  const pushList = (list: unknown, allowed: boolean) => {
    if (!Array.isArray(list)) return;
    for (const value of list) {
      if (typeof value !== "string" || !value.includes(":")) continue;
      const [resource, action] = value.split(":");
      const key = `${resource}:${action}`;
      // `deny` vence se a mesma chave aparecer nos dois (defesa em profundidade)
      if (seen.has(key)) {
        const idx = out.findIndex((p) => `${p.resource}:${p.action}` === key);
        if (idx >= 0 && !allowed) out[idx].allowed = false;
        continue;
      }
      seen.add(key);
      out.push({ resource, action, allowed });
    }
  };

  if (Array.isArray(permissionKeys)) {
    pushList(permissionKeys, true);
  } else if (permissionKeys && typeof permissionKeys === "object") {
    const obj = permissionKeys as { allow?: unknown; deny?: unknown };
    pushList(obj.allow, true);
    pushList(obj.deny, false);
  }
  return out;
}

function isUserActive(user: any) {
  if (!user?.banned_until) return true;
  const bannedUntil = Date.parse(user.banned_until);
  return Number.isNaN(bannedUntil) || bannedUntil <= Date.now();
}

async function requireAdmin(serviceClient: any, req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sessão inválida.");
  const { data: authData, error: authError } = await serviceClient.auth.getUser(token);
  if (authError || !authData.user) throw new HttpError(401, "Sessão inválida.");
  const { data: roles, error: rolesError } = await serviceClient.from("user_roles").select("role").eq("user_id", authData.user.id);
  if (rolesError) throw rolesError;
  const isAdmin = (roles ?? []).some((row: any) => row.role === "admin");
  if (!isAdmin) throw new HttpError(403, "Apenas administradores podem gerenciar usuários.");
  return authData.user;
}

async function replaceUserRole(serviceClient: any, userId: string, role: AppRole) {
  const { error: deleteError } = await serviceClient.from("user_roles").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  const { error: insertError } = await serviceClient.from("user_roles").insert({ user_id: userId, role });
  if (insertError) throw insertError;
}

/**
 * Substitui o conjunto completo de roles do usuário pela união
 * `[padrao, ...secundarios]`. Mantém-se o padrão de delete+insert para
 * preservar a auditoria via trigger trg_audit_user_roles.
 * O "padrão" não é distinguido na tabela `user_roles`; a UI infere o padrão
 * pelo primeiro inserido (ordem preservada).
 */
async function replaceUserRoles(
  serviceClient: any,
  userId: string,
  padrao: AppRole,
  secundarios: AppRole[],
) {
  const { error: deleteError } = await serviceClient
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  // Dedupe defensivo, mantém ordem (padrao primeiro).
  const roles = [padrao, ...secundarios.filter((r) => r !== padrao)];
  const rows = roles.map((role) => ({ user_id: userId, role }));

  const { error: insertError } = await serviceClient
    .from("user_roles")
    .insert(rows);
  if (insertError) throw insertError;
}

async function resolveDefaultEmpresaId(serviceClient: any, actorUserId?: string): Promise<string | null> {
  if (actorUserId) {
    const { data: actorBinding, error: actorBindingError } = await serviceClient
      .from("user_empresas")
      .select("empresa_id")
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (actorBindingError) throw actorBindingError;
    if (actorBinding?.empresa_id) return actorBinding.empresa_id;
  }

  const { data: empresa, error: empresaError } = await serviceClient
    .from("empresas")
    .select("id")
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (empresaError) throw empresaError;

  return empresa?.id ?? null;
}

async function ensureUserEmpresa(
  serviceClient: any,
  userId: string,
  actorUserId?: string,
) {
  const { data: existingBinding, error: bindingError } = await serviceClient
    .from("user_empresas")
    .select("empresa_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (bindingError) throw bindingError;
  if (existingBinding?.empresa_id) return existingBinding.empresa_id;

  const empresaId = await resolveDefaultEmpresaId(serviceClient, actorUserId);
  if (!empresaId) {
    throw new HttpError(500, "Nenhuma empresa ativa encontrada para vincular o usuário.");
  }

  const { error: upsertError } = await serviceClient
    .from("user_empresas")
    .upsert({ user_id: userId, empresa_id: empresaId }, { onConflict: "user_id" });
  if (upsertError) throw upsertError;

  return empresaId;
}

async function replaceUserPermissions(serviceClient: any, userId: string, permissionKeys: unknown) {
  // Estratégia não-destrutiva (preserva granted_by/granted_at/motivo originais):
  //   INSERT  → permissões novas que não existiam.
  //   UPDATE  → permissões cujo `allowed` mudou (true↔false).
  //   UPDATE  → permissões hoje removidas do payload (allowed=false em vez de DELETE).
  // Histórico é capturado pelo trigger trg_user_permissions_audit.
  //
  // O payload aceita tanto `string[]` (legado, só allow) quanto
  // `{ allow, deny }` (novo, tri-state). Ver `normalizePermissions`.
  const desired = normalizePermissions(permissionKeys);
  const desiredMap = new Map(desired.map((p) => [`${p.resource}:${p.action}`, p.allowed]));

  const { data: current, error: fetchError } = await serviceClient
    .from("user_permissions")
    .select("resource, action, allowed")
    .eq("user_id", userId);
  if (fetchError) throw fetchError;

  const currentMap = new Map<string, { allowed: boolean }>(
    (current ?? []).map((r: any) => [`${r.resource}:${r.action}`, { allowed: r.allowed !== false }]),
  );

  // INSERTS
  const toInsert = desired
    .filter((p) => !currentMap.has(`${p.resource}:${p.action}`))
    .map((p) => ({ user_id: userId, ...p }));
  if (toInsert.length > 0) {
    const { error } = await serviceClient.from("user_permissions").insert(toInsert);
    if (error) throw error;
  }

  // FLIPS: linhas existentes cujo `allowed` precisa mudar para refletir o desired
  for (const p of desired) {
    const key = `${p.resource}:${p.action}`;
    const cur = currentMap.get(key);
    if (!cur) continue; // já tratado em INSERTS
    if (cur.allowed === p.allowed) continue; // sem mudança
    const { error } = await serviceClient
      .from("user_permissions")
      .update({ allowed: p.allowed, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("resource", p.resource).eq("action", p.action);
    if (error) throw error;
  }

  // OMITTED: linhas que estavam na tabela mas saíram do desired → tratar como
  // "remover override". Para preservar histórico, marcamos allowed=false. Se
  // a permissão antes era allow, isso vira deny (decisão consciente: "removi"
  // = "não quero mais que herde"). Para restaurar herança, reenviar com a
  // chave em `allow` ou apagar manualmente.
  for (const [key, val] of currentMap) {
    if (desiredMap.has(key)) continue;
    if (!val.allowed) continue; // já está false; nada a fazer
    const [resource, action] = key.split(":");
    const { error } = await serviceClient
      .from("user_permissions")
      .update({ allowed: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("resource", resource).eq("action", action);
    if (error) throw error;
  }
}

async function setUserActiveStatus(serviceClient: any, userId: string, ativo: boolean) {
  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    ban_duration: ativo ? "none" : INACTIVE_BAN_DURATION,
  });
  if (error) throw error;
  // Replica em profiles.ativo para queries client-side simples
  await serviceClient.from("profiles").update({ ativo, updated_at: new Date().toISOString() }).eq("id", userId);

  // Ao **inativar**, revogar sessões ativas — caso contrário, o usuário banido
  // continua com JWT válido até o access token expirar (~1h). Não bloqueia o
  // fluxo se falhar (banido já não consegue renovar refresh token).
  if (!ativo) {
    try {
      await serviceClient.auth.admin.signOut(userId, "global");
    } catch (signOutErr) {
      console.warn("[admin-users] signOut on deactivate failed", signOutErr);
    }
  }
}

async function insertAudit(
  serviceClient: any,
  actorId: string,
  targetUserId: string,
  rolePadrao: string | null,
  alteracao: Record<string, unknown>,
  opts: { tipoAcao?: string; entidade?: string; entidadeId?: string; motivo?: string } = {},
) {
  const { error } = await serviceClient.from("permission_audit").insert({
    user_id: actorId,
    target_user_id: targetUserId,
    role_padrao: rolePadrao,
    alteracao,
    tipo_acao: opts.tipoAcao ?? (alteracao.tipo as string | undefined) ?? "legacy",
    entidade: opts.entidade ?? "user",
    entidade_id: opts.entidadeId ?? targetUserId,
    motivo: opts.motivo ?? null,
  });
  if (error) throw error;
}

async function listUsers(serviceClient: any) {
  const [authUsersResult, profilesResult, rolesResult, permissionsResult] = await Promise.all([
    serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    serviceClient.from("profiles").select("id, nome, email, cargo, created_at, updated_at"),
    serviceClient.from("user_roles").select("user_id, role"),
    // Carrega allow E deny — UI tri-state precisa dos dois, e o badge "exceções"
    // passa a contar tanto concedidas quanto revogadas.
    serviceClient.from("user_permissions").select("user_id, resource, action, allowed"),
  ]);

  if (authUsersResult.error) throw authUsersResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (rolesResult.error) throw rolesResult.error;
  if (permissionsResult.error) throw permissionsResult.error;

  const authUsers = authUsersResult.data.users ?? [];
  const profiles = profilesResult.data ?? [];
  const roles = rolesResult.data ?? [];
  const permissions = permissionsResult.data ?? [];

  const authMap = new Map(authUsers.map((user: any) => [user.id, user]));
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

  const roleMap = new Map<string, AppRole[]>();
  for (const roleRow of roles) {
    const uid = (roleRow as any).user_id as string;
    const existing = roleMap.get(uid) ?? [];
    existing.push(normalizeRole((roleRow as any).role));
    roleMap.set(uid, existing);
  }

  const allowMap = new Map<string, string[]>();
  const denyMap = new Map<string, string[]>();
  for (const permission of permissions) {
    const uid = (permission as any).user_id as string;
    const key = `${(permission as any).resource}:${(permission as any).action}`;
    const target = (permission as any).allowed === false ? denyMap : allowMap;
    const existing = target.get(uid) ?? [];
    existing.push(key);
    target.set(uid, existing);
  }

  const userIds = new Set<string>([
    ...authUsers.map((user: any) => user.id as string),
    ...profiles.map((profile: any) => profile.id as string),
  ]);

  return Array.from(userIds)
    .map((userId) => {
      const authUser = authMap.get(userId) as any;
      const profile = profileMap.get(userId) as any;
      const email = profile?.email ?? authUser?.email ?? null;
      const fallbackName = authUser?.user_metadata?.full_name || (email as string)?.split("@")[0] || "Usuário";

      return {
        id: userId,
        nome: profile?.nome ?? fallbackName,
        email,
        cargo: profile?.cargo ?? null,
        ativo: isUserActive(authUser),
        created_at: profile?.created_at ?? authUser?.created_at ?? new Date().toISOString(),
        updated_at: profile?.updated_at ?? authUser?.updated_at ?? profile?.created_at ?? new Date().toISOString(),
        // Convenção: o primeiro role inserido (preservado pela ordem do array) é o padrão;
        // os demais são secundários cumulativos. Se houver `admin` no conjunto, ele é
        // promovido a padrão automaticamente (admin nunca é secundário).
        ...(() => {
          const all = roleMap.get(userId) ?? [];
          if (all.length === 0) {
            return { role_padrao: "vendedor" as AppRole, roles_secundarios: [] as AppRole[] };
          }
          const adminIdx = all.indexOf("admin");
          const padrao = adminIdx >= 0 ? "admin" : all[0];
          const secundarios = all.filter((r) => r !== padrao);
          return { role_padrao: padrao, roles_secundarios: secundarios };
        })(),
        extra_permissions: allowMap.get(userId) ?? [],
        denied_permissions: denyMap.get(userId) ?? [],
        last_sign_in: authUser?.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("admin-users", req);

  if (origin && !isOriginAllowed(origin)) {
    log.warn("origin not allowed", { origin });
    return json({ error: `Origem não permitida: ${origin}` }, 403, corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const currentUser = await requireAdmin(serviceClient, req);
    const { action, payload = {} } = await req.json();

    if (action === "list") {
      return json({ users: await listUsers(serviceClient) }, 200, corsHeaders);
    }

    if (action === "create") {
      const nome = String(payload.nome ?? "").trim();
      const email = String(payload.email ?? "").trim().toLowerCase();
      const cargo = String(payload.cargo ?? "").trim();
      const ativo = payload.ativo !== false;
      const rolePadrao = normalizeRole(payload.role_padrao);
      // Senha opcional definida pelo admin. Se vier, valida estrutura mínima
      // (mesma régua de `src/lib/passwordPolicy.ts`) e pula o convite por
      // e-mail — o admin assume a entrega da senha pessoalmente.
      const manualPassword = typeof payload.password === "string" ? payload.password : "";
      if (manualPassword) {
        const okLen = manualPassword.length >= 8;
        const okCase = /[A-Z]/.test(manualPassword) && /[a-z]/.test(manualPassword);
        const okDigit = /\d/.test(manualPassword);
        if (!okLen || !okCase || !okDigit) {
          throw new HttpError(400, "Senha não atende à política mínima (8+ chars, maiúscula, minúscula, número).");
        }
      }

      if (!nome || !email) throw new HttpError(400, "Nome e e-mail são obrigatórios.");
      log.info("create: starting", { email, nome, rolePadrao });
      const rolesSecundarios = normalizeSecondaryRoles(payload.roles_secundarios, rolePadrao);

      const existingUsersResult = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (existingUsersResult.error) throw existingUsersResult.error;
      const alreadyExists = (existingUsersResult.data.users ?? []).some((user: any) => user.email?.toLowerCase() === email);
      if (alreadyExists) throw new HttpError(409, "Já existe um usuário cadastrado com este e-mail.");

      // Tenta convite por e-mail (requer SMTP). Em qualquer falha (ex.: SMTP não configurado),
      // faz fallback para createUser com senha temporária + recovery link, sem bloquear o admin.
      let targetUser: any = null;
      let tempPassword: string | null = null;
      let recoveryLink: string | null = null;
      let inviteSent = false;

      if (manualPassword) {
        // Caminho direto: admin definiu a senha. Cria usuário já confirmado.
        const createResult = await serviceClient.auth.admin.createUser({
          email,
          password: manualPassword,
          email_confirm: true,
          user_metadata: { full_name: nome },
        });
        if (createResult.error || !createResult.data?.user) {
          log.error("create: createUser with manual password failed", createResult.error);
          throw createResult.error ?? new Error("Falha ao criar usuário com a senha informada.");
        }
        targetUser = createResult.data.user;
        log.info("create: user created with admin-provided password", { userId: targetUser.id });
      } else try {
        const inviteResult = await serviceClient.auth.admin.inviteUserByEmail(email, { data: { full_name: nome } });
        if (inviteResult.error) throw inviteResult.error;
        if (!inviteResult.data?.user) throw new Error("Resposta vazia ao convidar usuário.");
        targetUser = inviteResult.data.user;
        inviteSent = true;
        log.info("create: invite sent successfully", { userId: targetUser.id });
      } catch (inviteErr) {
        log.warn("create: invite failed, falling back to createUser", inviteErr);
        // Fallback: cria usuário diretamente com senha temporária
        tempPassword = `Tmp-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`;
        const createResult = await serviceClient.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: nome },
        });
        if (createResult.error || !createResult.data?.user) {
          log.error("create: createUser fallback failed", createResult.error);
          throw createResult.error ?? new Error("Falha ao criar usuário (fallback).");
        }
        targetUser = createResult.data.user;
        // Tenta gerar link de recuperação para o usuário definir a própria senha
        try {
          const linkResult = await serviceClient.auth.admin.generateLink({
            type: "recovery",
            email,
          });
          if (!linkResult.error) {
            recoveryLink = linkResult.data?.properties?.action_link ?? null;
          }
        } catch (linkErr) {
          log.warn("create: generateLink failed", linkErr);
        }
      }

      const now = new Date().toISOString();

      const { error: profileError } = await serviceClient.from("profiles").upsert({ id: targetUser.id, nome, email, cargo: cargo || null, updated_at: now }, { onConflict: "id" });
      if (profileError) {
        log.error("create: profile upsert failed", profileError);
        throw profileError;
      }

      await ensureUserEmpresa(serviceClient, targetUser.id, currentUser.id);
      await replaceUserRoles(serviceClient, targetUser.id, rolePadrao, rolesSecundarios);
      await replaceUserPermissions(serviceClient, targetUser.id, payload.extra_permissions);
      if (!ativo) await setUserActiveStatus(serviceClient, targetUser.id, false);

      await insertAudit(serviceClient, currentUser.id, targetUser.id, rolePadrao, {
        tipo: "user_create",
        email,
        cargo: cargo || null,
        ativo,
        extra_permissions: payload.extra_permissions ?? [],
        roles_secundarios: rolesSecundarios,
      });

      return json({
        ok: true,
        userId: targetUser.id,
        inviteSent,
        // Em modo fallback, devolve credenciais temporárias para o admin entregar manualmente
        tempPassword,
        recoveryLink,
      }, 200, corsHeaders);
    }

    if (action === "update") {
      const id = String(payload.id ?? "").trim();
      const nome = String(payload.nome ?? "").trim();
      const email = String(payload.email ?? "").trim().toLowerCase();
      const cargo = String(payload.cargo ?? "").trim();
      const ativo = payload.ativo !== false;
      const rolePadrao = normalizeRole(payload.role_padrao);
      const motivo = typeof payload.motivo === "string" && payload.motivo.trim()
        ? payload.motivo.trim().slice(0, 500)
        : undefined;

      if (!id || !nome) throw new HttpError(400, "Usuário inválido.");
      const rolesSecundariosUpd = normalizeSecondaryRoles(payload.roles_secundarios, rolePadrao);

      const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(id, { user_metadata: { full_name: nome } });
      if (authUpdateError) throw authUpdateError;

      const { error: profileError } = await serviceClient.from("profiles").upsert({ id, nome, email: email || null, cargo: cargo || null, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (profileError) throw profileError;

      await ensureUserEmpresa(serviceClient, id, currentUser.id);
      await replaceUserRoles(serviceClient, id, rolePadrao, rolesSecundariosUpd);
      await replaceUserPermissions(serviceClient, id, payload.extra_permissions);
      await setUserActiveStatus(serviceClient, id, ativo);

      await insertAudit(serviceClient, currentUser.id, id, rolePadrao, {
        tipo: "user_update",
        cargo: cargo || null,
        ativo,
        extra_permissions: payload.extra_permissions ?? [],
        roles_secundarios: rolesSecundariosUpd,
      }, { motivo });

      return json({ ok: true }, 200, corsHeaders);
    }

    if (action === "toggle-status") {
      const id = String(payload.id ?? "").trim();
      const ativo = payload.ativo === true;
      const motivo = typeof payload.motivo === "string" && payload.motivo.trim()
        ? payload.motivo.trim().slice(0, 500)
        : undefined;
      if (!id) throw new HttpError(400, "Usuário inválido.");
      await setUserActiveStatus(serviceClient, id, ativo);
      await insertAudit(serviceClient, currentUser.id, id, null, { tipo: "status_change", ativo }, { motivo });
      return json({ ok: true }, 200, corsHeaders);
    }

    if (action === "resend-invite") {
      const id = String(payload.id ?? "").trim();
      const emailIn = String(payload.email ?? "").trim().toLowerCase();
      if (!id && !emailIn) throw new HttpError(400, "Usuário inválido.");

      // Resolve e-mail a partir do id se necessário
      let email = emailIn;
      if (!email && id) {
        const { data: u, error: getErr } = await serviceClient.auth.admin.getUserById(id);
        if (getErr) throw getErr;
        email = u?.user?.email?.toLowerCase() ?? "";
      }
      if (!email) throw new HttpError(400, "Usuário sem e-mail cadastrado.");

      let inviteSent = false;
      let recoveryLink: string | null = null;
      let tempPassword: string | null = null;

      // 1) Tenta reenviar convite por e-mail (requer SMTP configurado)
      try {
        const inviteResult = await serviceClient.auth.admin.inviteUserByEmail(email);
        if (inviteResult.error) throw inviteResult.error;
        inviteSent = true;
      } catch (inviteErr) {
        log.warn("resend-invite: invite failed, generating recovery link", inviteErr);
        // 2) Fallback: gera link de recuperação para o admin entregar manualmente
        try {
          const linkResult = await serviceClient.auth.admin.generateLink({ type: "recovery", email });
          if (linkResult.error) throw linkResult.error;
          recoveryLink = linkResult.data?.properties?.action_link ?? null;
        } catch (linkErr) {
          log.error("resend-invite: generateLink failed", linkErr);
          // 3) Último recurso: senha temporária
          tempPassword = `Tmp-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`;
          const { error: pwErr } = await serviceClient.auth.admin.updateUserById(id, { password: tempPassword });
          if (pwErr) throw pwErr;
        }
      }

      await insertAudit(serviceClient, currentUser.id, id || email, null, {
        tipo: "invite_resent", email, inviteSent, hasRecoveryLink: !!recoveryLink, hasTempPassword: !!tempPassword,
      });

      return json({ ok: true, inviteSent, recoveryLink, tempPassword }, 200, corsHeaders);
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    log.error("request failed", error);
    if (error instanceof HttpError) return json({ error: error.message }, error.status, corsHeaders);
    return json({ error: error instanceof Error ? error.message : "Erro interno ao gerenciar usuários." }, 500, corsHeaders);
  }
});
