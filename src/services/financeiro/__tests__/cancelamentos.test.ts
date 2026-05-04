import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
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
  notifyError: vi.fn(),
}));

import { cancelarLancamento } from "@/services/financeiro/cancelamentos";

beforeEach(() => {
  rpcMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("cancelarLancamento", () => {
  it("rejeita motivo com menos de 5 caracteres sem chamar RPC", async () => {
    const ok = await cancelarLancamento("lanc-1", "abc");
    expect(ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledOnce();
  });

  it("rejeita motivo só com espaços", async () => {
    const ok = await cancelarLancamento("lanc-1", "   ");
    expect(ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("invoca a RPC com motivo trim e retorna sucesso", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });

    const ok = await cancelarLancamento("lanc-1", "  duplicidade detectada  ");

    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "financeiro_cancelar_lancamento",
      expect.objectContaining({
        p_id: "lanc-1",
        p_motivo: "duplicidade detectada",
      }),
    );
    expect(toastSuccess).toHaveBeenCalledOnce();
  });

  it("retorna false quando RPC falha", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { code: "P0001", message: "lançamento já cancelado" },
    });

    const ok = await cancelarLancamento("lanc-1", "motivo válido");

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledOnce();
  });
});
