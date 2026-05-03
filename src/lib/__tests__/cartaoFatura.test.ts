import { describe, it, expect } from "vitest";
import { calcularFaturaParaData, calcularFaturasParcelas } from "../cartaoFatura";

describe("calcularFaturaParaData", () => {
  // Cartão fecha 25, vence 05
  it("compra antes do fechamento → fatura do mês", () => {
    const r = calcularFaturaParaData("2026-04-20", 25, 5);
    expect(r.competencia).toBe("2026-04");
    expect(r.dataFechamento.toISOString().slice(0, 10)).toBe("2026-04-25");
    expect(r.dataVencimento.toISOString().slice(0, 10)).toBe("2026-05-05");
  });

  it("compra no dia do fechamento → fatura do mês", () => {
    const r = calcularFaturaParaData("2026-04-25", 25, 5);
    expect(r.competencia).toBe("2026-04");
  });

  it("compra depois do fechamento → próxima fatura", () => {
    const r = calcularFaturaParaData("2026-04-27", 25, 5);
    expect(r.competencia).toBe("2026-05");
    expect(r.dataFechamento.toISOString().slice(0, 10)).toBe("2026-05-25");
    expect(r.dataVencimento.toISOString().slice(0, 10)).toBe("2026-06-05");
  });

  it("vencimento maior que fechamento → mesmo mês do fechamento", () => {
    // fecha 5, vence 15
    const r = calcularFaturaParaData("2026-04-03", 5, 15);
    expect(r.dataFechamento.toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(r.dataVencimento.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("fechamento dia 31 em fevereiro → ajusta para último dia do mês", () => {
    const r = calcularFaturaParaData("2026-02-10", 31, 10);
    expect(r.dataFechamento.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("vencimento dia 30 em fevereiro → ajusta", () => {
    const r = calcularFaturaParaData("2026-02-01", 25, 30);
    // fecha 25/02, vence 28/02 (vencimento>fechamento, mesmo mês)
    expect(r.dataVencimento.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("virada dezembro → janeiro", () => {
    const r = calcularFaturaParaData("2026-12-27", 25, 5);
    expect(r.competencia).toBe("2027-01");
    expect(r.dataVencimento.toISOString().slice(0, 10)).toBe("2027-02-05");
  });

  it("dia 29 fevereiro ano não-bissexto", () => {
    const r = calcularFaturaParaData("2025-02-10", 29, 10);
    expect(r.dataFechamento.toISOString().slice(0, 10)).toBe("2025-02-28");
  });
});

describe("calcularFaturasParcelas", () => {
  it("3 parcelas distribuídas em meses consecutivos", () => {
    const rs = calcularFaturasParcelas("2026-04-20", 25, 5, 3);
    expect(rs).toHaveLength(3);
    expect(rs[0].competencia).toBe("2026-04");
    expect(rs[1].competencia).toBe("2026-05");
    expect(rs[2].competencia).toBe("2026-06");
    expect(rs[2].dataVencimento.toISOString().slice(0, 10)).toBe("2026-07-05");
  });
});