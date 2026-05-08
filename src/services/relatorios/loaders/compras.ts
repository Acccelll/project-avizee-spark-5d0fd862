/**
 * Loaders para relatórios de compras:
 *  - compras (pedidos)
 *  - compras_fornecedor (ranking)
 */

import { supabase } from "@/integrations/supabase/client";
import { addParticipacao, computeTop5Concentracao } from "@/utils/relatorios";
import { compraStatusMap, resolveStatus } from "@/services/relatorios/lib/statusMap";
import {
  withDateRange,
  type FiltroRelatorio,
  type RelatorioResultado,
  type RawComprasItem,
} from "@/services/relatorios/lib/shared";
import { fetchAllPages } from "@/services/relatorios/lib/fetchAllPages";

export async function loadCompras(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  const data = await fetchAllPages<RawComprasItem & { id?: string; fornecedor_id?: string | null }>(() => {
    let q = supabase
      .from("compras")
      .select("id, fornecedor_id, numero, data_compra, data_entrega_prevista, data_entrega_real, valor_total, status, fornecedores(nome_razao_social)")
      .eq("ativo", true)
      .order("data_compra", { ascending: false });
    q = withDateRange(q, "data_compra", filtros);
    if (filtros.fornecedorIds?.length) q = q.in('fornecedor_id', filtros.fornecedorIds);
    return q;
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const rows = data.map((raw) => {
    const item = raw;
    const prevista = item.data_entrega_prevista ? new Date(item.data_entrega_prevista) : null;
    const entregaReal = item.data_entrega_real;
    const statusVal = item.status || '-';
    const emAberto = ['pendente', 'aprovado', 'em_transito'].includes(statusVal);
    const atraso = (prevista && emAberto && prevista < hoje)
      ? Math.floor((hoje.getTime() - prevista.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const stMeta = resolveStatus(compraStatusMap, statusVal);
    return {
      compraId: item.id,
      fornecedorId: item.fornecedor_id ?? undefined,
      numero: item.numero,
      fornecedor: item.fornecedores?.nome_razao_social || "-",
      compra: item.data_compra,
      prevista: item.data_entrega_prevista,
      entrega: entregaReal,
      valor: Number(item.valor_total || 0),
      atraso,
      status: statusVal,
      statusKey: stMeta.key,
      statusKind: stMeta.kind,
    };
  });

  const totalComprado = rows.reduce((s, r) => s + r.valor, 0);
  const emAberto = rows.filter((r) => ['pendente', 'aprovado', 'em_transito'].includes(r.status)).length;
  const atrasadas = rows.filter((r) => r.atraso > 0).length;

  return {
    title: "Compras",
    subtitle: "Pedidos de compra — entrega prevista, real e situação.",
    rows,
    chartData: rows.slice(0, 8).map((row) => ({ name: row.fornecedor, value: row.valor })),
    kpis: { qtdCompras: rows.length, totalComprado, emAberto, atrasadas },
    meta: {
      kind: 'list',
      valueNature: 'monetario',
      timeAxis: { field: 'criacao', label: 'data da compra', required: false },
      drillDownReady: true,
    },
  };
}

/**
 * Relatório "NF-e de Entrada" — agrupa NF-e capturadas (nfe_distribuicao)
 * por fornecedor e mês, com totais de ICMS/IPI extraídos do XML importado.
 * Considera apenas NF-e com status_manifestacao 'confirmada' ou 'ciencia'
 * e filtra pelo período da `data_emissao`.
 */
export async function loadNfeEntrada(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  const data = await fetchAllPages<Record<string, unknown>>(() => {
    let q = supabase
      .from("nfe_distribuicao")
      .select(
        "id, chave_acesso, numero, serie, data_emissao, valor_total, valor_icms, valor_ipi, status_manifestacao, processado, xml_importado, fornecedor_id, cnpj_emitente, nome_emitente, fornecedores(nome_razao_social)",
      )
      .order("data_emissao", { ascending: false });
    q = withDateRange(q, "data_emissao", filtros);
    if (filtros.fornecedorIds?.length) q = q.in("fornecedor_id", filtros.fornecedorIds);
    return q;
  });

  const rows = data.map((raw) => {
    const item = raw as {
      id: string;
      chave_acesso: string;
      numero: string | null;
      serie: string | null;
      data_emissao: string | null;
      valor_total: number | null;
      valor_icms: number | null;
      valor_ipi: number | null;
      status_manifestacao: string;
      processado: boolean | null;
      xml_importado: boolean | null;
      fornecedor_id: string | null;
      cnpj_emitente: string | null;
      nome_emitente: string | null;
      fornecedores?: { nome_razao_social: string } | null;
    };
    const fornecedor = item.fornecedores?.nome_razao_social
      || item.nome_emitente
      || (item.cnpj_emitente ? `CNPJ ${item.cnpj_emitente}` : "Sem fornecedor");
    const mesEmissao = item.data_emissao ? item.data_emissao.slice(0, 7) : "-";
    return {
      nfeId: item.id,
      fornecedorId: item.fornecedor_id ?? undefined,
      fornecedor,
      cnpj: item.cnpj_emitente || "-",
      numero: item.numero || "-",
      serie: item.serie || "-",
      chave: item.chave_acesso,
      emissao: item.data_emissao,
      mes: mesEmissao,
      valor: Number(item.valor_total || 0),
      icms: Number(item.valor_icms || 0),
      ipi: Number(item.valor_ipi || 0),
      status: item.status_manifestacao,
      processado: item.processado ? "sim" : "nao",
      xml: item.xml_importado ? "sim" : "nao",
    };
  });

  const totalEntradas = rows.reduce((s, r) => s + r.valor, 0);
  const totalIcms = rows.reduce((s, r) => s + r.icms, 0);
  const totalIpi = rows.reduce((s, r) => s + r.ipi, 0);
  const processadas = rows.filter((r) => r.processado === "sim").length;

  // Chart: agregação por mês
  const porMes = new Map<string, number>();
  for (const r of rows) {
    porMes.set(r.mes, (porMes.get(r.mes) || 0) + r.valor);
  }
  const chartData = Array.from(porMes.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, value]) => ({ name, value }));

  return {
    title: "NF-e de Entrada",
    subtitle: "Notas fiscais eletrônicas recebidas (manifestação do destinatário).",
    rows,
    chartData,
    kpis: {
      qtdNfe: rows.length,
      totalEntradas,
      totalIcms,
      totalIpi,
      processadas,
    },
    meta: {
      kind: 'list',
      valueNature: 'monetario',
      timeAxis: { field: 'criacao', label: 'data de emissão', required: false },
      drillDownReady: true,
    },
  };
}

export async function loadComprasFornecedor(filtros: FiltroRelatorio): Promise<RelatorioResultado> {
  const data = await fetchAllPages<Record<string, unknown>>(() => {
    let q = supabase
      .from("compras")
      .select("fornecedor_id, valor_total, fornecedores(nome_razao_social, cpf_cnpj)")
      .eq("ativo", true)
      .order("data_compra", { ascending: false });
    q = withDateRange(q, "data_compra", filtros);
    if (filtros.fornecedorIds?.length) q = q.in('fornecedor_id', filtros.fornecedorIds);
    return q;
  });

  const map = new Map<string, { fornecedorId: string | null; fornecedor: string; cnpj: string; total: number; qtd: number }>();
  for (const c of data as Record<string, unknown>[]) {
    const f = c.fornecedores as { nome_razao_social: string; cpf_cnpj: string | null } | null;
    const nome = f?.nome_razao_social || "Sem fornecedor";
    const key = (c.fornecedor_id as string | null) || nome;
    const existing = map.get(key) || { fornecedorId: (c.fornecedor_id as string | null), fornecedor: nome, cnpj: f?.cpf_cnpj || "-", total: 0, qtd: 0 };
    existing.total += Number(c.valor_total || 0);
    existing.qtd += 1;
    map.set(key, existing);
  }

  const rows = Array.from(map.values()).sort((a, b) => b.total - a.total).map((r, i) => ({
    posicao: i + 1, fornecedorId: r.fornecedorId ?? undefined, fornecedor: r.fornecedor, cnpj: r.cnpj, pedidos: r.qtd, valorTotal: r.total,
    ticketMedio: r.qtd > 0 ? r.total / r.qtd : 0,
  }));

  const totalCompradoCf = rows.reduce((s, r) => s + r.valorTotal, 0);
  const rowsWithParticipacao = addParticipacao(rows, totalCompradoCf);

  const fornecedoresAtivos = rowsWithParticipacao.length;
  const totalPedidosCf = rowsWithParticipacao.reduce((s, r) => s + r.pedidos, 0);
  const ticketMedioGeral = totalPedidosCf > 0 ? totalCompradoCf / totalPedidosCf : 0;
  const top5Concentracao = computeTop5Concentracao(rowsWithParticipacao, totalCompradoCf);

  return {
    title: "Compras por Fornecedor",
    subtitle: "Ranking de fornecedores por volume de compras.",
    rows: rowsWithParticipacao,
    chartData: rowsWithParticipacao.slice(0, 8).map(r => ({ name: r.fornecedor.substring(0, 20), value: r.valorTotal })),
    kpis: { totalComprado: totalCompradoCf, fornecedoresAtivos, ticketMedioGeral, top5Concentracao },
    meta: {
      kind: 'ranking',
      valueNature: 'monetario',
      timeAxis: { field: 'criacao', label: 'data da compra', required: false },
      drillDownReady: true,
    },
  };
}