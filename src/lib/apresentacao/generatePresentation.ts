import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { APRESENTACAO_SLIDES_MAP, type SlideDataSchema } from './slideDefinitions';
import { buildAutomaticComment } from './commentRules';
import type { ApresentacaoDataBundle, SlideCodigo, SlideData } from '@/types/apresentacao';
import { pickEditedComment } from './utils';
import { apresentacaoTheme } from './theme';
import { defaultSlideLayout } from './layouts';
import { formatMoneyCompact, formatPercentOne } from './numberFormat';

const T = apresentacaoTheme.colors;
const FONT = apresentacaoTheme.typography.fontFamily;

export interface PresentationBranding {
  /** Data URL or absolute URL/path to logo image. */
  logoDataUrl?: string;
  empresaNome?: string;
  corPrimariaHex?: string; // 6-char hex without '#'
  corSecundariaHex?: string;
}

function sanitizeHex(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim().replace(/^#/, '');
  return /^[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : undefined;
}

function prettyLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown, key = ''): string {
  if (typeof value === 'number') {
    if (key.includes('pct') || key.includes('percent')) return formatPercentOne(value);
    if (key.includes('valor') || key.includes('receita') || key.includes('despesa') || key.includes('saldo') || key.includes('caixa')) {
      return `R$ ${formatMoneyCompact(value)}`;
    }
    return String(Math.round(value * 100) / 100);
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (value == null) return '-';
  return String(value);
}

function flatPairs(dados: Record<string, unknown>): Array<{ key: string; value: unknown }> {
  return Object.entries(dados)
    .filter(([k, v]) => !['indisponivel', 'motivo'].includes(k) && !Array.isArray(v) && typeof v !== 'object')
    .map(([key, value]) => ({ key, value }));
}

function findArrayRows(dados: Record<string, unknown>, schema?: SlideDataSchema): Array<Record<string, unknown>> {
  if (schema?.arrayKey) {
    const v = dados[schema.arrayKey];
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v as Array<Record<string, unknown>>;
    // fallback heurístico se o payload veio com outra chave (ex.: legado)
  }
  for (const value of Object.values(dados)) {
    if (Array.isArray(value) && value.length && typeof value[0] === 'object') return value as Array<Record<string, unknown>>;
  }
  return [];
}

function numericPairs(dados: Record<string, unknown>, schema?: SlideDataSchema): Array<{ key: string; value: number }> {
  if (schema?.cardKeys?.length) {
    return schema.cardKeys
      .map((k) => ({ key: k, value: typeof dados[k] === 'number' ? (dados[k] as number) : Number(dados[k] ?? NaN) }))
      .filter((p) => Number.isFinite(p.value));
  }
  return flatPairs(dados).filter((p) => typeof p.value === 'number') as Array<{ key: string; value: number }>;
}

function addHeader(slide: pptxgen.Slide, titulo: string, subtitulo: string) {
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: 'F1F5F9' }, line: { color: 'F1F5F9' } });
  slide.addText(titulo, {
    x: defaultSlideLayout.title.x, y: defaultSlideLayout.title.y, w: defaultSlideLayout.title.w, h: defaultSlideLayout.title.h,
    fontSize: 22, bold: true, color: T.primary, fontFace: FONT,
  });
  if (subtitulo) {
    slide.addText(subtitulo, {
      x: defaultSlideLayout.subtitle.x, y: defaultSlideLayout.subtitle.y, w: defaultSlideLayout.subtitle.w, h: defaultSlideLayout.subtitle.h,
      fontSize: 12, color: T.muted, fontFace: FONT,
    });
  }
}

function addFooter(slide: pptxgen.Slide, codigo: string, periodo: string) {
  slide.addText(`${codigo} · ${periodo}`, {
    x: 0.5, y: 6.95, w: 12.2, h: 0.25, fontSize: 9, color: T.muted, fontFace: FONT,
  });
}

function addCommentary(slide: pptxgen.Slide, comment: string) {
  const c = defaultSlideLayout.commentary;
  slide.addShape('roundRect', { x: c.x, y: c.y, w: c.w, h: c.h, fill: { color: 'ECFEFF' }, line: { color: '67E8F9' }, rectRadius: 0.08 });
  slide.addText('Comentário executivo', { x: c.x + 0.2, y: c.y + 0.2, w: c.w - 0.4, h: 0.4, fontSize: 12, bold: true, color: T.primary, fontFace: FONT });
  slide.addText(comment || 'Sem comentário adicional.', { x: c.x + 0.2, y: c.y + 0.65, w: c.w - 0.4, h: c.h - 0.85, fontSize: 11, color: T.text, fontFace: FONT, valign: 'top' });
}

function addUnavailable(slide: pptxgen.Slide, motivo: string) {
  const c = defaultSlideLayout.chart;
  slide.addShape('roundRect', { x: c.x, y: c.y, w: c.w, h: c.h, fill: { color: 'FFF7ED' }, line: { color: 'D97706' }, rectRadius: 0.08 });
  slide.addText('Dados indisponíveis nesta fase', { x: c.x + 0.3, y: c.y + 0.4, w: c.w - 0.6, h: 0.5, fontSize: 18, bold: true, color: 'D97706', fontFace: FONT });
  slide.addText(motivo || 'Este slide não possui base confiável no modo atual.', {
    x: c.x + 0.3, y: c.y + 1.0, w: c.w - 0.6, h: 1.2, fontSize: 12, color: T.muted, fontFace: FONT, valign: 'top',
  });
}

function renderCover(slide: pptxgen.Slide, def: SlideData, periodo: string, branding: PresentationBranding | undefined, primaryHex: string, secondaryHex: string) {
  slide.background = { color: T.white };
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 1.3, fill: { color: primaryHex }, line: { color: primaryHex } });
  const empresa = branding?.empresaNome || 'AviZee';
  slide.addText(`${empresa} | Apresentação Gerencial`, { x: 0.6, y: 0.35, w: 8.5, h: 0.6, fontSize: 14, bold: true, color: T.white, fontFace: FONT });

  if (branding?.logoDataUrl) {
    try {
      slide.addImage({ data: branding.logoDataUrl, x: 11.6, y: 0.2, w: 1.5, h: 0.9, sizing: { type: 'contain', w: 1.5, h: 0.9 } });
    } catch {
      // fallback ignored — image format unsupported in pptxgenjs
    }
  }

  slide.addText(def.titulo, { x: 0.7, y: 2.0, w: 11.5, h: 1.1, fontSize: 36, bold: true, color: primaryHex, fontFace: FONT });
  slide.addText(def.subtitulo || 'Resumo executivo do período', { x: 0.7, y: 3.2, w: 11.5, h: 0.8, fontSize: 18, color: T.muted, fontFace: FONT });
  slide.addText(`Período: ${periodo}`, { x: 0.7, y: 4.3, w: 11.5, h: 0.6, fontSize: 14, bold: true, color: secondaryHex, fontFace: FONT });

  // Carimbo de origem (reconciliação cross-output)
  slide.addText(
    `Fonte: vw_workbook_* · Gerado em ${new Date().toLocaleString('pt-BR')}`,
    { x: 0.7, y: 5.1, w: 11.5, h: 0.4, fontSize: 10, italic: true, color: T.muted, fontFace: FONT },
  );

  // Accent bar at bottom using brand colors
  slide.addShape('rect', { x: 0, y: 6.95, w: 13.33, h: 0.3, fill: { color: secondaryHex }, line: { color: secondaryHex } });
}

function renderClosing(slide: pptxgen.Slide, def: SlideData, comment: string, metadata?: Record<string, unknown>) {
  const c = defaultSlideLayout.chart;
  slide.addShape('roundRect', { x: c.x, y: 2.0, w: 8.8, h: 2.7, fill: { color: 'F8FAFC' }, line: { color: 'CBD5E1' }, rectRadius: 0.08 });
  slide.addText(def.titulo || 'Encerramento', { x: c.x + 0.3, y: 2.3, w: 8.2, h: 0.7, fontSize: 24, bold: true, color: T.primary, fontFace: FONT });
  slide.addText(comment || 'Obrigado. Próximos passos na sequência da agenda executiva.', { x: c.x + 0.3, y: 3.0, w: 8.2, h: 1.5, fontSize: 13, color: T.text, fontFace: FONT, valign: 'top' });
  const metaKeys = metadata ? Object.keys(metadata).slice(0, 3) : [];
  const metaLine = metaKeys.length ? `Base: ${metaKeys.join(', ')}` : 'Base: parâmetros da geração';
  slide.addText(metaLine, { x: 0.6, y: 6.7, w: 12.2, h: 0.35, fontSize: 10, color: T.muted, fontFace: FONT });
}

function renderCards(slide: pptxgen.Slide, dados: Record<string, unknown>, schema?: SlideDataSchema) {
  const pairs = (schema?.cardKeys?.length
    ? schema.cardKeys.map((k) => ({ key: k, value: dados[k] })).filter((p) => p.value != null)
    : flatPairs(dados)
  ).slice(0, 4);
  if (!pairs.length) { addUnavailable(slide, 'Sem indicadores para exibição.'); return; }
  const cardW = 4.1, cardH = 1.35;
  pairs.forEach((p, idx) => {
    const col = idx % 2, row = Math.floor(idx / 2);
    const x = defaultSlideLayout.chart.x + col * (cardW + 0.25);
    const y = defaultSlideLayout.chart.y + row * (cardH + 0.25);
    slide.addShape('roundRect', { x, y, w: cardW, h: cardH, fill: { color: 'EEF2FF' }, line: { color: 'C7D2FE' }, rectRadius: 0.08 });
    slide.addText(prettyLabel(p.key), { x: x + 0.2, y: y + 0.18, w: cardW - 0.4, h: 0.4, fontSize: 11, color: T.muted, fontFace: FONT });
    slide.addText(formatValue(p.value, p.key), { x: x + 0.2, y: y + 0.55, w: cardW - 0.4, h: 0.7, fontSize: 22, bold: true, color: T.primary, fontFace: FONT });
  });
}

function renderTable(slide: pptxgen.Slide, dados: Record<string, unknown>, schema?: SlideDataSchema) {
  const c = defaultSlideLayout.chart;
  const rows = findArrayRows(dados, schema);
  if (rows.length) {
    const cols = Object.keys(rows[0]).slice(0, 4);
    const header = cols.map((k) => ({ text: prettyLabel(k), options: { bold: true, color: T.white, fill: { color: T.primary }, fontFace: FONT, fontSize: 11 } }));
    const body = rows.slice(0, 8).map((r) => cols.map((k) => ({
      text: formatValue(r[k], k),
      options: { fontSize: 10, color: T.text, fontFace: FONT },
    })));
    slide.addTable([header, ...body], { x: c.x, y: c.y, w: c.w, colW: cols.map(() => c.w / cols.length), border: { type: 'solid', color: 'E5E7EB', pt: 0.5 } });
    return;
  }
  const pairs = flatPairs(dados).slice(0, 8);
  if (!pairs.length) { addUnavailable(slide, 'Sem dados tabulares para exibição.'); return; }
  const tbl = pairs.map((p) => [
    { text: prettyLabel(p.key), options: { bold: true, fontSize: 11, color: T.text, fontFace: FONT } },
    { text: formatValue(p.value, p.key), options: { fontSize: 11, color: T.primary, fontFace: FONT, align: 'right' as const } },
  ]);
  slide.addTable(tbl, { x: c.x, y: c.y, w: c.w, colW: [c.w * 0.6, c.w * 0.4], border: { type: 'solid', color: 'E5E7EB', pt: 0.5 } });
}

function renderColumnOrLine(slide: pptxgen.Slide, dados: Record<string, unknown>, kind: 'coluna' | 'linha', schema?: SlideDataSchema) {
  const c = defaultSlideLayout.chart;
  const arrayRows = findArrayRows(dados, schema);
  let labels: string[] = []; let series: Array<{ name: string; labels: string[]; values: number[] }> = []; let serieName = 'Valor';
  if (arrayRows.length) {
    const sample = arrayRows[0];
    const labelKey = schema?.labelField ?? Object.keys(sample).find((k) => typeof sample[k] === 'string') ?? 'label';
    labels = arrayRows.slice(0, 12).map((r) => String(r[labelKey] ?? ''));
    if (schema?.valueFields?.length) {
      series = schema.valueFields.map((vk) => ({
        name: prettyLabel(vk),
        labels,
        values: arrayRows.slice(0, 12).map((r) => Number(r[vk] ?? 0)),
      }));
    } else {
      const valKey = schema?.valueField ?? Object.keys(sample).find((k) => typeof sample[k] === 'number') ?? 'valor';
      serieName = prettyLabel(valKey);
      series = [{ name: serieName, labels, values: arrayRows.slice(0, 12).map((r) => Number(r[valKey] ?? 0)) }];
    }
  } else {
    const nums = numericPairs(dados, schema).slice(0, 12);
    if (!nums.length) { addUnavailable(slide, 'Sem série numérica para visualização.'); return; }
    labels = nums.map((n) => prettyLabel(n.key));
    series = [{ name: serieName, labels, values: nums.map((n) => n.value) }];
  }
  const type = kind === 'coluna' ? 'bar' : 'line';
  slide.addChart(type as never, series, {
    x: c.x, y: c.y, w: c.w, h: c.h,
    barDir: kind === 'coluna' ? 'col' : undefined,
    chartColors: [T.primary, T.secondary, T.accent],
    showLegend: series.length > 1, legendPos: 'b', legendFontSize: 9, legendFontFace: FONT,
    showValue: false, showCatAxisTitle: false,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT,
  });
}

function renderHorizontalBar(slide: pptxgen.Slide, dados: Record<string, unknown>, schema?: SlideDataSchema) {
  const c = defaultSlideLayout.chart;
  const rows = findArrayRows(dados, schema);
  let labels: string[]; let values: number[];
  if (rows.length) {
    const sample = rows[0];
    const labelKey = schema?.labelField ?? Object.keys(sample).find((k) => typeof sample[k] === 'string') ?? 'nome';
    const valKey = schema?.valueField ?? Object.keys(sample).find((k) => typeof sample[k] === 'number') ?? 'valor';
    labels = rows.slice(0, 8).map((r) => String(r[labelKey] ?? r.estado ?? r.nome ?? ''));
    values = rows.slice(0, 8).map((r) => Number(r[valKey] ?? 0));
  } else {
    const nums = numericPairs(dados, schema).slice(0, 8);
    if (!nums.length) { addUnavailable(slide, 'Sem ranking disponível.'); return; }
    labels = nums.map((n) => prettyLabel(n.key));
    values = nums.map((n) => n.value);
  }
  slide.addChart('bar' as never, [{ name: 'Valor', labels, values }], {
    x: c.x, y: c.y, w: c.w, h: c.h,
    barDir: 'bar',
    chartColors: [T.secondary],
    showLegend: false, showValue: true, dataLabelFontSize: 9, dataLabelFontFace: FONT,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT,
  });
}

function renderDonut(slide: pptxgen.Slide, dados: Record<string, unknown>, schema?: SlideDataSchema) {
  const c = defaultSlideLayout.chart;
  const rows = findArrayRows(dados, schema);
  let labels: string[]; let values: number[];
  if (rows.length) {
    const sample = rows[0];
    const labelKey = schema?.labelField ?? Object.keys(sample).find((k) => typeof sample[k] === 'string') ?? 'nome';
    const valKey = schema?.valueField ?? Object.keys(sample).find((k) => typeof sample[k] === 'number') ?? 'valor';
    labels = rows.slice(0, 6).map((r) => String(r[labelKey] ?? ''));
    values = rows.slice(0, 6).map((r) => Number(r[valKey] ?? 0));
  } else {
    const nums = numericPairs(dados, schema).slice(0, 6);
    if (!nums.length) { addUnavailable(slide, 'Sem composição para visualização.'); return; }
    labels = nums.map((n) => prettyLabel(n.key));
    values = nums.map((n) => Math.abs(n.value));
  }
  slide.addChart('doughnut' as never, [{ name: 'Composição', labels, values }], {
    x: c.x, y: c.y, w: c.w, h: c.h,
    chartColors: [T.primary, T.secondary, T.accent, T.warning, T.danger, '7C3AED'],
    showLegend: true, legendPos: 'r', legendFontSize: 9, legendFontFace: FONT,
    dataLabelFontSize: 9, dataLabelFontFace: FONT, showPercent: true,
  });
}

function renderStackedOrWaterfall(slide: pptxgen.Slide, dados: Record<string, unknown>, schema?: SlideDataSchema) {
  const c = defaultSlideLayout.chart;
  const rows = findArrayRows(dados, schema);
  if (!rows.length) {
    const nums = numericPairs(dados, schema);
    if (!nums.length) { addUnavailable(slide, 'Sem dados para o gráfico empilhado.'); return; }
    slide.addChart('bar' as never, [{ name: 'Impacto', labels: nums.map((n) => prettyLabel(n.key)), values: nums.map((n) => n.value) }], {
      x: c.x, y: c.y, w: c.w, h: c.h,
      barDir: 'col', chartColors: [T.secondary],
      showLegend: false, showValue: true, dataLabelFontSize: 9, dataLabelFontFace: FONT,
      catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT,
    });
    return;
  }
  const sample = rows[0];
  const labelKey = schema?.labelField ?? Object.keys(sample).find((k) => typeof sample[k] === 'string') ?? 'label';
  const valueKeys = schema?.valueFields?.length
    ? schema.valueFields
    : (schema?.valueField ? [schema.valueField] : Object.keys(sample).filter((k) => typeof sample[k] === 'number'));
  const labels = rows.map((r) => String(r[labelKey] ?? ''));
  const series = valueKeys.map((vk) => ({ name: prettyLabel(vk), labels, values: rows.map((r) => Number(r[vk] ?? 0)) }));
  slide.addChart('bar' as never, series, {
    x: c.x, y: c.y, w: c.w, h: c.h,
    barDir: 'col', barGrouping: 'stacked',
    chartColors: [T.primary, T.secondary, T.accent, T.warning, T.danger],
    showLegend: true, legendPos: 'b', legendFontSize: 9, legendFontFace: FONT,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT,
  });
}

function renderSlideBody(slide: pptxgen.Slide, slideData: SlideData) {
  const def = APRESENTACAO_SLIDES_MAP.get(slideData.codigo);
  if (slideData.indisponivel) {
    addUnavailable(slide, String(slideData.dados.motivo ?? 'não automatizado no modo fechado'));
    return;
  }
  const schema = def?.dataSchema;
  switch (def?.chartType) {
    case 'cards': renderCards(slide, slideData.dados, schema); return;
    case 'tabela': renderTable(slide, slideData.dados, schema); return;
    case 'barra_horizontal': renderHorizontalBar(slide, slideData.dados, schema); return;
    case 'donut': renderDonut(slide, slideData.dados, schema); return;
    case 'stacked':
    case 'waterfall': renderStackedOrWaterfall(slide, slideData.dados, schema); return;
    case 'linha': renderColumnOrLine(slide, slideData.dados, 'linha', schema); return;
    case 'coluna': renderColumnOrLine(slide, slideData.dados, 'coluna', schema); return;
    default: renderTable(slide, slideData.dados, schema);
  }
}

export async function generatePresentation(
  data: ApresentacaoDataBundle,
  comentariosEditados: Partial<Record<string, string>>,
  options?: { slideOrder?: SlideCodigo[]; metadata?: Record<string, unknown>; branding?: PresentationBranding },
): Promise<Blob> {
  const order = options?.slideOrder?.length ? options.slideOrder : (Object.keys(data.slides) as SlideCodigo[]);
  const slides: SlideData[] = order.map((codigo) => {
    const def = APRESENTACAO_SLIDES_MAP.get(codigo);
    const dadosSlide = data.slides[codigo] ?? {};
    return {
      codigo,
      titulo: def?.titulo ?? codigo,
      subtitulo: def?.subtitulo ?? '',
      dados: dadosSlide,
      comentarioAutomatico: buildAutomaticComment(codigo, dadosSlide),
      comentarioEditado: comentariosEditados[codigo],
      indisponivel: Boolean(dadosSlide.indisponivel),
    };
  });

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = 'Apresentação Gerencial';
  pres.company = options?.branding?.empresaNome ? `${options.branding.empresaNome} ERP` : 'AviZee ERP';

  const primaryHex = sanitizeHex(options?.branding?.corPrimariaHex) ?? T.primary;
  const secondaryHex = sanitizeHex(options?.branding?.corSecundariaHex) ?? T.secondary;

  pres.defineSlideMaster({
    title: 'AVIZEE_MASTER',
    background: { color: T.white },
  });

  const periodo = `${data.periodo.competenciaInicial} a ${data.periodo.competenciaFinal}`;

  slides.forEach((s) => {
    const slide = pres.addSlide({ masterName: 'AVIZEE_MASTER' });
    const comment = pickEditedComment(s.comentarioAutomatico, s.comentarioEditado);
    if (s.codigo === 'cover') {
      renderCover(slide, s, periodo, options?.branding, primaryHex, secondaryHex);
    } else if (s.codigo === 'closing') {
      renderClosing(slide, s, comment, options?.metadata);
    } else {
      addHeader(slide, s.titulo, s.subtitulo);
      renderSlideBody(slide, s);
      addCommentary(slide, comment);
      addFooter(slide, s.codigo, periodo);
    }
  });

  // pptxgenjs writes a Blob in browser/jsdom and a Buffer in raw node. Both work for our consumers.
  const out = await (pres as unknown as { write: (opts: { outputType: string }) => Promise<unknown> }).write({ outputType: 'blob' });
  if (out instanceof Blob) return out;
  // Fallback for plain node: wrap the buffer
  const buf = out as Uint8Array;
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
