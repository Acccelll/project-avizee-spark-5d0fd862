import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import {
  fetchTracking,
  normalizarEventos,
  type CorreiosEventoNormalizado,
} from "@/services/correios.service";
import type { Database } from "@/integrations/supabase/types";

export type Remessa = Database["public"]["Tables"]["remessas"]["Row"];
export type RemessaInsert = Database["public"]["Tables"]["remessas"]["Insert"];
export type RemessaUpdate = Database["public"]["Tables"]["remessas"]["Update"];
export type RemessaEvento = Database["public"]["Tables"]["remessa_eventos"]["Row"];
export type RemessaEventoInsert = Database["public"]["Tables"]["remessa_eventos"]["Insert"];

const QUERY_KEY = "remessas";

// ── Service functions ──────────────────────────────────────────────────────────

export async function fetchRemessas(): Promise<Remessa[]> {
  const { data, error } = await supabase
    .from("remessas")
    .select("*")
    .eq("ativo", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRemessa(payload: RemessaInsert): Promise<Remessa> {
  const { data, error } = await supabase
    .from("remessas")
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateRemessa(id: string, payload: RemessaUpdate): Promise<void> {
  const { error } = await supabase.from("remessas").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRemessa(id: string): Promise<void> {
  const { error } = await supabase.from("remessas").update({ ativo: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Carrega uma remessa pelo id (usado pela página de edição). */
export async function getRemessaById(id: string): Promise<Remessa | null> {
  const { data, error } = await supabase
    .from("remessas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Atualiza apenas o campo `status_transporte` de uma remessa (ação rápida). */
export async function updateStatusTransporte(
  remessaId: string,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from("remessas")
    .update({ status_transporte: status })
    .eq("id", remessaId);
  if (error) throw new Error(error.message);
}

/**
 * Localiza a remessa ativa associada a uma OV e código de rastreio
 * (usado para alimentar o `remessa_id` no TrackingModal a partir de uma Entrega).
 */
export async function findRemessaByOvAndTracking(
  ordemVendaId: string,
  codigoRastreio: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("remessas")
    .select("id")
    .eq("ordem_venda_id", ordemVendaId)
    .eq("ativo", true)
    .eq("codigo_rastreio", codigoRastreio)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Lista os eventos de rastreio de uma remessa, mais recentes primeiro. */
export async function listEventos(remessaId: string): Promise<RemessaEvento[]> {
  const { data, error } = await supabase
    .from("remessa_eventos")
    .select("*")
    .eq("remessa_id", remessaId)
    .order("data_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RemessaEvento[];
}

/** Retorna apenas os IDs das remessas ativas associadas a uma OV. */
export async function listRemessaIdsByOv(ordemVendaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("remessas")
    .select("id")
    .eq("ordem_venda_id", ordemVendaId)
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id);
}

/** Insere um novo evento manual de rastreio em uma remessa. */
export async function addEvento(input: {
  remessaId: string;
  descricao: string;
  local?: string | null;
}): Promise<void> {
  const empresaId = await getEmpresaIdDaRemessa(input.remessaId);
  const payload: RemessaEventoInsert = {
    remessa_id: input.remessaId,
    descricao: input.descricao,
    local: input.local ?? null,
    empresa_id: empresaId,
  };
  const { error } = await supabase.from("remessa_eventos").insert(payload);
  if (error) throw new Error(error.message);
}

async function getEmpresaIdDaRemessa(remessaId: string): Promise<string> {
  const { data, error } = await supabase
    .from("remessas")
    .select("empresa_id")
    .eq("id", remessaId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Remessa não encontrada");
  return (data as { empresa_id: string }).empresa_id;
}

/**
 * Canonical tracking function used by ALL logística views.
 *
 * Queries the Correios API, normalises events, deduplicates against DB and
 * persists only genuinely new events.  Mock data is returned inline but never
 * persisted.
 *
 * @returns { novos, isMock, eventos } where `eventos` is the full list after
 *   DB refresh (or the mock list when `isMock` is true).
 */
export async function trackAndPersistEventos(
  codigo: string,
  remessaId: string,
): Promise<{ novos: number; isMock: boolean; eventos: CorreiosEventoNormalizado[] }> {
  const tracking = await fetchTracking(codigo);
  const isMock = tracking.warning === "fallback_mock";
  const eventosNormalizados = normalizarEventos(tracking, remessaId);

  if (isMock) {
    return { novos: 0, isMock: true, eventos: eventosNormalizados };
  }

  const empresaId = await getEmpresaIdDaRemessa(remessaId);

  // Deduplicate against existing DB events
  const { data: existentes } = await supabase
    .from("remessa_eventos")
    .select("descricao, local, data_hora")
    .eq("remessa_id", remessaId);

  const eventKey = (e: { descricao: string; local: string | null; data_hora: string }) =>
    `${e.data_hora}::${e.descricao}::${e.local ?? ""}`;
  const existentesSet = new Set((existentes ?? []).map(eventKey));
  const novosEventos = eventosNormalizados.filter((e) => !existentesSet.has(eventKey(e)));

  if (novosEventos.length > 0) {
    await supabase
      .from("remessa_eventos")
      .insert(novosEventos.map((e) => ({ ...e, empresa_id: empresaId })));
  }

  return { novos: novosEventos.length, isMock: false, eventos: eventosNormalizados };
}

/** @deprecated Use trackAndPersistEventos instead */
export async function trackCorreios(
  codigo: string,
  remessaId: string,
): Promise<Array<CorreiosEventoNormalizado & { remessa_id: string }>> {
  const tracking = await fetchTracking(codigo);
  return normalizarEventos(tracking, remessaId);
}

// ── Lifecycle (RPCs) ─────────────────────────────────────────────────────────

export type RemessaTransition =
  | "pendente"
  | "coletado"
  | "postado"
  | "em_transito"
  | "ocorrencia"
  | "entregue"
  | "devolvido"
  | "cancelado";

const RPC_BY_TRANSITION: Partial<Record<RemessaTransition, string>> = {
  em_transito: "marcar_remessa_em_transito",
  entregue: "marcar_remessa_entregue",
  cancelado: "cancelar_remessa",
};

export async function expedirRemessa(remessaId: string): Promise<void> {
  const { error } = await supabase.rpc("expedir_remessa", { p_remessa_id: remessaId });
  if (error) throw new Error(error.message);
}

export async function marcarRemessaEmTransito(remessaId: string): Promise<void> {
  const { error } = await supabase.rpc("marcar_remessa_em_transito", { p_remessa_id: remessaId });
  if (error) throw new Error(error.message);
}

export async function marcarRemessaEntregue(remessaId: string): Promise<void> {
  const { error } = await supabase.rpc("marcar_remessa_entregue", { p_remessa_id: remessaId });
  if (error) throw new Error(error.message);
}

export async function cancelarRemessa(input: { id: string; motivo?: string | null }): Promise<void> {
  const { error } = await supabase.rpc("cancelar_remessa", {
    p_remessa_id: input.id,
    p_motivo: input.motivo ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Transição genérica: chama a RPC correspondente quando aplicável; se a RPC recusar
 * (estado incompatível), faz `update` direto em `status_transporte` para preservar
 * a operação puramente logística do usuário.
 */
export async function transicionarRemessa(input: {
  remessaId: string;
  novoStatus: RemessaTransition;
  motivo?: string;
}): Promise<void> {
  const { remessaId, novoStatus, motivo } = input;
  const rpcName = RPC_BY_TRANSITION[novoStatus];
  if (rpcName) {
    const params: Record<string, unknown> = { p_remessa_id: remessaId };
    if (rpcName === "cancelar_remessa") params.p_motivo = motivo ?? null;
    const { error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: Error | null }>)(rpcName, params);
    if (error) {
      const { error: updErr } = await supabase
        .from("remessas")
        .update({ status_transporte: novoStatus })
        .eq("id", remessaId);
      if (updErr) throw new Error(error.message);
    }
    return;
  }
  const { error } = await supabase
    .from("remessas")
    .update({ status_transporte: novoStatus })
    .eq("id", remessaId);
  if (error) throw new Error(error.message);
}

/**
 * Persiste eventos já normalizados (vindos do hook de tracking) deduplicando
 * por (data_hora, descricao, local). Retorna a quantidade de novos inseridos.
 */
export async function persistirEventosNormalizados(input: {
  remessaId: string;
  eventos: Array<CorreiosEventoNormalizado & { remessa_id: string }>;
}): Promise<number> {
  const { remessaId, eventos } = input;
  if (eventos.length === 0) return 0;

  const empresaId = await getEmpresaIdDaRemessa(remessaId);

  const { data: existentes, error: selErr } = await supabase
    .from("remessa_eventos")
    .select("descricao, local, data_hora")
    .eq("remessa_id", remessaId);
  if (selErr) throw new Error(selErr.message);

  const eventKey = (e: { descricao: string; local: string | null; data_hora: string }) =>
    `${e.data_hora}::${e.descricao}::${e.local ?? ""}`;
  const existentesSet = new Set((existentes ?? []).map(eventKey));
  const novos = eventos.filter((e) => !existentesSet.has(eventKey(e)));

  if (novos.length > 0) {
    const { error: insErr } = await supabase
      .from("remessa_eventos")
      .insert(novos.map((e) => ({ ...e, empresa_id: empresaId })));
    if (insErr) throw new Error(insErr.message);
  }
  return novos.length;
}

// ── Rastreio agregado por documento ────────────────────────────────────────────

/**
 * Busca remessas ativas filtradas por documento de origem (pedido de compra,
 * NF, ordem de venda ou remessa direta) e seus eventos agrupados por remessa.
 * Usado pelo `LogisticaRastreioSection` para o painel de rastreio in-drawer.
 */
export async function fetchRemessasRastreioPorDocumento(filters: {
  pedidoCompraId?: string;
  notaFiscalId?: string;
  remessaId?: string;
  ordemVendaId?: string;
}): Promise<{ remessas: Remessa[]; eventos: Record<string, RemessaEvento[]> }> {
  let query = supabase
    .from("remessas")
    .select("*, transportadoras(nome_razao_social)");
  if (filters.remessaId) query = query.eq("id", filters.remessaId);
  if (filters.pedidoCompraId) query = query.eq("pedido_compra_id", filters.pedidoCompraId);
  if (filters.notaFiscalId) query = query.eq("nota_fiscal_id", filters.notaFiscalId);
  if (filters.ordemVendaId) query = query.eq("ordem_venda_id", filters.ordemVendaId);
  const { data, error } = await query.eq("ativo", true);
  if (error) throw error;
  const remessas = (data ?? []) as Remessa[];
  if (remessas.length === 0) return { remessas, eventos: {} };
  const ids = remessas.map((r) => r.id);
  const { data: evs, error: evErr } = await supabase
    .from("remessa_eventos")
    .select("*")
    .in("remessa_id", ids)
    .order("data_hora", { ascending: false });
  if (evErr) throw evErr;
  const eventos: Record<string, RemessaEvento[]> = {};
  for (const ev of evs ?? []) {
    const key = ev.remessa_id as string;
    if (!eventos[key]) eventos[key] = [];
    eventos[key].push(ev as RemessaEvento);
  }
  return { remessas, eventos };
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useRemessas() {
  const queryClient = useQueryClient();

  const query = useQuery<Remessa[], Error>({
    queryKey: [QUERY_KEY],
    queryFn: fetchRemessas,
    staleTime: 2 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });

  const createMutation = useMutation<Remessa, Error, RemessaInsert>({
    mutationFn: createRemessa,
    onSuccess: () => {
      toast.success("Remessa criada com sucesso!");
      invalidate();
    },
    onError: (err) => notifyError(err),
  });

  const updateMutation = useMutation<void, Error, { id: string; payload: RemessaUpdate }>({
    mutationFn: ({ id, payload }) => updateRemessa(id, payload),
    onSuccess: () => {
      toast.success("Remessa atualizada!");
      invalidate();
    },
    onError: (err) => notifyError(err),
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: deleteRemessa,
    onSuccess: () => {
      toast.success("Remessa removida!");
      invalidate();
    },
    onError: (err) => notifyError(err),
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: createMutation.mutateAsync,
    update: (id: string, payload: RemessaUpdate) =>
      updateMutation.mutateAsync({ id, payload }),
    remove: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
