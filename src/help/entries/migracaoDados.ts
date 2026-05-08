import type { HelpEntry } from '../types';

export const migracaoDadosHelp: HelpEntry = {
  route: '/migracao-dados',
  title: 'Migração de Dados',
  summary:
    'Importação de cadastros, estoque, financeiro e XML fiscal a partir de planilhas e arquivos legados.',
  sections: [
    {
      heading: 'Para que serve',
      body: 'A Migração permite trazer dados de outro ERP ou planilha para o AviZee em fases controladas: cadastros, estoque, financeiro (saldos abertos) e XMLs fiscais históricos. Cada fase tem validação e preview antes da gravação definitiva.',
    },
    {
      heading: 'Upload',
      body: 'Aceita CSV, XLSX e ZIPs de XML. Deduplicação por `codigo_legado` evita reimportação acidental. Arquivos grandes são processados em background com barra de progresso.',
    },
    {
      heading: 'Mapeamento',
      body: 'Mapeie colunas do arquivo para campos do sistema. Templates pré-prontos cobrem os ERPs mais comuns. Salve o mapeamento para reutilizar em próximos lotes.',
    },
    {
      heading: 'Validação',
      body: 'O sistema mostra linhas válidas, com aviso e com erro antes de confirmar. Erros típicos: CPF/CNPJ inválido, NCM inexistente, conta bancária não cadastrada. Corrija no arquivo e reenvie apenas as linhas com erro.',
    },
    {
      heading: 'Confirmação',
      body: 'Só dados validados são gravados. A confirmação é registrada em auditoria com o lote, usuário e timestamp. Em caso de problema, é possível reverter a importação inteira pelo identificador de lote.',
    },
    {
      heading: 'Saldos financeiros incompletos',
      body: 'Títulos importados sem todos os campos ficam em status `parcial` para complementação manual antes do uso em baixas — não bloqueiam o restante da migração.',
    },
  ],
  related: [
    { label: 'Administração', to: '/administracao' },
    { label: 'Auditoria', to: '/auditoria' },
  ],
  tour: [
    {
      target: 'migracao.upload',
      title: 'Upload de arquivos',
      body: 'Envie CSV, XLSX ou ZIP de XML. Arquivos grandes processam em background.',
    },
    {
      target: 'migracao.mapeamento',
      title: 'Mapeamento de colunas',
      body: 'Associe colunas do arquivo aos campos do ERP. Salve o mapeamento para próximos lotes.',
    },
    {
      target: 'migracao.validacao',
      title: 'Validação prévia',
      body: 'Veja linhas válidas, com aviso e com erro antes de gravar. Corrija no arquivo e reenvie só os erros.',
    },
    {
      target: 'migracao.confirmar',
      title: 'Confirmação',
      body: 'A gravação fica registrada em auditoria com o lote — é possível reverter pelo identificador.',
    },
  ],
  version: 1,
};