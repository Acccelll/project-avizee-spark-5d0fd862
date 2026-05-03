import { useEffect, useMemo, useState } from "react";
import * as ccs from "@/services/cotacoesCompra.service";
import type { CotacaoCompra, CotacaoSummary } from "@/components/compras/cotacaoCompraTypes";

/**
 * Carrega summaries (itens_count, fornecedores_count, vencedor) por cotação.
 * Best-effort: silencioso em erro. Extraído de `useCotacoesCompra` para
 * reduzir o tamanho do hook principal.
 */
export function useCotacoesEnrichment(data: CotacaoCompra[]) {
  const [summaries, setSummaries] = useState<Record<string, CotacaoSummary>>({});
  const enrichmentKey = useMemo(() => data.map((c) => c.id).join(","), [data]);

  useEffect(() => {
    if (!enrichmentKey) return;
    const ids = enrichmentKey.split(",");
    Promise.all([
      ccs.listCotacaoItensEnrichment(ids),
      ccs.listCotacaoPropostasEnrichment(ids),
    ])
      .then(([itens, propostas]) => {
        const map: Record<string, CotacaoSummary> = {};
        for (const id of ids) {
          const cItens = (itens || []).filter(
            (i: { cotacao_compra_id: string }) => i.cotacao_compra_id === id,
          );
          const cPropostas = (propostas || []).filter(
            (p: { cotacao_compra_id: string }) => p.cotacao_compra_id === id,
          );
          const fornecedorIds = [
            ...new Set(cPropostas.map((p: { fornecedor_id: string }) => p.fornecedor_id)),
          ];
          const fornUniq = fornecedorIds.length;
          const selecionadas = cPropostas.filter(
            (p: { selecionado: boolean }) => p.selecionado,
          );
          const vencIds = [
            ...new Set(selecionadas.map((p: { fornecedor_id: string }) => p.fornecedor_id)),
          ];
          const vencNome =
            vencIds.length === 1
              ? ((cPropostas.find(
                  (p: { fornecedor_id: string; selecionado: boolean }) =>
                    p.fornecedor_id === vencIds[0] && p.selecionado,
                ) as
                  | { fornecedores?: { nome_razao_social: string } }
                  | undefined)?.fornecedores?.nome_razao_social ?? null)
              : vencIds.length > 1
              ? `${vencIds.length} fornecedores`
              : null;
          const produtosText = (
            cItens as Array<{
              produtos?: {
                nome?: string | null;
                codigo_interno?: string | null;
                sku?: string | null;
              } | null;
            }>
          )
            .map((i) =>
              [i.produtos?.nome, i.produtos?.codigo_interno, i.produtos?.sku]
                .filter(Boolean)
                .join(" "),
            )
            .join(" ")
            .toLowerCase();
          map[id] = {
            itens_count: cItens.length,
            fornecedores_count: fornUniq,
            vencedor_nome: vencNome,
            tem_vencedor: selecionadas.length > 0,
            fornecedor_ids: fornecedorIds,
            produtos_text: produtosText,
          };
        }
        setSummaries(map);
      })
      .catch(() => {
        /* silent – enrichment is best-effort */
      });
  }, [enrichmentKey]);

  return summaries;
}
