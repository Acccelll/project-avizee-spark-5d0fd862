import type { HelpEntry } from '../types';

export const socialHelp: HelpEntry = {
  route: '/social',
  title: 'Social',
  summary:
    'Gestão de Instagram Business e LinkedIn: contas conectadas, métricas, postagens, alertas e relatórios consolidados.',
  sections: [
    {
      heading: 'Visão geral',
      body: 'O módulo Social agrega métricas de Instagram Business e LinkedIn em um único painel. Cada conta conectada gera snapshots diários (seguidores, alcance, engajamento) que alimentam o dashboard, os relatórios e os alertas.',
    },
    {
      heading: 'Conectar conta',
      body: 'Em Contas conectadas, use "Conectar conta" e escolha a plataforma. Para Instagram, prefira o fluxo OAuth (Facebook Login for Business) — ele renova o token automaticamente. Para LinkedIn, é necessário cadastrar o token manualmente; renove antes do vencimento (60 dias).',
    },
    {
      heading: 'Sincronização',
      body: 'O botão "Sincronizar" enfileira um job que busca novos posts e snapshots de métricas. Quando o token está ausente ou expirado, o sistema avisa explicitamente com "Conta não conectada" — nunca exibe dados simulados como reais.',
    },
    {
      heading: 'Dashboard',
      body: 'Mostra crescimento percentual contra o período anterior, frequência de postagem, distribuição por tipo de conteúdo, melhor e pior post. A "Tendência" só fica em Alta com ganho consistente (≥ 10 seguidores e engajamento ≥ 2%) — evita falsos positivos.',
    },
    {
      heading: 'Postagens e métricas',
      body: 'A aba Postagens lista todas as publicações do período com curtidas, comentários e taxa de engajamento. A aba Métricas gerais consolida snapshots por dia para análise temporal.',
    },
    {
      heading: 'Alertas',
      body: 'Alertas operacionais (queda brusca, token expirando, conta desconectada) ficam em Alertas. Filtros por severidade. Resolva manualmente após tomar ação.',
    },
    {
      heading: 'Relatórios',
      body: 'Exporte CSV ou XLSX consolidado por plataforma. O XLSX inclui abas separadas para Consolidado, Ranking de posts e Alertas do período.',
    },
    {
      heading: 'Permissões',
      body: 'Visualizar (admin/vendedor/financeiro), Configurar contas (admin/vendedor), Sincronizar (admin/vendedor), Exportar (admin/vendedor/financeiro), Gerenciar alertas (admin/vendedor). Revogações granulares em user_permissions vencem sempre.',
    },
  ],
  related: [
    { label: 'Administração', to: '/administracao' },
    { label: 'Relatórios', to: '/relatorios' },
  ],
  tour: [
    {
      target: 'social.tabs',
      title: 'Abas do módulo Social',
      body: 'Navegue entre Contas conectadas, Métricas, Postagens, Dashboard, Relatórios e Alertas. Cada aba respeita o período do filtro acima.',
    },
    {
      target: 'social.connectBtn',
      title: 'Conectar uma conta',
      body: 'Use o botão "Conectar conta" para iniciar OAuth do Instagram ou cadastrar manualmente uma página do LinkedIn. Sem conta conectada, o dashboard fica vazio.',
    },
    {
      target: 'social.syncBtn',
      title: 'Sincronizar agora',
      body: '"Sincronizar" enfileira a busca de novos posts e métricas. Se o token estiver expirado, você verá um aviso claro — não há mock silencioso.',
    },
    {
      target: '',
      title: 'Dashboard e tendência',
      body: 'Na aba Dashboard, a "Tendência" só fica em Alta com crescimento consistente. Compare KPIs com o período anterior automaticamente.',
    },
    {
      target: '',
      title: 'Exportar relatórios',
      body: 'Em Relatórios, exporte CSV (consolidado) ou XLSX (com Ranking + Alertas). Útil para apresentações mensais.',
    },
  ],
  version: 1,
};