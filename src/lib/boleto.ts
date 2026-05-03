/**
 * Parser de linha digitável de boleto bancário (47 dígitos) e arrecadação (48 dígitos).
 *
 * Implementação MVP usada pelo módulo Financeiro (DDA manual):
 * - Aceita linha digitável com pontos, espaços ou hífens (sanitiza para apenas dígitos).
 * - Retorna `valor` em reais e `vencimento` (YYYY-MM-DD) quando disponíveis.
 * - Não valida DV, não consulta banco — somente extrai o que está codificado.
 */

export interface BoletoParsed {
  tipo: "bancario" | "arrecadacao";
  valor: number | null;
  vencimento: string | null;
  raw: string;
}

const BASE_VENCIMENTO = new Date(Date.UTC(1997, 9, 7)); // 1997-10-07

function sanitize(input: string): string {
  return (input || "").replace(/\D/g, "");
}

function fatorParaData(fator: number): string | null {
  if (!fator || fator <= 0) return null;
  const ms = BASE_VENCIMENTO.getTime() + fator * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseBoleto(input: string): BoletoParsed | null {
  const digits = sanitize(input);
  if (!digits) return null;

  // Arrecadação (concessionárias) — 48 dígitos, começa com 8
  if (digits.length === 48 && digits.startsWith("8")) {
    // Posições 5-15 (índice 4..14, 11 dígitos) é o valor para identificadores 6/7
    const valorRaw = digits.slice(4, 15);
    const valor = Number(valorRaw) / 100;
    return {
      tipo: "arrecadacao",
      valor: Number.isFinite(valor) && valor > 0 ? valor : null,
      vencimento: null,
      raw: digits,
    };
  }

  // Bancário — 47 dígitos
  if (digits.length !== 47) return null;

  // Reconstrói o código de barras (44 dígitos) a partir da linha digitável
  // Campo1: pos 0..3 (banco+moeda) + pos 4..8 (5 dig início campo livre)
  // Campo2: pos 10..19 (10 dig)
  // Campo3: pos 21..30 (10 dig)
  // DV geral: pos 32 (1 dig)
  // Fator+valor: pos 33..46 (14 dig)
  const campo1 = digits.slice(0, 9); // ignora DV (pos 9)
  const campo2 = digits.slice(10, 20);
  const campo3 = digits.slice(21, 31);
  const dvGeral = digits.slice(32, 33);
  const fatorValor = digits.slice(33, 47);

  const fator = Number(fatorValor.slice(0, 4));
  const valorRaw = fatorValor.slice(4);
  const valor = Number(valorRaw) / 100;

  return {
    tipo: "bancario",
    valor: Number.isFinite(valor) && valor > 0 ? valor : null,
    vencimento: fatorParaData(fator),
    raw: digits,
    // campos auxiliares (não usados externamente, evitam DCE):
    ...({ _campo1: campo1, _campo2: campo2, _campo3: campo3, _dv: dvGeral } as object),
  } as BoletoParsed;
}

/** Formata uma linha digitável bancária (47 dig) com a máscara padrão. */
export function formatLinhaDigitavel(input: string): string {
  const d = sanitize(input);
  if (d.length !== 47) return input;
  return [
    d.slice(0, 5) + "." + d.slice(5, 10),
    d.slice(10, 15) + "." + d.slice(15, 21),
    d.slice(21, 26) + "." + d.slice(26, 32),
    d.slice(32, 33),
    d.slice(33, 47),
  ].join(" ");
}