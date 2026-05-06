/**
 * RH service — operações de folha de pagamento e geração financeira para
 * `pages/Funcionarios.tsx`.
 *
 * O CRUD da entidade `funcionarios` continua usando `useSupabaseCrud`;
 * este service cobre as operações específicas da folha (criação e
 * geração dos lançamentos financeiros via RPC).
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { safeDelete } from "@/services/_shared/safeDelete";

export interface GerarFinanceiroFolhaResult {
  ok?: boolean;
  erro?: string;
  data_pagamento?: string;
  data_fgts?: string;
}

export async function createFolhaPagamento(
  payload: TablesInsert<"folha_pagamento">,
): Promise<void> {
  const { error } = await supabase.from("folha_pagamento").insert(payload);
  if (error) throw error;
}

export async function gerarFinanceiroFolha(
  folhaId: string,
): Promise<GerarFinanceiroFolhaResult> {
  const { data, error } = await supabase.rpc("gerar_financeiro_folha", {
    p_folha_id: folhaId,
  });
  if (error) throw error;
  return (data || {}) as GerarFinanceiroFolhaResult;
}

/**
 * Remove (desativa) um funcionário. Soft delete por padrão; bloqueia
 * quando há folha de pagamento ou lançamentos financeiros vinculados.
 * Use `hardDelete: true` apenas em fluxos administrativos (gate por
 * `useCanHardDelete`).
 */
export async function deleteFuncionario(
  id: string,
  opts?: { hardDelete?: boolean },
): Promise<void> {
  await safeDelete({
    table: "funcionarios",
    id,
    entityLabel: "Funcionário",
    hardDelete: opts?.hardDelete,
    dependencies: [
      { table: "folha_pagamento", column: "funcionario_id", label: "folhas de pagamento" },
      { table: "financeiro_lancamentos", column: "funcionario_id", label: "lançamentos financeiros" },
      { table: "fechamento_fopag_resumo", column: "funcionario_id", label: "fechamentos de folha" },
    ],
  });
}