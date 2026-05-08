/**
 * Template-first workbook generator.
 * 1. Loads the physical .xlsx template
 * 2. Fetches data (dynamic or closed mode)
 * 3. Fills RAW sheets with data
 * 4. Builds visual/analytical sheets
 * 5. Updates parameters
 * 6. Exports preserving template structure
 */
import ExcelJS from 'exceljs';
import { fetchWorkbookData } from './fetchWorkbookData';
import { fillRawSheets } from './fillRawSheets';
import { buildVisualSheets } from './buildVisualSheets';
import { VISUAL_SHEET_NAMES, RAW_SHEET_NAMES } from './templateMap';
import { hashParametros } from './utils';
import type { WorkbookParametros } from '@/types/workbook';
import type { WorkbookCaps } from './fetchWorkbookData';
// V2 — abas analíticas modulares
import { buildCapa } from './sheets/capa';
import { buildDre } from './sheets/dre';
import { buildVendasVendedor, buildVendasClienteAbc, buildVendasRegiao, buildOrcamentosFunil } from './sheets/comercial';
import {
  buildComprasFornecedor, buildEstoqueGiro, buildEstoqueCritico,
  buildLogistica, buildFiscal, buildCaixaEvolutivo,
} from './sheets/operacional';

export interface GenerateWorkbookOptions {
  parametros: WorkbookParametros;
  geracaoId: string;
  /** Onda 9.2 (A-04) — aborta a geração antes da próxima etapa custosa. */
  signal?: AbortSignal;
  /** Onda 9.2 (A-01) — caps explícitos override default. */
  caps?: WorkbookCaps;
}

// Template is served from /public so the path is stable across dev and prod
// builds (Vite leaves files under public/ untouched and without hash).
const TEMPLATE_URL = '/workbook_gerencial_v1.xlsx';

async function loadTemplate(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  let response: Response;
  try {
    response = await fetch(TEMPLATE_URL);
  } catch (err) {
    throw new Error(
      `Template do workbook não pôde ser carregado (${TEMPLATE_URL}). Verifique sua conexão e tente novamente.`,
    );
  }
  if (response.ok) {
    const buffer = await response.arrayBuffer();
    await wb.xlsx.load(buffer);
    return wb;
  }

  // Template missing on server — fall back to a minimal scaffold but warn loudly.
  console.warn(
    `[workbook] Template não encontrado em ${TEMPLATE_URL} (HTTP ${response.status}). Gerando estrutura mínima — contate o suporte.`,
  );
  wb.creator = 'ERP AviZee';
  wb.created = new Date();
  
  // Create RAW sheets with headers
  const rawSheets: Record<string, string[]> = {
    'RAW_Receita': ['competencia', 'total_receita', 'total_recebido', 'quantidade'],
    'RAW_Despesa': ['competencia', 'total_despesa', 'total_pago', 'quantidade'],
    'RAW_Faturamento': ['competencia', 'total_faturado', 'quantidade_nfs'],
    'RAW_FOPAG': ['competencia', 'funcionario_nome', 'salario_base', 'proventos', 'descontos', 'valor_liquido'],
    'RAW_Caixa': ['conta_descricao', 'banco_nome', 'agencia', 'conta', 'saldo_atual'],
    'RAW_Estoque': ['produto_nome', 'sku', 'grupo_nome', 'quantidade', 'custo_unitario', 'valor_total'],
    'RAW_AgingCR': ['id', 'data_vencimento', 'valor', 'valor_pago', 'saldo_aberto', 'status', 'cliente_id', 'descricao'],
    'RAW_AgingCP': ['id', 'data_vencimento', 'valor', 'valor_pago', 'saldo_aberto', 'status', 'fornecedor_id', 'descricao'],
    'RAW_Parametros': ['chave', 'valor'],
  };
  
  for (const [name, headers] of Object.entries(rawSheets)) {
    const ws = wb.addWorksheet(name);
    const row = ws.addRow(headers);
    row.font = { bold: true };
  }
  
  // Create visual sheet placeholders
  for (const name of Object.values(VISUAL_SHEET_NAMES)) {
    wb.addWorksheet(name);
  }
  
  return wb;
}

export async function generateWorkbook(options: GenerateWorkbookOptions): Promise<Blob> {
  const { parametros, geracaoId, signal, caps } = options;
  const { competenciaInicial, competenciaFinal, modoGeracao, abasSelecionadas } = parametros;

  // Se nada selecionado → tudo (compatibilidade retroativa)
  const selecionados = new Set(abasSelecionadas?.length ? abasSelecionadas : ['capa', 'financeiro', 'comercial', 'operacional', 'logistica_fiscal', 'raw']);
  const incluir = (g: string) => selecionados.has(g);

  // 1. Load template
  signal?.throwIfAborted?.();
  const workbook = await loadTemplate();
  workbook.creator = 'ERP AviZee';
  workbook.lastModifiedBy = 'Workbook Gerencial';
  workbook.modified = new Date();

  // 2. Fetch data using appropriate mode
  signal?.throwIfAborted?.();
  const data = await fetchWorkbookData(competenciaInicial, competenciaFinal, modoGeracao, signal, caps);
  signal?.throwIfAborted?.();

  // 3. Fill RAW sheets
  fillRawSheets(workbook, data, parametros, geracaoId);

  // 4. Build visual/analytical sheets from data
  buildVisualSheets(workbook, data, competenciaInicial, competenciaFinal);

  // 4b. Build V2 analytical sheets
  if (incluir('capa')) await buildCapa(workbook, data, competenciaInicial, competenciaFinal, modoGeracao);

  // 8.4.1 — Modo fechado: avisa em uma aba dedicada quais cortes V2 não têm snapshot.
  if (modoGeracao === 'fechado') {
    const ws = workbook.addWorksheet('00b_Aviso_Modo_Fechado');
    ws.columns = [{ width: 32 }, { width: 70 }];
    const titleRow = ws.addRow(['Modo fechado — cortes indisponíveis']);
    titleRow.font = { bold: true, size: 13 };
    ws.mergeCells('A1:B1');
    ws.addRow([]);
    ws.addRow(['Período', `${competenciaInicial} a ${competenciaFinal}`]);
    ws.addRow([]);
    const intro = ws.addRow([
      'Este workbook foi gerado a partir do snapshot de fechamento mensal. Os cortes abaixo não são preservados em snapshot e foram suprimidos para evitar números enganosos. Use o modo dinâmico se precisar destes cortes.',
    ]);
    intro.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    ws.mergeCells(`A${intro.number}:B${intro.number}`);
    intro.height = 48;
    ws.addRow([]);
    const headerRow = ws.addRow(['Aba', 'Motivo']);
    headerRow.font = { bold: true };
    const indisponiveis: Array<[string, string]> = [
      ['01_DRE', 'DRE V2 não snapshotada — recalcular requer base ao vivo.'],
      ['02_Caixa Evolutivo', 'Saldo evolutivo depende de movimentações pós-fechamento.'],
      ['03_Vendas por Vendedor', 'Comissionamento por NF não preservado em snapshot.'],
      ['04_Vendas Cliente ABC', 'Curva ABC reconstruída só com base ao vivo.'],
      ['05_Vendas por Região', 'Cubo regional não snapshotado.'],
      ['06_Funil Orçamentos', 'Pipeline comercial mantém estado dinâmico.'],
      ['07_Compras por Fornecedor', 'Lead time recalculado em tempo real.'],
      ['08_Estoque Giro', 'Giro 90d depende de movimentos atuais.'],
      ['09_Estoque Crítico', 'Mínimos/atual mudam após fechamento.'],
      ['10_Logística', 'Status de remessas continua evoluindo.'],
      ['11_Fiscal', 'NF-es pós-fechamento alteram totais.'],
      ['Budget', 'Metas seguem disponíveis somente no modo dinâmico.'],
    ];
    for (const [aba, motivo] of indisponiveis) {
      ws.addRow([aba, motivo]);
    }
  }

  if (incluir('financeiro')) {
    buildDre(workbook, data, competenciaInicial, competenciaFinal);
    buildCaixaEvolutivo(workbook, data, competenciaInicial, competenciaFinal);
  }
  if (incluir('comercial')) {
    buildVendasVendedor(workbook, data);
    buildVendasClienteAbc(workbook, data);
    buildVendasRegiao(workbook, data, competenciaInicial, competenciaFinal);
    buildOrcamentosFunil(workbook, data, competenciaInicial, competenciaFinal);
  }
  if (incluir('operacional')) {
    buildComprasFornecedor(workbook, data);
    buildEstoqueGiro(workbook, data);
    buildEstoqueCritico(workbook, data);
  }
  if (incluir('logistica_fiscal')) {
    buildLogistica(workbook, data, competenciaInicial, competenciaFinal);
    buildFiscal(workbook, data, competenciaInicial, competenciaFinal);
  }

  // Remove RAW sheets se usuário desmarcou — mantém Parâmetros para auditoria
  if (!incluir('raw')) {
    for (const name of Object.values(RAW_SHEET_NAMES)) {
      if (name === RAW_SHEET_NAMES.PARAMETROS) continue;
      const ws = workbook.getWorksheet(name);
      if (ws) workbook.removeWorksheet(ws.id);
    }
  }

  // Reordena: Capa primeiro (sheet ordering via positions)
  const capa = workbook.getWorksheet('00_Capa');
  if (capa && workbook.worksheets[0] !== capa) {
    const idx = workbook.worksheets.indexOf(capa);
    if (idx > 0) {
      workbook.worksheets.splice(idx, 1);
      workbook.worksheets.unshift(capa);
    }
  }

  // 5. Update Parâmetros visual sheet
  const wsParam = workbook.getWorksheet(VISUAL_SHEET_NAMES.PARAMETROS);
  if (wsParam) {
    wsParam.spliceRows(1, wsParam.rowCount);
    wsParam.addRow(['Chave', 'Valor']);
    const hr = wsParam.getRow(1);
    for (let c = 1; c <= 2; c++) {
      hr.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      hr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    }
    wsParam.addRow(['competencia_inicial', competenciaInicial]);
    wsParam.addRow(['competencia_final', competenciaFinal]);
    wsParam.addRow(['modo_geracao', modoGeracao]);
    wsParam.addRow(['gerado_em', new Date().toISOString()]);
    wsParam.addRow(['geracao_id', geracaoId]);
    wsParam.addRow(['hash', hashParametros(parametros as unknown as Record<string, unknown>)]);
    wsParam.getColumn(1).width = 22;
    wsParam.getColumn(2).width = 40;
  }

  // 6. Export
  signal?.throwIfAborted?.();
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
