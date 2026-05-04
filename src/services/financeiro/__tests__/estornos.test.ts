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

vi.mock("@/utils/errorMessages", () => ({
  getUserFriendlyError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  notifyError: (e: unknown) => { toastError(e instanceof Error ? e.message : String(e)); },
}));

import { processarEstorno } from "@/services/financeiro/estornos";

function makeListChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => Promise.resolve(result));
  return chain;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("processarEstorno", () => {
  it("usa a RPC consolidada quando disponível", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });

    const ok = await processarEstorno("lanc-1", "motivo válido");

    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "financeiro_processar_estorno",
      expect.objectContaining({ p_lancamento_id: "lanc-1", p_motivo_estorno: "motivo válido" }),
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledOnce();
  });

  it("faz fallback quando a RPC consolidada não existe", async () => {
    rpcMock
      .mockResolvedValueOnce({
        error: { code: "PGRST202", message: "function financeiro_processar_estorno missing" },
      })
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null });

    fromMock.mockReturnValueOnce(
      makeListChain({ data: [{ id: "b1" }, { id: "b2" }], error: null }),
    );

    const ok = await processarEstorno("lanc-1");

    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      "estornar_baixa_financeira",
      expect.objectContaining({ p_baixa_id: "b1" }),
    );
  });

  it("falha quando não há baixas ativas no fallback", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { code: "PGRST202", message: "function financeiro_processar_estorno missing" },
    });
    fromMock.mockReturnValueOnce(makeListChain({ data: [], error: null }));

    const ok = await processarEstorno("lanc-1");

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledOnce();
  });

  it("propaga erro inesperado da RPC consolidada sem usar fallback", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { code: "P0001", message: "regra violada" },
    });

    const ok = await processarEstorno("lanc-1");

    expect(ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledOnce();
  });
});
