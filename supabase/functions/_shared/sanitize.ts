/**
 * Remove/mascara campos sensíveis antes de logar payloads em edge functions
 * fiscais (sefaz-proxy, sefaz-distdfe, consultadanfe-proxy, process-distdfe-cron).
 *
 * Aplicado automaticamente pelo `createLogger` (logger.ts) sobre o `extra`
 * de cada chamada. Cobertura:
 *   - Chaves comuns: pfxBase64, pfxPassword, password, senha, certificado,
 *     authorization, apikey, api_key, x-pfx-base64, x-pfx-password.
 *   - Strings grandes em base64 (>200 chars) viram `[base64:<n>b]`.
 *   - Conteúdo de XML assinado (<Signature>...</Signature>) é truncado.
 */
const SENSITIVE_KEYS = new Set([
  "pfxbase64",
  "pfxpassword",
  "password",
  "senha",
  "certificado",
  "cert",
  "authorization",
  "apikey",
  "api_key",
  "x-pfx-base64",
  "x-pfx-password",
  "service_role_key",
  "service_role",
  "anon_key",
  "secret",
  "token",
  "access_token",
  "refresh_token",
]);

const BASE64_LIKE = /^[A-Za-z0-9+/=]{200,}$/;
const SIGNATURE_RE = /<Signature[\s\S]*?<\/Signature>/g;

function sanitizeString(value: string): string {
  if (BASE64_LIKE.test(value)) return `[base64:${value.length}b]`;
  if (value.includes("<Signature")) {
    return value.replace(SIGNATURE_RE, "<Signature>[redacted]</Signature>");
  }
  return value;
}

export function sanitizeForLog<T>(input: T, depth = 0): T {
  if (depth > 6) return "[max-depth]" as unknown as T;
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return sanitizeString(input) as unknown as T;
  if (typeof input !== "object") return input;
  if (Array.isArray(input)) {
    return input.map((v) => sanitizeForLog(v, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = v === undefined || v === null ? v : "[redacted]";
    } else {
      out[k] = sanitizeForLog(v, depth + 1);
    }
  }
  return out as unknown as T;
}