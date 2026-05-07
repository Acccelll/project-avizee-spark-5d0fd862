import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import FinanceiroPage from "@/pages/Financeiro";
import { renderWithSmokeProviders } from "./smokeTestUtils";
import type { Column } from "@/components/DataTable";
import type { Lancamento } from "@/types/domain";

const mockUseSupabaseCrud = vi.fn();
const mockUseFinanceiroLancamentosPaged = vi.fn();
const mockUseFinanceiroKpisRpc = vi.fn();

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Concede todas as permissões para que `PermissionGate` libere o botão "Baixar".
vi.mock("@/hooks/useCan", () => ({
  useCan: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/components/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/useSupabaseCrud", () => ({
  useSupabaseCrud: (...args: unknown[]) => mockUseSupabaseCrud(...args),
}));

// Após 1.4 (paginação server-side), Financeiro usa estes hooks ao invés de useSupabaseCrud.
vi.mock("@/pages/financeiro/hooks/useFinanceiroLancamentosPaged", () => ({
  useFinanceiroLancamentosPaged: (...args: unknown[]) =>
    mockUseFinanceiroLancamentosPaged(...args),
  useResetPageOnFiltersChange: () => undefined,
}));
vi.mock("@/pages/financeiro/hooks/useFinanceiroKpisRpc", () => ({
  useFinanceiroKpisRpc: (...args: unknown[]) => mockUseFinanceiroKpisRpc(...args),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [] }),
  };

  return {
    supabase: {
      from: vi.fn(() => builder),
    },
  };
});

vi.mock("@/components/AdvancedFilterBar", () => ({
  AdvancedFilterBar: ({
    searchValue,
    onSearchChange,
    count,
    children,
  }: {
    searchValue: string;
    onSearchChange: (value: string) => void;
    count: number;
    children: React.ReactNode;
  }) => (
    <div>
      <input aria-label="search" value={searchValue} onChange={(e) => onSearchChange(e.target.value)} />
      <span>Count: {count}</span>
      {children}
    </div>
  ),
}));

vi.mock("@/components/DataTable", () => ({
  DataTable: ({
    columns,
    data,
    rowExtraActions,
  }: {
    columns: Column<Lancamento>[];
    data: Lancamento[];
    rowExtraActions?: (row: Lancamento) => React.ReactNode;
  }) => (
    <div>
      <div>Rows: {data.length}</div>
      {data.map((row) => (
        <div key={row.id}>
          <span>{row.descricao}</span>
          {columns.find((c) => c.key === "acoes_rapidas")?.render(row)}
          {rowExtraActions?.(row)}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/financeiro/BaixaParcialDialog", () => ({
  BaixaParcialDialog: ({ open }: { open: boolean }) => (open ? <div>BaixaParcialAberta</div> : null),
}));

vi.mock("@/components/financeiro/BaixaLoteModal", () => ({
  BaixaLoteModal: () => null,
}));

vi.mock("@/components/financeiro/FinanceiroDrawer", () => ({
  FinanceiroDrawer: () => null,
}));

vi.mock("@/components/financeiro/FinanceiroCalendar", () => ({
  FinanceiroCalendar: () => <div>CalendarioMock</div>,
}));

describe("smoke: financeiro abertura, filtros e baixa mínima", () => {
  beforeEach(() => {
    mockUseSupabaseCrud.mockReset();
    mockUseFinanceiroLancamentosPaged.mockReset();
    mockUseFinanceiroKpisRpc.mockReset();

    const rows = [
        {
          id: "l1",
          tipo: "receber",
          descricao: "Receita Projeto A",
          valor: 100,
          data_vencimento: "2026-04-20",
          status: "aberto",
          saldo_restante: null,
          clientes: { nome_razao_social: "Cliente A" },
          fornecedores: null,
          contas_bancarias: null,
          parcela_numero: 0,
          parcela_total: 0,
        },
        {
          id: "l2",
          tipo: "pagar",
          descricao: "Despesa Operacional",
          valor: 80,
          data_vencimento: "2026-04-21",
          status: "aberto",
          saldo_restante: null,
          clientes: null,
          fornecedores: { nome_razao_social: "Fornecedor B" },
          contas_bancarias: null,
          parcela_numero: 0,
          parcela_total: 0,
        },
    ];

    const emptyResult = { data: [], loading: false, create: vi.fn(), update: vi.fn(), remove: vi.fn(), fetchData: vi.fn() };

    mockUseSupabaseCrud.mockImplementation(() => emptyResult);
    // Após 1.4, busca é server-side: o hook recebe `filters.search` e devolve
    // apenas as linhas que casam (simulação simples por substring).
    mockUseFinanceiroLancamentosPaged.mockImplementation(
      (filters: { search?: string | null }) => {
        const term = (filters?.search ?? "").trim().toLowerCase();
        const filtered = term
          ? rows.filter((r) => r.descricao.toLowerCase().includes(term))
          : rows;
        return {
          data: filtered,
          totalCount: filtered.length,
          loading: false,
          refetching: false,
          refetch: vi.fn(),
          error: null,
        };
      },
    );
    mockUseFinanceiroKpisRpc.mockReturnValue({ data: undefined });
  });

  it("abre financeiro, aplica busca principal e permite iniciar baixa", async () => {
    renderWithSmokeProviders(<FinanceiroPage />, "/financeiro?period=todos");

    expect(await screen.findByText("Lançamentos")).toBeInTheDocument();
    expect(await screen.findByText("Rows: 2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("search"), { target: { value: "Projeto" } });
    expect(await screen.findByText("Count: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Baixar lançamento: Receita Projeto A/i }));
    expect(await screen.findByText("BaixaParcialAberta")).toBeInTheDocument();

    expect(screen.queryByText("Despesa Operacional")).not.toBeInTheDocument();
  });
});
