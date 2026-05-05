/**
 * Relatórios — orquestrador (dispatcher).
 *
 * Este arquivo expõe a API pública do módulo de relatórios e delega cada
 * `TipoRelatorio` ao loader específico em `services/relatorios/loaders/*`.
 *
 * Antes da Fase 6 este arquivo concentrava todas as queries (1300+ linhas);
 * agora ele só roteia. Para alterar a lógica de um relatório específico,
 * edite o loader correspondente:
 *
 *   - estoque, movimentos_estoque, margem_produtos, estoque_minimo
 *       → loaders/estoque.ts
 *   - financeiro, fluxo_caixa, aging, dre
 *       → loaders/financeiro.ts
 *   - vendas, faturamento, vendas_cliente, curva_abc
 *       → loaders/comercial.ts
 *   - compras, compras_fornecedor
 *       → loaders/compras.ts
 *   - divergencias
 *       → loaders/divergencias.ts
 */

import type { ReportMeta } from "@/types/relatorios";
import {
  loadEstoque,
  loadMovimentosEstoque,
  loadMargemProdutos,
  loadEstoqueMinimo,
} from "@/services/relatorios/loaders/estoque";
import {
  loadFinanceiro,
  loadFluxoCaixa,
  loadAging,
  loadDre,
} from "@/services/relatorios/loaders/financeiro";
import {
  loadVendas,
  loadFaturamento,
  loadVendasCliente,
  loadCurvaAbc,
} from "@/services/relatorios/loaders/comercial";
import {
  loadCompras,
  loadComprasFornecedor,
  loadNfeEntrada,
} from "@/services/relatorios/loaders/compras";
import { loadDivergencias } from "@/services/relatorios/loaders/divergencias";
import {
  loadCadastroProdutos,
  loadCadastroClientes,
  loadCadastroFornecedores,
  loadCadastroTransportadoras,
} from "@/services/relatorios/loaders/cadastros";

// Re-export tipos públicos para preservar a API existente.
export type {
  TipoRelatorio,
  FiltroRelatorio,
  RelatorioResultado,
} from "@/services/relatorios/lib/shared";
export type { ReportMeta } from "@/types/relatorios";
export { formatCellValue } from "@/services/relatorios/lib/formatCell";

import type {
  TipoRelatorio,
  FiltroRelatorio,
  RelatorioResultado,
} from "@/services/relatorios/lib/shared";

export async function carregarRelatorio(
  tipo: TipoRelatorio,
  filtros: FiltroRelatorio = {},
): Promise<RelatorioResultado> {
  switch (tipo) {
    case "estoque":
      return loadEstoque(filtros);
    case "movimentos_estoque":
      return loadMovimentosEstoque(filtros);
    case "margem_produtos":
      return loadMargemProdutos(filtros);
    case "estoque_minimo":
      return loadEstoqueMinimo(filtros);

    case "financeiro":
      return loadFinanceiro(filtros);
    case "fluxo_caixa":
      return loadFluxoCaixa(filtros);
    case "dre":
      return loadDre(filtros);

    case "vendas":
      return loadVendas(filtros);
    case "faturamento":
      return loadFaturamento(filtros);
    case "vendas_cliente":
      return loadVendasCliente(filtros);
    case "curva_abc":
      return loadCurvaAbc(filtros);

    case "compras":
      return loadCompras(filtros);
    case "compras_fornecedor":
      return loadComprasFornecedor(filtros);
    case "nfe_entrada":
      return loadNfeEntrada(filtros);

    case "divergencias":
      return loadDivergencias(filtros);

    case "cadastro_produtos":
      return loadCadastroProdutos(filtros);
    case "cadastro_clientes":
      return loadCadastroClientes(filtros);
    case "cadastro_fornecedores":
      return loadCadastroFornecedores(filtros);
    case "cadastro_transportadoras":
      return loadCadastroTransportadoras(filtros);

    case "aging":
    default:
      return loadAging(filtros);
  }
}

// Garante que o tipo ReportMeta permanece exportado mesmo que não seja
// referenciado diretamente no dispatcher (consumidores podem importá-lo daqui).
export type _ReportMetaAlias = ReportMeta;
