/**
 * Camada de serviços para o pipeline de importação/staging.
 *
 * Encapsula toda a I/O Supabase usada pelos hooks `src/hooks/importacao/*`:
 * criação de lotes, inserção em staging (em chunks), logs, RPCs de
 * consolidação e cancelamento. Hooks de UI ficam responsáveis apenas pelo
 * parsing de planilhas, validação local e gestão de estado.
 *
 * Convenção: funções jogam erro (não retornam `{data, error}`); o caller
 * decide UX (toast/retry).
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

// ────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ────────────────────────────────────────────────────────────────────────────

export type StagingTable =
  | "stg_cadastros"
  | "stg_estoque_inicial"
  | "stg_financeiro_aberto"
  | "stg_faturamento";

export type ConsolidacaoRpc =
  | "consolidar_lote_cadastros"
  | "consolidar_lote_estoque"
  | "consolidar_lote_financeiro"
  | "consolidar_lote_faturamento"
  | "consolidar_lote_enriquecimento"
  | "carga_inicial_conciliacao"
  | "carga_inicial_processar_extras"
  | "merge_lote_conciliacao";

export interface CreateLoteInput {
  tipo: string;
  arquivo_nome?: string | null;
  fase?: string | null;
  total_registros: number;
  registros_sucesso?: number;
  registros_erro?: number;
  registros_atualizados?: number;
  registros_duplicados?: number;
  registros_ignorados?: number;
  resumo?: Record<string, unknown> | null;
  erros?: unknown;
  status?: string;
}

export interface ConsolidacaoResult {
  inseridos?: number;
  atualizados?: number;
  erros?: number;
  ignorados?: number;
  duplicados?: number;
  pendentes_vinculo?: number;
  erro?: string;
  // Faturamento
  nfs_inseridas?: number;
  itens_inseridos?: number;
  vinculados?: number;
  duvidosos?: number;
  nao_vinculados?: number;
  descontinuados_criados?: number;
  // Carga inicial
  fornecedores?: number;
  clientes?: number;
  produtos?: number;
  insumos?: number;
  cr?: number;
  cp?: number;
  estoque?: number;
  extras?: unknown;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// Lookups (pré-fetch para validação/dedup nos hooks)
// ────────────────────────────────────────────────────────────────────────────

export async function listProdutosLookup() {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, codigo_interno, codigo_legado, sku, nome, preco_custo, preco_venda, estoque_atual");
  if (error) throw error;
  return data ?? [];
}

export async function listClientesLookup(opts: { activeOnly?: boolean } = {}) {
  let q = supabase.from("clientes").select("id, nome_razao_social, nome_fantasia, cpf_cnpj, codigo_legado");
  if (opts.activeOnly) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listFornecedoresLookup(opts: { activeOnly?: boolean } = {}) {
  let q = supabase.from("fornecedores").select("id, nome_razao_social, nome_fantasia, cpf_cnpj, codigo_legado");
  if (opts.activeOnly) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listContasContabeisLookup() {
  const { data, error } = await supabase
    .from("contas_contabeis")
    .select("id, codigo, descricao")
    .eq("ativo", true);
  if (error) throw error;
  return data ?? [];
}

export async function listProdutoIdentificadoresLegacy() {
  const { data, error } = await supabase
    .from("produto_identificadores_legacy")
    .select("produto_id, codigo_legacy, descricao_normalizada")
    .eq("ativo", true);
  if (error) throw error;
  return data ?? [];
}

/** Filtra duplicados existentes em `notas_fiscais` por chave_acesso ou (numero,serie,data). */
export async function findNotasFiscaisExistentes(
  chaves: string[],
  numeros: string[],
) {
  const [byChave, byNumero] = await Promise.all([
    chaves.length
      ? supabase.from("notas_fiscais").select("chave_acesso").in("chave_acesso", chaves)
      : Promise.resolve({ data: [], error: null }),
    numeros.length
      ? supabase
          .from("notas_fiscais")
          .select("numero, serie, data_emissao")
          .eq("origem", "importacao_historica")
          .in("numero", numeros)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byChave.error) throw byChave.error;
  if (byNumero.error) throw byNumero.error;
  return {
    porChave: (byChave.data ?? []) as { chave_acesso: string | null }[],
    porNumero: (byNumero.data ?? []) as { numero: string; serie: string | null; data_emissao: string | null }[],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Lotes (importacao_lotes)
// ────────────────────────────────────────────────────────────────────────────

/** Cria um lote em status `staging` (default) e retorna o id. */
export async function createImportacaoLote(input: CreateLoteInput): Promise<string> {
  const { data: userResp } = await supabase.auth.getUser();
  const payload: TablesInsert<"importacao_lotes"> = {
    tipo: input.tipo,
    arquivo_nome: input.arquivo_nome ?? null,
    status: input.status ?? "staging",
    fase: input.fase ?? null,
    total_registros: input.total_registros,
    registros_sucesso: input.registros_sucesso ?? 0,
    registros_erro: input.registros_erro ?? 0,
    registros_atualizados: input.registros_atualizados ?? 0,
    registros_duplicados: input.registros_duplicados ?? 0,
    registros_ignorados: input.registros_ignorados ?? 0,
    usuario_id: userResp?.user?.id ?? null,
    resumo: (input.resumo ?? null) as never,
    erros: (input.erros ?? null) as never,
  };
  const { data, error } = await supabase
    .from("importacao_lotes")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateLoteStatus(loteId: string, status: string, extra?: Partial<TablesInsert<"importacao_lotes">>) {
  const { error } = await supabase
    .from("importacao_lotes")
    .update({ status, ...(extra ?? {}) })
    .eq("id", loteId);
  if (error) throw error;
}

export async function cancelarLote(loteId: string, stagingTable: StagingTable) {
  // 1) limpa staging do lote
  const { error: errDel } = await supabase.from(stagingTable).delete().eq("lote_id", loteId);
  if (errDel) throw errDel;
  // 2) marca lote como cancelado
  await updateLoteStatus(loteId, "cancelado");
  // 3) log
  await logImportacao(loteId, "warn", "Lote cancelado pelo usuário.");
}

// ────────────────────────────────────────────────────────────────────────────
// Staging (insert em chunks)
// ────────────────────────────────────────────────────────────────────────────

/** Inserção em chunks (default 500) — qualquer erro é propagado. */
export async function insertStagingChunks<T extends { lote_id: string; status?: string; dados: unknown }>(
  table: StagingTable,
  rows: T[],
  chunkSize = 500,
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk as never);
    if (error) throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Logs
// ────────────────────────────────────────────────────────────────────────────

export async function logImportacao(
  loteId: string,
  nivel: "info" | "warn" | "error",
  mensagem: string,
  etapa?: string,
) {
  const payload: TablesInsert<"importacao_logs"> = {
    lote_id: loteId,
    nivel,
    mensagem,
    etapa: etapa ?? null,
  };
  const { error } = await supabase.from("importacao_logs").insert(payload);
  if (error) throw error;
}

export async function logImportacaoBatch(
  rows: TablesInsert<"importacao_logs">[],
) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("importacao_logs").insert(rows);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────────────────
// Consolidação (RPCs)
// ────────────────────────────────────────────────────────────────────────────

/** Executa a RPC de consolidação e devolve o JSON tipado. */
export async function consolidarLote(
  rpc: ConsolidacaoRpc,
  params: Record<string, unknown>,
): Promise<ConsolidacaoResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(rpc, params);
  if (error) throw error;
  return (data ?? {}) as ConsolidacaoResult;
}

// ────────────────────────────────────────────────────────────────────────────
// Atalhos específicos usados pela UI atual
// ────────────────────────────────────────────────────────────────────────────

export async function consolidarCadastros(loteId: string) {
  return consolidarLote("consolidar_lote_cadastros", { p_lote_id: loteId });
}

export async function consolidarEstoque(loteId: string) {
  return consolidarLote("consolidar_lote_estoque", { p_lote_id: loteId });
}

export async function consolidarFinanceiro(loteId: string) {
  return consolidarLote("consolidar_lote_financeiro", { p_lote_id: loteId });
}

export async function consolidarFaturamento(loteId: string) {
  return consolidarLote("consolidar_lote_faturamento", { p_lote_id: loteId });
}

export async function consolidarEnriquecimento(loteId: string) {
  return consolidarLote("consolidar_lote_enriquecimento", { p_lote_id: loteId });
}

export async function cargaInicialConciliacao(loteId: string, force = false) {
  return consolidarLote("carga_inicial_conciliacao", { p_lote_id: loteId, p_force: force });
}

export async function cargaInicialProcessarExtras(loteId: string) {
  return consolidarLote("carga_inicial_processar_extras", { p_lote_id: loteId });
}

export async function mergeLoteConciliacao(loteId: string) {
  return consolidarLote("merge_lote_conciliacao", { p_lote_id: loteId });
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers usados pelo XML importer (ver `useImportacaoXml.ts`)
// ────────────────────────────────────────────────────────────────────────────

export async function listFornecedoresParaXml() {
  const { data, error } = await supabase.from("fornecedores").select("id, cpf_cnpj");
  if (error) throw error;
  return data ?? [];
}

export async function findNotasFiscaisPorChaves(chaves: string[]) {
  if (chaves.length === 0) return [] as { chave_acesso: string | null }[];
  const { data, error } = await supabase
    .from("notas_fiscais")
    .select("chave_acesso")
    .in("chave_acesso", chaves);
  if (error) throw error;
  return data ?? [];
}

export async function inserirCompraXml(payload: TablesInsert<"compras">) {
  const { error } = await supabase.from("compras").insert(payload);
  return { error };
}

// ────────────────────────────────────────────────────────────────────────────
// Operações administrativas (limpeza / relatórios)
// ────────────────────────────────────────────────────────────────────────────

export interface LimparDadosMigracaoResult {
  ok?: boolean;
  erro?: string;
  apagados?: Record<string, number>;
}

export async function limparDadosMigracao(): Promise<LimparDadosMigracaoResult> {
  const { data, error } = await supabase.rpc("limpar_dados_migracao", {
    p_confirmar: true,
  });
  if (error) throw error;
  return (data ?? {}) as LimparDadosMigracaoResult;
}

export async function fetchRelatorioMigracaoFaturamento<T = unknown>(
  loteId: string,
): Promise<T> {
  // RPC não tipada — cast `as never` mantém o resto do código tipado.
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: unknown }>)(
    "relatorio_migracao_faturamento",
    { p_lote_id: loteId },
  );
  if (error) throw error;
  return data as T;
}
