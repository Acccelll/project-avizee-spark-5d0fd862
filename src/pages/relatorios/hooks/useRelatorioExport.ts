/**
 * Concentra as ações de exportação do workspace de Relatórios (CSV / Excel /
 * PDF) e a derivação de `exportColumnDefs` a partir das colunas visíveis.
 *
 * - Mantém o estado `isExporting` único (evita disparos paralelos).
 * - Toasts de progresso/erro padronizados.
 * - `exportScopeDescription` reutilizável em todos os caminhos.
 *
 * Extraído de `Relatorios.tsx` (Fase 5 do roadmap).
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  exportarParaCsv,
  exportarParaExcel,
  exportarParaPdf,
  type ExportColumnDef,
} from '@/services/export.service';
import { reportConfigs } from '@/config/relatoriosConfig';
import type {
  RelatorioResultado,
  TipoRelatorio,
} from '@/services/relatorios.service';

const PDF_ROW_LIMIT = 200;
const XLSX_ROW_LIMIT = 10000;
const CSV_ROW_LIMIT = 50000;
const SUPABASE_PAGE_LIMIT = 1000;

interface VisibleColumn {
  key: string;
  label: string;
}

interface UseRelatorioExportArgs {
  tipo: TipoRelatorio | '';
  resultado?: RelatorioResultado;
  sortedRows: Record<string, unknown>[];
  visibleColumns: VisibleColumn[];
  empresaConfig: unknown;
  dataInicio: string;
  dataFim: string;
}

export function useRelatorioExport({
  tipo,
  resultado,
  sortedRows,
  visibleColumns,
  empresaConfig,
  dataInicio,
  dataFim,
}: UseRelatorioExportArgs) {
  const [isExporting, setIsExporting] = useState(false);

  const exportScopeDescription = `${sortedRows.length} ${
    sortedRows.length === 1 ? 'registro' : 'registros'
  } · ${visibleColumns.length} ${
    visibleColumns.length === 1 ? 'coluna' : 'colunas'
  }`;

  // Detecta possível truncamento na origem dos dados (limite default 1000 do Supabase).
  const isLikelyTruncated = sortedRows.length === SUPABASE_PAGE_LIMIT;

  const exportColumnDefs = useMemo<ExportColumnDef[] | undefined>(() => {
    if (!tipo) return undefined;
    const cfg = reportConfigs[tipo as TipoRelatorio];
    if (!cfg?.columns?.length) return undefined;
    return visibleColumns.map((vc) => {
      const cfgCol = cfg.columns.find((c) => c.key === vc.key);
      return { key: vc.key, label: vc.label, format: cfgCol?.format };
    });
  }, [visibleColumns, tipo]);

  const handleExportCsv = () => {
    if (!sortedRows.length) {
      toast.warning('Nenhum dado visível para exportar.');
      return;
    }
    if (sortedRows.length > CSV_ROW_LIMIT) {
      const ok = window.confirm(
        `O CSV terá ${sortedRows.length.toLocaleString('pt-BR')} linhas (limite recomendado: ${CSV_ROW_LIMIT.toLocaleString('pt-BR')}).\n\nGerar mesmo assim?`,
      );
      if (!ok) return;
    }
    exportarParaCsv({
      titulo: resultado?.title || String(tipo),
      rows: sortedRows,
      columns: exportColumnDefs,
    });
    toast.success('CSV exportado com sucesso.', { description: exportScopeDescription });
  };

  const handleExportPdf = async () => {
    if (!sortedRows.length) {
      toast.warning('Nenhum dado visível para exportar.');
      return;
    }
    if (isExporting) return;
    if (sortedRows.length > PDF_ROW_LIMIT) {
      const ok = window.confirm(
        `O PDF é limitado a ${PDF_ROW_LIMIT} linhas e este relatório tem ${sortedRows.length.toLocaleString('pt-BR')} registros.\n\n` +
          `Apenas as primeiras ${PDF_ROW_LIMIT} serão impressas. Para o relatório completo prefira exportar em Excel.\n\nDeseja continuar com o PDF resumido?`,
      );
      if (!ok) return;
    }
    const tid = toast.loading('Gerando PDF...', { description: exportScopeDescription });
    setIsExporting(true);
    try {
      await exportarParaPdf({
        titulo: resultado?.title || String(tipo),
        rows: sortedRows,
        columns: exportColumnDefs,
        empresa: empresaConfig,
        dataInicio,
        dataFim,
        resultado,
        origem: {
          modo: 'dinâmico',
          fonte: tipo ? `relatorio:${tipo}` : undefined,
          geradoEm: new Date().toISOString(),
        },
      });
      toast.success('PDF gerado com sucesso!', {
        id: tid,
        description: exportScopeDescription,
      });
    } catch (e) {
      toast.error('Falha ao gerar PDF.', { id: tid });
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportXlsx = async () => {
    if (!sortedRows.length) {
      toast.warning('Nenhum dado visível para exportar.');
      return;
    }
    if (isExporting) return;
    if (sortedRows.length > XLSX_ROW_LIMIT) {
      const ok = window.confirm(
        `O Excel terá ${sortedRows.length.toLocaleString('pt-BR')} linhas (limite recomendado: ${XLSX_ROW_LIMIT.toLocaleString('pt-BR')}).\n\n` +
          `Arquivos muito grandes podem travar o navegador durante a geração. Continuar?`,
      );
      if (!ok) return;
    }
    const tid = toast.loading('Gerando Excel...', { description: exportScopeDescription });
    setIsExporting(true);
    try {
      await exportarParaExcel({
        titulo: resultado?.title || String(tipo),
        rows: sortedRows,
        columns: exportColumnDefs,
        origem: {
          modo: 'dinâmico',
          fonte: tipo ? `relatorio:${tipo}` : undefined,
          geradoEm: new Date().toISOString(),
        },
      });
      toast.success('Excel gerado com sucesso!', {
        id: tid,
        description: exportScopeDescription,
      });
    } catch (e) {
      toast.error('Falha ao gerar Excel.', { id: tid });
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  return {
    isExporting,
    exportColumnDefs,
    exportScopeDescription,
    isLikelyTruncated,
    handleExportCsv,
    handleExportPdf,
    handleExportXlsx,
    PDF_ROW_LIMIT,
    XLSX_ROW_LIMIT,
    CSV_ROW_LIMIT,
  };
}