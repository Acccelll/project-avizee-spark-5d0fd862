import { describe, it, expect } from "vitest";
import {
  sugerirConciliacao,
  type TituloParaConciliacao,
} from "@/services/financeiro/conciliacao.service";
import type { TransacaoExtrato } from "@/services/financeiro/ofxParser.service";

const makeTitulo = (overrides?: Partial<TituloParaConciliacao>): TituloParaConciliacao => ({
  id: "titulo-1",
  descricao: "Pagamento fornecedor ABC",
  valor: 1000,
  data_vencimento: "2026-03-10",
  tipo: "pagar",
  status: "pago",
  data_baixa: "2026-03-10",
  ...overrides,
});

const makeExtrato = (overrides?: Partial<TransacaoExtrato>): TransacaoExtrato => ({
  id: "extrato-1",
  data: "2026-03-10",
  descricao: "PAG FORNEC ABC",
  valor: 1000,
  tipo: "D",
  ...overrides,
});

describe("sugerirConciliacao", () => {
  it("retorna null quando a lista de títulos está vazia", () => {
    const extrato = makeExtrato();
    expect(sugerirConciliacao(extrato, [])).toBeNull();
  });

  it("realiza matching exato por valor e data (mesmo dia)", () => {
    const extrato = makeExtrato();
    const titulo = makeTitulo();
    const resultado = sugerirConciliacao(extrato, [titulo]);
    expect(resultado).not.toBeNull();
    expect(resultado?.titulo.id).toBe("titulo-1");
  });

  it("realiza matching com data até 3 dias de diferença", () => {
    const extrato = makeExtrato({ data: "2026-03-12" }); // 2 dias depois
    const titulo = makeTitulo({ data_vencimento: "2026-03-10" });
    expect(sugerirConciliacao(extrato, [titulo])?.titulo.id).toBe("titulo-1");
  });

  it("não faz matching quando a diferença de datas é maior que 3 dias", () => {
    const extrato = makeExtrato({ data: "2026-03-15" }); // 5 dias depois
    const titulo = makeTitulo({ data_vencimento: "2026-03-10" });
    expect(sugerirConciliacao(extrato, [titulo])).toBeNull();
  });

  it("não faz matching quando o valor é diferente (diferença ≥ R$0,02)", () => {
    const extrato = makeExtrato({ valor: 999.98 });
    const titulo = makeTitulo({ valor: 1000 });
    expect(sugerirConciliacao(extrato, [titulo])).toBeNull();
  });

  it("aceita diferença de até R$0,01 no valor (tolerância de centavo)", () => {
    const extrato = makeExtrato({ valor: 1000.00 });
    const titulo = makeTitulo({ valor: 1000.005 });
    // diff < 0.01 → deve fazer match
    const resultado = sugerirConciliacao(extrato, [titulo]);
    expect(resultado?.titulo.id).toBe("titulo-1");
  });

  it("desempata entre candidatos usando similaridade de descrição", () => {
    const extrato = makeExtrato({ descricao: "PAG FORNEC ABC" });
    const titulo1 = makeTitulo({ id: "titulo-1", descricao: "Pagamento fornecedor ABC" });
    const titulo2 = makeTitulo({ id: "titulo-2", descricao: "Pagamento empresa XYZ" });
    const resultado = sugerirConciliacao(extrato, [titulo1, titulo2]);
    // titulo1 tem maior similaridade com a descrição do extrato
    expect(resultado?.titulo.id).toBe("titulo-1");
  });

  it("retorna o único candidato mesmo com descrição sem correspondência", () => {
    const extrato = makeExtrato({ descricao: "TRANSF 12345" });
    const titulo = makeTitulo({ descricao: "Aluguel escritório" });
    expect(sugerirConciliacao(extrato, [titulo])?.titulo.id).toBe("titulo-1");
  });

  it("não faz matching quando nenhum título bate em valor e data", () => {
    const extrato = makeExtrato({ valor: 500, data: "2026-06-01" });
    const titulos: TituloParaConciliacao[] = [
      makeTitulo({ id: "t1", valor: 1000, data_vencimento: "2026-03-10" }),
      makeTitulo({ id: "t2", valor: 500, data_vencimento: "2026-05-01" }),
    ];
    expect(sugerirConciliacao(extrato, titulos)).toBeNull();
  });
});
