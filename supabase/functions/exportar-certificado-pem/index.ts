// deno-lint-ignore-file no-explicit-any
/**
 * Edge Function: exportar-certificado-pem (TEMPORÁRIA / admin-only)
 *
 * Lê o .pfx armazenado em `dbavizee/certificados/empresa.pfx` e a senha do
 * Vault (`CERTIFICADO_PFX_SENHA`) e devolve `cert.pem` (cadeia completa) +
 * `key.pem` em texto, para upload no Cloudflare (mTLS Certificates).
 *
 * APAGAR após subir os PEMs no Cloudflare.
 */

import forge from "https://esm.sh/node-forge@1.3.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const STORAGE_BUCKET = "dbavizee";
const STORAGE_PATH = "certificados/empresa.pfx";
const VAULT_SECRET_NAME = "CERTIFICADO_PFX_SENHA";

function pfxToPem(base64: string, senha: string) {
  const derBytes = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const pfx = forge.pkcs12.pkcs12FromAsn1(asn1, senha);

  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX.");

  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
  const allCerts = (certBags[forge.pki.oids.certBag] ?? [])
    .map((b: any) => b?.cert)
    .filter((c: any): c is forge.pki.Certificate => !!c);
  if (allCerts.length === 0) throw new Error("Certificado X.509 não encontrado no PFX.");

  const subjectHash = (c: forge.pki.Certificate) =>
    c.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(",");
  const issuerHash = (c: forge.pki.Certificate) =>
    c.issuer.attributes.map((a) => `${a.shortName}=${a.value}`).join(",");
  const subjectsThatAreIssuers = new Set(allCerts.map((c) => issuerHash(c)));
  const leaf =
    allCerts.find((c) => !subjectsThatAreIssuers.has(subjectHash(c))) ?? allCerts[0];
  const intermediates = allCerts.filter((c) => c !== leaf);

  const certPem = [leaf, ...intermediates]
    .map((c) => forge.pki.certificateToPem(c))
    .join("\n");
  const keyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);

  let cnpj = "";
  const sn = leaf.subject.getField({ shortName: "serialNumber" });
  if (sn) cnpj = String(sn.value).replace(/\D/g, "");
  if (!cnpj || cnpj.length < 14) {
    const cn = leaf.subject.getField("CN");
    if (cn) {
      const m = String(cn.value).match(/(\d{14})/);
      if (m) cnpj = m[1];
    }
  }

  const validadeFim = leaf.validity.notAfter.toISOString();
  const razaoSocial = (leaf.subject.getField("CN")?.value as string) ?? "";

  return { certPem, keyPem, cnpj, validadeFim, razaoSocial };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth + admin check
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Token ausente." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Acesso restrito a administradores." }, 403);

    // Service-role client para Storage + Vault
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: file, error: dlErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .download(STORAGE_PATH);
    if (dlErr || !file) {
      return json({ error: `Falha ao baixar .pfx: ${dlErr?.message ?? "arquivo não encontrado"}` }, 500);
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const base64 = bytesToBase64(buf);

    const { data: secret, error: secretErr } = await admin.rpc("ler_secret_vault", {
      p_name: VAULT_SECRET_NAME,
    });
    if (secretErr || !secret) {
      return json({
        error: `Senha do certificado não encontrada no Vault (${VAULT_SECRET_NAME}). ` +
          `Detalhe: ${secretErr?.message ?? "secret vazio"}`,
      }, 500);
    }
    const senha = String(secret);

    const { certPem, keyPem, cnpj, validadeFim, razaoSocial } = pfxToPem(base64, senha);

    return json({
      cnpj,
      razaoSocial,
      validadeFim,
      certPem,
      keyPem,
      instrucoes: [
        "1. Copie o conteúdo de certPem e cole em Cloudflare → SSL/TLS → Client Certificates (mTLS) ou no painel do Worker (mTLS Certificates).",
        "2. Copie o conteúdo de keyPem como private key.",
        "3. Após upload, anote o certificate_id retornado pelo Cloudflare.",
        "4. APAGUE esta edge function (exportar-certificado-pem) imediatamente.",
      ],
    });
  } catch (err) {
    console.error("[exportar-certificado-pem] erro:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
