// deno-lint-ignore-file no-explicit-any
/**
 * Edge Function: sefaz-proxy
 * Proxy para comunicação com a SEFAZ, incluindo assinatura digital XML (xmldsig)
 * e parsing de certificados A1 (PFX/P12).
 *
 * Actions:
 *   - parse-certificado: Extrai metadados (CNPJ, razão social, validade) do PFX
 *   - assinar-e-enviar-vault: Igual ao assinar-e-enviar, porém lê o .pfx do
 *     Storage privado `dbavizee/certificados/empresa.pfx` e a senha do secret
 *     `CERTIFICADO_PFX_SENHA`. O cliente NÃO envia senha nem certificado.
 *   - enviar-sem-assinatura-vault: Envia um SOAP arbitrário usando o A1 do
 *     Vault como mTLS, mas SEM aplicar XMLDSig. Usado para fluxos como
 *     NFeConsultaProtocolo4 (consSitNFe), que não exigem assinatura no XML.
 */

import forge from "https://esm.sh/node-forge@1.3.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createLogger } from "../_shared/logger.ts";
import { requireAnyPermission, type PermissionRequirement } from "../_shared/permissions.ts";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");

// Em produção, ALLOWED_ORIGIN deve apontar para o domínio do app (ex.: https://sistema.avizee.com.br).
// Em desenvolvimento ou quando a variável não está definida, fazemos fallback para "*"
// para evitar bloqueio total de CORS — porém a Edge Function continua exigindo JWT válido.
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

async function getVaultSecretByName(
  adminClient: ReturnType<typeof createClient>,
  secretName: string,
): Promise<string | null> {
  const { data, error } = await adminClient.rpc("get_secret_vault_by_name", {
    p_name: secretName,
  });

  if (error) {
    throw new Error(`Falha ao ler segredo '${secretName}' no cofre: ${error.message}`);
  }

  const secret = typeof data === "string" ? data : data == null ? null : String(data);
  return secret && secret.length > 0 ? secret : null;
}

// ── Autenticação JWT ─────────────────────────────────────────────

async function requireAuth(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Token de autenticação ausente.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão inválida ou expirada.");
  return data.user;
}

/**
 * Mapa de autorização por `action`. Cada entrada lista as permissões que,
 * se concedidas, autorizam a chamada. Admin global (user_roles=admin) ignora
 * o mapa. Actions ausentes são bloqueadas por padrão.
 */
const ACTION_PERMISSIONS: Record<string, PermissionRequirement[]> = {
  "health": [
    { resource: "faturamento_fiscal", action: "visualizar" },
    { resource: "faturamento_fiscal", action: "admin_fiscal" },
  ],
  "parse-certificado": [
    { resource: "faturamento_fiscal", action: "admin_fiscal" },
  ],
  "assinar-e-enviar-vault": [
    { resource: "faturamento_fiscal", action: "criar" },
    { resource: "faturamento_fiscal", action: "cancelar" },
    { resource: "faturamento_fiscal", action: "admin_fiscal" },
  ],
  "enviar-sem-assinatura-vault": [
    { resource: "faturamento_fiscal", action: "visualizar" },
    { resource: "faturamento_fiscal", action: "criar" },
    { resource: "faturamento_fiscal", action: "cancelar" },
    { resource: "faturamento_fiscal", action: "admin_fiscal" },
  ],
};

// ── Certificado: Parsing PFX ─────────────────────────────────────

interface CertificadoInfo {
  cnpj: string;
  razaoSocial: string;
  validadeInicio: string;
  validadeFim: string;
  diasRestantes: number;
}

function parseCertificado(
  base64: string,
  senha: string,
): CertificadoInfo {
  const derBytes = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const pfx = forge.pkcs12.pkcs12FromAsn1(asn1, senha);

  // Extrair certificado X.509
  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado X.509 não encontrado no PFX.");

  const cert = certBag.cert;
  const subject = cert.subject;

  // Extrair CNPJ do serialNumber (OID 2.5.4.5) ou do CN
  let cnpj = "";
  const serialNumberAttr = subject.getField({ shortName: "serialNumber" });
  if (serialNumberAttr) {
    cnpj = String(serialNumberAttr.value).replace(/\D/g, "");
  }
  // Fallback: extrair do CN
  if (!cnpj || cnpj.length < 11) {
    const cn = subject.getField("CN");
    if (cn) {
      const match = String(cn.value).match(/(\d{11,14})/);
      if (match) cnpj = match[1];
    }
  }

  // Razão social do CN
  const cnField = subject.getField("CN");
  let razaoSocial = cnField ? String(cnField.value) : "";
  // Limpar CNPJ do nome se presente
  razaoSocial = razaoSocial.replace(/:\d{11,14}/, "").trim();

  const validadeInicio = cert.validity.notBefore.toISOString().split("T")[0];
  const validadeFim = cert.validity.notAfter.toISOString().split("T")[0];
  const diasRestantes = Math.floor(
    (cert.validity.notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  return { cnpj, razaoSocial, validadeInicio, validadeFim, diasRestantes };
}

// ── Assinatura Digital XML (xmldsig RSA-SHA1) ────────────────────

function extrairChaveECertificado(base64: string, senha: string) {
  const derBytes = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const pfx = forge.pkcs12.pkcs12FromAsn1(asn1, senha);

  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX.");

  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado X.509 não encontrado no PFX.");

  return { privateKey: keyBag.key, cert: certBag.cert };
}

/**
 * Canonicalização simplificada (C14N exclusivo).
 * Remove declaração XML, normaliza whitespace em tags.
 */
function canonicalize(xml: string): string {
  return xml
    .replace(/<\?xml[^?]*\?>\s*/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function assinarXml(xml: string, base64Pfx: string, senha: string): string {
  const { privateKey, cert } = extrairChaveECertificado(base64Pfx, senha);

  // Extrair o conteúdo de <infNFe>...</infNFe>
  const infNFeMatch = xml.match(/<infNFe[^>]*>([\s\S]*?)<\/infNFe>/);
  if (!infNFeMatch) throw new Error("Elemento <infNFe> não encontrado no XML.");

  const infNFeCompleto = xml.match(/<infNFe[^>]*>[\s\S]*?<\/infNFe>/)?.[0] || "";
  const idMatch = infNFeCompleto.match(/Id="([^"]+)"/);
  const referenceUri = idMatch ? `#${idMatch[1]}` : "";

  // Calcular digest SHA-1 do <infNFe> canonicalizado
  const infNFeCanonico = canonicalize(infNFeCompleto);
  const digestMd = forge.md.sha1.create();
  digestMd.update(infNFeCanonico, "utf8");
  const digestBase64 = forge.util.encode64(digestMd.digest().getBytes());

  // Montar SignedInfo
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="${referenceUri}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digestBase64}</DigestValue></Reference></SignedInfo>`;

  // Assinar SignedInfo com RSA-SHA1
  const signatureMd = forge.md.sha1.create();
  signatureMd.update(canonicalize(signedInfo), "utf8");
  const signatureBytes = (privateKey as any).sign(signatureMd);
  const signatureBase64 = forge.util.encode64(signatureBytes);

  // Certificado X.509 em base64 (DER)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certBase64 = forge.util.encode64(certDer);

  // Montar bloco <Signature>
  const signatureBlock = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo}<SignatureValue>${signatureBase64}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data></KeyInfo></Signature>`;

  // Inserir após </infNFe>
  const xmlAssinado = xml.replace("</infNFe>", `</infNFe>${signatureBlock}`);
  return xmlAssinado;
}

// ── Envio SOAP para SEFAZ ────────────────────────────────────────

async function enviarSoap(
  xmlAssinado: string,
  url: string,
  soapAction: string,
): Promise<{ sucesso: boolean; xmlRetorno?: string; erro?: string }> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl">
  <soapenv:Header/>
  <soapenv:Body>
    <nfe:nfeDadosMsg>${xmlAssinado}</nfe:nfeDadosMsg>
  </soapenv:Body>
</soapenv:Envelope>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: soapAction,
      },
      body: envelope,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const xmlRetorno = await response.text();

    if (!response.ok) {
      return {
        sucesso: false,
        erro: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return { sucesso: true, xmlRetorno };
  } catch (err) {
    clearTimeout(timer);
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Timeout de 30s ao conectar com a SEFAZ"
          : err.message
        : String(err);
    return { sucesso: false, erro: message };
  }
}

// ── Envio SOAP com mTLS (sem assinatura) ─────────────────────────

/**
 * Converte PFX (base64) em PEM (cert + chave privada). Usado pelo modo mTLS.
 */
function pfxToPem(
  base64: string,
  senha: string,
): { certPem: string; keyPem: string } {
  const derBytes = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const pfx = forge.pkcs12.pkcs12FromAsn1(asn1, senha);

  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX.");

  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) {
    throw new Error("Certificado X.509 não encontrado no PFX.");
  }

  const certPem = forge.pki.certificateToPem(certBag.cert);
  const keyPem = forge.pki.privateKeyToPem(
    keyBag.key as forge.pki.rsa.PrivateKey,
  );
  return { certPem, keyPem };
}

/**
 * Envia um envelope SOAP usando mTLS com o A1 do Vault, sem aplicar XMLDSig.
 * Usado para consultas (ex.: NFeConsultaProtocolo4 / consSitNFe).
 */
async function enviarSoapMtls(
  xmlConteudo: string,
  url: string,
  soapAction: string,
  certPem: string,
  keyPem: string,
): Promise<{
  sucesso: boolean;
  xmlRetorno?: string;
  erro?: string;
  statusHttp?: number;
}> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl">
  <soapenv:Header/>
  <soapenv:Body>
    <nfe:nfeDadosMsg>${xmlConteudo}</nfe:nfeDadosMsg>
  </soapenv:Body>
</soapenv:Envelope>`;

  let client: Deno.HttpClient | undefined;
  try {
    // @ts-ignore — http1/http2 são opções específicas do Deno e os legados
    // SEFAZ exigem HTTP/1.1.
    client = Deno.createHttpClient({
      cert: certPem,
      key: keyPem,
      http1: true,
      http2: false,
    });
  } catch (e) {
    return {
      sucesso: false,
      erro: `Falha ao criar cliente mTLS: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: soapAction,
      },
      body: envelope,
      // @ts-ignore — option client é específica do Deno
      client,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const xmlRetorno = await response.text();
    if (!response.ok) {
      return {
        sucesso: false,
        erro: `HTTP ${response.status}: ${response.statusText}`,
        statusHttp: response.status,
        xmlRetorno,
      };
    }
    return { sucesso: true, xmlRetorno, statusHttp: response.status };
  } catch (err) {
    clearTimeout(timer);
    const raw = err instanceof Error
      ? err.name === "AbortError"
        ? "Timeout de 30s ao conectar com a SEFAZ"
        : err.message
      : String(err);
    return { sucesso: false, erro: raw };
  } finally {
    try {
      // @ts-ignore — close é estável em Deno
      client?.close?.();
    } catch (_) { /* ignore */ }
  }
}

// ── Handler principal ────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("sefaz-proxy", req);
  try {
    const user = await requireAuth(req);

    const body = await req.json();
    const { action } = body;
    log.info("request received", { action });

    if (!action || typeof action !== "string") {
      return json(
        {
          error:
            "Campo 'action' ausente. Use 'health', 'parse-certificado', 'assinar-e-enviar-vault' ou 'enviar-sem-assinatura-vault'.",
        },
        400,
      );
    }

    const allowed = ACTION_PERMISSIONS[action];
    if (!allowed) {
      return json(
        { error: `action '${action}' inválida.` },
        400,
      );
    }
    try {
      await requireAnyPermission(user.id, allowed);
    } catch (permErr: any) {
      const status = permErr?.status === 403 ? 403 : 500;
      log.warn("permission denied", { action, userId: user.id, message: permErr?.message });
      return json({ error: permErr.message ?? "Permissão negada" }, status);
    }

    // ── Health check leve ──────────────────────────────────────────
    // Usado pelo painel "Saúde do sistema" (admin) para indicar se a
    // edge function está acessível sem precisar de PFX/SOAP. Retorna
    // também a presença do secret de senha do certificado.
    if (action === "health") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const hasPfxPassword = !!(await getVaultSecretByName(adminClient, "CERTIFICADO_PFX_SENHA"));
      return json({
        ok: true,
        action: "health",
        hasPfxPassword,
        timestamp: new Date().toISOString(),
      });
    }

    if (action === "parse-certificado") {
      const { certificado_base64, senha } = body;
      if (!certificado_base64 || !senha) {
        return json({ error: "certificado_base64 e senha são obrigatórios" }, 400);
      }
      try {
        const info = parseCertificado(certificado_base64, senha);
        return json(info);
      } catch (e: any) {
        return json(
          { error: `Erro ao ler certificado: ${e.message}` },
          400,
        );
      }
    }

    if (action === "assinar-e-enviar") {
      // Modo legado removido: o certificado A1 deve permanecer server-side
      // (Storage privado + Vault). Use sempre `assinar-e-enviar-vault`.
      return json(
        {
          sucesso: false,
          erro:
            "Action 'assinar-e-enviar' foi descontinuada por segurança. Use 'assinar-e-enviar-vault'.",
        },
        410,
      );
    }

    if (action === "assinar-e-enviar-vault") {
      const { xml, url, soapAction } = body;
      if (!xml || !url || !soapAction) {
        return json(
          { error: "xml, url e soapAction são obrigatórios" },
          400,
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const senha = await getVaultSecretByName(adminClient, "CERTIFICADO_PFX_SENHA");
      if (!senha) {
        return json(
          { sucesso: false, erro: "Senha do certificado não encontrada no cofre seguro." },
          500,
        );
      }

      // Baixar o .pfx do Storage privado dbavizee/certificados/empresa.pfx
      const { data: blob, error: dlErr } = await adminClient.storage
        .from("dbavizee")
        .download("certificados/empresa.pfx");

      if (dlErr || !blob) {
        return json(
          { sucesso: false, erro: `Não foi possível ler o certificado do Storage: ${dlErr?.message ?? "arquivo ausente"}` },
          500,
        );
      }

      const arrBuf = await blob.arrayBuffer();
      const certBase64 = forge.util.encode64(
        String.fromCharCode(...new Uint8Array(arrBuf)),
      );

      let xmlAssinado: string;
      try {
        xmlAssinado = assinarXml(xml, certBase64, senha);
      } catch (e: any) {
        return json({ sucesso: false, erro: `Erro na assinatura: ${e.message}` });
      }

      const resultado = await enviarSoap(xmlAssinado, url, soapAction);
      return json(resultado);
    }

    if (action === "enviar-sem-assinatura-vault") {
      const { xml, url, soapAction } = body;
      if (!xml || !url || !soapAction) {
        return json(
          { error: "xml, url e soapAction são obrigatórios" },
          400,
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const senha = await getVaultSecretByName(adminClient, "CERTIFICADO_PFX_SENHA");
      if (!senha) {
        return json(
          {
            sucesso: false,
            erro:
              "Senha do certificado não encontrada no cofre seguro — reenvie o certificado em Administração > Fiscal.",
          },
          500,
        );
      }

      const { data: blob, error: dlErr } = await adminClient.storage
        .from("dbavizee")
        .download("certificados/empresa.pfx");

      if (dlErr || !blob) {
        return json(
          {
            sucesso: false,
            erro:
              `Não foi possível ler o certificado A1 do Storage: ${
                dlErr?.message ?? "arquivo ausente"
              }`,
          },
          500,
        );
      }

      const arrBuf = await blob.arrayBuffer();
      const certBase64 = forge.util.encode64(
        String.fromCharCode(...new Uint8Array(arrBuf)),
      );

      let certPem: string;
      let keyPem: string;
      try {
        const r = pfxToPem(certBase64, senha);
        certPem = r.certPem;
        keyPem = r.keyPem;
      } catch (e: any) {
        return json({
          sucesso: false,
          erro: `Falha ao ler PFX: ${e.message ?? String(e)}`,
        });
      }

      const resultado = await enviarSoapMtls(
        xml,
        url,
        soapAction,
        certPem,
        keyPem,
      );
      return json(resultado);
    }

    return json(
      {
        error: `action '${action}' inválida. Use 'health', 'parse-certificado', 'assinar-e-enviar-vault' ou 'enviar-sem-assinatura-vault'.`,
      },
      400,
    );
  } catch (err: any) {
    log.error("request failed", err);
    return json({ error: err.message || "Erro interno" }, err.message?.includes("Sessão") ? 401 : 500);
  }
});
