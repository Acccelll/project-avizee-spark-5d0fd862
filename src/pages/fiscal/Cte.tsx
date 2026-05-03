import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CertificadoValidadeAlert } from "@/components/fiscal/CertificadoValidadeAlert";
import { EmptyState } from "@/components/ui/empty-state";
import type { TableRow as DbRow } from "@/types/domain";

type NotaFiscalRow = DbRow<"notas_fiscais">;

export interface CteFormData {
  numero?: string;
  serie: string;
  dataEmissao: string;
  cfop: string;
  naturezaOperacao: string;
  remetente: string;
  destinatario: string;
  valorCarga: number;
  valorFrete: number;
  observacoes?: string;
}

async function fetchCtes(search?: string, status?: string, dataInicio?: string, dataFim?: string): Promise<NotaFiscalRow[]> {
  let query = supabase
    .from("notas_fiscais")
    .select("*")
    .eq("ativo", true)
    .eq("modelo_documento", "57")
    .order("created_at", { ascending: false });

  if (search) query = query.ilike("numero", `%${search}%`);
  if (status) query = query.eq("status", status);
  if (dataInicio) query = query.gte("data_emissao", dataInicio);
  if (dataFim) query = query.lte("data_emissao", dataFim);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export default function Cte() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const statusFiltro = searchParams.get("status") ?? "";
  const dataInicio = searchParams.get("data_inicio") ?? "";
  const dataFim = searchParams.get("data_fim") ?? "";

  const { data: ctes, isLoading } = useQuery({
    queryKey: ["cte", search, statusFiltro, dataInicio, dataFim],
    queryFn: () => fetchCtes(search, statusFiltro || undefined, dataInicio || undefined, dataFim || undefined),
    staleTime: 5 * 60 * 1000,
  });

  function setSearch(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("search", value); else next.delete("search");
      return next;
    }, { replace: true });
  }

  function setStatus(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("status", value); else next.delete("status");
      return next;
    }, { replace: true });
  }

  function setDataInicio(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("data_inicio", value); else next.delete("data_inicio");
      return next;
    }, { replace: true });
  }

  function setDataFim(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("data_fim", value); else next.delete("data_fim");
      return next;
    }, { replace: true });
  }

  return (
    <div className="space-y-4 p-6">
      <CertificadoValidadeAlert />

      <div className="rounded-lg border border-muted bg-muted/20 p-3 flex items-start gap-3">
        <span className="text-muted-foreground text-sm mt-0.5">ℹ️</span>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Tela de consulta CT-e:</span>{" "}
          Exibe CT-es (modelo 57) cadastrados no sistema. A emissão de novos CT-es
          ainda não está disponível neste fluxo — o botão está desabilitado intencionalmente.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Conhecimento de Transporte Eletrônico (CT-e)</h1>
        <Button disabled aria-label="Novo CT-e (indisponível)">
          <Plus className="mr-2 h-4 w-4" />
          Novo CT-e
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por número..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="w-40"
        />
        <Input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="w-40"
        />
        <select
          value={statusFiltro}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="rascunho">Rascunho</option>
          <option value="confirmada">Confirmada</option>
          <option value="autorizada">Autorizada</option>
          <option value="cancelada">Cancelada</option>
          <option value="cancelada_sefaz">Cancelada SEFAZ</option>
          <option value="rejeitada">Rejeitada</option>
        </select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Série</TableHead>
              <TableHead>Data Emissão</TableHead>
              <TableHead>Valor Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : (ctes ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-0">
                  <EmptyState title="Nenhum CT-e encontrado" description="Tente ajustar os filtros ou emita um novo CT-e." />
                </TableCell>
              </TableRow>
            ) : (
              (ctes ?? []).map((cte) => (
                <TableRow key={cte.id}>
                  <TableCell>{cte.numero ?? "—"}</TableCell>
                  <TableCell>{cte.serie ?? "—"}</TableCell>
                  <TableCell>
                    {cte.data_emissao
                      ? new Date(cte.data_emissao).toLocaleDateString("pt-BR")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {cte.valor_total?.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }) ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cte.status === "autorizada" ? "default" : "secondary"}>
                      {cte.status ?? "—"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
