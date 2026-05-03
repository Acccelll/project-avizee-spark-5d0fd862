/**
 * Helper de cálculo de fatura de cartão de crédito.
 *
 * Espelha a lógica da RPC `cartao_fatura_para_data` para permitir preview
 * imediato no UI (sem round-trip ao banco). A persistência canônica continua
 * sendo via RPC.
 *
 * Regras:
 *  - Se diaCompra <= diaFechamento → fatura fecha no mês da compra.
 *  - Senão → fecha no mês seguinte.
 *  - Vencimento: no mês do fechamento se diaVencimento > diaFechamento;
 *    senão, no mês seguinte ao fechamento.
 *  - Para meses curtos, ajusta para o último dia válido do mês.
 */

export interface FaturaPreview {
  competencia: string; // YYYY-MM
  dataFechamento: Date;
  dataVencimento: Date;
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

function makeDate(year: number, month0: number, day: number): Date {
  const last = lastDayOfMonth(year, month0);
  return new Date(year, month0, Math.min(day, last));
}

function addMonths(year: number, month0: number, delta: number): { year: number; month0: number } {
  const total = year * 12 + month0 + delta;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function competenciaOf(year: number, month0: number): string {
  return `${year}-${pad(month0 + 1)}`;
}

/**
 * Calcula a fatura para uma compra/lançamento.
 * @param dataCompra Data ISO (YYYY-MM-DD) ou Date
 */
export function calcularFaturaParaData(
  dataCompra: string | Date,
  diaFechamento: number,
  diaVencimento: number,
): FaturaPreview {
  if (diaFechamento < 1 || diaFechamento > 31) throw new Error("diaFechamento inválido");
  if (diaVencimento < 1 || diaVencimento > 31) throw new Error("diaVencimento inválido");

  const d = typeof dataCompra === "string" ? new Date(`${dataCompra}T00:00:00`) : dataCompra;
  const year = d.getFullYear();
  const month0 = d.getMonth();
  const day = d.getDate();

  // Mês de fechamento
  const fechMonth = day <= diaFechamento ? { year, month0 } : addMonths(year, month0, 1);
  const dataFechamento = makeDate(fechMonth.year, fechMonth.month0, diaFechamento);

  // Mês de vencimento
  const vctoMonth =
    diaVencimento > diaFechamento
      ? fechMonth
      : addMonths(fechMonth.year, fechMonth.month0, 1);
  const dataVencimento = makeDate(vctoMonth.year, vctoMonth.month0, diaVencimento);

  return {
    competencia: competenciaOf(fechMonth.year, fechMonth.month0),
    dataFechamento,
    dataVencimento,
  };
}

/**
 * Calcula faturas de N parcelas mensais consecutivas.
 * Cada parcela usa a fatura do mês N (offset em meses sobre dataCompra).
 */
export function calcularFaturasParcelas(
  dataCompra: string | Date,
  diaFechamento: number,
  diaVencimento: number,
  numParcelas: number,
): FaturaPreview[] {
  const baseDate =
    typeof dataCompra === "string" ? new Date(`${dataCompra}T00:00:00`) : dataCompra;
  const out: FaturaPreview[] = [];
  for (let i = 0; i < numParcelas; i++) {
    const m = addMonths(baseDate.getFullYear(), baseDate.getMonth(), i);
    const d = makeDate(m.year, m.month0, baseDate.getDate());
    out.push(calcularFaturaParaData(d, diaFechamento, diaVencimento));
  }
  return out;
}

export function formatCompetencia(competencia: string): string {
  const [y, m] = competencia.split("-");
  return `${m}/${y}`;
}