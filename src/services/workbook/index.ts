/**
 * Barrel para o domínio Workbook.
 * - workbookData: leituras tipadas usadas pelo agregador `fetchWorkbookData`.
 * - workbookGenerator: orquestra geração de templates/fechamentos via ExcelJS.
 */
export * from './workbookData.service';
export * from './workbookGenerator.service';
