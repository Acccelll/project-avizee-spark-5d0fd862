import { supabase } from "@/integrations/supabase/client";
import type { FinanceiroAuxiliaresState } from "@/pages/financeiro/types";
import { listCartoesAtivos } from "@/services/cartoesCredito.service";

/** Carrega contas bancárias ativas + contas contábeis lançáveis + cartões ativos, em paralelo. */
export async function fetchFinanceiroAuxiliares(): Promise<FinanceiroAuxiliaresState> {
  const [{ data: contas }, { data: contabeis }, cartoes] = await Promise.all([
    supabase.from("contas_bancarias").select("*, bancos(nome)").eq("ativo", true),
    supabase
      .from("contas_contabeis")
      .select("id, codigo, descricao")
      .eq("ativo", true)
      .eq("aceita_lancamento", true)
      .order("codigo"),
    listCartoesAtivos().catch(() => []),
  ]);
  return {
    contasBancarias: contas || [],
    contasContabeis: contabeis || [],
    cartoes,
  };
}
