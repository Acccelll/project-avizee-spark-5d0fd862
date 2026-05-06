/**
 * Transportadoras service — queries auxiliares usadas em
 * `pages/Transportadoras.tsx` (contexto do modal, vínculos com clientes
 * e listagem de clientes ativos para o dropdown de vinculação).
 *
 * O CRUD principal de `transportadoras` continua via `useSupabaseCrud`;
 * este service cobre o que escapa desse hook.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { safeDelete } from "@/services/_shared/safeDelete";

export type ClienteTransportadora = Tables<"cliente_transportadoras">;

export interface TransportadoraContextCounts {
  clientes: number;
  remessas: number;
}

export interface ClienteVinculadoView {
  id: string;
  cliente_id: string;
  prioridade: number | null;
  modalidade: string | null;
  prazo_medio: string | null;
  clientes: { nome_razao_social: string; cpf_cnpj: string | null } | null;
}

export async function getTransportadoraContext(
  transportadoraId: string,
): Promise<TransportadoraContextCounts> {
  const [{ count: cliCount, error: cliErr }, { count: remCount, error: remErr }] =
    await Promise.all([
      supabase
        .from("cliente_transportadoras")
        .select("id", { count: "exact", head: true })
        .eq("transportadora_id", transportadoraId)
        .eq("ativo", true),
      supabase
        .from("remessas")
        .select("id", { count: "exact", head: true })
        .eq("transportadora_id", transportadoraId),
    ]);
  if (cliErr) throw cliErr;
  if (remErr) throw remErr;
  return { clientes: cliCount ?? 0, remessas: remCount ?? 0 };
}

export async function listClientesAtivos(): Promise<
  Array<{ id: string; nome_razao_social: string }>
> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome_razao_social")
    .eq("ativo", true)
    .order("nome_razao_social");
  if (error) throw error;
  return (data || []) as Array<{ id: string; nome_razao_social: string }>;
}

export async function listClientesVinculados(
  transportadoraId: string,
): Promise<ClienteVinculadoView[]> {
  const { data, error } = await supabase
    .from("cliente_transportadoras")
    .select(
      "id, cliente_id, prioridade, modalidade, prazo_medio, clientes(nome_razao_social, cpf_cnpj)",
    )
    .eq("transportadora_id", transportadoraId)
    .eq("ativo", true)
    .order("prioridade");
  if (error) throw error;
  return (data || []) as ClienteVinculadoView[];
}

export async function vincularClienteTransportadora(
  clienteId: string,
  transportadoraId: string,
  prioridade: number,
): Promise<void> {
  const { error } = await supabase.from("cliente_transportadoras").insert({
    cliente_id: clienteId,
    transportadora_id: transportadoraId,
    prioridade,
    ativo: true,
  });
  if (error) throw error;
}

export async function desvincularClienteTransportadora(vinculoId: string): Promise<void> {
  const { error } = await supabase
    .from("cliente_transportadoras")
    .update({ ativo: false })
    .eq("id", vinculoId);
  if (error) throw error;
}

/**
 * Remove (desativa) uma transportadora. Soft delete por padrão; bloqueia
 * quando há vínculos com clientes, remessas, NF-e, orçamentos ou pedidos.
 */
export async function deleteTransportadora(
  id: string,
  opts?: { hardDelete?: boolean },
): Promise<void> {
  await safeDelete({
    table: "transportadoras",
    id,
    entityLabel: "Transportadora",
    hardDelete: opts?.hardDelete,
    dependencies: [
      { table: "cliente_transportadoras", column: "transportadora_id", label: "vínculos com clientes" },
      { table: "remessas", column: "transportadora_id", label: "remessas" },
      { table: "notas_fiscais", column: "transportadora_id", label: "notas fiscais" },
      { table: "ordens_venda", column: "transportadora_id", label: "pedidos" },
      { table: "orcamentos", column: "transportadora_id", label: "orçamentos" },
    ],
  });
}