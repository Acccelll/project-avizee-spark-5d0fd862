import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aggregateDailyVendas, aggregateTopProdutos, buildIsoDayRange, sumNfValues } from "@/lib/dashboard/aggregations";
import {
  BACKLOG_FATURAMENTO_STATUSES,
  BACKLOG_OV_STATUSES,
  OPEN_ORCAMENTO_STATUSES,
} from "@/lib/comercialStatuses";
import type { BacklogOv, DashboardDateRange, DailyNfRow, NfItemRow, NfRow, RecentOrcamento, TopPoint } from "./types";

interface ComercialData {
  /** Cotações abertas (non-terminal) in the selected period. */
  orcamentos: number;
  recentOrcamentos: RecentOrcamento[];
  backlogOVs: BacklogOv[];
  /** Real count of OVs awaiting faturamento (not limited by the preview list). */
  backlogOVsCount: number;
  faturamento: { mesAtual: number; mesAnterior: number; nfAtualCount: number };
  dailyVendas: Array<{ dia: string; valor: number }>;
  topProdutos: TopPoint[];
}

export function useDashboardComercialData(range: DashboardDateRange) {
  const loadComercialData = useCallback(async (): Promise<ComercialData> => {
    const { dateFrom, dateTo } = range;

    const now = new Date();
    const inicioMesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const inicioMesAnterior = (() => {
      const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
    })();
    const fimMesAnterior = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const lastDays = buildIsoDayRange(-6, 7);

    try {
      // For top produtos: respect global range when explicit; fallback to mês atual.
      const usingGlobalRange = !!(dateFrom && dateTo);
      const itensFrom = usingGlobalRange ? dateFrom : inicioMesAtual;
      const itensTo = usingGlobalRange ? dateTo : undefined;

      const [
        orcamentosResult,
        orcRecentResult,
        backlogResult,
        backlogCountResult,
        nfAtualResult,
        nfAnteriorResult,
        dailyVendasResult,
        itensResult,
      ] = await Promise.all([
        // Only count open (non-terminal) cotações in the selected period.
        supabase
          .from("orcamentos")
          .select("*", { count: "exact", head: true })
          .eq("ativo", true)
          .neq("origem", "importacao_historica")
          .in("status", OPEN_ORCAMENTO_STATUSES)
          .gte("data_orcamento", dateFrom)
          .lte("data_orcamento", dateTo),
        supabase
          .from("orcamentos")
          .select("id, numero, valor_total, status, data_orcamento, clientes(nome_razao_social)")
          .eq("ativo", true)
          .neq("origem", "importacao_historica")
          .gte("data_orcamento", dateFrom)
          .lte("data_orcamento", dateTo)
          .order("created_at", { ascending: false })
          .limit(5),
        // Preview list (capped at 15) for the UI detail view.
        supabase
          .from("ordens_venda")
          .select("id, numero, valor_total, data_emissao, data_prometida_despacho, prazo_despacho_dias, status, status_faturamento, clientes(nome_razao_social)")
          .eq("ativo", true)
          .in("status", BACKLOG_OV_STATUSES)
          .in("status_faturamento", BACKLOG_FATURAMENTO_STATUSES)
          .order("data_emissao", { ascending: true })
          .limit(15),
        // Real total count for alert/KPI badges.
        supabase
          .from("ordens_venda")
          .select("*", { count: "exact", head: true })
          .eq("ativo", true)
          .in("status", BACKLOG_OV_STATUSES)
          .in("status_faturamento", BACKLOG_FATURAMENTO_STATUSES),
        supabase
          .from("notas_fiscais")
          .select("valor_total")
          .eq("ativo", true)
          .eq("tipo", "saida")
          .in("status", ["confirmada", "importada"])
          .gte("data_emissao", inicioMesAtual),
        supabase
          .from("notas_fiscais")
          .select("valor_total")
          .eq("ativo", true)
          .eq("tipo", "saida")
          .in("status", ["confirmada", "importada"])
          .gte("data_emissao", inicioMesAnterior)
          .lt("data_emissao", fimMesAnterior),
        supabase
          .from("notas_fiscais")
          .select("data_emissao, valor_total")
          .eq("ativo", true)
          .eq("tipo", "saida")
          .in("status", ["confirmada", "importada"])
          .in("data_emissao", lastDays),
        (() => {
          let q = supabase
            .from("notas_fiscais_itens")
            .select("quantidade, valor_unitario, produtos(nome), notas_fiscais!inner(status, tipo, data_emissao)")
            .in("notas_fiscais.status", ["confirmada", "importada"])
            .eq("notas_fiscais.tipo", "saida")
            .gte("notas_fiscais.data_emissao", itensFrom);
          if (itensTo) q = q.lte("notas_fiscais.data_emissao", itensTo);
          return q;
        })(),
      ]);

      if (orcamentosResult.error) console.error("[dashboard:comercial] orcamentos:", orcamentosResult.error.message);
      if (backlogResult.error) console.error("[dashboard:comercial] backlog:", backlogResult.error.message);
      if (nfAtualResult.error) console.error("[dashboard:comercial] nfAtual:", nfAtualResult.error.message);

      const nfAtual = (nfAtualResult.data ?? []) as NfRow[];

      return {
        orcamentos: orcamentosResult.count ?? 0,
        recentOrcamentos: (orcRecentResult.data ?? []) as RecentOrcamento[],
        backlogOVs: (backlogResult.data ?? []) as BacklogOv[],
        backlogOVsCount: backlogCountResult.count ?? 0,
        faturamento: {
          mesAtual: sumNfValues(nfAtual),
          mesAnterior: sumNfValues((nfAnteriorResult.data ?? []) as NfRow[]),
          nfAtualCount: nfAtual.length,
        },
        dailyVendas: aggregateDailyVendas(lastDays, (dailyVendasResult.data ?? []) as DailyNfRow[]),
        topProdutos: aggregateTopProdutos((itensResult.data ?? []) as NfItemRow[]),
      };
    } catch (error) {
      console.error("[dashboard:comercial] erro inesperado:", error);
      return {
        orcamentos: 0,
        recentOrcamentos: [],
        backlogOVs: [],
        backlogOVsCount: 0,
        faturamento: { mesAtual: 0, mesAnterior: 0, nfAtualCount: 0 },
        dailyVendas: [],
        topProdutos: [],
      };
    }
  }, [range]);

  return { loadComercialData };
}
