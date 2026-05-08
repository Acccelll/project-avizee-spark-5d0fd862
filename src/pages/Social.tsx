import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, FileText, RefreshCcw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ModulePage } from '@/components/ModulePage';
import { AccessDenied } from '@/components/AccessDenied';
import { notifyError } from '@/utils/errorMessages';
import { SummaryCard } from '@/components/SummaryCard';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ScrollableTabsList } from '@/components/ui/scrollable-tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { formatNumber } from '@/lib/format';
import { getDefaultDateRange, toLocalDateInput } from '@/lib/date';
import {
  buildSocialConsolidadoRows,
  carregarDashboardSocial,
  criarContaSocial,
  exportSocialCsv,
  exportSocialXlsx,
  getSocialPermissionFlags,
  listarAlertas,
  listarContasSocial,
  listarPostsFiltrados,
  removerContaSocial,
  sincronizarSocial,
  socialPermissions,
} from '@/services/social.service';
import { SocialDashboardTab } from '@/components/social/SocialDashboardTab';
import { SocialContasTab } from '@/components/social/SocialContasTab';
import { SocialMetricasTab } from '@/components/social/SocialMetricasTab';
import { SocialPostsTab } from '@/components/social/SocialPostsTab';
import { SocialRelatoriosTab } from '@/components/social/SocialRelatoriosTab';
import { SocialAlertasTab } from '@/components/social/SocialAlertasTab';
import { SocialContaModal } from '@/components/social/SocialContaModal';
import { calculateContentDistribution, calculatePercentGrowth, calculatePostingFrequency, calculateTrend } from '@/components/social/socialAnalytics';
import type { SocialAlerta, SocialConta, SocialDashboardConsolidado, SocialPost, SocialPostType } from '@/types/social';

const defaultRange = getDefaultDateRange(30);

export default function Social() {
  const { roles, extraPermissions, deniedPermissions } = useAuth();
  const permissions = useMemo(
    () => getSocialPermissionFlags(roles, extraPermissions, deniedPermissions),
    [roles, extraPermissions, deniedPermissions]
  );

  const [loading, setLoading] = useState(true);
  const [contas, setContas] = useState<SocialConta[]>([]);
  const [dashboard, setDashboard] = useState<SocialDashboardConsolidado | null>(null);
  const [previousDashboard, setPreviousDashboard] = useState<SocialDashboardConsolidado | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [alertas, setAlertas] = useState<SocialAlerta[]>([]);
  const [dataInicio, setDataInicio] = useState(defaultRange.inicio);
  const [dataFim, setDataFim] = useState(defaultRange.fim);
  const [filtroRede, setFiltroRede] = useState<string>('todos');
  const [filtroTipoPost, setFiltroTipoPost] = useState<string>('todos');
  const [contaModalOpen, setContaModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const startDate = new Date(`${dataInicio}T00:00:00`);
      const endDate = new Date(`${dataFim}T00:00:00`);
      const diffDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
      const previousEnd = new Date(startDate.getTime() - 86_400_000);
      const previousStart = new Date(previousEnd.getTime() - (diffDays - 1) * 86_400_000);

      const [contasData, dashboardData, previousData, postsData, alertasData] = await Promise.all([
        listarContasSocial(),
        carregarDashboardSocial(dataInicio, dataFim),
        carregarDashboardSocial(toLocalDateInput(previousStart), toLocalDateInput(previousEnd)),
        listarPostsFiltrados({
          plataforma: filtroRede === 'todos' ? undefined : (filtroRede as 'instagram_business' | 'linkedin_page'),
          dataInicio,
          dataFim,
          tipoPost: filtroTipoPost === 'todos' ? undefined : (filtroTipoPost as SocialPostType),
        }),
        listarAlertas(false),
      ]);
      setContas(contasData);
      setDashboard(dashboardData);
      setPreviousDashboard(previousData);
      setPosts(postsData);
      setAlertas(alertasData);
    } catch (error: unknown) {
      console.error('[social] erro ao carregar', error);
      notifyError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!permissions.canViewModule) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData depende só dos filtros via closure; recriá-la a cada render dispararia refetch
  }, [dataInicio, dataFim, filtroRede, filtroTipoPost, permissions.canViewModule]);

  const historicoComparativo = useMemo(() => {
    const byPlataforma = dashboard?.comparativo ?? [];
    return byPlataforma.map((item) => ({
      plataforma: item.plataforma === 'instagram_business' ? 'Instagram' : 'LinkedIn',
      seguidores_novos: Number(item.seguidores_novos || 0),
      taxa_engajamento_media: Number(item.taxa_engajamento_media || 0),
      alcance: Number(item.alcance || 0),
    }));
  }, [dashboard]);

  const melhoresPosts = useMemo(() => [...posts].sort((a, b) => (b.engajamento_total || 0) - (a.engajamento_total || 0)).slice(0, 5), [posts]);
  const pioresPosts = useMemo(() => [...posts].sort((a, b) => (a.engajamento_total || 0) - (b.engajamento_total || 0)).slice(0, 5), [posts]);

  const handleSync = async (contaId?: string) => {
    if (!permissions.canSync) return;
    try {
      await sincronizarSocial({ contaId });
      toast.success('Sincronização social executada com sucesso.');
      await loadData();
    } catch (error: unknown) {
      console.error('[social] sync', error);
      notifyError(error);
    }
  };

  const handleNovaConta = async (payload: Parameters<typeof criarContaSocial>[0]) => {
    if (!permissions.canManageAccounts) return;
    try {
      await criarContaSocial(payload);
      toast.success('Conta social cadastrada com sucesso.');
      await loadData();
    } catch (error: unknown) {
      console.error('[social] criar conta', error);
      notifyError(error);
    }
  };

  const handleDesativarConta = async (contaId: string) => {
    if (!permissions.canManageAccounts) return;
    try {
      await removerContaSocial(contaId);
      toast.success('Conta social desativada com sucesso.');
      await loadData();
    } catch (error: unknown) {
      console.error('[social] desativar conta', error);
      notifyError(error);
    }
  };

  const handleExportCsv = () => {
    if (!dashboard || !permissions.canExportReports) return;
    exportSocialCsv(`social-consolidado-${dataInicio}-${dataFim}.csv`, buildSocialConsolidadoRows(dashboard));
    toast.success('Relatório CSV exportado com sucesso.');
  };

  const handleExportXlsx = () => {
    if (!dashboard || !permissions.canExportReports) return;
    exportSocialXlsx(`social-relatorio-${dataInicio}-${dataFim}.xlsx`, {
      Consolidado: buildSocialConsolidadoRows(dashboard),
      RankingPosts: [...posts]
        .sort((a, b) => (b.engajamento_total || 0) - (a.engajamento_total || 0))
        .map((post) => ({
          plataforma: post.plataforma,
          titulo: post.titulo_legenda,
          data_publicacao: post.data_publicacao,
          tipo_post: post.tipo_post,
          engajamento_total: post.engajamento_total,
          taxa_engajamento: post.taxa_engajamento,
        })),
      Alertas: alertas.map((alerta) => ({
        severidade: alerta.severidade,
        titulo: alerta.titulo,
        tipo: alerta.tipo_alerta,
        data_cadastro: alerta.data_cadastro,
      })),
    });
    toast.success('Relatório XLSX exportado com sucesso.');
  };

  if (!permissions.canViewModule) {
    return (
      <ModulePage title="Social" subtitle="Gestão de redes sociais">
        <AccessDenied
          title="Módulo Social"
          message="Você não tem permissão para visualizar este módulo. Solicite ao administrador acesso ao módulo Social."
        />
      </ModulePage>
    );
  }

  const totalSeguidoresNovos = dashboard?.totais?.seguidores_novos ?? 0;
  const previousFollowers = previousDashboard?.totais?.seguidores_novos ?? 0;
  const growthPercent = calculatePercentGrowth(totalSeguidoresNovos, previousFollowers);
  const taxaMedia = historicoComparativo.length
    ? historicoComparativo.reduce((acc, curr) => acc + curr.taxa_engajamento_media, 0) / historicoComparativo.length
    : 0;
  const postingFrequency = calculatePostingFrequency(posts, Math.max(1, Math.ceil((new Date(`${dataFim}T00:00:00`).getTime() - new Date(`${dataInicio}T00:00:00`).getTime()) / 86_400_000) + 1));
  const contentDistribution = calculateContentDistribution(posts);
  const trendLabel = dashboard ? calculateTrend(dashboard) : 'estavel';

  return (
    <><ModulePage
        title="Social"
        subtitle="Gestão de Instagram Business e LinkedIn com histórico de métricas e alertas operacionais"
        headerActions={
          <div className="flex gap-2">
            <Button
              data-help-id="social.syncBtn"
              variant="outline"
              onClick={() => handleSync()}
              disabled={!permissions.canSync}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Sincronizar
            </Button>
            <Button
              data-help-id="social.connectBtn"
              onClick={() => setContaModalOpen(true)}
              disabled={!permissions.canManageAccounts}
            >
              Conectar conta
            </Button>
          </div>
        }
        summaryCards={
          <>
            <SummaryCard title="Seguidores novos" value={formatNumber(totalSeguidoresNovos)} icon={Users} />
            <SummaryCard title="Taxa média de engajamento" value={`${taxaMedia.toFixed(2)}%`} icon={BarChart3} />
            <SummaryCard title="Posts no período" value={formatNumber(posts.length)} icon={FileText} />
            <SummaryCard title="Alertas abertos" value={formatNumber(alertas.length)} icon={AlertTriangle} />
          </>
        }
        filters={
          <div className="grid grid-cols-2 gap-2 w-full md:flex md:flex-wrap md:w-auto md:gap-3">
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full md:w-[160px]" />
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full md:w-[160px]" />
            <Select value={filtroRede} onValueChange={setFiltroRede}>
              <SelectTrigger className="w-full md:w-[170px]"><SelectValue placeholder="Rede" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as redes</SelectItem>
                <SelectItem value="instagram_business">Instagram</SelectItem>
                <SelectItem value="linkedin_page">LinkedIn</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipoPost} onValueChange={setFiltroTipoPost}>
              <SelectTrigger className="w-full md:w-[170px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="feed">Feed</SelectItem>
                <SelectItem value="reels">Reels</SelectItem>
                <SelectItem value="video">Vídeo</SelectItem>
                <SelectItem value="artigo">Artigo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <Tabs defaultValue="dashboard" className="space-y-4">
          <ScrollableTabsList data-help-id="social.tabs">
            <TabsTrigger value="contas">Contas conectadas</TabsTrigger>
            <TabsTrigger value="metricas">Métricas gerais</TabsTrigger>
            <TabsTrigger value="posts">Postagens</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard social</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
            <TabsTrigger value="alertas">Alertas</TabsTrigger>
          </ScrollableTabsList>

          <TabsContent value="contas">
            <SocialContasTab contas={contas} canManageAccounts={permissions.canManageAccounts} canSync={permissions.canSync} onSync={handleSync} onDisable={handleDesativarConta} />
          </TabsContent>

          <TabsContent value="metricas">
            <SocialMetricasTab historicoComparativo={historicoComparativo} />
          </TabsContent>

          <TabsContent value="posts">
            <SocialPostsTab posts={posts} />
          </TabsContent>

          <TabsContent value="dashboard">
            <SocialDashboardTab
              historicoComparativo={historicoComparativo}
              melhoresPosts={melhoresPosts}
              pioresPosts={pioresPosts}
              growthPercent={growthPercent}
              postingFrequency={postingFrequency}
              contentDistribution={contentDistribution}
              trendLabel={trendLabel}
            />
          </TabsContent>

          <TabsContent value="relatorios">
            <SocialRelatoriosTab
              canExportReports={permissions.canExportReports}
              onExportCsv={handleExportCsv}
              onExportXlsx={handleExportXlsx}
              permissions={socialPermissions}
            />
          </TabsContent>

          <TabsContent value="alertas">
            <SocialAlertasTab alertas={permissions.canManageAlerts ? alertas : alertas.filter((a) => a.severidade === 'critica' || a.severidade === 'alta')} />
          </TabsContent>
        </Tabs>

        {loading && <p className="text-sm text-muted-foreground mt-4">Atualizando dados sociais...</p>}
      </ModulePage>

      <SocialContaModal open={contaModalOpen} onOpenChange={setContaModalOpen} onSubmit={handleNovaConta} />
    </>
  );
}
