// deno-lint-ignore-file no-explicit-any
/**
 * Edge Function: sefaz-distdfe
 *
 * Implementa o serviço NfeDistribuicaoDFe (Ambiente Nacional) para baixar
 * automaticamente NF-e emitidas contra o CNPJ da empresa, sem necessidade de
 * captura manual de chaves.
 *
 * Reutiliza o certificado A1 (.pfx) armazenado em
 *   dbavizee/certificados/empresa.pfx
 * e a senha em CERTIFICADO_PFX_SENHA (Vault).
 *
 * Actions:
 *   - "consultar-nsu": consulta documentos a partir do último NSU recebido
 *   - "consultar-chave": consulta um documento específico por chave de acesso (consChNFe)
 *
 * Endpoint SEFAZ (AN):
 *   - Produção:    https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx
 *   - Homologação: https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx
 *
 * O endpoint exige mTLS — autenticação por certificado de cliente (A1).
 * Usamos Deno.createHttpClient({ cert, key }) para isso.
 */

import forge from "https://esm.sh/node-forge@1.3.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { gunzipSync } from "https://esm.sh/fflate@0.8.2";
import { createLogger } from "../_shared/logger.ts";
import { requireAnyPermission, type PermissionRequirement } from "../_shared/permissions.ts";

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

// ── UF → código IBGE (cUFAutor) ──────────────────────────────────
// NT 2014.002 v1.30: cUFAutor é o código IBGE da UF do interessado
// (ex.: 35=SP, 29=BA). Fallback "91" só quando UF não estiver configurada.
const UF_PARA_IBGE: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
  PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
  RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

// ── Catálogo oficial cStat (NT 2014.002 v1.30, seção 4) ─────────
const CSTAT_DESC: Record<string, string> = {
  "108": "Serviço paralisado momentaneamente.",
  "109": "Serviço paralisado sem previsão.",
  "137": "Nenhum documento localizado para o CNPJ do certificado.",
  "138": "Documento localizado.",
  "214": "Tamanho da mensagem excedeu o limite de 10 KB.",
  "215": "Falha no schema XML.",
  "217": "NF-e inexistente para a chave de acesso informada.",
  "236": "Chave de acesso com dígito verificador inválido.",
  "238": "Versão do XML superior à versão vigente.",
  "239": "Versão do XML não suportada.",
  "252": "Ambiente informado diverge do ambiente do Web Service.",
  "280": "Certificado de transmissor inválido.",
  "281": "Certificado de transmissor com data de validade vencida.",
  "283": "Cadeia do certificado de transmissor com erro.",
  "284": "Certificado de transmissor revogado.",
  "285": "Certificado de transmissor difere de ICP-Brasil.",
  "286": "Erro de acesso à LCR do certificado de transmissor.",
  "402": "XML com codificação diferente de UTF-8.",
  "404": "Uso de prefixo de namespace não permitido.",
  "472": "CPF consultado difere do CPF do certificado digital.",
  "473": "Certificado de transmissor sem CNPJ ou CPF.",
  "489": "CNPJ informado inválido.",
  "490": "CPF informado inválido.",
  "589": "NSU informado superior ao maior NSU do Ambiente Nacional.",
  "593": "CNPJ-base consultado difere do CNPJ-base do certificado — o A1 não pertence à empresa configurada.",
  "614": "Chave de acesso inválida (UF inválida).",
  "615": "Chave de acesso inválida (ano).",
  "616": "Chave de acesso inválida (mês).",
  "617": "Chave de acesso inválida (CNPJ).",
  "618": "Chave de acesso inválida (modelo diferente de 55).",
  "619": "Chave de acesso inválida (número da NF = 0).",
  "632": "Solicitação fora do prazo: NF-e tem mais de 90 dias e não está mais disponível.",
  "640": "CNPJ/CPF do interessado não tem permissão para consultar esta NF-e — peça o XML diretamente ao emissor.",
  "641": "NF-e indisponível para o emitente (use 'Consultar SEFAZ' na lista, não esta busca).",
  "653": "NF-e cancelada — arquivo indisponível para download.",
  "654": "NF-e denegada — arquivo indisponível para download.",
  "656": "Consumo indevido: o CNPJ foi bloqueado por 1 hora por excesso de consultas. Aguarde antes de tentar novamente.",
  "999": "Erro não catalogado pelo Ambiente Nacional.",
};

async function requireAuth(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Token de autenticação ausente.");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Chamadas internas (process-distdfe-cron) usam SERVICE_ROLE_KEY como
  // Authorization. Reconhecemos esse caso e tratamos como "sistema".
  if (token === serviceRoleKey) {
    return { id: "__service_role__", isService: true } as const;
  }
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão inválida ou expirada.");
  return { id: data.user.id, isService: false as const };
}

// ── PFX → PEM (cert + chave privada) ─────────────────────────────

function pfxToPem(base64: string, senha: string): { certPem: string; keyPem: string; cnpj: string } {
  const derBytes = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const pfx = forge.pkcs12.pkcs12FromAsn1(asn1, senha);

  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX.");

  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
  const allCerts = (certBags[forge.pki.oids.certBag] ?? [])
    .map((b) => b?.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  if (allCerts.length === 0) throw new Error("Certificado X.509 não encontrado no PFX.");

  // Identifica o certificado folha (cliente A1): aquele cujo Subject NÃO é
  // Issuer de nenhum outro certificado do bundle. Os demais (intermediários)
  // entram no PEM em ordem para o servidor validar a cadeia ICP-Brasil sem
  // depender do truststore do runtime.
  const subjectHash = (c: forge.pki.Certificate) =>
    c.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(",");
  const issuerHash = (c: forge.pki.Certificate) =>
    c.issuer.attributes.map((a) => `${a.shortName}=${a.value}`).join(",");
  const subjectsThatAreIssuers = new Set(allCerts.map((c) => issuerHash(c)));
  const leaf =
    allCerts.find((c) => !subjectsThatAreIssuers.has(subjectHash(c))) ?? allCerts[0];
  const intermediates = allCerts.filter((c) => c !== leaf);

  // Concatena leaf + intermediários em PEM. Deno usa rustls, que aceita
  // múltiplos certificados no mesmo arquivo PEM como cadeia do cliente.
  const certPem = [leaf, ...intermediates]
    .map((c) => forge.pki.certificateToPem(c))
    .join("\n");
  const keyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);

  // CNPJ — do serialNumber (OID 2.5.4.5) do certificado folha.
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
  return { certPem, keyPem, cnpj };
}

// ── XML distDFeInt ───────────────────────────────────────────────

function montarDistDFeInt(opts: {
  ambiente: "1" | "2";
  cnpj: string;
  ultNSU?: string;
  chNFe?: string;
  cUFAutor?: string; // 91 = AN
}): string {
  const cUF = opts.cUFAutor ?? "91";
  const corpo = opts.chNFe
    ? `<consChNFe><chNFe>${opts.chNFe}</chNFe></consChNFe>`
    : `<distNSU><ultNSU>${String(opts.ultNSU ?? "0").padStart(15, "0")}</ultNSU></distNSU>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
  <tpAmb>${opts.ambiente}</tpAmb>
  <cUFAutor>${cUF}</cUFAutor>
  <CNPJ>${opts.cnpj}</CNPJ>
  ${corpo}
</distDFeInt>`;
}

/**
 * Monta o envelope SOAP do NFeDistribuicaoDFe.
 *
 * O WSDL desse serviço expõe DOIS bindings:
 *  - SOAP 1.1 (`http://schemas.xmlsoap.org/soap/envelope/`) com header HTTP `SOAPAction`.
 *  - SOAP 1.2 (`http://www.w3.org/2003/05/soap-envelope`) com `action` embutida no `Content-Type`.
 *
 * O IIS do Ambiente Nacional aceita os dois, mas a combinação que historicamente
 * funciona sem `Connection reset by peer` é SOAP 1.2 com `application/soap+xml`.
 * Por isso essa função é parametrizada por `variant` e a edge tenta SOAP 1.2
 * primeiro e cai para SOAP 1.1 como fallback.
 *
 * O serviço NÃO declara `nfeCabecMsg` — apenas `nfeDadosMsg` dentro de
 * `nfeDistDFeInteresse`.
 */
type SoapVariant = "soap12" | "soap11";

function envelopeSoap(distDFeInt: string, variant: SoapVariant): string {
  const inner = distDFeInt.replace(/<\?xml[^?]*\?>\s*/g, "").trim();
  // ATENÇÃO — NÃO REINTRODUZIR <nfeCabecMsg>.
  // O WSDL do NFeDistribuicaoDFe (AN) NÃO declara `nfeCabecMsg` — apenas
  // `nfeDadosMsg` dentro de `nfeDistDFeInteresse`. Diferente dos serviços
  // de Autorização/Consulta protocolo, enviar o header faz o IIS do AN
  // derrubar a conexão TCP antes de gerar SOAP Fault — causa raiz dos
  // "Connection reset by peer" observados em prod (abr–mai/2026).
  // `cUFAutor` (UF do interessado) vai apenas no corpo `distDFeInt`,
  // nunca no envelope. Ver `mem/features/fiscal-consulta-por-chave.md`.
  if (variant === "soap12") {
    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope" ` +
      `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<soap12:Body>` +
      `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
      `<nfeDadosMsg>${inner}</nfeDadosMsg>` +
      `</nfeDistDFeInteresse>` +
      `</soap12:Body>` +
      `</soap12:Envelope>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<soap:Body>` +
    `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDadosMsg>${inner}</nfeDadosMsg>` +
    `</nfeDistDFeInteresse>` +
    `</soap:Body>` +
    `</soap:Envelope>`;
}

const SOAP_ACTION_DISTDFE =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";

function headersFor(variant: SoapVariant): Record<string, string> {
  if (variant === "soap12") {
    return {
      // SOAP 1.2: action obrigatoriamente embutida no Content-Type;
      // SOAPAction como header HTTP é IGNORADO pelo binding 1.2.
      "Content-Type":
        `application/soap+xml; charset=utf-8; action="${SOAP_ACTION_DISTDFE}"`,
      Accept: "application/soap+xml, text/xml, multipart/related",
      "User-Agent": "AviZee-ERP/1.0 (+sefaz-distdfe)",
    };
  }
  return {
    "Content-Type": "text/xml; charset=utf-8",
    SOAPAction: `"${SOAP_ACTION_DISTDFE}"`,
    Accept: "text/xml, application/soap+xml; charset=utf-8",
    "User-Agent": "AviZee-ERP/1.0 (+sefaz-distdfe)",
  };
}

function endpointAN(amb: "1" | "2"): string {
  return amb === "1"
    ? "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
    // URL oficial do AN para homologação (Portal Nacional NF-e). O host
    // correto é `hom1.nfe.fazenda.gov.br` — o `hom.nfe.fazenda.gov.br` é
    // do RecepcaoEvento AN e fechava a conexão para DistDFe.
    : "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
}

// ── Parsing do retorno ───────────────────────────────────────────

interface DocResumo {
  nsu: string;
  schema: string;
  /** XML decodificado (procNFe/resNFe/procEventoNFe...). */
  xml: string;
  /** Chave de acesso, quando extraível. */
  chave?: string;
  /** Quando for resumo (resNFe), traz dados básicos. */
  resumo?: {
    cnpjEmitente?: string;
    nomeEmitente?: string;
    valorTotal?: number;
    dataEmissao?: string;
    numero?: string;
    serie?: string;
    situacao?: string;
  };
}

function extrairTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

function parseRetDistDFeInt(xmlSoap: string): {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  docs: DocResumo[];
} {
  // Extrai bloco retDistDFeInt
  const ret = extrairTag(xmlSoap, "retDistDFeInt") ?? xmlSoap;
  const cStat = extrairTag(ret, "cStat") ?? "";
  const xMotivo = extrairTag(ret, "xMotivo") ?? "";
  const ultNSU = extrairTag(ret, "ultNSU") ?? "0";
  const maxNSU = extrairTag(ret, "maxNSU") ?? ultNSU;

  const docs: DocResumo[] = [];
  // <docZip NSU="..." schema="..."><base64 gzip></docZip>
  const re = /<docZip\s+([^>]+)>([\s\S]*?)<\/docZip>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ret)) !== null) {
    const attrs = m[1];
    const b64 = m[2].trim();
    const nsuMatch = attrs.match(/NSU="(\d+)"/);
    const schemaMatch = attrs.match(/schema="([^"]+)"/);
    const nsu = nsuMatch ? nsuMatch[1] : "";
    const schema = schemaMatch ? schemaMatch[1] : "";
    let xml = "";
    try {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const out = gunzipSync(bin);
      xml = new TextDecoder("utf-8").decode(out);
    } catch (e) {
      console.error("Falha gunzip docZip NSU=", nsu, e);
      continue;
    }

    // Extração leve para resumo / chave
    const chave = (xml.match(/Id="NFe(\d{44})"/) || xml.match(/<chNFe>(\d{44})<\/chNFe>/))
      ?.[1];
    const resumo: DocResumo["resumo"] = {
      cnpjEmitente: extrairTag(xml, "CNPJ") ?? undefined,
      nomeEmitente: extrairTag(xml, "xNome") ?? undefined,
      valorTotal: (() => {
        const v = extrairTag(xml, "vNF");
        return v ? Number(v) : undefined;
      })(),
      dataEmissao: extrairTag(xml, "dhEmi") ?? undefined,
      numero: extrairTag(xml, "nNF") ?? undefined,
      serie: extrairTag(xml, "serie") ?? undefined,
      situacao: extrairTag(xml, "cSitNFe") ?? undefined,
    };

    docs.push({ nsu, schema, xml, chave, resumo });
  }

  return { cStat, xMotivo, ultNSU, maxNSU, docs };
}

// ── Handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("sefaz-distdfe", req);
  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "consultar-nsu";
    log.info("request", { action, ambiente: body.ambiente, ultNSU: body.ultNSU, chNFe: body.chNFe });

    if (action !== "consultar-nsu" && action !== "consultar-chave") {
      return json({ error: `action '${action}' inválida. Use 'consultar-nsu' ou 'consultar-chave'.` }, 400);
    }

    // Autorização granular: ambas as actions exigem ao menos `visualizar`
    // do módulo fiscal (admin global ignora). Bloqueia qualquer usuário
    // logado sem vínculo com o módulo fiscal de disparar consultas SEFAZ.
    const allowed: PermissionRequirement[] = [
      { resource: "faturamento_fiscal", action: "visualizar" },
      { resource: "faturamento_fiscal", action: "criar" },
      { resource: "faturamento_fiscal", action: "importar_xml" },
      { resource: "faturamento_fiscal", action: "admin_fiscal" },
    ];
    try {
      if (!user.isService) {
      await requireAnyPermission(user.id, allowed);
      }
    } catch (permErr: any) {
      const status = permErr?.status === 403 ? 403 : 500;
      log.warn("permission denied", { action, userId: user.id, message: permErr?.message });
      return json({ sucesso: false, erro: permErr.message ?? "Permissão negada" }, status);
    }

    // Default = produção ("1"). Homologação só quando explicitamente "2".
    const ambiente: "1" | "2" = body.ambiente === "2" ? "2" : "1";
    const ultNSUInput: string = String(body.ultNSU ?? "0").replace(/\D/g, "");
    const chNFeInput: string = String(body.chNFe ?? "").replace(/\D/g, "");
    if (action === "consultar-chave" && chNFeInput.length !== 44) {
      return json({ sucesso: false, erro: "Chave de acesso (chNFe) inválida — exige 44 dígitos." }, 400);
    }

    // Baixa o PFX + lê a senha persistida no cofre seguro.
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
          erro: "Senha do certificado não encontrada no cofre seguro. Reenvie o certificado em Configuração Fiscal.",
        },
        500,
      );
    }

    // Lê UF da empresa para compor cUFAutor conforme NT 2014.002 v1.30.
    let cUFAutor = "91";
    try {
      const { data: cfg } = await adminClient
        .from("empresa_config")
        .select("uf")
        .limit(1)
        .maybeSingle();
      const uf = String((cfg as any)?.uf ?? "").trim().toUpperCase();
      if (uf && UF_PARA_IBGE[uf]) cUFAutor = UF_PARA_IBGE[uf];
      else log.info("cUFAutor fallback 91", { uf_lida: uf });
    } catch (e) {
      log.info("cUFAutor fallback 91 (erro lendo empresa_config)", { e: String(e) });
    }

    const { data: blob, error: dlErr } = await adminClient.storage
      .from("dbavizee")
      .download("certificados/empresa.pfx");
    if (dlErr || !blob) {
      return json(
        {
          sucesso: false,
          erro: `Não foi possível ler o certificado do Storage: ${dlErr?.message ?? "arquivo ausente"}`,
        },
        500,
      );
    }
    const arr = new Uint8Array(await blob.arrayBuffer());
    const certBase64 = forge.util.encode64(String.fromCharCode(...arr));

    let certPem: string;
    let keyPem: string;
    let cnpj: string;
    try {
      const r = pfxToPem(certBase64, senha);
      certPem = r.certPem;
      keyPem = r.keyPem;
      cnpj = r.cnpj;
    } catch (e: any) {
      return json(
        { sucesso: false, erro: `Falha ao ler PFX: ${e.message}` },
        500,
      );
    }

    if (!cnpj || cnpj.length !== 14) {
      return json({ sucesso: false, erro: "CNPJ inválido extraído do certificado." }, 500);
    }

    // Throttle server-side (item 2.5 do plano Onda 8): cron com SR é bypass.
    // Janela padrão 1h, máximo 18 chamadas por (cnpj, action).
    if (!user.isService) {
      try {
        const { data: pode, error: throttleErr } = await adminClient.rpc(
          "sefaz_consulta_pode_disparar",
          { p_cnpj: cnpj, p_action: action },
        );
        if (throttleErr) {
          log.warn("throttle rpc error (fail-open)", { message: throttleErr.message });
        } else if (pode === false) {
          log.warn("throttle bloqueou", { cnpj, action });
          return json(
            {
              sucesso: false,
              erro: "Limite de consultas SEFAZ excedido nesta janela. Aguarde alguns minutos e tente novamente.",
              codigoTransporte: "RATE_LIMITED",
              janelaSeg: 3600,
              max: 18,
            },
            429,
          );
        }
      } catch (e: any) {
        log.warn("throttle check exception (fail-open)", { message: e?.message });
      }
    }

    // Transporte mTLS:
    //   1) Padrão — `Deno.createHttpClient({ cert, key })` direto contra a SEFAZ
    //      usando o A1 (com cadeia ICP-Brasil completa) carregado do Vault.
    //   2) Opcional — Cloudflare Worker (`SEFAZ_MTLS_PROXY_URL` + `SEFAZ_MTLS_PROXY_SECRET`).
    //      Só é usado quando a flag `SEFAZ_USE_MTLS_PROXY=1` estiver setada,
    //      evitando que um Worker mal configurado (ex.: 401 Unauthorized)
    //      derrube a integração mesmo com mTLS nativo funcionando.
    const proxyUrl = Deno.env.get("SEFAZ_MTLS_PROXY_URL")?.trim();
    const proxySecret = Deno.env.get("SEFAZ_MTLS_PROXY_SECRET")?.trim();
    // Gate de transporte (opt-in): o Worker mTLS só é usado quando
    // SEFAZ_USE_MTLS_PROXY estiver EXPLICITAMENTE setada como 1/true/yes/on/sim.
    // Default (variável ausente) = deno-mtls direto contra a SEFAZ com o A1
    // do Vault. Motivo: deploys sem Worker configurado estavam falhando com
    // WORKER_CONFIG_MISSING porque a flag era opt-out (lógica invertida).
    const proxyFlagRaw = (Deno.env.get("SEFAZ_USE_MTLS_PROXY") ?? "").trim()
      .replace(/^["']|["']$/g, "").toLowerCase();
    const proxyEnabled = ["1", "true", "yes", "on", "sim"].includes(proxyFlagRaw);
    const usarProxy = proxyEnabled && !!(proxyUrl && proxySecret);

    // Telemetria do gate de transporte (sem expor segredos).
    // Sprint 7.4 #18 — `proxySecretFp` foi removido para não vazar prefixo/sufixo
    // do secret em logs persistidos. Mantemos apenas presença/length para debug.
    const isProd = (Deno.env.get("DENO_DEPLOYMENT_ID") ?? "").length > 0
      && (Deno.env.get("ENVIRONMENT") ?? "").toLowerCase() !== "development";
    log.info("transporte resolvido", {
      proxyEnabled,
      proxyFlagLen: proxyFlagRaw.length,
      hasProxyUrl: !!proxyUrl,
      hasProxySecret: !!proxySecret,
      proxySecretLen: proxySecret?.length ?? 0,
      ...(isProd
        ? {}
        : {
            proxySecretFp: proxySecret
              ? `${proxySecret.slice(0, 4)}...${proxySecret.slice(-4)}`
              : null,
          }),
      usarProxy,
      transporte: usarProxy ? "cloudflare-worker" : "deno-mtls",
    });

    // Se a flag pediu proxy mas falta URL/secret, falha explicitamente em vez
    // de cair em deno-mtls silenciosamente (que sofre geo-block do AN).
    if (proxyEnabled && (!proxyUrl || !proxySecret)) {
      return json({
        sucesso: false,
        erro:
          "SEFAZ_USE_MTLS_PROXY=1 está ativo mas faltam SEFAZ_MTLS_PROXY_URL e/ou SEFAZ_MTLS_PROXY_SECRET. Reconfigure os secrets do Worker mTLS.",
        codigoTransporte: "WORKER_CONFIG_MISSING",
      }, 500);
    }

    let client: Deno.HttpClient | null = null;
    if (!usarProxy) {
      try {
        // @ts-ignore — Deno.createHttpClient é estável em Deno Deploy
        client = Deno.createHttpClient({
          cert: certPem,
          key: keyPem,
          http1: true,
          http2: false,
        });
      } catch (e: any) {
        return json(
          { sucesso: false, erro: `Falha ao criar cliente mTLS: ${e.message}` },
          500,
        );
      }
    }

    const distDFeInt = action === "consultar-chave"
      ? montarDistDFeInt({ ambiente, cnpj, chNFe: chNFeInput, cUFAutor })
      : montarDistDFeInt({ ambiente, cnpj, ultNSU: ultNSUInput, cUFAutor });
    const url = endpointAN(ambiente);

    // Tentamos SOAP 1.2 primeiro (binding oficial estável do .asmx do AN).
    // Se houver erro de transporte (reset/timeout/TLS) sem nenhuma resposta
    // HTTP, fazemos UMA tentativa adicional em SOAP 1.1. Qualquer resposta
    // HTTP da SEFAZ (mesmo 500/SOAP Fault) interrompe o fallback porque já
    // representa diagnóstico oficial.
    const tentativas: SoapVariant[] = ["soap12", "soap11"];
    let xmlRetorno = "";
    let respondeu = false;
    let ultimoErroTransporte: { raw: string; codigo: string } | null = null;

    for (let i = 0; i < tentativas.length; i++) {
      const variant = tentativas[i];
      const envelope = envelopeSoap(distDFeInt, variant);
      const headersSoap = headersFor(variant);

      log.info("preparado envio SEFAZ", {
        url,
        transporte: usarProxy ? "cloudflare-worker" : "deno-mtls",
        soapVariant: variant,
        tentativa: i + 1,
        ambiente,
        action,
        cUFAutor,
        cnpjLen: cnpj.length,
        envelopeBytes: envelope.length,
        certChainBytes: certPem.length,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      try {
        const resp = usarProxy
          ? await fetch(proxyUrl!, {
              method: "POST",
              headers: {
                "x-proxy-secret": proxySecret!,
                "x-target-url": url,
                "Content-Type": headersSoap["Content-Type"] ??
                  headersSoap["content-type"] ?? "application/soap+xml; charset=utf-8",
                ...(headersSoap["SOAPAction"]
                  ? { soapaction: headersSoap["SOAPAction"] }
                  : {}),
              },
              body: envelope,
              signal: controller.signal,
            })
          : await fetch(url, {
              method: "POST",
              headers: headersSoap,
              body: envelope,
              // @ts-ignore — option client é específica do Deno
              client: client!,
              signal: controller.signal,
            });
        clearTimeout(timer);
        const respText = await resp.text();

        if (usarProxy) {
          // Novo contrato: Worker repassa a resposta da SEFAZ tal-qual
          // (status + body cru). Status 401/400 do próprio Worker indicam
          // erro de configuração; demais status são da SEFAZ.
          xmlRetorno = respText;
          log.info("resposta SEFAZ via worker", {
            statusHttp: resp.status,
            statusText: resp.statusText,
            soapVariant: variant,
            bytes: xmlRetorno.length,
            preview: xmlRetorno.slice(0, 240),
          });
          // 401/400 com corpo curto = erro do próprio Worker (não da SEFAZ).
          if ((resp.status === 401 || resp.status === 400) && xmlRetorno.length < 200) {
            try { /* @ts-ignore */ client?.close?.(); } catch (_) { /* ignore */ }
            return json({
              sucesso: false,
              erro: `Worker mTLS rejeitou requisição (HTTP ${resp.status}): ${xmlRetorno}`,
              xmlRetorno,
              codigoTransporte: "WORKER_ERROR",
            });
          }
          // 5xx do AN → trata como falha de transporte e tenta a próxima
          // variante (SOAP 1.1) antes de desistir.
          if (resp.status >= 500) {
            log.info("falha de transporte SEFAZ via worker", {
              soapVariant: variant,
              tentativa: i + 1,
              statusHttp: resp.status,
              preview: xmlRetorno.slice(0, 240),
            });
            ultimoErroTransporte = {
              raw: `SEFAZ HTTP ${resp.status}: ${xmlRetorno.slice(0, 240)}`,
              codigo: resp.status === 520 ? "CLOUDFLARE_520" : "SEFAZ_5XX",
            };
            continue;
          }
          if (!resp.ok) {
            try { /* @ts-ignore */ client?.close?.(); } catch (_) { /* ignore */ }
            return json({
              sucesso: false,
              erro: `SEFAZ HTTP ${resp.status}: ${resp.statusText}`,
              xmlRetorno,
            });
          }
          // Sucesso: marca para sair do loop
          respondeu = true;
          break;
        } else {
          xmlRetorno = respText;
          log.info("resposta SEFAZ recebida", {
            statusHttp: resp.status,
            statusText: resp.statusText,
            contentType: resp.headers.get("content-type"),
            soapVariant: variant,
            bytes: xmlRetorno.length,
            preview: xmlRetorno.slice(0, 240),
          });
          if (!resp.ok) {
            // 415/500 com corpo: SOAP Fault legítimo. Não tenta outra variante.
            try { /* @ts-ignore */ client?.close?.(); } catch (_) { /* ignore */ }
            return json({
              sucesso: false,
              erro: `HTTP ${resp.status}: ${resp.statusText}`,
              xmlRetorno,
              soapVariant: variant,
            });
          }
        }
        respondeu = true;
        break;
      } catch (e: any) {
        clearTimeout(timer);
        const raw = e?.name === "AbortError"
          ? "Timeout de 45s ao conectar com o Ambiente Nacional"
          : e?.message ?? String(e);
        const looksLikeHttp2 = /HTTP\/1\.1|http2 error|stream error/i.test(raw);
        const looksLikeUnknownIssuer = /UnknownIssuer|invalid peer certificate/i.test(raw);
        const looksLikeReset = /Connection reset|reset by peer|EOF/i.test(raw);
        const looksLikeTls = /tls|handshake|alert/i.test(raw);
        const codigo = looksLikeUnknownIssuer
          ? "UNKNOWN_ISSUER"
          : looksLikeHttp2
          ? "HTTP2_REQUIRED"
          : looksLikeReset
          ? "CONNECTION_RESET"
          : looksLikeTls
          ? "TLS_FAILURE"
          : "TRANSPORT_ERROR";
        log.info("falha de transporte SEFAZ", {
          soapVariant: variant,
          tentativa: i + 1,
          codigo,
          raw: raw.slice(0, 240),
        });
        ultimoErroTransporte = { raw, codigo };
        // Erros de cadeia ICP-Brasil/HTTP2 não se resolvem mudando a variante.
        if (looksLikeUnknownIssuer || looksLikeHttp2) break;
        // Demais: tenta a próxima variante.
        continue;
      }
    }

    if (!respondeu) {
      try { /* @ts-ignore */ client?.close?.(); } catch (_) { /* ignore */ }
      const codigo = ultimoErroTransporte?.codigo ?? "TRANSPORT_ERROR";
      const raw = ultimoErroTransporte?.raw ?? "Falha de transporte sem detalhes.";
      let hint = "";
      if (codigo === "HTTP2_REQUIRED") {
        hint = " — o webservice NFeDistribuicaoDFe exige HTTP/1.1; ajuste o cliente para forçar http1.";
      } else if (codigo === "UNKNOWN_ISSUER") {
        hint = " — a cadeia de certificados do servidor SEFAZ não foi reconhecida pelo runtime (cadeia ICP-Brasil ausente). Caso recorrente, embutir caCerts ICP-Brasil no cliente HTTP.";
      } else if (codigo === "CONNECTION_RESET" || codigo === "TLS_FAILURE") {
        hint =
          " — falha de transporte contra o Ambiente Nacional após tentar SOAP 1.2 e SOAP 1.1. Possíveis causas: cadeia ICP-Brasil incompleta no A1, certificado expirado/de outro ambiente, ou bloqueio temporário do CNPJ no AN. O Portal NF-e segue funcionando, então o serviço da Receita está no ar.";
      }
      return json({
        sucesso: false,
        ambiente,
        cnpj,
        erro: `${raw}${hint}`,
        codigoTransporte: codigo,
      });
    }

    try { /* @ts-ignore */ client?.close?.(); } catch (_) { /* ignore */ }

    const parsed = parseRetDistDFeInt(xmlRetorno);
    log.info("retDistDFeInt", {
      cStat: parsed.cStat,
      xMotivo: parsed.xMotivo,
      docs: parsed.docs.length,
      ultNSU: parsed.ultNSU,
      maxNSU: parsed.maxNSU,
    });

    return json({
      sucesso: true,
      cnpj,
      ambiente,
      cStat: parsed.cStat,
      xMotivo: parsed.xMotivo,
      mensagemCstat: CSTAT_DESC[parsed.cStat] ?? null,
      ultNSU: parsed.ultNSU,
      maxNSU: parsed.maxNSU,
      docs: parsed.docs,
    });
  } catch (err: any) {
    log.error("request failed", err);
    return json({ error: err.message || "Erro interno" }, err.message?.includes("Sessão") ? 401 : 500);
  }
});