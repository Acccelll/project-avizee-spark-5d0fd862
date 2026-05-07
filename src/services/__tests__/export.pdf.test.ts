import { describe, it, expect } from 'vitest';
import { buildPdfDocument, PDF_MAX_ROWS } from '@/services/export.service';

describe('buildPdfDocument', () => {
  it('usa A3 paisagem quando há mais de 10 colunas', async () => {
    const cols = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `C${i}` }));
    const rows = [Object.fromEntries(cols.map((c) => [c.key, 'x']))];
    const doc = await buildPdfDocument({
      titulo: 'Wide',
      subtitulo: '',
      rows,
      columns: cols,
      empresa: null,
      dataInicio: '',
      dataFim: '',
    });
    // A3 paisagem ≈ 420mm largura
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(400);
  });

  it('mantém A4 paisagem para até 10 colunas', async () => {
    const cols = Array.from({ length: 6 }, (_, i) => ({ key: `c${i}`, label: `C${i}` }));
    const rows = [Object.fromEntries(cols.map((c) => [c.key, 'x']))];
    const doc = await buildPdfDocument({
      titulo: 'Narrow',
      subtitulo: '',
      rows,
      columns: cols,
      empresa: null,
      dataInicio: '',
      dataFim: '',
    });
    // A4 paisagem ≈ 297mm
    const w = doc.internal.pageSize.getWidth();
    expect(w).toBeLessThan(310);
    expect(w).toBeGreaterThan(280);
  });

  it('PDF_MAX_ROWS é 200 (limite documentado)', () => {
    expect(PDF_MAX_ROWS).toBe(200);
  });
});