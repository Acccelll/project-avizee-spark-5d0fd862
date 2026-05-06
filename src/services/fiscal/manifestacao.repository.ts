/**
 * Repositório da Manifestação do Destinatário e dados auxiliares
 * (CC-e e Inutilização).
 *
 * Encapsula TODAS as chamadas diretas a `supabase.from(...)` que antes
 * estavam espalhadas em `ManifestacaoDestinatarioDrawer`, `CartaCorrecaoDrawer`
 * e `InutilizacaoDrawer`. Os drawers passam a depender apenas desta camada,
 * preservando comportamento (e índices/RLS) atual.
 */

import { supabase } from "@/integrations/supabase/client";
import type { AmbienteSefaz } from "@/services/fiscal/sefaz";

// ── Tipos compartilhados ───────────────────────────────────────────────────────

export interface NfeCapturadaRow {
  id: string;
  chave_acesso: string;
  cnpj_emitente: string | null;
  nome_emitente: string | null;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  protocolo_autorizacao: string | null;
  status_manifestacao: string;
  data_manifestacao: string | null;
  observacao: string | null;
  xml_importado: boolean;
  processado?: boolean;
  data_processamento?: string | null;
}

export interface NfeDistItemRow {
  id: string;
  numero_item: number;
  codigo: string | null;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  produto_id: string | null;
}

export interface EventoCCeRow {
  id: string;
  sequencia: number;
  correcao: string | null;
  protocolo: string | null;
  data_evento: string | null;
  status_sefaz: string;
  motivo_retorno: string | null;
  created_at: string;
}

export interface InutilizacaoRow {
  id: string;
  serie: number;
  ano: number;
  numero_inicial: number;
  numero_final: number;
  justificativa: string;
  protocolo: string | null;
  status_sefaz: string;
  motivo_retorno: string | null;
  created_at: string;
}

export interface FornecedorMinRow {
  id: string;
  nome_razao_social: string | null;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
}

export interface ProdutoMinRow {
  id: string;
  sku: string | null;
  nome: string;
}

export interface EmpresaSefazContext {
  cnpj: string;
  uf: string;
  ambiente: AmbienteSefaz;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Resolve CNPJ + UF + ambiente SEFAZ a partir de `empresa_config`.
 * `requireUf=true` falha quando UF é necessária (CC-e, inutilização).
 */
export async function getEmpresaSefazContext(
  options: { requireUf?: boolean } = {},
): Promise<EmpresaSefazContext> {
  const { data: cfg, error } = await supabase
    .from("empresa_config")
    .select("uf, ambiente_sefaz, ambiente_padrao, cnpj")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!cfg?.cnpj) {
    throw new Error("Configuração da empresa incompleta (CNPJ).");
  }
  if (options.requireUf && !cfg.uf) {
    throw new Error("Configuração da empresa incompleta (UF).");
  }
  let ambiente: AmbienteSefaz = "2";
  if (cfg.ambiente_sefaz === "1" || cfg.ambiente_sefaz === "2")
    ambiente = cfg.ambiente_sefaz as AmbienteSefaz;
  else if (cfg.ambiente_padrao === "producao") ambiente = "1";
  return {
    cnpj: cfg.cnpj,
    uf: (cfg.uf ?? "").toUpperCase(),
    ambiente,
  };
}

// ── Manifestação destinatário ─────────────────────────────────────────────────

export async function listNfeCapturadas(limit = 100): Promise<NfeCapturadaRow[]> {
  const { data, error } = await supabase
    .from("nfe_distribuicao")
    .select(
      "id, chave_acesso, cnpj_emitente, nome_emitente, numero, serie, data_emissao, valor_total, protocolo_autorizacao, status_manifestacao, data_manifestacao, observacao, xml_importado, processado, data_processamento",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NfeCapturadaRow[];
}

export interface InsertNfeDistribuicaoInput {
  chave_acesso: string;
  cnpj_emitente: string;
  numero: string;
  serie: string;
  data_emissao: string | null;
}

/**
 * Insere uma chave capturada manualmente. Retorna `{ duplicado: true }` quando
 * a UNIQUE de chave_acesso é violada (código 23505) — caller exibe mensagem.
 */
export async function insertNfeDistribuicaoPorChave(
  input: InsertNfeDistribuicaoInput,
): Promise<{ duplicado: boolean }> {
  const usuario_id = await currentUserId();
  const { error } = await supabase.from("nfe_distribuicao").insert({
    chave_acesso: input.chave_acesso,
    cnpj_emitente: input.cnpj_emitente,
    numero: input.numero,
    serie: input.serie,
    data_emissao: input.data_emissao,
    status_manifestacao: "sem_manifestacao",
    usuario_id,
  });
  if (error) {
    if (error.code === "23505") return { duplicado: true };
    throw error;
  }
  return { duplicado: false };
}

export interface RegistrarEventoManifestacaoInput {
  nfe_distribuicao_id: string;
  tipo_evento: string;
  codigo_evento: string;
  justificativa?: string | null;
  protocolo?: string | null;
  data_evento?: string | null;
  status_sefaz: "autorizado" | "rejeitado";
  motivo_retorno?: string | null;
  xml_retorno?: string | null;
}

export async function registrarEventoManifestacao(
  input: RegistrarEventoManifestacaoInput,
): Promise<void> {
  const usuario_id = await currentUserId();
  const { error } = await supabase.from("eventos_fiscais").insert({
    nfe_distribuicao_id: input.nfe_distribuicao_id,
    tipo_evento: input.tipo_evento,
    codigo_evento: input.codigo_evento,
    sequencia: 1,
    justificativa: input.justificativa ?? null,
    protocolo: input.protocolo ?? null,
    data_evento: input.data_evento ?? new Date().toISOString(),
    status_sefaz: input.status_sefaz,
    motivo_retorno: input.motivo_retorno ?? null,
    xml_retorno: input.xml_retorno ?? null,
    usuario_id,
  });
  if (error) throw error;
}

export async function atualizarStatusManifestacao(input: {
  nfeId: string;
  status: string;
  dataManifestacao: string;
}): Promise<void> {
  const { error } = await supabase
    .from("nfe_distribuicao")
    .update({
      status_manifestacao: input.status,
      data_manifestacao: input.dataManifestacao,
    })
    .eq("id", input.nfeId);
  if (error) throw error;
}

export interface UpsertNfeFromXmlInput {
  chave_acesso: string;
  cnpj_emitente: string;
  nome_emitente: string | null;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  valor_icms: number | null;
  valor_ipi: number | null;
  natureza_operacao: string | null;
  uf_emitente: string | null;
  ie_emitente: string | null;
  protocolo: string | null;
  xml: string;
  itens: Array<{
    numero: number;
    codigo: string | null;
    descricao: string;
    ncm: string | null;
    cfop: string | null;
    unidade: string | null;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }>;
}

/**
 * Upsert atômico (do ponto de vista do cliente) do header + reescrita de itens
 * a partir de um XML autorizado. Mantém status_manifestacao existente.
 */
export async function upsertNfeFromXml(
  input: UpsertNfeFromXmlInput,
): Promise<{ id: string }> {
  const usuario_id = await currentUserId();
  const payloadHeader = {
    chave_acesso: input.chave_acesso,
    cnpj_emitente: input.cnpj_emitente,
    nome_emitente: input.nome_emitente,
    numero: input.numero,
    serie: input.serie,
    data_emissao: input.data_emissao,
    valor_total: input.valor_total,
    valor_icms: input.valor_icms,
    valor_ipi: input.valor_ipi,
    natureza_operacao: input.natureza_operacao,
    uf_emitente: input.uf_emitente,
    ie_emitente: input.ie_emitente,
    protocolo_autorizacao: input.protocolo,
    xml_nfe: input.xml,
    xml_importado: true,
    usuario_id,
  };

  const { data: upserted, error } = await supabase
    .from("nfe_distribuicao")
    .upsert(payloadHeader, { onConflict: "chave_acesso" })
    .select("id")
    .single();
  if (error) throw error;

  await supabase
    .from("nfe_distribuicao_itens")
    .delete()
    .eq("nfe_distribuicao_id", upserted.id);

  if (input.itens.length > 0) {
    const rows = input.itens.map((it) => ({
      nfe_distribuicao_id: upserted.id,
      numero_item: it.numero,
      codigo: it.codigo,
      descricao: it.descricao,
      ncm: it.ncm,
      cfop: it.cfop,
      unidade: it.unidade,
      quantidade: it.quantidade,
      valor_unitario: it.valorUnitario,
      valor_total: it.valorTotal,
    }));
    const { error: itErr } = await supabase
      .from("nfe_distribuicao_itens")
      .insert(rows);
    if (itErr) throw itErr;
  }

  return { id: upserted.id };
}

export async function listNfeDistribuicaoItens(
  nfeId: string,
): Promise<NfeDistItemRow[]> {
  const { data, error } = await supabase
    .from("nfe_distribuicao_itens")
    .select(
      "id, numero_item, codigo, descricao, ncm, cfop, unidade, quantidade, valor_unitario, valor_total, produto_id",
    )
    .eq("nfe_distribuicao_id", nfeId)
    .order("numero_item");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    numero_item: r.numero_item,
    codigo: r.codigo,
    descricao: r.descricao,
    ncm: r.ncm,
    cfop: r.cfop,
    unidade: r.unidade,
    quantidade: Number(r.quantidade ?? 0),
    valor_unitario: Number(r.valor_unitario ?? 0),
    valor_total: Number(r.valor_total ?? 0),
    produto_id: r.produto_id,
  }));
}

export async function mapearProdutoNfeItem(
  itemId: string,
  produtoId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("nfe_distribuicao_itens")
    .update({ produto_id: produtoId })
    .eq("id", itemId);
  if (error) throw error;
}

export interface ProcessarNfeDistribuicaoInput {
  nfeId: string;
  fornecedorId: string;
  dataVencimento: string;
  descricao?: string | null;
}

export interface ProcessarNfeDistribuicaoResult {
  itens_processados?: number;
  itens_total?: number;
  itens_sem_produto?: number;
}

export async function processarNfeDistribuicao(
  input: ProcessarNfeDistribuicaoInput,
): Promise<ProcessarNfeDistribuicaoResult> {
  const { data, error } = await supabase.rpc("processar_nfe_distribuicao", {
    p_nfe_id: input.nfeId,
    p_fornecedor_id: input.fornecedorId,
    p_data_vencimento: input.dataVencimento,
    p_descricao: input.descricao ?? null,
  });
  if (error) throw error;
  return (data ?? {}) as ProcessarNfeDistribuicaoResult;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

export async function listFornecedoresAtivosMin(
  limit = 500,
): Promise<FornecedorMinRow[]> {
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, nome_razao_social, nome_fantasia, cpf_cnpj")
    .eq("ativo", true)
    .order("nome_razao_social")
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FornecedorMinRow[];
}

export async function listProdutosAtivosMin(
  limit = 500,
): Promise<ProdutoMinRow[]> {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, sku, nome")
    .eq("ativo", true)
    .order("nome")
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProdutoMinRow[];
}

// ── CC-e ──────────────────────────────────────────────────────────────────────

export async function listCCeHistorico(
  notaFiscalId: string,
): Promise<EventoCCeRow[]> {
  const { data, error } = await supabase
    .from("eventos_fiscais")
    .select(
      "id, sequencia, correcao, protocolo, data_evento, status_sefaz, motivo_retorno, created_at",
    )
    .eq("nota_fiscal_id", notaFiscalId)
    .eq("tipo_evento", "cce")
    .order("sequencia", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EventoCCeRow[];
}

export interface RegistrarEventoCCeInput {
  nota_fiscal_id: string;
  sequencia: number;
  correcao: string;
  protocolo: string | null;
  data_evento: string | null;
  status_sefaz: "autorizado" | "rejeitado";
  motivo_retorno: string | null;
  xml_retorno: string | null;
}

export async function registrarEventoCCe(
  input: RegistrarEventoCCeInput,
): Promise<void> {
  const usuario_id = await currentUserId();
  const { error } = await supabase.from("eventos_fiscais").insert({
    nota_fiscal_id: input.nota_fiscal_id,
    tipo_evento: "cce",
    codigo_evento: "110110",
    sequencia: input.sequencia,
    correcao: input.correcao,
    protocolo: input.protocolo,
    data_evento: input.data_evento ?? new Date().toISOString(),
    status_sefaz: input.status_sefaz,
    motivo_retorno: input.motivo_retorno,
    xml_retorno: input.xml_retorno,
    usuario_id,
  });
  if (error) throw error;
}

// ── Inutilização ──────────────────────────────────────────────────────────────

export async function listInutilizacoesHistorico(
  limit = 50,
): Promise<InutilizacaoRow[]> {
  const { data, error } = await supabase
    .from("inutilizacoes_numeracao")
    .select(
      "id, serie, ano, numero_inicial, numero_final, justificativa, protocolo, status_sefaz, motivo_retorno, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as InutilizacaoRow[];
}

export interface RegistrarInutilizacaoInput {
  serie: number;
  ano: number;
  numero_inicial: number;
  numero_final: number;
  justificativa: string;
  protocolo: string | null;
  data_evento: string | null;
  status_sefaz: "autorizado" | "rejeitado";
  motivo_retorno: string | null;
}

export async function registrarInutilizacao(
  input: RegistrarInutilizacaoInput,
): Promise<void> {
  const usuario_id = await currentUserId();
  const { error } = await supabase.from("inutilizacoes_numeracao").insert({
    serie: input.serie,
    ano: input.ano,
    numero_inicial: input.numero_inicial,
    numero_final: input.numero_final,
    justificativa: input.justificativa,
    protocolo: input.protocolo,
    data_evento: input.data_evento ?? new Date().toISOString(),
    status_sefaz: input.status_sefaz,
    motivo_retorno: input.motivo_retorno,
    usuario_id,
  });
  if (error) throw error;
}
