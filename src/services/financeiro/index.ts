/**
 * Barrel público do namespace `services/financeiro/*`.
 *
 * Submódulos:
 *  - baixas         → processarBaixaLote, criarPlanoBaixaLote
 *  - estornos       → processarEstorno
 *  - cancelamentos  → cancelarLancamento
 *  - conciliacao    → matching e persistência de pares
 *  - calculos       → helpers puros (gerarParcelas, etc.)
 *  - ofxParser      → parser de extratos OFX
 *  - titulos        → contratos legados (apenas tipos / wrappers)
 */

export {
  processarBaixaLote,
  criarPlanoBaixaLote,
} from "./baixas";
export type { BaixaItemOverride, BaixaLoteParams } from "./baixas";

export { fetchBaixasAtivasDoLancamento, type BaixaAtiva } from "./baixas";

export { processarEstorno } from "./estornos";
export { cancelarLancamento } from "./cancelamentos";
export { createLancamento, type LancamentoInsert } from "./lancamentos";

export { getEffectiveStatus } from "@/lib/financeiro";

export type { Parcela } from "./calculosFinanceiros.service";
export { gerarParcelas } from "./calculosFinanceiros.service";