import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CotacaoRequest {
  cepOrigem: string;
  cepDestino: string;
  peso: number;
  comprimento?: number;
  altura?: number;
  largura?: number;
}

interface FreteOption {
  servico: string;
  codigo: string;
  valor: number;
  prazo: number;
  erro?: string;
}

/**
 * Cache em memória do token Correios (vive enquanto o isolate estiver ativo).
 * Token oficial dura 30min; renovamos aos 25min para evitar expiração no meio
 * do polling do PDF de pré-postagem.
 */
const TOKEN_CACHE = new Map<string, { token: string; nuDR?: string; nuContrato?: string; expiresAt: number }>();

/**
 * Authenticate against the modern Correios REST API using a CWS Access Key
 * (Chave de Acesso). The Access Key authorizes /token/v1/autentica/contrato,
 * which returns a Bearer token usable on /preco/v2 and /prazo/v1 endpoints.
 *
 * Fallback: if only legacy USER/PASS are present, try Basic Auth.
 */
async function autenticarCorreios(opts: {
  apiKey?: string;
  contrato?: string;
  cartao?: string;
  user?: string;
  pass?: string;
}): Promise<{ token: string; nuDR?: string; nuContrato?: string } | null> {
  const { apiKey, contrato, cartao, user, pass } = opts;

  // Cache em memória do isolate (TTL 25min). Token Correios dura 30min;
  // renovamos um pouco antes para evitar 401 em chamadas longas (polling de PDF).
  const cacheKey = `${apiKey ?? ""}|${user ?? ""}|${contrato ?? ""}|${cartao ?? ""}`;
  const cached = TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { token: cached.token, nuDR: cached.nuDR, nuContrato: cached.nuContrato };
  }

  // Preferred: CWS Access Key flow (Basic Auth where user = CORREIOS_USER and pass = Access Key).
  // The Correios gateway returns "GTW-014 ... Utilize 'Authorization: Basic'" when Bearer is sent.
  if (apiKey && user) {
    // Sanitize: strip whitespace/CR/LF that may have leaked into the secret values.
    const cleanUser = user.replace(/[\s\r\n]+/g, "").trim();
    const cleanKey = apiKey.replace(/[\s\r\n]+/g, "").trim();
    const userDigits = cleanUser.replace(/\D/g, "");
    const looksLikeDoc = !cleanUser.includes("@") && userDigits.length >= 11 && userDigits.length <= 14;
    const userToTry = looksLikeDoc ? userDigits : cleanUser;
    const credPair = `${userToTry}:${cleanKey}`;
    const basicKey = btoa(credPair);
    console.log(
      `[correios-auth-key] user_raw_len=${user.length} user_clean_len=${cleanUser.length} user_used_len=${userToTry.length} user_prefix=${userToTry.slice(0, 3)}*** key_raw_len=${apiKey.length} key_clean_len=${cleanKey.length} key_prefix=${cleanKey.slice(0, 8)}*** key_suffix=***${cleanKey.slice(-4)} pair_len=${credPair.length} basic_len=${basicKey.length} contrato=${contrato || "(none)"} cartao=${cartao || "(none)"}`,
    );
    const attempts: Array<{ url: string; body: Record<string, string> }> = [];
    if (contrato) {
      attempts.push({
        url: "https://api.correios.com.br/token/v1/autentica/contrato",
        body: { numero: contrato },
      });
    }
    if (cartao) {
      attempts.push({
        url: "https://api.correios.com.br/token/v1/autentica/cartaopostagem",
        body: { numero: cartao },
      });
    }
    attempts.push({ url: "https://api.correios.com.br/token/v1/autentica", body: {} });

    for (const ep of attempts) {
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: Object.keys(ep.body).length ? JSON.stringify(ep.body) : undefined,
        });
        const txt = await res.text();
        if (!res.ok) {
          console.warn(`[correios-auth-key] ${ep.url} → ${res.status} headers=${res.headers.get("www-authenticate") || "-"} body=${txt.slice(0, 500) || "(empty)"}`);
          continue;
        }
        const data = JSON.parse(txt);
        if (data?.token) {
          const apisAuth = (data?.cartaoPostagem?.apis || data?.contrato?.apis || data?.apis || []).map((a: { api: number }) => a.api);
          const dr = data?.cartaoPostagem?.dr ?? data?.contrato?.dr;
          const nuContrato = data?.cartaoPostagem?.contrato ?? data?.contrato?.numero;
          console.log(`[correios-auth-key] OK via ${ep.url} apis=${JSON.stringify(apisAuth)} dr=${dr} contrato=${nuContrato}`);
          const result = { token: data.token as string, nuDR: dr != null ? String(dr) : undefined, nuContrato: nuContrato ? String(nuContrato) : undefined };
          TOKEN_CACHE.set(cacheKey, { ...result, expiresAt: Date.now() + 25 * 60 * 1000 });
          return result;
        }
      } catch (e) {
        console.warn(`[correios-auth-key] ${ep.url} threw`, e);
      }
    }
  }

  // Legacy fallback: Basic Auth (user + senha de componente)
  if (user && pass) {
    const basic = btoa(`${user}:${pass}`);
    const legacyEndpoints: Array<{ url: string; body: Record<string, string> | null }> = [
      { url: "https://api.correios.com.br/token/v1/autentica/cartaopostagem", body: cartao ? { numero: cartao } : null },
      { url: "https://api.correios.com.br/token/v1/autentica", body: null },
    ];
    for (const ep of legacyEndpoints) {
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: ep.body ? JSON.stringify(ep.body) : undefined,
        });
        if (!res.ok) {
          const txt = await res.text();
          console.warn(`[correios-auth-legacy] ${ep.url} → ${res.status}: ${txt.slice(0, 200)}`);
          continue;
        }
        const data = await res.json();
          if (data?.token) {
            const dr = data?.cartaoPostagem?.dr ?? data?.contrato?.dr;
            const nuContrato = data?.cartaoPostagem?.contrato ?? data?.contrato?.numero;
            const result = { token: data.token as string, nuDR: dr != null ? String(dr) : undefined, nuContrato: nuContrato ? String(nuContrato) : undefined };
            TOKEN_CACHE.set(cacheKey, { ...result, expiresAt: Date.now() + 25 * 60 * 1000 });
            return result;
          }
      } catch (e) {
        console.warn(`[correios-auth-legacy] ${ep.url} threw`, e);
      }
    }
  }

  return null;
}

/**
 * Correios API Edge Function
 * Supports ?action=cotacao_multi for shipping quotes.
 * Uses the modern Correios REST API (api.correios.com.br) — the legacy
 * CalcPrecoPrazo SOAP endpoint was discontinued in 2024.
 * Requires CORREIOS_USER / CORREIOS_PASS (and optionally CORREIOS_CARTAO_POSTAGEM).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "cotacao_multi" && req.method === "POST") {
      const body: CotacaoRequest = await req.json();
      const { cepOrigem, cepDestino, peso, comprimento = 30, altura = 15, largura = 10 } = body;

      if (!cepOrigem || !cepDestino || !peso) {
        return new Response(
          JSON.stringify({ error: "cepOrigem, cepDestino e peso são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const correiosUser = Deno.env.get("CORREIOS_USER") || "";
      const correiosPass = Deno.env.get("CORREIOS_PASS") || "";
      const cartaoPostagem = Deno.env.get("CORREIOS_CARTAO_POSTAGEM") || "";
      const apiKey = Deno.env.get("CORREIOS_API_KEY") || "";
      const contrato = Deno.env.get("CORREIOS_CONTRATO") || "";

      // Códigos contratuais primeiro (cartão de postagem), varejo como fallback
      const services = [
        { codigo: "03220", nome: "SEDEX" },
        { codigo: "03298", nome: "PAC" },
        { codigo: "04014", nome: "SEDEX" },
        { codigo: "04510", nome: "PAC" },
      ];

      let results: FreteOption[] = [];
      let usedFallback = false;
      let authError: string | null = null;

      // 1) Authenticate with modern REST API
      let auth: { token: string; nuDR?: string; nuContrato?: string } | null = null;
      if (apiKey || (correiosUser && correiosPass)) {
        auth = await autenticarCorreios({
          apiKey: apiKey || undefined,
          contrato: contrato || undefined,
          cartao: cartaoPostagem || undefined,
          user: correiosUser || undefined,
          pass: correiosPass || undefined,
        });
        if (!auth) {
          authError = "Falha ao autenticar nos Correios. Verifique CORREIOS_API_KEY, CORREIOS_CONTRATO e CORREIOS_CARTAO_POSTAGEM.";
          console.error("[correios-cotacao]", authError);
        }
      } else {
        authError = "Credenciais dos Correios não configuradas (CORREIOS_API_KEY ou CORREIOS_USER/CORREIOS_PASS).";
      }

      if (auth) {
        const token = auth.token;
        const nuDR = auth.nuDR || "72"; // fallback DR-SP
        const nuContratoFinal = auth.nuContrato || contrato || cartaoPostagem;
        const pesoGramas = Math.max(Math.round(peso * 1000), 300);
        const seen = new Set<string>();
        for (const svc of services) {
          if (seen.has(svc.nome)) continue; // já obtido por código contratado
          try {
            // Preço — endpoint GET v1 (querystring). Aceita parâmetros simples por código.
            const precoQS = new URLSearchParams({
              cepDestino,
              cepOrigem,
              psObjeto: String(pesoGramas),
              comprimento: String(comprimento),
              largura: String(largura),
              altura: String(altura),
              tpObjeto: "2",
              ...(nuContratoFinal ? { nuContrato: nuContratoFinal, nuDR, nuRequisicao: "1" } : {}),
            });
            const precoUrl = `https://api.correios.com.br/preco/v1/nacional/${svc.codigo}?${precoQS}`;
            const precoRes = await fetch(precoUrl, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
            });
            const precoTxt = await precoRes.text();
            if (!precoRes.ok) {
              console.warn(`[correios-cotacao] ${svc.nome} (${svc.codigo}) PRECO status=${precoRes.status} body=${precoTxt.slice(0, 400)}`);
              continue;
            }
            let precoItem: Record<string, unknown> = {};
            try { precoItem = JSON.parse(precoTxt); } catch { /* ignore */ }
            console.log(`[correios-cotacao] ${svc.nome} (${svc.codigo}) PRECO OK:`, JSON.stringify(precoItem).slice(0, 300));

            const valorStr = ((precoItem?.pcFinal as string) || (precoItem?.pcBase as string) || "0").toString().replace(",", ".");
            const valor = parseFloat(valorStr);

            // Prazo — também GET v1 por código
            const prazoQS = new URLSearchParams({ cepDestino, cepOrigem });
            const prazoUrl = `https://api.correios.com.br/prazo/v1/nacional/${svc.codigo}?${prazoQS}`;
            const prazoRes = await fetch(prazoUrl, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
            });
            const prazoTxt = await prazoRes.text();
            let prazoItem: Record<string, unknown> = {};
            try { prazoItem = JSON.parse(prazoTxt); } catch { /* ignore */ }
            if (!prazoRes.ok) {
              console.warn(`[correios-cotacao] ${svc.nome} (${svc.codigo}) PRAZO status=${prazoRes.status} body=${prazoTxt.slice(0, 300)}`);
            } else {
              console.log(`[correios-cotacao] ${svc.nome} (${svc.codigo}) PRAZO OK:`, JSON.stringify(prazoItem).slice(0, 200));
            }
            const prazo = parseInt((prazoItem?.prazoEntrega as string) || "0", 10) || 0;

            if (valor > 0) {
              results.push({ servico: svc.nome, codigo: svc.codigo, valor, prazo });
              seen.add(svc.nome);
            }
          } catch (svcErr) {
            console.error(`[correios-cotacao] ${svc.nome} error:`, svcErr);
          }
        }
      }

      // If all results errored, provide estimated fallback values so the UI is usable
      const allErrored = results.every((r) => !!r.erro || r.valor <= 0);
      if (allErrored) {
        usedFallback = true;
        const pesoCalc = Math.max(peso, 0.3);
        const baseSedex = 25 + pesoCalc * 12;
        const basePac = 18 + pesoCalc * 7;
        results = [
          { servico: "SEDEX (estimativa)", codigo: "04014", valor: Math.round(baseSedex * 100) / 100, prazo: 3, erro: authError ?? undefined },
          { servico: "PAC (estimativa)", codigo: "04510", valor: Math.round(basePac * 100) / 100, prazo: 8, erro: authError ?? undefined },
        ];
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "rastrear" && req.method === "GET") {
      // Onda 5 / C-04: rastreio só para usuários autenticados.
      await requireUserWithRole(req);
      const codigo = url.searchParams.get("codigo") || "";
      if (!codigo) {
        return new Response(
          JSON.stringify({ error: "Parâmetro 'codigo' é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const correiosUser = Deno.env.get("CORREIOS_USER") || "";
      const correiosPass = Deno.env.get("CORREIOS_PASS") || "";

      // If no credentials, return mock tracking data
      if (!correiosUser || !correiosPass) {
        const mockData = {
          warning: "fallback_mock",
          data: {
            eventos: [
              { tipo: "BDE", descricao: "Objeto entregue ao destinatário", dtHrCriado: new Date(Date.now() - 86400000).toISOString(), unidade: { nome: "Unidade de Distribuição", endereco: { cidade: "São Paulo" } } },
              { tipo: "OEC", descricao: "Objeto saiu para entrega ao destinatário", dtHrCriado: new Date(Date.now() - 86400000 * 2).toISOString(), unidade: { nome: "Unidade de Distribuição", endereco: { cidade: "São Paulo" } } },
              { tipo: "RO", descricao: "Objeto em trânsito - por favor aguarde", dtHrCriado: new Date(Date.now() - 86400000 * 4).toISOString(), unidade: { nome: "Unidade de Tratamento", endereco: { cidade: "Curitiba" } } },
              { tipo: "PO", descricao: "Objeto postado", dtHrCriado: new Date(Date.now() - 86400000 * 6).toISOString(), unidade: { nome: "Agência dos Correios", endereco: { cidade: "Florianópolis" } } },
            ],
          },
        };
        return new Response(JSON.stringify(mockData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Authenticate with Correios SRO API
      try {
        // Try Correios public SRO endpoint
        const sroUrl = `https://proxyapp.correios.com.br/v1/sro-rastro/${codigo}`;
        
        // Get auth token
        const authRes = await fetch("https://proxyapp.correios.com.br/v1/autentica/cartaopostagem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numero: correiosUser, senha: correiosPass }),
        });

        let trackingResult;
        if (authRes.ok) {
          const authData = await authRes.json();
          const tokenCorreios = authData.token;
          const trackRes = await fetch(sroUrl, {
            headers: { Authorization: `Bearer ${tokenCorreios}` },
          });
          trackingResult = await trackRes.json();
        } else {
          // Fallback: try legacy XML endpoint
          const legacyUrl = `http://webservice.correios.com.br/service/rest/rastro/rastroMobile?usuario=${encodeURIComponent(correiosUser)}&senha=${encodeURIComponent(correiosPass)}&tipo=L&resultado=T&objetos=${codigo}&lingua=101&token=`;
          const legacyRes = await fetch(legacyUrl);
          const legacyText = await legacyRes.text();
          // Parse minimal XML
          const objetoMatch = legacyText.match(/<objeto>([\s\S]*?)<\/objeto>/);
          if (objetoMatch) {
            const eventos: unknown[] = [];
            const eventoMatches = legacyText.matchAll(/<evento>([\s\S]*?)<\/evento>/g);
            for (const m of eventoMatches) {
              const descMatch = m[1].match(/<descricao>(.*?)<\/descricao>/);
              const tipoMatch = m[1].match(/<tipo>(.*?)<\/tipo>/);
              const dtMatch = m[1].match(/<data>(.*?)<\/data>/);
              const hrMatch = m[1].match(/<hora>(.*?)<\/hora>/);
              const cidadeMatch = m[1].match(/<cidade>(.*?)<\/cidade>/);
              const localMatch = m[1].match(/<local>(.*?)<\/local>/);
              eventos.push({
                tipo: tipoMatch?.[1] || "",
                descricao: descMatch?.[1] || "",
                dtHrCriado: dtMatch?.[1] && hrMatch?.[1] ? `${dtMatch[1]}T${hrMatch[1]}` : new Date().toISOString(),
                unidade: { nome: localMatch?.[1] || "", endereco: { cidade: cidadeMatch?.[1] || "" } },
              });
            }
            trackingResult = { objetos: [{ eventos }] };
          } else {
            trackingResult = { objetos: [{ eventos: [] }] };
          }
        }

        return new Response(JSON.stringify(trackingResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (trackErr: any) {
        console.error("[correios-rastrear] Falling back to mock:", trackErr.message);
        // Network/auth errors → return mock data so the UI still works
        const mockFallback = {
          warning: "fallback_mock",
          data: {
            eventos: [
              { tipo: "BDE", descricao: "Objeto entregue ao destinatário", dtHrCriado: new Date(Date.now() - 86400000).toISOString(), unidade: { nome: "Unidade de Distribuição", endereco: { cidade: "São Paulo" } } },
              { tipo: "OEC", descricao: "Objeto saiu para entrega ao destinatário", dtHrCriado: new Date(Date.now() - 86400000 * 2).toISOString(), unidade: { nome: "Unidade de Distribuição", endereco: { cidade: "São Paulo" } } },
              { tipo: "RO", descricao: "Objeto em trânsito - por favor aguarde", dtHrCriado: new Date(Date.now() - 86400000 * 4).toISOString(), unidade: { nome: "Unidade de Tratamento", endereco: { cidade: "Curitiba" } } },
              { tipo: "PO", descricao: "Objeto postado", dtHrCriado: new Date(Date.now() - 86400000 * 6).toISOString(), unidade: { nome: "Agência dos Correios", endereco: { cidade: "Florianópolis" } } },
            ],
          },
        };
        return new Response(JSON.stringify(mockFallback), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Pré-postagem ───────────────────────────────────────────────
    if (action && action.startsWith("prepostagem_")) {
      return await handlePrepostagem(req, action, url);
    }

    return new Response(
      JSON.stringify({ error: "Ação não suportada. Use ?action=cotacao_multi, ?action=rastrear ou ?action=prepostagem_*" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[correios-api]", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// Pré-postagem Correios (API contratual /prepostagem/v1)
// ─────────────────────────────────────────────────────────────────────

function makeAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function requireUserWithRole(req: Request): Promise<{ userId: string }> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Token de autenticação ausente.");
  const admin = makeAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão inválida ou expirada.");

  const userId = data.user.id;
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const allowed = new Set(["admin", "estoquista", "vendedor"]);
  const has = (roles ?? []).some((r: { role: string }) => allowed.has(r.role));
  if (!has) throw new Error("Permissão insuficiente para gerar etiquetas.");
  return { userId };
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function autenticarParaPrepostagem(): Promise<{ token: string; nuDR?: string; nuContrato?: string }> {
  const auth = await autenticarCorreios({
    apiKey: Deno.env.get("CORREIOS_API_KEY") || undefined,
    contrato: Deno.env.get("CORREIOS_CONTRATO") || undefined,
    cartao: Deno.env.get("CORREIOS_CARTAO_POSTAGEM") || undefined,
    user: Deno.env.get("CORREIOS_USER") || undefined,
    pass: Deno.env.get("CORREIOS_PASS") || undefined,
  });
  if (!auth) throw new Error("Falha ao autenticar nos Correios. Verifique CORREIOS_API_KEY/CORREIOS_USER.");
  return auth;
}

function onlyDigits(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

async function buildPrepostagemBody(
  admin: ReturnType<typeof makeAdminClient>,
  remessaId: string,
  nuContrato?: string,
  nuDR?: string,
): Promise<Record<string, unknown>> {
  const { data: remessa, error: rErr } = await admin
    .from("remessas")
    .select("id, cliente_id, servico, peso, volumes, valor_frete, observacoes, ordem_venda_id")
    .eq("id", remessaId)
    .maybeSingle();
  if (rErr || !remessa) throw new Error("Remessa não encontrada.");
  if (!remessa.cliente_id) throw new Error("Remessa sem cliente associado.");
  if (!remessa.servico) throw new Error("Informe o serviço (SEDEX/PAC) na remessa.");

  const { data: cli, error: cErr } = await admin
    .from("clientes")
    .select("nome_razao_social, cpf_cnpj, tipo_pessoa, email, telefone, logradouro, numero, complemento, bairro, cidade, uf, cep")
    .eq("id", remessa.cliente_id)
    .maybeSingle();
  if (cErr || !cli) throw new Error("Cliente não encontrado para a remessa.");

  if (!cli.cep) throw new Error("Cliente sem CEP cadastrado.");
  if (!cli.logradouro || !cli.cidade || !cli.uf) throw new Error("Endereço do cliente incompleto (logradouro/cidade/UF).");

  // Dados do remetente — fonte canônica: empresa_config (Administração → Empresa).
  // Fallback para chaves legadas em app_configuracoes mantido por compatibilidade.
  const { data: empCfg } = await admin
    .from("empresa_config")
    .select("razao_social, cnpj, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, email")
    .limit(1)
    .maybeSingle();

  const cfg: Record<string, string> = {
    razao_social: empCfg?.razao_social ?? "",
    cnpj_empresa: empCfg?.cnpj ?? "",
    cep_empresa: empCfg?.cep ?? "",
    endereco_empresa: empCfg?.logradouro ?? "",
    numero_empresa: empCfg?.numero ?? "",
    complemento_empresa: empCfg?.complemento ?? "",
    bairro_empresa: empCfg?.bairro ?? "",
    cidade_empresa: empCfg?.cidade ?? "",
    uf_empresa: empCfg?.uf ?? "",
    telefone_empresa: empCfg?.telefone ?? "",
    email_empresa: empCfg?.email ?? "",
  };

  // Fallback: chaves legadas em app_configuracoes preenchem o que estiver vazio
  const missingKeys = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
  if (missingKeys.length > 0) {
    const { data: cfgRows } = await admin
      .from("app_configuracoes")
      .select("chave, valor")
      .in("chave", missingKeys);
    for (const r of cfgRows ?? []) {
      const v = (r as { valor: unknown }).valor;
      const parsed = typeof v === "string" ? v.replace(/^"|"$/g, "") : String(v);
      if (parsed) cfg[(r as { chave: string }).chave] = parsed;
    }
  }

  const cepRemetente = onlyDigits(cfg.cep_empresa);
  if (!cepRemetente) throw new Error("CEP do remetente (empresa) não configurado em Administração → Empresa.");
  if (!cfg.cnpj_empresa) throw new Error("CNPJ do remetente (empresa) não configurado em Administração → Empresa.");
  if (!cfg.endereco_empresa || !cfg.cidade_empresa || !cfg.uf_empresa) {
    throw new Error("Endereço do remetente incompleto (logradouro/cidade/UF) em Administração → Empresa.");
  }

  // Mapeia o nome do serviço para o código contratual
  const servicoUpper = (remessa.servico || "").toUpperCase();
  const codigoServico = servicoUpper.includes("SEDEX") ? "03220"
    : servicoUpper.includes("PAC") ? "03298"
    : remessa.servico;

  const pesoGramas = Math.max(Math.round((Number(remessa.peso) || 0.3) * 1000), 300);

  const body: Record<string, unknown> = {
    idCorreios: undefined,
    codigoServico,
    numeroNotaFiscal: undefined,
    serieNotaFiscal: undefined,
    chaveNFe: undefined,
    cienciaConteudoProibido: "1",
    observacao: remessa.observacoes ?? undefined,
    solicitarColeta: "N",
    remetente: {
      nome: cfg.razao_social || "Empresa",
      dddTelefone: onlyDigits(cfg.telefone_empresa).slice(0, 2) || "11",
      telefone: onlyDigits(cfg.telefone_empresa).slice(2) || undefined,
      email: cfg.email_empresa || undefined,
      cpfCnpj: onlyDigits(cfg.cnpj_empresa) || undefined,
      endereco: {
        cep: cepRemetente,
        logradouro: cfg.endereco_empresa || "",
        numero: cfg.numero_empresa || "S/N",
        complemento: cfg.complemento_empresa || undefined,
        bairro: cfg.bairro_empresa || "",
        cidade: cfg.cidade_empresa || "",
        uf: (cfg.uf_empresa || "").toUpperCase(),
      },
    },
    destinatario: {
      nome: cli.nome_razao_social,
      dddTelefone: onlyDigits(cli.telefone).slice(0, 2) || undefined,
      telefone: onlyDigits(cli.telefone).slice(2) || undefined,
      email: cli.email || undefined,
      cpfCnpj: onlyDigits(cli.cpf_cnpj) || undefined,
      endereco: {
        cep: onlyDigits(cli.cep),
        logradouro: cli.logradouro,
        numero: cli.numero || "S/N",
        complemento: cli.complemento || undefined,
        bairro: cli.bairro || "",
        cidade: cli.cidade,
        uf: (cli.uf || "").toUpperCase(),
      },
    },
    servicosAdicionais: [],
    pesoInformado: String(pesoGramas),
    codigoFormatoObjetoInformado: "2", // 2 = Caixa/Pacote
    alturaInformada: "15",
    larguraInformada: "15",
    comprimentoInformado: "20",
    diametroInformado: "0",
    valorDeclarado: remessa.valor_frete ? String(Number(remessa.valor_frete).toFixed(2)) : undefined,
    listaServicoAdicional: [],
  };
  if (nuContrato) body.numeroContrato = nuContrato;
  if (nuDR) body.numeroDR = nuDR;

  return body;
}

async function handlePrepostagem(req: Request, action: string, url: URL): Promise<Response> {
  await requireUserWithRole(req);
  const admin = makeAdminClient();

  // ── Criar pré-postagem ─────────────────────────────────────────
  if (action === "prepostagem_criar" && req.method === "POST") {
    const { remessa_id } = await req.json();
    if (!remessa_id) return jsonRes({ error: "remessa_id é obrigatório" }, 400);

    const auth = await autenticarParaPrepostagem();
    const body = await buildPrepostagemBody(admin, remessa_id, auth.nuContrato, auth.nuDR);

    const res = await fetch("https://api.correios.com.br/prepostagem/v1/prepostagens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(txt); } catch { /* */ }
    if (!res.ok) {
      console.error(`[prepostagem-criar] status=${res.status} body=${txt.slice(0, 800)}`);
      return jsonRes({ error: `Correios ${res.status}: ${(data as { msgs?: string[] }).msgs?.join("; ") || txt.slice(0, 400)}` }, 502);
    }
    return jsonRes({
      id: data.id ?? data.idPrePostagem,
      codigoObjeto: data.codigoObjeto,
      raw: data,
      requestBody: body,
    });
  }

  // ── Solicitar geração assíncrona do PDF ────────────────────────
  if (action === "prepostagem_rotulo" && req.method === "POST") {
    const { idsPrePostagem, tipoRotulo = "P" } = await req.json();
    if (!Array.isArray(idsPrePostagem) || idsPrePostagem.length === 0) {
      return jsonRes({ error: "idsPrePostagem (array) é obrigatório" }, 400);
    }
    const auth = await autenticarParaPrepostagem();
    const res = await fetch("https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/assincrono/pdf", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ idsPrePostagem, tipoRotulo, idCorreios: undefined, layoutImpressao: "P" }),
    });
    const txt = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(txt); } catch { /* */ }
    if (!res.ok) {
      console.error(`[prepostagem-rotulo] status=${res.status} body=${txt.slice(0, 800)}`);
      return jsonRes({ error: `Correios ${res.status}: ${txt.slice(0, 400)}` }, 502);
    }
    return jsonRes({ idRecibo: data.idRecibo ?? data.id, raw: data });
  }

  // ── Consultar PDF gerado ───────────────────────────────────────
  if (action === "prepostagem_pdf" && req.method === "GET") {
    const idRecibo = url.searchParams.get("idRecibo") || "";
    if (!idRecibo) return jsonRes({ error: "idRecibo é obrigatório" }, 400);
    const auth = await autenticarParaPrepostagem();
    const res = await fetch(
      `https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/download/assincrono/${encodeURIComponent(idRecibo)}`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } },
    );
    const txt = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(txt); } catch { /* */ }
    if (!res.ok) {
      console.error(`[prepostagem-pdf] status=${res.status} body=${txt.slice(0, 400)}`);
      return jsonRes({ status: "erro", error: `Correios ${res.status}` }, 502);
    }
    const dados = (data as { dados?: string }).dados;
    if (!dados) return jsonRes({ status: "pendente" });
    return jsonRes({ status: "pronto", pdfBase64: dados });
  }

  // ── Cancelar pré-postagem ──────────────────────────────────────
  if (action === "prepostagem_cancelar" && req.method === "POST") {
    const { idCorreios } = await req.json();
    if (!idCorreios) return jsonRes({ error: "idCorreios é obrigatório" }, 400);
    const auth = await autenticarParaPrepostagem();
    const res = await fetch(
      `https://api.correios.com.br/prepostagem/v1/prepostagens/${encodeURIComponent(idCorreios)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } },
    );
    const txt = await res.text();
    if (!res.ok) {
      return jsonRes({ error: `Correios ${res.status}: ${txt.slice(0, 300)}` }, 502);
    }
    return jsonRes({ ok: true });
  }

  return jsonRes({ error: `Action de pré-postagem inválida: ${action}` }, 400);
}
