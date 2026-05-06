/**
 * Loaders para relatórios de estoque/produtos:
 *  - estoque (posição)
 *  - movimentos_estoque
 *  - margem_produtos
 *  - estoque_minimo
 */

import { supabase } from "@/integrations/supabase/client";
import {
  estoqueCriticidadeKind,
  movimentoEstoqueStatusMap,
  resolveStatus,
} from "@/services/relatorios/lib/statusMap";
import {
  withDateRange,
  type FiltroRelatorio,
  type RelatorioResultado,
  type RawMargemProdutoItem,
  type RawEstoqueMinimoItem,
} from "@/services/relatorios/lib/shared";

export async function loadEstoque(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  let query = supabase
    .from("produtos")
    .select("id, sku, codigo_interno, nome, unidade_medida, estoque_atual, estoque_minimo, preco_custo, preco_venda, grupos_produto(nome)")
    .eq("ativo", true)
    .order("nome");
  if (filtros.grupoProdutoIds?.length) query = query.in('grupo_id', filtros.grupoProdutoIds);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map((item: Record<string, unknown>) => {
    const custo = Number(item.preco_custo || 0);
    const venda = Number(item.preco_venda || 0);
    const qty = Number(item.estoque_atual || 0);
    const min = Number(item.estoque_minimo || 0);
    let criticidade: string;
    if (qty <= 0) criticidade = "Zerado";
    else if (min > 0 && qty <= min) criticidade = "Abaixo do mínimo";
    else criticidade = "OK";
    return {
      produtoId: item.id as string,
      codigo: (item.codigo_interno as string | null) || (item.sku as string | null) || "-",
      produto: item.nome as string,
      grupo: ((item.grupos_produto as { nome?: string } | null)?.nome) || "-",
      unidade: (item.unidade_medida as string | null) || "UN",
      estoqueAtual: qty,
      estoqueMinimo: min,
      criticidade,
      criticidadeKind: estoqueCriticidadeKind(criticidade),
      statusKey: criticidade === 'Zerado' ? 'zerado' : criticidade === 'Abaixo do mínimo' ? 'abaixo_minimo' : 'ok',
      statusKind: estoqueCriticidadeKind(criticidade),
      custoUnit: custo,
      vendaUnit: venda,
      totalCusto: qty * custo,
      totalVenda: qty * venda,
    };
  });

  const totalItens = rows.length;
  const totalQtd = rows.reduce((s, r) => s + r.estoqueAtual, 0);
  const totalCusto = rows.reduce((s, r) => s + r.totalCusto, 0);
  const totalVenda = rows.reduce((s, r) => s + r.totalVenda, 0);
  const itensZerados = rows.filter((r) => r.criticidade === "Zerado").length;
  const itensCriticos = rows.filter((r) => r.criticidade === "Abaixo do mínimo").length;

  return {
    title: "Posição de Estoque",
    subtitle: "Saldo atual, custo unitário, preço de venda e criticidade por produto.",
    rows,
    chartData: [
      { name: "Zerado", value: itensZerados },
      { name: "Abaixo do mínimo", value: itensCriticos },
      { name: "Estoque OK", value: rows.filter((r) => r.criticidade === "OK").length },
    ],
    totals: { totalQtd, totalCusto, totalVenda },
    kpis: { totalItens, totalQtd, totalCusto, itensCriticos, itensZerados },
    meta: { kind: 'list', valueNature: 'misto', drillDownReady: true },
  };
}

export async function loadMovimentosEstoque(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  let query = supabase
    .from("estoque_movimentos")
    .select("produto_id, tipo, quantidade, saldo_anterior, saldo_atual, documento_tipo, motivo, created_at, produtos(nome, sku, codigo_interno)")
    .order("created_at", { ascending: false });

  query = withDateRange(query, "created_at", filtros);

  if (filtros.grupoProdutoIds?.length) {
    const { data: prods, error: prodErr } = await supabase
      .from('produtos')
      .select('id')
      .in('grupo_id', filtros.grupoProdutoIds)
      .limit(10000);
    if (prodErr) throw prodErr;
    const produtoIds = (prods ?? []).map((p) => p.id);
    if (!produtoIds.length) {
      return {
        title: "Movimentos de estoque",
        subtitle: "Entradas, saídas e ajustes de estoque no período.",
        rows: [],
        chartData: [],
        totals: { totalEntradas: 0, totalSaidas: 0, totalAjustes: 0, saldoAtual: 0 },
        kpis: { totalMovimentos: 0, totalEntradas: 0, totalSaidas: 0, totalAjustes: 0 },
        _isQuantityReport: true,
        meta: {
          kind: 'list',
          valueNature: 'quantidade',
          timeAxis: { field: 'criacao', label: 'criação', required: false },
          drillDownReady: true,
        },
      };
    }
    query = query.in('produto_id', produtoIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map((item: Record<string, unknown>) => {
    const tipo = (item.tipo || (item as Record<string, unknown>).tipo_movimento || '-') as string;
    const meta = resolveStatus(movimentoEstoqueStatusMap, tipo);
    return {
      produtoId: item.produto_id as string | null,
      data: item.created_at,
      produto: ((item.produtos as { nome?: string } | null)?.nome) || "-",
      codigo: ((item.produtos as { codigo_interno?: string | null; sku?: string | null } | null)?.codigo_interno) || ((item.produtos as { sku?: string | null } | null)?.sku) || "-",
      tipo,
      statusKey: meta.key,
      statusKind: meta.kind,
      quantidade: Number(item.quantidade || 0),
      saldoAnterior: Number(item.saldo_anterior || 0),
      saldoAtual: Number(item.saldo_atual || (item as Record<string, unknown>).saldo_apos || 0),
      documento: item.documento_tipo || "-",
      motivo: item.motivo || "-",
    };
  });

  const entradas = rows.filter((r) => r.tipo === "entrada").reduce((s, r) => s + r.quantidade, 0);
  const saidas = rows.filter((r) => r.tipo === "saida").reduce((s, r) => s + r.quantidade, 0);
  const ajustes = rows.filter((r) => r.tipo === "ajuste").reduce((s, r) => s + r.quantidade, 0);
  const saldoFinal = rows.length > 0 ? rows[0].saldoAtual : 0;

  return {
    title: "Movimentos de estoque",
    subtitle: "Entradas, saídas e ajustes de estoque no período.",
    rows,
    chartData: [
      { name: "Entradas", value: entradas },
      { name: "Saídas", value: Math.abs(saidas) },
      { name: "Ajustes", value: Math.abs(ajustes) },
    ],
    totals: {
      totalEntradas: entradas,
      totalSaidas: Math.abs(saidas),
      totalAjustes: Math.abs(ajustes),
      saldoAtual: saldoFinal,
    },
    kpis: {
      totalMovimentos: rows.length,
      totalEntradas: entradas,
      totalSaidas: Math.abs(saidas),
      totalAjustes: Math.abs(ajustes),
    },
    _isQuantityReport: true,
    meta: {
      kind: 'list',
      valueNature: 'quantidade',
      timeAxis: { field: 'criacao', label: 'criação', required: false },
      drillDownReady: true,
    },
  };
}

export async function loadMargemProdutos(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  let query = supabase
    .from("produtos")
    .select("id, sku, codigo_interno, nome, preco_custo, preco_venda, estoque_atual, unidade_medida, grupos_produto(nome)")
    .eq("ativo", true)
    .order("nome");
  if (filtros.grupoProdutoIds?.length) query = query.in('grupo_id', filtros.grupoProdutoIds);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map((raw: RawMargemProdutoItem & { id?: string }) => {
    const item = raw;
    const custo = Number(item.preco_custo || 0);
    const venda = Number(item.preco_venda || 0);
    const margem = venda > 0 ? ((venda - custo) / venda) * 100 : 0;
    const markup = custo > 0 ? ((venda - custo) / custo) * 100 : 0;
    return {
      produtoId: item.id,
      codigo: item.codigo_interno || (item as { sku?: string | null }).sku || "-",
      produto: item.nome,
      grupo: item.grupos_produto?.nome || "-",
      custUnit: custo,
      vendaUnit: venda,
      lucroUnit: venda - custo,
      margem: Number(margem.toFixed(1)),
      markup: Number(markup.toFixed(1)),
      estoque: Number(item.estoque_atual || 0),
    };
  });

  const sorted = [...rows].sort((a, b) => b.margem - a.margem);
  const mediaMargemPct = rows.length > 0 ? Number((rows.reduce((s, r) => s + r.margem, 0) / rows.length).toFixed(1)) : 0;
  const itensMargNeg = rows.filter((r) => r.margem < 0).length;
  const maiorMargem = sorted.length > 0 ? sorted[0].margem : 0;
  const menorMargem = sorted.length > 0 ? sorted[sorted.length - 1].margem : 0;

  return {
    title: "Análise de Margem de Produtos",
    subtitle: "Margem e markup por produto ativo.",
    rows: sorted,
    chartData: sorted.slice(0, 8).map(r => ({ name: r.produto.substring(0, 20), value: r.margem })),
    totals: { mediaMargemPct },
    kpis: { mediaMargemPct, itensMargNeg, maiorMargem, menorMargem },
    meta: { kind: 'list', valueNature: 'misto', drillDownReady: true },
  };
}

export async function loadEstoqueMinimo(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  let query = supabase
    .from("produtos")
    .select("id, sku, codigo_interno, nome, unidade_medida, estoque_atual, estoque_minimo, preco_custo, grupos_produto(nome)")
    .eq("ativo", true)
    .order("nome");
  if (filtros.grupoProdutoIds?.length) query = query.in('grupo_id', filtros.grupoProdutoIds);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || [])
    .filter((p: RawEstoqueMinimoItem) => Number(p.estoque_atual || 0) <= Number(p.estoque_minimo || 0) && Number(p.estoque_minimo || 0) > 0)
    .map((raw: RawEstoqueMinimoItem & { id?: string }) => {
      const p = raw;
      const atual = Number(p.estoque_atual || 0);
      const min = Number(p.estoque_minimo || 0);
      const custo = Number(p.preco_custo || 0);
      const criticidade = atual <= 0 ? "Zerado" : "Abaixo do mínimo";
      return {
        produtoId: p.id,
        codigo: p.codigo_interno || (p as { sku?: string | null }).sku || "-",
        produto: p.nome,
        grupo: p.grupos_produto?.nome || "-",
        unidade: p.unidade_medida || "UN",
        estoqueAtual: atual,
        estoqueMinimo: min,
        deficit: min - atual,
        criticidade,
        criticidadeKind: estoqueCriticidadeKind(criticidade),
        statusKey: criticidade === 'Zerado' ? 'zerado' : 'abaixo_minimo',
        statusKind: estoqueCriticidadeKind(criticidade),
        custoReposicao: (min - atual) * custo,
      };
    });

  const itensZerados = rows.filter((r) => r.criticidade === "Zerado").length;
  const itensCriticos = rows.filter((r) => r.criticidade === "Abaixo do mínimo").length;
  const deficitTotal = rows.reduce((s, r) => s + r.deficit, 0);
  const custoTotal = rows.reduce((s, r) => s + r.custoReposicao, 0);

  return {
    title: "Estoque Abaixo do Mínimo",
    subtitle: "Produtos com estoque atual igual ou inferior ao mínimo definido.",
    rows,
    chartData: rows.slice(0, 8).map(r => ({ name: r.produto.substring(0, 20), value: r.deficit })),
    totals: { totalItens: rows.length, custoTotal },
    kpis: { itensCriticos, itensZerados, deficitTotal, custoTotal },
    _isQuantityReport: true,
    meta: { kind: 'list', valueNature: 'misto', drillDownReady: true },
  };
}