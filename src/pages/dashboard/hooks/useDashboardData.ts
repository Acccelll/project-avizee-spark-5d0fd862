import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardPeriod } from "@/contexts/DashboardPeriodContext";
import { useDashboardAuxData } from "./useDashboardAuxData";
import { useDashboardComercialData } from "./useDashboardComercialData";
import { useDashboardEstoqueData } from "./useDashboardEstoqueData";
import { useDashboardFinanceiroData } from "./useDashboardFinanceiroData";
import { useDashboardFiscalData } from "./useDashboardFiscalData";
import { notifyError } from "@/utils/errorMessages";
import type { DashboardStats, FaturamentoStats, FiscalStats, ProdRow, TopPoint } from "./types";
import type { BacklogOv, CompraAguardando, RecentOrcamento } from "./types";
import type { ScopeKind } from "@/components/dashboard/ScopeBadge";

interface DashboardDataState {
  stats: DashboardStats;
  faturamento: FaturamentoStats;
  recentOrcamentos: RecentOrcamento[];
  backlogOVs: BacklogOv[];
  /** Real total count of OVs awaiting faturamento (not capped by the preview list). */
  backlogOVsCount: number;
  comprasAguardando: CompraAguardando[];
  /** Real count of compras with an overdue delivery date. */
  comprasAtrasadasCount: number;
  estoqueBaixo: ProdRow[];
  fiscalStats: FiscalStats;
  vencimentosHoje: { receber: number; pagar: number };
  topClientes: TopPoint[];
  topProdutos: TopPoint[];
  dailyReceber: Array<{ dia: string; valor: number }>;
  dailyPagar: Array<{ dia: string; valor: number }>;
  dailyVendas: Array<{ dia: string; valor: number }>;
  valorEstoque: number;
  remessasAtrasadas: number;
  /** Per-block scope metadata so blocks can render a ScopeBadge. */
  scopes: {
    financeiro: ScopeKind;
    comercial: ScopeKind;
    fiscal: ScopeKind;
    estoque: ScopeKind;
    logistica: ScopeKind;
    faturamento: ScopeKind;
    fluxo: ScopeKind;
    vendas: ScopeKind;
    pendencias: ScopeKind;
  };
}

const INITIAL_STATE: DashboardDataState = {
  stats: {
    produtos: 0,
    clientes: 0,
    fornecedores: 0,
    orcamentos: 0,
    compras: 0,
    contasReceber: 0,
    contasPagar: 0,
    contasVencidas: 0,
    totalReceber: 0,
    totalPagar: 0,
  },
  faturamento: { mesAtual: 0, mesAnterior: 0, nfAtualCount: 0 },
  recentOrcamentos: [],
  backlogOVs: [],
  backlogOVsCount: 0,
  comprasAguardando: [],
  comprasAtrasadasCount: 0,
  estoqueBaixo: [],
  fiscalStats: { emitidas: 0, pendentes: 0, canceladas: 0, valorEmitidas: 0 },
  vencimentosHoje: { receber: 0, pagar: 0 },
  topClientes: [],
  topProdutos: [],
  dailyReceber: [],
  dailyPagar: [],
  dailyVendas: [],
  valorEstoque: 0,
  remessasAtrasadas: 0,
  scopes: {
    financeiro: { kind: 'global-range', eixo: 'data_vencimento' },
    comercial: { kind: 'global-range', eixo: 'data_orcamento' },
    fiscal: { kind: 'fixed-window', janela: 'mes-atual' },
    estoque: { kind: 'snapshot' },
    logistica: { kind: 'snapshot' },
    faturamento: { kind: 'fixed-window', janela: 'mes-atual' },
    fluxo: { kind: 'fixed-window', janela: 'next-7d' },
    vendas: { kind: 'fixed-window', janela: 'last-7d' },
    pendencias: { kind: 'fixed-window', janela: 'next-7d' },
  },
};

export function useDashboardData() {
  const { range } = useDashboardPeriod();
  const queryClient = useQueryClient();

  const { loadFinanceiroData } = useDashboardFinanceiroData(range);
  const { loadComercialData } = useDashboardComercialData(range);
  const { loadEstoqueData } = useDashboardEstoqueData();
  const { loadFiscalData } = useDashboardFiscalData(range);
  const { loadAuxData } = useDashboardAuxData(range);

  const query = useQuery<DashboardDataState>({
    queryKey: ["dashboard", range.dateFrom, range.dateTo],
    queryFn: async () => {
      try {
        const [financeiro, comercial, estoque, fiscal, aux] = await Promise.all([
          loadFinanceiroData(),
          loadComercialData(),
          loadEstoqueData(),
          loadFiscalData(),
          loadAuxData(),
        ]);

        const usingGlobal = !!(range.dateFrom && range.dateTo);
        return {
          stats: {
            produtos: estoque.produtos,
            clientes: aux.clientes,
            fornecedores: aux.fornecedores,
            orcamentos: comercial.orcamentos,
            compras: aux.compras,
            contasReceber: financeiro.contasReceber,
            contasPagar: financeiro.contasPagar,
            contasVencidas: financeiro.contasVencidas,
            totalReceber: financeiro.totalReceber,
            totalPagar: financeiro.totalPagar,
          },
          faturamento: comercial.faturamento,
          recentOrcamentos: comercial.recentOrcamentos,
          backlogOVs: comercial.backlogOVs,
          backlogOVsCount: comercial.backlogOVsCount,
          comprasAguardando: aux.comprasAguardando,
          comprasAtrasadasCount: aux.comprasAtrasadasCount,
          estoqueBaixo: estoque.estoqueBaixo,
          fiscalStats: fiscal.fiscalStats,
          vencimentosHoje: financeiro.vencimentosHoje,
          topClientes: financeiro.topClientes,
          topProdutos: comercial.topProdutos,
          dailyReceber: financeiro.dailyReceber,
          dailyPagar: financeiro.dailyPagar,
          dailyVendas: comercial.dailyVendas,
          valorEstoque: estoque.valorEstoque,
          remessasAtrasadas: aux.remessasAtrasadas,
          scopes: {
            financeiro: { kind: 'global-range', eixo: 'data_vencimento' },
            comercial: { kind: 'global-range', eixo: 'data_orcamento' },
            fiscal: fiscal._scope,
            estoque: { kind: 'snapshot' },
            logistica: { kind: 'snapshot' },
            faturamento: { kind: 'fixed-window', janela: 'mes-atual' },
            fluxo: { kind: 'fixed-window', janela: 'next-7d' },
            vendas: { kind: 'fixed-window', janela: 'last-7d' },
            pendencias: usingGlobal
              ? { kind: 'global-range', eixo: 'data_vencimento' }
              : { kind: 'fixed-window', janela: 'next-7d' },
          },
        };
      } catch (error) {
        console.error("[dashboard] erro ao carregar dados:", error);
        notifyError(error);
        throw error;
      }
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const state = query.data ?? INITIAL_STATE;

  /**
   * Ticket médio = faturamento confirmado no mês ÷ número de NFs emitidas no mês.
   * Usar a contagem de NFs (não de orçamentos) garante que numerador e denominador
   * venham da mesma janela e da mesma fonte de dados.
   */
  const ticketMedio = useMemo(
    () => (state.faturamento.nfAtualCount > 0 ? state.faturamento.mesAtual / state.faturamento.nfAtualCount : 0),
    [state.faturamento.mesAtual, state.faturamento.nfAtualCount],
  );

  const loadedAt = useMemo(
    () => (query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : new Date()),
    [query.dataUpdatedAt],
  );

  return {
    ...state,
    loading: query.isLoading,
    /** True quando há refetch silencioso em andamento (header pode mostrar "Atualizando…"). */
    fetching: query.isFetching && !query.isLoading,
    loadedAt,
    ticketMedio,
    /** Triggers a manual refetch — use for the dashboard's "Atualizar" button.
     *  Invalidates the entire `["dashboard", ...]` tree so chart widgets refresh too. */
    loadData: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  };
}
