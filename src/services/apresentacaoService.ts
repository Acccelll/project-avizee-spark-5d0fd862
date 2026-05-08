import { supabase } from '@/integrations/supabase/client';
import { fromUntyped } from '@/lib/supabase/fromUntyped';
import type {
  ApresentacaoComentario,
  ApresentacaoGeracao,
  ApresentacaoModoGeracao,
  ApresentacaoParametros,
  ApresentacaoStatusEditorial,
  ApresentacaoTemplate,
  SlideCodigo,
  SlideConfigItem,
} from '@/types/apresentacao';
import { fetchPresentationData } from '@/lib/apresentacao/fetchPresentationData';
import type { PresentationBranding } from '@/lib/apresentacao/generatePresentation';
import { buildAutomaticComments } from '@/lib/apresentacao/commentRules';
import { APRESENTACAO_SLIDES_MAP } from '@/lib/apresentacao/slideDefinitions';
import { hashPayload } from '@/lib/apresentacao/utils';
import { activeSlides, resolveSlideConfig } from '@/lib/apresentacao/templateResolver';

/**
 * Lazy-loads the heavy pptxgenjs-based presentation generator. Keeps the
 * pptxgenjs bundle (~250KB) out of the initial app load.
 */
async function loadGeneratePresentation() {
  const mod = await import('@/lib/apresentacao/generatePresentation');
  return mod.generatePresentation;
}

export async function listarApresentacaoTemplates(): Promise<ApresentacaoTemplate[]> {
  const { data, error } = await fromUntyped('apresentacao_templates').select('*').eq('ativo', true).order('nome');
  if (error) throw error;
  return (data ?? []) as ApresentacaoTemplate[];
}

export async function incluirTemplateApresentacao(input: {
  nome: string;
  codigo: string;
  versao: string;
  descricao?: string;
  arquivo?: File;
  configJson?: Record<string, unknown>;
}): Promise<ApresentacaoTemplate> {
  let arquivoPath: string | null = null;

  if (input.arquivo) {
    const filename = `${input.codigo.toLowerCase()}_${input.versao.replace(/\s+/g, '_')}.pptx`;
    arquivoPath = `templates/apresentacao/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from('dbavizee')
      .upload(arquivoPath, input.arquivo, {
        upsert: true,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
    if (uploadError) throw uploadError;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('apresentacao_templates')
    .insert({
      nome: input.nome,
      codigo: input.codigo,
      versao: input.versao,
      descricao: input.descricao ?? null,
      arquivo_path: arquivoPath,
      config_json: input.configJson ?? { origem: 'manual', layout: 'apresentacao_v2' },
      ativo: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ApresentacaoTemplate;
}

export async function listarApresentacaoGeracoes(): Promise<ApresentacaoGeracao[]> {
  const { data, error } = await fromUntyped('apresentacao_geracoes')
    .select('*, apresentacao_templates(nome, versao, codigo)')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as ApresentacaoGeracao[];
}

export async function listarComentarios(geracaoId: string): Promise<ApresentacaoComentario[]> {
  const { data, error } = await fromUntyped('apresentacao_comentarios')
    .select('*')
    .eq('geracao_id', geracaoId)
    .order('ordem');
  if (error) throw error;
  return (data ?? []) as ApresentacaoComentario[];
}

export async function atualizarComentario(id: string, comentario_editado: string): Promise<void> {
  const { error } = await fromUntyped('apresentacao_comentarios')
    .update({ comentario_editado, comentario_status: comentario_editado ? 'editado' : 'automatico', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function atualizarStatusEditorial(geracaoId: string, status: ApresentacaoStatusEditorial, aprovadorId?: string): Promise<void> {
  const payload: Record<string, unknown> = { status_editorial: status, updated_at: new Date().toISOString() };
  if (status === 'aprovado') {
    payload.aprovado_por = aprovadorId ?? null;
    payload.aprovado_em = new Date().toISOString();
  }
  const { error } = await fromUntyped('apresentacao_geracoes').update(payload).eq('id', geracaoId);
  if (error) throw error;
}

async function buildSlideSelection(templateId: string, generationSlideConfig?: SlideConfigItem[]) {
  const { data: template } = await fromUntyped('apresentacao_templates').select('*').eq('id', templateId).single();
  const resolved = resolveSlideConfig(template as ApresentacaoTemplate, generationSlideConfig);
  return { resolved, active: activeSlides(resolved) };
}

export async function gerarApresentacao(
  params: ApresentacaoParametros,
  userId?: string,
  options: { signal?: AbortSignal } = {},
) {
  const { signal } = options;
  signal?.throwIfAborted?.();
  const { resolved: resolvedConfig, active } = await buildSlideSelection(params.templateId, params.slideConfig);
  const hash = hashPayload({ ...params, slides: active });
  const nowIso = new Date().toISOString();

  // 8.4.2 — Cache: se existe geração concluída com mesmo hash nas últimas 24h,
  // baixar e reutilizar o artefato em vez de regenerar.
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await fromUntyped('apresentacao_geracoes')
      .select('id, arquivo_path, status, is_final, created_at')
      .eq('hash_geracao', hash)
      .eq('status', 'concluido')
      .not('arquivo_path', 'is', null)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached?.arquivo_path && cached.is_final) {
      const { data: blobData } = await supabase.storage.from('dbavizee').download(cached.arquivo_path);
      if (blobData) {
        return {
          geracaoId: cached.id as string,
          blob: blobData as Blob,
          arquivoPath: cached.arquivo_path as string,
          aguardandoAprovacao: false,
          fromCache: true,
        };
      }
    }
  } catch {
    /* cache miss não bloqueia geração */
  }

  signal?.throwIfAborted?.();
  const { data: geracao, error: geracaoError } = await fromUntyped('apresentacao_geracoes')
    .insert({
      template_id: params.templateId,
      empresa_id: params.empresaId ?? null,
      competencia_inicial: `${params.competenciaInicial}-01`,
      competencia_final: `${params.competenciaFinal}-01`,
      modo_geracao: params.modoGeracao,
      status: 'gerando',
      status_editorial: 'rascunho',
      hash_geracao: hash,
      parametros_json: params,
      slide_config_json: resolvedConfig,
      gerado_por: userId ?? null,
      data_origem_json: { modo: params.modoGeracao, workbook_views: true },
      gerado_em: nowIso,
    })
    .select('*')
    .single();
  if (geracaoError) throw geracaoError;

  try {
    const bundle = await fetchPresentationData(`${params.competenciaInicial}-01`, `${params.competenciaFinal}-01`, params.modoGeracao, active, signal);
    signal?.throwIfAborted?.();

    const comentarios = active.map((codigo, ordem) => {
      const list = buildAutomaticComments(codigo, bundle.slides[codigo] ?? {});
      return {
        geracao_id: geracao.id,
        slide_codigo: codigo,
        titulo: APRESENTACAO_SLIDES_MAP.get(codigo)?.titulo ?? codigo,
        comentario_automatico: list.map((c) => c.text).join(' | '),
        comentario_editado: null,
        comentario_status: 'automatico',
        prioridade: list[0]?.priority ?? 1,
        tags_json: { tags: list.flatMap((c) => c.tags), severidade: list[0]?.severity ?? 'info' },
        origem: params.modoGeracao,
        ordem,
      };
    });

    await fromUntyped('apresentacao_comentarios').insert(comentarios);

    const { error: updateError } = await fromUntyped('apresentacao_geracoes')
      .update({
        status: 'concluido',
        status_editorial: params.exigirRevisao ? 'revisao' : 'aprovado',
        is_final: !params.exigirRevisao,
        total_slides: active.length,
        slides_json: { ativos: active },
        updated_at: new Date().toISOString(),
      })
      .eq('id', geracao.id);
    if (updateError) throw updateError;

    if (params.exigirRevisao) {
      return { geracaoId: geracao.id as string, blob: null as Blob | null, aguardandoAprovacao: true };
    }

    signal?.throwIfAborted?.();
    const { blob, arquivoPath } = await gerarArquivoFinal(geracao.id, active, bundle, hash);
    return { geracaoId: geracao.id as string, blob, arquivoPath, aguardandoAprovacao: false };
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    await fromUntyped('apresentacao_geracoes')
      .update({
        status: isAbort ? 'cancelado' : 'erro',
        observacoes: isAbort ? 'Geração cancelada pelo usuário.' : (err instanceof Error ? err.message : String(err)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', geracao.id);
    throw err;
  }
}

async function fetchPresentationBranding(): Promise<PresentationBranding> {
  const branding: PresentationBranding = {};
  try {
    const { data } = await fromUntyped('app_configuracoes')
      .select('valor')
      .eq('chave', 'geral')
      .maybeSingle();
    const valor = (data?.valor ?? {}) as Record<string, unknown>;
    const logoUrl = (valor.logoUrl ?? valor.logo_url) as string | undefined;
    branding.corPrimariaHex = (valor.corPrimaria ?? valor.cor_primaria) as string | undefined;
    branding.corSecundariaHex = (valor.corSecundaria ?? valor.cor_secundaria) as string | undefined;

    if (logoUrl) {
      try {
        const absUrl = logoUrl.startsWith('http') ? logoUrl : `${window.location.origin}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
        const resp = await fetch(absUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          branding.logoDataUrl = dataUrl;
        }
      } catch {
        /* logo opcional */
      }
    }
  } catch {
    /* configuração opcional */
  }

  try {
    const { data: emp } = await fromUntyped('empresa_config')
      .select('nome_fantasia, razao_social, cor_primaria, cor_secundaria, logo_url')
      .maybeSingle();
    if (emp) {
      branding.empresaNome = branding.empresaNome ?? (emp.nome_fantasia || emp.razao_social) ?? undefined;
      branding.corPrimariaHex = branding.corPrimariaHex ?? emp.cor_primaria ?? undefined;
      branding.corSecundariaHex = branding.corSecundariaHex ?? emp.cor_secundaria ?? undefined;
      if (!branding.logoDataUrl && emp.logo_url) {
        try {
          const absUrl = String(emp.logo_url).startsWith('http')
            ? String(emp.logo_url)
            : `${window.location.origin}${String(emp.logo_url).startsWith('/') ? '' : '/'}${emp.logo_url}`;
          const resp = await fetch(absUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            branding.logoDataUrl = dataUrl;
          }
        } catch {
          /* opcional */
        }
      }
    }
  } catch {
    /* opcional */
  }

  return branding;
}

async function gerarArquivoFinal(geracaoId: string, active: SlideCodigo[], bundle: Awaited<ReturnType<typeof fetchPresentationData>>, hash: string) {
  const comentarios = await listarComentarios(geracaoId);
  const comentarioMap = comentarios.reduce((acc, c) => {
    acc[c.slide_codigo] = c.comentario_editado ?? undefined;
    return acc;
  }, {} as Partial<Record<SlideCodigo, string | undefined>>);

  const branding = await fetchPresentationBranding();

  const generatePresentation = await loadGeneratePresentation();
  const blob = await generatePresentation(bundle, comentarioMap as Partial<Record<string, string>>, {
    slideOrder: active,
    metadata: { geracaoId, hash, geradoEm: new Date().toISOString(), origem: 'erp-avizee-v2' },
    branding,
  });

  const arquivoPath = `apresentacoes/apresentacao_${geracaoId}.pptx`;
  const { error: uploadError } = await supabase.storage
    .from('dbavizee')
    .upload(arquivoPath, blob, {
      upsert: true,
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  if (uploadError) throw uploadError;

  await fromUntyped('apresentacao_geracoes')
    .update({ status: 'concluido', status_editorial: 'gerado', is_final: true, arquivo_path: arquivoPath, updated_at: new Date().toISOString() })
    .eq('id', geracaoId);

  return { blob, arquivoPath };
}

export async function aprovarEGerarFinal(geracaoId: string, aprovadorId?: string): Promise<Blob> {
  const { data: geracao, error } = await fromUntyped('apresentacao_geracoes').select('*').eq('id', geracaoId).single();
  if (error) throw error;
  if (!geracao) throw new Error('Geração não encontrada.');

  await atualizarStatusEditorial(geracaoId, 'aprovado', aprovadorId);

  const p = geracao.parametros_json as {
    competenciaInicial: string;
    competenciaFinal: string;
    modoGeracao: ApresentacaoModoGeracao;
  };

  const active = (geracao.slides_json?.ativos as SlideCodigo[] | undefined) ?? (geracao.slide_config_json as SlideConfigItem[] | null)?.filter((s) => s.enabled).map((s) => s.codigo) ?? [];

  const bundle = await fetchPresentationData(`${p.competenciaInicial}-01`, `${p.competenciaFinal}-01`, p.modoGeracao, active);
  const { blob } = await gerarArquivoFinal(geracaoId, active, bundle, geracao.hash_geracao ?? '');
  return blob;
}

export async function downloadApresentacao(geracao: ApresentacaoGeracao): Promise<Blob> {
  if (!geracao.arquivo_path) throw new Error('Arquivo não encontrado no histórico.');
  const { data, error } = await supabase.storage.from('dbavizee').download(geracao.arquivo_path);
  if (error || !data) throw error ?? new Error('Falha no download do storage.');
  return data;
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

// ===================== Cadência mensal automática (F1) =====================

export interface ApresentacaoCadencia {
  id: string;
  nome: string;
  template_id: string | null;
  modo_geracao: ApresentacaoModoGeracao;
  dia_do_mes: number;
  exigir_revisao: boolean;
  destinatarios_emails: string[];
  ativo: boolean;
  ultima_execucao_em: string | null;
  ultima_execucao_status: string | null;
  ultima_execucao_geracao_id: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export type ApresentacaoCadenciaDraft = Omit<
  ApresentacaoCadencia,
  'id' | 'created_at' | 'updated_at' | 'ultima_execucao_em' | 'ultima_execucao_status' | 'ultima_execucao_geracao_id'
>;

export async function listarApresentacaoCadencias(): Promise<ApresentacaoCadencia[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('apresentacao_cadencia')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApresentacaoCadencia[];
}

export async function salvarApresentacaoCadencia(input: Partial<ApresentacaoCadenciaDraft> & { id?: string }): Promise<ApresentacaoCadencia> {
  const payload = {
    nome: input.nome,
    template_id: input.template_id ?? null,
    modo_geracao: input.modo_geracao ?? 'fechado',
    dia_do_mes: input.dia_do_mes ?? 5,
    exigir_revisao: input.exigir_revisao ?? true,
    destinatarios_emails: input.destinatarios_emails ?? [],
    ativo: input.ativo ?? true,
    observacoes: input.observacoes ?? null,
  };
  if (input.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('apresentacao_cadencia')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ApresentacaoCadencia;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('apresentacao_cadencia')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as ApresentacaoCadencia;
}

export async function removerApresentacaoCadencia(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('apresentacao_cadencia').delete().eq('id', id);
  if (error) throw error;
}

export async function executarCadenciaAgora(cadenciaId: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('apresentacao-cadencia-runner', {
    body: { force: true, cadenciaId },
  });
  if (error) throw error;
  return data;
}

// ===================== Preferências do usuário (F9) =====================

export interface ApresentacaoPreferencias {
  ultimo_template_id: string | null;
  ultimo_modo_geracao: ApresentacaoModoGeracao | null;
  ultimos_slides_codigos: string[];
  ultima_competencia_inicial: string | null;
  ultima_competencia_final: string | null;
  exigir_revisao_padrao: boolean;
}

export async function carregarPreferenciasApresentacao(): Promise<ApresentacaoPreferencias | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('apresentacao_preferencias')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return (data as ApresentacaoPreferencias | null) ?? null;
}

export async function salvarPreferenciasApresentacao(prefs: ApresentacaoPreferencias): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('apresentacao_preferencias')
    .upsert(
      { user_id: userId, ...prefs, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

// ===================== Telemetria de slides (F9) =====================

export type TelemetriaAcao = 'selecionado' | 'desselecionado' | 'gerado';

export async function registrarTelemetriaSlides(
  slides: string[],
  acao: TelemetriaAcao,
  geracaoId?: string,
): Promise<void> {
  if (!slides.length) return;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const rows = slides.map((slide_codigo) => ({
    slide_codigo,
    acao,
    user_id: userId,
    geracao_id: geracaoId ?? null,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('apresentacao_slide_telemetria').insert(rows);
}

export interface SlideUsoAggregado {
  slide_codigo: string;
  total_selecionado: number;
  total_desselecionado: number;
  total_gerado: number;
  ultimo_uso_em: string | null;
}

export async function listarSlideUsoAgregado(): Promise<SlideUsoAggregado[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('vw_apresentacao_slide_uso')
    .select('*')
    .order('total_gerado', { ascending: false });
  if (error) return [];
  return (data ?? []) as SlideUsoAggregado[];
}
