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
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/utils/errorMessages", () => ({
  getUserFriendlyError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  notifyError: vi.fn(),
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
  it("usa RPC quando disponível e retorna sucesso", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });

    const ok = await processarBaixaLote(baseParams);

    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "financeiro_processar_baixa_lote",
      expect.objectContaining({ p_selected_ids: ["1", "2"] }),
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledOnce();
  });

  it("ignora RPC quando há overrides (vai direto para fallback)", async () => {
    fromMock.mockImplementation(() => makeChain({ data: { id: "x" }, error: null }));

    const ok = await processarBaixaLote({
      ...baseParams,
      overrides: { "1": { valor_pago: 50 } },
    });

    expect(ok).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledTimes(4);
  });

  it("faz fallback estrutural quando RPC não existe (PGRST202)", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { code: "PGRST202", message: "function financeiro_processar_baixa_lote not found" },
    });
    fromMock.mockImplementation(() => makeChain({ data: { id: "ok" }, error: null }));

    const ok = await processarBaixaLote(baseParams);

    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(fromMock).toHaveBeenCalledTimes(4);
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/baixado/i));
  });

  it("propaga erro genérico da RPC sem cair no fallback", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { code: "P0001", message: "regra de negócio violada" },
    });

    const ok = await processarBaixaLote(baseParams);

    expect(ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledOnce();
  });

  it("retorna false quando o plano é inválido (parcial sem valores)", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { code: "PGRST202", message: "function financeiro_processar_baixa_lote not found" },
    });

    const ok = await processarBaixaLote({
      ...baseParams,
      tipoBaixa: "parcial",
      valorPagoBaixa: 0,
      totalBaixa: 0,
    });

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledOnce();
  });

  it("falha quando UPDATE no fallback não retorna linha", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { code: "PGRST202", message: "function financeiro_processar_baixa_lote not found" },
    });
    fromMock.mockImplementationOnce(() => makeChain({ data: null, error: null }));

    const ok = await processarBaixaLote(baseParams);

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledOnce();
  });
});
