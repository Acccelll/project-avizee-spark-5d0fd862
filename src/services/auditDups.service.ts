/**
 * Auditoria de Duplicidades de Lançamentos Financeiros.
 *
 * Operações são restritas a admin (RLS + verificação no RPC).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AuditDup = Tables<"audit_dups_lancamentos">;

export interface ScanResult {
  grupos_inseridos: number;
  claros: number;
  revisao_manual: number;
}

export async function listAuditDups(status: "pendente" | "removido" | "mantido" = "pendente"): Promise<AuditDup[]> {
  const { data, error } = await supabase
    .from("audit_dups_lancamentos")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as AuditDup[];
}

export async function scanDups(): Promise<ScanResult> {
  const { data, error } = await supabase.rpc("scan_dups_lancamentos");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as ScanResult) ?? { grupos_inseridos: 0, claros: 0, revisao_manual: 0 };
}

export async function purgeDup(auditId: string): Promise<number> {
  const { data, error } = await supabase.rpc("purge_dups_confirmado", { p_audit_id: auditId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function manterDup(auditId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("marcar_dup_como_mantido", {
    p_audit_id: auditId,
    p_motivo: motivo,
  });
  if (error) throw error;
}

/** Carrega lançamentos referenciados por um grupo de auditoria (para o drawer). */
export async function loadLancamentosDoGrupo(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("financeiro_lancamentos")
    .select(
      "id, descricao, valor, data_vencimento, data_pagamento, status, parcela_numero, parcela_total, forma_pagamento, ativo, fornecedores(nome_razao_social), clientes(nome_razao_social), nota_fiscal_id, pedido_compra_id, created_at",
    )
    .in("id", ids);
  if (error) throw error;
  return data || [];
}