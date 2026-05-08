/**
 * Loader para o relatório de divergências:
 *  - Pedidos de compra aprovados/pendentes há mais de 3 dias sem NF vinculada
 *  - NFs com flag gera_financeiro=true mas sem lançamento financeiro associado
 */

import { supabase } from "@/integrations/supabase/client";
import type { DivergenciasRow } from "@/types/relatorios";
import {
  type FiltroRelatorio,
  type RelatorioResultado,
  type RawFinanceiroLancamento,
} from "@/services/relatorios/lib/shared";
import { fetchAllPages } from "@/services/relatorios/lib/fetchAllPages";

export async function loadDivergencias(_filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

  const [pedidos, nfs, financeiro] = await Promise.all([
    fetchAllPages<Record<string, unknown>>(() =>
      supabase
        .from("pedidos_compra")
        .select("id, numero, fornecedor_id, valor_total, status, created_at, fornecedores(nome_razao_social)")
        .eq("ativo", true)
        .in("status", ["pendente", "aprovado"])
        .lte("created_at", threeDaysAgoStr)
        .order("created_at", { ascending: false }),
    ),
    fetchAllPages<Record<string, unknown>>(() =>
      supabase
        .from("notas_fiscais")
        .select("id, numero, tipo, valor_total, data_emissao, fornecedor_id, cliente_id, clientes(nome_razao_social), fornecedores(nome_razao_social)")
        .eq("ativo", true)
        .eq("gera_financeiro", true)
        .order("data_emissao", { ascending: false }),
    ),
    fetchAllPages<RawFinanceiroLancamento>(() =>
      supabase
        .from("financeiro_lancamentos")
        .select("nota_fiscal_id")
        .eq("ativo", true)
        .order("created_at", { ascending: false }),
    ),
  ]);

  const nfIdsComFinanceiro = new Set(
    financeiro.map((f) => f.nota_fiscal_id).filter(Boolean)
  );

  const nfsSemFinanceiro = nfs.filter((nf) => !nfIdsComFinanceiro.has(nf.id as string));

  const rows: DivergenciasRow[] = [];

  for (const pc of pedidos) {
    const fornecedor = pc.fornecedores as { nome_razao_social: string } | null;
    rows.push({
      tipo: "Pedido s/ NF",
      referencia: pc.numero as string,
      parceiro: fornecedor?.nome_razao_social || "-",
      valor: Number(pc.valor_total || 0),
      status: pc.status as string,
      criticidade: "Alta",
      observacao: "Pedido de compra aprovado/pendente há mais de 3 dias sem nota fiscal vinculada",
    } as DivergenciasRow & Record<string, unknown>);
    const last = rows[rows.length - 1] as DivergenciasRow & Record<string, unknown>;
    last.referenciaId = pc.id as string | undefined;
    last.referenciaTipo = 'pedido_compra';
    last.criticidadeKind = 'critical';
    last.tipoKind = 'critical';
    last.statusKey = 'pedido_sem_nf';
    last.statusKind = 'critical';
  }

  for (const nf of nfsSemFinanceiro) {
    const nfTyped = nf as {
      id: string;
      numero: string; tipo: string; valor_total: number | null;
      clientes: { nome_razao_social: string } | null;
      fornecedores: { nome_razao_social: string } | null;
    };
    const parceiro = nfTyped.tipo === 'saida'
      ? (nfTyped.clientes?.nome_razao_social || '-')
      : (nfTyped.fornecedores?.nome_razao_social || '-');
    rows.push({
      tipo: "NF s/ Financeiro",
      referencia: nfTyped.numero,
      parceiro,
      valor: Number(nfTyped.valor_total || 0),
      status: nfTyped.tipo,
      criticidade: "Alta",
      observacao: "Nota fiscal com flag financeiro mas sem lançamento gerado",
    } as DivergenciasRow & Record<string, unknown>);
    const last = rows[rows.length - 1] as DivergenciasRow & Record<string, unknown>;
    last.referenciaId = nfTyped.id;
    last.referenciaTipo = 'nota_fiscal';
    last.criticidadeKind = 'critical';
    last.tipoKind = 'critical';
    last.statusKey = 'nf_sem_financeiro';
    last.statusKind = 'critical';
  }

  return {
    title: "Divergências",
    subtitle: "Pedidos sem nota fiscal e notas sem lançamento financeiro.",
    rows: rows as unknown as Record<string, unknown>[],
    chartData: [
      { name: "Pedidos s/ NF", value: pedidos.length },
      { name: "NF s/ Financeiro", value: nfsSemFinanceiro.length },
    ],
    totals: { total: rows.length },
    kpis: {
      totalDivergencias: rows.length,
      valorImpactado: rows.reduce((s, r) => s + Number(r.valor || 0), 0),
      pedidosSemNf: pedidos.length,
      nfSemFinanceiro: nfsSemFinanceiro.length,
    },
    meta: { kind: 'divergencias', valueNature: 'monetario', drillDownReady: true },
  };
}