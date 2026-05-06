import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Copy, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { FiscalSefazStatusBadge } from "@/components/fiscal/FiscalStatusBadges";
import { PeriodFilter } from "@/components/filters/PeriodFilter";
import type { Period } from "@/components/filters/periodTypes";
import { periodToDateFrom, periodToDateTo } from "@/lib/periodFilter";
import { fiscalSefazStatusOptions } from "@/lib/fiscalStatus";
import { useUrlListState } from "@/hooks/useUrlListState";

/**
 * Consulta de Documentos — substitui o stub anterior da aba "Documentos"
 * em /faturamento. Lista direta de NF-e com filtros básicos e ações
 * para abrir detalhe ou emitir similar (devolução/complementar).
 */

interface DocRow {
  id: string;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  status_sefaz: string | null;
  tipo: string | null;
  parceiro_nome: string | null;
}

const TIPO_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "saida", label: "Saída" },
  { value: "entrada", label: "Entrada" },
] as const;

export function ConsultaDocumentos() {
  const navigate = useNavigate();
  // Filtros sincronizados com a URL → permite deep-link e back/forward.
  const { value: filterState, set: setFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      tipo: { type: "string" },
      statusSefaz: { type: "string" },
      period: { type: "string" },
    },
  });
  const busca = filterState.q;
  const tipo = filterState.tipo || "todos";
  const statusSefaz = filterState.statusSefaz || "todos";
  const period = (filterState.period || "30d") as Period;
  const setBusca = (v: string) => setFilters({ q: v });
  const setTipo = (v: string) => setFilters({ tipo: v === "todos" ? "" : v });
  const setStatusSefaz = (v: string) => setFilters({ statusSefaz: v === "todos" ? "" : v });
  const setPeriod = (v: Period) => setFilters({ period: v === "30d" ? "" : v });
  const debounced = useDebounce(busca, 300);

  const query = useQuery({
    queryKey: ["faturamento-consulta-docs", debounced, tipo, statusSefaz, period],
    queryFn: async () => {
      let q = supabase
        .from("notas_fiscais")
        .select(
          `id, numero, serie, data_emissao, valor_total, status_sefaz, tipo,
           clientes:cliente_id(nome_razao_social),
           fornecedores:fornecedor_id(nome_razao_social)`,
        )
        .eq("ativo", true)
        .order("data_emissao", { ascending: false })
        .limit(200);

      if (tipo !== "todos") q = q.eq("tipo", tipo);
      if (statusSefaz !== "todos") q = q.eq("status_sefaz", statusSefaz);

      const dFrom = periodToDateFrom(period);
      const dTo = periodToDateTo(period);
      if (dFrom) q = q.gte("data_emissao", dFrom);
      if (dTo) q = q.lte("data_emissao", dTo);

      if (debounced) {
        q = q.or(`numero.ilike.%${debounced}%,chave_acesso.ilike.%${debounced}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const cli = (row as { clientes?: { nome_razao_social?: string | null } | null }).clientes;
        const forn = (row as { fornecedores?: { nome_razao_social?: string | null } | null }).fornecedores;
        return {
          id: String(row.id),
          numero: row.numero,
          serie: row.serie,
          data_emissao: row.data_emissao,
          valor_total: row.valor_total,
          status_sefaz: row.status_sefaz,
          tipo: row.tipo,
          parceiro_nome: cli?.nome_razao_social ?? forn?.nome_razao_social ?? null,
        } satisfies DocRow;
      });
    },
  });

  const totalValor = useMemo(
    () => (query.data ?? []).reduce((s, d) => s + Number(d.valor_total ?? 0), 0),
    [query.data],
  );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Consulta de documentos fiscais</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {query.data
                ? <><strong>{query.data.length}</strong> documento(s) · <strong>{formatCurrency(totalValor)}</strong></>
                : "Carregando…"}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Localizar por</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Número ou chave de acesso…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status SEFAZ</Label>
            <Select value={statusSefaz} onValueChange={setStatusSefaz}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {fiscalSefazStatusOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <PeriodFilter value={period} onChange={setPeriod} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            Nenhum documento encontrado com os filtros atuais.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Nº / Série</th>
                  <th className="px-2 py-2 text-left">Tipo</th>
                  <th className="px-2 py-2 text-left">Parceiro</th>
                  <th className="px-2 py-2 text-left">Emissão</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                  <th className="px-2 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(query.data ?? []).map((d) => (
                  <tr key={d.id} className="border-b hover:bg-accent/40">
                    <td className="px-2 py-2 font-mono text-xs">
                      {d.numero ?? "—"}/{d.serie ?? "1"}
                    </td>
                    <td className="px-2 py-2 capitalize">{d.tipo ?? "—"}</td>
                    <td className="px-2 py-2 truncate max-w-[260px]">
                      {d.parceiro_nome ?? "—"}
                    </td>
                    <td className="px-2 py-2">{d.data_emissao ? formatDate(d.data_emissao) : "—"}</td>
                    <td className="px-2 py-2">
                      <FiscalSefazStatusBadge status={d.status_sefaz || "nao_enviada"} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatCurrency(Number(d.valor_total ?? 0))}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Ver detalhe"
                          onClick={() => navigate(`/fiscal/${d.id}`)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {d.tipo === "saida" && d.status_sefaz === "autorizada" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Emitir NF-e similar (devolução/complementar)"
                            onClick={() => navigate(`/faturamento/emitir?refNFeId=${d.id}`)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}