import ExcelJS from 'exceljs';
import { COLORS, FORMATS, getOrCreate, sparkline } from '../styles';
import type { WorkbookRawData } from '../fetchWorkbookData';
import { monthRange, indexByCompetencia } from '../comparators';

/** Aba 00_Capa — sumário executivo com KPIs principais. */
export async function buildCapa(
  wb: ExcelJS.Workbook,
  data: WorkbookRawData,
  competenciaInicial: string,
  competenciaFinal: string,
  modo: string,
): Promise<void> {
  const ws = getOrCreate(wb, '00_Capa');
  ws.views = [{ showGridLines: false }];
  for (let c = 1; c <= 6; c++) ws.getColumn(c).width = 22;

  // Header band
  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = data.empresa?.nome_fantasia || data.empresa?.razao_social || 'Workbook Gerencial';
  titleCell.font = { bold: true, size: 24, color: { argb: COLORS.COVER_FG } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.COVER_BG } };
  ws.getRow(1).height = 50;

  ws.mergeCells('A2:F2');
  const sub = ws.getCell('A2');
  sub.value = `Workbook Gerencial · Período ${competenciaInicial.slice(0, 7)} a ${competenciaFinal.slice(0, 7)} · Modo ${modo}`;
  sub.font = { italic: true, color: { argb: COLORS.MUTED }, size: 11 };
  sub.alignment = { horizontal: 'left', indent: 1 };

  // Carimbo de origem (reconciliação cross-output)
  ws.mergeCells('A3:F3');
  const stamp = ws.getCell('A3');
  stamp.value = `Fonte: vw_workbook_* · Gerado em ${new Date().toLocaleString('pt-BR')}`;
  stamp.font = { italic: true, color: { argb: COLORS.MUTED }, size: 9 };
  stamp.alignment = { horizontal: 'left', indent: 1 };

  // Logo (best-effort)
  if (data.empresa?.logo_url) {
    try {
      const resp = await fetch(data.empresa.logo_url);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const ext = data.empresa.logo_url.toLowerCase().endsWith('.jpg') || data.empresa.logo_url.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png';
        const id = wb.addImage({ buffer: buf as ExcelJS.Buffer, extension: ext as 'png' | 'jpeg' });
        ws.addImage(id, { tl: { col: 5.1, row: 0.1 }, ext: { width: 120, height: 50 } });
      }
    } catch {
      // logo fetch failed - silent fallback
    }
  }

  // KPIs
  const months = monthRange(competenciaInicial, competenciaFinal);
  const recByMonth = indexByCompetencia(data.receita, r => r.total_receita);
  const despByMonth = indexByCompetencia(data.despesa, d => d.total_despesa);
  const fatByMonth = indexByCompetencia(data.faturamento, f => f.total_faturado);

  const totalReceita = months.reduce((s, m) => s + (recByMonth[m] ?? 0), 0);
  const totalDespesa = months.reduce((s, m) => s + (despByMonth[m] ?? 0), 0);
  const totalFat = months.reduce((s, m) => s + (fatByMonth[m] ?? 0), 0);
  const resultado = totalReceita - totalDespesa;
  const margem = totalReceita ? resultado / totalReceita : 0;
  const caixaFinal = data.caixa.reduce((s, c) => s + c.saldo_atual, 0);
  const ebitdaTot = data.dre.reduce((s, d) => s + d.ebitda, 0);
  const estoqueValor = data.estoqueGiro.reduce((s, e) => s + e.valor_estoque, 0);
  const cobMedia = data.estoqueGiro.length
    ? data.estoqueGiro.reduce((s, e) => s + (e.cobertura_dias || 0), 0) / data.estoqueGiro.length
    : 0;

  const kpis: Array<[string, number, string]> = [
    ['Receita', totalReceita, FORMATS.CURRENCY],
    ['Despesa', totalDespesa, FORMATS.CURRENCY],
    ['Resultado', resultado, FORMATS.CURRENCY],
    ['Margem %', margem, FORMATS.PCT],
    ['Faturamento NFs', totalFat, FORMATS.CURRENCY],
    ['EBITDA', ebitdaTot, FORMATS.CURRENCY],
    ['Caixa Final', caixaFinal, FORMATS.CURRENCY],
    ['Estoque Valor', estoqueValor, FORMATS.CURRENCY],
    ['Cobertura média (dias)', cobMedia, '0.0'],
    ['Clientes ativos', data.vendasClienteAbc.length, FORMATS.INT],
  ];

  let row = 4;
  ws.getCell(`A${row}`).value = 'KPIs Executivos';
  ws.getCell(`A${row}`).font = { bold: true, size: 14, color: { argb: COLORS.HEADER_BG } };
  row += 1;

  let col = 1;
  for (const [label, value, fmt] of kpis) {
    const labelCell = ws.getCell(row, col);
    const valueCell = ws.getCell(row + 1, col);
    labelCell.value = label;
    labelCell.font = { size: 9, color: { argb: COLORS.MUTED } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.KPI_BG } };
    labelCell.alignment = { horizontal: 'left', indent: 1, vertical: 'middle' };
    valueCell.value = value;
    valueCell.numFmt = fmt;
    valueCell.font = { bold: true, size: 14 };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.KPI_BG } };
    valueCell.alignment = { horizontal: 'left', indent: 1, vertical: 'middle' };
    ws.getRow(row).height = 18;
    ws.getRow(row + 1).height = 26;
    col++;
    if (col > 5) { col = 1; row += 3; }
  }

  // Sumário (índice das abas)
  // Tendências (sparklines) — visualização compacta da evolução mensal
  const trendsRow = row + 2;
  ws.getCell(`A${trendsRow}`).value = 'Tendências do período';
  ws.getCell(`A${trendsRow}`).font = { bold: true, size: 14, color: { argb: COLORS.HEADER_BG } };

  const recSeries = months.map(m => recByMonth[m] ?? 0);
  const despSeries = months.map(m => despByMonth[m] ?? 0);
  const resSeries = months.map((_, i) => recSeries[i] - despSeries[i]);
  const fatSeries = months.map(m => fatByMonth[m] ?? 0);

  const trends: Array<[string, number[], string]> = [
    ['Receita', recSeries, COLORS.POSITIVE],
    ['Despesa', despSeries, COLORS.NEGATIVE],
    ['Resultado', resSeries, COLORS.HEADER_BG],
    ['Faturamento', fatSeries, COLORS.HEADER_BG],
  ];
  trends.forEach(([label, series, color], i) => {
    const r = trendsRow + 1 + i;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = { size: 10, color: { argb: COLORS.MUTED } };
    const sparkCell = ws.getCell(`B${r}`);
    sparkCell.value = sparkline(series);
    sparkCell.font = { name: 'Consolas', size: 16, color: { argb: color } };
    sparkCell.alignment = { vertical: 'middle' };
    ws.mergeCells(`B${r}:E${r}`);
    const totalCell = ws.getCell(`F${r}`);
    totalCell.value = series.reduce((a, b) => a + b, 0);
    totalCell.numFmt = FORMATS.CURRENCY;
    totalCell.font = { bold: true, size: 11 };
    ws.getRow(r).height = 22;
  });

  const indexRow = trendsRow + trends.length + 3;
  ws.getCell(`A${indexRow}`).value = 'Índice';
  ws.getCell(`A${indexRow}`).font = { bold: true, size: 14, color: { argb: COLORS.HEADER_BG } };

  const links: Array<[string, string]> = [
    ['01_DRE', 'DRE Gerencial'],
    ['02_Confronto', 'Confronto Receita × Despesa'],
    ['Caixa', 'Posição de Caixa'],
    ['03_Caixa_Evolutivo', 'Caixa Evolutivo'],
    ['Despesa', 'Despesa Mensal'],
    ['FOPAG', 'Folha de Pagamento'],
    ['Faturamento NFs', 'Faturamento Notas Fiscais'],
    ['09_Vendas_Vendedor', 'Vendas por Vendedor'],
    ['10_Vendas_Cliente_ABC', 'Curva ABC de Clientes'],
    ['11_Vendas_Regiao', 'Vendas por Região'],
    ['12_Orcamentos_Funil', 'Funil de Orçamentos'],
    ['13_Compras_Fornecedor', 'Compras por Fornecedor'],
    ['Estoque', 'Estoque (resumo)'],
    ['16_Estoque_Giro', 'Estoque · Giro & Cobertura'],
    ['17_Estoque_Critico', 'Estoque Crítico'],
    ['19_Logistica', 'Logística'],
    ['20_Fiscal', 'Fiscal'],
    ['Aging CR', 'Aging Contas a Receber'],
    ['Aging CP', 'Aging Contas a Pagar'],
  ];
  links.forEach((l, i) => {
    const r = indexRow + 1 + i;
    const cell = ws.getCell(`A${r}`);
    cell.value = { text: l[1], hyperlink: `#'${l[0]}'!A1` };
    cell.font = { color: { argb: 'FF1F4E79' }, underline: true };
  });

  // Onda 9.2 (A-01) — nota visual quando algum top-N atingiu o cap.
  const caps = data.capsApplied;
  if (caps) {
    const reached = [
      caps.vendasClienteAbc.reached ? `Curva ABC de Clientes (top ${caps.vendasClienteAbc.cap})` : null,
      caps.estoqueGiro.reached ? `Estoque · Giro (top ${caps.estoqueGiro.cap})` : null,
      caps.estoqueCritico.reached ? `Estoque Crítico (top ${caps.estoqueCritico.cap})` : null,
    ].filter(Boolean) as string[];
    if (reached.length) {
      const noteRow = indexRow + links.length + 3;
      ws.mergeCells(`A${noteRow}:F${noteRow}`);
      const note = ws.getCell(`A${noteRow}`);
      note.value = `⚠ Listagens com truncamento por top-N: ${reached.join(' · ')}. Aumente o cap para ver mais linhas.`;
      note.font = { italic: true, size: 9, color: { argb: COLORS.MUTED } };
      note.alignment = { wrapText: true, vertical: 'middle' };
      ws.getRow(noteRow).height = 24;
    }
  }
}