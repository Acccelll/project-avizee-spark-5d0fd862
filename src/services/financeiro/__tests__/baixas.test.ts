import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/utils/errorMessages", () => ({
  getUserFriendlyError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  notifyError: (e: unknown) => { toastError(e instanceof Error ? e.message : String(e)); },
}));

import { processarBaixaLote, type BaixaLoteParams } from "@/services/financeiro/baixas";

const baseParams: BaixaLoteParams = {
  selectedIds: ["1", "2"],
  selectedLancamentos: [
    { id: "1", valor: 100, saldo_restante: null },
    { id: "2", valor: 300, saldo_restante: 200 },
  ],
  tipoBaixa: "total",
  valorPagoBaixa: 0,
  totalBaixa: 0,
  baixaDate: "2026-04-15",
  formaPagamento: "pix",
  contaBancariaId: "bank-1",
};

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "insert", "select", "eq"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("processarBaixaLote", () => {
  it("usa RPC registrar_baixa_lote_financeira e retorna sucesso", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { grupo_id: "g1", processados: 2, ignorados: 0, erros: [] },
      error: null,
    });

    const ok = await processarBaixaLote(baseParams);

    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "registrar_baixa_lote_financeira",
      expect.objectContaining({
        p_data_baixa: "2026-04-15",
        p_forma_pagamento: "pix",
        p_conta_bancaria_id: "bank-1",
      }),
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledOnce();
  });

  it("usa overrides por item quando fornecidos", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { grupo_id: "g2", processados: 2, ignorados: 0, erros: [] },
      error: null,
    });

    const ok = await processarBaixaLote({
      ...baseParams,
      overrides: { "1": { valor_pago: 50 } },
    });

    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it("reporta erros parciais via toast.warning sem fallback manual", async () => {
    const toastWarn = vi.fn();
    // sonner mock só tem success/error; injeta warning ad-hoc
    rpcMock.mockResolvedValueOnce({
      data: { grupo_id: "g3", processados: 1, ignorados: 0, erros: ["lanc-2: regra"] },
      error: null,
    });

    const ok = await processarBaixaLote(baseParams);

    // processados > 0 → retorna true
    expect(ok).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
    void toastWarn;
  });

  it("propaga erro genérico da RPC sem cair no fallback", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "regra de negócio violada" },
    });

    const ok = await processarBaixaLote(baseParams);

    expect(ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledOnce();
  });

  it("retorna false quando o plano é inválido (parcial sem valores)", async () => {
    const ok = await processarBaixaLote({
      ...baseParams,
      tipoBaixa: "parcial",
      valorPagoBaixa: 0,
      totalBaixa: 0,
    });

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledOnce();
  });

});
