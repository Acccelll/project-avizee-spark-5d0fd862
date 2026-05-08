import { supabase } from '@/integrations/supabase/client';
import { fromUntyped } from '@/lib/supabase/fromUntyped';
import type { ApresentacaoDataBundle, ApresentacaoModoGeracao, SlideCodigo } from '@/types/apresentacao';
import { APRESENTACAO_SLIDES_MAP } from './slideDefinitions';

/**
 * Apresentação V3 — fetcher reutiliza views vw_workbook_* já existentes
 * em produção + 6 views vw_apresentacao_* específicas (highlights,
 * confronto trimestral, waterfall DRE, lucro top10, social, capital de giro).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;
// Onda 9.2 (A-05) — supabase mantido para storage; queries via fromUntyped.
const sb = { from: (name: string) => fromUntyped(name) };
void supabase;

async function viewByComp(name: string, iniYM: string, fimYM: string) {
  try {
    const { data, error } = await sb.from(name).select('*').gte('competencia', iniYM).lte('competencia', fimYM);
    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}

async function viewAll(name: string) {
  try {
    const { data, error } = await sb.from(name).select('*');
    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}

function monthRange(iniYM: string, fimYM: string): string[] {
  const [iniY, iniM] = iniYM.split('-').map(Number);
  const [fimY, fimM] = fimYM.split('-').map(Number);
  const out: string[] = [];
  let y = iniY;
  let m = iniM;
  while (y < fimY || (y === fimY && m <= fimM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const ALL_SLIDES: SlideCodigo[] = [
  'cover', 'highlights_financeiros', 'faturamento', 'despesas', 'rol_caixa',
  'receita_vs_despesa', 'fopag', 'fluxo_caixa', 'lucro_produto_cliente',
  'variacao_estoque', 'venda_estado', 'redes_sociais', 'bridge_ebitda',
  'bridge_lucro_liquido', 'dre_gerencial', 'capital_giro', 'balanco_gerencial',
  'resultado_financeiro', 'tributos', 'aging_consolidado', 'debt',
  'bancos_detalhado', 'backorder', 'top_clientes', 'top_fornecedores',
  'inadimplencia', 'performance_comercial_canal', 'closing',
];

async function fetchClosedSnapshotData(iniYM: string, fimYM: string, slidesList: SlideCodigo[]) {
  const { data: fechamentoData, error: fechamentoError } = await sb
    .from('fechamentos_mensais')
    .select('id, competencia, status')
    .gte('competencia', `${iniYM}-01`)
    .lte('competencia', `${fimYM}-31`)
    .eq('status', 'fechado');
  if (fechamentoError) throw fechamentoError;
  const fechamentos = (fechamentoData ?? []).map((f: AnyRow) => ({ id: String(f.id), competencia: String(f.competencia).slice(0, 7) }));
  const expected = monthRange(iniYM, fimYM);
  const missing = expected.filter((m) => !fechamentos.some((f: { competencia: string }) => f.competencia === m));
  if (missing.length) throw new Error(`Modo fechado sem cobertura completa: ${missing.join(', ')}`);

  const fechamentoIds = fechamentos.map((f: { id: string }) => f.id);
  const competenciaByFechamentoId = new Map(fechamentos.map((f: { id: string; competencia: string }) => [f.id, f.competencia]));

  const [finRes, caixaRes, estoqueRes, fopagRes] = await Promise.all([
    sb.from('fechamento_financeiro_saldos').select('*').in('fechamento_id', fechamentoIds),
    sb.from('fechamento_caixa_saldos').select('*').in('fechamento_id', fechamentoIds),
    sb.from('fechamento_estoque_saldos').select('*').in('fechamento_id', fechamentoIds),
    sb.from('fechamento_fopag_resumo').select('*').in('fechamento_id', fechamentoIds),
  ]);

  const fin = finRes.data ?? [];
  const caixa = caixaRes.data ?? [];
  const estoque = estoqueRes.data ?? [];
  const fopag = fopagRes.data ?? [];

  const byComp = (rows: AnyRow[]) => {
    const map = new Map<string, AnyRow[]>();
    rows.forEach((row: AnyRow) => {
      const fechamentoId = String(row.fechamento_id ?? '');
      const comp = String(competenciaByFechamentoId.get(fechamentoId) ?? '');
      if (!comp) return;
      if (!map.has(comp)) map.set(comp, []);
      map.get(comp)!.push(row);
    });
    return map;
  };

  const finMap = byComp(fin);
  const caixaMap = byComp(caixa);
  const estoqueMap = byComp(estoque);
  const fopagMap = byComp(fopag);
  const selectedComp = fimYM;
  const slides = {} as Record<SlideCodigo, Record<string, unknown>>;

  for (const codigo of slidesList) {
    if (codigo === 'cover' || codigo === 'closing') {
      slides[codigo] = { competencia: selectedComp, indisponivel: false };
      continue;
    }
    if (['rol_caixa', 'fluxo_caixa', 'bancos_detalhado'].includes(codigo)) {
      const rows = caixaMap.get(selectedComp) ?? [];
      if (!rows.length) { slides[codigo] = { indisponivel: true, motivo: 'snapshot caixa indisponível' }; continue; }
      const total = rows.reduce((acc, r: AnyRow) => acc + Number(r.saldo_final ?? 0), 0);
      slides[codigo] = { competencia: selectedComp, valor_atual: total };
      continue;
    }
    if (codigo === 'variacao_estoque') {
      const rows = estoqueMap.get(selectedComp) ?? [];
      if (!rows.length) { slides[codigo] = { indisponivel: true, motivo: 'snapshot estoque indisponível' }; continue; }
      slides[codigo] = { competencia: selectedComp, valor_atual: rows.reduce((a, r: AnyRow) => a + Number(r.valor_total ?? 0), 0), quantidade_itens: rows.length };
      continue;
    }
    if (codigo === 'fopag') {
      const rows = fopagMap.get(selectedComp) ?? [];
      if (!rows.length) { slides[codigo] = { indisponivel: true, motivo: 'snapshot fopag indisponível' }; continue; }
      slides[codigo] = { competencia: selectedComp, valor_atual: rows.reduce((a, r: AnyRow) => a + Number(r.valor_liquido ?? 0), 0), funcionarios: rows.length };
      continue;
    }
    if (codigo === 'aging_consolidado' || codigo === 'capital_giro') {
      const rows = finMap.get(selectedComp) ?? [];
      if (!rows.length) { slides[codigo] = { indisponivel: true, motivo: 'snapshot financeiro indisponível' }; continue; }
      const cr = rows.filter((r: AnyRow) => r.tipo === 'receber').reduce((a, r: AnyRow) => a + Number(r.saldo_aberto ?? 0), 0);
      const cp = rows.filter((r: AnyRow) => r.tipo === 'pagar').reduce((a, r: AnyRow) => a + Number(r.saldo_aberto ?? 0), 0);
      slides[codigo] = codigo === 'capital_giro'
        ? { contas_receber: cr, contas_pagar: cp, valor_atual: cr - cp }
        : { cr_aberto: cr, cp_aberto: cp, valor_atual: cr + cp };
      continue;
    }
    slides[codigo] = { indisponivel: true, motivo: 'não automatizado no modo fechado' };
  }
  return slides;
}

async function buildDynamicSlides(iniYM: string, fimYM: string, slidesList: SlideCodigo[]) {
  const slides = {} as Record<SlideCodigo, Record<string, unknown>>;
  const yearStart = `${iniYM.slice(0, 4)}-01`;
  const yearEnd = `${fimYM.slice(0, 4)}-12`;

  const [
    highlights, faturamento, despesa, dreMensal, caixaEvol, bancos,
    estoquePos, vendasRegiao, vendasABC, vendasVendedor, funil,
    fornecedores, fiscal, confronto, waterfall, lucroTop, social, capitalGiro,
  ] = await Promise.all([
    viewByComp('vw_apresentacao_highlights', yearStart, yearEnd),
    viewByComp('vw_workbook_faturamento_mensal', yearStart, yearEnd),
    viewByComp('vw_workbook_despesa_mensal', yearStart, yearEnd),
    viewByComp('vw_workbook_dre_mensal', iniYM, fimYM),
    viewByComp('vw_workbook_caixa_evolutivo', iniYM, fimYM),
    viewAll('vw_workbook_bancos_saldo'),
    viewAll('vw_workbook_estoque_posicao'),
    viewByComp('vw_workbook_vendas_regiao', iniYM, fimYM),
    viewAll('vw_workbook_vendas_cliente_abc'),
    viewByComp('vw_workbook_vendas_vendedor', iniYM, fimYM),
    viewByComp('vw_workbook_orcamentos_funil', iniYM, fimYM),
    viewByComp('vw_workbook_compras_fornecedor', iniYM, fimYM),
    viewByComp('vw_workbook_fiscal_resumo', iniYM, fimYM),
    viewAll('vw_apresentacao_confronto_trimestral'),
    viewByComp('vw_apresentacao_dre_waterfall', iniYM, fimYM),
    viewAll('vw_apresentacao_lucro_top10'),
    viewByComp('vw_apresentacao_social_evolucao', iniYM, fimYM),
    viewByComp('vw_apresentacao_capital_giro', iniYM, fimYM),
  ]);

  // FOPAG: agrega snapshots por competência (formato YYYY-MM-DD)
  let fopagAgg: Array<{ competencia: string; valor_liquido_total: number; headcount: number }> = [];
  try {
    const { data: fopagRows } = await sb.from('fechamento_fopag_resumo').select('competencia, valor_liquido')
      .gte('competencia', `${iniYM}-01`).lte('competencia', `${fimYM}-31`);
    const map = new Map<string, { total: number; count: number }>();
    (fopagRows ?? []).forEach((r: AnyRow) => {
      const ym = String(r.competencia).slice(0, 7);
      const cur = map.get(ym) ?? { total: 0, count: 0 };
      cur.total += Number(r.valor_liquido || 0);
      cur.count += 1;
      map.set(ym, cur);
    });
    fopagAgg = Array.from(map.entries()).map(([k, v]) => ({ competencia: k, valor_liquido_total: v.total, headcount: v.count }));
  } catch { /* segue */ }

  // Aging — totais (filtro de saldo > 0 aplicado em memória para resiliência)
  const safeAging = async (table: string): Promise<AnyRow[]> => {
    try {
      const { data } = await sb.from(table).select('saldo_aberto, data_vencimento');
      return (data ?? []).filter((r: AnyRow) => Number(r.saldo_aberto || 0) > 0);
    } catch {
      return [];
    }
  };
  const [agingCRRes, agingCPRes] = await Promise.all([safeAging('vw_workbook_aging_cr'), safeAging('vw_workbook_aging_cp')]);
  const totalCR = agingCRRes.reduce((a: number, r: AnyRow) => a + Number(r.saldo_aberto || 0), 0);
  const totalCP = agingCPRes.reduce((a: number, r: AnyRow) => a + Number(r.saldo_aberto || 0), 0);
  const today = new Date();
  const atrasoCR = agingCRRes.filter((r: AnyRow) => new Date(r.data_vencimento) < today).reduce((a: number, r: AnyRow) => a + Number(r.saldo_aberto || 0), 0);

  const lastHL = highlights[highlights.length - 1];
  const prevHL = highlights[highlights.length - 2];
  const lastFat = faturamento.find((f: AnyRow) => f.competencia === fimYM) ?? faturamento[faturamento.length - 1];
  const prevFat = faturamento.find((f: AnyRow) => f.competencia === iniYM);
  const lastDesp = despesa.find((d: AnyRow) => d.competencia === fimYM) ?? despesa[despesa.length - 1];
  const prevDesp = despesa.find((d: AnyRow) => d.competencia === iniYM);
  const lastDRE = dreMensal[dreMensal.length - 1];
  const lastFopag = fopagAgg[fopagAgg.length - 1];
  const lastFiscal = fiscal[fiscal.length - 1];
  const lastCG = capitalGiro[capitalGiro.length - 1];
  const lastFunil = funil[funil.length - 1];

  const builders: Partial<Record<SlideCodigo, () => Record<string, unknown>>> = {
    cover: () => ({ competencia: fimYM }),
    closing: () => ({ competencia: fimYM, total_slides: slidesList.length }),

    highlights_financeiros: () => lastHL ? {
      faturamento: Number(lastHL.faturamento || 0),
      despesa: Number(lastHL.despesa || 0),
      resultado: Number(lastHL.resultado || 0),
      caixa: Number(lastHL.caixa_total || 0),
      rol: Number(lastHL.rol || 0),
      backorder: Number(lastHL.backorder_valor || 0),
      valor_atual: Number(lastHL.resultado || 0),
      valor_anterior: prevHL ? Number(prevHL.resultado || 0) : 0,
    } : { indisponivel: true, motivo: 'sem dados de highlights no período' },

    faturamento: () => lastFat ? {
      serie: faturamento.map((f: AnyRow) => ({ competencia: f.competencia, valor: Number(f.total_faturado) })),
      valor_atual: Number(lastFat.total_faturado || 0),
      valor_anterior: prevFat ? Number(prevFat.total_faturado || 0) : 0,
      quantidade_nfs: Number(lastFat.quantidade_nfs || 0),
    } : { indisponivel: true, motivo: 'sem faturamento no período' },

    despesas: () => lastDesp ? {
      serie: despesa.map((d: AnyRow) => ({ competencia: d.competencia, valor: Number(d.total_despesa) })),
      valor_atual: Number(lastDesp.total_despesa || 0),
      valor_anterior: prevDesp ? Number(prevDesp.total_despesa || 0) : 0,
      total_pago: Number(lastDesp.total_pago || 0),
    } : { indisponivel: true, motivo: 'sem despesa no período' },

    rol_caixa: () => lastDRE ? {
      rol: Number(lastDRE.receita_liquida || 0),
      caixa_total: Number(lastHL?.caixa_total || 0),
      valor_atual: Number(lastHL?.caixa_total || 0),
      cobertura_pct: Number(lastDRE.receita_liquida) > 0 ? (Number(lastHL?.caixa_total || 0) / Number(lastDRE.receita_liquida)) * 100 : 0,
    } : { indisponivel: true, motivo: 'sem DRE no período' },

    receita_vs_despesa: () => ({
      serie: faturamento.map((f: AnyRow) => {
        const d = despesa.find((x: AnyRow) => x.competencia === f.competencia);
        return { competencia: f.competencia, receita: Number(f.total_faturado || 0), despesa: Number(d?.total_despesa || 0) };
      }),
      valor_atual: Number(lastFat?.total_faturado || 0) - Number(lastDesp?.total_despesa || 0),
      confronto_trimestral: confronto,
    }),

    fopag: () => lastFopag ? {
      valor_atual: lastFopag.valor_liquido_total,
      headcount: lastFopag.headcount,
      serie: fopagAgg,
    } : { indisponivel: true, motivo: 'sem snapshot FOPAG no período' },

    fluxo_caixa: () => caixaEvol.length ? {
      serie: caixaEvol.map((c: AnyRow) => ({ competencia: c.competencia, saldo: Number(c.saldo_final), variacao: Number(c.variacao_mes) })),
      valor_atual: Number(caixaEvol[caixaEvol.length - 1].saldo_final),
    } : { indisponivel: true, motivo: 'sem evolução de caixa' },

    bancos_detalhado: () => bancos.length ? {
      contas: bancos.slice(0, 10),
      valor_atual: bancos.reduce((a: number, b: AnyRow) => a + Number(b.saldo_atual || 0), 0),
    } : { indisponivel: true, motivo: 'sem saldos bancários' },

    lucro_produto_cliente: () => lucroTop.length ? {
      top_produtos: lucroTop.filter((r: AnyRow) => r.dimensao === 'produto').slice(0, 10),
      top_clientes: lucroTop.filter((r: AnyRow) => r.dimensao === 'cliente').slice(0, 10),
    } : { indisponivel: true, motivo: 'sem ranking de lucro' },

    variacao_estoque: () => estoquePos.length ? {
      valor_atual: estoquePos.reduce((a: number, r: AnyRow) => a + Number(r.valor_total || 0), 0),
      quantidade_itens: estoquePos.length,
    } : { indisponivel: true, motivo: 'sem posição de estoque' },

    venda_estado: () => vendasRegiao.length ? {
      ranking: [...vendasRegiao].sort((a: AnyRow, b: AnyRow) => Number(b.faturamento) - Number(a.faturamento)).slice(0, 10),
      valor_atual: vendasRegiao.reduce((a: number, r: AnyRow) => a + Number(r.faturamento || 0), 0),
    } : { indisponivel: true, motivo: 'sem vendas por região' },

    redes_sociais: () => social.length ? {
      serie: social,
      total_seguidores: social.reduce((a: number, r: AnyRow) => a + Number(r.seguidores || 0), 0),
      valor_atual: social.reduce((a: number, r: AnyRow) => a + Number(r.seguidores || 0), 0),
    } : { indisponivel: true, motivo: 'sem métricas sociais' },

    bridge_ebitda: () => waterfall.length ? { steps: waterfall, valor_atual: Number(lastDRE?.ebitda || 0) } : { indisponivel: true, motivo: 'sem DRE para waterfall' },
    bridge_lucro_liquido: () => waterfall.length ? { steps: waterfall, valor_atual: Number(lastDRE?.ebitda || 0) } : { indisponivel: true, motivo: 'sem DRE' },

    dre_gerencial: () => lastDRE ? {
      receita_bruta: Number(lastDRE.receita_bruta || 0),
      deducoes: Number(lastDRE.deducoes || 0),
      receita_liquida: Number(lastDRE.receita_liquida || 0),
      fopag: Number(lastDRE.fopag || 0),
      despesa_operacional: Number(lastDRE.despesa_operacional || 0),
      ebitda: Number(lastDRE.ebitda || 0),
      valor_atual: Number(lastDRE.ebitda || 0),
    } : { indisponivel: true, motivo: 'sem DRE no período' },

    capital_giro: () => lastCG ? {
      contas_receber: Number(lastCG.cr_aberto || 0),
      contas_pagar: Number(lastCG.cp_aberto || 0),
      valor_atual: Number(lastCG.capital_giro_liquido || 0),
    } : { indisponivel: true, motivo: 'sem aging para capital de giro' },

    balanco_gerencial: () => ({ indisponivel: true, motivo: 'balanço gerencial requer plano de contas — fase 2' }),

    resultado_financeiro: () => lastDRE ? { valor_atual: Number(lastDRE.ebitda || 0) } : { indisponivel: true, motivo: 'sem DRE' },

    tributos: () => lastFiscal ? {
      icms: Number(lastFiscal.icms || 0),
      pis: Number(lastFiscal.pis || 0),
      cofins: Number(lastFiscal.cofins || 0),
      ipi: Number(lastFiscal.ipi || 0),
      valor_atual: Number(lastFiscal.icms || 0) + Number(lastFiscal.pis || 0) + Number(lastFiscal.cofins || 0) + Number(lastFiscal.ipi || 0),
    } : { indisponivel: true, motivo: 'sem resumo fiscal no período' },

    aging_consolidado: () => (totalCR + totalCP) > 0 ? {
      cr_aberto: totalCR, cp_aberto: totalCP, valor_atual: totalCR + totalCP,
    } : { indisponivel: true, motivo: 'sem aging em aberto' },

    debt: () => ({ indisponivel: true, motivo: 'requer cadastro de empréstimos — fase 2' }),

    backorder: () => lastHL ? {
      qtd_pedidos_pendentes: Number(lastHL.backorder_pedidos || 0),
      valor_backorder: Number(lastHL.backorder_valor || 0),
      valor_atual: Number(lastHL.backorder_valor || 0),
    } : { indisponivel: true, motivo: 'sem dados de carteira' },

    top_clientes: () => vendasABC.length ? {
      ranking: vendasABC.slice(0, 10),
      cliente_lider: vendasABC[0]?.cliente_nome,
      valor_lider: Number(vendasABC[0]?.faturamento || 0),
      valor_atual: Number(vendasABC[0]?.faturamento || 0),
    } : { indisponivel: true, motivo: 'sem ranking ABC' },

    top_fornecedores: () => fornecedores.length ? {
      ranking: fornecedores.slice(0, 10),
      fornecedor_lider: fornecedores[0]?.fornecedor_nome,
      valor_lider: Number(fornecedores[0]?.gasto_total || 0),
      valor_atual: Number(fornecedores[0]?.gasto_total || 0),
    } : { indisponivel: true, motivo: 'sem ranking de fornecedores' },

    inadimplencia: () => totalCR > 0 ? {
      valor_inadimplente: atrasoCR,
      pct_inadimplencia: (atrasoCR / totalCR) * 100,
      total_cr: totalCR,
      valor_atual: atrasoCR,
    } : { indisponivel: true, motivo: 'sem CR aberto' },

    performance_comercial_canal: () => vendasVendedor.length ? {
      ranking: vendasVendedor.slice(0, 10),
      vendedor_lider: vendasVendedor[0]?.vendedor_nome,
      valor_atual: vendasVendedor.reduce((a: number, r: AnyRow) => a + Number(r.faturamento || 0), 0),
      funil_aprovados: lastFunil ? Number(lastFunil.aprovados || 0) : 0,
      funil_total: lastFunil ? Number(lastFunil.total || 0) : 0,
    } : { indisponivel: true, motivo: 'sem performance por vendedor' },
  };

  for (const codigo of slidesList) {
    const builder = builders[codigo];
    slides[codigo] = builder ? builder() : { indisponivel: true, motivo: 'slide não mapeado' };
  }

  return slides;
}

export async function fetchPresentationData(
  competenciaInicial: string,
  competenciaFinal: string,
  modoGeracao: ApresentacaoModoGeracao,
  requestedSlides?: SlideCodigo[],
  signal?: AbortSignal,
): Promise<ApresentacaoDataBundle> {
  signal?.throwIfAborted?.();
  const iniYM = competenciaInicial.slice(0, 7);
  const fimYM = competenciaFinal.slice(0, 7);
  const slidesList = requestedSlides?.length ? requestedSlides : ALL_SLIDES;

  const slides = modoGeracao === 'fechado'
    ? await fetchClosedSnapshotData(iniYM, fimYM, slidesList)
    : await buildDynamicSlides(iniYM, fimYM, slidesList);
  signal?.throwIfAborted?.();

  const missingCritical: SlideCodigo[] = [];
  for (const codigo of slidesList) {
    const def = APRESENTACAO_SLIDES_MAP.get(codigo);
    const row = slides[codigo] ?? { indisponivel: true };
    if (modoGeracao === 'fechado' && def?.criticalInClosedMode && row.indisponivel) {
      missingCritical.push(codigo);
    }
  }

  if (modoGeracao === 'fechado' && missingCritical.length) {
    throw new Error(`Modo fechado sem snapshots/visões críticas para: ${missingCritical.join(', ')}`);
  }

  return {
    periodo: { competenciaInicial: iniYM, competenciaFinal: fimYM },
    slides,
    missingCritical,
  };
}
