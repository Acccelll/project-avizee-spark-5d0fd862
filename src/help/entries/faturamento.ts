import type { HelpEntry } from '../types';

export const faturamentoHelp: HelpEntry = {
  route: '/faturamento',
  title: 'Faturamento',
  summary:
    'Emissão de NF-e a partir de pedidos prontos, controle do backlog de faturamento e cadastros fiscais relacionados.',
  sections: [
    {
      heading: 'Como funciona',
      body: 'Pedidos no status "aguardando faturamento" entram no backlog. Cada item pode ser emitido individualmente via wizard ou em lote. A emissão chama a SEFAZ via certificado A1 configurado em Administração.',
    },
    {
      heading: 'Wizard de emissão',
      body: 'O wizard valida cliente, itens, tributação e totais antes de transmitir. Erros comuns (CFOP inválido, NCM ausente, IE inconsistente) aparecem antes da SEFAZ — corrija e tente novamente sem consumir numeração.',
    },
    {
      heading: 'Backlog',
      body: 'A aba Backlog lista pedidos prontos para faturar com filtros por cliente, vendedor e período. Use seleção múltipla para emissão em lote.',
    },
    {
      heading: 'Cadastros fiscais',
      body: 'Em Cadastros, configure CFOP padrão por operação, séries por filial, regras de tributação por NCM e templates de e-mail transacional para envio automático da NF-e ao cliente.',
    },
    {
      heading: 'Após emissão',
      body: 'NF-e autorizada gera DANFE em PDF, XML armazenado no storage seguro e e-mail automático ao cliente (se template configurado). Eventos (cancelamento, carta de correção) ficam em Fiscal > Notas.',
    },
  ],
  related: [
    { label: 'Fiscal', to: '/fiscal' },
    { label: 'Pedidos', to: '/pedidos' },
  ],
  tour: [
    {
      target: 'faturamento.cards',
      title: 'Áreas do faturamento',
      body: 'Os 4 cartões cobrem o ciclo: Emitir NF-e, Backlog, Cadastros fiscais e Consulta de documentos. Cards desabilitados indicam falta de permissão.',
    },
    {
      target: 'faturamento.cards',
      title: 'Backlog de pedidos',
      body: 'O backlog mostra pedidos aguardando faturamento. Selecione múltiplos para emissão em lote ou abra um para o wizard individual.',
    },
    {
      target: '',
      title: 'Validação antes da SEFAZ',
      body: 'O wizard mostra erros antes de transmitir — corrigir aqui não consome numeração de NF-e.',
    },
  ],
  version: 2,
};