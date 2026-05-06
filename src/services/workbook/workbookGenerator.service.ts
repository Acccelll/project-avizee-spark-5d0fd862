import { supabase } from '@/integrations/supabase/client';
import type { WorkbookTemplate, WorkbookGeracao, FechamentoMensal, WorkbookParametros } from '@/types/workbook';
import { hashParametros } from '@/lib/workbook/utils';
import { logger } from "@/lib/logger";

/**
 * Lazy-loads the heavy ExcelJS-based workbook generator. Keeps ~400KB out of
 * the initial bundle — only paid for when the user actually generates a workbook.
 */
async function loadGenerateWorkbook() {
  const mod = await import('@/lib/workbook/generateWorkbook');
  return mod.generateWorkbook;
}

export async function listarTemplates(): Promise<WorkbookTemplate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('workbook_templates')
    .select('*')
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as WorkbookTemplate[];
}

export async function listarGeracoes(): Promise<WorkbookGeracao[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('workbook_geracoes')
    .select('*, workbook_templates(nome, versao)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as WorkbookGeracao[];
}

export async function listarFechamentos(): Promise<FechamentoMensal[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('fechamentos_mensais')
    .select('*')
    .order('competencia', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FechamentoMensal[];
}

/**
 * Generates a workbook, saves the artifact to storage, and updates the generation record.
 */
export async function gerarWorkbook(
  parametros: WorkbookParametros,
  userId: string | undefined
): Promise<{ blob: Blob; geracaoId: string }> {
  const hash = hashParametros(parametros as unknown as Record<string, unknown>);

  // Create generation record with status 'gerando'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: geracao, error: geracaoError } = await (supabase as any)
    .from('workbook_geracoes')
    .insert({
      template_id: parametros.templateId,
      competencia_inicial: parametros.competenciaInicial,
      competencia_final: parametros.competenciaFinal,
      modo_geracao: parametros.modoGeracao,
      status: 'gerando',
      hash_geracao: hash,
      parametros_json: parametros as unknown as Record<string, unknown>,
      gerado_por: userId ?? null,
    })
    .select()
    .single();

  if (geracaoError) throw geracaoError;

  try {
    // Generate the workbook blob
    const generateWorkbook = await loadGenerateWorkbook();
    const blob = await generateWorkbook({ parametros, geracaoId: geracao.id });

    // Try to save artifact to storage
    let arquivoPath: string | null = null;
    try {
      const filename = `workbook_${geracao.id}.xlsx`;
      const storagePath = `workbooks/${filename}`;
      
      const { error: uploadError } = await supabase.storage
        .from('dbavizee')
        .upload(storagePath, blob, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });
      
      if (!uploadError) {
        arquivoPath = storagePath;
      } else {
        logger.warn('Falha ao salvar artefato no storage:', uploadError.message);
      }
    } catch (storageErr) {
      logger.warn('Storage não disponível para salvar artefato:', storageErr);
    }

    // Update generation record with success
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('workbook_geracoes')
      .update({
        status: 'concluido',
        arquivo_path: arquivoPath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', geracao.id);

    return { blob, geracaoId: geracao.id };
  } catch (err) {
    // Update generation record with error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('workbook_geracoes')
      .update({
        status: 'erro',
        observacoes: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .eq('id', geracao.id);
    throw err;
  }
}

/**
 * Downloads a previously generated workbook from storage.
 * Falls back to regeneration if the artifact is not available.
 */
export async function downloadGeracao(geracao: WorkbookGeracao): Promise<Blob> {
  // Try to download from storage first
  if (geracao.arquivo_path) {
    try {
      const { data, error } = await supabase.storage
        .from('dbavizee')
        .download(geracao.arquivo_path);
      
      if (!error && data) {
        return data;
      }
    } catch {
      logger.warn('Falha ao baixar artefato do storage, regenerando...');
    }
  }

  // Fallback: regenerate (for legacy records without saved artifacts)
  if (!geracao.parametros_json) {
    throw new Error('Parâmetros da geração não encontrados. Não é possível regenerar.');
  }

  const params = geracao.parametros_json as {
    templateId?: string;
    competenciaInicial?: string;
    competenciaFinal?: string;
    modoGeracao?: 'dinamico' | 'fechado';
  };

  const generateWorkbook = await loadGenerateWorkbook();
  const blob = await generateWorkbook({
    parametros: {
      templateId: params.templateId ?? '',
      competenciaInicial: params.competenciaInicial ?? '',
      competenciaFinal: params.competenciaFinal ?? '',
      modoGeracao: params.modoGeracao ?? 'dinamico',
      abasSelecionadas: [],
    },
    geracaoId: geracao.id,
  });

  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
