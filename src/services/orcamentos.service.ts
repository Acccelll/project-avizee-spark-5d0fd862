import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface OrcamentoBase {
  id: string;
  numero: string;
  status: string;
  cliente_id: string | null;
  valor_total: number | null;
  quantidade_total: number | null;
  peso_total: number | null;
  observacoes: string | null;
}

/**
 * @deprecated Use `enviarOrcamentoAprovacao` em
 * `src/services/comercial/orcamentosLifecycle.service.ts` (mesma RPC,
 * tipagem oficial e telemetria padronizada). Mantido apenas como
 * fachada compatível para callers antigos da grid.
 */
export async function sendForApproval(orc: OrcamentoBase): Promise<void> {
  if (orc.status !== "rascunho") return;
  const { error } = await supabase.rpc("enviar_orcamento_aprovacao", { p_id: orc.id });
  if (error) throw new Error(`Erro ao enviar orçamento para aprovação: ${error.message}`);
  toast.success(`Orçamento ${orc.numero} enviado para aprovação!`);
}

export async function approveOrcamento(orc: OrcamentoBase): Promise<void> {
  const { error } = await supabase.rpc("aprovar_orcamento", { p_id: orc.id });
  if (error) throw new Error(`Erro ao aprovar orçamento: ${error.message}`);
  toast.success(`Orçamento ${orc.numero} aprovado!`);
}

/**
 * Cancelamento lógico de orçamento (preserva rastreabilidade).
 * Usa a RPC `cancelar_orcamento` que valida status e registra auditoria.
 */
export async function cancelarOrcamento(orcId: string, motivo?: string): Promise<void> {
  const { error } = await supabase.rpc("cancelar_orcamento", {
    p_id: orcId,
    p_motivo: motivo ?? undefined,
  });
  if (error) throw new Error(`Erro ao cancelar orçamento: ${error.message}`);
  toast.success("Orçamento cancelado.");
}

export interface ConvertToOVOptions {
  poNumber?: string;
  dataPo?: string;
  /** Quando true, força conversão ignorando reservas/alertas (admin). */
  forcar?: boolean;
}

/** @deprecated Use `convertToPedido` (mesma assinatura). */
export const convertToOV = convertToPedido;

/**
 * Converte orçamento em pedido de venda usando RPC transacional.
 * Garante atomicidade: numera, copia itens e dados de frete, e marca o orçamento.
 */
export async function convertToPedido(
  orc: OrcamentoBase,
  options: ConvertToOVOptions = {}
): Promise<{ ovId: string; ovNumero: string }> {
  const { data, error } = await supabase.rpc("converter_orcamento_em_ov", {
    p_orcamento_id: orc.id,
    p_po_number: options.poNumber ?? null,
    p_data_po: options.dataPo ?? null,
    p_forcar: options.forcar ?? false,
  });
  if (error) throw new Error(`Erro ao converter orçamento em pedido: ${error.message}`);
  const result = data as { ov_id: string; ov_numero: string };
  return { ovId: result.ov_id, ovNumero: result.ov_numero };
}

export async function enviarOrcamentoPorEmail(
  orcamentoId: string,
  emailDestino: string,
  mensagem: string,
  extras?: {
    numeroOrcamento?: string;
    clienteNome?: string;
    validade?: string;
    valorTotal?: string;
    vendedorNome?: string;
    pdfBlob?: Blob;
  }
): Promise<void> {
  const token = await ensurePublicToken(orcamentoId);
  const linkPublico = `${window.location.origin}/orcamento-publico?token=${token}`;

  // Upload do PDF (se fornecido) e geração de URL assinada (válida por 30 dias)
  let linkPdf: string | undefined;
  if (extras?.pdfBlob) {
    try {
      const filename = `${orcamentoId}/orcamento-${extras.numeroOrcamento ?? orcamentoId}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("orcamentos-pdf")
        .upload(filename, extras.pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) throw uploadError;
      const { data: signed } = await supabase.storage
        .from("orcamentos-pdf")
        .createSignedUrl(filename, 60 * 60 * 24 * 30);
      linkPdf = signed?.signedUrl;
    } catch (err) {
      logger.warn("Falha ao anexar PDF ao e-mail:", err);
    }
  }

  try {
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "orcamento-disponivel",
        recipientEmail: emailDestino,
        idempotencyKey: `orcamento-${orcamentoId}-${Date.now()}`,
        templateData: {
          numeroOrcamento: extras?.numeroOrcamento,
          clienteNome: extras?.clienteNome,
          validade: extras?.validade,
          valorTotal: extras?.valorTotal,
          vendedorNome: extras?.vendedorNome,
          mensagem,
          linkPublico,
          linkPdf,
        },
      },
    });
    if (error) throw error;
    toast.success("E-mail enviado para o cliente.");
  } catch {
    const assunto = encodeURIComponent(
      `Orçamento ${extras?.numeroOrcamento ?? ""} disponível`.trim(),
    );
    const corpo = encodeURIComponent(
      `${mensagem}\n\nVisualizar online: ${linkPublico}${linkPdf ? `\nBaixar PDF: ${linkPdf}` : ""}`,
    );
    window.open(`mailto:${emailDestino}?subject=${assunto}&body=${corpo}`);
    toast.info("E-mail aberto no cliente de e-mail padrão.");
  }
}

export async function ensurePublicToken(orcId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("orcamentos")
    .select("public_token")
    .eq("id", orcId)
    .maybeSingle();

  if (existing?.public_token) return existing.public_token;

  const token = crypto.randomUUID();
  const { error } = await supabase
    .from("orcamentos")
    .update({ public_token: token })
    .eq("id", orcId);

  if (error) throw new Error(`Erro ao gerar token público para orçamento: ${error.message}`);
  return token;
}

/**
 * Duplica um orçamento existente como rascunho, copiando itens e metadados
 * de frete (transportadora, simulação, dimensões, prazos). A numeração é
 * obtida atomicamente via RPC `proximo_numero_orcamento` com fallback
 * baseado em timestamp em caso de falha.
 *
 * @returns o `id` e o `numero` do orçamento recém-criado.
 */
export async function duplicateOrcamento(
  orc: OrcamentoBase & { frete_valor?: number | null; pagamento?: string | null;
    prazo_pagamento?: string | null; prazo_entrega?: string | null;
    frete_tipo?: string | null; modalidade?: string | null;
    cliente_snapshot?: unknown; }
): Promise<{ id: string; numero: string }> {
  // Operação atômica server-side: cabeçalho + itens em uma única transação.
  const { data, error } = await supabase.rpc("duplicar_orcamento", {
    p_orcamento_id: orc.id,
  });
  if (error) throw new Error(error.message);
  const result = data as { id: string; numero: string } | null;
  if (!result?.id) throw new Error("Falha ao duplicar orçamento");
  return { id: result.id, numero: result.numero };
}

// ── Lookups e CRUD usados pela página OrcamentoForm ───────────────────────────
import type { Database, Tables } from "@/integrations/supabase/types";

type Json = Database["public"]["Tables"]["orcamentos"]["Row"]["cliente_snapshot"];

/** Lista de clientes ativos (com todas as colunas usadas pelo form). */
export async function listClientesAtivosOrcamento(): Promise<Tables<"clientes">[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("ativo", true)
    .order("nome_razao_social");
  if (error) throw error;
  return (data ?? []) as Tables<"clientes">[];
}

/** Lista de produtos ativos com vínculos de fornecedores (para sugestão de custo). */
export async function listProdutosAtivosComFornecedores(): Promise<Tables<"produtos">[]> {
  const { data, error } = await supabase
    .from("produtos")
    .select("*, produtos_fornecedores(*, fornecedores(nome_razao_social))")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as Tables<"produtos">[];
}

/** Carrega o cabeçalho de um orçamento. */
export async function getOrcamentoById(orcId: string): Promise<Tables<"orcamentos"> | null> {
  const { data, error } = await supabase
    .from("orcamentos")
    .select("*")
    .eq("id", orcId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Tables<"orcamentos"> | null;
}

/** Itens de um orçamento. */
export async function listOrcamentoItens(orcId: string): Promise<Tables<"orcamentos_itens">[]> {
  const { data, error } = await supabase
    .from("orcamentos_itens")
    .select("*")
    .eq("orcamento_id", orcId);
  if (error) throw error;
  return (data ?? []) as Tables<"orcamentos_itens">[];
}

/** Descrição de uma forma de pagamento por id (lookup pontual). */
export async function getFormaPagamentoDescricao(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("descricao")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.descricao ?? null;
}

/**
 * Preços especiais válidos hoje para o cliente.
 * Schema real da tabela: usa `data_inicio`/`data_fim` (não `vigencia_*`).
 */
export async function listPrecosEspeciaisAtuais(
  clienteId: string,
): Promise<Tables<"precos_especiais">[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("precos_especiais")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("ativo", true)
    .or(`data_fim.is.null,data_fim.gte.${today}`)
    .or(`data_inicio.is.null,data_inicio.lte.${today}`);
  if (error) {
    console.error("[orcamentos] listPrecosEspeciaisAtuais:", error);
    throw error;
  }
  return (data ?? []) as Tables<"precos_especiais">[];
}

/**
 * RPC transacional `salvar_orcamento`.
 * Cria (p_id=null) ou atualiza header + itens em uma única transação.
 * Retorna o id do orçamento persistido.
 */
export async function salvarOrcamentoRpc(params: {
  id: string | null;
  payload: unknown;
  itens: unknown;
}): Promise<string> {
  const { data, error } = await supabase.rpc("salvar_orcamento", {
    p_id: params.id as unknown as string,
    p_payload: params.payload as never,
    p_itens: params.itens as never,
  });
  if (error) throw error;
  return data as string;
}

// ── Drafts (rascunhos remotos) ────────────────────────────────────────────────

export async function deleteOrcamentoDraft(usuarioId: string, draftKey: string): Promise<void> {
  const { error } = await supabase
    .from("orcamento_drafts")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("draft_key", draftKey);
  if (error) throw error;
}

export async function getOrcamentoDraftPayload(
  usuarioId: string,
  draftKey: string,
): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("orcamento_drafts")
    .select("payload")
    .eq("usuario_id", usuarioId)
    .eq("draft_key", draftKey)
    .maybeSingle();
  if (error) throw error;
  return (data?.payload ?? null) as unknown;
}

// Hint para tree-shaking: garantimos que o tipo Json seja "usado".
export type OrcamentoClienteSnapshotJson = Json;

// ── Drafts (autosave/upsert) ──────────────────────────────────────────────────

export async function upsertOrcamentoDraft(
  usuarioId: string,
  draftKey: string,
  payload: unknown,
): Promise<void> {
  const { error } = await supabase
    .from("orcamento_drafts")
    .upsert(
      { usuario_id: usuarioId, draft_key: draftKey, payload: payload as never },
      { onConflict: "usuario_id,draft_key" },
    );
  if (error) throw error;
}

export async function hasOrcamentoDraft(
  usuarioId: string,
  draftKey: string,
): Promise<boolean> {
  const payload = await getOrcamentoDraftPayload(usuarioId, draftKey);
  return payload != null;
}

// ── Validação de número único ─────────────────────────────────────────────────

/**
 * Verifica se já existe outro orçamento com este número.
 * `excludeId` evita falso positivo durante edição.
 */
export async function existeOrcamentoComNumero(
  numero: string,
  excludeId?: string | null,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("orcamentos")
    .select("id")
    .eq("numero", numero)
    .neq("id", excludeId || "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Cria uma revisão de orçamento (clona itens via RPC). */
export async function criarRevisaoOrcamento(orcamentoId: string): Promise<string | null> {
  // RPC criada na migração; cast `as never` evita atrito com tipagem gerada.
  const { data, error } = await supabase.rpc(
    "criar_revisao_orcamento" as never,
    { p_orcamento_id: orcamentoId } as never,
  );
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Carrega orçamento + itens + ordem de venda vinculada (se existir).
 * Usado pelo `OrcamentoView` para o drawer de detalhes.
 */
export async function fetchOrcamentoDetalhes(orcamentoId: string, signal: AbortSignal) {
  const { data: orc, error: orcError } = await supabase
    .from("orcamentos")
    .select("*, clientes(id, nome_razao_social)")
    .eq("id", orcamentoId)
    .abortSignal(signal)
    .maybeSingle();
  if (orcError) throw orcError;
  if (!orc) return null;

  const [{ data: it }, { data: ov }] = await Promise.all([
    supabase
      .from("orcamentos_itens")
      .select("*, produtos(id, nome, sku)")
      .eq("orcamento_id", orc.id)
      .abortSignal(signal),
    supabase
      .from("ordens_venda")
      .select("id, numero")
      .eq("cotacao_id", orc.id)
      .abortSignal(signal)
      .maybeSingle(),
  ]);

  return { orcamento: orc, items: it ?? [], linkedOV: ov ?? null };
}
