/**
 * Loaders para relatórios financeiros:
 *  - financeiro (contas a pagar/receber)
 *  - fluxo_caixa
 *  - aging
 *  - dre (gerencial simplificado)
 */

import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import {
  agingFaixaKind,
  financeiroStatusMap,
  resolveStatus,
} from "@/services/relatorios/lib/statusMap";
import {
  withDateRange,
  type FiltroRelatorio,
  type RelatorioResultado,
  type RawFluxoItem,
} from "@/services/relatorios/lib/shared";
import { fetchAllPages } from "@/services/relatorios/lib/fetchAllPages";

export async function loadFinanceiro(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  // Doutrina canônica (Onda 6): status persistidos = aberto | parcial | pago |
  // cancelado | estornado. `vencido` é DERIVADO de `status='aberto' AND
  // data_vencimento < hoje` — não existe mais como valor de coluna no DB.
  // Onda 9 (C-01): paginação universal via fetchAllPages para evitar
  // truncamento silencioso no limite default de 1000 do Supabase.
  const data = await fetchAllPages<Record<string, unknown>>(() => {
    let q = supabase
      .from("financeiro_lancamentos")
      .select("id, cliente_id, fornecedor_id, tipo, descricao, valor, saldo_restante, valor_pago, status, data_vencimento, data_pagamento, banco, forma_pagamento, clientes(nome_razao_social), fornecedores(nome_razao_social)")
      .eq("ativo", true)
      .not("status", "in", "(cancelado,estornado)")
      .order("data_vencimento", { ascending: true });
    q = withDateRange(q, "data_vencimento", filtros);
    if (filtros.tiposFinanceiros?.length) q = q.in('tipo', filtros.tiposFinanceiros);
    return q;
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const rows = data.map((item: Record<string, unknown>) => {
    const valor = Number(item.valor || 0);
    const status = (item.status as string | null) ?? '-';
    const valorEmAberto = status === 'pago'
      ? 0
      : item.saldo_restante != null
        ? Number(item.saldo_restante)
        : valor;
    const venc = item.data_vencimento ? new Date(item.data_vencimento as string) : null;
    // C-02: 'vencido' não é mais status persistido (backfill Onda 6).
    const isOpen = status === 'aberto' || status === 'parcial';
    const atraso = (venc && isOpen && venc < hoje)
      ? Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const parceiro = item.tipo === 'receber'
      ? ((item.clientes as { nome_razao_social?: string } | null)?.nome_razao_social) || '-'
      : ((item.fornecedores as { nome_razao_social?: string } | null)?.nome_razao_social) || '-';
    // Status efetivo derivado para chip/badge (display layer):
    const effectiveStatus = (isOpen && atraso > 0) ? 'vencido' : status;
    const stMeta = resolveStatus(financeiroStatusMap, effectiveStatus);
    return {
      lancamentoId: item.id as string,
      clienteId: (item.cliente_id as string | null) ?? undefined,
      fornecedorId: (item.fornecedor_id as string | null) ?? undefined,
      tipo: item.tipo === 'receber' ? 'Receber' : 'Pagar',
      parceiro,
      descricao: item.descricao || "-",
      valor,
      valorEmAberto,
      atraso,
      status: effectiveStatus,
      statusKey: stMeta.key,
      statusKind: stMeta.kind,
      vencimento: item.data_vencimento,
      pagamento: item.data_pagamento,
      banco: item.banco || "-",
      formaPagamento: item.forma_pagamento || "-",
    };
  });

  // 'vencido' aqui é o status derivado já presente nas rows.
  const isOpenStatus = (s: string) => s === 'aberto' || s === 'parcial' || s === 'vencido';
  const totalReceber = rows.filter((r) => r.tipo === 'Receber' && isOpenStatus(r.status)).reduce((s, r) => s + r.valorEmAberto, 0);
  const totalPagar = rows.filter((r) => r.tipo === 'Pagar' && isOpenStatus(r.status)).reduce((s, r) => s + r.valorEmAberto, 0);
  const totalVencido = rows.filter((r) => r.atraso > 0).reduce((s, r) => s + r.valorEmAberto, 0);
  const totalPago = rows.filter((r) => r.status === 'pago').reduce((s, r) => s + r.valor, 0);

  return {
    title: "Contas a Pagar e Receber",
    subtitle: "Títulos financeiros por tipo, status, parceiro e vencimento.",
    rows,
    chartData: [
      { name: "A Receber", value: totalReceber },
      { name: "A Pagar", value: totalPagar },
      { name: "Vencido", value: totalVencido },
      { name: "Pago", value: totalPago },
    ],
    kpis: { totalReceber, totalPagar, totalVencido, totalPago },
    meta: {
      kind: 'list',
      valueNature: 'monetario',
      timeAxis: { field: 'vencimento', label: 'vencimento', required: false },
      drillDownReady: true,
    },
  };
}

export async function loadFluxoCaixa(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  const data = await fetchAllPages<RawFluxoItem & { id?: string; valor_pago?: number | null }>(() => {
    let q = supabase
      .from("financeiro_lancamentos")
      .select("id, tipo, descricao, valor, valor_pago, status, data_vencimento, data_pagamento")
      .eq("ativo", true)
      .not("status", "in", "(cancelado,estornado)")
      .order("data_vencimento", { ascending: true });
    q = withDateRange(q, "data_vencimento", filtros);
    if (filtros.tiposFinanceiros?.length) q = q.in('tipo', filtros.tiposFinanceiros);
    return q;
  });

  const sorted = data.slice().sort((a, b) => {
    const da = a.data_pagamento || a.data_vencimento || '';
    const db = b.data_pagamento || b.data_vencimento || '';
    return da.localeCompare(db);
  });

  let saldo = 0;
  const rows = sorted.map((item: RawFluxoItem & { valor_pago?: number | null; id?: string }) => {
    const status = item.status ?? '';
    const valorEfetivo = (status === 'pago' || status === 'parcial') && item.valor_pago != null
      ? Number(item.valor_pago)
      : Number(item.valor || 0);
    const entrada = item.tipo === "receber" ? valorEfetivo : 0;
    const saida = item.tipo === "pagar" ? valorEfetivo : 0;
    saldo = saldo + entrada - saida;
    const stMeta = resolveStatus(financeiroStatusMap, status);
    return {
      lancamentoId: item.id,
      data: item.data_pagamento || item.data_vencimento,
      descricao: item.descricao || "-",
      tipo: item.tipo === 'receber' ? 'Entrada' : 'Saída',
      status: status || "-",
      statusKey: stMeta.key,
      statusKind: stMeta.kind,
      entrada,
      saida,
      saldo,
    };
  });

  const totalEntradas = rows.reduce((s, r) => s + r.entrada, 0);
  const totalSaidas = rows.reduce((s, r) => s + r.saida, 0);
  const saldoFinal = rows.length > 0 ? rows[rows.length - 1].saldo : 0;

  return {
    title: "Fluxo de caixa",
    subtitle: "Entradas, saídas e saldo acumulado por período.",
    rows,
    chartData: rows.slice(0, 12).map((row) => ({
      name: row.data ? formatDate(row.data) : "-",
      value: row.saldo,
    })),
    totals: { totalEntradas, totalSaidas, saldoFinal },
    kpis: { totalEntradas, totalSaidas, saldoFinal },
    meta: {
      kind: 'list',
      valueNature: 'monetario',
      timeAxis: { field: 'pagamento', label: 'pagamento', required: false },
      drillDownReady: true,
    },
  };
}

export async function loadAging(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  // C-02: 'vencido' não existe mais como status persistido — removido do .in().
  const data = await fetchAllPages<Record<string, unknown>>(() => {
    let q = supabase
      .from("financeiro_lancamentos")
      .select("id, cliente_id, fornecedor_id, tipo, descricao, valor, saldo_restante, status, data_vencimento, data_pagamento, clientes(nome_razao_social), fornecedores(nome_razao_social)")
      .eq("ativo", true)
      .in("status", ["aberto", "parcial"])
      .order("data_vencimento", { ascending: true });
    q = withDateRange(q, "data_vencimento", filtros);
    if (filtros.clienteIds?.length) q = q.in('cliente_id', filtros.clienteIds);
    if (filtros.tiposFinanceiros?.length) q = q.in('tipo', filtros.tiposFinanceiros);
    return q;
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const rows = data.map((raw: Record<string, unknown>) => {
    const item = raw as {
      id: string;
      cliente_id: string | null;
      fornecedor_id: string | null;
      tipo: string;
      descricao: string | null;
      valor: number | null;
      saldo_restante: number | null;
      data_vencimento: string;
      clientes: { nome_razao_social: string } | null;
      fornecedores: { nome_razao_social: string } | null;
    };
    const venc = new Date(item.data_vencimento);
    const diffDays = Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
    let faixa = "A vencer";
    if (diffDays > 0 && diffDays <= 30) faixa = "1-30 dias";
    else if (diffDays > 30 && diffDays <= 60) faixa = "31-60 dias";
    else if (diffDays > 60 && diffDays <= 90) faixa = "61-90 dias";
    else if (diffDays > 90) faixa = "90+ dias";

    const valorAberto = item.saldo_restante != null
      ? Number(item.saldo_restante)
      : Number(item.valor || 0);

    return {
      lancamentoId: item.id,
      clienteId: item.cliente_id ?? undefined,
      fornecedorId: item.fornecedor_id ?? undefined,
      tipo: item.tipo === "receber" ? "Receber" : "Pagar",
      descricao: item.descricao || "-",
      parceiro: item.tipo === "receber"
        ? item.clientes?.nome_razao_social || "-"
        : item.fornecedores?.nome_razao_social || "-",
      valor: valorAberto,
      vencimento: item.data_vencimento,
      diasVencido: diffDays > 0 ? diffDays : 0,
      faixa,
      faixaKind: agingFaixaKind(faixa),
      statusKey: faixa === 'A vencer' ? 'a_vencer' : 'vencido',
      statusKind: agingFaixaKind(faixa),
    };
  });

  const faixas = ["A vencer", "1-30 dias", "31-60 dias", "61-90 dias", "90+ dias"];
  const chartData = faixas.map((f) => ({
    name: f,
    value: rows.filter((r) => r.faixa === f).reduce((s, r) => s + r.valor, 0),
  }));

  const totalVencido = rows.filter((r) => r.diasVencido > 0).reduce((s, r) => s + r.valor, 0);
  const titulosVencidos = rows.filter((r) => r.diasVencido > 0).length;
  const maisAntigosDias = rows.reduce((max, r) => Math.max(max, r.diasVencido), 0);

  return {
    title: "Aging — Vencidos por faixa",
    subtitle: "Títulos a pagar e receber agrupados por faixa de vencimento (saldo em aberto).",
    rows,
    chartData,
    totals: {
      totalTitulos: rows.length,
      totalValor: rows.reduce((s, r) => s + r.valor, 0),
    },
    kpis: { totalVencido, titulosVencidos, maisAntigosDias },
    meta: {
      kind: 'aging',
      valueNature: 'monetario',
      timeAxis: { field: 'vencimento', label: 'vencimento', required: false },
      drillDownReady: true,
    },
  };
}

export async function loadDre(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  // 8.1.4 — Cálculo canônico via RPC `get_dre_periodo`. Substitui a tripla
  // implementação paralela (loader + view workbook + apresentação).
  const modo = filtros.dreModo ?? 'caixa';
  // Tipagem inline: a RPC ainda não consta em Database['public']['Functions'].
  type DrePeriodoRow = { ordem: number; linha: string; tipo: string; valor: number | string };
  const sb = supabase as unknown as {
    rpc: (
      fn: 'get_dre_periodo',
      args: { p_modo: string; p_data_inicio: string | null; p_data_fim: string | null },
    ) => Promise<{ data: DrePeriodoRow[] | null; error: { message: string } | null }>;
  };

  const { data, error } = await sb.rpc('get_dre_periodo', {
    p_modo: modo,
    p_data_inicio: filtros.dataInicio ?? null,
    p_data_fim: filtros.dataFim ?? null,
  });
  if (error) throw error;

  const ordered = (data ?? []).slice().sort((a, b) => a.ordem - b.ordem);
  const rows = ordered.map((r) => ({ linha: r.linha, tipo: r.tipo, valor: Number(r.valor || 0) }));

  const get = (label: string) => Number(ordered.find((r) => r.linha === label)?.valor ?? 0);
  const receitaBruta   = get('Receita Bruta');
  const deducoes       = get('(–) Deduções s/ Receita');
  const receitaLiquida = get('= Receita Líquida');
  const cmv            = get('(–) CMV / CPV');
  const despesasOp     = get('(–) Despesas Operacionais');
  const resultado      = get('= Resultado do Exercício');

  return {
    title: "DRE — Demonstrativo de Resultado",
    subtitle:
      modo === 'caixa'
        ? 'Regime de caixa: receitas e custos efetivamente movimentados no período.'
        : 'Regime de competência: receitas e custos reconhecidos pela emissão no período.',
    rows,
    chartData: [
      { name: "Receita Bruta", value: receitaBruta },
      { name: "Deduções", value: deducoes },
      { name: "CMV", value: cmv },
      { name: "Despesas", value: despesasOp },
      { name: "Resultado", value: Math.max(0, resultado) },
    ],
    totals: { receitaBruta, receitaLiquida, resultado },
    kpis: { receitaBruta, receitaLiquida, resultado },
    meta: {
      kind: 'dre',
      valueNature: 'monetario',
      timeAxis: { field: 'competencia', label: 'competência', required: true },
      drillDownReady: false,
    },
  };
}