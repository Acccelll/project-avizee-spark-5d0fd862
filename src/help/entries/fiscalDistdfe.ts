import type { HelpEntry } from '../types';

export const fiscalDistdfeHelp: HelpEntry = {
  route: '/fiscal/distdfe-historico',
  title: 'DistDFe — Histórico',
  summary:
    'Distribuição de DF-e: consulta automática à SEFAZ por NSU, manifestação do destinatário e ciência da operação.',
  sections: [
    {
      heading: 'O que é DistDFe',
      body: 'O serviço DistDFe da SEFAZ entrega para a empresa todas as NF-e emitidas CONTRA o seu CNPJ. O ERP consulta periodicamente por NSU (número sequencial único) e armazena os documentos para manifestação.',
    },
    {
      heading: 'NSU',
      body: 'Cada documento tem um NSU. O sistema mantém o último NSU consultado por CNPJ e busca incrementalmente. Se houver "buraco" (NSU faltante), o cron reprocessa automaticamente.',
    },
    {
      heading: 'Manifestação',
      body: 'Para cada documento recebido, o destinatário deve manifestar: Ciência da Operação, Confirmação da Operação, Operação não Realizada ou Desconhecimento. O ERP automatiza a Ciência conforme regra de admin.',
    },
    {
      heading: 'Histórico',
      body: 'A tabela mostra documentos recebidos com chave, emitente, valor, data, NSU e status de manifestação. Filtros por período, status e emitente. Exporte XML individual para escrituração.',
    },
    {
      heading: 'Cron',
      body: 'O cron `process-distdfe-cron` consulta a SEFAZ a cada N minutos (configurável em Administração > Fiscal). Falhas vão para Auditoria com motivo e código SEFAZ.',
    },
  ],
  related: [
    { label: 'Fiscal', to: '/fiscal' },
    { label: 'Administração (fiscal)', to: '/administracao' },
  ],
  version: 1,
};