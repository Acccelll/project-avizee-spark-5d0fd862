import type { HelpEntry } from '../types';

/**
 * Lote 3 — manuais ampliados para cadastros auxiliares e administração.
 * Sem tour guiado: telas conceitualmente diretas, foco em regras e relacionamentos.
 */

export const transportadorasHelp: HelpEntry = {
  route: '/transportadoras',
  title: 'Transportadoras',
  summary: 'Cadastro das transportadoras usadas em remessas, geração de etiquetas pré-postagem e cálculo de frete.',
  sections: [
    {
      heading: 'Uso operacional',
      body: 'Vincule a transportadora padrão ao cliente para sugerir automaticamente em novas remessas. Para Correios, configure os serviços disponíveis (PAC, SEDEX, Mini Envios) e o número do contrato.',
    },
    {
      heading: 'Etiquetas pré-postagem',
      body: 'A geração de etiquetas dos Correios usa o remetente cadastrado em Empresa (Administração) e a transportadora vinculada à remessa. As etiquetas ficam persistidas para reimpressão.',
    },
    {
      heading: 'Outras transportadoras',
      body: 'Para transportadoras tradicionais, registre conta de e-mail e contato — o ERP envia notificação automática quando há remessa nova.',
    },
    {
      heading: 'Inativar',
      body: 'Transportadoras com remessas históricas não podem ser excluídas. Inativas somem das listas de novas remessas mas mantêm histórico.',
    },
  ],
  related: [
    { label: 'Logística', to: '/logistica' },
    { label: 'Clientes', to: '/clientes' },
    { label: 'Empresa (Administração)', to: '/administracao' },
  ],
  version: 2,
};

export const funcionariosHelp: HelpEntry = {
  route: '/funcionarios',
  title: 'Funcionários',
  summary: 'Cadastro de funcionários para vínculo com vendas, comissões, responsabilidade por documentos e usuário do sistema.',
  sections: [
    {
      heading: 'Cadastro',
      body: 'Dados pessoais (nome, CPF, RG, contato), função, data de admissão e vínculo com sócio (quando aplicável). CPF é validado.',
    },
    {
      heading: 'Funções',
      body: 'Cada funcionário tem função (vendedor, comprador, financeiro, estoquista, etc) que define em quais campos ele pode ser selecionado nos formulários do ERP. Vendedor aparece em orçamentos/pedidos; comprador em pedidos de compra; etc.',
    },
    {
      heading: 'Vínculo com usuário do sistema',
      body: 'Funcionários podem ter um usuário de login vinculado (e-mail). As permissões granulares do usuário são gerenciadas em Administração → Usuários — não aqui. Aqui é só o vínculo identidade ↔ login.',
    },
    {
      heading: 'Comissões',
      body: 'Vendedores podem ter regra de comissão (% sobre venda ou faixa por meta atingida). O cálculo aparece nos relatórios comerciais. Configurado por funcionário ou por equipe.',
    },
    {
      heading: 'Inativar',
      body: 'Funcionários desligados devem ser inativados, não excluídos — o histórico (vendas, pedidos, baixas feitas por ele) precisa ser preservado para auditoria.',
    },
  ],
  related: [
    { label: 'Administração (usuários)', to: '/administracao' },
    { label: 'Sócios', to: '/socios' },
  ],
  version: 2,
};

export const sociosHelp: HelpEntry = {
  route: '/socios',
  title: 'Sócios e participações',
  summary: 'Cadastro do quadro societário com participações percentuais por sócio e histórico de alterações contratuais.',
  sections: [
    {
      heading: 'Sócios',
      body: 'Pessoas físicas ou jurídicas. CPF/CNPJ é validado. Dados usados em relatórios societários e documentos formais.',
    },
    {
      heading: 'Participações',
      body: 'A aba Participações controla o % de cada sócio na empresa. A soma das participações ATIVAS deve ser 100% — o sistema avisa em caso de divergência.',
    },
    {
      heading: 'Alterações contratuais',
      body: 'Mudanças geram histórico para auditoria — útil em alterações contratuais. Você pode datar a alteração (válida a partir de) e inativar a participação anterior.',
    },
    {
      heading: 'Vínculo com funcionários',
      body: 'Sócios que também atuam operacionalmente devem ter cadastro em Funcionários, com vínculo ao registro de sócio.',
    },
  ],
  related: [
    { label: 'Empresa (Administração)', to: '/administracao' },
    { label: 'Funcionários', to: '/funcionarios' },
  ],
  version: 2,
};

export const formasPagamentoHelp: HelpEntry = {
  route: '/formas-pagamento',
  title: 'Formas de pagamento',
  summary: 'Catálogo de formas de pagamento (à vista, boleto, cartão, parcelado) usadas em orçamentos, pedidos e baixas financeiras.',
  sections: [
    {
      heading: 'Configuração',
      body: 'Cada forma define: número de parcelas, intervalo entre parcelas (dias), conta bancária default para crédito e taxa (quando aplicável, ex.: cartão).',
    },
    {
      heading: 'Geração de títulos',
      body: 'Ao faturar um pedido com a forma escolhida, o sistema gera automaticamente os títulos a receber com as datas corretas (vencimento + intervalo × parcela).',
    },
    {
      heading: 'Boleto',
      body: 'Para forma de boleto, configure carteira e convênio (vai junto com a conta bancária). Geração de boleto exige integração ativa com o banco.',
    },
    {
      heading: 'Cartão (com taxa)',
      body: 'Configure a taxa por bandeira/parcelas. O ERP calcula o valor líquido recebido e gera dois títulos: bruto a receber + taxa a pagar (custo financeiro).',
    },
    {
      heading: 'Inativar',
      body: 'Formas com histórico não podem ser excluídas. Inativas somem das opções em novos documentos mas continuam aparecendo nos antigos.',
    },
  ],
  related: [
    { label: 'Financeiro', to: '/financeiro' },
    { label: 'Clientes', to: '/clientes' },
    { label: 'Contas bancárias', to: '/contas-bancarias' },
  ],
  version: 2,
};

export const gruposEconomicosHelp: HelpEntry = {
  route: '/grupos-economicos',
  title: 'Grupos econômicos',
  summary: 'Agrupamento de clientes que pertencem ao mesmo grupo empresarial — usado em condições comerciais e relatórios consolidados.',
  sections: [
    {
      heading: 'Para que serve',
      body: 'Permite aplicar tabela de preço, desconto máximo e prazo de pagamento por grupo. Vence sobre tabela base, mas perde para condição específica do cliente (cliente > grupo > base).',
    },
    {
      heading: 'Vínculo com clientes',
      body: 'No cadastro do cliente, escolha o grupo. Um cliente pertence a no máximo um grupo. Mudar grupo retroage para próximos pedidos, não altera os antigos.',
    },
    {
      heading: 'Relatórios consolidados',
      body: 'Relatórios comerciais oferecem visão consolidada por grupo, somando todas as empresas vinculadas — útil para clientes corporativos com múltiplas filiais/CNPJs.',
    },
  ],
  related: [
    { label: 'Clientes', to: '/clientes' },
  ],
  version: 2,
};

export const administracaoHelp: HelpEntry = {
  route: '/administracao',
  title: 'Administração',
  summary: 'Configurações da empresa, usuários, permissões, certificado digital, branding, e-mail e parâmetros fiscais.',
  sections: [
    {
      heading: 'Acesso restrito',
      body: 'Toda esta área é acessível apenas para usuários com perfil Admin. Alterações afetam todos os usuários e são registradas em auditoria com diff antes/depois.',
    },
    {
      heading: 'Empresa',
      body: 'Dados cadastrais (CNPJ, IE, regime tributário), endereço de remetente padrão para etiquetas Correios, contatos públicos e branding (logo, cores). Mudanças de branding refletem em relatórios, e-mails e apresentações.',
    },
    {
      heading: 'Usuários e permissões',
      body: 'Crie usuários e atribua permissões granulares por módulo (visualizar, editar, excluir, rentabilidade, fiscal, etc). Sessões podem ser revogadas individualmente. Convites por e-mail com expiração.',
    },
    {
      heading: 'Papéis (RBAC)',
      body: 'Os perfis padrão são Admin, Estoquista, Financeiro, Vendedor e Comprador — cada um com conjunto de permissões. É possível criar perfis customizados via permissões granulares no usuário.',
    },
    {
      heading: 'Fiscal',
      body: 'Upload do certificado A1 (.pfx) com senha em cofre seguro (Vault). Configuração de série, ambiente (homologação/produção), CFOPs padrão por operação e regras de tributação.',
    },
    {
      heading: 'E-mail (SMTP)',
      body: 'Configuração SMTP, templates transacionais (orçamento disponível, NF emitida, etc) e teste de envio. Fila assíncrona (pgmq) garante que falhas não travem o sistema.',
    },
    {
      heading: 'Apresentação e cadência',
      body: 'Configure templates da Apresentação gerencial e cadência de envio automático (semanal/mensal) para destinatários cadastrados.',
    },
    {
      heading: 'Webhooks',
      body: 'Cadastre URLs externas para receber eventos (pedido faturado, NF autorizada, baixa registrada). Útil para integrar com sistemas de BI ou CRM externo.',
    },
  ],
  related: [
    { label: 'Auditoria', to: '/auditoria' },
    { label: 'Configurações pessoais', to: '/configuracoes' },
  ],
  tour: [
    {
      target: 'administracao.tabs',
      title: 'Áreas da administração',
      body: 'Cada aba é uma área isolada: Empresa, Usuários, Fiscal, E-mail, Webhooks, Backup, etc. Mudanças aqui afetam todos os usuários e ficam em Auditoria com diff antes/depois.',
    },
    {
      target: '',
      title: 'Usuários e permissões granulares',
      body: 'Em Usuários você cria contas, revoga sessões e atribui permissões granulares por módulo. Permissões em user_permissions vencem sobre o papel quando há revogação explícita.',
    },
    {
      target: '',
      title: 'Certificado A1 e fiscal',
      body: 'Em Fiscal, faça upload do certificado .pfx (a senha vai para o Vault). Configure série, ambiente e CFOPs padrão antes da primeira emissão de NF-e.',
    },
  ],
  version: 3,
};

export const auditoriaHelp: HelpEntry = {
  route: '/auditoria',
  title: 'Auditoria',
  summary: 'Histórico imutável de operações sensíveis: criações, edições, exclusões e mudanças de status com diff campo-a-campo.',
  sections: [
    {
      heading: 'O que é registrado',
      body: 'Toda operação relevante: cadastros (clientes, produtos, fornecedores), documentos (orçamentos, pedidos, NFs), baixas financeiras, ajustes de estoque, mudanças de permissão e configurações de admin.',
    },
    {
      heading: 'Filtros',
      body: 'Por usuário, módulo, tipo de ação (create/update/delete/cancel/etc.), período e termo livre. Cada linha permite ver o diff (antes/depois) dos campos alterados.',
    },
    {
      heading: 'Diff visual',
      body: 'O diff destaca em verde campos adicionados e em vermelho campos removidos/alterados. Para alterações de status, mostra a transição (ex.: "rascunho → aprovado").',
    },
    {
      heading: 'Imutabilidade',
      body: 'Os registros não podem ser editados nem excluídos — nem por administradores. Garantia para conformidade fiscal/societária.',
    },
    {
      heading: 'Retenção',
      body: 'Auditoria é retida indefinidamente por padrão. Configurações de purga por antiguidade só são aplicáveis com aprovação do compliance.',
    },
  ],
  tour: [
    {
      target: 'auditoria.filtros',
      title: 'Filtros de auditoria',
      body: 'Filtre por usuário, módulo, tipo de ação, período e severidade. O filtro de criticidade é aplicado no servidor — cobre todas as páginas, não só a atual.',
    },
    {
      target: 'auditoria.tabela',
      title: 'Lista de eventos',
      body: 'Cada linha mostra ator, ação, módulo e timestamp. Clique para ver o diff campo-a-campo do antes/depois.',
    },
    {
      target: '',
      title: 'Imutabilidade',
      body: 'Eventos de auditoria não podem ser editados nem excluídos — nem por administradores. Garantia de conformidade fiscal e societária.',
    },
  ],
  version: 3,
};

export const configuracoesHelp: HelpEntry = {
  route: '/configuracoes',
  title: 'Configurações',
  summary: 'Preferências pessoais: perfil, segurança, aparência, ajuda e dados básicos da empresa (apenas admins).',
  sections: [
    {
      heading: 'Quatro abas',
      body: 'Meu perfil (nome, foto, e-mail), Segurança (senha, sessões ativas, revogação), Aparência (tema, densidade, fonte, layout do menu, sugestão de tour) e Empresa (apenas admins).',
    },
    {
      heading: 'Onde fica o quê',
      body: 'Configurações que afetam apenas você ficam aqui. Configurações que afetam toda a empresa (usuários, fiscal, branding, SMTP) ficam em Administração.',
    },
    {
      heading: 'Aparência',
      body: 'Tema (claro/escuro/automático), densidade (confortável/compacta), fonte (sans/serif), formato do menu (sidebar/topbar) e controle dos tours guiados (sugestão automática + reiniciar).',
    },
    {
      heading: 'Segurança',
      body: 'Trocar senha, ver sessões ativas em outros dispositivos e revogar sessões individualmente. Trocar e-mail dispara confirmação no novo endereço.',
    },
    {
      heading: 'Tours guiados',
      body: 'Em Aparência, você controla se a sugestão de tour aparece em telas novas e pode reiniciar todos os tours já vistos para revisitar manuais e demonstrações.',
    },
  ],
  related: [
    { label: 'Administração', to: '/administracao' },
    { label: 'Central de ajuda', to: '/ajuda' },
  ],
  version: 2,
};
