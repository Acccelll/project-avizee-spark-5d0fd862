/**
 * Facade do domínio Fiscal — re-exporta os submódulos especializados para
 * preservar imports legados. Novos módulos devem importar diretamente de
 * `@/services/fiscal/*`.
 *
 * Submódulos:
 *  - eventos.service       → registro manual de eventos da NF
 *  - lifecycle.service     → confirmar/estornar/cancelar/devolver/upsert
 *  - sefaz.service         → registrarRetornoSefaz, verificarDuplicidadeChave
 *  - lookups.service       → ordens, contas, pedidos, detalhes, anexos
 *  - empresaConfig.service → empresa_config get/upsert
 */
export { registrarEventoFiscal } from "./fiscal/eventos.service";
export {
  cancelarNotaFiscal,
  cancelarNotaFiscalSefaz,
  inutilizarNotaFiscal,
  confirmarNotaFiscal,
  estornarNotaFiscal,
  gerarDevolucaoNotaFiscal,
  upsertNotaFiscalComItens,
  vincularNFPedidoCompra,
  desvincularNFPedidoCompra,
} from "./fiscal/lifecycle.service";
export type { ItemDevolucao } from "./fiscal/lifecycle.service";
export {
  registrarRetornoSefaz,
  verificarDuplicidadeChave,
} from "./fiscal/sefaz.service";
export {
  listOrdensVendaParaFiscal,
  listContasContabeisLancaveis,
  getPedidoCompraResumo,
  listNotaFiscalItensCompletos,
  listPedidosCompraParaVincular,
  fetchNotaFiscalDetalhes,
  getNotaFiscalAnexoSignedUrl,
  permanentDeleteRecord,
} from "./fiscal/lookups.service";
export type { PedidoCompraOpcao, PermanentDeleteTable } from "./fiscal/lookups.service";
export {
  getEmpresaConfigPrincipal,
  getEmpresaConfig,
  upsertEmpresaConfig,
} from "./fiscal/empresaConfig.service";

/** Re-exported from `@/lib/fiscal` for backward compatibility. */
export { calcularCfopDevolucao } from "@/lib/fiscal";
