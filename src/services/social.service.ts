import { supabase } from '@/integrations/supabase/client';
import { exportarParaCsv, exportarMultiSheetExcel } from './export.service';
import { getSocialProvider } from './socialProviders';
import type {
  SocialAlerta,
  SocialConta,
  SocialCreateContaPayload,
  SocialDashboardConsolidado,
  SocialMetricaSnapshot,
  SocialPost,
  SocialPostFilters,
  SocialSyncPayload,
  SocialUpdateContaPayload,
} from '@/types/social';
export { socialPermissions, getSocialPermissionFlags } from '@/types/social';

export async function listarContasSocial(): Promise<SocialConta[]> {
  const { data, error } = await supabase
    .from('social_contas')
    .select('*')
    .eq('ativo', true)
    .order('data_cadastro', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SocialConta[];
}

export async function criarContaSocial(payload: SocialCreateContaPayload): Promise<SocialConta> {
  const { data, error } = await supabase
    .from('social_contas')
    .insert(payload as never)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as SocialConta;
}

export async function atualizarContaSocial(
  id: string,
  payload: SocialUpdateContaPayload,
): Promise<SocialConta> {
  const { data, error } = await supabase
    .from('social_contas')
    .update(payload as never)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as SocialConta;
}

export async function removerContaSocial(id: string): Promise<void> {
  const { error } = await supabase
    .from('social_contas')
    .update({ ativo: false } as never)
    .eq('id', id);
  if (error) throw error;
}

export async function sincronizarSocial(
  payload: SocialSyncPayload = {},
): Promise<{ success: boolean; message: string }> {
  if (payload.contaId) {
    const { data: conta, error: contaError } = await supabase
      .from('social_contas')
      .select('plataforma')
      .eq('id', payload.contaId)
      .single();
    if (contaError) throw contaError;
    const plataforma = (conta as { plataforma?: string } | null)?.plataforma as
      | Parameters<typeof getSocialProvider>[0]
      | undefined;
    if (plataforma) {
      const provider = getSocialProvider(plataforma);
      try {
        await provider.syncInsights(payload);
      } catch (err) {
        // Propaga mensagem amigável quando o token não está configurado
        // (edge function social-sync agora retorna 422 TOKEN_NOT_CONFIGURED).
        const message = (err as Error)?.message ?? '';
        if (message.includes('TOKEN_NOT_CONFIGURED')) {
          throw new Error(
            'Conta não conectada — configure o token em Administração > Social.',
          );
        }
        throw err;
      }
    }
  }

  const { data, error } = await supabase.rpc('social_sincronizar_manual', {
    _conta_id: payload.contaId ?? null,
  });
  if (error) throw error;
  return data as unknown as { success: boolean; message: string };
}

/**
 * Inicia o fluxo OAuth do Instagram via Facebook Login for Business.
 * Chama a edge function `instagram-oauth/start` (com bearer do usuário) que
 * devolve o `authorize_url` do Facebook. O caller deve fazer
 * `window.location.assign(authorize_url)`.
 */
export async function iniciarOAuthInstagram(returnTo = '/social'): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Usuário não autenticado.');

  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const url = `${baseUrl}/functions/v1/instagram-oauth/start?return_to=${encodeURIComponent(returnTo)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok || !body.authorize_url) {
    throw new Error(body.error ?? 'Falha ao iniciar OAuth do Instagram');
  }
  return body.authorize_url as string;
}

export async function carregarDashboardSocial(
  dataInicio: string,
  dataFim: string,
): Promise<SocialDashboardConsolidado> {
  const { data, error } = await supabase.rpc('social_dashboard_consolidado', {
    _data_inicio: dataInicio,
    _data_fim: dataFim,
  });
  if (error) throw error;
  return data as unknown as SocialDashboardConsolidado;
}

export async function listarSnapshotsPeriodo(
  contaId: string,
  dataInicio: string,
  dataFim: string,
): Promise<SocialMetricaSnapshot[]> {
  // RPC `social_metricas_periodo` may not exist in generated types yet; cast
  // the function name through a helper to keep the payload typed.
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: SocialMetricaSnapshot[] | null; error: Error | null }>
  )('social_metricas_periodo', {
    _conta_id: contaId,
    _data_inicio: dataInicio,
    _data_fim: dataFim,
  });
  if (error) throw error;
  return data ?? [];
}

export async function listarPostsFiltrados(filtros: SocialPostFilters): Promise<SocialPost[]> {
  const { data, error } = await supabase.rpc('social_posts_filtrados', {
    _data_inicio: filtros.dataInicio,
    _data_fim: filtros.dataFim,
    _conta_id: filtros.campanhaId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as unknown as SocialPost[];
}

export async function listarAlertas(resolvido?: boolean): Promise<SocialAlerta[]> {
  const today = new Date();
  const ago = new Date(today);
  ago.setDate(today.getDate() - 30);
  const { data, error } = await supabase.rpc('social_alertas_periodo', {
    _data_inicio: ago.toISOString().slice(0, 10),
    _data_fim: today.toISOString().slice(0, 10),
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as SocialAlerta[];
  if (typeof resolvido === 'boolean') {
    return rows.filter((a) => a.resolvido === resolvido);
  }
  return rows;
}

export interface SocialConsolidadoReportRow {
  plataforma: string;
  seguidoresNovos: number;
  engajamentoMedio: number;
  alcance: number;
  impressoes: number;
  posts: number;
}

export function buildSocialConsolidadoRows(dashboard: SocialDashboardConsolidado): SocialConsolidadoReportRow[] {
  return dashboard.comparativo.map((item) => ({
    plataforma: item.plataforma === 'instagram_business' ? 'Instagram' : 'LinkedIn',
    seguidoresNovos: Number(item.seguidores_novos || 0),
    engajamentoMedio: Number(item.taxa_engajamento_media || 0),
    alcance: Number(item.alcance || 0),
    impressoes: Number(item.impressoes || 0),
    posts: Number(item.quantidade_posts_periodo || 0),
  }));
}

export function exportSocialCsv(filename: string, rows: SocialConsolidadoReportRow[]): void {
  exportarParaCsv({
    titulo: filename.replace(/\.csv$/i, ''),
    rows: rows as unknown as Record<string, unknown>[],
    columns: [
      { key: 'plataforma', label: 'Plataforma' },
      { key: 'seguidoresNovos', label: 'Seguidores novos' },
      { key: 'engajamentoMedio', label: 'Engajamento médio (%)', format: 'percent' },
      { key: 'alcance', label: 'Alcance' },
      { key: 'impressoes', label: 'Impressões' },
      { key: 'posts', label: 'Posts' },
    ],
  });
}

export async function exportSocialXlsx(filename: string, data: Record<string, unknown[]>): Promise<void> {
  await exportarMultiSheetExcel(
    filename.replace(/\.xlsx$/i, ''),
    Object.entries(data).map(([sheetName, rows]) => ({
      name: sheetName,
      rows: rows as Record<string, unknown>[],
    })),
  );
}
