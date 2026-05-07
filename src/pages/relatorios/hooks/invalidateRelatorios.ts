/**
 * Helper de invalidação cross-módulo dos relatórios.
 *
 * Mutations dos módulos de origem (Financeiro, Comercial, Compras, Estoque,
 * Fiscal) devem chamar `invalidateRelatoriosByDomain('financeiro')` para que
 * os relatórios derivados sejam re-buscados na próxima visualização — sem
 * esperar o `staleTime` de 10min do `useRelatorio`.
 *
 * Mantém um único ponto de mapeamento entre domínios e tipos de relatório,
 * evitando que cada chamador conheça os identificadores internos.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { TipoRelatorio } from '@/services/relatorios.service';

export type RelatorioDomain =
  | 'financeiro'
  | 'comercial'
  | 'compras'
  | 'estoque'
  | 'fiscal'
  | 'cadastros';

const DOMAIN_TO_TIPOS: Record<RelatorioDomain, TipoRelatorio[]> = {
  financeiro: ['financeiro', 'fluxo_caixa', 'aging', 'dre'] as TipoRelatorio[],
  comercial: ['vendas', 'faturamento', 'curva_abc', 'margem_produtos'] as TipoRelatorio[],
  compras: ['compras'] as TipoRelatorio[],
  estoque: [
    'estoque',
    'movimentos_estoque',
    'estoque_minimo',
    'curva_abc',
    'margem_produtos',
  ] as TipoRelatorio[],
  fiscal: ['faturamento'] as TipoRelatorio[],
  cadastros: [] as TipoRelatorio[],
};

/**
 * Invalida todas as queries de relatório associadas ao domínio informado.
 * Aceita múltiplos domínios para mutations cross-cutting.
 */
export function invalidateRelatoriosByDomain(
  qc: QueryClient,
  ...domains: RelatorioDomain[]
): void {
  const tipos = new Set<TipoRelatorio>();
  domains.forEach((d) => DOMAIN_TO_TIPOS[d]?.forEach((t) => tipos.add(t)));

  if (!tipos.size) {
    qc.invalidateQueries({ queryKey: ['relatorio'] });
    return;
  }

  tipos.forEach((tipo) => {
    qc.invalidateQueries({ queryKey: ['relatorio', tipo] });
  });
}