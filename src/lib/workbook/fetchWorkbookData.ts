/**
 * Fetches all data needed for workbook generation.
 * Uses vw_workbook_* views when available, falls back to direct queries.
 * Supports both dynamic (live) and closed (snapshot) modes.
 */
import { supabase } from '@/integrations/supabase/client';
import type { WorkbookModoGeracao } from '@/types/workbook';
import { fetchFolhaPagamentoRange, fetchEmpresaConfigBrand } from '@/services/workbook';

/**
 * As views `vw_workbook_*` ainda não estão refletidas em
 * `Database['public']['Views']`. Em vez de espalhar `(supabase as any)` em
 * cada chamada, encapsulamos o cast em um único helper tipado que devolve o
 * builder do supabase-js. Os rows continuam sendo normalizados via
 * `Record<string, unknown>` nos mapeadores abaixo, mantendo runtime safety.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (name: string) => any };

export interface WorkbookRawData {
  receita: Array<{ competencia: string; total_receita: number; total_recebido: number; quantidade: number }>;
  despesa: Array<{ competencia: string; total_despesa: number; total_pago: number; quantidade: number }>;
  faturamento: Array<{ competencia: string; total_faturado: number; quantidade_nfs: number }>;
  fopag: Array<{ competencia: string; funcionario_nome: string; salario_base: number; proventos: number; descontos: number; valor_liquido: number }>;
  caixa: Array<{ conta_descricao: string; banco_nome: string; agencia: string; conta: string; saldo_atual: number }>;
  estoque: Array<{ produto_nome: string; sku: string; grupo_nome: string; quantidade: number; custo_unitario: number; valor_total: number }>;
  agingCR: Array<{ id: string; data_vencimento: string; valor: number; valor_pago: number; saldo_aberto: number; status: string; cliente_id: string; descricao: string }>;
  agingCP: Array<{ id: string; data_vencimento: string; valor: number; valor_pago: number; saldo_aberto: number; status: string; fornecedor_id: string; descricao: string }>;
  // V2 — analytical extensions
  dre: Array<{ competencia: string; receita_bruta: number; deducoes: number; receita_liquida: number; fopag: number; despesa_operacional: number; ebitda: number }>;
  caixaEvolutivo: Array<{ competencia: string; conta_descricao: string; saldo_inicial: number; saldo_final: number; variacao_mes: number }>;
  vendasVendedor: Array<{ competencia: string; vendedor_nome: string; qtd_pedidos: number; faturamento: number; ticket_medio: number }>;
  vendasClienteAbc: Array<{ cliente_nome: string; faturamento: number; qtd_nfs: number; participacao: number; participacao_acum: number; curva_abc: string }>;
  vendasRegiao: Array<{ competencia: string; uf: string; qtd_nfs: number; faturamento: number }>;
  orcamentosFunil: Array<{ competencia: string; abertos: number; aprovados: number; perdidos: number; total: number; valor_aprovado: number; valor_total: number }>;
  comprasFornecedor: Array<{ competencia: string; fornecedor_nome: string; qtd_pedidos: number; gasto_total: number; lead_time_medio_dias: number }>;
  estoqueGiro: Array<{ codigo: string; nome: string; grupo_nome: string; estoque_atual: number; saidas_90d: number; cobertura_dias: number; giro_90d: number; valor_estoque: number }>;
  estoqueCritico: Array<{ codigo: string; nome: string; grupo_nome: string; estoque_atual: number; estoque_minimo: number; deficit: number; preco_custo: number; valor_reposicao: number }>;
  logistica: Array<{ competencia: string; qtd_remessas: number; entregues_no_prazo: number; entregues_atraso: number; devolucoes: number; frete_total: number }>;
  fiscal: Array<{ competencia: string; tipo: string; qtd_confirmadas: number; qtd_canceladas: number; qtd_rascunho: number; valor_confirmado: number; icms: number; pis: number; cofins: number; ipi: number }>;
  budget: Array<{ competencia: string; categoria: string; centro_custo_id: string | null; valor: number }>;
  empresa: { razao_social: string; nome_fantasia: string; cnpj: string; logo_url: string | null } | null;
}

export async function fetchWorkbookData(
  competenciaInicial: string,
  competenciaFinal: string,
  modoGeracao: WorkbookModoGeracao,
  signal?: AbortSignal,
): Promise<WorkbookRawData> {
  signal?.throwIfAborted?.();
  if (modoGeracao === 'fechado') {
    const r = await fetchClosedModeData(competenciaInicial, competenciaFinal);
    signal?.throwIfAborted?.();
    return r;
  }
  const r = await fetchDynamicModeData(competenciaInicial, competenciaFinal);
  signal?.throwIfAborted?.();
  return r;
}

async function fetchDynamicModeData(compIni: string, compFim: string): Promise<WorkbookRawData> {
  // Normalize competencia range (YYYY-MM)
  const iniYM = compIni.slice(0, 7);
  const fimYM = compFim.slice(0, 7);
  // Compute prior-year range for PY comparison
  const [yi, mi] = iniYM.split('-').map(Number);
  const [yf, mf] = fimYM.split('-').map(Number);
  const pyIniYM = `${yi - 1}-${String(mi).padStart(2, '0')}`;
  const pyFimYM = `${yf - 1}-${String(mf).padStart(2, '0')}`;
  const fullIniYM = pyIniYM; // fetch from PY start so comparators have data

  // Use views for aggregated data
  const [
    receitaRes, despesaRes, fatRes, caixaRes, estoqueRes, agingCRRes, agingCPRes, fopagRes,
    dreRes, caixaEvoRes, vendVendRes, vendAbcRes, vendRegRes, orcFunilRes,
    comprasForRes, estGiroRes, estCritRes, logRes, fiscalRes, budgetRes, empresaRes,
  ] = await Promise.all([
        sb.from('vw_workbook_receita_mensal').select('*').gte('competencia', fullIniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_despesa_mensal').select('*').gte('competencia', fullIniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_faturamento_mensal').select('*').gte('competencia', fullIniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_bancos_saldo').select('*'),
        sb.from('vw_workbook_estoque_posicao').select('*'),
        sb.from('vw_workbook_aging_cr').select('*'),
        sb.from('vw_workbook_aging_cp').select('*'),
    fetchFolhaPagamentoRange(iniYM, fimYM).then((data) => ({ data, error: null as null })),
    // V2 ──────────────────────────────────────────────
        sb.from('vw_workbook_dre_mensal').select('*').gte('competencia', fullIniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_caixa_evolutivo').select('*').gte('competencia', fullIniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_vendas_vendedor').select('*').gte('competencia', iniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_vendas_cliente_abc').select('*').limit(50),
        sb.from('vw_workbook_vendas_regiao').select('*').gte('competencia', iniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_orcamentos_funil').select('*').gte('competencia', iniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_compras_fornecedor').select('*').gte('competencia', iniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_estoque_giro').select('*').order('valor_estoque', { ascending: false }).limit(100),
        sb.from('vw_workbook_estoque_critico').select('*').order('deficit', { ascending: false }).limit(100),
        sb.from('vw_workbook_logistica_resumo').select('*').gte('competencia', iniYM).lte('competencia', fimYM),
        sb.from('vw_workbook_fiscal_resumo').select('*').gte('competencia', iniYM).lte('competencia', fimYM),
        sb.from('budgets_mensais').select('competencia, categoria, centro_custo_id, valor').gte('competencia', `${iniYM}-01`).lte('competencia', `${fimYM}-31`),
    fetchEmpresaConfigBrand().then((data) => ({ data, error: null as null })),
  ]);

  const receita = (receitaRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: r.competencia,
    total_receita: Number(r.total_receita ?? 0),
    total_recebido: Number(r.total_recebido ?? 0),
    quantidade: Number(r.quantidade ?? 0),
  }));

  const despesa = (despesaRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: r.competencia,
    total_despesa: Number(r.total_despesa ?? 0),
    total_pago: Number(r.total_pago ?? 0),
    quantidade: Number(r.quantidade ?? 0),
  }));

  const faturamento = (fatRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: r.competencia,
    total_faturado: Number(r.total_faturado ?? 0),
    quantidade_nfs: Number(r.quantidade_nfs ?? 0),
  }));

  const fopag = ((fopagRes.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    competencia: String(r.competencia ?? '').slice(0, 7), // normalize 2026-02-01 -> 2026-02
    funcionario_nome: String((r.funcionarios as Record<string, unknown>)?.nome ?? 'Sem Nome'),
    salario_base: Number(r.salario_base ?? 0),
    proventos: Number(r.proventos ?? 0),
    descontos: Number(r.descontos ?? 0),
    valor_liquido: Number(r.valor_liquido ?? 0),
  }));

  const caixa = (caixaRes.data ?? []).map((r: Record<string, unknown>) => ({
    conta_descricao: String(r.descricao ?? ''),
    banco_nome: String(r.banco_nome ?? ''),
    agencia: String(r.agencia ?? ''),
    conta: String(r.conta ?? ''),
    saldo_atual: Number(r.saldo_atual ?? 0),
  }));

  const estoque = (estoqueRes.data ?? []).map((r: Record<string, unknown>) => ({
    produto_nome: String(r.nome ?? ''),
    sku: String(r.sku ?? ''),
    grupo_nome: String(r.grupo_nome ?? ''),
    quantidade: Number(r.quantidade ?? 0),
    custo_unitario: Number(r.custo_unitario ?? 0),
    valor_total: Number(r.valor_total ?? 0),
  }));

  const agingCR = (agingCRRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ''),
    data_vencimento: String(r.data_vencimento ?? ''),
    valor: Number(r.valor ?? 0),
    valor_pago: Number(r.valor_pago ?? 0),
    saldo_aberto: Number(r.saldo_aberto ?? 0),
    status: String(r.status ?? ''),
    cliente_id: String(r.cliente_id ?? ''),
    descricao: String(r.descricao ?? ''),
  }));

  const agingCP = (agingCPRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ''),
    data_vencimento: String(r.data_vencimento ?? ''),
    valor: Number(r.valor ?? 0),
    valor_pago: Number(r.valor_pago ?? 0),
    saldo_aberto: Number(r.saldo_aberto ?? 0),
    status: String(r.status ?? ''),
    fornecedor_id: String(r.fornecedor_id ?? ''),
    descricao: String(r.descricao ?? ''),
  }));

  // V2 mappers
  const numField = <T extends Record<string, unknown>>(r: T, k: string) => Number(r[k] ?? 0);
  const strField = <T extends Record<string, unknown>>(r: T, k: string) => String(r[k] ?? '');

  const dre = (dreRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia'), receita_bruta: numField(r, 'receita_bruta'), deducoes: numField(r, 'deducoes'),
    receita_liquida: numField(r, 'receita_liquida'), fopag: numField(r, 'fopag'),
    despesa_operacional: numField(r, 'despesa_operacional'), ebitda: numField(r, 'ebitda'),
  }));
  const caixaEvolutivo = (caixaEvoRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia'), conta_descricao: strField(r, 'conta_descricao'),
    saldo_inicial: numField(r, 'saldo_inicial'), saldo_final: numField(r, 'saldo_final'),
    variacao_mes: numField(r, 'variacao_mes'),
  }));
  const vendasVendedor = (vendVendRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia'), vendedor_nome: strField(r, 'vendedor_nome'),
    qtd_pedidos: numField(r, 'qtd_pedidos'), faturamento: numField(r, 'faturamento'), ticket_medio: numField(r, 'ticket_medio'),
  }));
  const vendasClienteAbc = (vendAbcRes.data ?? []).map((r: Record<string, unknown>) => ({
    cliente_nome: strField(r, 'cliente_nome'), faturamento: numField(r, 'faturamento'), qtd_nfs: numField(r, 'qtd_nfs'),
    participacao: numField(r, 'participacao'), participacao_acum: numField(r, 'participacao_acum'), curva_abc: strField(r, 'curva_abc'),
  }));
  const vendasRegiao = (vendRegRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia'), uf: strField(r, 'uf'), qtd_nfs: numField(r, 'qtd_nfs'), faturamento: numField(r, 'faturamento'),
  }));
  const orcamentosFunil = (orcFunilRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia'), abertos: numField(r, 'abertos'), aprovados: numField(r, 'aprovados'),
    perdidos: numField(r, 'perdidos'), total: numField(r, 'total'), valor_aprovado: numField(r, 'valor_aprovado'), valor_total: numField(r, 'valor_total'),
  }));
  const comprasFornecedor = (comprasForRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia'), fornecedor_nome: strField(r, 'fornecedor_nome'),
    qtd_pedidos: numField(r, 'qtd_pedidos'), gasto_total: numField(r, 'gasto_total'),
    lead_time_medio_dias: numField(r, 'lead_time_medio_dias'),
  }));
  const estoqueGiro = (estGiroRes.data ?? []).map((r: Record<string, unknown>) => ({
    codigo: strField(r, 'codigo'), nome: strField(r, 'nome'), grupo_nome: strField(r, 'grupo_nome'),
    estoque_atual: numField(r, 'estoque_atual'), saidas_90d: numField(r, 'saidas_90d'),
    cobertura_dias: numField(r, 'cobertura_dias'), giro_90d: numField(r, 'giro_90d'), valor_estoque: numField(r, 'valor_estoque'),
  }));
  const estoqueCritico = (estCritRes.data ?? []).map((r: Record<string, unknown>) => ({
    codigo: strField(r, 'codigo'), nome: strField(r, 'nome'), grupo_nome: strField(r, 'grupo_nome'),
    estoque_atual: numField(r, 'estoque_atual'), estoque_minimo: numField(r, 'estoque_minimo'),
    deficit: numField(r, 'deficit'), preco_custo: numField(r, 'preco_custo'), valor_reposicao: numField(r, 'valor_reposicao'),
  }));
  const logistica = (logRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia'), qtd_remessas: numField(r, 'qtd_remessas'),
    entregues_no_prazo: numField(r, 'entregues_no_prazo'), entregues_atraso: numField(r, 'entregues_atraso'),
    devolucoes: numField(r, 'devolucoes'), frete_total: numField(r, 'frete_total'),
  }));
  const fiscal = (fiscalRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia'), tipo: strField(r, 'tipo'),
    qtd_confirmadas: numField(r, 'qtd_confirmadas'), qtd_canceladas: numField(r, 'qtd_canceladas'),
    qtd_rascunho: numField(r, 'qtd_rascunho'), valor_confirmado: numField(r, 'valor_confirmado'),
    icms: numField(r, 'icms'), pis: numField(r, 'pis'), cofins: numField(r, 'cofins'), ipi: numField(r, 'ipi'),
  }));
  const budget = (budgetRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: strField(r, 'competencia').slice(0, 7),
    categoria: strField(r, 'categoria'),
    centro_custo_id: r.centro_custo_id ? String(r.centro_custo_id) : null,
    valor: numField(r, 'valor'),
  }));
  const empresaData = empresaRes.data as unknown as Record<string, unknown> | null;
  const empresa = empresaData
    ? {
        razao_social: String(empresaData.razao_social ?? ''),
        nome_fantasia: String(empresaData.nome_fantasia ?? ''),
        cnpj: String(empresaData.cnpj ?? ''),
        logo_url: empresaData.logo_url ? String(empresaData.logo_url) : null,
      }
    : null;

  return {
    receita, despesa, faturamento, fopag, caixa, estoque, agingCR, agingCP,
    dre, caixaEvolutivo, vendasVendedor, vendasClienteAbc, vendasRegiao, orcamentosFunil,
    comprasFornecedor, estoqueGiro, estoqueCritico, logistica, fiscal, budget, empresa,
  };
}

async function fetchClosedModeData(compIni: string, compFim: string): Promise<WorkbookRawData> {
  const iniYM = compIni.slice(0, 7);
  const fimYM = compFim.slice(0, 7);

  // Validate that fechamentos exist for the period
  const { data: fechamentos } = await sb
    .from('fechamentos_mensais')
    .select('id, competencia, status')
    .gte('competencia', iniYM)
    .lte('competencia', fimYM)
    .eq('status', 'fechado');

  if (!fechamentos || fechamentos.length === 0) {
    throw new Error(
      `Modo fechado requer fechamentos mensais concluídos para o período ${iniYM} a ${fimYM}. ` +
      `Nenhum fechamento encontrado. Use o modo dinâmico ou realize o fechamento do período.`
    );
  }

  const fechamentoIds = fechamentos.map((f: Record<string, unknown>) => f.id);

  // Fetch from snapshot tables
  const [finRes, caixaRes, estoqueRes, fopagRes] = await Promise.all([
        sb.from('fechamento_financeiro_saldos').select('*').in('fechamento_id', fechamentoIds),
        sb.from('fechamento_caixa_saldos').select('*, contas_bancarias(descricao, agencia, conta, bancos(nome))').in('fechamento_id', fechamentoIds),
        sb.from('fechamento_estoque_saldos').select('*, produtos(nome, sku, grupo_id, grupos_produto(nome))').in('fechamento_id', fechamentoIds),
        sb.from('fechamento_fopag_resumo').select('*, funcionarios(nome)').in('fechamento_id', fechamentoIds),
  ]);

  // Build receita/despesa from snapshot financeiro
  const finData = (finRes.data ?? []) as Record<string, unknown>[];
  const receitaMap: Record<string, { total: number; qty: number }> = {};
  const despesaMap: Record<string, { total: number; qty: number }> = {};

  for (const row of finData) {
    const comp = String(row.competencia ?? '').slice(0, 7);
    if (row.tipo === 'receber') {
      if (!receitaMap[comp]) receitaMap[comp] = { total: 0, qty: 0 };
      receitaMap[comp].total += Number(row.saldo_total ?? 0);
      receitaMap[comp].qty += Number(row.quantidade ?? 0);
    } else {
      if (!despesaMap[comp]) despesaMap[comp] = { total: 0, qty: 0 };
      despesaMap[comp].total += Number(row.saldo_total ?? 0);
      despesaMap[comp].qty += Number(row.quantidade ?? 0);
    }
  }

  const receita = Object.entries(receitaMap).map(([comp, v]) => ({
    competencia: comp, total_receita: v.total, total_recebido: 0, quantidade: v.qty,
  }));
  const despesa = Object.entries(despesaMap).map(([comp, v]) => ({
    competencia: comp, total_despesa: v.total, total_pago: 0, quantidade: v.qty,
  }));

  // Faturamento - not available in snapshot, return empty
  const faturamento: WorkbookRawData['faturamento'] = [];

  const fopag = (fopagRes.data ?? []).map((r: Record<string, unknown>) => ({
    competencia: String(r.competencia ?? '').slice(0, 7),
    funcionario_nome: String((r.funcionarios as Record<string, unknown>)?.nome ?? 'Sem Nome'),
    salario_base: Number(r.salario_base ?? 0),
    proventos: Number(r.proventos ?? 0),
    descontos: Number(r.descontos ?? 0),
    valor_liquido: Number(r.valor_liquido ?? 0),
  }));

  const caixa = (caixaRes.data ?? []).map((r: Record<string, unknown>) => {
    const cb = r.contas_bancarias as Record<string, unknown> | null;
    const bancos = cb?.bancos as Record<string, unknown> | null;
    return {
      conta_descricao: String(cb?.descricao ?? ''),
      banco_nome: String(bancos?.nome ?? ''),
      agencia: String(cb?.agencia ?? ''),
      conta: String(cb?.conta ?? ''),
      saldo_atual: Number(r.saldo ?? 0),
    };
  });

  const estoque = (estoqueRes.data ?? []).map((r: Record<string, unknown>) => {
    const p = r.produtos as Record<string, unknown> | null;
    const gp = p?.grupos_produto as Record<string, unknown> | null;
    return {
      produto_nome: String(p?.nome ?? ''),
      sku: String(p?.sku ?? ''),
      grupo_nome: String(gp?.nome ?? 'Sem Grupo'),
      quantidade: Number(r.quantidade ?? 0),
      custo_unitario: Number(r.valor_custo ?? 0) / Math.max(Number(r.quantidade ?? 1), 1),
      valor_total: Number(r.valor_custo ?? 0),
    };
  });

  // Aging - not snapshotted in closed mode currently, use live data
  const [agingCRRes, agingCPRes] = await Promise.all([
        sb.from('vw_workbook_aging_cr').select('*'),
        sb.from('vw_workbook_aging_cp').select('*'),
  ]);

  const mapAging = (data: Record<string, unknown>[], idField: string) => (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ''),
    data_vencimento: String(r.data_vencimento ?? ''),
    valor: Number(r.valor ?? 0),
    valor_pago: Number(r.valor_pago ?? 0),
    saldo_aberto: Number(r.saldo_aberto ?? 0),
    status: String(r.status ?? ''),
    [idField]: String(r[idField] ?? ''),
    descricao: String(r.descricao ?? ''),
  }));

  return {
    receita, despesa, faturamento, fopag, caixa, estoque,
    agingCR: mapAging(agingCRRes.data, 'cliente_id') as WorkbookRawData['agingCR'],
    agingCP: mapAging(agingCPRes.data, 'fornecedor_id') as WorkbookRawData['agingCP'],
    // Modo fechado não dispõe de snapshots V2 — retorna vazio com graceful degradation.
    dre: [], caixaEvolutivo: [], vendasVendedor: [], vendasClienteAbc: [], vendasRegiao: [],
    orcamentosFunil: [], comprasFornecedor: [], estoqueGiro: [], estoqueCritico: [],
    logistica: [], fiscal: [], budget: [], empresa: null,
  };
}
