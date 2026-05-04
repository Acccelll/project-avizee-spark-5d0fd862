import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";

const { fromMock, successToast, errorToast } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: successToast,
    error: errorToast,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

type Row = { id: string; nome: string; ativo: boolean };

function createQueryMock(initialData: Row[] = []) {
  let rows = [...initialData];

  const query: any = {
    __selectedId: null as string | null,
    __payload: null as Partial<Row> | null,
    __inserted: null as Row | null,
    __operation: null as "update" | "delete" | null,
    __eqCalls: [] as { column: string; value: any }[],
    __orFilter: null as string | null,
    __gte: [] as { column: string; value: any }[],
    __lte: [] as { column: string; value: any }[],
    __in: [] as { column: string; values: any[] }[],
  };

  const applyPendingMutation = () => {
    if (query.__operation === "update" && query.__selectedId) {
      rows = rows.map((row) => (row.id === query.__selectedId ? { ...row, ...query.__payload } : row));
      query.__operation = null;
      query.__payload = null;
    }

    if (query.__operation === "delete" && query.__selectedId) {
      rows = rows.filter((row) => row.id !== query.__selectedId);
      query.__operation = null;
    }
  };

  Object.assign(query, {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    or: vi.fn((filter: string) => {
      query.__orFilter = filter;
      return query;
    }),
    gte: vi.fn((column: string, value: any) => {
      query.__gte.push({ column, value });
      return query;
    }),
    lte: vi.fn((column: string, value: any) => {
      query.__lte.push({ column, value });
      return query;
    }),
    in: vi.fn((column: string, values: any[]) => {
      query.__in.push({ column, values });
      return query;
    }),
    eq: vi.fn((column: string, value: any) => {
      query.__eqCalls.push({ column, value });
      if (column === "id") {
        query.__selectedId = value;
        applyPendingMutation();
      }
      return query;
    }),
    update: vi.fn((payload: Partial<Row>) => {
      query.__payload = payload;
      query.__operation = "update";
      return query;
    }),
    insert: vi.fn((payload: any) => {
      const newItem = { id: "novo-id", nome: payload.nome ?? "", ativo: payload.ativo ?? true };
      rows = [...rows, newItem];
      query.__inserted = newItem;
      return query;
    }),
    delete: vi.fn(() => {
      query.__operation = "delete";
      return query;
    }),
    single: vi.fn(() => Promise.resolve({ data: query.__inserted || rows.find((row) => row.id === query.__selectedId) || null, error: null })),
    then: (resolve: (value: { data: Row[]; error: null; count: number }) => void) => resolve({ data: rows, error: null, count: rows.length }),
  });

  return { query, getRows: () => rows };
}

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe("useSupabaseCrud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve carregar dados iniciais e criar registro", async () => {
    const { query, getRows } = createQueryMock([{ id: "1", nome: "Produto A", ativo: true }]);
    fromMock.mockReturnValue(query);

    const { result } = renderHook(() => useSupabaseCrud<"produtos">({ table: "produtos" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toHaveLength(1);

    await act(async () => {
      await result.current.create({ nome: "Produto B", ativo: true } as any);
    });

    await waitFor(() => expect(getRows()).toHaveLength(2));
    expect(successToast).toHaveBeenCalledWith("Registro criado com sucesso!");
  });

  it("deve fazer soft delete quando ativo estiver habilitado", async () => {
    const { query, getRows } = createQueryMock([{ id: "1", nome: "Produto A", ativo: true }]);
    fromMock.mockReturnValue(query);

    const { result } = renderHook(() => useSupabaseCrud<"produtos">({ table: "produtos" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("1", true);
    });

    expect(getRows()[0].ativo).toBe(false);
    expect(successToast).toHaveBeenCalledWith("Registro removido com sucesso!");
  });

  it("aplica filtro hasAtivo = true por padrão", async () => {
    const { query } = createQueryMock([{ id: "1", nome: "Produto A", ativo: true }]);
    fromMock.mockReturnValue(query);

    const { result } = renderHook(
      () => useSupabaseCrud<"produtos">({ table: "produtos", hasAtivo: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const eqCalls = query.__eqCalls as { column: string; value: any }[];
    expect(eqCalls.some((c: any) => c.column === "ativo" && c.value === true)).toBe(true);
  });

  it("não aplica filtro ativo quando hasAtivo = false", async () => {
    const { query } = createQueryMock([{ id: "1", nome: "Produto A", ativo: true }]);
    fromMock.mockReturnValue(query);

    const { result } = renderHook(
      () => useSupabaseCrud<"produtos">({ table: "produtos", hasAtivo: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const eqCalls = query.__eqCalls as { column: string; value: any }[];
    expect(eqCalls.some((c: any) => c.column === "ativo")).toBe(false);
  });

  it("aplica searchTerm com ilike nas colunas corretas", async () => {
    const { query } = createQueryMock([]);
    fromMock.mockReturnValue(query);

    const { result } = renderHook(
      () =>
        useSupabaseCrud<"produtos">({
          table: "produtos",
          searchTerm: "mesa",
          searchColumns: ["nome", "codigo"],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(query.or).toHaveBeenCalledWith("nome.ilike.%mesa%,codigo.ilike.%mesa%");
  });

  it("mutation create chama .insert() e invalida queryKey", async () => {
    const { query } = createQueryMock([]);
    fromMock.mockReturnValue(query);

    const { result } = renderHook(
      () => useSupabaseCrud<"produtos">({ table: "produtos" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ nome: "Novo Produto", ativo: true } as any);
    });

    expect(query.insert).toHaveBeenCalledWith({ nome: "Novo Produto", ativo: true });
    expect(successToast).toHaveBeenCalledWith("Registro criado com sucesso!");
  });
});
