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

export async function loadFinanceiro(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  // Status canônicos: aberto | parcial | pago | vencido | cancelado | estornado.
  // Para "em aberto" consideramos aberto, parcial e vencido (cancelado/estornado são excluídos).
  let query = supabase
    .from("financeiro_lancamentos")
    .select("id, cliente_id, fornecedor_id, tipo, descricao, valor, saldo_restante, valor_pago, status, data_vencimento, data_pagamento, banco, forma_pagamento, clientes(nome_razao_social), fornecedores(nome_razao_social)")
    .eq("ativo", true)
    .not("status", "in", "(cancelado,estornado)")
    .order("data_vencimento", { ascending: true });

  query = withDateRange(query, "data_vencimento", filtros);
  if (filtros.tiposFinanceiros?.length) query = query.in('tipo', filtros.tiposFinanceiros);
  const { data, error } = await query;
  if (error) throw error;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const rows = (data || []).map((item: Record<string, unknown>) => {
    const valor = Number(item.valor || 0);
    const status = (item.status as string | null) ?? '-';
    const valorEmAberto = status === 'pago'
      ? 0
      : item.saldo_restante != null
        ? Number(item.saldo_restante)
        : valor;
    const venc = item.data_vencimento ? new Date(item.data_vencimento as string) : null;
    const isOpen = status === 'aberto' || status === 'parcial' || status === 'vencido';
    const atraso = (venc && isOpen && venc < hoje)
      ? Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const parceiro = item.tipo === 'receber'
      ? ((item.clientes as { nome_razao_social?: string } | null)?.nome_razao_social) || '-'
      : ((item.fornecedores as { nome_razao_social?: string } | null)?.nome_razao_social) || '-';
    const stMeta = resolveStatus(financeiroStatusMap, status);
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
      status,
      statusKey: stMeta.key,
      statusKind: stMeta.kind,
      vencimento: item.data_vencimento,
      pagamento: item.data_pagamento,
      banco: item.banco || "-",
      formaPagamento: item.forma_pagamento || "-",
    };
  });

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
  let query = supabase
    .from("financeiro_lancamentos")
    .select("id, tipo, descricao, valor, valor_pago, status, data_vencimento, data_pagamento")
    .eq("ativo", true)
    .not("status", "in", "(cancelado,estornado)");

  query = withDateRange(query, "data_vencimento", filtros);
  if (filtros.tiposFinanceiros?.length) query = query.in('tipo', filtros.tiposFinanceiros);
  const { data, error } = await query;
  if (error) throw error;

  const sorted = (data || []).slice().sort((a: RawFluxoItem, b: RawFluxoItem) => {
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
  let query = supabase
    .from("financeiro_lancamentos")
    .select("id, cliente_id, fornecedor_id, tipo, descricao, valor, saldo_restante, status, data_vencimento, data_pagamento, clientes(nome_razao_social), fornecedores(nome_razao_social)")
    .eq("ativo", true)
    .in("status", ["aberto", "parcial", "vencido"])
    .order("data_vencimento", { ascending: true });
  query = withDateRange(query, "data_vencimento", filtros);
  if (filtros.clienteIds?.length) query = query.in('cliente_id', filtros.clienteIds);
  if (filtros.tiposFinanceiros?.length) query = query.in('tipo', filtros.tiposFinanceiros);
  const { data, error } = await query;
  if (error) throw error;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const rows = (data || []).map((raw: Record<string, unknown>) => {
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
  // ── Demonstrativo Gerencial Simplificado ─────────────────────────────────
  // GERENCIAL approximation — derived from financeiro_lancamentos + notas_fiscais.
  // Receita Bruta = soma de receber pago/parcial (cash basis via valor_pago).
  // Deduções = ICMS/PIS/COFINS/IPI sobre NFs de saída no período.
  // CMV = pagar vinculado a NF de entrada ou pedido de compra (classificação estruturada).
  // Despesas Op. = demais lançamentos pagar.
  // Resultado = Receita Líquida − CMV − Despesas Operacionais.

  let receitaQuery = supabase
    .from("financeiro_lancamentos")
    .select("valor, valor_pago, status")
    .eq("ativo", true)
    .eq("tipo", "receber")
    .in("status", ["pago", "parcial"]);
  receitaQuery = withDateRange(receitaQuery, "data_pagamento", filtros);

  let pagosQuery = supabase
    .from("financeiro_lancamentos")
    .select("valor, valor_pago, status, descricao, nota_fiscal_id, pedido_compra_id, origem_tabela")
    .eq("ativo", true)
    .eq("tipo", "pagar")
    .in("status", ["pago", "parcial"]);
  pagosQuery = withDateRange(pagosQuery, "data_pagamento", filtros);

  let nfSaidaQuery = supabase
    .from("notas_fiscais")
    .select("icms_valor, pis_valor, cofins_valor, ipi_valor")
    .eq("ativo", true)
    .eq("tipo", "saida");
  nfSaidaQuery = withDateRange(nfSaidaQuery, "data_emissao", filtros);

  const [{ data: receitas }, { data: pagos }, { data: nfSaida }] = await Promise.all([
    receitaQuery, pagosQuery, nfSaidaQuery,
  ]);

  if (!receitas && !pagos && !nfSaida) throw new Error("Erro ao carregar dados do DRE");

  const cashAmount = (r: Record<string, unknown>) => {
    const status = (r.status as string | null) ?? '';
    if (status === 'parcial' && r.valor_pago != null) return Number(r.valor_pago);
    return Number(r.valor || 0);
  };

  const receitaBruta = (receitas || []).reduce((s: number, r: Record<string, unknown>) => s + cashAmount(r), 0);

  const deducoes = (nfSaida || []).reduce((s: number, nf: Record<string, unknown>) => {
    return s + Number(nf.icms_valor || 0) + Number(nf.pis_valor || 0) + Number(nf.cofins_valor || 0) + Number(nf.ipi_valor || 0);
  }, 0);

  const receitaLiquida = receitaBruta - deducoes;

  // CMV: classificação estruturada (sem heurística de substring na descrição).
  // Considera CMV todo pagamento vinculado a NF de entrada, pedido de compra
  // ou cuja origem seja explicitamente notas_fiscais / pedidos_compra.
  const isCmv = (p: Record<string, unknown>): boolean => {
    if (p.nota_fiscal_id) return true;
    if (p.pedido_compra_id) return true;
    const origem = ((p.origem_tabela as string | null) ?? '').toLowerCase();
    return origem === 'notas_fiscais' || origem === 'pedidos_compra';
  };

  const cmv = (pagos || []).filter(isCmv)
    .reduce((s: number, p: Record<string, unknown>) => s + cashAmount(p), 0);

  const despesasOp = (pagos || []).filter((p: Record<string, unknown>) => !isCmv(p))
    .reduce((s: number, p: Record<string, unknown>) => s + cashAmount(p), 0);

  const lucroBruto = receitaLiquida - cmv;
  const resultado = lucroBruto - despesasOp;

  const rows = [
    { linha: "Receita Bruta", valor: receitaBruta, tipo: "header" },
    { linha: "(–) Deduções s/ Receita", valor: deducoes, tipo: "deducao" },
    { linha: "= Receita Líquida", valor: receitaLiquida, tipo: "subtotal" },
    { linha: "(–) CMV / CPV", valor: cmv, tipo: "deducao" },
    { linha: "= Lucro Bruto", valor: lucroBruto, tipo: "subtotal" },
    { linha: "(–) Despesas Operacionais", valor: despesasOp, tipo: "deducao" },
    { linha: "= Resultado do Exercício", valor: resultado, tipo: "resultado" },
  ];

  return {
    title: "DRE — Demonstrativo de Resultado",
    subtitle: "Receitas, deduções, custos e resultado do exercício.",
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
    _isDreReport: true,
    meta: {
      kind: 'dre',
      valueNature: 'monetario',
      timeAxis: { field: 'competencia', label: 'competência', required: true },
      drillDownReady: false,
    },
  };
}