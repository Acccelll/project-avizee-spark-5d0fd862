import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send,
  Search,
  PackageCheck,
  PackageX,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { useUrlListState } from "@/hooks/useUrlListState";

/**
 * Backlog OV → NF-e (Onda 4).
 *
 * Lista ordens de venda aprovadas com status_faturamento ∈ {pendente, parcial}
 * e abre o wizard `/faturamento/emitir?ovId=…` pré-preenchido. A ação “Faturar”
 * delega ao wizard para que o usuário ainda confirme matriz fiscal,
 * transporte e revisão antes de salvar o rascunho.
 */

interface BacklogOV {
  id: string;
  numero: string;
  data_emissao: string | null;
  data_aprovacao: string | null;
  data_prometida_despacho: string | null;
  valor_total: number | null;
  status: string | null;
  status_faturamento: string | null;
  cliente_id: string | null;
  clientes: { nome_razao_social: string | null } | null;
  itens_count: number;
}

function FatBadge({ status }: { status: string | null }) {
  if (!status || status === "pendente")
    return <Badge variant="outline">Pendente</Badge>;
  if (status === "parcial")
    return <Badge variant="secondary">Parcial</Badge>;
  if (status === "faturado")
    return <Badge variant="default">Faturado</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function BacklogFaturamento() {
  const navigate = useNavigate();
  const { value: filterState, set: setFilters } = useUrlListState({
    schema: { q: { type: "string" } },
  });
  const busca = filterState.q;
  const setBusca = (v: string) => setFilters({ q: v });
  const debounced = useDebounce(busca, 300);

  const query = useQuery({
    queryKey: ["faturamento-backlog", debounced],
    queryFn: async () => {
      let q = supabase
        .from("ordens_venda")
        .select(
          `id, numero, data_emissao, data_aprovacao, data_prometida_despacho,
           valor_total, status, status_faturamento, cliente_id,
           clientes:cliente_id(nome_razao_social),
           itens:ordens_venda_itens(id)`,
        )
        .eq("ativo", true)
        .in("status_faturamento", ["pendente", "parcial"])
        .in("status", ["aprovado", "em_separacao", "separado", "em_producao"])
        .order("data_aprovacao", { ascending: true, nullsFirst: false })
        .limit(100);

      if (debounced) {
        // Busca por nº pedido / PO + nome do cliente.
        // Nome do cliente está em tabela relacionada — pré-resolve IDs.
        const { data: clisMatch } = await supabase
          .from("clientes")
          .select("id")
          .ilike("nome_razao_social", `%${debounced}%`)
          .limit(50);
        const cids = (clisMatch ?? []).map((c) => c.id);
        let orClause = `numero.ilike.%${debounced}%,po_number.ilike.%${debounced}%`;
        if (cids.length) orClause += `,cliente_id.in.(${cids.join(",")})`;
        q = q.or(orClause);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const itens = (row as { itens?: Array<{ id: string }> }).itens ?? [];
        return {
          id: String(row.id),
          numero: row.numero,
          data_emissao: row.data_emissao,
          data_aprovacao: row.data_aprovacao,
          data_prometida_despacho: row.data_prometida_despacho,
          valor_total: row.valor_total,
          status: row.status,
          status_faturamento: row.status_faturamento,
          cliente_id: row.cliente_id,
          clientes: (row as { clientes?: { nome_razao_social: string | null } | null }).clientes ?? null,
          itens_count: itens.length,
        } satisfies BacklogOV;
      });
    },
  });

  const totalBacklog = useMemo(
    () => (query.data ?? []).reduce((s, ov) => s + Number(ov.valor_total ?? 0), 0),
    [query.data],
  );

  const faturar = (ov: BacklogOV) => {
    navigate(`/faturamento/emitir?ovId=${ov.id}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Backlog de faturamento</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pedidos aprovados aguardando emissão de NF-e
            {query.data && (
              <>
                {" — "}
                <strong>{query.data.length}</strong> pedido(s),{" "}
                <strong>{formatCurrency(totalBacklog)}</strong>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nº pedido / PO…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 w-[240px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <PackageCheck className="h-10 w-10 text-success mb-2" />
            <p className="text-sm font-medium">Nenhum pedido pendente de faturamento</p>
            <p className="text-xs text-muted-foreground mt-1">
              Todos os pedidos aprovados já foram convertidos em NF-e.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {(query.data ?? []).map((ov) => (
              <li
                key={ov.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">Pedido {ov.numero}</span>
                    <FatBadge status={ov.status_faturamento} />
                    {ov.itens_count === 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <PackageX className="h-3 w-3" /> Sem itens
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ov.clientes?.nome_razao_social ?? "Sem cliente"} ·{" "}
                    {ov.itens_count} {ov.itens_count === 1 ? "item" : "itens"} ·{" "}
                    Aprovado {ov.data_aprovacao ? formatDate(ov.data_aprovacao) : "—"}
                    {ov.data_prometida_despacho && (
                      <>
                        {" · "}Despacho prev. {formatDate(ov.data_prometida_despacho)}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums font-semibold">
                    {formatCurrency(Number(ov.valor_total ?? 0))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/pedidos?id=${ov.id}`)}
                    className="gap-1"
                  >
                    Ver <ArrowRight className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => faturar(ov)}
                    disabled={ov.itens_count === 0}
                    className="gap-1"
                  >
                    <Send className="h-3 w-3" /> Faturar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default BacklogFaturamento;