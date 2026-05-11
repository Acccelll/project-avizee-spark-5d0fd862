import { supabase } from "@/integrations/supabase/client";

export interface NFPrerequisiteIssue {
  code:
    | "cliente_sem_ie"
    | "sem_condicao_pagamento"
    | "produto_sem_ncm";
  label: string;
}

/**
 * Checagens leves (client-side) antes de abrir o ConfirmDialog "Gerar NF".
 * Não bloqueia o faturamento — apenas alerta o operador para reduzir
 * retrabalho fiscal. A RPC `gerar_nf_de_pedido` continua sendo a
 * autoridade final.
 */
export async function verificarPrerequisitosNF(
  pedidoId: string,
): Promise<NFPrerequisiteIssue[]> {
  const issues: NFPrerequisiteIssue[] = [];

  const { data: pedido, error: pedidoErr } = await supabase
    .from("ordens_venda")
    .select(
      "id, cotacao_id, clientes(nome_razao_social, inscricao_estadual, indicador_ie), orcamentos:cotacao_id(pagamento, prazo_pagamento)",
    )
    .eq("id", pedidoId)
    .maybeSingle();
  if (pedidoErr || !pedido) return issues;

  const cliente = pedido.clientes as
    | { inscricao_estadual?: string | null; indicador_ie?: string | number | null }
    | null;
  // indicador_ie 9 = não contribuinte / isento. Considera "ok" sem IE nesses casos.
  const ieIsento =
    String(cliente?.indicador_ie ?? "") === "9" ||
    String(cliente?.indicador_ie ?? "").toLowerCase() === "isento";
  if (!cliente?.inscricao_estadual && !ieIsento) {
    issues.push({
      code: "cliente_sem_ie",
      label: "Cliente sem Inscrição Estadual (e não marcado como isento)",
    });
  }

  const orc = pedido.orcamentos as
    | { pagamento?: string | null; prazo_pagamento?: string | null }
    | null;
  if (!orc?.pagamento && !orc?.prazo_pagamento) {
    issues.push({
      code: "sem_condicao_pagamento",
      label: "Pedido sem condição de pagamento definida",
    });
  }

  const { data: itens } = await supabase
    .from("ordens_venda_itens")
    .select("produto_id, produtos(nome, ncm)")
    .eq("ordem_venda_id", pedidoId);
  const semNcm = (itens ?? []).filter((i) => {
    const p = i.produtos as { ncm?: string | null } | null;
    return !p?.ncm;
  });
  if (semNcm.length > 0) {
    const nomes = semNcm
      .map((i) => (i.produtos as { nome?: string | null } | null)?.nome)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
    const extra = semNcm.length > 3 ? ` e +${semNcm.length - 3}` : "";
    issues.push({
      code: "produto_sem_ncm",
      label: `Produto(s) sem NCM: ${nomes || semNcm.length}${extra}`,
    });
  }

  return issues;
}