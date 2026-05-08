import type { HelpEntry } from './types';
import { dashboardHelp } from './entries/dashboard';
import { orcamentosHelp } from './entries/orcamentos';
import { pedidosHelp } from './entries/pedidos';
import { fiscalHelp } from './entries/fiscal';
import { estoqueHelp } from './entries/estoque';
import { financeiroHelp } from './entries/financeiro';
import { logisticaHelp } from './entries/logistica';
import { clientesHelp } from './entries/clientes';
import { produtosHelp } from './entries/produtos';
import {
  pedidosCompraHelp,
  cotacoesCompraHelp,
  contasBancariasHelp,
  conciliacaoHelp,
  fluxoCaixaHelp,
  relatoriosHelp,
  workbookHelp,
  apresentacaoHelp,
  fornecedoresHelp,
} from './entries/lote2';
import {
  transportadorasHelp,
  funcionariosHelp,
  sociosHelp,
  formasPagamentoHelp,
  gruposEconomicosHelp,
  administracaoHelp,
  auditoriaHelp,
  configuracoesHelp,
} from './entries/lote3';
import { socialHelp } from './entries/social';
import { faturamentoHelp } from './entries/faturamento';
import { migracaoDadosHelp } from './entries/migracaoDados';
import { fiscalDistdfeHelp } from './entries/fiscalDistdfe';

/**
 * Registry central da ajuda. Mapeia rotas → conteúdo do manual e do tour.
 * Lookup faz match por rota mais específica (prefix match descendente).
 */
export const HELP_REGISTRY: Record<string, HelpEntry> = {
  '/': dashboardHelp,
  '/orcamentos': orcamentosHelp,
  '/pedidos': pedidosHelp,
  '/fiscal': fiscalHelp,
  '/estoque': estoqueHelp,
  '/financeiro': financeiroHelp,
  '/logistica': logisticaHelp,
  '/clientes': clientesHelp,
  '/produtos': produtosHelp,

  // Lote 2 — secundários, manual sem tour
  '/pedidos-compra': pedidosCompraHelp,
  '/cotacoes-compra': cotacoesCompraHelp,
  '/fornecedores': fornecedoresHelp,
  '/contas-bancarias': contasBancariasHelp,
  '/conciliacao': conciliacaoHelp,
  '/fluxo-caixa': fluxoCaixaHelp,
  '/relatorios': relatoriosHelp,
  '/relatorios/workbook-gerencial': workbookHelp,
  '/relatorios/apresentacao-gerencial': apresentacaoHelp,

  // Lote 3 — auxiliares, manual curto
  '/transportadoras': transportadorasHelp,
  '/funcionarios': funcionariosHelp,
  '/socios': sociosHelp,
  '/formas-pagamento': formasPagamentoHelp,
  '/grupos-economicos': gruposEconomicosHelp,
  '/administracao': administracaoHelp,
  '/auditoria': auditoriaHelp,
  '/configuracoes': configuracoesHelp,

  // Onda 10 — cobertura de módulos visíveis sem ajuda contextual
  '/social': socialHelp,
  '/faturamento': faturamentoHelp,
  '/migracao-dados': migracaoDadosHelp,
  '/fiscal/distdfe-historico': fiscalDistdfeHelp,
};

/**
 * Resolve a entry de ajuda para um pathname. Faz match exato primeiro,
 * depois cai para o prefixo mais específico (`/orcamentos/123` → `/orcamentos`).
 */
export function resolveHelpEntry(pathname: string): HelpEntry | null {
  if (HELP_REGISTRY[pathname]) return HELP_REGISTRY[pathname];
  const candidates = Object.keys(HELP_REGISTRY)
    .filter((route) => route !== '/' && pathname.startsWith(route + '/'))
    .sort((a, b) => b.length - a.length);
  return candidates[0] ? HELP_REGISTRY[candidates[0]] : null;
}

export function listHelpEntries(): HelpEntry[] {
  return Object.values(HELP_REGISTRY).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}