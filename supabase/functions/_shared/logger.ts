/**
 * Structured JSON logger compartilhado por edge functions.
 *
 * Saída em uma linha por evento, formato JSON, para que o Supabase
 * Logs Explorer/Lovable Cloud consigam filtrar por `function`,
 * `request_id` e `level` sem regex.
 *
 * Uso:
 *   const log = createLogger("admin-users", req);
 *   log.info("listing users", { count: 12 });
 *   log.error("supabase rejected", err);
 *
 * Nunca registre segredos (tokens, senhas, certificados): o objeto
 * `extra` é serializado com `JSON.stringify` cru.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

import { sanitizeForLog } from "./sanitize.ts";

export interface Logger {
  requestId: string;
  debug: (message: string, extra?: unknown) => void;
  info: (message: string, extra?: unknown) => void;
  warn: (message: string, extra?: unknown) => void;
  error: (message: string, extra?: unknown) => void;
  child: (extra: Record<string, unknown>) => Logger;
}

function newRequestId(): string {
  // crypto.randomUUID está disponível no runtime do Deno Deploy.
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function serializeExtra(extra: unknown): unknown {
  if (extra === undefined || extra === null) return undefined;
  if (extra instanceof Error) {
    return sanitizeForLog({
      name: extra.name,
      message: extra.message,
      stack: extra.stack,
    });
  }
  return sanitizeForLog(extra);
}

export function createLogger(
  fn: string,
  reqOrContext?: Request | { request_id?: string },
): Logger {
  let requestId = "";
  if (reqOrContext instanceof Request) {
    requestId =
      reqOrContext.headers.get("x-request-id") ??
      reqOrContext.headers.get("x-correlation-id") ??
      newRequestId();
  } else if (reqOrContext && typeof reqOrContext === "object") {
    requestId = reqOrContext.request_id ?? newRequestId();
  } else {
    requestId = newRequestId();
  }

  const baseContext: Record<string, unknown> = {};

  function emit(level: LogLevel, message: string, extra?: unknown) {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      fn,
      request_id: requestId,
      message,
      ...baseContext,
    };
    const serialized = serializeExtra(extra);
    if (serialized !== undefined) entry.extra = serialized;
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  const logger: Logger = {
    requestId,
    debug: (m, e) => emit("debug", m, e),
    info: (m, e) => emit("info", m, e),
    warn: (m, e) => emit("warn", m, e),
    error: (m, e) => emit("error", m, e),
    child(extra: Record<string, unknown>) {
      const merged: Logger = createLogger(fn, { request_id: requestId });
      // Pequeno truque: anexar contexto extra ao child via closure
      // criando um wrapper que mescla o `extra` em cada chamada.
      const wrap = (lvl: LogLevel) => (m: string, e?: unknown) => {
        const combined =
          e && typeof e === "object" && !(e instanceof Error)
            ? { ...extra, ...(e as Record<string, unknown>) }
            : e !== undefined
              ? { ...extra, value: e }
              : { ...extra };
        emit(lvl, m, combined);
      };
      merged.debug = wrap("debug");
      merged.info = wrap("info");
      merged.warn = wrap("warn");
      merged.error = wrap("error");
      return merged;
    },
  };

  return logger;
}