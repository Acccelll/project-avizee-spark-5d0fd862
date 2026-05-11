/**
 * Formatação e cálculos para pt-BR.
 */

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export const formatMoney = formatCurrency;

const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Versão compacta para KPIs em telas estreitas: ex. `R$ 731,8 mil`, `R$ 1,2 mi`. */
export function formatCurrencyCompact(value: number): string {
  return compactCurrencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

function normalizeDate(value: string | Date) {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(value);
}

export function formatDate(date: string | Date): string {
  if (!date) return "-";
  return normalizeDate(date).toLocaleDateString("pt-BR");
}

export function daysSince(date: string | Date): number {
  return calculateDaysBetween(date, new Date());
}

export function calculateDaysBetween(startDate: string | Date, endDate: string | Date): number {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

  return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24));
}

export function formatPercent(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}
