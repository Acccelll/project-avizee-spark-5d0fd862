/**
 * Barrel central dos query keys do ERP.
 *
 * Cada módulo define seu objeto `*Keys` com factories tipadas para evitar
 * strings duplicadas e garantir invalidations consistentes. Importe via
 * `import { fiscalKeys, comercialKeys } from "@/lib/queryKeys"`.
 */

export { fiscalKeys } from "./fiscal";
export { comercialKeys } from "./comercial";
export { financeiroKeys } from "./financeiro";
export { estoqueKeys } from "./estoque";
export { cadastrosKeys } from "./cadastros";
export { logisticaKeys } from "./logistica";