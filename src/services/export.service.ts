/**
 * Centralised export service for the Reports module.
 *
 * Provides three export formats:
 *   - CSV  (synchronous, plain text, UTF-8 with BOM)
 *   - Excel (.xlsx via exceljs)
 *   - PDF   (jsPDF, landscape A4, dynamic column widths)
 *
 * All public functions accept the same `ExportPayload` so callers do not need
 * to know the underlying library.
 *
 * When `columns` is provided in ExportOptions, exports use the config-defined
 * order, labels and format hints — matching exactly what the user sees on screen.
 * When `columns` is omitted, raw object keys are used as a fallback.
 *
 * Empty data is handled centrally: a `toast.warning("Nenhum dado para
 * exportar")` is emitted and the call returns without producing a file.
 */

import { toast } from "sonner";
import { buildExportFilename, downloadTextFile } from "@/lib/utils";
import type { RelatorioResultado } from "@/services/relatorios.service";
import type { ColumnFormat } from "@/config/relatoriosConfig";
import { formatReportCell } from "@/services/relatorios/lib/formatCell";

export interface EmpresaInfo {
  razao_social?: string;
  cnpj?: string;
  nome_fantasia?: string;
}

/** Minimal column descriptor used by the export layer. */
export interface ExportColumnDef {
  key: string;
  label: string;
  format?: ColumnFormat;
}

export interface ExportOptions {
  /** Report title used as the file name */
  titulo: string;
  /** Rows to export. Each object is one row; keys are column names. */
  rows: Record<string, unknown>[];
  /**
   * Optional ordered column definitions.
   * When provided: exports use this ordering, labels and format hints.
   * When absent: raw object keys are used (legacy behaviour).
   */
  columns?: ExportColumnDef[];
  /** Optional empresa info for the PDF header */
  empresa?: EmpresaInfo | null;
  /** Date range label for PDF header */
  dataInicio?: string;
  dataFim?: string;
  /** Full report result (used for PDF subtitle) */
  resultado?: RelatorioResultado;
  /**
   * Carimbo de origem dos dados (modo de geração, view/fonte, hash).
   * Renderizado no cabeçalho do PDF e no rodapé do XLSX para reconciliação.
   */
  origem?: {
    modo?: string;          // ex.: "dinâmico" | "fechado"
    fonte?: string;         // ex.: "vw_workbook_dre_mensal"
    geradoPor?: string;     // user/email
    geradoEm?: string;      // ISO timestamp
  };
}

/** Multi-sheet payload for Excel exports. */
export interface ExportSheetDef {
  name: string;
  rows: Record<string, unknown>[];
  columns?: ExportColumnDef[];
}

const EMPTY_TOAST_MSG = "Nenhum dado para exportar.";

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * Exports `rows` as a semicolon-delimited CSV file (UTF-8 + BOM) and triggers
 * a browser download.
 *
 * Empty input → emits a `toast.warning` and returns without producing a file.
 */
export function exportarParaCsv(options: ExportOptions): void {
  const { titulo, rows, columns } = options;

  if (!rows.length) {
    toast.warning(EMPTY_TOAST_MSG);
    return;
  }

  const filename = buildExportFilename(titulo, "csv");

  let csv: string;
  if (columns?.length) {
    const header = columns.map((c) => `"${c.label}"`).join(";");
    const body = rows.map((row) =>
      columns.map((c) => formatReportCell(row[c.key], c.key, { format: c.format, mode: "csv" })).join(";")
    );
    csv = [header, ...body].join("\n");
  } else {
    const headers = Object.keys(rows[0]);
    csv = [
      headers.join(";"),
      ...rows.map((row) =>
        headers.map((h) => formatReportCell(row[h], h, { mode: "csv" })).join(";")
      ),
    ].join("\n");
  }

  // Prepend UTF-8 BOM so Excel desktop pt-BR opens accents correctly.
  downloadTextFile(filename, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

// ─── Excel ───────────────────────────────────────────────────────────────────

/**
 * Exports `rows` as an .xlsx file using exceljs.
 *
 * When `columns` is provided, uses the config-defined order, labels and format.
 * Empty input → emits a `toast.warning` and returns without producing a file.
 */
export async function exportarParaExcel(options: ExportOptions): Promise<void> {
  const { titulo, rows, columns } = options;
  if (!rows.length) {
    toast.warning(EMPTY_TOAST_MSG);
    return;
  }

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(titulo.slice(0, 31));

  populateSheet(sheet, rows, columns);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    buffer,
    buildExportFilename(titulo, "xlsx"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/**
 * Multi-sheet Excel export. Each entry becomes one worksheet.
 * Empty (no sheets / no rows total) → toast.warning + return.
 */
export async function exportarMultiSheetExcel(
  titulo: string,
  sheets: ExportSheetDef[]
): Promise<void> {
  const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
  if (!sheets.length || totalRows === 0) {
    toast.warning(EMPTY_TOAST_MSG);
    return;
  }

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  sheets.forEach((sh) => {
    if (!sh.rows.length) return;
    const ws = workbook.addWorksheet(sh.name.slice(0, 31));
    populateSheet(ws, sh.rows, sh.columns);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    buffer,
    buildExportFilename(titulo, "xlsx"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function populateSheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheet: any,
  rows: Record<string, unknown>[],
  columns?: ExportColumnDef[]
) {
  if (columns?.length) {
    const headers = columns.map((c) => c.label);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8E8E8" },
    };

    rows.forEach((row) => {
      const values = columns.map((c) => {
        return formatReportCell(row[c.key], c.key, { format: c.format, mode: "excel" });
      });
      sheet.addRow(values);
    });
  } else {
    const headers = Object.keys(rows[0]);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8E8E8" },
    };
    rows.forEach((row) => {
      sheet.addRow(headers.map((h) => row[h] ?? ""));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheet.columns.forEach((col: any) => {
    let maxLen = 10;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    col.eachCell?.({ includeEmpty: true }, (cell: any) => {
      maxLen = Math.max(maxLen, String(cell.value ?? "").length + 2);
    });
    col.width = Math.min(maxLen, 50);
  });
}

function downloadBlob(buffer: ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/** Maximum rows included in a PDF export (file-size / render time constraint). */
export const PDF_MAX_ROWS = 200;

/**
 * Builds a jsPDF document from the report result and triggers a browser
 * download. Empty input → toast.warning + return.
 */
export async function exportarParaPdf(options: ExportOptions): Promise<void> {
  const { titulo, rows, columns, empresa, dataInicio = "", dataFim = "", resultado, origem } = options;

  if (!rows.length) {
    toast.warning(EMPTY_TOAST_MSG);
    return;
  }

  const doc = await buildPdfDocument({
    titulo: resultado?.title ?? titulo,
    subtitulo: resultado?.subtitle ?? "",
    rows,
    columns,
    empresa: empresa ?? null,
    dataInicio,
    dataFim,
    origem,
  });

  doc.save(buildExportFilename(resultado?.title ?? titulo, "pdf"));
}

interface PdfBuildParams {
  titulo: string;
  subtitulo: string;
  rows: Record<string, unknown>[];
  columns?: ExportColumnDef[];
  empresa: EmpresaInfo | null;
  dataInicio: string;
  dataFim: string;
  origem?: ExportOptions["origem"];
}

/** Returns a configured jsPDF document (landscape A4). */
export async function buildPdfDocument(params: PdfBuildParams) {
  const { titulo, subtitulo, rows, columns, empresa, dataInicio, dataFim, origem } = params;
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 20;

  // Company header
  if (empresa?.razao_social) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(empresa.razao_social, margin, y);
    y += 4;
    if (empresa.cnpj) {
      doc.setFont("helvetica", "normal");
      doc.text(`CNPJ: ${empresa.cnpj}`, margin, y);
      y += 4;
    }
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(titulo || "Relatório", margin, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(subtitulo || "", margin, y);
  y += 4;
  const periodoText =
    dataInicio || dataFim
      ? `Período: ${dataInicio || "—"} a ${dataFim || "—"}`
      : `Gerado em: ${new Date().toLocaleDateString("pt-BR")}`;
  doc.text(periodoText, margin, y);
  y += 8;

  // Carimbo de origem (modo / fonte / geração) — facilita reconciliação entre
  // Relatórios, Workbook e Apresentação para o mesmo período.
  if (origem && (origem.modo || origem.fonte || origem.geradoPor || origem.geradoEm)) {
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    const partes: string[] = [];
    if (origem.modo) partes.push(`Modo: ${origem.modo}`);
    if (origem.fonte) partes.push(`Fonte: ${origem.fonte}`);
    if (origem.geradoPor) partes.push(`Por: ${origem.geradoPor}`);
    const ts = origem.geradoEm
      ? new Date(origem.geradoEm).toLocaleString("pt-BR")
      : new Date().toLocaleString("pt-BR");
    partes.push(`Em: ${ts}`);
    doc.text(partes.join("  ·  "), margin, y);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    y += 6;
  }

  if (rows.length > 0) {
    // Determine columns to render: prefer config columns, fallback to raw keys
    const colDefs: Array<{ key: string; label: string; format?: string }> = columns?.length
      ? columns
      : Object.keys(rows[0]).map((k) => ({
          key: k,
          label: k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
        }));

    const contentWidth = pageWidth - margin * 2;

    // Dynamic column widths based on label + sample data
    const maxCharsPerCol = colDefs.map((col) => {
      let maxLen = col.label.length;
      const sample = rows.slice(0, 50);
      for (const row of sample) {
        const val = String(formatCellValuePdf(row[col.key], col.key, col.format) ?? "");
        if (val.length > maxLen) maxLen = val.length;
      }
      return Math.min(maxLen, 35);
    });
    const totalChars = maxCharsPerCol.reduce((s, c) => s + c, 0) || 1;
    const colWidths = maxCharsPerCol.map((c) =>
      Math.max((c / totalChars) * contentWidth, 12)
    );

    // Header row
    doc.setFillColor(105, 5, 0);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    let xPos = margin;
    colDefs.forEach((col, i) => {
      doc.text(col.label.substring(0, 25), xPos + 1.5, y + 5, {
        maxWidth: colWidths[i] - 2,
      });
      xPos += colWidths[i];
    });
    y += 7;

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);

    const maxRows = Math.min(rows.length, PDF_MAX_ROWS);
    if (rows.length > PDF_MAX_ROWS) {
      y += 10;
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(8);
      doc.setFont("helvetica", "bolditalic");
      doc.setTextColor(180, 0, 0);
      doc.text(
        `⚠ PDF limitado a ${PDF_MAX_ROWS} de ${rows.length} registros. Use "Exportar Excel" para o relatório completo.`,
        margin,
        y
      );
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
    }

    for (let r = 0; r < maxRows; r++) {
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 15;
      }
      if (r % 2 === 0) {
        doc.setFillColor(245, 245, 240);
        doc.rect(margin, y, contentWidth, 6, "F");
      }
      xPos = margin;
      colDefs.forEach((col, i) => {
        const val = String(formatCellValuePdf(rows[r][col.key], col.key, col.format) ?? "");
        doc.text(val.substring(0, 35), xPos + 1.5, y + 4, {
          maxWidth: colWidths[i] - 2,
        });
        xPos += colWidths[i];
      });
      y += 6;
    }

    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`Total de registros: ${rows.length}`, margin, y);
  }

  return doc;
}

/** Formats a cell value for PDF rendering — thin wrapper around the unified
 *  `formatReportCell` so PDF, UI and other exporters share one source of truth. */
function formatCellValuePdf(value: unknown, key: string, format?: string): string | number {
  return formatReportCell(value, key, { format, mode: "display" });
}
